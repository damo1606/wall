import { fetchMacroData, detectPhase } from "@/lib/macro"
import { getCrumb } from "@/lib/yahoo"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const YF_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
}

async function fetchYahooLast(symbol: string, cookie: string, crumb: string): Promise<number | null> {
  try {
    const encoded = encodeURIComponent(symbol)
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d&crumb=${crumb}`
    const res = await fetch(url, { headers: { ...YF_HEADERS, Cookie: cookie }, cache: "no-store" })
    if (!res.ok) return null
    const json = await res.json()
    const closes: (number | null)[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    const valid = closes.filter((v): v is number => v != null)
    return valid[valid.length - 1] ?? null
  } catch {
    return null
  }
}

export async function GET() {
  const [macroData, auth] = await Promise.all([
    fetchMacroData(),
    getCrumb(),
  ])
  const phase = detectPhase(macroData)

  let vix: number | null = null
  let vix9d: number | null = null
  let vix3m: number | null = null
  let vvix: number | null = null
  let equityPcr: number | null = null

  if (auth) {
    const [v, v9, v3m, vv, pcr] = await Promise.allSettled([
      fetchYahooLast("^VIX",   auth.cookie, auth.crumb),
      fetchYahooLast("^VIX9D", auth.cookie, auth.crumb),
      fetchYahooLast("^VIX3M", auth.cookie, auth.crumb),
      fetchYahooLast("^VVIX",  auth.cookie, auth.crumb),
      fetchYahooLast("^PCALL", auth.cookie, auth.crumb),
    ])
    vix       = v.status   === "fulfilled" ? v.value   : null
    vix9d     = v9.status  === "fulfilled" ? v9.value  : null
    vix3m     = v3m.status === "fulfilled" ? v3m.value : null
    vvix      = vv.status  === "fulfilled" ? vv.value  : null
    equityPcr = pcr.status === "fulfilled" ? pcr.value : null
  }

  return Response.json({
    ...macroData,
    detection: phase,
    vix,
    vix9d,
    vix3m,
    vvix,
    equityPcr,
  })
}
