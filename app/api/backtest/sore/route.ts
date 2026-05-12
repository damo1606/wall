import { NextRequest, NextResponse } from "next/server"
import { getCrumb } from "@/lib/yahoo"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Backtest VIX-proxy del signal SORE.
// Tesis: cuando VIX_percentile > N, RV_30d_forward < VIX(t) → VRP positivo → premium harvesting funciona.
// Métrica de éxito: VRP_realized(t) = VIX(t) - RV_30d_forward(t)

type Bar = { date: string; close: number }

async function fetchHistory(symbol: string, range: string, crumb: string, cookie: string): Promise<Bar[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&crumb=${crumb}`
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Cookie: cookie,
  }
  const res = await fetch(url, { headers, cache: "no-store" })
  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`)
  const j = await res.json()
  const r = j?.chart?.result?.[0]
  const ts: number[] = r?.timestamp ?? []
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? []
  return ts.map((t, i) => ({ date: new Date(t * 1000).toISOString().split("T")[0], close: closes[i] ?? 0 }))
    .filter(b => b.close > 0)
}

function realizedVol(prices: number[]): number {
  if (prices.length < 2) return 0
  const rets: number[] = []
  for (let i = 1; i < prices.length; i++) rets.push(Math.log(prices[i] / prices[i - 1]))
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1)
  return Math.sqrt(variance * 252) * 100  // anualizada en %
}

function percentile(value: number, sorted: number[]): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < value) lo = m + 1; else hi = m }
  return (lo / sorted.length) * 100
}

function tTest(sample: number[], hypothesizedMean = 0): { t: number; pTwoSided: number } {
  const n = sample.length
  if (n < 2) return { t: NaN, pTwoSided: NaN }
  const mean = sample.reduce((a, b) => a + b, 0) / n
  const variance = sample.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1)
  const se = Math.sqrt(variance / n)
  const t = (mean - hypothesizedMean) / se
  // p-value bilateral aproximado para n grande (normal estándar)
  const z = Math.abs(t)
  const p = 2 * (1 - normalCdf(z))
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
  const { searchParams } = req.nextUrl
  const cssThreshold = parseInt(searchParams.get("threshold") ?? "75")   // proxy: VIX percentile threshold
  const horizonDays  = parseInt(searchParams.get("horizon") ?? "30")
  const rollingWin   = parseInt(searchParams.get("rolling") ?? "252")    // ventana de percentile

  const auth = await getCrumb()
  if (!auth) return NextResponse.json({ error: "Yahoo auth failed" }, { status: 503 })

  // Fetch VIX + SPY (10 años)
  let vix: Bar[], spy: Bar[]
  try {
    [vix, spy] = await Promise.all([
      fetchHistory("^VIX", "10y", auth.crumb, auth.cookie),
      fetchHistory("SPY",  "10y", auth.crumb, auth.cookie),
    ])
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  // Alinear por fecha
  const spyByDate = new Map(spy.map(b => [b.date, b.close]))
  const aligned = vix.filter(v => spyByDate.has(v.date)).map(v => ({
    date: v.date,
    vix: v.close,
    spy: spyByDate.get(v.date)!,
  }))

  if (aligned.length < rollingWin + horizonDays + 30) {
    return NextResponse.json({ error: "Datos históricos insuficientes" }, { status: 422 })
  }

  // Computar rolling VIX percentile + RV_30d forward
  type Trade = { date: string; vix: number; vixPct: number; rvForward: number; vrp: number; win: boolean; isSignal: boolean }
  const trades: Trade[] = []

  for (let i = rollingWin; i < aligned.length - horizonDays; i++) {
    const window = aligned.slice(i - rollingWin, i).map(b => b.vix).sort((a, b) => a - b)
    const vixPct = percentile(aligned[i].vix, window)

    const forwardPrices = aligned.slice(i, i + horizonDays + 1).map(b => b.spy)
    const rv = realizedVol(forwardPrices)
    const vrp = aligned[i].vix - rv

    trades.push({
      date: aligned[i].date,
      vix: aligned[i].vix,
      vixPct,
      rvForward: rv,
      vrp,
      win: vrp > 0,
      isSignal: vixPct >= cssThreshold,
    })
  }

  const signals = trades.filter(t => t.isSignal)
  const random  = trades

  function stats(arr: Trade[]) {
    if (arr.length === 0) return { count: 0, winRate: 0, meanVrp: 0, sharpe: 0, maxDD: 0 }
    const vrpArr = arr.map(t => t.vrp)
    const wins = arr.filter(t => t.win).length
    const mean = vrpArr.reduce((a, b) => a + b, 0) / arr.length
    const variance = vrpArr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, arr.length - 1)
    const std = Math.sqrt(variance)
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252 / 30) : 0  // anualización para 30d ventana
    let cum = 0, peak = 0, maxDD = 0
    for (const v of vrpArr) {
      cum += v
      if (cum > peak) peak = cum
      if (peak - cum > maxDD) maxDD = peak - cum
    }
    return {
      count: arr.length,
      winRate: parseFloat(((wins / arr.length) * 100).toFixed(1)),
      meanVrp: parseFloat(mean.toFixed(2)),
      sharpe: parseFloat(sharpe.toFixed(2)),
      maxDD: parseFloat(maxDD.toFixed(2)),
    }
  }

  const signalStats = stats(signals)
  const randomStats = stats(random)

  // T-test contra random
  const { t, pTwoSided } = tTest(signals.map(s => s.vrp))

  // Régimen analysis: descompone por año
  const byYear: Record<string, ReturnType<typeof stats>> = {}
  const years = [...new Set(signals.map(s => s.date.slice(0, 4)))].sort()
  for (const y of years) byYear[y] = stats(signals.filter(s => s.date.startsWith(y)))

  // Sample data para gráfica (subset cada N días)
  const sampleStep = Math.max(1, Math.floor(trades.length / 500))
  const sample = trades.filter((_, i) => i % sampleStep === 0).map(t => ({
    date: t.date, vixPct: parseFloat(t.vixPct.toFixed(1)), vrp: parseFloat(t.vrp.toFixed(2)), isSignal: t.isSignal,
  }))

  // Verdict
  const meetsAllThresholds =
    signalStats.winRate     >= 55 &&
    signalStats.meanVrp     >= 1.0 &&
    signalStats.sharpe      >= 0.8 &&
    pTwoSided               <= 0.05
  const verdict = meetsAllThresholds ? "SHIP_THE_SIGNAL" : "NEEDS_TUNING"

  return NextResponse.json({
    config: {
      cssThreshold,
      horizonDays,
      rollingWindow: rollingWin,
      dataStart: aligned[0]?.date,
      dataEnd: aligned[aligned.length - 1]?.date,
      totalDays: aligned.length,
    },
    signal: signalStats,
    random: randomStats,
    edge: {
      winRateDelta: parseFloat((signalStats.winRate - randomStats.winRate).toFixed(1)),
      meanVrpDelta: parseFloat((signalStats.meanVrp - randomStats.meanVrp).toFixed(2)),
      tStatistic:   parseFloat(t.toFixed(2)),
      pValue:       parseFloat(pTwoSided.toFixed(4)),
      significant:  pTwoSided <= 0.05,
    },
    byYear,
    sample,
    verdict,
    thresholds: {
      winRate: { target: 55, actual: signalStats.winRate, pass: signalStats.winRate >= 55 },
      meanVrp: { target: 1.0, actual: signalStats.meanVrp, pass: signalStats.meanVrp >= 1.0 },
      sharpe:  { target: 0.8, actual: signalStats.sharpe, pass: signalStats.sharpe >= 0.8 },
      pValue:  { target: 0.05, actual: parseFloat(pTwoSided.toFixed(4)), pass: pTwoSided <= 0.05 },
    },
  })
}
