import type { StockData } from "./yahoo"
import { getSectorConfig } from "./sectors"
import {
  MICRO_CAP_MAX, SMALL_CAP_MAX, MID_CAP_MAX,
  CAP_FACTOR_MICRO, CAP_FACTOR_SMALL,
  GRADE_A_PLUS, GRADE_A, GRADE_B, GRADE_C, GRADE_D,
  BUY_READY_QUALITY_MIN, BUY_READY_PRICE_MIN, BUY_READY_DROP_MAX,
  MISSING_DATA_SCORE, MIN_ANALYST_COUNT, WEAK_ANALYST_FACTOR,
  FCF_CONVERSION_GREAT, FCF_CONVERSION_GOOD, FCF_CONVERSION_WEAK,
  INSIDER_OWNERSHIP_GREAT, INSIDER_OWNERSHIP_GOOD,
  ROIC_PREMIUM_STRONG, ROIC_PREMIUM_GREAT,
} from "./constants"

// Interpola linealmente entre breakpoints
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

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}

const OUT: [number, number, number, number] = [0, 25, 65, 100]

export type ScoreBreakdown = {
  // Tamaño de empresa
  capSizeLabel: "Micro Cap" | "Small Cap" | "Mid Cap" | "Large Cap"

  // Pilar 1: Eficiencia del Capital (30%)
  roicScore: number          // ROIC — métrica principal de retorno sobre capital
  roeScore: number           // ROE — referencia secundaria
  roaScore: number           // ROA — eficiencia sin efecto apalancamiento
  fcfMarginScore: number     // FCF / Revenue
  revenueGrowthScore: number // Crecimiento de revenue — breakpoints sectoriales
  managementScore: number    // Alineación insiders + calidad earnings + apalancamiento operativo
  capitalScore: number       // 0-100

  // Pilar 2: Ventaja Competitiva / Moat (30%) — breakpoints sectoriales
  grossMarginScore: number
  operatingMarginScore: number
  netMarginScore: number
  moatQuantScore: number     // Prima ROIC sobre sector + conversión FCF (moat cuantificado)
  moatScore: number          // 0-100

  // Contexto sectorial del moat
  sectorLabel: string      // Nombre del sector en español
  moatType: string         // Tipo de moat dominante
  capRange: string         // Rango de CAP típico del sector

  // Pilar 3: Solidez Financiera (20%)
  debtScore: number
  netDebtEbitdaScore: number
  fcfHealthScore: number
  netDebtToEbitda: number  // ratio bruto para display (−1 = posición cash neta)
  healthScore: number      // 0-100

  // Pilar 4: Precio (20%)
  pfcfScore: number
  evEbitdaScore: number
  grahamScore: number      // descuento vs Graham Number (0 si EPS/BookValue negativos)
  lynchScore: number       // descuento vs Lynch Fair Value (EPS * 15)
  upsideScore: number
  priceScore: number       // 0-100

  // Totales
  qualityScore: number     // Pilar 1+2+3 (0-100)
  finalScore: number       // 60% quality + 40% price (0-100)
  buyScore: number         // 55% quality + 45% price — score de entrada
  buyReady: boolean        // qualityScore>=65 && priceScore>=45 && dropFrom52w<=-10
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  verdict: string
  strengths: string[]
  weaknesses: string[]

  // Señal de trading
  signal: "Compra Fuerte" | "Compra" | "Mantener" | "Venta" | "Venta Fuerte"
  signalReason: string     // explicación de por qué se emitió la señal

  // Dividendos (null si no paga)
  dividendScore: number | null
  dividendGrade: "Excelente" | "Bueno" | "Moderado" | "Débil" | "No aplica"
}

function scaleForCapSize(bp: [number, number, number, number], factor: number): [number, number, number, number] {
  return [bp[0] * factor, bp[1] * factor, bp[2] * factor, bp[3] * factor]
}

export function scoreStock(s: StockData): ScoreBreakdown {
  const sector = getSectorConfig(s.sector)

  // Cap size factor — small/micro caps tienen menos escala; reducimos exigencia de breakpoints
  const capFactor =
    s.marketCap > 0 && s.marketCap < MICRO_CAP_MAX ? CAP_FACTOR_MICRO :
    s.marketCap > 0 && s.marketCap < SMALL_CAP_MAX ? CAP_FACTOR_SMALL : 1.0

  const capSizeLabel: ScoreBreakdown["capSizeLabel"] =
    s.marketCap < MICRO_CAP_MAX ? "Micro Cap" :
    s.marketCap < SMALL_CAP_MAX ? "Small Cap" :
    s.marketCap < MID_CAP_MAX   ? "Mid Cap"   : "Large Cap"

  // Ajustar breakpoints de márgenes y ROIC para small/micro cap
  const adjSector = capFactor < 1 ? {
    ...sector,
    grossMarginBp:     scaleForCapSize(sector.grossMarginBp,     capFactor),
    operatingMarginBp: scaleForCapSize(sector.operatingMarginBp, capFactor),
    netMarginBp:       scaleForCapSize(sector.netMarginBp,       capFactor),
    roicBp:            scaleForCapSize(sector.roicBp,            capFactor),
    roeBp:             scaleForCapSize(sector.roeBp,             capFactor),
  } : sector

  // ── Pilar 1: Eficiencia del Capital ──────────────────────────────────────
  // ROIC: el mejor indicador de si el negocio crea valor económico real
  // ROIC > WACC → moat real. Breakpoints según sector (Damodaran)
  const roicScore = s.hasROIC ? clamp(lerp(s.roic * 100, adjSector.roicBp, OUT)) : 50

  // ROE: referencia secundaria — puede inflarse con deuda, por eso ROIC es primario
  const roeScore = clamp(lerp(s.roe * 100, adjSector.roeBp, OUT))

  // ROA: eficiencia usando todos los activos, sin trampa del apalancamiento
  const roaScore = clamp(lerp(s.roa * 100, [0, 5, 10, 18], OUT))

  // FCF Margin: cuánto cash real genera por cada dólar vendido
  const fcfMarginScore = clamp(lerp(s.fcfMargin * 100, [0, 8, 18, 28], OUT))

  // Revenue Growth: crecimiento de ventas con expectativas calibradas por sector
  const revenueGrowthScore = clamp(lerp(s.revenueGrowth * 100, adjSector.revenueGrowthBp, OUT))

  // Management Score: 3 señales de calidad de gestión
  // 1) FCF Conversion = FCF / Net Income — ¿las ganancias contables son cash real?
  const netIncome = s.totalRevenue > 0 ? s.netMargin * s.totalRevenue : 0
  const fcfConversion = netIncome > 0 ? s.freeCashflow / netIncome : 0
  const fcfConversionScore =
    fcfConversion >= FCF_CONVERSION_GREAT ? 100 :
    fcfConversion >= FCF_CONVERSION_GOOD  ? clamp(lerp(fcfConversion, [FCF_CONVERSION_GOOD, FCF_CONVERSION_GREAT, FCF_CONVERSION_GREAT, FCF_CONVERSION_GREAT], [70, 100, 100, 100])) :
    fcfConversion >= FCF_CONVERSION_WEAK  ? clamp(lerp(fcfConversion, [FCF_CONVERSION_WEAK, FCF_CONVERSION_GOOD,  FCF_CONVERSION_GOOD,  FCF_CONVERSION_GOOD],  [30,  70,  70,  70])) :
    fcfConversion >  0                    ? 15 :
    netIncome <= 0                        ? 40 :  // sin datos suficientes
    5                                             // FCF negativo con earnings positivos

  // 2) Insider Ownership — % de acciones en manos del management
  const insiderScore = clamp(lerp(
    s.heldPercentInsiders * 100,
    [0, 1, INSIDER_OWNERSHIP_GOOD * 100, INSIDER_OWNERSHIP_GREAT * 100],
    [20, 40, 72, 100]
  ))

  // 3) Operating Leverage — EPS creció más rápido que Revenue → margen en expansión
  const leverageScore =
    s.earningsGrowth > 0 && s.revenueGrowth > 0 && (s.earningsGrowth - s.revenueGrowth) >= 0.03
      ? 75   // expansión de margen operativo confirmada
      : s.earningsGrowth > s.revenueGrowth
        ? 55  // ligera expansión
        : s.earningsGrowth < 0
          ? 20  // EPS cayendo
          : 40  // sin señal clara

  const managementScore = clamp(
    fcfConversionScore * 0.45 +
    insiderScore       * 0.30 +
    leverageScore      * 0.25
  )

  const capitalScore = clamp(
    roicScore           * 0.35 +   // ROIC sigue siendo el driver principal
    roaScore            * 0.20 +
    fcfMarginScore      * 0.20 +
    revenueGrowthScore  * 0.15 +   // crecimiento ajustado al sector
    managementScore     * 0.10     // calidad de gestión
  )

  // ── Pilar 2: Ventaja Competitiva (Moat) — breakpoints sectoriales ─────────
  // Gross Margin: pricing power. Breakpoints distintos por sector (Damodaran)
  // Un retailer con 35% es excelente. Un SaaS con 35% es mediocre.
  const grossMarginScore = clamp(lerp(s.grossMargin * 100, adjSector.grossMarginBp, OUT))

  // Operating Margin: eficiencia operativa después de G&A y R&D
  const operatingMarginScore = clamp(lerp(s.operatingMargin * 100, adjSector.operatingMarginBp, OUT))

  // Net Margin: resultado final después de impuestos e intereses
  const netMarginScore = clamp(lerp(s.netMargin * 100, adjSector.netMarginBp, OUT))

  // Moat Cuantitativo: prima ROIC sobre el umbral "bueno" del sector + calidad FCF
  // Mide si el negocio genera ROIC estructuralmente por encima de sus pares
  const roicPremium = s.hasROIC ? s.roic * 100 - adjSector.roicBp[2] : 0
  const roicPremiumScore = clamp(lerp(
    roicPremium,
    [-5, 0, ROIC_PREMIUM_STRONG, ROIC_PREMIUM_GREAT],
    [0, 35, 75, 100]
  ))
  const moatQuantScore = clamp(roicPremiumScore * 0.70 + fcfConversionScore * 0.30)

  // Pesos también sectoriales — financieros: gross margin casi no importa
  // moatQuantScore añade 15% de señal cuantificada al moat total
  const moatBaseScore = clamp(
    grossMarginScore    * adjSector.grossMarginWeight +
    operatingMarginScore * adjSector.operatingMarginWeight +
    netMarginScore      * adjSector.netMarginWeight
  )
  const moatScore = clamp(moatBaseScore * 0.85 + moatQuantScore * 0.15)

  // ── Pilar 3: Solidez Financiera ───────────────────────────────────────────
  const isFinancial    = s.sector === "Financial Services"
  const isCapIntensive = ["Utilities", "Energy", "Real Estate", "Industrials"].includes(s.sector)

  // D/E ajustado por sector: bancos son naturalmente apalancados (D/E 8-12x es normal)
  const de = s.debtToEquity / 100
  const deBp: [number, number, number, number] = isFinancial
    ? [-20, -10, -5, 0]   // financieros: D/E 5x aún es bueno
    : [-4,  -2,  -0.5, 0] // resto: D/E 2x ya es elevado
  const debtScore = clamp(lerp(-de, deBp, [0, 20, 70, 100]))

  // Net Debt / EBITDA — cuántos años de ganancias necesita para cancelar deuda
  const netDebt = Math.max(s.totalDebt - s.totalCash, 0)
  const hasNetCash = s.totalCash > s.totalDebt
  const netDebtToEbitda = (s.ebitda > 0 && !hasNetCash) ? netDebt / s.ebitda : (hasNetCash ? -1 : 0)

  let netDebtEbitdaScore: number
  if (isFinancial) {
    // Para bancos el concepto no aplica igual — usamos roeScore como proxy de solidez
    netDebtEbitdaScore = roeScore
  } else if (hasNetCash) {
    // Posición de cash neta: la empresa tiene más cash que deuda
    netDebtEbitdaScore = 100
  } else if (s.ebitda <= 0 && netDebt > 0) {
    // EBITDA negativo con deuda — señal de alarma
    netDebtEbitdaScore = 5
  } else if (s.ebitda <= 0) {
    // Sin EBITDA y sin deuda neta — sin suficientes datos
    netDebtEbitdaScore = 40
  } else {
    // Breakpoints según intensidad de capital del sector
    const ndBp: [number, number, number, number] = isCapIntensive
      ? [-9, -5, -2.5, 0]  // utilities/energy: 5x es aceptable
      : [-6, -3, -1.5, 0]  // resto: >3x ya es elevado
    netDebtEbitdaScore = clamp(lerp(-netDebtToEbitda, ndBp, [0, 25, 65, 100]))
  }

  // FCF Health — genera cash o lo quema, y cuánto runway tiene
  let fcfHealthScore: number
  if (s.freeCashflow > 0) {
    // FCF positivo: cuanto mejor el margen, más sana la empresa
    fcfHealthScore = clamp(lerp(s.fcfMargin * 100, [0, 5, 15, 25], [55, 65, 85, 100]))
  } else if (s.freeCashflow < 0 && s.totalCash > 0) {
    // FCF negativo: cuántos años de cash le quedan al ritmo actual
    const runway = s.totalCash / Math.abs(s.freeCashflow)
    fcfHealthScore = runway >= 3 ? 35 : runway >= 1 ? 18 : 5
  } else if (s.freeCashflow === 0) {
    // Sin dato de FCF
    fcfHealthScore = 40
  } else {
    // FCF negativo y sin cash: riesgo crítico de liquidez
    fcfHealthScore = 5
  }

  const healthScore = clamp(
    debtScore          * 0.35 +
    netDebtEbitdaScore * 0.40 +
    fcfHealthScore     * 0.25
  )

  // ── Pilar 4: Precio ───────────────────────────────────────────────────────
  const pfcfScore = s.pFcf > 0
    ? clamp(lerp(-s.pFcf, [-60, -30, -15, -5], [0, 20, 65, 100]))
    : MISSING_DATA_SCORE

  const evEbitdaScore = s.evToEbitda > 0
    ? clamp(lerp(-s.evToEbitda, [-40, -20, -10, -5], [0, 20, 65, 100]))
    : MISSING_DATA_SCORE

  const grahamScore = s.grahamNumber > 0
    ? clamp(lerp(s.discountToGraham, [-40, -10, 20, 50], [0, 25, 65, 100]))
    : MISSING_DATA_SCORE

  const lynchScore = s.lynchValue > 0
    ? clamp(lerp(s.discountToLynch, [-40, -10, 20, 50], [0, 25, 65, 100]))
    : MISSING_DATA_SCORE

  const upsideScore = (s.analystTarget > 0 && s.analystCount >= MIN_ANALYST_COUNT)
    ? clamp(lerp(s.upsideToTarget, [-10, 0, 15, 35], [0, 20, 60, 100]))
    : s.analystTarget > 0
      ? clamp(lerp(s.upsideToTarget, [-10, 0, 15, 35], [0, 20, 60, 100])) * WEAK_ANALYST_FACTOR
      : MISSING_DATA_SCORE

  const priceScore = clamp(
    pfcfScore     * 0.30 +
    evEbitdaScore * 0.25 +
    grahamScore   * 0.20 +
    lynchScore    * 0.15 +
    upsideScore   * 0.10
  )

  // ── Score Final ───────────────────────────────────────────────────────────
  const qualityScore = clamp(
    capitalScore * 0.375 +   // 30% del total
    moatScore    * 0.375 +   // 30% del total
    healthScore  * 0.25      // 20% del total
  )

  const finalScore = clamp(
    qualityScore * 0.60 +
    priceScore   * 0.40
  )

  // ── Buy Score (Opción B) ──────────────────────────────────────────────────
  // Score equilibrado para detectar momento de entrada: calidad + precio juntos
  const buyScore = clamp(
    qualityScore * 0.55 +
    priceScore   * 0.45
  )
  // Lista para comprar cuando calidad, precio Y descuento de mercado confluyen
  const buyReady =
    qualityScore >= BUY_READY_QUALITY_MIN &&
    priceScore   >= BUY_READY_PRICE_MIN   &&
    s.dropFrom52w <= BUY_READY_DROP_MAX

  // ── Grade ─────────────────────────────────────────────────────────────────
  const grade =
    finalScore >= GRADE_A_PLUS ? "A+" :
    finalScore >= GRADE_A      ? "A"  :
    finalScore >= GRADE_B      ? "B"  :
    finalScore >= GRADE_C      ? "C"  :
    finalScore >= GRADE_D      ? "D"  : "F"

  // ── Fortalezas y debilidades ──────────────────────────────────────────────
  const strengths: string[] = []
  const weaknesses: string[] = []

  if (s.roic * 100 >= adjSector.roicBp[2])            strengths.push(`ROIC ${(s.roic * 100).toFixed(0)}% — genera valor económico real por encima del costo de capital`)
  if (s.roe * 100 >= adjSector.roeBp[2])              strengths.push(`ROE ${(s.roe * 100).toFixed(0)}% — retorno excepcional sobre patrimonio`)
  if (s.grossMargin * 100 >= adjSector.grossMarginBp[2]) strengths.push(`Margen bruto ${(s.grossMargin * 100).toFixed(0)}% — fuerte pricing power vs su sector`)
  if (s.operatingMargin * 100 >= adjSector.operatingMarginBp[2]) strengths.push(`Margen operativo ${(s.operatingMargin * 100).toFixed(0)}% — eficiencia operativa alta`)
  if (hasNetCash)                  strengths.push(`Posición de cash neta — más cash que deuda ($${(s.totalCash / 1e9).toFixed(1)}B vs $${(s.totalDebt / 1e9).toFixed(1)}B)`)
  else if (de <= 0.5)              strengths.push("Balance limpio — deuda muy baja")
  if (!isFinancial && netDebtToEbitda > 0 && netDebtToEbitda <= 1.5) strengths.push(`Net Debt/EBITDA ${netDebtToEbitda.toFixed(1)}x — deuda muy manejable`)
  if (s.freeCashflow > 0 && s.fcfMargin * 100 >= 18) strengths.push(`FCF margin ${(s.fcfMargin * 100).toFixed(0)}% — genera cash de forma consistente`)
  if (s.pFcf > 0 && s.pFcf < 15)  strengths.push(`P/FCF ${s.pFcf.toFixed(1)}x — precio atractivo vs flujo de caja`)
  if (s.grahamNumber > 0 && s.discountToGraham >= 20) strengths.push(`${s.discountToGraham.toFixed(0)}% por debajo del Graham Number ($${s.grahamNumber.toFixed(0)})`)
  if (s.lynchValue > 0 && s.discountToLynch >= 20)    strengths.push(`${s.discountToLynch.toFixed(0)}% por debajo del valor Lynch ($${s.lynchValue.toFixed(0)})`)
  if (s.upsideToTarget >= 20 && s.analystCount >= 3)  strengths.push(`+${s.upsideToTarget.toFixed(0)}% upside según ${s.analystCount} analistas`)
  else if (s.upsideToTarget >= 20)                    strengths.push(`+${s.upsideToTarget.toFixed(0)}% upside según analistas`)
  if (s.earningsGrowth * 100 >= 15) strengths.push(`Crecimiento EPS ${(s.earningsGrowth * 100).toFixed(0)}% — momentum de ganancias`)
  if (s.revenueGrowth * 100 >= adjSector.revenueGrowthBp[2]) strengths.push(`Revenue +${(s.revenueGrowth * 100).toFixed(0)}% — crecimiento por encima de lo esperado para el sector`)
  if (fcfConversion >= FCF_CONVERSION_GOOD && netIncome > 0) strengths.push(`FCF conversion ${(fcfConversion * 100).toFixed(0)}% — ganancias contables respaldadas por cash real`)
  if (s.heldPercentInsiders >= INSIDER_OWNERSHIP_GOOD) strengths.push(`Insider ownership ${(s.heldPercentInsiders * 100).toFixed(0)}% — management con piel en el juego`)

  if (s.roic > 0 && s.roic * 100 < adjSector.roicBp[1])       weaknesses.push(`ROIC ${(s.roic * 100).toFixed(0)}% — posiblemente por debajo del costo de capital`)
  if (s.roe * 100 < adjSector.roeBp[1])                       weaknesses.push(`ROE ${(s.roe * 100).toFixed(0)}% — retorno bajo sobre patrimonio`)
  if (s.grossMargin * 100 < adjSector.grossMarginBp[1])        weaknesses.push(`Margen bruto ${(s.grossMargin * 100).toFixed(0)}% — sin poder de fijación de precios`)
  if (s.freeCashflow > 0 && s.fcfMargin * 100 < 5) weaknesses.push(`FCF margin ${(s.fcfMargin * 100).toFixed(1)}% — genera poco cash libre por cada dólar de revenue`)
  if (!isFinancial && de > 2)      weaknesses.push(`D/E ${de.toFixed(1)}x — deuda elevada, riesgo financiero`)
  if (!isFinancial && netDebtToEbitda >= 4) weaknesses.push(`Net Debt/EBITDA ${netDebtToEbitda.toFixed(1)}x — deuda excesiva en relación a ganancias`)
  if (s.freeCashflow < 0) {
    const runway = s.totalCash > 0 ? (s.totalCash / Math.abs(s.freeCashflow)).toFixed(1) : "0"
    weaknesses.push(`FCF negativo — quema cash. Runway estimado: ${runway} años`)
  }
  if (s.pFcf > 30)                 weaknesses.push(`P/FCF ${s.pFcf.toFixed(1)}x — precio caro relativo a su FCF`)
  if (s.grahamNumber > 0 && s.discountToGraham <= -20) weaknesses.push(`Cotiza ${Math.abs(s.discountToGraham).toFixed(0)}% por encima del Graham Number — sin margen de seguridad`)
  if (s.lynchValue > 0 && s.discountToLynch <= -20)    weaknesses.push(`Cotiza ${Math.abs(s.discountToLynch).toFixed(0)}% por encima del valor Lynch — precio exigente`)
  if (s.earningsGrowth * 100 < 0)  weaknesses.push("EPS decreciendo — el negocio está perdiendo tracción")
  if (s.netMargin * 100 < adjSector.netMarginBp[1]) weaknesses.push(`Margen neto ${(s.netMargin * 100).toFixed(0)}% — márgenes por debajo de lo esperado para el sector`)
  if (s.revenueGrowth * 100 < adjSector.revenueGrowthBp[1] && s.revenueGrowth > -0.05) weaknesses.push(`Revenue +${(s.revenueGrowth * 100).toFixed(0)}% — crecimiento por debajo del promedio sectorial`)
  if (netIncome > 0 && fcfConversion < FCF_CONVERSION_WEAK) weaknesses.push(`FCF conversion ${(fcfConversion * 100).toFixed(0)}% — las ganancias no se reflejan en cash (calidad dudosa)`)

  // ── Dividendos ────────────────────────────────────────────────────────────
  let dividendScore: number | null = null
  let dividendGrade: ScoreBreakdown["dividendGrade"] = "No aplica"

  if (s.isDividendPayer) {
    const yieldVsAvg = s.fiveYearAvgYield > 0
      ? clamp(lerp(s.dividendYield / (s.fiveYearAvgYield / 100), [0.7, 0.9, 1.1, 1.4], OUT))
      : 50

    const payoutSafe = clamp(lerp(s.payoutRatio, [0, 0.35, 0.60, 0.85], [100, 75, 35, 0]))

    const fcfPayout = s.fcfPayoutRatio > 0
      ? clamp(lerp(s.fcfPayoutRatio, [0, 0.30, 0.60, 0.90], [100, 75, 35, 0]))
      : 50

    const ddmSignal = s.ddmValue > 0
      ? clamp(lerp(s.ddmDiscount, [-30, 0, 20, 50], OUT))
      : 50

    dividendScore = Math.round(clamp(
      yieldVsAvg * 0.20 +
      payoutSafe * 0.30 +
      fcfPayout  * 0.30 +
      ddmSignal  * 0.20
    ))

    dividendGrade =
      dividendScore >= 75 ? "Excelente" :
      dividendScore >= 55 ? "Bueno" :
      dividendScore >= 35 ? "Moderado" : "Débil"
  }

  // ── Veredicto ─────────────────────────────────────────────────────────────
  const verdict = buildVerdict(grade, capitalScore, moatScore, healthScore, priceScore, s)

  // ── Señal de trading ──────────────────────────────────────────────────────
  const { signal, signalReason } = buildSignal(
    qualityScore, priceScore, healthScore,
    s.dropFrom52w, s.earningsGrowth, s.freeCashflow, s.totalCash
  )

  return {
    roicScore:            Math.round(roicScore),
    roeScore:             Math.round(roeScore),
    roaScore:             Math.round(roaScore),
    fcfMarginScore:       Math.round(fcfMarginScore),
    revenueGrowthScore:   Math.round(revenueGrowthScore),
    managementScore:      Math.round(managementScore),
    capitalScore:         Math.round(capitalScore),
    grossMarginScore:     Math.round(grossMarginScore),
    operatingMarginScore: Math.round(operatingMarginScore),
    netMarginScore:       Math.round(netMarginScore),
    moatQuantScore:       Math.round(moatQuantScore),
    moatScore:            Math.round(moatScore),
    capSizeLabel,
    sectorLabel:          sector.label,
    moatType:             sector.moatType,
    capRange:             sector.capRange,
    debtScore:            Math.round(debtScore),
    netDebtEbitdaScore:   Math.round(netDebtEbitdaScore),
    fcfHealthScore:       Math.round(fcfHealthScore),
    netDebtToEbitda:      Math.round(netDebtToEbitda * 10) / 10,
    healthScore:          Math.round(healthScore),
    pfcfScore:            Math.round(pfcfScore),
    evEbitdaScore:        Math.round(evEbitdaScore),
    grahamScore:          Math.round(grahamScore),
    lynchScore:           Math.round(lynchScore),
    upsideScore:          Math.round(upsideScore),
    priceScore:           Math.round(priceScore),
    qualityScore:         Math.round(qualityScore),
    finalScore:           Math.round(finalScore),
    buyScore:             Math.round(buyScore),
    buyReady,
    grade,
    verdict,
    strengths:  strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 3),
    signal,
    signalReason,
    dividendScore,
    dividendGrade,
  }
}

type Signal = ScoreBreakdown["signal"]

function buildSignal(
  qualityScore: number,
  priceScore: number,
  healthScore: number,
  dropFrom52w: number,
  earningsGrowth: number,
  freeCashflow: number,
  totalCash: number,
): { signal: Signal; signalReason: string } {

  // ── Overrides por deterioro — tienen prioridad sobre la matriz ────────────

  // Deterioro severo + precio no compensa → Venta Fuerte inmediata
  if (earningsGrowth < -0.10 && priceScore < 35) {
    return {
      signal: "Venta Fuerte",
      signalReason: `EPS cayendo ${(earningsGrowth * 100).toFixed(0)}% y precio sin descuento suficiente para compensar el deterioro.`,
    }
  }

  // Riesgo financiero crítico → Venta Fuerte inmediata
  if (healthScore < 25) {
    return {
      signal: "Venta Fuerte",
      signalReason: "Solidez financiera crítica — riesgo alto de impago o dilución severa.",
    }
  }

  // FCF negativo sin runway y calidad insuficiente → Venta Fuerte
  if (freeCashflow < 0 && totalCash <= 0 && qualityScore < 50) {
    return {
      signal: "Venta Fuerte",
      signalReason: "Quema cash sin reservas y sin calidad de negocio que lo justifique.",
    }
  }

  // EPS cayendo pero sin llegar a -10% → bloquea cualquier Compra
  const deterioro = earningsGrowth < -0.05

  // ── Matriz Quality × Price ────────────────────────────────────────────────
  const qAlta  = qualityScore >= 65
  const qMedia = qualityScore >= 45 && qualityScore < 65
  const qBaja  = qualityScore < 45

  const pBarato = priceScore >= 55
  const pJusto  = priceScore >= 35 && priceScore < 55
  const pCaro   = priceScore < 35

  // Calidad Alta
  if (qAlta) {
    if (pBarato) {
      if (deterioro) {
        return {
          signal: "Mantener",
          signalReason: "Buen negocio y precio atractivo, pero EPS decreciendo — esperar confirmación de estabilización.",
        }
      }
      if (dropFrom52w <= -15) {
        return {
          signal: "Compra Fuerte",
          signalReason: `Negocio de alta calidad con descuento de mercado del ${Math.abs(dropFrom52w).toFixed(0)}% desde máximos y precio atractivo en múltiplos.`,
        }
      }
      return {
        signal: "Compra",
        signalReason: "Negocio de alta calidad a precio atractivo. Falta caída de mercado para señal de entrada óptima.",
      }
    }
    if (pJusto) {
      if (deterioro) {
        return {
          signal: "Mantener",
          signalReason: "Calidad alta pero EPS decreciendo — no es momento de aumentar posición.",
        }
      }
      return {
        signal: "Compra",
        signalReason: "Negocio de alta calidad a precio razonable. No es ganga, pero la calidad justifica la entrada.",
      }
    }
    // pCaro
    return {
      signal: "Mantener",
      signalReason: "Excelente negocio pero cotizando a prima — esperar mejor punto de entrada.",
    }
  }

  // Calidad Media
  if (qMedia) {
    if (pBarato) {
      if (deterioro) {
        return {
          signal: "Mantener",
          signalReason: "Precio atractivo pero calidad media con EPS en baja — el descuento puede ser una trampa.",
        }
      }
      return {
        signal: "Compra",
        signalReason: "Empresa sólida con precio que ofrece descuento. Monitorear que los fundamentales no se deterioren.",
      }
    }
    if (pJusto) {
      return {
        signal: "Mantener",
        signalReason: "Empresa decente a precio justo — sin urgencia de comprar ni razón para vender.",
      }
    }
    // pCaro
    return {
      signal: "Venta",
      signalReason: "Empresa de calidad media cotizando cara — la relación riesgo/retorno no justifica mantener.",
    }
  }

  // Calidad Baja
  if (pBarato) {
    return {
      signal: "Mantener",
      signalReason: "Precio bajo pero negocio débil — posible value trap. Requiere análisis profundo antes de actuar.",
    }
  }
  if (pJusto) {
    return {
      signal: "Venta",
      signalReason: "Negocio de baja calidad sin descuento suficiente para compensar el riesgo.",
    }
  }
  // qBaja + pCaro
  return {
    signal: "Venta Fuerte",
    signalReason: "Negocio débil cotizando caro — la combinación más desfavorable para el inversor.",
  }
}

function buildVerdict(
  grade: string,
  capital: number,
  moat: number,
  health: number,
  price: number,
  s: StockData
): string {
  if (grade === "A+" || grade === "A") {
    if (price >= 60) return "Negocio excepcional a precio atractivo — el tipo de empresa que buscan los mejores fondos."
    return "Negocio de alta calidad. El precio no es barato, pero la calidad justifica la prima."
  }
  if (grade === "B") {
    if (moat >= 65) return "Negocio sólido con ventaja competitiva visible. Esperar mejor punto de entrada."
    if (capital >= 65) return "Genera buen retorno sobre el capital. Revisar sostenibilidad del moat."
    return "Empresa decente pero sin ventajas competitivas claras. Requiere análisis más profundo."
  }
  if (grade === "C") {
    if (health < 40) return "Deuda elevada compromete la calidad del negocio. Alto riesgo."
    if (moat < 35)  return "Sin ventaja competitiva clara — vulnerable a la competencia y ciclos económicos."
    return "Métricas promedio. No cumple el estándar mínimo de calidad para un fondo serio."
  }
  if (s.earningsGrowth < -0.05) return "Negocio en deterioro — EPS cayendo. Evitar hasta ver estabilización."
  return "No cumple los criterios de calidad mínimos. El precio bajo no compensa las debilidades estructurales."
}
