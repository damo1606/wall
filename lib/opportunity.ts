// Motor de Oportunidades — capa de síntesis para el objetivo del proyecto:
// aprovechar oportunidades en el mercado de valores (comprar barato, vender caro).
//
// Fusiona las señales que wall YA calcula (no recalcula nada) en un único score
// 0-100 que prioriza dónde mirar primero. No es una garantía de retorno: ordena
// candidatas, la decisión final es del usuario.
//
// Las señales de entrada son un subconjunto de ConvictionRow (app/api/scanner-pro),
// que es exactamente el payload almacenado en methodology_snapshots.

export type OpportunityBucket = "comprar" | "vender" | "neutral"

export type OpportunitySignals = {
  buyScore: number          // 0-100  — calidad + precio fundamental (lib/scoring.ts)
  convictionScore: number   // 0-100  — fundamental + institucional agregado (M7)
  m7Score: number           // -100..+100 — veredicto institucional GEX (M7)
  soreGate: "GO" | "WAIT" | "AVOID"
  dropFrom52w: number       // %      — distancia a máximos de 52s (negativo)
  discountToGraham: number  // %      — vs Graham Number (positivo = barato)
  upsideToTarget: number    // %      — recorrido hasta el target de analistas
  pe: number
  /** Percentil 0-100 de carestía vs su propia historia (alto = caro). Fase 2. */
  historicalPercentile?: number
}

export type OpportunityResult = {
  opportunityScore: number  // 0-100 — magnitud de la oportunidad dentro de su bucket
  bucket: OpportunityBucket
  tesis: string             // una línea explicando por qué
}

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v))

// Mapea linealmente un valor de [lo, hi] a [0, 100].
function mapRange(v: number, lo: number, hi: number): number {
  if (hi === lo) return 50
  return clamp(((v - lo) / (hi - lo)) * 100)
}

// "Atractivo de compra" 0-100: qué tan barata y sólida luce la acción hoy.
// buyScore ya combina calidad + precio; descuento y upside lo refuerzan.
function cheapness(s: OpportunitySignals): number {
  const graham = mapRange(s.discountToGraham, -40, 60)  // 60%+ de descuento = tope
  const upside = mapRange(s.upsideToTarget, -10, 50)     // 50%+ de upside = tope
  return clamp(0.60 * s.buyScore + 0.22 * graham + 0.18 * upside)
}

// Timing institucional 0-100: veredicto M7 normalizado + convicción + bonus SORE.
function timing(s: OpportunitySignals): number {
  const m7Norm = mapRange(s.m7Score, -100, 100)
  const base = 0.70 * m7Norm + 0.30 * s.convictionScore
  const soreBonus = s.soreGate === "GO" ? 8 : s.soreGate === "AVOID" ? -8 : 0
  return clamp(base + soreBonus)
}

function buildTesis(s: OpportunitySignals, bucket: OpportunityBucket): string {
  const parts: string[] = []

  if (bucket === "comprar") {
    if (s.discountToGraham > 15) parts.push(`${s.discountToGraham.toFixed(0)}% bajo valor Graham`)
    if (s.upsideToTarget > 10) parts.push(`+${s.upsideToTarget.toFixed(0)}% de upside a target`)
    if (s.dropFrom52w < -15) parts.push(`${Math.abs(s.dropFrom52w).toFixed(0)}% bajo máximos de 52s`)
    if (s.historicalPercentile !== undefined && s.historicalPercentile <= 25)
      parts.push(`más barata que el ${(100 - s.historicalPercentile).toFixed(0)}% de su propia historia`)
    if (parts.length === 0) parts.push(`fundamentales sólidos (buyScore ${s.buyScore})`)
    return `Compra — ${parts.slice(0, 3).join(" · ")}.`
  }

  if (bucket === "vender") {
    if (s.pe > 30) parts.push(`PE ${s.pe.toFixed(0)} exigente`)
    if (s.upsideToTarget < 0) parts.push(`cotiza por encima del target de analistas`)
    if (s.discountToGraham < -10) parts.push(`${Math.abs(s.discountToGraham).toFixed(0)}% sobre valor Graham`)
    if (s.historicalPercentile !== undefined && s.historicalPercentile >= 75)
      parts.push(`más cara que el ${s.historicalPercentile.toFixed(0)}% de su propia historia`)
    if (parts.length === 0) parts.push(`fundamentales débiles (buyScore ${s.buyScore})`)
    return `Venta — ${parts.slice(0, 3).join(" · ")}.`
  }

  return `Neutral — sin sesgo claro de compra o venta.`
}

// Punto de entrada del motor: una OpportunitySignals → un OpportunityResult.
export function computeOpportunityScore(s: OpportunitySignals): OpportunityResult {
  const cheap = cheapness(s)
  const time = timing(s)

  // Carestía histórica (Fase 2). Sin dato → 50 (neutral).
  const histPct = s.historicalPercentile ?? 50
  const histCheap = 100 - histPct   // percentil bajo de PE = barata vs su historia

  // Bucket: comprar si luce barata y el institucional no está en contra fuerte;
  // vender si luce cara/débil y hay confirmación (timing, sin upside, o cara vs historia).
  let bucket: OpportunityBucket
  if (cheap >= 60 && s.m7Score >= -25) {
    bucket = "comprar"
  } else if (cheap <= 40 && (s.m7Score < -15 || s.upsideToTarget < 0 || histPct >= 70)) {
    bucket = "vender"
  } else {
    bucket = "neutral"
  }

  let opportunityScore: number
  if (bucket === "vender") {
    // Cuanto más cara y peor el timing, mayor la oportunidad de VENTA.
    opportunityScore =
      0.45 * (100 - cheap) +
      0.25 * histPct +
      0.20 * (100 - time) +
      0.10 * (s.upsideToTarget < 0 ? 100 : 40)
  } else {
    // comprar y neutral se rankean por atractivo de compra.
    opportunityScore =
      0.45 * cheap +
      0.25 * histCheap +
      0.20 * time +
      0.10 * (s.soreGate === "GO" ? 100 : 50)
  }

  return {
    opportunityScore: Math.round(clamp(opportunityScore)),
    bucket,
    tesis: buildTesis(s, bucket),
  }
}
