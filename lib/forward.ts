// Análisis prospectivo del negocio — anticipa la trayectoria futura
// Basado en señales de crecimiento, dirección de earnings, apalancamiento operativo,
// riesgo de disrupción sectorial y señal de sostenibilidad del moat (CAP)

import type { StockData } from "./yahoo"

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type GrowthStage =
  | "hypercrecimiento"  // Revenue YoY > 20%
  | "expansion"         // 10–20%
  | "madurez"           // 4–10%
  | "estancamiento"     // 0–4%
  | "declive"           // < 0%

export type EarningsDirection =
  | "acelerando"        // Earnings futuros estimados crecen respecto al trailing
  | "creciendo"         // Crecimiento positivo pero moderado
  | "estable"           // Sin cambio significativo
  | "desacelerando"     // Earnings futuros más bajos que trailing
  | "contrayendo"       // Earnings futuros negativos o muy inferiores

export type CapSignal =
  | "fortaleciendo"     // Márgenes expandiéndose + ROIC alto + crecimiento acelerado
  | "estable"           // Sin señales claras de cambio
  | "debilitando"       // Márgenes comprimidos o crecimiento decelerando con ROIC cayendo

export type ForwardAnalysis = {
  growthStage:           GrowthStage
  growthStageLabel:      string
  growthStageColor:      string

  earningsDirection:     EarningsDirection
  earningsDirectionLabel: string
  earningsDirectionColor: string

  operatingLeverage:     "positivo" | "neutro" | "negativo"
  operatingLeverageLabel: string

  capSignal:             CapSignal
  capSignalLabel:        string
  capSignalColor:        string

  disruption:            DisruptionProfile
  forwardScore:          number    // 0–100
  forwardGrade:          string    // A+, A, B, C, D
  signals:               string[]  // narrativa de las señales detectadas
}

export type DisruptionProfile = {
  risk:         1 | 2 | 3 | 4 | 5   // 1=muy bajo … 5=crítico
  label:        string
  color:        string
  threats:      string[]
  opportunities: string[]
}

// ─── Disruption Risk por sector ───────────────────────────────────────────────

const DISRUPTION_BY_SECTOR: Record<string, DisruptionProfile> = {
  "Technology": {
    risk: 3, label: "Moderado",
    color: "text-yellow-400",
    threats: [
      "IA generativa reemplaza software de productividad (riesgo directo para Adobe, Figma)",
      "Comoditización de hardware por open-source (RISC-V vs x86)",
      "Regulación antimonopolio en buscadores, tiendas de apps y cloud",
    ],
    opportunities: [
      "Los líderes con infraestructura AI (MSFT, NVDA, GOOGL) son los principales beneficiarios",
      "Efecto multiplicador: IA reduce costos de desarrollo y expande TAM",
    ],
  },
  "Healthcare": {
    risk: 3, label: "Moderado",
    color: "text-yellow-400",
    threats: [
      "Vencimiento de patentes expone revenues a competencia de genéricos/biosimilares",
      "GLP-1 (Ozempic/Wegovy) disrupta industria de diabetes, obesidad y cardiovascular",
      "Negociación de precios del gobierno (Inflation Reduction Act en EEUU)",
    ],
    opportunities: [
      "Diagnóstico por IA, medicina de precisión y CRISPR abren nuevos mercados enormes",
      "Envejecimiento poblacional: demanda estructural creciente durante décadas",
    ],
  },
  "Financial Services": {
    risk: 3, label: "Moderado",
    color: "text-yellow-400",
    threats: [
      "Fintechs (Stripe, Wise, Nubank) erosionan márgenes en pagos y préstamos personales",
      "Criptomonedas y DeFi amenazan intermediación bancaria a largo plazo",
      "IA en underwriting reduce la ventaja de escala de los grandes bancos",
    ],
    opportunities: [
      "Los grandes bancos con datos masivos lideran implementación de IA en finanzas",
      "Tasas altas mejoran NIM (net interest margin) — cíclicamente favorable",
    ],
  },
  "Consumer Discretionary": {
    risk: 4, label: "Alto",
    color: "text-orange-400",
    threats: [
      "Amazon y Temu compiten por precio en retail físico — margen estructuralmente presionado",
      "Cambio generacional hacia experiencias vs bienes materiales reduce demanda de productos",
      "Inflación comprime el ingreso disponible del consumidor middle-class",
    ],
    opportunities: [
      "Marcas premium y luxury mantienen pricing power en consumidor de alto ingreso",
      "E-commerce propio (D2C) mejora márgenes eliminando intermediarios",
    ],
  },
  "Consumer Staples": {
    risk: 2, label: "Bajo",
    color: "text-green-400",
    threats: [
      "Marcas blancas de retailers (Costco Kirkland, Walmart Great Value) ganan share",
      "Consumidores migran hacia productos orgánicos/saludables — presiona marcas legadas",
      "Costos de materias primas (commodities) volátiles comprimen márgenes",
    ],
    opportunities: [
      "Demanda inelástica protege revenues en recesiones — sector defensivo por naturaleza",
      "Poder de pricing en marcas con >100 años de historia (KO, PG, PM)",
    ],
  },
  "Industrials": {
    risk: 3, label: "Moderado",
    color: "text-yellow-400",
    threats: [
      "Electrificación industrial (EVs, motores eléctricos) reduce demanda de equipos de combustión",
      "Automatización y robótica disrupta manufactura tradicional intensiva en labor",
      "Nearshoring reordena cadenas de suministro globales — ganadores y perdedores claros",
    ],
    opportunities: [
      "Infraestructura de IA (datacenters, redes eléctricas) requiere masiva inversión industrial",
      "Defensa y aeroespacial: gasto gubernamental en aumento por tensiones geopolíticas",
    ],
  },
  "Energy": {
    risk: 4, label: "Alto",
    color: "text-orange-400",
    threats: [
      "Transición energética acelera adopción de renovables — demanda de petróleo pico en ~2030",
      "Volatilidad del precio del barril destruye capital en empresas con breakeven alto",
      "Presión ESG reduce acceso a capital para upstream oil & gas",
    ],
    opportunities: [
      "Gas natural como puente energético — demanda firme durante la transición 20-30 años",
      "Empresas integradas con bajo costo de producción (<$40/barril) son resilientes",
    ],
  },
  "Communication Services": {
    risk: 3, label: "Moderado",
    color: "text-yellow-400",
    threats: [
      "IA generativa amenaza el modelo de búsqueda pagada (Google) — zero-click queries",
      "Saturación de streaming — mercado maduro con guerra de precios y churn alto",
      "Regulación de plataformas en EEUU y UE limita crecimiento inorgánico",
    ],
    opportunities: [
      "META y GOOGL son los mayores beneficiarios de IA en publicidad dirigida",
      "Monetización de IA generativa abre nuevas líneas de revenue en search y social",
    ],
  },
  "Utilities": {
    risk: 2, label: "Bajo",
    color: "text-green-400",
    threats: [
      "Solar distribuida (paneles residenciales) reduce demanda de red en zonas soleadas",
      "Tasas de interés altas aumentan costo de deuda — sector muy apalancado",
    ],
    opportunities: [
      "Electrificación total de la economía (EVs, heating, AI datacenters) aumenta demanda masivamente",
      "Regulación garantiza retornos estables — negocio cuasi-monopolio protegido",
    ],
  },
  "Real Estate": {
    risk: 3, label: "Moderado",
    color: "text-yellow-400",
    threats: [
      "Trabajo remoto permanente reduce demanda de oficinas — sector office REITs en crisis estructural",
      "E-commerce destruye retail físico (mall REITs) aunque industrial/logística compensa",
      "Tasas altas de largo plazo comprimen las valuaciones de REITs (compiten con bonos)",
    ],
    opportunities: [
      "Data centers, torres de telecom e infraestructura digital: los REITs de mayor crecimiento",
      "Residencial en ciudades con restricción de oferta — apreciación estructural a largo plazo",
    ],
  },
  "Basic Materials": {
    risk: 3, label: "Moderado",
    color: "text-yellow-400",
    threats: [
      "China desacelera — mayor consumidor mundial de materiales básicos impacta precios",
      "Sustitución de materiales: plásticos reciclados, materiales compuestos vs metales",
    ],
    opportunities: [
      "Transición energética requiere cobre, litio, cobalto y tierras raras en cantidades masivas",
      "Superciclo de commodities si demanda de IA/EVs supera expectativas actuales",
    ],
  },
}

const DEFAULT_DISRUPTION: DisruptionProfile = {
  risk: 3, label: "Moderado",
  color: "text-yellow-400",
  threats: ["Sin datos sectoriales — evaluar manualmente"],
  opportunities: ["Sin datos sectoriales — evaluar manualmente"],
}

// ─── Funciones de análisis ─────────────────────────────────────────────────────

function growthStageOf(revGrowth: number): { stage: GrowthStage; label: string; color: string } {
  if (revGrowth > 0.20) return { stage: "hypercrecimiento", label: "Hypercrecimiento  +20%", color: "text-emerald-400" }
  if (revGrowth > 0.10) return { stage: "expansion",        label: "Expansión  10–20%",      color: "text-green-400" }
  if (revGrowth > 0.04) return { stage: "madurez",          label: "Madurez  4–10%",          color: "text-blue-400" }
  if (revGrowth >= 0)   return { stage: "estancamiento",    label: "Estancamiento  0–4%",     color: "text-yellow-400" }
  return                       { stage: "declive",          label: "Declive  <0%",            color: "text-red-400" }
}

function earningsDirectionOf(
  pe: number, forwardPe: number,
  earningsGrowth: number, earningsQuarterlyGrowth: number
): { direction: EarningsDirection; label: string; color: string } {
  // Señal 1: PE compression/expansion (pe > forwardPe → earnings creciendo)
  const peSignal = (pe > 0 && forwardPe > 0) ? pe / forwardPe : null

  // Señal 2: trailing YoY annual
  // Señal 3: quarterly YoY (más reciente)
  const quarterly = earningsQuarterlyGrowth
  const annual = earningsGrowth

  // Combinar señales: dar más peso a la más reciente (quarterly)
  const combined = quarterly !== 0 ? quarterly * 0.6 + annual * 0.4 : annual

  if (peSignal !== null && peSignal > 1.15 && combined > 0.10)
    return { direction: "acelerando",    label: "Acelerando ↑↑",    color: "text-emerald-400" }
  if ((peSignal !== null && peSignal > 1.04) || combined > 0.05)
    return { direction: "creciendo",     label: "Creciendo ↑",      color: "text-green-400" }
  if ((peSignal === null || (peSignal > 0.96 && peSignal < 1.04)) && Math.abs(combined) <= 0.05)
    return { direction: "estable",       label: "Estable →",        color: "text-gray-400" }
  if ((peSignal !== null && peSignal < 0.90) || combined < -0.10)
    return { direction: "contrayendo",   label: "Contrayendo ↓↓",   color: "text-red-400" }
  return   { direction: "desacelerando", label: "Desacelerando ↓",  color: "text-orange-400" }
}

function operatingLeverageOf(earningsGrowth: number, revenueGrowth: number): {
  lev: "positivo" | "neutro" | "negativo"; label: string
} {
  if (revenueGrowth <= 0 && earningsGrowth <= 0)
    return { lev: "negativo", label: "Negativo — revenue y earnings contrayendo" }
  if (revenueGrowth <= 0 && earningsGrowth > 0)
    return { lev: "positivo", label: "Positivo — recorte de costos mejora earnings" }
  const diff = earningsGrowth - revenueGrowth
  if (diff > 0.05)  return { lev: "positivo", label: "Positivo — earnings crecen más rápido que revenue" }
  if (diff < -0.08) return { lev: "negativo", label: "Negativo — márgenes comprimiéndose" }
  return              { lev: "neutro",   label: "Neutro — márgenes estables" }
}

function capSignalOf(
  roic: number, grossMargin: number, operatingMargin: number,
  earningsGrowth: number, revenueGrowth: number, sector: string
): { signal: CapSignal; label: string; color: string } {
  // ROIC threshold depende del sector
  const roicThreshold = ["Energy", "Utilities", "Real Estate"].includes(sector) ? 0.08 : 0.12

  const roicStrong = roic >= roicThreshold * 1.5
  const marginExpanding = earningsGrowth > revenueGrowth + 0.03
  const marginCompressing = earningsGrowth < revenueGrowth - 0.08
  const growthPositive = revenueGrowth > 0.05
  const earningsPositive = earningsGrowth > 0.05

  if (roicStrong && marginExpanding && growthPositive)
    return { signal: "fortaleciendo", label: "Moat fortaleciendo — ROIC alto + márgenes expandiéndose", color: "text-emerald-400" }
  if (roicStrong && earningsPositive && !marginCompressing)
    return { signal: "estable",       label: "Moat estable — ROIC sobre umbral, sin señales de erosión", color: "text-blue-400" }
  if (marginCompressing || (!roicStrong && roic > 0 && earningsGrowth < 0))
    return { signal: "debilitando",   label: "Señales de erosión — márgenes cayendo o ROIC bajo umbral", color: "text-orange-400" }
  return { signal: "estable", label: "Moat estable — insuficientes señales de cambio", color: "text-blue-400" }
}

// ─── Función principal ─────────────────────────────────────────────────────────

export function analyzeForward(stock: StockData): ForwardAnalysis {
  const gs = growthStageOf(stock.revenueGrowth)
  const ed = earningsDirectionOf(stock.pe, stock.forwardPe, stock.earningsGrowth, stock.earningsQuarterlyGrowth)
  const ol = operatingLeverageOf(stock.earningsGrowth, stock.revenueGrowth)
  const cs = capSignalOf(stock.roic, stock.grossMargin, stock.operatingMargin, stock.earningsGrowth, stock.revenueGrowth, stock.sector)
  const disruption = DISRUPTION_BY_SECTOR[stock.sector] ?? DEFAULT_DISRUPTION

  // ── Forward Score (0–100) ──────────────────────────────────────────────────
  const growthPts: Record<GrowthStage, number> = {
    hypercrecimiento: 100, expansion: 82, madurez: 60, estancamiento: 35, declive: 12,
  }
  const earningsPts: Record<EarningsDirection, number> = {
    acelerando: 100, creciendo: 78, estable: 55, desacelerando: 30, contrayendo: 10,
  }
  const leveragePts = { positivo: 100, neutro: 58, negativo: 18 }
  const disruptionPts = { 1: 100, 2: 80, 3: 55, 4: 28, 5: 8 }
  const capPts: Record<CapSignal, number> = { fortaleciendo: 100, estable: 60, debilitando: 20 }

  const forwardScore = Math.round(
    growthPts[gs.stage]        * 0.30 +
    earningsPts[ed.direction]  * 0.28 +
    leveragePts[ol.lev]        * 0.18 +
    disruptionPts[disruption.risk] * 0.14 +
    capPts[cs.signal]          * 0.10
  )

  const forwardGrade =
    forwardScore >= 82 ? "A+" :
    forwardScore >= 67 ? "A"  :
    forwardScore >= 52 ? "B"  :
    forwardScore >= 37 ? "C"  : "D"

  // ── Narrativa ─────────────────────────────────────────────────────────────
  const signals: string[] = []

  if (gs.stage === "hypercrecimiento") signals.push(`Revenue creciendo ${(stock.revenueGrowth * 100).toFixed(0)}% YoY — fase de hypercrecimiento`)
  else if (gs.stage === "declive")     signals.push(`Revenue cayendo ${(stock.revenueGrowth * 100).toFixed(1)}% — negocio en declive`)
  else                                 signals.push(`Revenue +${(stock.revenueGrowth * 100).toFixed(1)}% YoY — ${gs.label}`)

  if (ed.direction === "acelerando")  signals.push("Earnings acelerando: forward P/E sugiere crecimiento de >15% en próximos 12m")
  else if (ed.direction === "contrayendo") signals.push("Earnings contrayendo: forward P/E implica caída en beneficios futuros")

  if (ol.lev === "positivo") signals.push("Apalancamiento operativo positivo — cada % de revenue genera >1% en earnings")
  if (ol.lev === "negativo") signals.push("Márgenes bajo presión — revenue creciendo pero earnings no siguen el ritmo")

  if (cs.signal === "fortaleciendo") signals.push("Ventaja competitiva fortaleciendo — ROIC alto + márgenes en expansión")
  if (cs.signal === "debilitando")   signals.push("Señales de erosión del moat — vigilar márgenes y ROIC en próximos trimestres")

  if (disruption.risk >= 4) signals.push(`Riesgo de disrupción ${disruption.label.toLowerCase()} en sector ${stock.sector}`)

  if (stock.pe > 0 && stock.forwardPe > 0 && stock.pe / stock.forwardPe > 1.15)
    signals.push(`P/E forward (${stock.forwardPe.toFixed(1)}x) muy inferior al trailing (${stock.pe.toFixed(1)}x) — mercado anticipa crecimiento fuerte`)

  return {
    growthStage: gs.stage, growthStageLabel: gs.label, growthStageColor: gs.color,
    earningsDirection: ed.direction, earningsDirectionLabel: ed.label, earningsDirectionColor: ed.color,
    operatingLeverage: ol.lev, operatingLeverageLabel: ol.label,
    capSignal: cs.signal, capSignalLabel: cs.label, capSignalColor: cs.color,
    disruption,
    forwardScore,
    forwardGrade,
    signals,
  }
}
