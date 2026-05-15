// Evaluación de alertas para el cron diario.
//
// Dos reglas:
//   1. Regla global — detecta tickers que CRUZAN a oportunidad de compra fuerte
//      hoy (no lo eran en el snapshot anterior). detectCrossings() es pura → testeable.
//   2. Reglas de usuario — evalúa cada fila de `alerts` contra el snapshot de hoy.

import { computeOpportunityScore, type OpportunitySignals } from "@/lib/opportunity"

// Subconjunto de ConvictionRow (scanner-pro) que necesitan las alertas.
export type AlertScanRow = {
  symbol: string
  currentPrice: number
  pe: number
  buyScore: number
  convictionScore: number
  m7Score: number
  soreGate: "GO" | "WAIT" | "AVOID"
  dropFrom52w: number
  discountToGraham: number
  upsideToTarget: number
}

const STRONG_BUY_THRESHOLD = 70   // opportunityScore mínimo para "compra fuerte"

function rowToSignals(r: AlertScanRow): OpportunitySignals {
  return {
    buyScore:         r.buyScore ?? 0,
    convictionScore:  r.convictionScore ?? 0,
    m7Score:          r.m7Score ?? 0,
    soreGate:         r.soreGate ?? "WAIT",
    dropFrom52w:      r.dropFrom52w ?? 0,
    discountToGraham: r.discountToGraham ?? 0,
    upsideToTarget:   r.upsideToTarget ?? 0,
    pe:               r.pe ?? 0,
  }
}

function isStrongBuy(r: AlertScanRow): boolean {
  const o = computeOpportunityScore(rowToSignals(r))
  return o.bucket === "comprar" && o.opportunityScore >= STRONG_BUY_THRESHOLD
}

export type Crossing = { symbol: string; score: number }

/**
 * Regla global: tickers que HOY son oportunidad de compra fuerte y NO lo eran en el
 * snapshot anterior. Pura — no toca la base de datos, testeable directamente.
 *
 * Si `previous` está vacío devuelve [] (sin base de comparación no hay "cruce").
 */
export function detectCrossings(today: AlertScanRow[], previous: AlertScanRow[]): Crossing[] {
  if (previous.length === 0) return []

  const prevStrong = new Set(previous.filter(isStrongBuy).map(r => r.symbol))
  const crossings: Crossing[] = []

  for (const r of today) {
    if (prevStrong.has(r.symbol)) continue
    const o = computeOpportunityScore(rowToSignals(r))
    if (o.bucket === "comprar" && o.opportunityScore >= STRONG_BUY_THRESHOLD) {
      crossings.push({ symbol: r.symbol, score: o.opportunityScore })
    }
  }
  return crossings
}

/**
 * Evalúa una regla de alerta de usuario contra la fila de hoy.
 * `threshold.value` se interpreta como número cuando la condición lo requiere.
 */
export function evaluateUserAlert(
  condition: string,
  threshold: Record<string, unknown> | null,
  row: AlertScanRow,
): boolean {
  const value = typeof threshold?.value === "number" ? threshold.value : NaN
  const opp = computeOpportunityScore(rowToSignals(row))

  switch (condition) {
    case "price_below":
      return Number.isFinite(value) && row.currentPrice > 0 && row.currentPrice <= value
    case "price_above":
      return Number.isFinite(value) && row.currentPrice >= value
    case "pe_below":
      return Number.isFinite(value) && row.pe > 0 && row.pe <= value
    case "opportunity_above":
      return Number.isFinite(value) && opp.opportunityScore >= value
    case "buy_signal":
    case "buy_ready":
    default:
      // Por defecto: dispara cuando la acción entra en bucket de compra.
      return opp.bucket === "comprar"
  }
}
