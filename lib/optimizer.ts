// Optimización de cartera — Markowitz (Monte Carlo) + HRP (Hierarchical Risk
// Parity). Portado de rico-suave (app_forex_arima_garch.py, ~líneas 1313-1435).
// Álgebra lineal pura, sin dependencias externas.

const TRADING_DAYS = 252

// PRNG sembrado (Mulberry32). Reemplaza Math.random() en el Monte Carlo para
// que el optimizador devuelva los mismos pesos ante la misma entrada — rico-suave
// no semilla su np.random.random y eso lo vuelve no reproducible.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Retornos logarítmicos de una serie de cierres.
export function logReturns(closes: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]))
  }
  return r
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

// Covarianza muestral entre dos series (se usa la longitud común mínima).
function cov(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  const ma = mean(a.slice(0, n))
  const mb = mean(b.slice(0, n))
  let s = 0
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb)
  return s / (n - 1)
}

// Matriz de covarianzas de un conjunto de series de retornos.
export function covarianceMatrix(returns: number[][]): number[][] {
  return returns.map(ri => returns.map(rj => cov(ri, rj)))
}

// Matriz de correlaciones derivada de la de covarianzas.
export function correlationMatrix(returns: number[][]): number[][] {
  const cv = covarianceMatrix(returns)
  return cv.map((row, i) =>
    row.map((_, j) => {
      const d = Math.sqrt(cv[i][i] * cv[j][j])
      return d > 0 ? cv[i][j] / d : 0
    }),
  )
}

export type OptimizedPortfolio = {
  weights: number[]    // alineados al orden de `returns`
  return: number       // retorno esperado anualizado
  volatility: number   // volatilidad anualizada
  sharpe: number
}

/**
 * Markowitz por simulación Monte Carlo (igual que rico-suave): genera
 * `nPortfolios` carteras de pesos aleatorios y devuelve la de máximo Sharpe
 * y la de mínima volatilidad.
 *
 * `seed` controla el PRNG → la misma entrada produce los mismos pesos.
 * (rico-suave usa np.random.random sin semilla y eso lo vuelve no reproducible).
 */
export function markowitz(
  returns: number[][],
  nPortfolios = 2000,
  riskFreeRate = 0,
  seed = 42,
): { maxSharpe: OptimizedPortfolio; minVol: OptimizedPortfolio } {
  const n = returns.length
  const mu = returns.map(r => mean(r) * TRADING_DAYS)
  const cv = covarianceMatrix(returns).map(row => row.map(x => x * TRADING_DAYS))

  let best: OptimizedPortfolio | null = null
  let minV: OptimizedPortfolio | null = null

  const rand = mulberry32(seed)
  for (let p = 0; p < nPortfolios; p++) {
    const w = Array.from({ length: n }, () => rand())
    const sum = w.reduce((a, b) => a + b, 0)
    if (sum === 0) continue
    for (let i = 0; i < n; i++) w[i] /= sum

    const ret = w.reduce((a, wi, i) => a + wi * mu[i], 0)
    let varSum = 0
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) varSum += w[i] * w[j] * cv[i][j]
    const vol = Math.sqrt(Math.max(varSum, 0))
    if (vol <= 0) continue

    const sharpe = (ret - riskFreeRate) / vol
    const cand: OptimizedPortfolio = { weights: w.slice(), return: ret, volatility: vol, sharpe }
    if (!best || sharpe > best.sharpe) best = cand
    if (!minV || vol < minV.volatility) minV = cand
  }
  if (!best || !minV) throw new Error("No se pudo construir ninguna cartera válida")
  return { maxSharpe: best, minVol: minV }
}

// Orden cuasi-diagonal: encadena activos por proximidad (distancia = 1 - corr).
function quasiDiagOrder(corr: number[][]): number[] {
  const n = corr.length
  const order = [0]
  const used = new Set([0])
  while (order.length < n) {
    const last = order[order.length - 1]
    let next = -1
    let best = Infinity
    for (let i = 0; i < n; i++) {
      if (used.has(i)) continue
      const d = 1 - corr[last][i]
      if (d < best) { best = d; next = i }
    }
    order.push(next)
    used.add(next)
  }
  return order
}

// Varianza de un cluster con pesos inversos a la varianza individual.
function clusterVar(cv: number[][], items: number[]): number {
  if (items.length === 0) return 0
  const iv = items.map(i => (cv[i][i] > 0 ? 1 / cv[i][i] : 0))
  const ivSum = iv.reduce((a, b) => a + b, 0)
  if (ivSum === 0) return 0
  const w = iv.map(x => x / ivSum)
  let c = 0
  for (let i = 0; i < items.length; i++)
    for (let j = 0; j < items.length; j++)
      c += w[i] * w[j] * cv[items[i]][items[j]]
  return c
}

/**
 * HRP — Hierarchical Risk Parity. Devuelve los pesos alineados al orden de
 * `returns`. Reparte el riesgo por bisección recursiva del orden cuasi-diagonal.
 *
 * Nota: la cuasi-diagonalización aquí es una cadena greedy de vecino más cercano
 * (heredada de rico-suave), no la cuasi-diagonalización canónica de López de
 * Prado que parte de un clustering jerárquico (scipy.linkage). Es una
 * simplificación funcional — para HRP canónico habría que sustituir
 * `quasiDiagOrder` por un linkage + reorder jerárquico.
 */
export function hrp(returns: number[][]): number[] {
  const n = returns.length
  if (n === 0) return []
  if (n === 1) return [1]

  const cv = covarianceMatrix(returns)
  const corr = correlationMatrix(returns)
  const order = quasiDiagOrder(corr)
  const weights = new Array<number>(n).fill(1)

  const bisect = (items: number[]): void => {
    if (items.length <= 1) return
    const split = Math.floor(items.length / 2)
    const left = items.slice(0, split)
    const right = items.slice(split)
    const vL = clusterVar(cv, left)
    const vR = clusterVar(cv, right)
    const alpha = vL + vR === 0 ? 0.5 : 1 - vL / (vL + vR)
    for (const i of left) weights[i] *= alpha
    for (const i of right) weights[i] *= 1 - alpha
    bisect(left)
    bisect(right)
  }
  bisect(order)

  const total = weights.reduce((a, b) => a + b, 0)
  return total === 0 ? new Array<number>(n).fill(1 / n) : weights.map(w => w / total)
}

export type PortfolioMetrics = {
  return: number          // anualizado
  volatility: number      // anualizada
  sharpe: number
  diversification: number // nº efectivo de posiciones (1 / Σwᵢ²)
  var95: number           // VaR histórico 95% — pérdida diaria (positivo)
  cvar95: number          // CVaR / Expected Shortfall 95%
}

/** Métricas de una cartera dada por sus pesos (alineados al orden de `returns`). */
export function portfolioMetrics(weights: number[], returns: number[][]): PortfolioMetrics {
  const n = weights.length
  const mu = returns.map(mean)
  const cv = covarianceMatrix(returns)

  const ret = weights.reduce((a, w, i) => a + w * mu[i] * TRADING_DAYS, 0)
  let varSum = 0
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      varSum += weights[i] * weights[j] * cv[i][j] * TRADING_DAYS
  const vol = Math.sqrt(Math.max(varSum, 0))

  const hhi = weights.reduce((a, w) => a + w * w, 0)

  // Serie de retornos de la cartera → VaR/CVaR histórico.
  const len = returns.length ? Math.min(...returns.map(r => r.length)) : 0
  const port: number[] = []
  for (let t = 0; t < len; t++) {
    let r = 0
    for (let i = 0; i < n; i++) r += weights[i] * returns[i][t]
    port.push(r)
  }
  const sorted = port.slice().sort((a, b) => a - b)
  const idx = sorted.length ? Math.max(Math.floor(0.05 * sorted.length), 1) : 0
  const var95 = sorted.length ? -sorted[Math.min(idx, sorted.length - 1)] : 0
  const tail = sorted.slice(0, idx)
  const cvar95 = tail.length ? -mean(tail) : 0

  return {
    return: ret,
    volatility: vol,
    sharpe: vol > 0 ? ret / vol : 0,
    diversification: hhi > 0 ? 1 / hhi : 0,
    var95,
    cvar95,
  }
}
