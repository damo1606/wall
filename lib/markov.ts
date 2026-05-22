// Régimen de mercado por cadenas de Markov — port en TypeScript del modelo de
// rico-suave (app_forex_arima_garch.py). Dos bugs del original corregidos:
//   1. Convenio de índice único 0/1/2 de punta a punta (el original mezclaba
//      {-1,0,1} de get_current_state con {0,1,2} de la matriz de transición).
//   2. El z-score usa la std de las observaciones ANTERIORES (no incluye la
//      observación actual) — sin sesgo de auto-referencia.
//
// Estados: 0 = Bajista, 1 = Lateral, 2 = Alcista.

import type { PairMarkov } from "@/types/forex"

const STD_WINDOW = 20            // ventana para la desviación estándar móvil
const SIGNAL_THRESHOLD = 0.58    // prob. mínima del próximo estado para emitir señal

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

// Retornos logarítmicos de una serie de cierres.
function logReturns(closes: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]))
  }
  return r
}

/**
 * Clasifica cada retorno en estado 0/1/2 vía z-score. El z usa la std de las
 * STD_WINDOW observaciones ANTERIORES (excluye la actual).
 */
export function markovStates(returns: number[], threshold = 0.5): number[] {
  const states: number[] = []
  for (let t = 0; t < returns.length; t++) {
    if (t < STD_WINDOW) { states.push(1); continue }
    const s = stdev(returns.slice(t - STD_WINDOW, t))   // anteriores, sin t
    if (s === 0) { states.push(1); continue }
    const z = returns[t] / s
    states.push(z > threshold ? 2 : z < -threshold ? 0 : 1)
  }
  return states
}

/** Matriz de transición 3×3: matrix[i][j] = P(siguiente=j | actual=i). */
export function transitionMatrix(states: number[]): number[][] {
  const counts = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < states.length - 1; i++) {
    counts[states[i]][states[i + 1]]++
  }
  return counts.map(row => {
    const total = row[0] + row[1] + row[2]
    return total === 0 ? [1 / 3, 1 / 3, 1 / 3] : row.map(c => c / total)
  })
}

/** Estado actual: último retorno normalizado por la std de los 20 previos. */
export function currentState(returns: number[], threshold = 0.5): number {
  const n = returns.length
  if (n < STD_WINDOW + 1) return 1
  const s = stdev(returns.slice(n - 1 - STD_WINDOW, n - 1))
  if (s === 0) return 1
  const z = returns[n - 1] / s
  return z > threshold ? 2 : z < -threshold ? 0 : 1
}

/**
 * Analiza el régimen de Markov de una serie de cierres diarios.
 * `threshold` (en σ) controla la sensibilidad del estado — 0.5 por defecto:
 * más equilibrado que el 0.25 del original (que dejaba "Lateral" casi vacío).
 * Devuelve null si no hay histórico suficiente.
 */
export function analyzeMarkov(closes: number[], threshold = 0.5): PairMarkov | null {
  const returns = logReturns(closes)
  if (returns.length < 60) return null

  const states = markovStates(returns, threshold)
  const matrix = transitionMatrix(states)
  const cur = currentState(returns, threshold)
  const row = matrix[cur] ?? [1 / 3, 1 / 3, 1 / 3]
  const [probBear, probSide, probBull] = row

  const diff = probBull - probBear
  let signal: PairMarkov["signal"]
  if (probBull > SIGNAL_THRESHOLD && diff > 0.15) signal = "COMPRA"
  else if (probBear > SIGNAL_THRESHOLD && diff < -0.15) signal = "VENTA"
  else signal = "NEUTRAL"

  return {
    state: cur === 2 ? "bull" : cur === 0 ? "bear" : "side",
    signal,
    probBull,
    probSide,
    probBear,
  }
}
