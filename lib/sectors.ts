// Perfiles sectoriales basados en datos empíricos de Damodaran (enero 2025)
// Fuente: pages.stern.nyu.edu/~adamodar/
// Actualizado: abril 2026 — refleja impacto IA en Tech/Comms, GLP-1 en Healthcare,
//              tasas altas en Financials, superciclo capex en Industrials
//
// Breakpoints: [terrible, mediocre, bueno, excelente] → output [0, 25, 65, 100]
// Todos los valores en % (ej: 40 = 40%)

export type CyclePhase = "recovery" | "expansion" | "late" | "recession"

export type SectorConfig = {
  label: string
  yahooNames: string[]
  moatType: string           // Tipo de moat dominante en el sector
  capRange: string           // Rango típico del CAP (años de ventaja sostenible)
  // Breakpoints de márgenes (en %)
  grossMarginBp:     [number, number, number, number]
  operatingMarginBp: [number, number, number, number]
  netMarginBp:       [number, number, number, number]
  // Breakpoints de retorno de capital (en %)
  roicBp:            [number, number, number, number]
  roeBp:             [number, number, number, number]
  // Breakpoints de crecimiento de revenue (en %)
  revenueGrowthBp:   [number, number, number, number]
  // Pesos del pilar Moat para este sector (deben sumar 1.0)
  grossMarginWeight:     number
  operatingMarginWeight: number
  netMarginWeight:       number
  // Atractivo del sector en cada fase del ciclo económico (1-10)
  // 1-4 = headwind, 5-7 = neutral, 8-10 = tailwind
  cycleScores: Record<CyclePhase, number>
}

const SECTORS: SectorConfig[] = [
  {
    label: "Tecnología",
    yahooNames: ["Technology"],
    moatType: "Switching costs + Network effects",
    capRange: "10–20 años",
    // IA elevó el techo de márgenes: hyperscalers + SaaS puro > 85% gross
    grossMarginBp:     [20, 48, 68, 88],
    operatingMarginBp: [ 0, 10, 24, 38],
    netMarginBp:       [ 0,  8, 20, 33],
    // ROIC muy alto post-IA — líderes generan >40% ROIC
    roicBp:            [ 0,  8, 20, 40],
    roeBp:             [ 0, 10, 24, 45],
    revenueGrowthBp:   [ 0,  5, 15, 25],
    grossMarginWeight:     0.45,
    operatingMarginWeight: 0.35,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 5, expansion: 9, late: 3, recession: 5 },
  },
  {
    label: "Salud",
    yahooNames: ["Healthcare"],
    moatType: "Patentes + Aprobación regulatoria (FDA/EMA)",
    capRange: "7–20 años (vida útil de patente)",
    // GLP-1 (Novo, Lilly) elevó el techo — farmacéutica líder tiene márgenes excepcionalmente altos
    grossMarginBp:     [20, 48, 68, 88],
    operatingMarginBp: [ 0, 10, 22, 36],
    netMarginBp:       [ 0,  8, 18, 32],
    roicBp:            [ 0,  7, 16, 32],
    roeBp:             [ 0, 11, 22, 40],
    revenueGrowthBp:   [ 0,  4, 12, 22],
    // Operating margin pesa igual que gross — R&D es clave
    grossMarginWeight:     0.40,
    operatingMarginWeight: 0.40,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 5, expansion: 5, late: 8, recession: 9 },
  },
  {
    label: "Servicios Financieros",
    yahooNames: ["Financial Services"],
    moatType: "Escala + Regulación + Red de distribución",
    capRange: "10–20 años",
    // Tasas altas 2022-2025 mejoraron NIM y rentabilidad bancaria estructuralmente
    grossMarginBp:     [ 0, 22, 44, 64],
    operatingMarginBp: [ 0, 18, 32, 46],
    netMarginBp:       [ 0, 14, 25, 38],
    // ROE bancario mejoró con tasas altas — JP Morgan, GS superan 15%
    roicBp:            [ 0,  7, 14, 24],
    roeBp:             [ 0, 10, 16, 26],
    revenueGrowthBp:   [ 0,  3,  8, 14],
    // Operating y net margin pesan más que gross en financieros
    grossMarginWeight:     0.15,
    operatingMarginWeight: 0.45,
    netMarginWeight:       0.40,
    cycleScores: { recovery: 9, expansion: 8, late: 5, recession: 2 },
  },
  {
    label: "Consumo Defensivo",
    yahooNames: ["Consumer Defensive"],
    moatType: "Marca + Distribución masiva + Hábito del consumidor",
    capRange: "20–50 años",
    // Coca-Cola, P&G: márgenes menores que software pero extremadamente estables
    grossMarginBp:     [15, 28, 42, 60],
    operatingMarginBp: [ 0,  8, 15, 24],
    netMarginBp:       [ 0,  5, 12, 20],
    roicBp:            [ 0,  8, 15, 28],
    roeBp:             [ 0, 12, 22, 40],
    revenueGrowthBp:   [ 0,  2,  6, 12],
    grossMarginWeight:     0.45,
    operatingMarginWeight: 0.35,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 3, expansion: 3, late: 8, recession: 9 },
  },
  {
    label: "Consumo Cíclico",
    yahooNames: ["Consumer Cyclical"],
    moatType: "Marca + Escala de distribución",
    capRange: "5–15 años",
    // Retail/autos: márgenes más ajustados, más sensibles al ciclo económico
    grossMarginBp:     [10, 22, 38, 55],
    operatingMarginBp: [ 0,  6, 12, 20],
    netMarginBp:       [ 0,  4,  9, 16],
    roicBp:            [ 0,  6, 12, 22],
    roeBp:             [ 0, 10, 20, 35],
    revenueGrowthBp:   [ 0,  4, 10, 20],
    grossMarginWeight:     0.40,
    operatingMarginWeight: 0.40,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 8, expansion: 8, late: 3, recession: 2 },
  },
  {
    label: "Industrial",
    yahooNames: ["Industrials"],
    moatType: "Cost advantage + Escala operativa + Contratos a largo plazo",
    capRange: "5–15 años",
    // Superciclo capex (reshoring, defensa, infraestructura) mejoró márgenes
    grossMarginBp:     [10, 24, 38, 54],
    operatingMarginBp: [ 0,  8, 16, 26],
    netMarginBp:       [ 0,  5, 11, 20],
    roicBp:            [ 0,  8, 16, 28],
    roeBp:             [ 0, 11, 20, 34],
    revenueGrowthBp:   [ 0,  3,  8, 16],
    // Operating margin pesa más — eficiencia operativa es el driver
    grossMarginWeight:     0.35,
    operatingMarginWeight: 0.45,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 8, expansion: 8, late: 5, recession: 2 },
  },
  {
    label: "Energía",
    yahooNames: ["Energy"],
    moatType: "Recursos naturales + Integración vertical",
    capRange: "Variable — depende del ciclo commodity",
    // Márgenes cíclicos pero con mejora estructural post-2022 (integrados/LNG)
    grossMarginBp:     [10, 25, 42, 60],
    operatingMarginBp: [ 0,  9, 18, 28],
    netMarginBp:       [ 0,  6, 13, 22],
    roicBp:            [ 0,  6, 14, 24],
    roeBp:             [ 0,  9, 18, 30],
    revenueGrowthBp:   [ 0,  2,  7, 14],
    grossMarginWeight:     0.35,
    operatingMarginWeight: 0.45,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 4, expansion: 5, late: 9, recession: 2 },
  },
  {
    label: "Comunicaciones",
    yahooNames: ["Communication Services"],
    moatType: "Network effects + Switching costs + Contenido exclusivo",
    capRange: "10–25 años",
    // Meta "año de eficiencia" + Google Ads recovery — techo de márgenes subió
    grossMarginBp:     [20, 40, 60, 80],
    operatingMarginBp: [ 0, 12, 26, 40],
    netMarginBp:       [ 0, 10, 22, 36],
    roicBp:            [ 0,  8, 18, 35],
    roeBp:             [ 0, 12, 24, 42],
    revenueGrowthBp:   [ 0,  5, 14, 24],
    grossMarginWeight:     0.45,
    operatingMarginWeight: 0.35,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 5, expansion: 8, late: 5, recession: 5 },
  },
  {
    label: "Utilities",
    yahooNames: ["Utilities"],
    moatType: "Efficient scale + Concesión regulada por el Estado",
    capRange: "20–40 años (duración de la concesión)",
    // Negocio regulado: márgenes predecibles pero ROIC bajo por activos intensivos
    grossMarginBp:     [10, 25, 38, 52],
    operatingMarginBp: [ 0, 12, 22, 32],
    netMarginBp:       [ 0,  7, 14, 22],
    // ROIC estructuralmente bajo — no penalizar igual que software
    roicBp:            [ 0,  3,  7, 12],
    roeBp:             [ 0,  6, 11, 16],
    revenueGrowthBp:   [ 0,  1,  4,  8],
    grossMarginWeight:     0.30,
    operatingMarginWeight: 0.50,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 2, expansion: 2, late: 5, recession: 9 },
  },
  {
    label: "Materiales",
    yahooNames: ["Basic Materials"],
    moatType: "Cost advantage + Acceso privilegiado a recursos",
    capRange: "Variable — ciclo commodity",
    // Commodities: márgenes bajos y cíclicos
    grossMarginBp:     [ 5, 18, 30, 45],
    operatingMarginBp: [ 0,  8, 16, 25],
    netMarginBp:       [ 0,  5, 10, 18],
    roicBp:            [ 0,  5, 12, 20],
    roeBp:             [ 0,  8, 16, 28],
    revenueGrowthBp:   [ 0,  2,  7, 14],
    grossMarginWeight:     0.35,
    operatingMarginWeight: 0.45,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 5, expansion: 8, late: 8, recession: 2 },
  },
  {
    label: "Inmobiliario",
    yahooNames: ["Real Estate"],
    moatType: "Efficient scale + Ubicación + Contratos de arrendamiento largos",
    capRange: "15–30 años",
    // REITs: márgenes razonables pero ROIC bajo por intensidad de activos
    grossMarginBp:     [10, 28, 42, 60],
    operatingMarginBp: [ 0, 15, 28, 42],
    netMarginBp:       [ 0, 10, 20, 32],
    roicBp:            [ 0,  3,  7, 12],
    roeBp:             [ 0,  5, 10, 16],
    revenueGrowthBp:   [ 0,  2,  6, 11],
    grossMarginWeight:     0.30,
    operatingMarginWeight: 0.50,
    netMarginWeight:       0.20,
    cycleScores: { recovery: 8, expansion: 5, late: 3, recession: 5 },
  },
]

// Config por defecto cuando el sector no está mapeado
const DEFAULT: SectorConfig = {
  label: "General",
  yahooNames: [],
  moatType: "Indeterminado",
  capRange: "Indeterminado",
  grossMarginBp:     [15, 30, 50, 70],
  operatingMarginBp: [ 0, 10, 22, 35],
  netMarginBp:       [ 0,  8, 18, 30],
  roicBp:            [ 0,  7, 15, 28],
  roeBp:             [ 0, 10, 20, 35],
  revenueGrowthBp:   [ 0,  3,  9, 18],
  grossMarginWeight:     0.45,
  operatingMarginWeight: 0.35,
  netMarginWeight:       0.20,
  cycleScores: { recovery: 5, expansion: 5, late: 5, recession: 5 },
}

export function getSectorConfig(sector: string): SectorConfig {
  return SECTORS.find(s => s.yahooNames.includes(sector)) ?? DEFAULT
}

// Retorna el heat score (1-10) del sector para la fase actual del ciclo
export function getSectorHeat(yahooSector: string, phase: CyclePhase): number {
  const cfg = getSectorConfig(yahooSector)
  return cfg.cycleScores[phase]
}
