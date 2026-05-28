import { getCrumb } from "./yahoo"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export type OptionContract = {
  expiration: string        // YYYY-MM-DD
  strike: number
  optionType: "call" | "put"
  bid: number | null
  ask: number | null
  last: number | null
  iv: number | null
  openInterest: number | null
  volume: number | null
}

export type OptionChainResult = {
  spot: number
  contracts: OptionContract[]
}

type RawContract = {
  strike?: number
  bid?: number
  ask?: number
  lastPrice?: number
  impliedVolatility?: number
  openInterest?: number
  volume?: number
}

async function fetchRaw(ticker: string, cookie: string, crumb: string, dateTs?: number) {
  const params = new URLSearchParams({ crumb })
  if (dateTs) params.set("date", String(dateTs))
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?${params}`
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: cookie, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return null
  const json = await res.json()
  return json?.optionChain?.result?.[0] ?? null
}

/**
 * Baja la cadena de opciones de un ticker para las próximas `maxExpirations`
 * expiraciones, limitando a strikes dentro de ±`strikePct` del spot.
 * Devuelve null si Yahoo falla o el símbolo no tiene opciones.
 */
export async function fetchOptionChain(
  ticker: string,
  opts: { maxExpirations?: number; strikePct?: number } = {},
): Promise<OptionChainResult | null> {
  const maxExp    = opts.maxExpirations ?? 2
  const strikePct = opts.strikePct ?? 0.20

  const auth = await getCrumb()
  if (!auth) return null

  const initial = await fetchRaw(ticker, auth.cookie, auth.crumb)
  if (!initial) return null

  const spot: number = initial.quote?.regularMarketPrice ?? 0
  if (!spot) return null

  const expTs: number[] = initial.expirationDates ?? []
  if (expTs.length === 0) return null
  const selectedTs = expTs.slice(0, maxExp)

  const lo = spot * (1 - strikePct)
  const hi = spot * (1 + strikePct)
  const contracts: OptionContract[] = []

  const push = (raw: RawContract[], type: "call" | "put", expDate: string) => {
    for (const c of raw ?? []) {
      const strike = c.strike ?? 0
      if (strike < lo || strike > hi) continue
      contracts.push({
        expiration: expDate,
        strike,
        optionType: type,
        bid: c.bid ?? null,
        ask: c.ask ?? null,
        last: c.lastPrice ?? null,
        iv: c.impliedVolatility ?? null,
        openInterest: c.openInterest ?? null,
        volume: c.volume ?? null,
      })
    }
  }

  // La primera expiración ya vino en `initial`; las demás se piden por date.
  for (let i = 0; i < selectedTs.length; i++) {
    const ts = selectedTs[i]
    const expDate = new Date(ts * 1000).toISOString().slice(0, 10)
    const result = i === 0 ? initial : await fetchRaw(ticker, auth.cookie, auth.crumb, ts)
    const optData = result?.options?.[0]
    if (!optData) continue
    push(optData.calls, "call", expDate)
    push(optData.puts, "put", expDate)
  }

  return { spot, contracts }
}
