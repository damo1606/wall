import { NextRequest, NextResponse } from "next/server";
import { computeAnalysis }  from "@/lib/gex";
import { computeAnalysis2 } from "@/lib/gex2";
import { computeAnalysis3 } from "@/lib/gex3";
import { computeAnalysis5, compute25dSkew, type ExpData5 } from "@/lib/gex5";
import { computeSpyMetrics, computeRegime }                from "@/lib/gex6";
import { computeAnalysis7 }                                from "@/lib/gex7";
import { supabaseServer }                                  from "@/lib/supabase";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

async function fetchOptions(ticker: string, cookie: string, crumb: string, dateTs?: number) {
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

async function fetchHistory(symbol: string, cookie: string, crumb: string, range = "5d") {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=${range}&crumb=${crumb}`;
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch ${symbol} (${res.status})`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
  const valid = closes.filter((v): v is number => v != null);
  return { current: valid[valid.length - 1] ?? 0, history: valid };
}

async function fetchTickerOptions(symbol: string, cookie: string, crumb: string) {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${crumb}`;
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch ${symbol} options (${res.status})`);
  const json = await res.json();
  const result = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${symbol}`);
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
    // Lanzar query histórica en paralelo con Yahoo Finance — no bloquea
    const snapshotsPromise = Promise.resolve(
      supabaseServer()
        .from("sr_snapshots")
        .select("m1_support,m1_resistance,m2_support,m2_resistance,m3_support,m3_resistance,m5_support_strike,m5_resistance_strike")
        .eq("ticker", ticker)
        .order("created_at", { ascending: false })
        .limit(7)
    ).then((r) => r.data ?? []).catch(() => [] as Record<string, number | null>[]);

    const { crumb, cookie } = await getCredentials();

    // Fetch ticker options + M6 data in parallel
    const [initial, vixData, vix3mData, spyResult, hygData, spyHistory] = await Promise.all([
      fetchOptions(ticker, cookie, crumb),
      fetchHistory("^VIX",   cookie, crumb, "5d"),
      fetchHistory("^VIX3M", cookie, crumb, "5d").catch(() => ({ current: 0, history: [] as number[] })),
      fetchTickerOptions("SPY", cookie, crumb),
      fetchHistory("HYG",    cookie, crumb, "5d").catch(() => ({ current: 0, history: [] as number[] })),
      fetchHistory("SPY",    cookie, crumb, "3mo").catch(() => ({ current: 0, history: [] as number[] })),
    ]);

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

    // Multi-expiration (mismo patrón que M5)
    const selectedExps = upTo
      ? allExpDates.filter((e) => e.date <= upTo)
      : allExpDates.slice(0, 8);
    const safeSelected = selectedExps.length > 0 ? selectedExps : allExpDates.slice(0, 1);

    const multiResults = await Promise.all(
      safeSelected.map(async ({ ts, date }) => {
        if (date === primaryExpDate.date && firstOptData) return { date, optData: firstOptData };
        try {
          const data = await fetchOptions(ticker, cookie, crumb, ts);
          return { date, optData: data.options?.[0] ?? null };
        } catch {
          return { date, optData: null };
        }
      })
    );

    const expDataList: ExpData5[] = multiResults
      .filter((r) => r.optData != null)
      .map((r) => ({ expiration: r.date, ...parseChain(r.optData) }));

    if (expDataList.length === 0) return NextResponse.json({ error: "No valid expiration data" }, { status: 400 });

    // ── ATM IV ────────────────────────────────────────────────────────────────
    const { calls: primaryCalls, puts: primaryPuts } = parseChain(firstOptData);
    const nearCall = [...primaryCalls].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0]
    const nearPut  = [...primaryPuts ].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0]
    const cIv = (nearCall?.impliedVolatility ?? 0) * 100
    const pIv = (nearPut?.impliedVolatility  ?? 0) * 100
    const atmIv = parseFloat(((cIv > 0 && pIv > 0) ? (cIv + pIv) / 2 : cIv || pIv).toFixed(1))

    // ── M1 ────────────────────────────────────────────────────────────────────
    const m1 = computeAnalysis(ticker, spot, primaryExpDate.date, availableExpirations, primaryCalls, primaryPuts);

    // ── Skew 25Δ ──────────────────────────────────────────────────────────────
    const today = new Date();
    let skewSum = 0, skewCount = 0;
    for (const r of multiResults.slice(0, 4)) {
      if (!r.optData) continue;
      const T = Math.max((new Date(r.date + "T00:00:00").getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);
      const { calls, puts } = parseChain(r.optData);
      skewSum += compute25dSkew(calls, puts, spot, T);
      skewCount++;
    }
    const avgSkew25d = skewCount > 0 ? skewSum / skewCount : 0;

    // ── M2 ────────────────────────────────────────────────────────────────────
    let m2Support = spot * 0.97, m2Resistance = spot * 1.03;
    const m2 = (() => {
      try {
        return computeAnalysis2(ticker, spot, primaryExpDate.date, availableExpirations, primaryCalls, primaryPuts);
      } catch { return null; }
    })();
    if (m2) { m2Support = m2.support; m2Resistance = m2.resistance; }
    const m2Result = m2 ?? { ticker, spot, expiration: primaryExpDate.date, availableExpirations, support: m2Support, resistance: m2Resistance, filteredStrikes: [] };

    // ── M3 ────────────────────────────────────────────────────────────────────
    let m3Support = spot * 0.97, m3Resistance = spot * 1.03;
    const m3 = (() => {
      try { return computeAnalysis3(ticker, spot, expDataList); } catch { return null; }
    })();
    if (m3) { m3Support = m3.support; m3Resistance = m3.resistance; }
    const m3Result = m3 ?? { ticker, spot, expiration: primaryExpDate.date, availableExpirations, expirationsUsed: [], support: m3Support, resistance: m3Resistance, supportConfidence: 50, resistanceConfidence: 50, filteredStrikes: [] };

    // ── M5 ────────────────────────────────────────────────────────────────────
    const m5 = computeAnalysis5(ticker, spot, expDataList, m1.levels.gammaFlip, m1.institutionalPressure, m1.putCallRatio, avgSkew25d, m2Support, m2Resistance, m3Support, m3Resistance);

    // ── M6 ────────────────────────────────────────────────────────────────────
    const vix    = vixData.current;
    const vix3m  = (vix3mData as any).current > 0 ? (vix3mData as any).current : vix * 1.05;
    const vixHistory = vixData.history;

    const hygHistory = (hygData as any).history as number[];
    const hygCurrent = (hygData as any).current as number;
    const hygChange5d = hygHistory[0] > 0 ? ((hygCurrent - hygHistory[0]) / hygHistory[0]) * 100 : 0;

    const spyHistArr = (spyHistory as any).history as number[];
    const spyCurrent = (spyHistory as any).current as number;
    const last50 = spyHistArr.slice(-50);
    const sma50  = last50.length > 0 ? last50.reduce((a: number, b: number) => a + b, 0) / last50.length : spyCurrent;
    const spyVsSma50 = sma50 > 0 ? ((spyCurrent - sma50) / sma50) * 100 : 0;

    const spySpot: number = spyResult.quote?.regularMarketPrice ?? 0;
    const spyOptData = spyResult.options?.[0];
    const spyExpTs: number = spyResult.expirationDates?.[0] ?? 0;
    const spyT = Math.max((new Date(spyExpTs * 1000).getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);
    const spyCalls = spyOptData ? (spyOptData.calls ?? []).map((c: any) => ({ strike: c.strike ?? 0, impliedVolatility: c.impliedVolatility ?? 0, openInterest: c.openInterest ?? 0 })) : [];
    const spyPuts  = spyOptData ? (spyOptData.puts  ?? []).map((p: any) => ({ strike: p.strike ?? 0, impliedVolatility: p.impliedVolatility ?? 0, openInterest: p.openInterest ?? 0 })) : [];
    const { gexTotal: spyGexTotal, pcr: spyPcr } = computeSpyMetrics(spyCalls, spyPuts, spySpot, spyT);
    const m6 = computeRegime(vix, vix3m, vixHistory, spyGexTotal, spyPcr, spySpot, hygChange5d, spyVsSma50);

    // ── M7 ────────────────────────────────────────────────────────────────────
    const result = computeAnalysis7(ticker, spot, m1, m2Result, m3Result, m5, m6);

    // ── Confirmación histórica ────────────────────────────────────────────────
    const snapshots = await snapshotsPromise;
    const PROX_PCT = 0.005; // ±0.5%
    const enrichedSrTable = result.srTable.map((cluster) => {
      const historicalDays = snapshots.filter((snap) => {
        const levels = [
          snap.m1_support, snap.m1_resistance,
          snap.m2_support, snap.m2_resistance,
          snap.m3_support, snap.m3_resistance,
          snap.m5_support_strike, snap.m5_resistance_strike,
        ].filter((v): v is number => v != null);
        return levels.some((lvl) => Math.abs(lvl - cluster.strike) / cluster.strike <= PROX_PCT);
      }).length;
      return { ...cluster, historicalDays };
    });

    // ── Guardar snapshot (fire-and-forget) ────────────────────────────────────
    void supabaseServer()
      .from("sr_snapshots")
      .insert({
        ticker,
        spot,
        primary_exp_date:          primaryExpDate.date,
        m1_support:                m1.levels.support,
        m1_resistance:             m1.levels.resistance,
        m1_call_wall:              m1.levels.callWall,
        m1_put_wall:               m1.levels.putWall,
        m1_gamma_flip:             m1.levels.gammaFlip,
        m1_net_gex:                m1.netGex,
        m1_put_call_ratio:         m1.putCallRatio,
        m2_support:                m2Result.support,
        m2_resistance:             m2Result.resistance,
        m3_support:                m3Result.support,
        m3_resistance:             m3Result.resistance,
        m3_support_confidence:     m3?.supportConfidence    ?? null,
        m3_resistance_confidence:  m3?.resistanceConfidence ?? null,
        m5_support_strike:         m5.support?.strike       ?? null,
        m5_resistance_strike:      m5.resistance?.strike    ?? null,
        m5_support_confidence:     m5.support?.confidence   ?? null,
        m5_resistance_confidence:  m5.resistance?.confidence ?? null,
        m5_score:                  m5.score,
        m5_verdict:                m5.verdict,
        m7_final_score:            result.finalScore,
        m7_final_verdict:          result.finalVerdict,
        m7_confidence:             result.confidence,
        m7_regime:                 result.m6Regime,
        m7_regime_multiplier:      result.regimeMultiplier,
        m7_sr_table:               result.srTable,
        m7_timing_matrix:          result.timingMatrix,
        atm_iv:                    atmIv > 0 ? atmIv : null,
      })
;

    return NextResponse.json({
      ...result,
      srTable: enrichedSrTable,
      availableExpirations,
      gammaLevels: {
        callWall:     m1.levels.callWall,
        putWall:      m1.levels.putWall,
        gammaFlip:    m1.levels.gammaFlip,
        maxPain:      m5.maxPain,
        netGex:       m1.netGex,
        putCallRatio: m1.putCallRatio,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
