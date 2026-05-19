// Pronóstico de precio — AR(p) para la media + GARCH(1,1) para la volatilidad.
// Versión pragmática en TypeScript del enfoque ARIMA+GARCH de rico-suave:
// suficiente para un cono de pronóstico, no de grado investigación.

import { logReturns, mean } from "@/lib/optimizer"

// ── Álgebra mínima ─────────────────────────────────────────────────────────

// Resuelve A·x = b por eliminación gaussiana (matrices pequeñas).
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

// Minimización Nelder-Mead (simplex) sin restricciones, sin dependencias.
function nelderMead(f: (x: number[]) => number, x0: number[], iters = 400): number[] {
  const n = x0.length
  const ALPHA = 1, GAMMA = 2, RHO = 0.5, SIGMA = 0.5
  let simplex = [x0.slice()]
  for (let i = 0; i < n; i++) {
    const p = x0.slice()
    p[i] = p[i] !== 0 ? p[i] * 1.05 + 1e-4 : 1e-3
    simplex.push(p)
  }
  let fv = simplex.map(f)
  for (let it = 0; it < iters; it++) {
    const order = fv.map((_, i) => i).sort((a, b) => fv[a] - fv[b])
    simplex = order.map(i => simplex[i])
    fv = order.map(i => fv[i])
    const centroid = new Array(n).fill(0)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n
    const worst = simplex[n]
    const reflect = centroid.map((c, j) => c + ALPHA * (c - worst[j]))
    const fr = f(reflect)
    if (fr < fv[0]) {
      const expand = centroid.map((c, j) => c + GAMMA * (reflect[j] - c))
      const fe = f(expand)
      if (fe < fr) { simplex[n] = expand; fv[n] = fe } else { simplex[n] = reflect; fv[n] = fr }
    } else if (fr < fv[n - 1]) {
      simplex[n] = reflect; fv[n] = fr
    } else {
      const contract = centroid.map((c, j) => c + RHO * (worst[j] - c))
      const fc = f(contract)
      if (fc < fv[n]) {
        simplex[n] = contract; fv[n] = fc
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[0].map((s, j) => s + SIGMA * (simplex[i][j] - s))
          fv[i] = f(simplex[i])
        }
      }
    }
  }
  let bi = 0
  for (let i = 1; i <= n; i++) if (fv[i] < fv[bi]) bi = i
  return simplex[bi]
}

// ── AR(p) por mínimos cuadrados ────────────────────────────────────────────

export type ARModel = {
  order: number
  intercept: number
  coef: number[]      // φ₁..φₚ
  residuals: number[]
  aic: number
}

// Ajusta un AR(p) por OLS sobre las observaciones t = p..n-1.
function fitAROrder(r: number[], p: number): ARModel | null {
  const n = r.length
  if (n <= p + 5) return null
  const k = p + 1
  const X: number[][] = []
  const y: number[] = []
  for (let t = p; t < n; t++) {
    const row = [1]
    for (let i = 1; i <= p; i++) row.push(r[t - i])
    X.push(row)
    y.push(r[t])
  }
  const rows = X.length
  // Ecuaciones normales: (XᵀX)·β = Xᵀy
  const XtX: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  const Xty: number[] = new Array<number>(k).fill(0)
  for (let row = 0; row < rows; row++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[row][a] * y[row]
      for (let b = 0; b < k; b++) XtX[a][b] += X[row][a] * X[row][b]
    }
  }
  const beta = solveLinear(XtX, Xty)
  if (!beta) return null
  const residuals: number[] = []
  let rss = 0
  for (let row = 0; row < rows; row++) {
    let pred = 0
    for (let a = 0; a < k; a++) pred += beta[a] * X[row][a]
    const e = y[row] - pred
    residuals.push(e)
    rss += e * e
  }
  const aic = rows * Math.log(rss / rows + 1e-300) + 2 * k
  return { order: p, intercept: beta[0], coef: beta.slice(1), residuals, aic }
}

// Selecciona el AR(p) de menor AIC entre los órdenes 0..maxP.
export function fitAR(r: number[], maxP = 5): ARModel {
  let best: ARModel | null = null
  for (let p = 0; p <= maxP; p++) {
    const m = fitAROrder(r, p)
    if (m && (!best || m.aic < best.aic)) best = m
  }
  if (!best) {
    const mu = mean(r)
    best = { order: 0, intercept: mu, coef: [], residuals: r.map(x => x - mu), aic: 0 }
  }
  return best
}

// ── GARCH(1,1) por máxima verosimilitud ────────────────────────────────────

export type GARCHModel = { omega: number; alpha: number; beta: number; variances: number[] }

// Recursión de la varianza condicional: σ²ₜ = ω + α·ε²ₜ₋₁ + β·σ²ₜ₋₁.
function garchVariances(eps: number[], omega: number, alpha: number, beta: number, v0: number): number[] {
  const v = [v0]
  for (let t = 1; t < eps.length; t++) {
    v.push(omega + alpha * eps[t - 1] * eps[t - 1] + beta * v[t - 1])
  }
  return v
}

// Ajusta GARCH(1,1) por MLE. Parametrización sin restricciones que garantiza
// ω>0, α∈(0,0.999), β∈(0, 0.999−α) → estacionariedad (α+β<1).
export function fitGARCH11(eps: number[]): GARCHModel {
  const sampleVar = Math.max(mean(eps.map(e => e * e)), 1e-10)

  const decode = (x: number[]) => {
    const omega = Math.exp(x[0])
    const alpha = 0.999 / (1 + Math.exp(-x[1]))
    const beta = (0.999 - alpha) / (1 + Math.exp(-x[2]))
    return { omega, alpha, beta }
  }
  const negLL = (x: number[]) => {
    const { omega, alpha, beta } = decode(x)
    const v = garchVariances(eps, omega, alpha, beta, sampleVar)
    let ll = 0
    for (let t = 0; t < eps.length; t++) {
      const vt = Math.max(v[t], 1e-12)
      ll += Math.log(vt) + (eps[t] * eps[t]) / vt
    }
    return Number.isFinite(ll) ? 0.5 * ll : 1e12
  }
  // x0 ≈ {ω: 5% varianza muestral, α≈0.1, β≈0.85}
  const x0 = [Math.log(sampleVar * 0.05), -2.2, 2.85]
  const sol = nelderMead(negLL, x0, 400)
  const { omega, alpha, beta } = decode(sol)
  return { omega, alpha, beta, variances: garchVariances(eps, omega, alpha, beta, sampleVar) }
}

// ── Pronóstico ─────────────────────────────────────────────────────────────

export type ForecastResult = {
  lastPrice: number
  steps: number
  futureReturns: number[]
  futurePrices: number[]
  volatility: number[]      // volatilidad diaria por paso, en %
  upperBand: number[]       // banda 95%
  lowerBand: number[]
  arOrder: number
  garch: { omega: number; alpha: number; beta: number }
  expectedMovePct: number   // movimiento esperado al horizonte
  score: number             // retorno/volatilidad del primer paso (señal a riesgo)
  observations: number
}

/**
 * Pronostica `steps` velas a partir de la serie de cierres: AR(p) proyecta la
 * senda de retornos y GARCH(1,1) la de volatilidad → precio + banda 95%.
 * Devuelve null si no hay histórico suficiente.
 */
export function forecast(closes: number[], steps = 30): ForecastResult | null {
  if (closes.length < 70) return null
  const r = logReturns(closes)
  if (r.length < 60) return null
  const lastPrice = closes[closes.length - 1]

  const ar = fitAR(r, 5)
  const garch = fitGARCH11(ar.residuals)

  // Senda de retornos (AR), iterativa.
  const history = r.slice()
  const futureReturns: number[] = []
  for (let h = 0; h < steps; h++) {
    let pred = ar.intercept
    for (let i = 0; i < ar.coef.length; i++) {
      pred += ar.coef[i] * (history[history.length - 1 - i] ?? ar.intercept)
    }
    futureReturns.push(pred)
    history.push(pred)
  }

  // Senda de varianza (GARCH): σ²ₙ₊₁ con el último shock, luego decae a la media.
  const lastVar = garch.variances[garch.variances.length - 1] ?? mean(r.map(x => x * x))
  const lastEps2 = ar.residuals.length ? ar.residuals[ar.residuals.length - 1] ** 2 : lastVar
  const variancePath: number[] = []
  let prevVar = lastVar
  for (let h = 0; h < steps; h++) {
    const v = h === 0
      ? garch.omega + garch.alpha * lastEps2 + garch.beta * lastVar
      : garch.omega + (garch.alpha + garch.beta) * prevVar
    variancePath.push(v)
    prevVar = v
  }

  // Precio + banda 95% (varianza acumulada para el cono).
  const futurePrices: number[] = []
  const upperBand: number[] = []
  const lowerBand: number[] = []
  const volatility: number[] = []
  let price = lastPrice
  let cumVar = 0
  for (let h = 0; h < steps; h++) {
    price *= Math.exp(futureReturns[h])
    cumVar += variancePath[h]
    const cumSd = Math.sqrt(cumVar)
    futurePrices.push(price)
    upperBand.push(price * Math.exp(1.96 * cumSd))
    lowerBand.push(price * Math.exp(-1.96 * cumSd))
    volatility.push(Math.sqrt(Math.max(variancePath[h], 0)) * 100)
  }

  const sd0 = Math.sqrt(Math.max(variancePath[0], 0))
  return {
    lastPrice,
    steps,
    futureReturns,
    futurePrices,
    volatility,
    upperBand,
    lowerBand,
    arOrder: ar.order,
    garch: { omega: garch.omega, alpha: garch.alpha, beta: garch.beta },
    expectedMovePct: (futurePrices[futurePrices.length - 1] / lastPrice - 1) * 100,
    score: sd0 > 0 ? futureReturns[0] / sd0 : 0,
    observations: r.length,
  }
}
