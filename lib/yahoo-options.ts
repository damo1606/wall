import { getCrumb } from "./yahoo"
import { expDateFromTs, nyClock, selectExpirations } from "./option-chains-window"

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
  opts: { maxExpirations?: number; strikePct?: number; minDte?: number; today?: string } = {},
): Promise<OptionChainResult | null> {
  const maxExp    = opts.maxExpirations ?? 2
  const strikePct = opts.strikePct ?? 0.20
  const minDte    = opts.minDte ?? 0
  const today     = opts.today ?? nyClock().date

  const auth = await getCrumb()
  if (!auth) return null

  const initial = await fetchRaw(ticker, auth.cookie, auth.crumb)
  if (!initial) return null

  const spot: number = initial.quote?.regularMarketPrice ?? 0
  if (!spot) return null

  const expTs: number[] = initial.expirationDates ?? []
  if (expTs.length === 0) return null
  // minDte=0 conserva el comportamiento previo (los N más próximos).
  const selectedTs = selectExpirations(expTs, today, maxExp, minDte)
  if (selectedTs.length === 0) return null

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

  // `initial` trae la cadena del vencimiento más próximo; se reutiliza solo si
  // ese vencimiento quedó seleccionado. Los demás se piden por date.
  const firstTs = Math.min(...expTs)
  for (const ts of selectedTs) {
    const expDate = expDateFromTs(ts)
    const result = ts === firstTs ? initial : await fetchRaw(ticker, auth.cookie, auth.crumb, ts)
    const optData = result?.options?.[0]
    if (!optData) continue
    push(optData.calls, "call", expDate)
    push(optData.puts, "put", expDate)
  }

  return { spot, contracts }
}
