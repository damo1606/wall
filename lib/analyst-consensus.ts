// Consenso de analistas — escenario de precios objetivo.
//
// Yahoo (`financialData`) entrega cuatro precios objetivo (low/mean/median/high),
// el número de analistas que cubren el valor y un rating agregado 1–5. Hasta ahora
// solo se leía la media, que colapsa toda la distribución en un número y esconde
// si los analistas están de acuerdo o divididos.
//
// Este módulo construye en su lugar un escenario de tres ramas —bajista / base /
// alcista— ponderado por el rating de consenso, y expone dispersión y confianza
// como medidas explícitas en vez de implícitas.

import {
  SCENARIO_WEIGHT_BEAR, SCENARIO_WEIGHT_BASE, SCENARIO_WEIGHT_BULL,
  SCENARIO_RATING_TILT, SCENARIO_WEIGHT_MIN, SCENARIO_WEIGHT_MAX,
  DISPERSION_TIGHT, DISPERSION_WIDE,
  RATING_BLEND_WEIGHT, CONSENSUS_CONFIDENCE_FLOOR,
} from "./constants"

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ScenarioKey = "bear" | "base" | "bull"

export type PriceScenario = {
  key: ScenarioKey
  label: string        // Bajista | Base | Alcista
  price: number
  upside: number       // % vs precio actual
  weight: number       // 0–1 — probabilidad implícita tras el sesgo por rating
  source: string       // campo de Yahoo del que sale
}

export type RatingLabel = "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL"

export type AnalystRating = {
  mean: number         // 1 (strong buy) – 5 (sell)
  label: RatingLabel
  key: string | null   // recommendationKey crudo de Yahoo
  score: number        // 0–100 — mean 1 → 100, 3 → 50, 5 → 0
}

export type DispersionLabel = "APRETADO" | "MODERADO" | "DISPERSO"

export type AnalystConsensus = {
  available: boolean               // false si no hay ningún precio objetivo
  count: number                    // analistas que cubren
  rating: AnalystRating | null
  scenarios: PriceScenario[]       // ordenados bajista → base → alcista
  base: PriceScenario | null
  expectedPrice: number | null     // media ponderada, contraída hacia la base según el acuerdo
  expectedUpside: number | null    // % vs precio actual
  dispersion: number | null        // (high − low) / base × 100
  dispersionLabel: DispersionLabel | null
  confidence: number               // 0–100 — cobertura × acuerdo
  consensusScore: number | null    // 0–100 para el scoring (null si no hay datos)
  tesis: string
}

export type AnalystConsensusInput = {
  currentPrice: number
  targetMean: number | null
  targetMedian: number | null
  targetHigh: number | null
  targetLow: number | null
  analystCount: number
  recommendationMean: number | null
  recommendationKey?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}

// Interpola linealmente entre cuatro breakpoints (misma convención que scoring.ts)
function lerp(v: number, bp: [number, number, number, number], out: [number, number, number, number]): number {
  if (v <= bp[0]) return out[0]
  if (v >= bp[3]) return out[3]
  for (let i = 0; i < 3; i++) {
    if (v <= bp[i + 1]) {
      const t = (v - bp[i]) / (bp[i + 1] - bp[i])
      return out[i] + t * (out[i + 1] - out[i])
    }
  }
  return out[3]
}

// Un precio objetivo solo es utilizable si es un número positivo real.
function usable(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0
}

function round2(v: number) { return parseFloat(v.toFixed(2)) }
function round1(v: number) { return parseFloat(v.toFixed(1)) }

export function ratingLabel(mean: number): RatingLabel {
  if (mean <= 1.5) return "STRONG BUY"
  if (mean <= 2.5) return "BUY"
  if (mean <= 3.5) return "HOLD"
  if (mean <= 4.5) return "SELL"
  return "STRONG SELL"
}

// ── Motor ─────────────────────────────────────────────────────────────────────

const EMPTY: AnalystConsensus = {
  available: false,
  count: 0,
  rating: null,
  scenarios: [],
  base: null,
  expectedPrice: null,
  expectedUpside: null,
  dispersion: null,
  dispersionLabel: null,
  confidence: 0,
  consensusScore: null,
  tesis: "Sin cobertura de analistas.",
}

export function buildAnalystConsensus(input: AnalystConsensusInput): AnalystConsensus {
  const { currentPrice, targetMean, targetMedian, targetHigh, targetLow } = input
  const count = Math.max(0, Math.round(input.analystCount ?? 0))

  if (!usable(currentPrice)) return { ...EMPTY, count }

  // Base = mediana si existe (robusta a un outlier que arrastre la media),
  // con la media como alternativa.
  const basePrice = usable(targetMedian) ? targetMedian : usable(targetMean) ? targetMean : null
  if (basePrice === null) return { ...EMPTY, count }

  const upsideOf = (p: number) => round1(((p - currentPrice) / currentPrice) * 100)

  // ── Rating de consenso ──────────────────────────────────────────────────────
  const recMean = input.recommendationMean
  const rating: AnalystRating | null =
    typeof recMean === "number" && Number.isFinite(recMean) && recMean >= 1 && recMean <= 5
      ? {
          mean: round2(recMean),
          label: ratingLabel(recMean),
          key: input.recommendationKey ?? null,
          score: clamp(((5 - recMean) / 4) * 100),
        }
      : null

  // ── Escenarios ──────────────────────────────────────────────────────────────
  // Solo hay tres ramas si Yahoo publica el rango completo. Si falta high o low,
  // el escenario degrada a una sola rama base con peso 1 — es honesto: no hay
  // distribución que ponderar.
  const hasRange = usable(targetHigh) && usable(targetLow) && targetHigh > targetLow

  // El rating inclina peso entre bajista y alcista: 3.0 es neutro, 1.0 vuelca al
  // alcista, 5.0 al bajista. Sin rating, la distribución queda simétrica.
  const tilt = rating ? (3 - rating.mean) / 2 : 0            // +1 … −1
  const shift = SCENARIO_RATING_TILT * tilt

  let wBear = clamp(SCENARIO_WEIGHT_BEAR - shift, SCENARIO_WEIGHT_MIN, SCENARIO_WEIGHT_MAX)
  let wBull = clamp(SCENARIO_WEIGHT_BULL + shift, SCENARIO_WEIGHT_MIN, SCENARIO_WEIGHT_MAX)
  let wBase = clamp(SCENARIO_WEIGHT_BASE, SCENARIO_WEIGHT_MIN, SCENARIO_WEIGHT_MAX)

  // Renormaliza — los clamps pueden romper la suma a 1.
  const wSum = wBear + wBase + wBull
  wBear /= wSum; wBase /= wSum; wBull /= wSum

  const scenarios: PriceScenario[] = []

  if (hasRange) {
    scenarios.push({
      key: "bear", label: "Bajista",
      price: round2(targetLow), upside: upsideOf(targetLow),
      weight: round2(wBear), source: "targetLowPrice",
    })
  }

  scenarios.push({
    key: "base", label: "Base",
    price: round2(basePrice),
    upside: upsideOf(basePrice),
    weight: hasRange ? round2(wBase) : 1,
    source: usable(targetMedian) ? "targetMedianPrice" : "targetMeanPrice",
  })

  if (hasRange) {
    scenarios.push({
      key: "bull", label: "Alcista",
      price: round2(targetHigh), upside: upsideOf(targetHigh),
      weight: round2(wBull), source: "targetHighPrice",
    })
  }

  const base = scenarios.find(s => s.key === "base") ?? null

  // ── Dispersión ──────────────────────────────────────────────────────────────
  const dispersion = hasRange ? round1(((targetHigh - targetLow) / basePrice) * 100) : null
  const dispersionLabel: DispersionLabel | null =
    dispersion === null ? null :
    dispersion < DISPERSION_TIGHT ? "APRETADO" :
    dispersion < DISPERSION_WIDE  ? "MODERADO" : "DISPERSO"

  // ── Confianza ───────────────────────────────────────────────────────────────
  // Cobertura (cuántos analistas) × acuerdo (qué de juntos están sus targets).
  // Sin rango publicado el acuerdo es desconocido, no bueno → 50 neutro.
  const coverageScore = lerp(count, [0, 3, 10, 25], [0, 40, 80, 100])
  const agreementScore = dispersion === null
    ? 50
    : lerp(-dispersion, [-100, -60, -30, -15], [0, 30, 70, 100])
  const confidence = Math.round(clamp(0.5 * coverageScore + 0.5 * agreementScore))

  // ── Valor esperado ──────────────────────────────────────────────────────────
  // Media ponderada por los pesos, CONTRAÍDA hacia el escenario base en función
  // de cuánto coinciden los analistas.
  //
  // Sin la contracción, un rango asimétrico con un outlier arrastra el valor
  // esperado por encima de todos los objetivos de consenso: con NVDA (mediana
  // $300, media $303, alto $500) la media ponderada daba $361, un precio que
  // ningún analista sostiene como caso central. Peor aún, el sesgo escalaba con
  // la amplitud del rango, así que la discrepancia entre analistas acababa
  // SUBIENDO el upside en vez de castigarlo.
  //
  // El acuerdo decide cuánta información aporta el rango: si los objetivos están
  // juntos se respeta la media ponderada; si están disparados el rango es ruido
  // y el mejor estimador es la mediana.
  const shrink = agreementScore / 100
  const weightedPrice = hasRange
    ? wBear * targetLow + wBase * basePrice + wBull * targetHigh
    : basePrice
  const expectedPrice = round2(basePrice + (weightedPrice - basePrice) * shrink)
  const expectedUpside = upsideOf(expectedPrice)

  // ── Score para el pilar Precio ──────────────────────────────────────────────
  // Mismo tramo de upside que usaba scoring.ts, pero sobre el upside ESPERADO
  // del escenario (no la media cruda), mezclado con el rating y atenuado por la
  // confianza. El suelo evita que una cobertura pobre anule la señal del todo.
  const upsideScore = clamp(lerp(expectedUpside, [-10, 0, 15, 35], [0, 20, 60, 100]))
  const blended = rating
    ? upsideScore * (1 - RATING_BLEND_WEIGHT) + rating.score * RATING_BLEND_WEIGHT
    : upsideScore
  const confidenceFactor = CONSENSUS_CONFIDENCE_FLOOR + (1 - CONSENSUS_CONFIDENCE_FLOOR) * (confidence / 100)
  const consensusScore = Math.round(clamp(blended * confidenceFactor))

  return {
    available: true,
    count,
    rating,
    scenarios,
    base,
    expectedPrice,
    expectedUpside,
    dispersion,
    dispersionLabel,
    confidence,
    consensusScore,
    tesis: buildTesis({ count, rating, expectedUpside, dispersion, dispersionLabel, hasRange, scenarios }),
  }
}

// ── Narrativa ─────────────────────────────────────────────────────────────────

function buildTesis(a: {
  count: number
  rating: AnalystRating | null
  expectedUpside: number
  dispersion: number | null
  dispersionLabel: DispersionLabel | null
  hasRange: boolean
  scenarios: PriceScenario[]
}): string {
  const parts: string[] = []

  const cobertura = a.count > 0
    ? `${a.count} ${a.count === 1 ? "analista" : "analistas"}`
    : "cobertura no reportada"

  if (a.rating) {
    parts.push(`Consenso ${a.rating.label} (${a.rating.mean.toFixed(1)}/5) con ${cobertura}`)
  } else {
    parts.push(`Precio objetivo con ${cobertura}, sin rating agregado`)
  }

  const signo = a.expectedUpside >= 0 ? "+" : ""
  parts.push(`valor esperado ${signo}${a.expectedUpside.toFixed(1)}% vs precio actual`)

  if (a.hasRange && a.dispersion !== null) {
    const bear = a.scenarios.find(s => s.key === "bear")
    const bull = a.scenarios.find(s => s.key === "bull")
    if (bear && bull) {
      parts.push(`rango $${bear.price.toFixed(2)}–$${bull.price.toFixed(2)} (${a.dispersion.toFixed(0)}% de amplitud, ${(a.dispersionLabel ?? "").toLowerCase()})`)
    }
  } else {
    parts.push("Yahoo no publica rango alto/bajo — escenario de una sola rama")
  }

  if (a.dispersionLabel === "DISPERSO") {
    parts.push("los analistas no están de acuerdo: trata el objetivo base con cautela")
  }
  if (a.count > 0 && a.count < 3) {
    parts.push("cobertura escasa — señal poco fiable")
  }

  return parts.join(" · ") + "."
}
