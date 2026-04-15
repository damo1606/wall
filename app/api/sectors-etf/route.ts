// Rendimiento real de ETFs sectoriales del S&P 500 — vía Yahoo Finance
// XLK, XLF, XLV, etc. — Select Sector SPDRs

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const SECTOR_ETFS = [
  { symbol: "XLK",  sector: "Technology",             name: "Tecnología" },
  { symbol: "XLF",  sector: "Financial Services",     name: "Servicios Financieros" },
  { symbol: "XLV",  sector: "Healthcare",             name: "Salud / Biotech" },
  { symbol: "XLY",  sector: "Consumer Discretionary", name: "Consumo Discrecional" },
  { symbol: "XLP",  sector: "Consumer Staples",       name: "Consumo Básico" },
  { symbol: "XLI",  sector: "Industrials",            name: "Industrial" },
  { symbol: "XLC",  sector: "Communication Services", name: "Comunicaciones" },
  { symbol: "XLE",  sector: "Energy",                 name: "Energía" },
  { symbol: "XLU",  sector: "Utilities",              name: "Utilities" },
  { symbol: "XLRE", sector: "Real Estate",            name: "Inmobiliario" },
  { symbol: "XLB",  sector: "Basic Materials",        name: "Materiales" },
]

let _crumb: string | null = null
let _cookie: string | null = null

async function getAuth(): Promise<{ crumb: string; cookie: string } | null> {
  if (_crumb && _cookie) return { crumb: _crumb, cookie: _cookie }
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA }, redirect: "follow",
    })
    const raw   = cookieRes.headers.get("set-cookie") ?? ""
    const match = raw.match(/A3=[^;]+/)
    if (!match) return null
    _cookie = match[0]

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: _cookie },
    })
    const crumb = await crumbRes.text()
    if (!crumb || crumb.includes("{")) return null
    _crumb = crumb
    return { crumb: _crumb, cookie: _cookie }
  } catch { return null }
}

async function fetchEtf(symbol: string, auth: { crumb: string; cookie: string }) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics,price&crumb=${encodeURIComponent(auth.crumb)}`
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: auth.cookie },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  const json = await res.json()
  const r    = json?.quoteSummary?.result?.[0]
  if (!r) return null

  const stats = r.defaultKeyStatistics ?? {}
  const price = r.price               ?? {}

  const w52Change = stats["52WeekChange"]?.raw ?? null
  const ytdReturn = stats.ytdReturn?.raw        ?? null
  const current   = price.regularMarketPrice?.raw ?? 0
  const dayChange = price.regularMarketChangePercent?.raw ?? 0

  return {
    symbol,
    currentPrice:   current,
    change1d:       dayChange * 100,
    change52w:      w52Change !== null ? w52Change * 100 : null,
    ytdReturn:      ytdReturn  !== null ? ytdReturn  * 100 : null,
  }
}

export async function GET() {
  try {
    const auth = await getAuth()
    if (!auth) return Response.json({ error: "Auth failed" }, { status: 503 })

    const results = await Promise.allSettled(
      SECTOR_ETFS.map(async etf => {
        const data = await fetchEtf(etf.symbol, auth)
        return { ...etf, ...(data ?? { currentPrice: 0, change1d: null, change52w: null, ytdReturn: null }) }
      })
    )

    const etfs = results
      .filter(r => r.status === "fulfilled")
      .map(r => (r as PromiseFulfilledResult<typeof SECTOR_ETFS[0] & {
        currentPrice: number; change1d: number | null; change52w: number | null; ytdReturn: number | null
      }>).value)

    return Response.json({ etfs, fetchedAt: new Date().toISOString() })
  } catch {
    return Response.json({ error: "Error fetching ETF data" }, { status: 500 })
  }
}
