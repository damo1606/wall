// Wrapper unificado: Yahoo Finance primero, FMP como fallback si está habilitado.
// Mantiene el shape de Yahoo para no romper código existente.

import { fetchStockData } from "@/lib/yahoo"
import { fmpEnabled, fmpQuote, fmpKeyMetricsLatest, fmpProfile } from "@/lib/fmp"

type StockSnapshot = Awaited<ReturnType<typeof fetchStockData>>

// Intenta Yahoo, si null y FMP está habilitado, intenta FMP.
export async function fetchStockDataResilient(symbol: string): Promise<StockSnapshot | null> {
  const yahoo = await fetchStockData(symbol).catch(() => null)
  if (yahoo) return yahoo

  if (!fmpEnabled()) return null

  const [quote, metrics, profile] = await Promise.all([
    fmpQuote(symbol),
    fmpKeyMetricsLatest(symbol),
    fmpProfile(symbol),
  ])
  if (!quote) return null

  // Adaptar shape FMP → shape Yahoo. Campos no disponibles quedan en null.
  const bvps = metrics?.bookValuePerShare ?? null
  const eps  = quote.eps ?? null
  const grahamNumber = (bvps && eps && bvps > 0 && eps > 0)
    ? Math.sqrt(22.5 * eps * bvps)
    : null

  return {
    symbol:           quote.symbol,
    company:          quote.name,
    sector:           profile?.sector ?? null,
    industry:         profile?.industry ?? null,
    currentPrice:     quote.price,
    marketCap:        quote.marketCap,
    pe:               quote.pe,
    pb:               metrics?.pbRatio ?? null,
    roe:              metrics?.roe ?? null,
    roic:             metrics?.roic ?? null,
    debtToEquity:     metrics?.debtToEquity ?? null,
    fcfYield:         metrics?.freeCashFlowYield ?? null,
    eps,
    bvps,
    grahamNumber,
    high52w:          quote.yearHigh,
    low52w:           quote.yearLow,
    dropFrom52w:      quote.yearHigh > 0 ? ((quote.price - quote.yearHigh) / quote.yearHigh) * 100 : null,
    discountToGraham: (grahamNumber && quote.price > 0) ? ((grahamNumber - quote.price) / quote.price) * 100 : null,
    upsideToTarget:   null,
    targetPrice:      null,
    earningsDate:     null,
    _source:          "fmp" as const,
  } as unknown as StockSnapshot
}
