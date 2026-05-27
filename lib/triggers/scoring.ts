// TriggerScore: puntaje 0-100 para validar la fuerza de una entry.
// Composición:
//   - conditionsMetRate × 50   (qué fracción de las condiciones cumplió)
//   - rotation status × 25     (FAVORED=25, NEUTRAL=12, AVOID=0)
//   - liquidity tier × 15      (>1B=15, >100M=10, >1M=5, else=0)
//   - macroConfidence × 10     (0-1 → 0-10)

export type ScoreInputs = {
  conditionsMet: number
  conditionsTotal: number
  rotationStatus: "FAVORED" | "NEUTRAL" | "AVOID" | null
  dollarVolume20d: number | null
  macroConfidence: number | null  // 0-1
}

export function computeTriggerScore(inp: ScoreInputs): number {
  // 1. Condiciones (50 pts)
  const condPart = inp.conditionsTotal > 0
    ? (inp.conditionsMet / inp.conditionsTotal) * 50
    : 0

  // 2. Rotación (25 pts)
  const rotPart = inp.rotationStatus === "FAVORED" ? 25
                : inp.rotationStatus === "NEUTRAL" ? 12
                : 0

  // 3. Liquidez (15 pts) — tiers por dollar_volume_20d
  const dv = inp.dollarVolume20d ?? 0
  const liqPart = dv >= 1_000_000_000 ? 15
                : dv >=   100_000_000 ? 10
                : dv >=     1_000_000 ?  5
                :                        0

  // 4. Macro confidence (10 pts)
  const macroPart = inp.macroConfidence != null
    ? Math.max(0, Math.min(1, inp.macroConfidence)) * 10
    : 0

  return Math.round(condPart + rotPart + liqPart + macroPart)
}

/**
 * Tier descriptivo + clase Tailwind para el heatmap.
 * Convención: el componente UI usa estas clases directo (bg + text).
 */
export type ScoreTier = "fuerte" | "moderado" | "tibio" | "debil"

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return "fuerte"
  if (score >= 60) return "moderado"
  if (score >= 40) return "tibio"
  return "debil"
}

export function scoreColorClass(score: number): string {
  if (score >= 80) return "bg-emerald-500/30 text-emerald-200 border-emerald-600/50"
  if (score >= 60) return "bg-yellow-500/30 text-yellow-100 border-yellow-600/50"
  if (score >= 40) return "bg-orange-500/30 text-orange-100 border-orange-600/50"
  return "bg-red-500/30 text-red-200 border-red-700/50"
}
