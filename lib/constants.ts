// ── Tamaño de empresa ─────────────────────────────────────────────────────────
export const MICRO_CAP_MAX  = 300e6   // < 300M = Micro Cap
export const SMALL_CAP_MAX  = 2e9     // < 2B   = Small Cap
export const MID_CAP_MAX    = 10e9    // < 10B  = Mid Cap

export const CAP_FACTOR_MICRO = 0.70  // reduce exigencia de breakpoints para micro cap
export const CAP_FACTOR_SMALL = 0.85  // reduce exigencia para small cap

// ── Thresholds de grades ──────────────────────────────────────────────────────
export const GRADE_A_PLUS = 85
export const GRADE_A      = 70
export const GRADE_B      = 55
export const GRADE_C      = 40
export const GRADE_D      = 25

// ── Thresholds de Buy Ready ───────────────────────────────────────────────────
export const BUY_READY_QUALITY_MIN = 65   // qualityScore mínimo para Buy Ready
export const BUY_READY_PRICE_MIN   = 45   // priceScore mínimo para Buy Ready
export const BUY_READY_DROP_MAX    = -10  // caída desde máximos mínima requerida (%)

// ── Scoring de datos faltantes ────────────────────────────────────────────────
// Penalización leve cuando no hay dato — más honesto que neutral (50)
export const MISSING_DATA_SCORE = 35

// ── Analistas ─────────────────────────────────────────────────────────────────
export const MIN_ANALYST_COUNT   = 3    // mínimo para que el upside sea señal confiable
export const WEAK_ANALYST_FACTOR = 0.6  // 1-2 analistas vale 60% del score

// ── Consenso de analistas (escenario de precios objetivo) ─────────────────────
// Pesos base de los tres escenarios (bajista/base/alcista) antes del sesgo por rating.
export const SCENARIO_WEIGHT_BEAR = 0.25
export const SCENARIO_WEIGHT_BASE = 0.50
export const SCENARIO_WEIGHT_BULL = 0.25

// Cuánto puede reasignar el rating de consenso entre bear y bull.
// recommendationMean 1 (strong buy) → +15pp al bull; 5 (sell) → +15pp al bear.
export const SCENARIO_RATING_TILT = 0.15
export const SCENARIO_WEIGHT_MIN  = 0.05  // ningún escenario baja de 5%
export const SCENARIO_WEIGHT_MAX  = 0.60  // ni supera 60%

// Dispersión = (high − low) / base × 100. Umbrales de etiqueta.
export const DISPERSION_TIGHT = 25   // < 25% → consenso apretado
export const DISPERSION_WIDE  = 50   // ≥ 50% → analistas divididos

// Peso del rating (buy/hold/sell) dentro del score de analistas.
// El 75% restante lo aporta el upside esperado del escenario.
export const RATING_BLEND_WEIGHT = 0.25

// Confianza mínima aplicable como factor al score de analistas — evita que una
// cobertura pobre anule del todo la señal.
export const CONSENSUS_CONFIDENCE_FLOOR = 0.45

// ── Calidad de earnings (FCF vs Net Income) ────────────────────────────────────
// FCF / NetIncome — mide si las ganancias contables se convierten en cash real
export const FCF_CONVERSION_GREAT = 1.20  // FCF > 120% NetIncome: earnings muy conservadores
export const FCF_CONVERSION_GOOD  = 0.80  // FCF > 80% NetIncome: calidad aceptable
export const FCF_CONVERSION_WEAK  = 0.40  // FCF < 40% NetIncome: ganancias dudosas

// ── Insider Ownership ─────────────────────────────────────────────────────────
// heldPercentInsiders — alineación de intereses management/accionistas
export const INSIDER_OWNERSHIP_GREAT = 0.15  // 15%+ — management muy comprometido
export const INSIDER_OWNERSHIP_GOOD  = 0.05  // 5%+ — señal positiva de alineación

// ── Moat cuantitativo ─────────────────────────────────────────────────────────
// Prima de ROIC sobre el breakpoint "bueno" del sector (en pp)
export const ROIC_PREMIUM_STRONG = 8   // ROIC 8pp sobre el umbral → moat demostrado
export const ROIC_PREMIUM_GREAT  = 15  // ROIC 15pp sobre el umbral → moat excepcional
