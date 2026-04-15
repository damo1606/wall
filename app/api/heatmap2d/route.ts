import { NextRequest, NextResponse } from "next/server";
import { gammaBS, deltaBS } from "@/lib/blackscholes";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

const RISK_FREE_RATE = 0.043;
const CONTRACT_SIZE = 100;
const MAX_DISTANCE = 0.10;

export interface Heatmap2DCell {
  strike: number;
  expiration: string;
  gex: number;
  oi: number;
  callOI: number;
  putOI: number;
  skew: number;       // IV_put(K) − IV_call(K) at same strike
}

export interface Heatmap2DData {
  ticker: string;
  spot: number;
  strikes: number[];
  expirations: string[];
  allExpirations: string[];
  cells: Heatmap2DCell[];
  skew25d: Record<string, number>;  // 25Δ skew per expiration date
  support: number;
  resistance: number;
}

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

function computeCells(
  expiration: string,
  optData: any,
  spot: number,
  lower: number,
  upper: number
): { cells: Heatmap2DCell[]; skew25d: number } {
  const today = new Date();
  const expDate = new Date(expiration + "T00:00:00");
  const T = Math.max((expDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);

  const calls: any[] = optData?.calls ?? [];
  const puts: any[]  = optData?.puts  ?? [];

  const strikeSet = new Set<number>([
    ...calls.map((c: any) => c.strike),
    ...puts.map((p: any)  => p.strike),
  ]);

  const cells: Heatmap2DCell[] = [];

  // For 25Δ skew: track closest call to Δ=+0.25 and put to Δ=−0.25
  let best25Call: { iv: number; dist: number } | null = null;
  let best25Put:  { iv: number; dist: number } | null = null;

  for (const strike of Array.from(strikeSet)) {
    const call = calls.find((c: any) => c.strike === strike);
    const put  = puts.find((p: any)  => p.strike === strike);

    const callOI = call?.openInterest ?? 0;
    const putOI  = put?.openInterest  ?? 0;
    const callIV = call?.impliedVolatility ?? 0;
    const putIV  = put?.impliedVolatility  ?? 0;

    // 25Δ tracking (all strikes, not only ±10%)
    if (callIV > 0) {
      const dCall = deltaBS(spot, strike, T, RISK_FREE_RATE, callIV, true);
      const dist  = Math.abs(dCall - 0.25);
      if (!best25Call || dist < best25Call.dist) best25Call = { iv: callIV, dist };
    }
    if (putIV > 0) {
      const dPut = deltaBS(spot, strike, T, RISK_FREE_RATE, putIV, false);
      const dist = Math.abs(dPut - (-0.25));
      if (!best25Put || dist < best25Put.dist) best25Put = { iv: putIV, dist };
    }

    // Only include in grid if within ±10% and enough OI
    if (strike < lower || strike > upper) continue;
    const totalOI = callOI + putOI;
    if (totalOI < 5) continue;

    const gCall = gammaBS(spot, strike, T, RISK_FREE_RATE, callIV);
    const gPut  = gammaBS(spot, strike, T, RISK_FREE_RATE, putIV);
    const gex   = callOI * gCall * spot * spot * CONTRACT_SIZE
                - putOI * gPut  * spot * spot * CONTRACT_SIZE;

    // Per-strike skew: IV_put − IV_call at same strike
    const skew = putIV > 0 && callIV > 0 ? putIV - callIV : 0;

    cells.push({ strike, expiration, gex, oi: totalOI, callOI, putOI, skew });
  }

  const skew25d = (best25Put && best25Call)
    ? best25Put.iv - best25Call.iv
    : 0;

  return { cells, skew25d };
}

export async function GET(request: NextRequest) {
  const ticker     = request.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const upTo       = request.nextUrl.searchParams.get("upTo") ?? "";   // optional end date
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

    const allExpirations = allExpDates.map((e) => e.date);

    // Filter up to selected date, default to first 8
    let selectedExps = upTo
      ? allExpDates.filter((e) => e.date <= upTo)
      : allExpDates.slice(0, 8);

    // Always include at least 1
    if (selectedExps.length === 0) selectedExps = allExpDates.slice(0, 1);

    const lower = spot * (1 - MAX_DISTANCE);
    const upper = spot * (1 + MAX_DISTANCE);

    // Fetch all expirations in parallel (skip first since we already have it)
    const firstOptData = initial.options?.[0];
    const firstExp = allExpDates[0]?.date ?? "";

    const results = await Promise.all(
      selectedExps.map(async ({ ts, date }) => {
        if (date === firstExp && firstOptData) {
          return { date, optData: firstOptData };
        }
        try {
          const data = await fetchOptions(ticker, cookie, crumb, ts);
          return { date, optData: data.options?.[0] };
        } catch {
          return { date, optData: null };
        }
      })
    );

    // Build all cells
    const allCells: Heatmap2DCell[] = [];
    const skew25dMap: Record<string, number> = {};
    for (const { date, optData } of results) {
      if (!optData) continue;
      const { cells, skew25d } = computeCells(date, optData, spot, lower, upper);
      allCells.push(...cells);
      skew25dMap[date] = skew25d;
    }

    // Derive strike list and expiration list from actual data
    const strikeSet = new Set(allCells.map((c) => c.strike));
    const strikes = Array.from(strikeSet).sort((a, b) => b - a); // high → low
    const expirations = selectedExps.map((e) => e.date);

    // Find support and resistance from aggregated GEX
    const strikeGex = new Map<number, number>();
    for (const cell of allCells) {
      strikeGex.set(cell.strike, (strikeGex.get(cell.strike) ?? 0) + cell.gex);
    }

    const belowSpot = Array.from(strikeGex.entries()).filter(([s]) => s < spot);
    const aboveSpot = Array.from(strikeGex.entries()).filter(([s]) => s > spot);

    const supportEntry = belowSpot
      .filter(([, g]) => g > 0)
      .sort((a, b) => b[1] - a[1])[0] ?? belowSpot.sort((a, b) => b[0] - a[0])[0];
    const resistanceEntry = aboveSpot
      .filter(([, g]) => g < 0)
      .sort((a, b) => a[1] - b[1])[0] ?? aboveSpot.sort((a, b) => a[0] - b[0])[0];

    const support = supportEntry?.[0] ?? spot * 0.97;
    const resistance = resistanceEntry?.[0] ?? spot * 1.03;

    const data: Heatmap2DData = {
      ticker,
      spot,
      strikes,
      expirations,
      allExpirations,
      cells: allCells,
      skew25d: skew25dMap,
      support,
      resistance,
    };

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
