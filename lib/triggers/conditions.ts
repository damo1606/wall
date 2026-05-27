// Mapping `condition_name` (de trigger_rule_conditions) → evaluador TS.
// El DSL en BD (`condition_expr`) queda como documentación humana.

export type SnapshotPayload = {
  soreGate?: string
  dropFrom52w?: number
  convictionScore?: number
  m6FearScore?: number
  currentPrice?: number
  m1Support?: number
  discountToGraham?: number
  m6Regime?: string
  m6Vix?: number
  sector?: string
  soreCSS?: number
  buyScore?: number
} & Record<string, unknown>

export type ConditionFn = (p: SnapshotPayload) => boolean

export const CONDITIONS: Record<string, ConditionFn> = {
  soreGate_GO:     (p) => p.soreGate === "GO",
  dropFrom52w:     (p) => typeof p.dropFrom52w === "number" && p.dropFrom52w <= -15,
  conviction:      (p) => (p.convictionScore ?? 0) >= 60,
  fear_extreme:    (p) => typeof p.m6FearScore === "number" && (p.m6FearScore >= 70 || p.m6FearScore <= 30),
  near_support:    (p) => typeof p.currentPrice === "number" && typeof p.m1Support === "number" && p.m1Support > 0
                          && p.currentPrice <= p.m1Support * 1.02,
  graham_discount: (p) => (p.discountToGraham ?? 0) >= 10,
}

export function evaluateCondition(name: string, payload: SnapshotPayload): boolean | null {
  const fn = CONDITIONS[name]
  if (!fn) return null  // condición desconocida — auditable como "skip"
  try { return fn(payload) } catch { return false }
}
