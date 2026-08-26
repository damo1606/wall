// SORE — Systematic Options Revenue Engine.
//
// Cosecha de volatilidad, NO señal direccional: decide si el entorno permite
// vender prima y con qué estructura. Tres subscores alimentan uno compuesto:
//
//   DSS  Dealer Stabilization Score — ¿los dealers amortiguan el precio?
//   VSS  Volatility Suppression Score — ¿la vol está elevada sin llegar al pánico?
//   VRP  Vol Risk Premium proxy — ¿cuánta prima hay sobre la vol realizada?
//   CSS  Composite = 35% DSS + 35% VSS + 30% VRP
//
// Función pura: no toca red ni base de datos. Vivía dentro de
// app/api/scanner-pro/route.ts, donde no se podía testear.

// ── Umbrales ─────────────────────────────────────────────────────────────────
// Los tres números que deciden si se opera. Nombrados porque cambiarlos altera
// todas las señales históricas y conviene que se vea en el diff.
export const CSS_MIN_OPERABLE = 45   // por debajo, ni siquiera se plantea
export const CSS_WAIT         = 55   // a partir de aquí, estructura conservadora
export const CSS_GO           = 75   // a partir de aquí, GO si el DSS acompaña
export const DSS_MIN_GO       = 65   // GO exige además dealers estabilizando

// Bans de venta desnuda (fuerzan riesgo definido)
export const SHORT_FLOAT_BAN_NAKED = 0.20  // SI/float > 20% → squeeze risk
export const SHORT_FLOAT_CAP_VRP   = 0.15  // SI/float > 15% → el VRP no es vendible
export const INSIDER_BAN_NAKED     = -0.7  // insider selling fuerte

// Items 8-K que fuerzan AVOID (vol explosion / tail / earnings / M&A / dilución).
// El resto de items persistidos (5.02 exec, 5.07 voto, 7.01 Reg FD, 8.01 catch-all)
// son rutinarios → capan el gate a WAIT en vez de bloquear todo.
export const HARD_EVENT_ITEMS = new Set([
  "1.03", "2.04", "3.01", "4.02", "2.06", "2.05", "2.02", "5.01", "1.01", "2.01", "3.02", "1.05",
])

// ── Tipos ────────────────────────────────────────────────────────────────────

export type SoreGate = "GO" | "WAIT" | "AVOID"

export type SoreStrategy =
  | "SHORT STRANGLE" | "IRON CONDOR" | "BWB" | "CREDIT SPREAD" | "CALENDAR" | "AVOID"

export type SoreInput = {
  m1NetGex: number
  m1Pressure: number
  m1Pcr: number
  m6Vix: number
  m6FearScore: number
  m6Regime: string
  m6Suspended: boolean
  m5Score: number
  /** EDGAR F1: −1..+1, net flow de insiders vs market cap (tanh). null = neutral. */
  insiderSignal?: number | null
  /** EDGAR F2: 0..1, acciones en corto sobre el float. null = neutral. */
  shortRatioFloat?: number | null
  /** M1: 8-K rutinario (no distress) → capa el gate a WAIT sin forzar AVOID. */
  eventSoftCap?: boolean
}

export type SoreResult = {
  css: number
  dss: number
  vss: number
  vrp: number
  strategy: SoreStrategy
  gate: SoreGate
}

// ── Motor ────────────────────────────────────────────────────────────────────

export function computeSORE(input: SoreInput): SoreResult {
  const {
    m1NetGex, m1Pressure, m1Pcr,
    m6Vix, m6FearScore, m6Regime, m6Suspended,
    m5Score,
    insiderSignal = null,
    shortRatioFloat = null,
    eventSoftCap = false,
  } = input

  // ── DSS: Dealer Stabilization Score ────────────────────────────────────────
  // GEX > 0 = dealers long gamma = compran caídas / venden subidas = estabilizan
  const gexScore = m1NetGex > 0
    ? Math.min(100, 50 + (m1NetGex / 1e9) * 25)
    : Math.max(0, 50 + (m1NetGex / 1e9) * 15)
  const pressScore = Math.min(100, Math.max(0, (m1Pressure + 100) / 2))
  // PCR > 0.8: dealers vendieron puts = delta larga = soporte bajo el mercado
  const pcrScore = m1Pcr > 1.2 ? 70 : m1Pcr > 0.8 ? 55 : m1Pcr > 0.5 ? 40 : 25
  // F1: insider selling fuerte hunde el DSS
  const insiderScore = insiderSignal == null ? 50 : Math.round((insiderSignal + 1) * 50)
  const dss = Math.round(0.35 * gexScore + 0.30 * pressScore + 0.20 * pcrScore + 0.15 * insiderScore)

  // ── VSS: Volatility Suppression Score ──────────────────────────────────────
  // fearScore 30–55 = IV elevada sin pánico = ventana ideal para vender prima
  const ivScore =
    m6FearScore < 20 ? 15
    : m6FearScore < 35 ? 78
    : m6FearScore < 55 ? 65
    : m6FearScore < 70 ? 45
    : 25
  const regimeScore =
    m6Regime === "COMPRESIÓN" ? 90
    : m6Regime === "TRANSICIÓN" ? 65
    : m6Regime === "EXPANSIÓN" ? 35
    : m6Regime === "PÁNICO AGUDO" ? 10
    : m6Regime === "CRISIS SISTÉMICA" ? 5
    : 50
  // M5 cerca de neutral = rango lateral = el theta corre a favor
  const m5ConfScore = Math.abs(m5Score) < 30 ? 70 : Math.abs(m5Score) < 60 ? 50 : 28
  const vss = Math.round(0.40 * ivScore + 0.40 * regimeScore + 0.20 * m5ConfScore)

  // ── VRP: proxy de prima de riesgo de volatilidad ───────────────────────────
  // El VIX cotiza históricamente ~3-5 pts sobre la RV a 20d. VIX 12 = suelo, 37 = 100.
  let vrp = Math.round(Math.min(100, Math.max(0, (m6Vix - 12) * 4)))
  // F2: con SI/float alto el VRP del ticker no es vendible (riesgo de squeeze).
  if (shortRatioFloat != null && shortRatioFloat > SHORT_FLOAT_CAP_VRP) {
    vrp = Math.min(vrp, 30)
  }

  const css = Math.round(0.35 * dss + 0.35 * vss + 0.30 * vrp)

  // ── Hard blocks ────────────────────────────────────────────────────────────
  if (
    m6Suspended ||
    m6Regime === "PÁNICO AGUDO" ||
    m6Regime === "CRISIS SISTÉMICA" ||
    css < CSS_MIN_OPERABLE
  ) {
    return { css, dss, vss, vrp, strategy: "AVOID", gate: "AVOID" }
  }

  // F1+F2: short interest alto o insider selling fuerte → riesgo definido obligatorio
  const banNakedSells =
    (shortRatioFloat != null && shortRatioFloat > SHORT_FLOAT_BAN_NAKED) ||
    (insiderSignal != null && insiderSignal < INSIDER_BAN_NAKED)

  let strategy: SoreStrategy
  let gate: SoreGate

  if (css >= CSS_GO && dss >= DSS_MIN_GO) {
    gate = "GO"
    if (banNakedSells) {
      strategy = "IRON CONDOR"
    } else if (m6Regime === "COMPRESIÓN" && m6FearScore < 60) {
      strategy = m1Pcr > 0.9 ? "SHORT STRANGLE" : "IRON CONDOR"
    } else if (m6FearScore < 40) {
      strategy = "CALENDAR"
    } else {
      strategy = "IRON CONDOR"
    }
  } else if (css >= CSS_WAIT) {
    gate = "WAIT"
    strategy = m6Regime === "COMPRESIÓN" ? "CREDIT SPREAD" : "BWB"
  } else {
    gate = "WAIT"
    strategy = "CREDIT SPREAD"
  }

  // Un 8-K rutinario no fuerza AVOID, pero impide GO.
  if (eventSoftCap && gate === "GO") {
    gate = "WAIT"
    strategy = m6Regime === "COMPRESIÓN" ? "CREDIT SPREAD" : "BWB"
  }

  return { css, dss, vss, vrp, strategy, gate }
}
