import type { AnalysisResult } from "@/types"

export type FlowScore = {
  score:        number   // -100 a +100
  regime:       "CALL DOMINANT" | "PUT DOMINANT" | "BALANCED"
  gammaRegime:  "POSITIVE γ" | "NEGATIVE γ"
  detections:   string[]
  components: {
    pcr:           number   // -100/+100
    gammaDealer:   number   // -100/+100
    institutional: number   // -100/+100
    m5Signal:      number   // -100/+100
  }
}

export type LiquidityScore = {
  score: number
  label: "HIGH" | "MODERATE" | "LOW" | "FRAGILE"
}

function clamp(v: number, lo = -100, hi = 100) {
  return Math.max(lo, Math.min(hi, v))
}

export function computeFlowScore(
  m1:       AnalysisResult,
  m5Score:  number,
  spot:     number,
): FlowScore {
  const pcr          = m1.putCallRatio
  const institutional= m1.institutionalPressure
  const netGex       = m1.netGex
  const gammaFlip    = m1.levels.gammaFlip
  const detections: string[] = []

  // PCR component: -100/+100 (proxy de dominancia call vs put)
  const pcrScore =
    pcr < 0.60 ? 70 :
    pcr < 0.75 ? 48 :
    pcr < 0.90 ? 22 :
    pcr < 1.00 ? 5  :
    pcr < 1.15 ? -22:
    pcr < 1.30 ? -42:
    -65

  // Dealer gamma regime: posición del spot vs gamma flip + signo de netGex
  const aboveFlip = spot > gammaFlip
  const posGex    = netGex >= 0
  let gammaScore: number

  if (posGex && aboveFlip) {
    gammaScore = 55
    detections.push(`Dealers long γ · spot sobre flip $${gammaFlip.toFixed(2)} → régimen estabilizador`)
  } else if (posGex && !aboveFlip) {
    gammaScore = 10
    detections.push(`Dealers long γ pero spot bajo flip $${gammaFlip.toFixed(2)} → zona de transición`)
  } else if (!posGex && aboveFlip) {
    gammaScore = -20
    detections.push(`Dealers short γ sobre flip → riesgo de reversión rápida`)
  } else {
    gammaScore = -55
    detections.push(`Dealers short γ · spot bajo flip $${gammaFlip.toFixed(2)} → régimen de volatilidad`)
  }

  // Detecciones adicionales
  if (pcr > 1.35)
    detections.push(`PCR elevado ${pcr.toFixed(2)} → hedging institucional activo, dominancia put`)
  else if (pcr < 0.65)
    detections.push(`PCR bajo ${pcr.toFixed(2)} → posicionamiento alcista, dominancia call`)

  if (institutional > 45)
    detections.push(`Presión institucional alcista +${institutional.toFixed(0)} → flujo neto comprador`)
  else if (institutional < -45)
    detections.push(`Presión institucional bajista ${institutional.toFixed(0)} → flujo neto vendedor`)

  // Score final ponderado
  const raw = pcrScore * 0.30 + gammaScore * 0.35 + institutional * 0.25 + m5Score * 0.10
  const score = clamp(Math.round(raw))

  const regime: FlowScore["regime"] =
    pcr < 0.80 && institutional > 15 ? "CALL DOMINANT" :
    pcr > 1.15 && institutional < -15 ? "PUT DOMINANT" :
    "BALANCED"

  return {
    score,
    regime,
    gammaRegime: netGex >= 0 ? "POSITIVE γ" : "NEGATIVE γ",
    detections: detections.slice(0, 3),
    components: {
      pcr:           Math.round(pcrScore),
      gammaDealer:   Math.round(gammaScore),
      institutional: Math.round(institutional),
      m5Signal:      Math.round(m5Score),
    },
  }
}

export function computeLiquidityScore(
  vix:       number | null,
  fearScore: number,
): LiquidityScore {
  const base = vix == null ? 60
    : vix < 12 ? 92
    : vix < 15 ? 80
    : vix < 18 ? 68
    : vix < 22 ? 52
    : vix < 28 ? 36
    : vix < 35 ? 20
    : 8

  const mod   = fearScore > 70 ? 5 : fearScore < 30 ? -12 : 0
  const score = Math.max(0, Math.min(100, Math.round(base + mod)))
  const label: LiquidityScore["label"] =
    score >= 70 ? "HIGH" : score >= 50 ? "MODERATE" : score >= 30 ? "LOW" : "FRAGILE"

  return { score, label }
}

// ── Unified Score (0-100) — combina todos los bloques ─────────────────────────

export type UnifiedScore = {
  score:          number   // 0-100
  classification: "AGGRESSIVE LONG" | "LONG" | "NEUTRAL" | "SHORT" | "AGGRESSIVE SHORT"
  probability:    number   // 0-100
  components: {
    macro:        number
    expectations: number
    positioning:  number
    flows:        number
    liquidity:    number
  }
}

export function computeUnifiedScore(params: {
  macroScore:       number   // 0-100
  expectationScore: number   // -100/+100
  positioningScore: number   // -100/+100 (raw M2 score from M7 contributions)
  flowScore:        number   // -100/+100
  liquidityScore:   number   // 0-100
}): UnifiedScore {
  const n = (v: number) => Math.max(0, Math.min(100, Math.round((v + 100) / 2)))

  const macro        = Math.max(0, Math.min(100, Math.round(params.macroScore)))
  const expectations = n(params.expectationScore)
  const positioning  = n(params.positioningScore)
  const flows        = n(params.flowScore)
  const liquidity    = Math.max(0, Math.min(100, Math.round(params.liquidityScore)))

  const score = Math.round(
    macro        * 0.25 +
    expectations * 0.15 +
    positioning  * 0.20 +
    flows        * 0.30 +
    liquidity    * 0.10
  )

  const classification: UnifiedScore["classification"] =
    score >= 75 ? "AGGRESSIVE LONG" :
    score >= 60 ? "LONG" :
    score >= 40 ? "NEUTRAL" :
    score >= 25 ? "SHORT" :
    "AGGRESSIVE SHORT"

  const probability = Math.min(95, Math.round(50 + Math.abs(score - 50) * 0.8))

  return {
    score,
    classification,
    probability,
    components: { macro, expectations, positioning, flows, liquidity },
  }
}
