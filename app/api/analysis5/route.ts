import { NextRequest, NextResponse } from "next/server";
import { computeAnalysis } from "@/lib/gex";
import { computeAnalysis2 } from "@/lib/gex2";
import { computeAnalysis3 } from "@/lib/gex3";
import { computeAnalysis5, compute25dSkew, type ExpData5 } from "@/lib/gex5";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

async function getCredentials(): Promise<{ crumb: string; cookie: string }> {
  const res1 = await fetch("https://fc.yahoo.com", { headers: HEADERS, redirect: "follow" });
  const setCookie = res1.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(",").map((c) => c.split(";")[0].trim()).join("; ");
  const res2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...HEADERS, Cookie: cookie },
  });
  if (!res2.ok) throw new Error(`Could not get crumb (${res2.status})`);
  const crumb = await res2.text();
  if (!crumb || crumb.includes("<")) throw new Error("Invalid crumb");
  return { crumb, cookie };
}

async function fetchOptions(
  ticker: string,
  cookie: string,
  crumb: string,
  dateTs?: number
) {
  const params = new URLSearchParams({ crumb });
  if (dateTs) params.set("date", String(dateTs));
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?${params}`;
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);
  const json = await res.json();
  const result = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${ticker}`);
  return result;
}

function parseChain(optData: any): { calls: ExpData5["calls"]; puts: ExpData5["puts"] } {
  const calls = (optData?.calls ?? []).map((c: any) => ({
    strike: c.strike ?? 0,
    impliedVolatility: c.impliedVolatility ?? 0,
    openInterest: c.openInterest ?? 0,
  }));
  const puts = (optData?.puts ?? []).map((p: any) => ({
    strike: p.strike ?? 0,
    impliedVolatility: p.impliedVolatility ?? 0,
    openInterest: p.openInterest ?? 0,
  }));
  return { calls, puts };
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const upTo   = request.nextUrl.searchParams.get("upTo") ?? "";
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  try {
    const { crumb, cookie } = await getCredentials();
    const initial = await fetchOptions(ticker, cookie, crumb);

    const spot: number = initial.quote?.regularMarketPrice;
    if (!spot) return NextResponse.json({ error: `No price data for ${ticker}` }, { status: 400 });

    const allExpTs: number[] = initial.expirationDates ?? [];
    const allExpDates = allExpTs.map((ts) => ({
      ts,
      date: new Date(ts * 1000).toISOString().split("T")[0],
    }));

    const availableExpirations = allExpDates.map((e) => e.date);
    const primaryExpDate = allExpDates[0];
    const firstOptData = initial.options?.[0];

    if (!firstOptData) return NextResponse.json({ error: "No options chain" }, { status: 400 });

    // Filter expirations up to chosen date; default to first 8
    const selectedExps = upTo
      ? allExpDates.filter((e) => e.date <= upTo)
      : allExpDates.slice(0, 8);

    const safeSelected = selectedExps.length > 0 ? selectedExps : allExpDates.slice(0, 1);

    const results = await Promise.all(
      safeSelected.map(async ({ ts, date }) => {
        if (date === primaryExpDate.date && firstOptData) {
          return { date, optData: firstOptData };
        }
        try {
          const data = await fetchOptions(ticker, cookie, crumb, ts);
          return { date, optData: data.options?.[0] ?? null };
        } catch {
          return { date, optData: null };
        }
      })
    );

    // Build ExpData5 list (skip failed fetches)
    const expDataList: ExpData5[] = results
      .filter((r) => r.optData != null)
      .map((r) => ({ expiration: r.date, ...parseChain(r.optData) }));

    if (expDataList.length === 0) {
      return NextResponse.json({ error: "No valid expiration data" }, { status: 400 });
    }

    // ── M1 signals (gammaFlip, institutionalPressure, putCallRatio) ──────────
    const { calls: primaryCalls, puts: primaryPuts } = parseChain(firstOptData);
    const m1 = computeAnalysis(
      ticker,
      spot,
      primaryExpDate.date,
      availableExpirations,
      primaryCalls,
      primaryPuts
    );

    // ── Avg 25Δ skew from first 4 near-term expirations ──────────────────────
    const today = new Date();
    let skewSum = 0;
    let skewCount = 0;

    for (const r of results.slice(0, 4)) {
      if (!r.optData) continue;
      const expDate = new Date(r.date + "T00:00:00");
      const T = Math.max(
        (expDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
        0.001
      );
      const { calls, puts } = parseChain(r.optData);
      skewSum += compute25dSkew(calls, puts, spot, T);
      skewCount++;
    }
    const avgSkew25d = skewCount > 0 ? skewSum / skewCount : 0;

    // ── M2 levels (Z-score GEX + PCR, single expiration) ─────────────────────
    let m2Support = spot * 0.97;
    let m2Resistance = spot * 1.03;
    try {
      const m2 = computeAnalysis2(
        ticker, spot, primaryExpDate.date, availableExpirations,
        primaryCalls, primaryPuts
      );
      m2Support = m2.support;
      m2Resistance = m2.resistance;
    } catch {}

    // ── M3 levels (confluence Z(GEX)+Z(OI)+Z(PCR), multi-expiration) ─────────
    let m3Support = spot * 0.97;
    let m3Resistance = spot * 1.03;
    try {
      const m3 = computeAnalysis3(ticker, spot, expDataList);
      m3Support = m3.support;
      m3Resistance = m3.resistance;
    } catch {}

    // ── Compute M5 ────────────────────────────────────────────────────────────
    const result = computeAnalysis5(
      ticker,
      spot,
      expDataList,
      m1.levels.gammaFlip,
      m1.institutionalPressure,
      m1.putCallRatio,
      avgSkew25d,
      m2Support,
      m2Resistance,
      m3Support,
      m3Resistance,
    );

    return NextResponse.json({ ...result, availableExpirations, allExpirations: availableExpirations });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
