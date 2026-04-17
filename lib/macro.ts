// Datos macroeconómicos desde FRED (Federal Reserve Economic Data)
// API oficial: https://api.stlouisfed.org/fred/
// Requiere FRED_API_KEY en .env.local (gratuita en fred.stlouisfed.org)

export type MacroIndicator = {
  value:  number
  prev:   number
  trend:  "up" | "down" | "stable"
  label:  string
  unit:   string
  date:   string
}

// ── Grupos de indicadores ─────────────────────────────────────────────────────
export type MacroData = {
  // Core (detección de fase)
  gdpGrowth:    MacroIndicator | null   // GDPC1  — PIB real YoY %
  inflation:    MacroIndicator | null   // CPIAUCSL — CPI YoY %
  unemployment: MacroIndicator | null   // UNRATE
  fedRate:      MacroIndicator | null   // FEDFUNDS
  yieldCurve:   MacroIndicator | null   // T10Y2Y

  // Mercado laboral
  nfp:          MacroIndicator | null   // PAYEMS — nóminas YoY %
  joblessClaims:MacroIndicator | null   // ICSA — solicitudes semanales (K)
  u6Rate:       MacroIndicator | null   // U6RATE — desempleo amplio
  jolts:        MacroIndicator | null   // JTSJOL — vacantes (K)

  // Crédito y condiciones financieras
  hySpread:     MacroIndicator | null   // BAMLH0A0HYM2 — HY spread
  igSpread:     MacroIndicator | null   // BAMLC0A0CM — IG spread
  creditDelinq: MacroIndicator | null   // DRCCLACBS — morosidad tarjetas
  finStress:    MacroIndicator | null   // STLFSI4 — índice estrés

  // Inflación desagregada
  coreInflation:MacroIndicator | null   // CPILFESL — CPI core YoY %
  pce:          MacroIndicator | null   // PCEPI — PCE YoY %
  corePce:      MacroIndicator | null   // PCEPILFE — PCE core YoY %
  inflExp5y:    MacroIndicator | null   // T5YIE — expectativas 5Y
  inflExp10y:   MacroIndicator | null   // T10YIE — expectativas 10Y

  // Curva de tasas completa
  yc10y3m:      MacroIndicator | null   // T10Y3M — spread 10Y-3M
  treasury2y:   MacroIndicator | null   // DGS2
  treasury5y:   MacroIndicator | null   // DGS5
  treasury10y:  MacroIndicator | null   // DGS10
  treasury30y:  MacroIndicator | null   // DGS30

  // Economía real
  indProd:      MacroIndicator | null   // INDPRO — producción industrial YoY %
  capUtil:      MacroIndicator | null   // TCU — utilización de capacidad
  retailSales:  MacroIndicator | null   // RSXFS — ventas minoristas YoY %
  housStarts:   MacroIndicator | null   // HOUST — inicio construcciones YoY %
  buildPermits: MacroIndicator | null   // PERMIT — permisos YoY %
  consumerSent: MacroIndicator | null   // UMCSENT — confianza consumidor

  // Dinero y crédito
  m2:           MacroIndicator | null   // M2SL — masa monetaria YoY %
  ciCredit:     MacroIndicator | null   // TOTCI — crédito C&I YoY %
  bizLoans:     MacroIndicator | null   // BUSLOANS — préstamos empresas YoY %

  fetchedAt: string
}

export type Phase = "recovery" | "expansion" | "late" | "recession"

export type PhaseDetection = {
  phase:     Phase
  confidence: number
  signals:   string[]
  breakdown: Record<Phase, number>
}

// ── Configuración de series ───────────────────────────────────────────────────
type SeriesCfg = {
  id:      string
  units:   "lin" | "pc1"   // lin = nivel, pc1 = % cambio YoY
  limit:   number           // observaciones a pedir
  lookback:number           // posiciones atrás para calcular trend
  label:   string
  unit:    string
}

const SERIES: Record<string, SeriesCfg> = {
  gdp:          { id: "GDPC1",        units: "pc1", limit: 12,  lookback: 2,  label: "PIB Real",                    unit: "% YoY" },
  cpi:          { id: "CPIAUCSL",     units: "pc1", limit: 15,  lookback: 3,  label: "Inflación (CPI)",             unit: "% YoY" },
  unrate:       { id: "UNRATE",       units: "lin", limit: 12,  lookback: 3,  label: "Desempleo",                   unit: "%" },
  fedfunds:     { id: "FEDFUNDS",     units: "lin", limit: 12,  lookback: 3,  label: "Fed Funds Rate",              unit: "%" },
  t10y2y:       { id: "T10Y2Y",       units: "lin", limit: 60,  lookback: 21, label: "Curva 10Y-2Y",                unit: "%" },
  nfp:          { id: "PAYEMS",       units: "pc1", limit: 15,  lookback: 3,  label: "Nóminas (NFP)",               unit: "% YoY" },
  icsa:         { id: "ICSA",         units: "lin", limit: 16,  lookback: 4,  label: "Solicitudes desempleo",       unit: "K" },
  u6rate:       { id: "U6RATE",       units: "lin", limit: 12,  lookback: 3,  label: "Desempleo U-6",               unit: "%" },
  jolts:        { id: "JTSJOL",       units: "lin", limit: 12,  lookback: 3,  label: "Vacantes JOLTS",              unit: "K" },
  hySpread:     { id: "BAMLH0A0HYM2", units: "lin", limit: 60,  lookback: 21, label: "High Yield Spread",           unit: "%" },
  igSpread:     { id: "BAMLC0A0CM",   units: "lin", limit: 60,  lookback: 21, label: "Investment Grade Spread",     unit: "%" },
  delinq:       { id: "DRCCLACBS",    units: "lin", limit: 8,   lookback: 2,  label: "Morosidad tarjetas",          unit: "%" },
  finStress:    { id: "STLFSI4",      units: "lin", limit: 20,  lookback: 4,  label: "Estrés financiero (STL)",     unit: "idx" },
  coreCpi:      { id: "CPILFESL",     units: "pc1", limit: 15,  lookback: 3,  label: "CPI Core",                   unit: "% YoY" },
  pce:          { id: "PCEPI",        units: "pc1", limit: 15,  lookback: 3,  label: "PCE",                        unit: "% YoY" },
  corePce:      { id: "PCEPILFE",     units: "pc1", limit: 15,  lookback: 3,  label: "PCE Core",                   unit: "% YoY" },
  inflExp5y:    { id: "T5YIE",        units: "lin", limit: 60,  lookback: 21, label: "Expectativas inflación 5Y",   unit: "%" },
  inflExp10y:   { id: "T10YIE",       units: "lin", limit: 60,  lookback: 21, label: "Expectativas inflación 10Y",  unit: "%" },
  t10y3m:       { id: "T10Y3M",       units: "lin", limit: 60,  lookback: 21, label: "Curva 10Y-3M",               unit: "%" },
  dgs2:         { id: "DGS2",         units: "lin", limit: 60,  lookback: 21, label: "Treasury 2Y",                unit: "%" },
  dgs5:         { id: "DGS5",         units: "lin", limit: 60,  lookback: 21, label: "Treasury 5Y",                unit: "%" },
  dgs10:        { id: "DGS10",        units: "lin", limit: 60,  lookback: 21, label: "Treasury 10Y",               unit: "%" },
  dgs30:        { id: "DGS30",        units: "lin", limit: 60,  lookback: 21, label: "Treasury 30Y",               unit: "%" },
  indProd:      { id: "INDPRO",       units: "pc1", limit: 15,  lookback: 3,  label: "Producción industrial",       unit: "% YoY" },
  capUtil:      { id: "TCU",          units: "lin", limit: 12,  lookback: 3,  label: "Utilización capacidad",       unit: "%" },
  retail:       { id: "RSXFS",        units: "pc1", limit: 15,  lookback: 3,  label: "Ventas minoristas",           unit: "% YoY" },
  houst:        { id: "HOUST",        units: "pc1", limit: 15,  lookback: 3,  label: "Inicio construcciones",       unit: "% YoY" },
  permit:       { id: "PERMIT",       units: "pc1", limit: 15,  lookback: 3,  label: "Permisos construcción",       unit: "% YoY" },
  umcsent:      { id: "UMCSENT",      units: "lin", limit: 12,  lookback: 3,  label: "Confianza consumidor (Mich.)",unit: "idx" },
  m2:           { id: "M2SL",         units: "pc1", limit: 15,  lookback: 3,  label: "M2",                         unit: "% YoY" },
  ciCredit:     { id: "TOTCI",        units: "pc1", limit: 15,  lookback: 3,  label: "Crédito C&I",                unit: "% YoY" },
  bizLoans:     { id: "BUSLOANS",     units: "pc1", limit: 15,  lookback: 3,  label: "Préstamos a empresas",        unit: "% YoY" },
}

// ── Fetch JSON desde la API oficial ──────────────────────────────────────────
async function fetchFred(cfg: SeriesCfg): Promise<Array<{ date: string; value: number }>> {
  const apiKey = process.env.FRED_API_KEY
  try {
    const since = new Date()
    since.setFullYear(since.getFullYear() - 4)
    const start = since.toISOString().split("T")[0]

    let url: string
    if (apiKey) {
      url = `https://api.stlouisfed.org/fred/series/observations?series_id=${cfg.id}&api_key=${apiKey}&file_type=json&units=${cfg.units}&observation_start=${start}&sort_order=asc&limit=${cfg.limit}`
    } else {
      // Fallback al CSV público si no hay API key (sin transformaciones)
      url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${cfg.id}&observation_start=${start}`
    }

    const res = await fetch(url, { next: { revalidate: 43200 } })
    if (!res.ok) return []

    if (apiKey) {
      const json = await res.json() as { observations?: Array<{ date: string; value: string }> }
      return (json.observations ?? [])
        .map(o => {
          const v = parseFloat(o.value)
          return isNaN(v) ? null : { date: o.date, value: v }
        })
        .filter(Boolean) as Array<{ date: string; value: number }>
    } else {
      // Parsear CSV
      const text = await res.text()
      return text.trim().split("\n").slice(1)
        .map(line => {
          const [date, raw] = line.split(",")
          const value = parseFloat(raw)
          return isNaN(value) ? null : { date: date.trim(), value }
        })
        .filter(Boolean) as Array<{ date: string; value: number }>
    }
  } catch {
    return []
  }
}

// ── Construir MacroIndicator desde serie ─────────────────────────────────────
function toIndicator(
  series: Array<{ date: string; value: number }>,
  cfg: SeriesCfg
): MacroIndicator | null {
  if (series.length < cfg.lookback + 1) return null
  const last  = series[series.length - 1]
  const prev  = series[Math.max(0, series.length - 1 - cfg.lookback)]
  const delta = last.value - prev.value
  const threshold = cfg.unit === "%" || cfg.unit === "% YoY" ? 0.15 : 1.0
  return {
    value: parseFloat(last.value.toFixed(2)),
    prev:  parseFloat(prev.value.toFixed(2)),
    trend: delta > threshold ? "up" : delta < -threshold ? "down" : "stable",
    label: cfg.label,
    unit:  cfg.unit,
    date:  last.date,
  }
}

// ── Función principal ─────────────────────────────────────────────────────────
export async function fetchMacroData(): Promise<MacroData> {
  const keys = Object.keys(SERIES) as Array<keyof typeof SERIES>
  const results = await Promise.all(keys.map(k => fetchFred(SERIES[k])))
  const map = Object.fromEntries(keys.map((k, i) => [k, results[i]])) as Record<keyof typeof SERIES, Array<{ date: string; value: number }>>

  const ind = (k: keyof typeof SERIES) => toIndicator(map[k], SERIES[k])

  return {
    gdpGrowth:    ind("gdp"),
    inflation:    ind("cpi"),
    unemployment: ind("unrate"),
    fedRate:      ind("fedfunds"),
    yieldCurve:   ind("t10y2y"),

    nfp:          ind("nfp"),
    joblessClaims:ind("icsa"),
    u6Rate:       ind("u6rate"),
    jolts:        ind("jolts"),

    hySpread:     ind("hySpread"),
    igSpread:     ind("igSpread"),
    creditDelinq: ind("delinq"),
    finStress:    ind("finStress"),

    coreInflation:ind("coreCpi"),
    pce:          ind("pce"),
    corePce:      ind("corePce"),
    inflExp5y:    ind("inflExp5y"),
    inflExp10y:   ind("inflExp10y"),

    yc10y3m:      ind("t10y3m"),
    treasury2y:   ind("dgs2"),
    treasury5y:   ind("dgs5"),
    treasury10y:  ind("dgs10"),
    treasury30y:  ind("dgs30"),

    indProd:      ind("indProd"),
    capUtil:      ind("capUtil"),
    retailSales:  ind("retail"),
    housStarts:   ind("houst"),
    buildPermits: ind("permit"),
    consumerSent: ind("umcsent"),

    m2:           ind("m2"),
    ciCredit:     ind("ciCredit"),
    bizLoans:     ind("bizLoans"),

    fetchedAt: new Date().toISOString(),
  }
}

// ── Macro Score institucional ─────────────────────────────────────────────────

export type MacroScore = {
  score:        number   // 0-100
  regime:       "RISK ON" | "NEUTRAL" | "RISK OFF"
  volDirection: "EXPANDING" | "STABLE" | "COMPRESSING"
  components: {
    growth:     number   // 0-100
    labor:      number   // 0-100
    credit:     number   // 0-100
    inflation:  number   // 0-100
    volatility: number   // 0-100
  }
}

export type ExpectationShift = {
  score:           number   // -100 a +100
  label:           "HAWKISH SHOCK" | "DOVISH SHIFT" | "NEUTRAL"
  fedBias:         "HAWKISH" | "NEUTRAL" | "DOVISH"
  breakevens:      "RISING" | "STABLE" | "FALLING"
  yieldCurveTrend: "STEEPENING" | "STABLE" | "FLATTENING"
  shocks:          string[]
}

function clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)) }
function avg(vals: (number | null | undefined)[]): number {
  const valid = vals.filter((v): v is number => v != null)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 50
}

export function computeMacroScore(
  data: MacroData,
  vix:   number | null = null,
  vix9d: number | null = null,
  vix3m: number | null = null,
): MacroScore {
  // ── Crecimiento (20%) ──────────────────────────────────────────────────────
  const gdpScore = (() => {
    const v = data.gdpGrowth?.value
    if (v == null) return null
    const base = v < 0 ? 10 : v < 1 ? 30 : v < 1.5 ? 45 : v < 2.5 ? 65 : v < 3.5 ? 80 : 90
    return clamp(base + (data.gdpGrowth?.trend === "up" ? 5 : data.gdpGrowth?.trend === "down" ? -8 : 0))
  })()
  const nfpScore = (() => {
    const v = data.nfp?.value
    if (v == null) return null
    return clamp(v < -1 ? 15 : v < 0 ? 30 : v < 1 ? 50 : v < 2 ? 65 : 80)
  })()
  const retailScore = (() => {
    const v = data.retailSales?.value
    if (v == null) return null
    return clamp(v < -2 ? 20 : v < 0 ? 35 : v < 2 ? 55 : v < 5 ? 70 : 80)
  })()
  const growthScore = clamp(avg([gdpScore, nfpScore, retailScore]))

  // ── Mercado laboral (15%) ──────────────────────────────────────────────────
  const unempScore = (() => {
    const v = data.unemployment?.value
    if (v == null) return null
    const base = v < 3.5 ? 90 : v < 4 ? 80 : v < 5 ? 62 : v < 6 ? 42 : 20
    return clamp(base + (data.unemployment?.trend === "down" ? 8 : data.unemployment?.trend === "up" ? -12 : 0))
  })()
  const claimsScore = (() => {
    if (!data.joblessClaims) return null
    return clamp(data.joblessClaims.trend === "down" ? 75 : data.joblessClaims.trend === "up" ? 35 : 55)
  })()
  const laborScore = clamp(avg([unempScore, claimsScore]))

  // ── Crédito (25%) ─────────────────────────────────────────────────────────
  const hyScore = (() => {
    const v = data.hySpread?.value
    if (v == null) return null
    const base = v < 3 ? 90 : v < 3.5 ? 80 : v < 4.5 ? 62 : v < 6 ? 38 : v < 8 ? 20 : 8
    return clamp(base + (data.hySpread?.trend === "down" ? 8 : data.hySpread?.trend === "up" ? -12 : 0))
  })()
  const stressScore = (() => {
    const v = data.finStress?.value
    if (v == null) return null
    return clamp(v < -1 ? 88 : v < -0.5 ? 72 : v < 0 ? 60 : v < 0.5 ? 44 : v < 1 ? 28 : 12)
  })()
  const delinqScore = (() => {
    const v = data.creditDelinq?.value
    if (v == null) return null
    return clamp(v < 2 ? 82 : v < 3 ? 64 : v < 4 ? 44 : 20)
  })()
  const creditScore = clamp(
    avg([
      hyScore    != null ? hyScore * 0.5    : null,
      stressScore!= null ? stressScore* 0.35 : null,
      delinqScore!= null ? delinqScore* 0.15 : null,
    ].map((v, i) => {
      if (v == null) return null
      const weights = [0.5, 0.35, 0.15]
      const raws    = [hyScore, stressScore, delinqScore]
      return raws[i] != null ? raws[i]! : null
    }))
  )

  // ── Inflación / Fed (20%) ──────────────────────────────────────────────────
  const cpiScore = (() => {
    const v = data.inflation?.value
    if (v == null) return null
    return clamp(v < 1 ? 55 : v < 1.5 ? 65 : v < 2 ? 80 : v < 2.5 ? 88 : v < 3 ? 72 : v < 4 ? 52 : v < 5 ? 32 : 15)
  })()
  const ycScore = (() => {
    const v = data.yieldCurve?.value
    if (v == null) return null
    return clamp(v < -1.5 ? 8 : v < -0.5 ? 20 : v < 0 ? 35 : v < 0.5 ? 52 : v < 1.5 ? 68 : 80)
  })()
  const fedScore = (() => {
    const trend = data.fedRate?.trend
    return trend === "up" ? 38 : trend === "down" ? 62 : 55
  })()
  const inflationScore = clamp(avg([
    cpiScore != null ? cpiScore * 0.3  : null,
    ycScore  != null ? ycScore  * 0.45 : null,
    fedScore * 0.25,
  ].map((v, i) => {
    const raws    = [cpiScore, ycScore, fedScore]
    const weights = [0.3, 0.45, 0.25]
    return raws[i] != null ? raws[i]! : null
  })))

  // ── Volatilidad (20%) ─────────────────────────────────────────────────────
  const vixScore = (() => {
    if (vix == null) return null
    return clamp(vix < 12 ? 92 : vix < 15 ? 80 : vix < 18 ? 68 : vix < 22 ? 52 : vix < 28 ? 36 : vix < 35 ? 20 : 8)
  })()
  const termScore = (() => {
    if (vix9d == null || vix3m == null) return null
    return clamp(vix9d < vix3m * 0.95 ? 78 : vix9d < vix3m ? 62 : vix9d < vix3m * 1.1 ? 42 : 22)
  })()
  const volatilityScore = clamp(avg([vixScore, termScore, stressScore != null ? 100 - stressScore * 0.5 : null]))

  // ── Score final ponderado ──────────────────────────────────────────────────
  const weights  = [0.20, 0.15, 0.25, 0.20, 0.20]
  const scores   = [growthScore, laborScore, creditScore, inflationScore, volatilityScore]
  const total    = clamp(Math.round(scores.reduce((s, v, i) => s + v * weights[i], 0)))
  const regime   = total >= 60 ? "RISK ON" : total >= 40 ? "NEUTRAL" : "RISK OFF"

  // ── Dirección de volatilidad ───────────────────────────────────────────────
  let volDirection: "EXPANDING" | "STABLE" | "COMPRESSING" = "STABLE"
  const volSignals = [
    vix9d != null && vix3m != null && vix9d > vix3m  ? 1 : 0,
    data.hySpread?.trend === "up"    ? 1 : 0,
    data.finStress?.trend === "up"   ? 1 : 0,
  ]
  const volCompressed = [
    vix9d != null && vix3m != null && vix9d < vix3m * 0.95 ? 1 : 0,
    data.hySpread?.trend === "down"  ? 1 : 0,
    data.finStress?.trend === "down" ? 1 : 0,
  ]
  if (volSignals.reduce((a, b) => a + b, 0) >= 2)    volDirection = "EXPANDING"
  else if (volCompressed.reduce((a, b) => a + b, 0) >= 2) volDirection = "COMPRESSING"

  return {
    score: total,
    regime,
    volDirection,
    components: {
      growth:     Math.round(growthScore),
      labor:      Math.round(laborScore),
      credit:     Math.round(creditScore),
      inflation:  Math.round(inflationScore),
      volatility: Math.round(volatilityScore),
    },
  }
}

export function computeExpectationShift(
  data:  MacroData,
  vix:   number | null = null,
  vix9d: number | null = null,
  vix3m: number | null = null,
): ExpectationShift {
  let score = 0
  const shocks: string[] = []

  // Fed bias ─────────────────────────────────────────────────────────────────
  let fedBias: "HAWKISH" | "NEUTRAL" | "DOVISH" = "NEUTRAL"
  if (data.fedRate?.trend === "up") {
    score -= 28; fedBias = "HAWKISH"
    shocks.push(`Fed subiendo tasas (${data.fedRate.value.toFixed(2)}%) → presión sobre activos de riesgo`)
  } else if (data.fedRate?.trend === "down") {
    score += 18; fedBias = "DOVISH"
    shocks.push(`Fed recortando tasas (${data.fedRate.value.toFixed(2)}%) → estímulo monetario activo`)
  }

  // Breakevens ───────────────────────────────────────────────────────────────
  let breakevens: "RISING" | "STABLE" | "FALLING" = "STABLE"
  if (data.inflExp5y?.trend === "up") {
    score -= 18; breakevens = "RISING"
    shocks.push(`Expectativas inflación 5Y subiendo a ${data.inflExp5y.value.toFixed(2)}% — mercado desconfía de la Fed`)
  } else if (data.inflExp5y?.trend === "down") {
    score += 12; breakevens = "FALLING"
  }

  // Curva de tasas ───────────────────────────────────────────────────────────
  let yieldCurveTrend: "STEEPENING" | "STABLE" | "FLATTENING" = "STABLE"
  if (data.yieldCurve?.trend === "up") {
    score += 18; yieldCurveTrend = "STEEPENING"
    shocks.push(`Curva steepening (${data.yieldCurve.value.toFixed(2)}%) → expectativas de crecimiento mejorando`)
  } else if (data.yieldCurve?.trend === "down") {
    score -= 22; yieldCurveTrend = "FLATTENING"
    shocks.push(`Curva aplanándose/invirtiendo (${data.yieldCurve.value.toFixed(2)}%) → mercado anticipa desaceleración`)
  }

  // HY Spread ────────────────────────────────────────────────────────────────
  if (data.hySpread?.trend === "up") {
    score -= 22
    shocks.push(`HY Spread ampliándose a ${data.hySpread.value.toFixed(2)}% — apetito de riesgo cayendo`)
  } else if (data.hySpread?.trend === "down") {
    score += 18
  }

  // VIX term structure ───────────────────────────────────────────────────────
  if (vix9d != null && vix3m != null) {
    if (vix9d > vix3m * 1.05) {
      score -= 15
      shocks.push(`VIX near-term (${vix9d.toFixed(1)}) > VIX3M (${vix3m.toFixed(1)}) — stress de corto plazo`)
    } else if (vix9d < vix3m * 0.92) {
      score += 10
    }
  }

  // Treasury 2Y (sensible a expectativas Fed) ────────────────────────────────
  if (data.treasury2y?.trend === "up") {
    score -= 12
    shocks.push(`Treasury 2Y subiendo a ${data.treasury2y.value.toFixed(2)}% — mercado premia tasas altas por más tiempo`)
  } else if (data.treasury2y?.trend === "down") {
    score += 10
  }

  const finalScore = clamp(score, -100, 100)
  const label = finalScore <= -35 ? "HAWKISH SHOCK" : finalScore >= 30 ? "DOVISH SHIFT" : "NEUTRAL"

  return {
    score: finalScore,
    label,
    fedBias,
    breakevens,
    yieldCurveTrend,
    shocks: shocks.slice(0, 4),
  }
}

// ── Detección de fase mejorada ────────────────────────────────────────────────
export function detectPhase(data: MacroData): PhaseDetection {
  const pts: Record<Phase, number> = { recovery: 0, expansion: 0, late: 0, recession: 0 }
  const signals: string[] = []

  const gdp        = data.gdpGrowth?.value    ?? null
  const cpi        = data.inflation?.value    ?? null
  const unemp      = data.unemployment?.value ?? null
  const fed        = data.fedRate?.value      ?? null
  const yc         = data.yieldCurve?.value   ?? null
  const t10y3m     = data.yc10y3m?.value      ?? null
  const hySpread   = data.hySpread?.value     ?? null
  const finStress  = data.finStress?.value    ?? null
  const capUtil    = data.capUtil?.value       ?? null
  const sentiment  = data.consumerSent?.value ?? null
  const inflExp5y  = data.inflExp5y?.value    ?? null
  const nfp        = data.nfp?.value          ?? null
  const delinq     = data.creditDelinq?.value ?? null
  const m2         = data.m2?.value           ?? null
  const retail     = data.retailSales?.value  ?? null
  const indProd    = data.indProd?.value      ?? null

  // ── PIB ───────────────────────────────────────────────────────────────────
  if (gdp !== null) {
    if (gdp < 0)         { pts.recession += 3; signals.push(`PIB negativo ${gdp.toFixed(1)}% — contracción real`) }
    else if (gdp < 1.5)  { pts.recovery  += 2; signals.push(`PIB débil ${gdp.toFixed(1)}% — recuperación incipiente`) }
    else if (gdp < 2.5)  { pts.recovery  += 1 }
    else if (gdp < 4.0)  { pts.expansion += 2; signals.push(`PIB sólido ${gdp.toFixed(1)}%`) }
    else                 { pts.late += 1; pts.expansion += 1; signals.push(`PIB muy fuerte ${gdp.toFixed(1)}% — posible sobrecalentamiento`) }
    if (data.gdpGrowth?.trend === "down") { pts.late += 1; signals.push("PIB desacelerando") }
    if (data.gdpGrowth?.trend === "up")   { pts.recovery += 1 }
  }

  // ── INFLACIÓN ─────────────────────────────────────────────────────────────
  if (cpi !== null) {
    if (cpi > 5)         { pts.late += 3; signals.push(`CPI alto ${cpi.toFixed(1)}% — inflación fuera de control`) }
    else if (cpi > 3)    { pts.late += 1; pts.expansion += 1; signals.push(`CPI moderado-alto ${cpi.toFixed(1)}%`) }
    else if (cpi < 1.5)  { pts.recovery += 2; signals.push(`CPI bajo ${cpi.toFixed(1)}% — economía fría`) }
    else                 { pts.expansion += 1 }
  }

  // ── DESEMPLEO ─────────────────────────────────────────────────────────────
  if (unemp !== null) {
    if (unemp > 6 && data.unemployment?.trend === "up")
      { pts.recession += 3; signals.push(`Desempleo ${unemp.toFixed(1)}% y subiendo rápido`) }
    else if (unemp > 6)
      { pts.recession += 1 }
    else if (unemp < 4 && data.unemployment?.trend !== "up")
      { pts.expansion += 2; signals.push(`Desempleo bajo ${unemp.toFixed(1)}% — mercado laboral fuerte`) }
    else if (data.unemployment?.trend === "down")
      { pts.recovery += 2; signals.push(`Desempleo mejorando a ${unemp.toFixed(1)}%`) }
    else if (unemp > 5)
      { pts.recession += 1 }
  }

  // ── FED RATE ──────────────────────────────────────────────────────────────
  if (fed !== null) {
    if (fed > 4.5)       { pts.late += 2; signals.push(`Tasas restrictivas ${fed.toFixed(2)}%`) }
    else if (fed > 3)    { pts.late += 1; pts.expansion += 1 }
    else if (fed < 1)    { pts.recovery += 2; signals.push(`Tasas en mínimos ${fed.toFixed(2)}% — estímulo monetario`) }
    if (data.fedRate?.trend === "down") { pts.recession += 1; signals.push("Fed recortando tasas — señal de alerta") }
    if (data.fedRate?.trend === "up")   { pts.late += 1 }
  }

  // ── CURVA 10Y-2Y ─────────────────────────────────────────────────────────
  if (yc !== null) {
    if (yc < -1.0)       { pts.recession += 2; signals.push(`Curva 10Y-2Y invertida ${yc.toFixed(2)}%`) }
    else if (yc < 0)     { pts.late += 2; signals.push(`Curva 10Y-2Y negativa ${yc.toFixed(2)}%`) }
    else if (yc < 0.5)   { pts.late += 1 }
    else if (yc > 1.5)   { pts.recovery += 1; pts.expansion += 1; signals.push(`Curva positiva ${yc.toFixed(2)}%`) }
    else                 { pts.expansion += 1 }
  }

  // ── CURVA 10Y-3M (mejor predictor histórico) ─────────────────────────────
  if (t10y3m !== null) {
    if (t10y3m < -1.5)   { pts.recession += 3; signals.push(`Curva 10Y-3M fuertemente invertida ${t10y3m.toFixed(2)}% — señal histórica de recesión`) }
    else if (t10y3m < -0.5) { pts.recession += 2; signals.push(`Curva 10Y-3M invertida ${t10y3m.toFixed(2)}%`) }
    else if (t10y3m < 0) { pts.late += 2 }
    else if (t10y3m > 1.5) { pts.expansion += 1 }
  }

  // ── HIGH YIELD SPREAD (apetito de riesgo) ─────────────────────────────────
  if (hySpread !== null) {
    if (hySpread > 8)    { pts.recession += 3; signals.push(`HY Spread ${hySpread.toFixed(2)}% — mercado anticipa defaults masivos`) }
    else if (hySpread > 6) { pts.recession += 2; signals.push(`HY Spread elevado ${hySpread.toFixed(2)}% — estrés crediticio`) }
    else if (hySpread > 4.5) { pts.late += 2; signals.push(`HY Spread ampliándose ${hySpread.toFixed(2)}%`) }
    else if (hySpread < 3) { pts.expansion += 2; signals.push(`HY Spread bajo ${hySpread.toFixed(2)}% — apetito de riesgo alto`) }
    else if (hySpread < 3.5) { pts.expansion += 1 }
    if (data.hySpread?.trend === "up")   { pts.late += 1; signals.push("HY Spread ampliándose — alerta crediticia") }
    if (data.hySpread?.trend === "down") { pts.recovery += 1 }
  }

  // ── ESTRÉS FINANCIERO (STL FSI) ───────────────────────────────────────────
  if (finStress !== null) {
    if (finStress > 1.5) { pts.recession += 3; signals.push(`Estrés financiero extremo ${finStress.toFixed(2)}`) }
    else if (finStress > 0.5) { pts.late += 2; signals.push(`Estrés financiero elevado ${finStress.toFixed(2)}`) }
    else if (finStress > 0) { pts.late += 1 }
    else if (finStress < -1.0) { pts.expansion += 2; signals.push(`Condiciones financieras muy relajadas ${finStress.toFixed(2)}`) }
    else if (finStress < -0.5) { pts.expansion += 1 }
  }

  // ── UTILIZACIÓN DE CAPACIDAD ──────────────────────────────────────────────
  if (capUtil !== null) {
    if (capUtil > 80)    { pts.late += 1; signals.push(`Utilización capacidad alta ${capUtil.toFixed(1)}% — economía operando al límite`) }
    else if (capUtil < 70) { pts.recession += 2; signals.push(`Utilización capacidad baja ${capUtil.toFixed(1)}% — industria debilitada`) }
    else if (capUtil < 75) { pts.recession += 1 }
    else if (capUtil >= 77) { pts.expansion += 1 }
  }

  // ── CONFIANZA DEL CONSUMIDOR ──────────────────────────────────────────────
  if (sentiment !== null) {
    if (sentiment > 95)  { pts.expansion += 2; signals.push(`Confianza consumidor alta ${sentiment.toFixed(0)}`) }
    else if (sentiment > 85) { pts.expansion += 1 }
    else if (sentiment < 60) { pts.recession += 3; signals.push(`Confianza consumidor muy baja ${sentiment.toFixed(0)} — contracción del gasto`) }
    else if (sentiment < 70) { pts.recession += 1; signals.push(`Confianza consumidor débil ${sentiment.toFixed(0)}`) }
    if (data.consumerSent?.trend === "up")   { pts.recovery += 1 }
    if (data.consumerSent?.trend === "down") { pts.late     += 1 }
  }

  // ── EXPECTATIVAS DE INFLACIÓN ─────────────────────────────────────────────
  if (inflExp5y !== null) {
    if (inflExp5y > 3.2) { pts.late += 2; signals.push(`Expectativas inflación 5Y ${inflExp5y.toFixed(2)}% — mercado desconfía de la Fed`) }
    else if (inflExp5y > 2.5) { pts.late += 1 }
    else if (inflExp5y < 1.8) { pts.recovery += 1 }
  }

  // ── NFP (crecimiento nóminas) ─────────────────────────────────────────────
  if (nfp !== null) {
    if (nfp < -1)        { pts.recession += 2; signals.push(`Nóminas contrayéndose ${nfp.toFixed(1)}% YoY`) }
    else if (nfp < 0)    { pts.recession += 1 }
    else if (nfp > 2.5)  { pts.expansion += 1 }
    if (data.nfp?.trend === "down") { pts.late += 1 }
  }

  // ── MOROSIDAD TARJETAS ────────────────────────────────────────────────────
  if (delinq !== null) {
    if (delinq > 4.5)    { pts.recession += 2; signals.push(`Morosidad tarjetas ${delinq.toFixed(1)}% — estrés financiero hogares`) }
    else if (delinq > 3.5) { pts.late += 1 }
    else if (delinq < 2.5) { pts.expansion += 1 }
  }

  // ── M2 ────────────────────────────────────────────────────────────────────
  if (m2 !== null) {
    if (m2 < -2)         { pts.late += 2; signals.push(`M2 contrayéndose ${m2.toFixed(1)}% YoY — condiciones monetarias muy restrictivas`) }
    else if (m2 > 8)     { pts.recovery += 1; pts.expansion += 1; signals.push(`M2 creciendo ${m2.toFixed(1)}% YoY — liquidez abundante`) }
  }

  // ── VENTAS MINORISTAS ─────────────────────────────────────────────────────
  if (retail !== null) {
    if (retail < -2)     { pts.recession += 1; signals.push(`Ventas minoristas cayendo ${retail.toFixed(1)}%`) }
    else if (retail > 5) { pts.expansion += 1 }
  }

  // ── PRODUCCIÓN INDUSTRIAL ────────────────────────────────────────────────
  if (indProd !== null) {
    if (indProd < -2)    { pts.recession += 1; signals.push(`Producción industrial cayendo ${indProd.toFixed(1)}%`) }
    else if (indProd > 4) { pts.expansion += 1 }
  }

  // ── Determinar fase ───────────────────────────────────────────────────────
  const sorted = (Object.entries(pts) as [Phase, number][]).sort(([, a], [, b]) => b - a)
  const winner = sorted[0][0]
  const total  = Object.values(pts).reduce((a, b) => a + b, 0)
  const confidence = total > 0 ? Math.round((sorted[0][1] / total) * 100) : 50

  return { phase: winner, confidence, signals: signals.slice(0, 6), breakdown: pts }
}
