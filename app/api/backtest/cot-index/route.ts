import { NextRequest, NextResponse } from "next/server"
import { getCrumb } from "@/lib/yahoo"
import { requireAuth } from "@/lib/api-auth"
import { intParam } from "@/lib/query-params"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Backtest contrarian: posicionamiento de Leveraged Money (CFTC TFF, semanal,
// 2006-presente) en futuros de índice vs. retorno futuro del ETF cash.
// Tesis: cuando los fondos apalancados están extremadamente largos (percentil
// alto de su propia historia), el índice tiende a revertir a la baja en las
// semanas siguientes — y al revés en extremos cortos. No es momentum, es
// contrarian: el mercado ya descontó lo que el posicionamiento anticipaba.

const CFTC_TFF_DATASET = "gpe5-46if" // Traders in Financial Futures — Futures Only

// El CFTC renombró los contratos el 2022-02-08 (taxonomía nueva). La línea
// "Consolidated" (suma full+e-mini+micro del mismo índice) no se renombró y
// da la serie más larga y limpia — 2010-presente. Russell no tiene línea
// Consolidated: encadena el e-mini CME (2017-2022) con su sucesor renombrado
// (2022-presente); se deja fuera el contrato ICE pre-2017 por ser otro
// exchange con specs distintas, no directamente comparable.
const INDEX_CONFIG: Record<string, { cftcNames: string[]; etf: string }> = {
  SPX: { cftcNames: ["S&P 500 Consolidated - CHICAGO MERCANTILE EXCHANGE"], etf: "SPY" },
  NDX: { cftcNames: ["NASDAQ-100 Consolidated - CHICAGO MERCANTILE EXCHANGE"], etf: "QQQ" },
  DJI: { cftcNames: ["DJIA Consolidated - CHICAGO BOARD OF TRADE"], etf: "DIA" },
  RUT: {
    cftcNames: [
      "E-MINI RUSSELL 2000 INDEX - CHICAGO MERCANTILE EXCHANGE",
      "RUSSELL E-MINI - CHICAGO MERCANTILE EXCHANGE",
    ],
    etf: "IWM",
  },
}

type CotWeek = { date: string; oi: number; levLong: number; levShort: number }
type Bar = { date: string; close: number }

async function fetchCotHistory(cftcNames: string[]): Promise<CotWeek[]> {
  const inList = cftcNames.map(n => `'${n}'`).join(",")
  const params = new URLSearchParams({
    "$select": "report_date_as_yyyy_mm_dd,open_interest_all,lev_money_positions_long,lev_money_positions_short",
    "$where": `market_and_exchange_names in (${inList})`,
    "$order": "report_date_as_yyyy_mm_dd ASC",
    "$limit": "3000",
  })
  const url = `https://publicreporting.cftc.gov/resource/${CFTC_TFF_DATASET}.json?${params.toString()}`
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } })
  if (!res.ok) throw new Error(`CFTC Socrata: ${res.status}`)
  const rows = await res.json() as Array<{
    report_date_as_yyyy_mm_dd: string
    open_interest_all: string
    lev_money_positions_long: string
    lev_money_positions_short: string
  }>
  return rows
    .map(r => ({
      date: r.report_date_as_yyyy_mm_dd.slice(0, 10),
      oi: Number(r.open_interest_all),
      levLong: Number(r.lev_money_positions_long),
      levShort: Number(r.lev_money_positions_short),
    }))
    .filter(r => Number.isFinite(r.oi) && r.oi > 0)
}

async function fetchPriceHistory(symbol: string, crumb: string, cookie: string): Promise<Bar[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=20y&crumb=${crumb}`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Cookie: cookie },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`)
  const j = await res.json()
  const r = j?.chart?.result?.[0]
  const ts: number[] = r?.timestamp ?? []
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? []
  return ts
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] ?? 0 }))
    .filter(b => b.close > 0)
}

function percentile(value: number, sorted: number[]): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < value) lo = m + 1; else hi = m }
  return (lo / sorted.length) * 100
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Precio en o después de `date` — el reporte COT es "as of" martes; si el
// mercado no abrió ese día exacto, tomamos el próximo cierre disponible.
function closeOnOrAfter(bars: Bar[], date: string): number | null {
  const b = bars.find(x => x.date >= date)
  return b ? b.close : null
}

function tTestVsZero(sample: number[]): { t: number; pTwoSided: number } {
  const n = sample.length
  if (n < 2) return { t: NaN, pTwoSided: NaN }
  const mean = sample.reduce((a, b) => a + b, 0) / n
  const variance = sample.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1)
  const se = Math.sqrt(variance / n)
  const t = se > 0 ? mean / se : 0
  const p = 2 * (1 - normalCdf(Math.abs(t)))
  return { t, pTwoSided: p }
}

function normalCdf(x: number): number {
  // Aproximación Abramowitz & Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804 * Math.exp(-x * x / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return x > 0 ? 1 - p : p
}

export async function GET(req: NextRequest) {
  const denied = await requireAuth(); if (denied) return denied;
  const { searchParams } = req.nextUrl

  const index = (searchParams.get("index") ?? "SPX").toUpperCase()
  const cfg = INDEX_CONFIG[index]
  if (!cfg) {
    return NextResponse.json({ error: `Índice no soportado: ${index}. Usa SPX, NDX, DJI o RUT.` }, { status: 400 })
  }

  const pctThreshold = intParam(searchParams.get("threshold"), { def: 80,  min: 55, max: 95 })  // percentil extremo
  const horizonWeeks = intParam(searchParams.get("horizon"),   { def: 8,   min: 1,  max: 52 })
  const rollingWin   = intParam(searchParams.get("rolling"),   { def: 156, min: 26, max: 780 }) // ventana percentile, en semanas

  const auth = await getCrumb()
  if (!auth) return NextResponse.json({ error: "Yahoo auth failed" }, { status: 503 })

  let cotHistory: CotWeek[], prices: Bar[]
  try {
    [cotHistory, prices] = await Promise.all([
      fetchCotHistory(cfg.cftcNames),
      fetchPriceHistory(cfg.etf, auth.crumb, auth.cookie),
    ])
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (cotHistory.length < rollingWin + 20) {
    return NextResponse.json({ error: "Historial COT insuficiente para esta ventana" }, { status: 422 })
  }

  const weeks = cotHistory.map(w => ({
    ...w,
    levNetPct: w.oi > 0 ? ((w.levLong - w.levShort) / w.oi) * 100 : 0,
  }))

  type Trade = { date: string; pct: number; fwdReturn: number; bucket: "crowded_long" | "crowded_short" | "neutral" }
  const trades: Trade[] = []

  for (let i = rollingWin; i < weeks.length; i++) {
    const window = weeks.slice(i - rollingWin, i).map(w => w.levNetPct).sort((a, b) => a - b)
    const pct = percentile(weeks[i].levNetPct, window)

    const p0 = closeOnOrAfter(prices, weeks[i].date)
    const p1 = closeOnOrAfter(prices, addDays(weeks[i].date, horizonWeeks * 7))
    if (p0 == null || p1 == null) continue

    const fwdReturn = ((p1 / p0) - 1) * 100
    const bucket: Trade["bucket"] =
      pct >= pctThreshold ? "crowded_long" :
      pct <= (100 - pctThreshold) ? "crowded_short" : "neutral"

    trades.push({ date: weeks[i].date, pct, fwdReturn, bucket })
  }

  function stats(arr: Trade[], winIf: (t: Trade) => boolean) {
    if (arr.length === 0) return { count: 0, winRate: 0, meanReturn: 0, sharpe: 0, maxDD: 0 }
    const rets = arr.map(t => t.fwdReturn)
    const wins = arr.filter(winIf).length
    const mean = rets.reduce((a, b) => a + b, 0) / arr.length
    const variance = rets.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, arr.length - 1)
    const std = Math.sqrt(variance)
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(52 / horizonWeeks) : 0
    let cum = 0, peak = 0, maxDD = 0
    for (const v of rets) { cum += v; if (cum > peak) peak = cum; if (peak - cum > maxDD) maxDD = peak - cum }
    return {
      count: arr.length,
      winRate: parseFloat(((wins / arr.length) * 100).toFixed(1)),
      meanReturn: parseFloat(mean.toFixed(2)),
      sharpe: parseFloat(sharpe.toFixed(2)),
      maxDD: parseFloat(maxDD.toFixed(2)),
    }
  }

  const baseline     = trades
  const crowdedLong  = trades.filter(t => t.bucket === "crowded_long")
  const crowdedShort = trades.filter(t => t.bucket === "crowded_short")

  const baselineStats     = stats(baseline, () => true)
  // "Gana" el contrarian si el retorno futuro cae del lado que predice.
  const crowdedLongStats  = stats(crowdedLong,  t => t.fwdReturn < 0)
  const crowdedShortStats = stats(crowdedShort, t => t.fwdReturn > 0)

  // Edge = retorno del bucket menos el retorno base (todas las semanas) — t-test
  // sobre esa diferencia, no sobre el retorno crudo.
  const tLong  = tTestVsZero(crowdedLong.map(t => t.fwdReturn - baselineStats.meanReturn))
  const tShort = tTestVsZero(crowdedShort.map(t => t.fwdReturn - baselineStats.meanReturn))

  const byYear: Record<string, {
    crowdedLong: ReturnType<typeof stats>
    crowdedShort: ReturnType<typeof stats>
  }> = {}
  const years = [...new Set(trades.map(t => t.date.slice(0, 4)))].sort()
  for (const y of years) {
    byYear[y] = {
      crowdedLong:  stats(crowdedLong.filter(t => t.date.startsWith(y)),  t => t.fwdReturn < 0),
      crowdedShort: stats(crowdedShort.filter(t => t.date.startsWith(y)), t => t.fwdReturn > 0),
    }
  }

  const meetsLong  = crowdedLongStats.count  >= 15 && crowdedLongStats.winRate  >= 55 && tLong.pTwoSided  <= 0.10
  const meetsShort = crowdedShortStats.count >= 15 && crowdedShortStats.winRate >= 55 && tShort.pTwoSided <= 0.10
  const verdict = (meetsLong || meetsShort) ? "SHIP_THE_SIGNAL" : "NEEDS_TUNING"

  return NextResponse.json({
    config: {
      index, etf: cfg.etf, pctThreshold, horizonWeeks, rollingWindow: rollingWin,
      dataStart: weeks[rollingWin]?.date, dataEnd: weeks[weeks.length - 1]?.date,
      totalWeeks: weeks.length, totalTrades: trades.length,
    },
    baseline: baselineStats,
    crowdedLong: {
      ...crowdedLongStats,
      meanReturnDelta: parseFloat((crowdedLongStats.meanReturn - baselineStats.meanReturn).toFixed(2)),
      tStatistic: parseFloat(tLong.t.toFixed(2)),
      pValue: parseFloat(tLong.pTwoSided.toFixed(4)),
      significant: tLong.pTwoSided <= 0.10,
    },
    crowdedShort: {
      ...crowdedShortStats,
      meanReturnDelta: parseFloat((crowdedShortStats.meanReturn - baselineStats.meanReturn).toFixed(2)),
      tStatistic: parseFloat(tShort.t.toFixed(2)),
      pValue: parseFloat(tShort.pTwoSided.toFixed(4)),
      significant: tShort.pTwoSided <= 0.10,
    },
    byYear,
    verdict,
    caveat: "Ventanas semanales solapadas: la autocorrelación infla la cuenta de trades independientes — trátese como indicativo, no como prueba estadística limpia.",
  })
}
