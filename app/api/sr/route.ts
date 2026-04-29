import { NextResponse } from "next/server"
import { getCrumb } from "@/lib/yahoo"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

async function fetchChart(symbol: string, interval: string, range: string, crumb: string, cookie: string, noStore = false) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}&includePrePost=false&crumb=${encodeURIComponent(crumb)}`
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: cookie },
      ...(noStore ? { cache: "no-store" } : { next: { revalidate: 300 } }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function fetchSpotPrice(symbol: string, crumb: string, cookie: string): Promise<number | null> {
  const data = await fetchChart(symbol, "1d", "5d", crumb, cookie)
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice as number | undefined
  return price ?? null
}

function calcEMA(values: number[], period: number): number {
  if (values.length === 0) return 0
  const p = Math.min(period, values.length)
  const k = 2 / (p + 1)
  let e = values.slice(0, p).reduce((a, b) => a + b, 0) / p
  for (let i = p; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
}

function calcATR(highs: number[], lows: number[], closes: number[]): number {
  const trs: number[] = []
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ))
  }
  if (trs.length === 0) return 0
  return trs.length >= 14 ? calcEMA(trs, 14) : trs.reduce((a, b) => a + b, 0) / trs.length
}

function round2(v: number) { return Math.round(v * 100) / 100 }

async function buildLevels(symbol: string, crumb: string, cookie: string) {
  const [intra, daily] = await Promise.all([
    fetchChart(symbol, "5m", "1d", crumb, cookie, true),
    fetchChart(symbol, "1d", "1y", crumb, cookie),
  ])

  if (!daily?.chart?.result?.[0]) return null

  const dr = daily.chart.result[0]
  const dq = dr.indicators.quote[0]
  const price       = dr.meta.regularMarketPrice as number
  const marketState = (dr.meta.marketState as string) ?? "CLOSED"

  // Filter nulls from daily candles
  const closes: number[] = [], highs: number[] = [], lows: number[] = []
  for (let i = 0; i < (dq.close as (number | null)[]).length; i++) {
    const c = dq.close[i] as number | null
    const h = dq.high[i]  as number | null
    const l = dq.low[i]   as number | null
    if (c != null && h != null && l != null) { closes.push(c); highs.push(h); lows.push(l) }
  }
  if (closes.length < 2) return null

  // Use second-to-last candle during REGULAR session (today's candle is partial)
  // Use last candle outside session (last entry = last completed day)
  const pivIdx = marketState === "REGULAR" ? closes.length - 2 : closes.length - 1
  const pdh = highs[pivIdx];  const pdl = lows[pivIdx];  const pdc = closes[pivIdx]

  // Classic Pivot Points
  const pp = (pdh + pdl + pdc) / 3
  const r1 = 2 * pp - pdl;  const r2 = pp + (pdh - pdl)
  const s1 = 2 * pp - pdh;  const s2 = pp - (pdh - pdl)

  const atrVal = calcATR(highs, lows, closes)
  const ema20  = calcEMA(closes, 20)
  const ema50  = calcEMA(closes, 50)
  const ema200 = calcEMA(closes, 200)

  // Intraday: VWAP + Opening Range (only meaningful during/after regular session)
  let vwap: number | null = null
  let vwapBands: { s1up: number; s1dn: number; s2up: number; s2dn: number } | null = null
  let openingRange: { high: number; low: number } | null = null

  if (intra?.chart?.result?.[0]) {
    const iq = intra.chart.result[0].indicators.quote[0]
    const candles = (iq.close as (number | null)[])
      .map((c, i) => ({
        c: c ?? 0,
        h: (iq.high[i] as number | null) ?? 0,
        l: (iq.low[i]  as number | null) ?? 0,
        v: (iq.volume[i] as number | null) ?? 0,
      }))
      .filter(x => x.c > 0 && x.v > 0)

    if (candles.length > 3) {
      let cumTPV = 0, cumVol = 0
      const vwapSeries: number[] = []
      for (const c of candles) {
        const tp = (c.h + c.l + c.c) / 3
        cumTPV += tp * c.v; cumVol += c.v
        vwapSeries.push(cumTPV / cumVol)
      }
      const vw = vwapSeries[vwapSeries.length - 1]
      const variance = candles.reduce((acc, c, i) =>
        acc + Math.pow((c.h + c.l + c.c) / 3 - vwapSeries[i], 2), 0) / candles.length
      const sigma = Math.sqrt(variance)

      vwap = round2(vw)
      vwapBands = {
        s1up: round2(vw + sigma),       s1dn: round2(vw - sigma),
        s2up: round2(vw + 2 * sigma),   s2dn: round2(vw - 2 * sigma),
      }

      const or = candles.slice(0, 6) // first 30 min (6 × 5m)
      if (or.length >= 3) {
        openingRange = {
          high: round2(Math.max(...or.map(c => c.h))),
          low:  round2(Math.min(...or.map(c => c.l))),
        }
      }
    }
  }

  return {
    symbol,
    price:   round2(price),
    atr14:   round2(atrVal),
    pdh:     round2(pdh),
    pdl:     round2(pdl),
    pivots:  { pp: round2(pp), r1: round2(r1), r2: round2(r2), s1: round2(s1), s2: round2(s2) },
    vwap,
    vwapBands,
    openingRange,
    emas:    { ema20: round2(ema20), ema50: round2(ema50), ema200: round2(ema200) },
    marketState,
  }
}

export async function GET() {
  const auth = await getCrumb()
  if (!auth) return NextResponse.json({ error: "Yahoo Finance no disponible" }, { status: 503 })

  const [gld, qqq, ndx, xauusd] = await Promise.all([
    buildLevels("GLD", auth.crumb, auth.cookie),
    buildLevels("QQQ", auth.crumb, auth.cookie),
    fetchSpotPrice("^NDX",      auth.crumb, auth.cookie),
    fetchSpotPrice("XAUUSD=X",  auth.crumb, auth.cookie),
  ])

  if (!gld || !qqq) return NextResponse.json({ error: "Sin datos" }, { status: 502 })

  return NextResponse.json({
    GLD: {
      ...gld,
      cfd: xauusd ? { symbol: "XAU/USD", price: round2(xauusd), ratio: round2(xauusd / gld.price) } : null,
    },
    QQQ: {
      ...qqq,
      cfd: ndx ? { symbol: "US100", price: Math.round(ndx), ratio: round2(ndx / qqq.price) } : null,
    },
  })
}
