// Financial Modeling Prep fallback para Yahoo Finance.
// Solo se activa si FMP_API_KEY está seteada.
// Cobertura básica para no romper si Yahoo bloquea: quote, profile, key-metrics.

const FMP_BASE = "https://financialmodelingprep.com/api/v3"

export function fmpEnabled(): boolean {
  return !!process.env.FMP_API_KEY
}

async function fmp<T>(path: string): Promise<T | null> {
  const key = process.env.FMP_API_KEY
  if (!key) return null
  try {
    const sep = path.includes("?") ? "&" : "?"
    const res = await fetch(`${FMP_BASE}${path}${sep}apikey=${key}`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return await res.json() as T
  } catch { return null }
}

export type FmpQuote = {
  symbol: string
  price: number
  changesPercentage: number
  change: number
  dayLow: number
  dayHigh: number
  yearHigh: number
  yearLow: number
  marketCap: number
  pe: number | null
  eps: number | null
  exchange: string
  name: string
  volume: number
  avgVolume: number
}

export async function fmpQuote(symbol: string): Promise<FmpQuote | null> {
  const data = await fmp<FmpQuote[]>(`/quote/${symbol}`)
  return data?.[0] ?? null
}

export async function fmpQuoteBatch(symbols: string[]): Promise<FmpQuote[]> {
  if (symbols.length === 0) return []
  return await fmp<FmpQuote[]>(`/quote/${symbols.join(",")}`) ?? []
}

export type FmpProfile = {
  symbol: string
  companyName: string
  industry: string
  sector: string
  beta: number
  mktCap: number
  price: number
  exchangeShortName: string
}

export async function fmpProfile(symbol: string): Promise<FmpProfile | null> {
  const data = await fmp<FmpProfile[]>(`/profile/${symbol}`)
  return data?.[0] ?? null
}

export type FmpKeyMetrics = {
  date: string
  roe: number | null
  roic: number | null
  peRatio: number | null
  pbRatio: number | null
  debtToEquity: number | null
  freeCashFlowYield: number | null
  bookValuePerShare: number | null
}

export async function fmpKeyMetricsLatest(symbol: string): Promise<FmpKeyMetrics | null> {
  const data = await fmp<FmpKeyMetrics[]>(`/key-metrics-ttm/${symbol}`)
  return data?.[0] ?? null
}

// Historical daily bars — para backtest si Yahoo cae
export type FmpBar = { date: string; close: number; volume: number; high: number; low: number; open: number }

export async function fmpHistory(symbol: string, days = 365): Promise<FmpBar[]> {
  const data = await fmp<{ historical: FmpBar[] }>(`/historical-price-full/${symbol}?timeseries=${days}`)
  return data?.historical ?? []
}
