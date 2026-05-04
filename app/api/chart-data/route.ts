import { NextResponse } from "next/server"
import { getCrumb } from "@/lib/yahoo"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const TF: Record<string, { interval: string; range: string; daily: boolean }> = {
  "1d":  { interval: "1d",  range: "1y",   daily: true  },
  "4h":  { interval: "60m", range: "120d", daily: false },
  "1h":  { interval: "1h",  range: "60d",  daily: false },
  "15m": { interval: "15m", range: "5d",   daily: false },
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = (searchParams.get("symbol") ?? "GLD").toUpperCase()
  const tf     = searchParams.get("tf") ?? "1d"
  const tfp    = TF[tf]
  if (!tfp) return NextResponse.json({ error: "tf inválido" }, { status: 400 })

  const auth = await getCrumb()
  if (!auth) return NextResponse.json({ error: "Yahoo no disponible" }, { status: 503 })

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${tfp.interval}&range=${tfp.range}&includePrePost=false&crumb=${encodeURIComponent(auth.crumb)}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: auth.cookie },
      ...(tfp.daily ? { next: { revalidate: 3600 } } : { cache: "no-store" }),
    })
    if (!res.ok) return NextResponse.json({ error: "Yahoo error" }, { status: 502 })

    const data   = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return NextResponse.json({ error: "Sin datos" }, { status: 404 })

    const timestamps: number[]        = result.timestamp ?? []
    const q = result.indicators.quote[0]

    const raw = timestamps
      .map((ts, i) => ({
        time:   ts,
        open:   q.open[i]   as number | null,
        high:   q.high[i]   as number | null,
        low:    q.low[i]    as number | null,
        close:  q.close[i]  as number | null,
        volume: (q.volume[i] as number | null) ?? 0,
      }))
      .filter(c => c.open != null && c.high != null && c.low != null && c.close != null)
      .map(c => ({ time: c.time, open: c.open!, high: c.high!, low: c.low!, close: c.close!, volume: c.volume }))

    // Aggregate 1h bars into 4h bars (Yahoo has no native 4h interval)
    let candles = raw
    if (tf === "4h") {
      const buckets = new Map<number, typeof raw>()
      for (const c of raw) {
        const bucket = Math.floor(c.time / (4 * 3600)) * (4 * 3600)
        if (!buckets.has(bucket)) buckets.set(bucket, [])
        buckets.get(bucket)!.push(c)
      }
      candles = Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([bucket, bars]) => ({
          time:   bucket,
          open:   bars[0].open,
          high:   Math.max(...bars.map(b => b.high)),
          low:    Math.min(...bars.map(b => b.low)),
          close:  bars[bars.length - 1].close,
          volume: bars.reduce((s, b) => s + b.volume, 0),
        }))
    }

    return NextResponse.json({ candles })
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
