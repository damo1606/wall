// El Cerebro — capa de síntesis final del modelo
//
// Combina tres fuentes de inteligencia:
//   1. scoreStock()    → calidad + precio del negocio (fundamentales)
//   2. analyzeForward() → trayectoria futura (12-24 meses)
//   3. detectPhase()   → fase del ciclo macro (FRED)
//
// Regla fundamental: los overrides de Venta Fuerte por deterioro financiero
// (healthScore < 25, EPS caída > 10%, FCF negativo sin runway) NUNCA son
// revertidos por el macro. La macro solo puede ajustar señales neutras o de compra.

import type { ScoreBreakdown } from "./scoring"
import type { ForwardAnalysis } from "./forward"
import type { CyclePhase } from "./sectors"
import { getSectorHeat } from "./sectors"

// ── Tipos públicos ────────────────────────────────────────────────────────────

type Signal = ScoreBreakdown["signal"]

export type MacroContext = {
  phase:      CyclePhase
  confidence: number   // 0-100 — fiabilidad de la detección del ciclo
}

export type BrainInput = {
  score:    ScoreBreakdown
  stock:    { sector: string; dropFrom52w: number; symbol: string }
  macro?:   MacroContext       // opcional — sin esto solo usa fundamentales
  forward?: ForwardAnalysis   // opcional — añade capa prospectiva
}

export type BrainFactor = {
  name:        string
  impact:      "positive" | "negative" | "neutral"
  description: string
}

export type BrainOutput = {
  // Señal final del cerebro (puede diferir del base si macro/forward ajustaron)
  finalSignal:     Signal
  baseSignal:      Signal    // señal original de scoreStock sin ajustes
  signalAdjusted:  boolean   // true cuando el cerebro modificó la señal base

  // Contexto macro
  cycleFit:        "tailwind" | "neutral" | "headwind" | "unknown"
  sectorHeat:      number    // 1-10 (5 si no hay macro — neutral por defecto)
  macroAdjustment: string | null  // descripción del ajuste si hubo

  // Scores sintetizados
  qualityScore:    number
  priceScore:      number
  forwardScore:    number | null

  // Razón compuesta final
  finalReason:     string

  // Factores para display (3-6 items)
  factors:         BrainFactor[]

  // Confianza total del cerebro (0-100)
  confidence:      number
}

// ── Función principal ─────────────────────────────────────────────────────────

export function runBrain(input: BrainInput): BrainOutput {
  const { score, stock, macro, forward } = input

  // LAYER 1 — Base (siempre presente)
  let signal: Signal = score.signal
  const factors: BrainFactor[] = []

  // Factor: calidad del negocio
  factors.push({
    name: "Calidad del negocio",
    impact: score.qualityScore >= 65 ? "positive" : score.qualityScore >= 45 ? "neutral" : "negative",
    description: `${score.grade} — Score ${score.qualityScore}/100 (Capital ${score.capitalScore} · Moat ${score.moatScore} · Salud ${score.healthScore})`,
  })

  // Factor: atractivo del precio
  factors.push({
    name: "Atractivo del precio",
    impact: score.priceScore >= 55 ? "positive" : score.priceScore >= 35 ? "neutral" : "negative",
    description: score.priceScore >= 55
      ? `Precio atractivo (${score.priceScore}/100) — múltiplos con descuento`
      : score.priceScore >= 35
        ? `Precio justo (${score.priceScore}/100) — sin gran descuento pero tampoco caro`
        : `Precio exigente (${score.priceScore}/100) — múltiplos elevados para el riesgo`,
  })

  // LAYER 2 — Ajuste por análisis forward (si disponible)
  let forwardScore: number | null = null
  if (forward) {
    forwardScore = forward.forwardScore

    const isForwardPositive = forwardScore >= 65 && forward.growthStage !== "declive"
    const isForwardNegative = forwardScore < 35 || forward.growthStage === "declive"

    if (isForwardNegative) {
      // Bloquear Compra Fuerte si la trayectoria es mala
      if (signal === "Compra Fuerte") {
        signal = "Compra"
      }
      factors.push({
        name: "Prospectiva",
        impact: "negative",
        description: `Trayectoria deteriorándose — ${forward.growthStageLabel}, earnings ${forward.earningsDirectionLabel}. Score forward ${forwardScore}/100.`,
      })
    } else if (isForwardPositive) {
      factors.push({
        name: "Prospectiva",
        impact: "positive",
        description: `Trayectoria sólida — ${forward.growthStageLabel}, earnings ${forward.earningsDirectionLabel}. Score forward ${forwardScore}/100.`,
      })
    }
  }

  // LAYER 3 — Ajuste por ciclo macro (si disponible y con suficiente confianza)
  let cycleFit: BrainOutput["cycleFit"] = "unknown"
  let sectorHeat = 5  // neutral por defecto
  let macroAdjustment: string | null = null
  const signalBeforeMacro = signal

  if (macro && macro.confidence >= 55) {
    sectorHeat = getSectorHeat(stock.sector, macro.phase)

    cycleFit =
      sectorHeat >= 8 ? "tailwind" :
      sectorHeat >= 5 ? "neutral"  : "headwind"

    const phaseLabel: Record<CyclePhase, string> = {
      recovery:  "Recuperación",
      expansion: "Expansión",
      late:      "Desaceleración",
      recession: "Recesión",
    }

    if (cycleFit === "tailwind") {
      // Ciclo favorece al sector — mejorar señal marginal
      if (signal === "Venta" && score.qualityScore >= 50) {
        signal = "Mantener"
        macroAdjustment = `Ciclo ${phaseLabel[macro.phase]} favorece al sector (heat ${sectorHeat}/10) — Venta moderada a Mantener.`
      } else if (signal === "Mantener" && score.qualityScore >= 60) {
        signal = "Compra"
        macroAdjustment = `Ciclo ${phaseLabel[macro.phase]} con viento de cola para el sector (heat ${sectorHeat}/10) — Mantener mejorado a Compra.`
      } else if (signal === "Compra" && stock.dropFrom52w <= -10) {
        signal = "Compra Fuerte"
        macroAdjustment = `Ciclo ${phaseLabel[macro.phase]} favorable + caída ${Math.abs(stock.dropFrom52w).toFixed(0)}% desde máximos — Compra confirmada como Compra Fuerte.`
      }

      if (cycleFit === "tailwind") {
        factors.push({
          name: "Ciclo macroeconómico",
          impact: "positive",
          description: `${phaseLabel[macro.phase]} (${macro.confidence}% confianza) — sector heat ${sectorHeat}/10. Viento de cola sectorial.`,
        })
      }
    } else if (cycleFit === "headwind") {
      // Ciclo adverso al sector — degradar señal con convicción
      if (signal === "Compra Fuerte") {
        signal = "Compra"
        macroAdjustment = `Ciclo ${phaseLabel[macro.phase]} adverso para el sector (heat ${sectorHeat}/10) — reducir convicción a Compra.`
      } else if (signal === "Compra" && score.qualityScore < 75) {
        signal = "Mantener"
        macroAdjustment = `Ciclo ${phaseLabel[macro.phase]} en contra del sector (heat ${sectorHeat}/10) — Compra moderada a Mantener.`
      } else if (signal === "Mantener" && score.qualityScore < 50) {
        signal = "Venta"
        macroAdjustment = `Ciclo ${phaseLabel[macro.phase]} adverso + negocio débil (heat ${sectorHeat}/10) — Mantener degradado a Venta.`
      }

      factors.push({
        name: "Ciclo macroeconómico",
        impact: "negative",
        description: `${phaseLabel[macro.phase]} (${macro.confidence}% confianza) — sector heat ${sectorHeat}/10. Viento en contra sectorial.`,
      })
    } else {
      // Neutral
      factors.push({
        name: "Ciclo macroeconómico",
        impact: "neutral",
        description: `${phaseLabel[macro.phase]} (${macro.confidence}% confianza) — sector heat ${sectorHeat}/10. Sin impacto diferencial.`,
      })
    }

    // "Venta Fuerte" con origen en fundamentales NO se revierte nunca
    if (score.signal === "Venta Fuerte" && signal !== "Venta Fuerte") {
      signal = "Venta Fuerte"
      macroAdjustment = null
    }
  }

  // LAYER 4 — Síntesis final
  const signalAdjusted = signal !== score.signal

  // Construir razón final compuesta
  const finalReason = macroAdjustment
    ? `${score.signalReason} ${macroAdjustment}`
    : score.signalReason

  // Calcular confianza total del cerebro
  // Base: 45 pts si no hay macro, 55 si hay macro con buena confianza
  let confidence = macro ? Math.min(55 + Math.round(macro.confidence * 0.20), 65) : 45

  // +10 si la señal es clara (extremos)
  if (signal === "Compra Fuerte" || signal === "Venta Fuerte") confidence += 10

  // +calidad del negocio contribuye hasta +15
  confidence += Math.round((score.qualityScore / 100) * 15)

  // +forward score contribuye hasta +10 si disponible
  if (forwardScore !== null) {
    confidence += Math.round((forwardScore / 100) * 10)
  }

  confidence = Math.min(confidence, 97)  // nunca 100% — siempre hay incertidumbre

  return {
    finalSignal:     signal,
    baseSignal:      score.signal,
    signalAdjusted,
    cycleFit,
    sectorHeat,
    macroAdjustment: signalBeforeMacro !== signal ? macroAdjustment : null,
    qualityScore:    score.qualityScore,
    priceScore:      score.priceScore,
    forwardScore,
    finalReason,
    factors,
    confidence,
  }
}
