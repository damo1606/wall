import { NextRequest, NextResponse } from "next/server"
import { getCrumb } from "@/lib/yahoo"
import { supabaseServer } from "@/lib/supabase"

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
}

function calcAtmIv(
  calls: { strike: number; impliedVolatility: number }[],
  puts:  { strike: number; impliedVolatility: number }[],
  spot: number
): number {
  const nearCall = [...calls].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0]
  const nearPut  = [...puts ].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0]
  const cIv = (nearCall?.impliedVolatility ?? 0) * 100
  const pIv = (nearPut?.impliedVolatility  ?? 0) * 100
  if (cIv > 0 && pIv > 0) return parseFloat(((cIv + pIv) / 2).toFixed(1))
  return parseFloat((cIv || pIv).toFixed(1))
}

function ivRank(current: number, history: number[]): number | null {
  if (history.length < 5) return null
  const min = Math.min(...history)
  const max = Math.max(...history)
  if (max === min) return 50
  return Math.round(((current - min) / (max - min)) * 100)
}

function ivPercentile(current: number, history: number[]): number | null {
  if (history.length < 5) return null
  const below = history.filter(v => v < current).length
  return Math.round((below / history.length) * 100)
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase()
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 })

  const auth = await getCrumb()
  if (!auth) return NextResponse.json({ error: "Auth failed" }, { status: 500 })

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${auth.crumb}`
    const res = await fetch(url, { headers: { ...HEADERS, Cookie: auth.cookie }, cache: "no-store" })
    if (!res.ok) return NextResponse.json({ error: `Yahoo ${res.status}` }, { status: 502 })

    const json = await res.json()
    const result  = json?.optionChain?.result?.[0]
    const spot: number = result?.quote?.regularMarketPrice ?? 0
    const optData = result?.options?.[0]
    if (!optData || !spot) return NextResponse.json({ error: "No chain" }, { status: 404 })

    const calls = (optData.calls ?? []).map((c: any) => ({ strike: c.strike ?? 0, impliedVolatility: c.impliedVolatility ?? 0 }))
    const puts  = (optData.puts  ?? []).map((p: any) => ({ strike: p.strike ?? 0, impliedVolatility: p.impliedVolatility ?? 0 }))
    const atmIv = calcAtmIv(calls, puts, spot)

    // Historial desde Supabase (columna atm_iv — puede no existir aún)
    let history: number[] = []
    try {
      const { data } = await supabaseServer()
        .from("sr_snapshots")
        .select("atm_iv")
        .eq("ticker", ticker)
        .not("atm_iv", "is", null)
        .order("created_at", { ascending: false })
        .limit(52)
      history = (data ?? []).map((s: any) => s.atm_iv as number).filter(v => v > 0)
    } catch { /* columna aún no existe — historial vacío */ }

    return NextResponse.json({
      ticker,
      spot,
      atmIv,
      ivRank:       ivRank(atmIv, history),
      ivPercentile: ivPercentile(atmIv, history),
      samples:      history.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
