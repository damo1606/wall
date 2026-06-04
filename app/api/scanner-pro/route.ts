import { NextRequest, NextResponse } from "next/server";
import { getCrumb, fetchStockData } from "@/lib/yahoo";
import { supabaseServer } from "@/lib/supabase";
import type { StockData } from "@/lib/yahoo";
import type { ScoreBreakdown } from "@/lib/scoring";

// Sin esto Next.js trata el GET como static/cacheable y, cuando el cron snapshot
// lo llama internamente, recibe una versión cacheada antigua (~5 filas) en vez
// de la respuesta fresca (~99 filas).
export const dynamic = "force-dynamic";
// Phase B: el screener fundamental lee de valuation_scores (methodology="buyScore").
// Si esa tabla viene vacía (cron pendiente, deploy reciente, transiente) cae a
// Phase A: pool(3, 3s) directo a Yahoo. Por eso maxDuration=300 — el fallback
// puede tomar ~100s y necesitamos margen.
export const maxDuration = 300;
import { DJIA_SYMBOLS, SP500_SYMBOLS, NASDAQ100_SYMBOLS, RUSSELL_SYMBOLS } from "@/lib/symbols";
import { computeAnalysis } from "@/lib/gex";
import { computeAnalysis2 } from "@/lib/gex2";
import { computeAnalysis3 } from "@/lib/gex3";
import { computeAnalysis5, compute25dSkew, type ExpData5 } from "@/lib/gex5";
import { computeSpyMetrics, computeRegime } from "@/lib/gex6";
import { computeAnalysis7 } from "@/lib/gex7";
import type { ExpData } from "@/lib/gex3";
import type { Analysis6Result } from "@/lib/gex6";

// ── Yahoo Finance helpers ─────────────────────────────────────────────────────

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

let _m6Cache: { data: Analysis6Result; ts: number } | null = null
let _m6Promise: Promise<Analysis6Result> | null = null
const M6_TTL = 5 * 60 * 1000

// Señal de que un ticker genuinamente NO tiene opciones listadas (200 OK, con
// precio, pero sin expiraciones). Un error HTTP/red es transitorio y NO usa esto.
class NoOptionsError extends Error {
  constructor(symbol: string) { super(`No options for ${symbol}`); this.name = "NoOptionsError" }
}

async function fetchOptions(ticker: string, cookie: string, crumb: string, dateTs?: number) {
  const params = new URLSearchParams({ crumb });
  if (dateTs) params.set("date", String(dateTs));
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?${params}`;
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
  const json = await res.json();
  const result = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${ticker}`);
  return result;
}

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

function extractRaw(opts: any) {
  return {
    calls: (opts?.calls ?? []).map((c: any) => ({
      strike: c.strike ?? 0,
      impliedVolatility: c.impliedVolatility ?? 0,
      openInterest: c.openInterest ?? 0,
    })),
    puts: (opts?.puts ?? []).map((p: any) => ({
      strike: p.strike ?? 0,
      impliedVolatility: p.impliedVolatility ?? 0,
      openInterest: p.openInterest ?? 0,
    })),
  };
}

// ── Market Regime (M6) — fetched once, shared across all tickers ──────────────

async function fetchMarketRegime(cookie: string, crumb: string): Promise<Analysis6Result> {
  const [vixData, vix3mData, spyResult, hygData, spyHistory] = await Promise.all([
    fetchHistory("^VIX", cookie, crumb, "5d"),
    fetchHistory("^VIX3M", cookie, crumb, "5d").catch(() => ({ current: 0, history: [] as number[] })),
    fetchOptions("SPY", cookie, crumb),
    fetchHistory("HYG", cookie, crumb, "5d").catch(() => ({ current: 0, history: [] as number[] })),
    fetchHistory("SPY", cookie, crumb, "3mo").catch(() => ({ current: 0, history: [] as number[] })),
  ]);

  const vix        = vixData.current;
  const vix3m      = vix3mData.current > 0 ? vix3mData.current : vix * 1.05;
  const vixHistory = vixData.history;

  const hygHistory  = hygData.history;
  const hygOldest   = hygHistory[0] ?? 0;
  const hygChange5d = hygOldest > 0 ? ((hygData.current - hygOldest) / hygOldest) * 100 : 0;

  const spyHistArr  = spyHistory.history;
  const spyCurrent  = spyHistory.current;
  const last50      = spyHistArr.slice(-50);
  const sma50       = last50.length > 0 ? last50.reduce((a, b) => a + b, 0) / last50.length : spyCurrent;
  const spyVsSma50  = sma50 > 0 ? ((spyCurrent - sma50) / sma50) * 100 : 0;

  const spySpot: number = spyResult.quote?.regularMarketPrice ?? 0;
  const spyOptData = spyResult.options?.[0];
  if (!spyOptData) throw new Error("No SPY options chain");

  const today  = new Date();
  const expTs: number = spyResult.expirationDates?.[0] ?? 0;
  const T = Math.max((new Date(expTs * 1000).getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);

  const spyCalls = (spyOptData.calls ?? []).map((c: any) => ({
    strike: c.strike ?? 0, impliedVolatility: c.impliedVolatility ?? 0, openInterest: c.openInterest ?? 0,
  }));
  const spyPuts = (spyOptData.puts ?? []).map((p: any) => ({
    strike: p.strike ?? 0, impliedVolatility: p.impliedVolatility ?? 0, openInterest: p.openInterest ?? 0,
  }));

  const { gexTotal: spyGexTotal, pcr: spyPcr } = computeSpyMetrics(spyCalls, spyPuts, spySpot, T);
  return computeRegime(vix, vix3m, vixHistory, spyGexTotal, spyPcr, spySpot, hygChange5d, spyVsSma50);
}

async function getCachedM6(cookie: string, crumb: string): Promise<Analysis6Result> {
  if (_m6Cache && Date.now() - _m6Cache.ts < M6_TTL) return _m6Cache.data
  if (!_m6Promise) _m6Promise = fetchMarketRegime(cookie, crumb)
  try {
    const data = await _m6Promise
    _m6Cache = { data, ts: Date.now() }
    return data
  } finally {
    // Reset también en rechazo: si no, el promise rechazado queda cacheado y
    // toda request posterior en la instancia warm re-lanza sin reintentar Yahoo.
    _m6Promise = null
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConvictionRow {
  symbol: string;
  company: string;
  sector: string;
  // Descuentos
  buyScore: number;
  grade: string;
  currentPrice: number;
  dropFrom52w: number;
  grahamNumber: number;
  discountToGraham: number;
  upsideToTarget: number;
  pe: number;
  roe: number;
  // M1 — GEX / Vanna / Dealer Flow
  m1Pressure: number;
  m1Support: number;
  m1Resistance: number;
  m1GammaFlip: number;
  m1NetGex: number;
  m1Pcr: number;
  // M2 — Z-Score GEX + PCR
  m2Pressure: number;
  m2Support: number;
  m2Resistance: number;
  // M3 — Confluencia multi-expiración
  m3Confluence: number;
  m3SupportConf: number;
  m3ResistanceConf: number;
  m3Support: number;
  m3Resistance: number;
  // M5 — Señal consolidada
  m5Score: number;          // -100 a +100
  m5Verdict: string;        // ALCISTA | BAJISTA | NEUTRAL
  m5Support: number;
  m5Resistance: number;
  m5MaxPain: number;
  m5Probability: number;
  // M6 — Régimen de mercado (global, misma para todos los tickers)
  m6Regime: string;
  m6FearScore: number;
  m6FearLabel: string;
  m6Vix: number;
  m6VixVelocity: string;
  m6SignalSuspended: boolean;
  m6Multiplier: number;
  // M7 — Veredicto final
  m7Score: number;          // -100 a +100
  m7Verdict: string;        // ALCISTA | BAJISTA | NEUTRAL
  m7Confidence: number;
  m7PrimaryLongEntry: number;
  m7PrimaryShortEntry: number;
  // Combined
  convictionScore: number;
  verdict: "STRONG BUY" | "BUY" | "WATCH" | "NEUTRAL";
  // SORE — Systematic Options Revenue Engine (volatility harvesting, NOT directional)
  soreCSS: number;          // 0–100 Composite Suppression Signal
  soreDSS: number;          // 0–100 Dealer Stabilization Score
  soreVSS: number;          // 0–100 Volatility Suppression Score
  soreVRP: number;          // Vol Risk Premium proxy (0–100)
  soreStrategy: string;     // SHORT STRANGLE | IRON CONDOR | BWB | CREDIT SPREAD | CALENDAR | AVOID
  soreGate: "GO" | "WAIT" | "AVOID";
  noOptions?: boolean;   // true solo si el ticker realmente no tiene opciones
  scanError?: boolean;   // true si el scan falló por causa transitoria (Yahoo/red)
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function calcConviction(buyScore: number, m7Score: number, hasOptions: boolean): number {
  if (!hasOptions) return Math.min(100, buyScore * 0.40);
  // M7 ya agrega M1-M6 ponderados. Normalize -100..+100 → 0..100
  const m7Norm = (Math.max(-100, Math.min(100, m7Score)) + 100) / 2;
  return Math.min(100, buyScore * 0.40 + m7Norm * 0.60);
}

function toVerdict(score: number): ConvictionRow["verdict"] {
  if (score >= 75) return "STRONG BUY";
  if (score >= 60) return "BUY";
  if (score >= 45) return "WATCH";
  return "NEUTRAL";
}

function computeSORE(
  m1NetGex: number,
  m1Pressure: number,
  m1Pcr: number,
  m6Vix: number,
  m6FearScore: number,
  m6Regime: string,
  m6Suspended: boolean,
  m5Score: number,
): { css: number; dss: number; vss: number; vrp: number; strategy: string; gate: "GO" | "WAIT" | "AVOID" } {
  // DSS: Dealer Stabilization Score
  // GEX > 0 = dealers long gamma = buy dips / sell rips = stabilizing
  const gexScore = m1NetGex > 0
    ? Math.min(100, 50 + (m1NetGex / 1e9) * 25)
    : Math.max(0, 50 + (m1NetGex / 1e9) * 15)
  const pressScore = Math.min(100, Math.max(0, (m1Pressure + 100) / 2))
  // PCR > 0.8: dealers sold puts = long delta = support bids under market
  const pcrScore = m1Pcr > 1.2 ? 70 : m1Pcr > 0.8 ? 55 : m1Pcr > 0.5 ? 40 : 25
  const dss = Math.round(0.40 * gexScore + 0.35 * pressScore + 0.25 * pcrScore)

  // VSS: Volatility Suppression Score
  // fearScore 30–55 = elevated IV without panic = ideal premium selling window
  const ivScore =
    m6FearScore < 20 ? 15
    : m6FearScore < 35 ? 78
    : m6FearScore < 55 ? 65
    : m6FearScore < 70 ? 45
    : 25
  const regimeScore =
    m6Regime === "COMPRESIÓN" ? 90
    : m6Regime === "TRANSICIÓN" ? 65
    : m6Regime === "EXPANSIÓN" ? 35
    : m6Regime === "PÁNICO AGUDO" ? 10
    : m6Regime === "CRISIS SISTÉMICA" ? 5
    : 50
  // M5 near-neutral = range-bound = theta decay accelerates
  const m5ConfScore = Math.abs(m5Score) < 30 ? 70 : Math.abs(m5Score) < 60 ? 50 : 28
  const vss = Math.round(0.40 * ivScore + 0.40 * regimeScore + 0.20 * m5ConfScore)

  // VRP: Vol Risk Premium proxy — VIX historically trades ~3-5pts above 20d RV
  // VIX 12 = floor (VRP ≈ 0), VIX 37 = 100
  const vrp = Math.round(Math.min(100, Math.max(0, (m6Vix - 12) * 4)))

  // CSS: Composite Suppression Signal
  const css = Math.round(0.35 * dss + 0.35 * vss + 0.30 * vrp)

  // Hard blocks
  if (m6Suspended || m6Regime === "PÁNICO AGUDO" || m6Regime === "CRISIS SISTÉMICA" || css < 45) {
    return { css, dss, vss, vrp, strategy: "AVOID", gate: "AVOID" }
  }

  let strategy: string
  let gate: "GO" | "WAIT" | "AVOID"

  if (css >= 75 && dss >= 65) {
    gate = "GO"
    if (m6Regime === "COMPRESIÓN" && m6FearScore < 60) {
      strategy = m1Pcr > 0.9 ? "SHORT STRANGLE" : "IRON CONDOR"
    } else if (m6FearScore < 40) {
      strategy = "CALENDAR"
    } else {
      strategy = "IRON CONDOR"
    }
  } else if (css >= 55) {
    gate = "WAIT"
    strategy = m6Regime === "COMPRESIÓN" ? "CREDIT SPREAD" : "BWB"
  } else {
    gate = "WAIT"
    strategy = "CREDIT SPREAD"
  }

  return { css, dss, vss, vrp, strategy, gate }
}

// ── Per-ticker analysis ───────────────────────────────────────────────────────

async function analyzeTickerFull(
  symbol: string,
  cookie: string,
  crumb: string,
  m6: Analysis6Result,
) {
  const initial = await fetchOptions(symbol, cookie, crumb);
  const spot: number = initial.quote?.regularMarketPrice;
  if (!spot) throw new Error(`No price for ${symbol}`);

  const expTimestamps: number[] = initial.expirationDates ?? [];
  // 200 OK con precio pero sin expiraciones = genuinamente sin opciones.
  if (expTimestamps.length === 0) throw new NoOptionsError(symbol);
  const expirations = expTimestamps.map(
    (ts) => new Date(ts * 1000).toISOString().split("T")[0]
  );

  const opts0 = initial.options?.[0];
  if (!opts0) throw new Error("No options chain");
  const { calls: calls0, puts: puts0 } = extractRaw(opts0);

  // T para la primera expiración (usado en compute25dSkew)
  const today = new Date();
  const T0 = Math.max(
    (new Date(expTimestamps[0] * 1000).getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
    0.001
  );

  // M1
  const m1 = computeAnalysis(symbol, spot, expirations[0], expirations, calls0, puts0);
  // M2
  const m2 = computeAnalysis2(symbol, spot, expirations[0], expirations, calls0, puts0);

  // Fetch extra expirations para M3 + M5
  const expDataList: ExpData[] = [{ expiration: expirations[0], calls: calls0, puts: puts0 }];
  const extraExps = expTimestamps.slice(1, 3);
  const extraResults = await Promise.allSettled(
    extraExps.map((ts) => fetchOptions(symbol, cookie, crumb, ts))
  );
  for (let i = 0; i < extraResults.length; i++) {
    const r = extraResults[i];
    if (r.status === "fulfilled") {
      const opts = r.value.options?.[0];
      if (opts) {
        const { calls, puts } = extractRaw(opts);
        expDataList.push({ expiration: expirations[i + 1], calls, puts });
      }
    }
  }

  // M3
  const m3 = computeAnalysis3(symbol, spot, expDataList);

  // M5
  const avgSkew25d = compute25dSkew(calls0, puts0, spot, T0);
  const m5 = computeAnalysis5(
    symbol, spot,
    expDataList as unknown as ExpData5[],
    m1.levels.gammaFlip,
    m1.institutionalPressure,
    m1.putCallRatio,
    avgSkew25d,
    m2.support,
    m2.resistance,
    m3.support,
    m3.resistance,
  );

  // M7 — veredicto final agregando M1-M6
  const m7 = computeAnalysis7(symbol, spot, m1, m2, m3, m5, m6);

  return { spot, m1, m2, m3, m5, m6, m7 };
}

// ── Pool helper para el fallback a Yahoo en vivo ──────────────────────────────
// Solo se usa cuando valuation_scores viene vacío (buyScore aún no poblado).
// Mismo patrón que en los crons: 3 workers, 3s entre llamadas.
const SCREENER_CONCURRENCY = 3
const SCREENER_RATE_LIMIT_MS = 3000
const _sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function pool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) break
      out[idx] = await fn(items[idx])
      await _sleep(SCREENER_RATE_LIMIT_MS)
    }
  }))
  return out
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const universe    = searchParams.get("universe") ?? "sp500";
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const minBuyScore = parseInt(searchParams.get("minBuyScore") ?? "50");

  // 1. Fetch fundamental screener (directo, sin HTTP interno)
  const symbols = (
    universe === "dia"     ? DJIA_SYMBOLS :
    universe === "nasdaq"  ? NASDAQ100_SYMBOLS :
    universe === "russell" ? RUSSELL_SYMBOLS :
    SP500_SYMBOLS
  ).slice(0, limit);

  // Phase B con fallback: intentamos leer valuation_scores (methodology="buyScore").
  // Si viene vacío (cron pendiente, deploy reciente, constraint roto, etc.) caemos
  // al patrón de Phase A: pool(3, 3s) directo a Yahoo. Eso hace el sistema
  // resiliente a transitorios sin perder cobertura.
  const db = supabaseServer()
  const { data: syms } = await db.from("symbols")
    .select("id, ticker")
    .in("ticker", symbols)
    .eq("is_active", true)
    .eq("asset_type", "stock")
  const symbolIds = (syms ?? []).map(s => s.id)
  let scored: { stock: StockData; score: ScoreBreakdown }[] = []
  if (symbolIds.length > 0) {
    const cutoff = new Date(Date.now() - 5 * 86_400_000).toISOString()
    const { data: scoreRows } = await db.from("valuation_scores")
      .select("symbol_id, components, taken_at")
      .eq("methodology", "buyScore")
      .gte("taken_at", cutoff)
      .in("symbol_id", symbolIds)
      .order("taken_at", { ascending: false })
    const latestBySymbol = new Map<string, { stock: StockData; score: ScoreBreakdown }>()
    for (const r of scoreRows ?? []) {
      if (latestBySymbol.has(r.symbol_id)) continue
      const c = r.components as unknown as { stock?: StockData; score?: ScoreBreakdown } | null
      if (c?.stock && c?.score) latestBySymbol.set(r.symbol_id, { stock: c.stock, score: c.score })
    }
    scored = [...latestBySymbol.values()]
      .filter(({ score }) => score.buyScore >= minBuyScore)
      .sort((a, b) => b.score.buyScore - a.score.buyScore)
      .slice(0, limit)
  }

  if (scored.length === 0) {
    // Fallback Phase A: nadie pobló valuation_scores aún. Hacemos el screener
    // contra Yahoo con rate-limit. Es lento (~100s) pero el sistema sigue
    // funcionando sin esperar al cron.
    console.log(`[scanner-pro] DB vacío para buyScore — fallback a Yahoo con pool(3, 3s)`)
    const screenerResults = await pool(symbols, SCREENER_CONCURRENCY, fetchStockData)
    const fundamentals = screenerResults.filter((r): r is NonNullable<typeof r> => r !== null)
    const { scoreStock } = await import("@/lib/scoring")
    scored = fundamentals
      .map(s => ({ stock: s, score: scoreStock(s) }))
      .filter(({ score }) => score.buyScore >= minBuyScore)
      .sort((a, b) => b.score.buyScore - a.score.buyScore)
      .slice(0, limit)
    console.log(`[scanner-pro] fallback: ${symbols.length} pedidos → ${fundamentals.length} sobrevivieron Yahoo → ${scored.length} pasaron buyScore≥${minBuyScore}`)
  } else {
    console.log(`[scanner-pro] DB: ${symbolIds.length} símbolos resueltos → ${scored.length} pasaron buyScore≥${minBuyScore}`)
  }

  if (scored.length === 0) return NextResponse.json({ rows: [], total: 0 });

  // 3. Yahoo credentials (shared)
  const auth = await getCrumb();
  if (!auth) return NextResponse.json({ error: "Yahoo auth: no se pudo obtener crumb" }, { status: 500 });
  const { crumb, cookie } = auth;

  // 4. M6 — régimen de mercado (global, cacheado 5 min)
  let m6: Analysis6Result;
  try {
    m6 = await getCachedM6(cookie, crumb);
  } catch (e: any) {
    return NextResponse.json({ error: `Régimen M6: ${e.message}` }, { status: 500 });
  }

  // 5. M1 + M2 + M3 + M5 + M7 per ticker in parallel batches
  const BATCH = 4;
  const rows: ConvictionRow[] = [];

  for (let i = 0; i < scored.length; i += BATCH) {
    const batch = scored.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ({ stock, score }) => {
        try {
          const { spot, m1, m2, m3, m5, m7 } = await analyzeTickerFull(
            stock.symbol, cookie, crumb, m6
          );

          const m2PressureMax = m2.filteredStrikes.length > 0
            ? Math.max(...m2.filteredStrikes.map((s: any) => s.institutionalPressure))
            : 0;

          const conviction = calcConviction(score.buyScore, m7.finalScore, true);
          const sore = computeSORE(
            m1.netGex, m1.institutionalPressure, m1.putCallRatio,
            m6.vix, m6.fearScore, m6.regime, m6.signalSuspended, m5.score,
          );

          return {
            symbol: stock.symbol,
            company: stock.company,
            sector: stock.sector ?? "—",
            buyScore: score.buyScore,
            grade: score.grade,
            currentPrice: spot,
            dropFrom52w: stock.dropFrom52w ?? 0,
            grahamNumber: stock.grahamNumber ?? 0,
            discountToGraham: stock.discountToGraham ?? 0,
            upsideToTarget: stock.upsideToTarget ?? 0,
            pe: stock.pe ?? 0,
            roe: stock.roe ?? 0,
            m1Pressure: m1.institutionalPressure,
            m1Support: m1.levels.support,
            m1Resistance: m1.levels.resistance,
            m1GammaFlip: m1.levels.gammaFlip,
            m1NetGex: m1.netGex,
            m1Pcr: m1.putCallRatio,
            m2Pressure: parseFloat(m2PressureMax.toFixed(2)),
            m2Support: m2.support,
            m2Resistance: m2.resistance,
            m3Confluence: m3.filteredStrikes.length > 0
              ? parseFloat(Math.max(...m3.filteredStrikes.map((s: any) => Math.abs(s.confluenceScore))).toFixed(2))
              : 0,
            m3SupportConf: m3.supportConfidence ?? 0,
            m3ResistanceConf: m3.resistanceConfidence ?? 0,
            m3Support: m3.support,
            m3Resistance: m3.resistance,
            m5Score: parseFloat(m5.score.toFixed(1)),
            m5Verdict: m5.verdict,
            m5Support: m5.support?.strike ?? 0,
            m5Resistance: m5.resistance?.strike ?? 0,
            m5MaxPain: m5.maxPain,
            m5Probability: m5.probability,
            m6Regime: m6.regime,
            m6FearScore: m6.fearScore,
            m6FearLabel: m6.fearLabel,
            m6Vix: m6.vix,
            m6VixVelocity: m6.vixVelocity,
            m6SignalSuspended: m6.signalSuspended,
            m6Multiplier: m6.m5Multiplier,
            m7Score: parseFloat(m7.finalScore.toFixed(1)),
            m7Verdict: m7.finalVerdict,
            m7Confidence: m7.confidence,
            m7PrimaryLongEntry: m7.primaryLong?.entryPrice ?? 0,
            m7PrimaryShortEntry: m7.primaryShort?.entryPrice ?? 0,
            convictionScore: parseFloat(conviction.toFixed(1)),
            verdict: toVerdict(conviction),
            soreCSS: sore.css,
            soreDSS: sore.dss,
            soreVSS: sore.vss,
            soreVRP: sore.vrp,
            soreStrategy: sore.strategy,
            soreGate: sore.gate,
          } satisfies ConvictionRow;
        } catch (e) {
          const genuinelyNoOptions = e instanceof NoOptionsError;
          if (!genuinelyNoOptions) console.error(`[scanner-pro] scan failed for ${stock.symbol}:`, e);
          const conviction = calcConviction(score.buyScore, 0, false);
          return {
            symbol: stock.symbol,
            company: stock.company,
            sector: stock.sector ?? "—",
            buyScore: score.buyScore,
            grade: score.grade,
            currentPrice: stock.currentPrice ?? 0,
            dropFrom52w: stock.dropFrom52w ?? 0,
            grahamNumber: stock.grahamNumber ?? 0,
            discountToGraham: stock.discountToGraham ?? 0,
            upsideToTarget: stock.upsideToTarget ?? 0,
            pe: stock.pe ?? 0,
            roe: stock.roe ?? 0,
            m1Pressure: 0, m1Support: 0, m1Resistance: 0,
            m1GammaFlip: 0, m1NetGex: 0, m1Pcr: 0,
            m2Pressure: 0, m2Support: 0, m2Resistance: 0,
            m3Confluence: 0, m3SupportConf: 0, m3ResistanceConf: 0,
            m3Support: 0, m3Resistance: 0,
            m5Score: 0, m5Verdict: "NEUTRAL", m5Support: 0, m5Resistance: 0,
            m5MaxPain: 0, m5Probability: 0,
            m6Regime: m6.regime,
            m6FearScore: m6.fearScore,
            m6FearLabel: m6.fearLabel,
            m6Vix: m6.vix,
            m6VixVelocity: m6.vixVelocity,
            m6SignalSuspended: m6.signalSuspended,
            m6Multiplier: m6.m5Multiplier,
            m7Score: 0, m7Verdict: "NEUTRAL", m7Confidence: 0,
            m7PrimaryLongEntry: 0, m7PrimaryShortEntry: 0,
            convictionScore: parseFloat(conviction.toFixed(1)),
            verdict: toVerdict(conviction),
            soreCSS: 0, soreDSS: 0, soreVSS: 0, soreVRP: 0,
            soreStrategy: "AVOID", soreGate: "AVOID",
            noOptions: genuinelyNoOptions,
            scanError: !genuinelyNoOptions,
          } satisfies ConvictionRow;
        }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") rows.push(r.value);
    }
  }

  rows.sort((a, b) => b.convictionScore - a.convictionScore);
  return NextResponse.json({ rows, total: rows.length, m6Regime: m6.regime, m6Vix: m6.vix });
}
