import { NextRequest, NextResponse } from "next/server";
import { computeSpyMetrics, computeRegime, computeLeadIndicator } from "@/lib/gex6";

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

/** Fetch daily close history for a symbol (VIX, VIX3M, etc.) */
async function fetchHistory(
  symbol: string,
  cookie: string,
  crumb: string,
  range = "5d"
): Promise<{ current: number; history: number[] }> {
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

/** Fetch options chain for any ticker (primary expiration) */
async function fetchTickerOptions(symbol: string, cookie: string, crumb: string) {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${crumb}`;
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch ${symbol} options (${res.status})`);
  const json = await res.json();
  const result = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${symbol}`);
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "";
    const leadSymbols = Array.from(new Set(["TSLA", "AMD", ticker].filter((s) => s && s !== "SPY")));

    const { crumb, cookie } = await getCredentials();

    // Fetch VIX, VIX3M, SPY options, HYG, SPY history, and lead ticker data in parallel
    const [vixData, vix3mData, spyResult, hygData, spyHistory, ...leadRaw] = await Promise.all([
      fetchHistory("^VIX",  cookie, crumb, "5d"),
      fetchHistory("^VIX3M", cookie, crumb, "5d").catch(() => ({ current: 0, history: [] as number[] })),
      fetchTickerOptions("SPY", cookie, crumb),
      fetchHistory("HYG", cookie, crumb, "5d").catch(() => ({ current: 0, history: [] as number[] })),
      fetchHistory("SPY", cookie, crumb, "3mo").catch(() => ({ current: 0, history: [] as number[] })),
      ...leadSymbols.map((sym) =>
        Promise.all([
          fetchHistory(sym, cookie, crumb, "5d").catch(() => ({ current: 0, history: [] as number[] })),
          fetchTickerOptions(sym, cookie, crumb).catch(() => null),
        ])
      ),
    ]);

    const vix        = vixData.current;
    const vix3m      = vix3mData.current > 0 ? vix3mData.current : vix * 1.05;
    const vixHistory = vixData.history;

    // HYG 5d change
    const hygHistory = (hygData as any).history as number[];
    const hygOldest  = hygHistory[0] ?? 0;
    const hygCurrent = (hygData as any).current as number;
    const hygChange5d = hygOldest > 0 ? ((hygCurrent - hygOldest) / hygOldest) * 100 : 0;

    // SPY vs SMA50
    const spyHistArr = (spyHistory as any).history as number[];
    const spyCurrent = (spyHistory as any).current as number;
    const last50 = spyHistArr.slice(-50);
    const sma50  = last50.length > 0 ? last50.reduce((a: number, b: number) => a + b, 0) / last50.length : spyCurrent;
    const spyVsSma50 = sma50 > 0 ? ((spyCurrent - sma50) / sma50) * 100 : 0;

    const spySpot: number = spyResult.quote?.regularMarketPrice ?? 0;
    const optData = spyResult.options?.[0];
    if (!optData) throw new Error("No SPY options chain");

    const today  = new Date();
    const expTs: number = spyResult.expirationDates?.[0] ?? 0;
    const expDate = new Date(expTs * 1000);
    const T = Math.max((expDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);

    const calls = (optData.calls ?? []).map((c: any) => ({
      strike: c.strike ?? 0, impliedVolatility: c.impliedVolatility ?? 0, openInterest: c.openInterest ?? 0,
    }));
    const puts = (optData.puts ?? []).map((p: any) => ({
      strike: p.strike ?? 0, impliedVolatility: p.impliedVolatility ?? 0, openInterest: p.openInterest ?? 0,
    }));

    const { gexTotal: spyGexTotal, pcr: spyPcr } = computeSpyMetrics(calls, puts, spySpot, T);
    const result = computeRegime(vix, vix3m, vixHistory, spyGexTotal, spyPcr, spySpot, hygChange5d, spyVsSma50);

    // Compute lead indicators
    result.leadIndicators = leadRaw.map(([histData, optResult], i) => {
      const sym   = leadSymbols[i];
      const spot  = (histData as any).current ?? 0;
      const hist  = (histData as any).history ?? [];

      if (!optResult || spot === 0) {
        return { symbol: sym, spot: 0, change1d: 0, change5d: 0, gexSign: "NEGATIVO" as const, pcr: 1, signal: "NEUTRO" as const, leadNote: "Sin datos disponibles" };
      }

      const expTs2: number = optResult.expirationDates?.[0] ?? 0;
      const T2 = Math.max((new Date(expTs2 * 1000).getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);
      const optData2 = optResult.options?.[0];
      if (!optData2) return { symbol: sym, spot, change1d: 0, change5d: 0, gexSign: "NEGATIVO" as const, pcr: 1, signal: "NEUTRO" as const, leadNote: "Sin cadena de opciones" };

      const c2 = (optData2.calls ?? []).map((c: any) => ({ strike: c.strike ?? 0, impliedVolatility: c.impliedVolatility ?? 0, openInterest: c.openInterest ?? 0 }));
      const p2 = (optData2.puts  ?? []).map((p: any) => ({ strike: p.strike ?? 0, impliedVolatility: p.impliedVolatility ?? 0, openInterest: p.openInterest ?? 0 }));
      const { gexTotal, pcr } = computeSpyMetrics(c2, p2, spot, T2);

      return computeLeadIndicator(sym, spot, hist, gexTotal, pcr);
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
