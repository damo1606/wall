const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const FETCH_TIMEOUT_MS = 8_000
const BACKOFF_MS = [1_000, 2_500, 5_000] as const  // delays entre reintentos

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

// Fetch con timeout — lanza error con code='timeout' si excede el límite
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if ((err as Error).name === "AbortError")
      throw Object.assign(new Error(`Yahoo Finance timeout después de ${FETCH_TIMEOUT_MS}ms`), { code: "timeout" })
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Clasifica la respuesta de Yahoo — null significa OK, string = tipo de error
function detectYahooError(json: unknown): "rate_limited" | "not_found" | "no_data" | null {
  const qs = (json as { quoteSummary?: { result: unknown; error?: { code?: string; description?: string } } })
    ?.quoteSummary
  if (!qs) return "no_data"
  if (qs.error) {
    const code = qs.error.code?.toLowerCase() ?? ""
    if (code.includes("too many") || code === "429") return "rate_limited"
    if (code === "not found") return "not_found"
    return "no_data"
  }
  if (!qs.result || (Array.isArray(qs.result) && qs.result.length === 0)) return "no_data"
  return null
}

// Interpola linealmente un valor en un rango de breakpoints → output
function score(value: number, bp: [number, number, number, number], out: [number, number, number, number]): number {
  if (value <= bp[0]) return out[0]
  if (value >= bp[3]) return out[3]
  for (let i = 0; i < 3; i++) {
    if (value <= bp[i + 1]) {
      const t = (value - bp[i]) / (bp[i + 1] - bp[i])
      return out[i] + t * (out[i + 1] - out[i])
    }
  }
  return out[3]
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// Module-level crumb cache (lives for the duration of the serverless instance)
let _crumb: string | null = null
let _cookie: string | null = null

async function refreshCrumb(): Promise<boolean> {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "follow",
    })

    // Extract A3 cookie
    const raw = cookieRes.headers.get("set-cookie") ?? ""
    const match = raw.match(/A3=[^;]+/)
    if (!match) return false
    _cookie = match[0]

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, Cookie: _cookie },
    })
    const crumb = await crumbRes.text()
    if (!crumb || crumb.includes("{")) return false

    _crumb = crumb
    return true
  } catch {
    return false
  }
}

async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (_crumb && _cookie) return { crumb: _crumb, cookie: _cookie }
  const ok = await refreshCrumb()
  if (!ok || !_crumb || !_cookie) return null
  return { crumb: _crumb, cookie: _cookie }
}

export type StockData = {
  symbol: string
  company: string
  sector: string
  industry: string
  marketCap: number
  beta: number

  // Price
  currentPrice: number
  high52w: number
  low52w: number
  dropFrom52w: number

  // Ratios de valoración
  pe: number
  forwardPe: number
  pb: number
  evToEbitda: number
  dividendYield: number
  peg: number

  // FCF
  freeCashflow: number
  sharesOutstanding: number
  pFcf: number                // Price / FCF per share

  // Enterprise Value
  enterpriseValue: number
  ebitda: number
  earningsYield: number       // EBIT / EV — proxy con EBITDA

  // Valor intrínseco
  eps: number
  bookValue: number
  grahamNumber: number        // sqrt(22.5 * EPS * BookValue)
  discountToGraham: number    // % descuento vs Graham Number (positivo = barato)

  // Peter Lynch Fair Value
  lynchValue: number          // EPS * 15
  discountToLynch: number

  // Analistas
  analystTarget: number
  upsideToTarget: number
  analystCount: number

  // Calidad
  roe: number
  roa: number
  debtToEquity: number
  grossMargin: number
  operatingMargin: number
  netMargin: number

  // Crecimiento
  earningsGrowth:          number   // YoY anual
  revenueGrowth:           number   // YoY anual
  earningsQuarterlyGrowth: number   // YoY trimestral más reciente (leading indicator)

  // FCF adicional
  totalRevenue: number
  fcfMargin: number       // FCF / Revenue
  totalDebt: number
  totalCash: number
  roic: number            // NOPAT / Invested Capital — métrica clave de moat real
  hasROIC: boolean        // false cuando los datos upstream son insuficientes para calcular ROIC

  // Calidad de gestión
  heldPercentInsiders: number  // % de acciones en manos del management (0-1)

  // Dividendos
  dividendRate: number          // Dividendo anual por acción ($/año)
  payoutRatio: number           // % de earnings pagado como dividendo
  fiveYearAvgYield: number      // Yield promedio últimos 5 años
  fcfPayoutRatio: number        // Dividendos pagados / FCF (más conservador)
  ddmGrowthRate: number         // Tasa de crecimiento usada en DDM
  ddmValue: number              // Valor intrínseco DDM (Gordon Growth Model)
  ddmDiscount: number           // % descuento vs DDM (positivo = barato)
  isDividendPayer: boolean

  // Score compuesto (0-100) — legacy, mantenido para compatibilidad
  valueScore: number
  qualityScore: number
  compositeScore: number

  // Calendario
  earningsDate?: string   // "2026-04-30" — próxima fecha de earnings (puede ser undefined)
}

function buildUrl(symbol: string, crumb: string, calendar = false) {
  const modules = calendar
    ? "price,summaryDetail,financialData,defaultKeyStatistics,assetProfile,calendarEvents"
    : "price,summaryDetail,financialData,defaultKeyStatistics,assetProfile"
  return `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`
}

export { getCrumb }

export async function fetchStockData(symbol: string, calendar = false): Promise<StockData | null> {
  try {
    let auth = await getCrumb()
    if (!auth) {
      console.error(`[yahoo] No se pudo obtener crumb para ${symbol}`)
      return null
    }

    let json: unknown = null

    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        const res = await fetchWithTimeout(buildUrl(symbol, auth.crumb, calendar), {
          headers: { "User-Agent": UA, Cookie: auth.cookie },
          next: { revalidate: 3600 },
        })

        // Crumb expirado → refrescar y reintentar sin contar como intento fallido
        if (res.status === 401) {
          _crumb = null
          _cookie = null
          const refreshed = await getCrumb()
          if (!refreshed) return null
          auth = refreshed
          attempt--  // no consumir intento por crumb expirado
          continue
        }

        // HTTP 429 explícito
        if (res.status === 429) {
          if (attempt < BACKOFF_MS.length) {
            console.warn(`[yahoo] Rate limit HTTP 429 en ${symbol} — reintento ${attempt + 1} en ${BACKOFF_MS[attempt]}ms`)
            await sleep(BACKOFF_MS[attempt])
            continue
          }
          console.error(`[yahoo] Rate limit persistente en ${symbol} tras ${BACKOFF_MS.length} reintentos`)
          return null
        }

        if (!res.ok) {
          console.error(`[yahoo] HTTP ${res.status} para ${symbol}`)
          return null
        }

        json = await res.json()
        const errorType = detectYahooError(json)

        if (errorType === "rate_limited") {
          if (attempt < BACKOFF_MS.length) {
            console.warn(`[yahoo] Rate limit en body para ${symbol} — reintento ${attempt + 1} en ${BACKOFF_MS[attempt]}ms`)
            await sleep(BACKOFF_MS[attempt])
            continue
          }
          console.error(`[yahoo] Rate limit persistente en body para ${symbol}`)
          return null
        }

        if (errorType === "not_found") {
          console.warn(`[yahoo] Símbolo no encontrado: ${symbol}`)
          return null
        }

        if (errorType === "no_data") {
          console.warn(`[yahoo] Sin datos fundamentales para ${symbol}`)
          return null
        }

        break  // Sin error — salir del loop
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code === "timeout") {
          if (attempt < BACKOFF_MS.length) {
            console.warn(`[yahoo] Timeout en ${symbol} — reintento ${attempt + 1}`)
            await sleep(BACKOFF_MS[attempt])
            continue
          }
          console.error(`[yahoo] Timeout persistente en ${symbol}`)
          return null
        }
        throw err  // error desconocido — propagar
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ((json as any)?.quoteSummary?.result?.[0]) as Record<string, any> | undefined
    if (!r) return null

    const profile   = r.assetProfile        ?? {}
    const summary   = r.summaryDetail       ?? {}
    const stats     = r.defaultKeyStatistics ?? {}
    const financial = r.financialData       ?? {}
    const price     = r.price               ?? {}
    const calendar  = r.calendarEvents      ?? {}

    const currentPrice = financial.currentPrice?.raw   ?? summary.regularMarketPrice?.raw ?? 0
    const high52w      = summary.fiftyTwoWeekHigh?.raw ?? 0
    const low52w       = summary.fiftyTwoWeekLow?.raw  ?? 0
    const dropFrom52w  = high52w > 0 ? ((currentPrice - high52w) / high52w) * 100 : 0

    const eps          = stats.trailingEps?.raw   ?? 0
    const bookValue    = stats.bookValue?.raw      ?? 0
    const grahamNumber = (eps > 0 && bookValue > 0) ? Math.sqrt(22.5 * eps * bookValue) : 0
    const discountToGraham = grahamNumber > 0 && currentPrice > 0
      ? ((grahamNumber - currentPrice) / currentPrice) * 100 : 0

    const lynchValue       = eps > 0 ? eps * 15 : 0
    const discountToLynch  = lynchValue > 0 && currentPrice > 0
      ? ((lynchValue - currentPrice) / currentPrice) * 100 : 0

    const analystTarget  = financial.targetMeanPrice?.raw ?? 0
    const upsideToTarget = analystTarget > 0 && currentPrice > 0
      ? ((analystTarget - currentPrice) / currentPrice) * 100 : 0

    const freeCashflow     = financial.freeCashflow?.raw      ?? 0
    const sharesOutstanding = stats.sharesOutstanding?.raw    ?? 0
    const fcfPerShare       = sharesOutstanding > 0 ? freeCashflow / sharesOutstanding : 0
    const pFcf              = fcfPerShare > 0 ? currentPrice / fcfPerShare : 0

    const enterpriseValue  = stats.enterpriseValue?.raw       ?? 0
    const ebitda           = stats.ebitda?.raw ?? financial.ebitda?.raw ?? 0
    // Earnings Yield = EBITDA / EV (proxy — idealmente sería EBIT)
    const earningsYield    = enterpriseValue > 0 && ebitda > 0
      ? (ebitda / enterpriseValue) * 100 : 0

    const roe = financial.returnOnEquity?.raw ?? 0
    const roa = financial.returnOnAssets?.raw ?? 0
    const operatingMargin = financial.operatingMargins?.raw ?? 0
    const debtToEquity    = financial.debtToEquity?.raw     ?? 0

    // Value Score (0-100): premia ratios bajos y descuentos altos
    const valueScore = clamp(
      score(discountToGraham,  [-50, 0, 20, 50],  [0, 30, 70, 100]) * 0.30 +
      score(pFcf > 0 ? -pFcf : 0, [-60, -30, -15, 0], [0, 30, 70, 100]) * 0.25 +
      score(upsideToTarget,    [0, 10, 25, 50],   [0, 20, 60, 100]) * 0.25 +
      score(earningsYield,     [0, 4, 8, 15],     [0, 20, 60, 100]) * 0.20,
      0, 100
    )

    // Quality Score (0-100): premia rentabilidad alta y deuda baja
    const qualityScore = clamp(
      score(roe * 100,          [0, 10, 20, 40],   [0, 20, 60, 100]) * 0.40 +
      score(roa * 100,          [0, 5, 10, 20],    [0, 20, 60, 100]) * 0.30 +
      score(operatingMargin * 100, [0, 10, 20, 35], [0, 20, 60, 100]) * 0.20 +
      score(debtToEquity > 0 ? -debtToEquity / 100 : 0, [-3, -1.5, -0.5, 0], [0, 20, 60, 100]) * 0.10,
      0, 100
    )

    const compositeScore = Math.round(valueScore * 0.55 + qualityScore * 0.45)

    return {
      symbol,
      company:   price.longName ?? price.shortName ?? symbol,
      sector:    profile.sector   ?? "",
      industry:  profile.industry ?? "",
      marketCap: price.marketCap?.raw ?? summary.marketCap?.raw ?? 0,
      beta:      summary.beta?.raw ?? 0,

      currentPrice,
      high52w,
      low52w,
      dropFrom52w,

      pe:           summary.trailingPE?.raw       ?? 0,
      forwardPe:    summary.forwardPE?.raw        ?? stats.forwardPE?.raw ?? 0,
      pb:           stats.priceToBook?.raw        ?? 0,
      evToEbitda:   stats.enterpriseToEbitda?.raw ?? 0,
      dividendYield: summary.dividendYield?.raw   ?? 0,
      peg:          stats.pegRatio?.raw           ?? 0,

      freeCashflow,
      sharesOutstanding,
      pFcf,

      enterpriseValue,
      ebitda,
      earningsYield,

      eps,
      bookValue,
      grahamNumber,
      discountToGraham,

      lynchValue,
      discountToLynch,

      analystTarget,
      upsideToTarget,
      analystCount: financial.numberOfAnalystOpinions?.raw ?? 0,

      roe,
      roa,
      debtToEquity,
      grossMargin:     financial.grossMargins?.raw    ?? 0,
      operatingMargin,
      netMargin:       financial.profitMargins?.raw   ?? 0,

      earningsGrowth:          financial.earningsGrowth?.raw         ?? 0,
      revenueGrowth:           financial.revenueGrowth?.raw          ?? 0,
      earningsQuarterlyGrowth: stats.earningsQuarterlyGrowth?.raw    ?? 0,

      totalRevenue: financial.totalRevenue?.raw ?? 0,
      fcfMargin: (financial.totalRevenue?.raw ?? 0) > 0
        ? (freeCashflow / financial.totalRevenue.raw)
        : 0,
      totalDebt: financial.totalDebt?.raw ?? 0,
      totalCash: financial.totalCash?.raw ?? 0,
      roic: (() => {
        const revenue    = financial.totalRevenue?.raw ?? 0
        const opMargin   = financial.operatingMargins?.raw ?? 0
        const totalDebt  = financial.totalDebt?.raw ?? 0
        const totalCash  = financial.totalCash?.raw ?? 0
        const bookEquity = (stats.bookValue?.raw ?? 0) * (stats.sharesOutstanding?.raw ?? 0)
        const nopat      = revenue * opMargin * (1 - 0.21)
        const netDebt    = Math.max(totalDebt - totalCash, 0)
        const invested   = bookEquity + netDebt
        return invested > 0 && nopat > 0 ? nopat / invested : 0
      })(),
      hasROIC: (() => {
        const revenue  = financial.totalRevenue?.raw
        const opMargin = financial.operatingMargins?.raw
        const equity   = stats.bookValue?.raw
        const shares   = stats.sharesOutstanding?.raw
        return !!(revenue && opMargin !== undefined && equity && shares)
      })(),

      // ── Gestión ──────────────────────────────────────────────────────────
      heldPercentInsiders: stats.heldPercentInsiders?.raw ?? 0,

      // ── Dividendos ───────────────────────────────────────────────────────
      dividendRate:      summary.dividendRate?.raw ?? summary.trailingAnnualDividendRate?.raw ?? 0,
      payoutRatio:       summary.payoutRatio?.raw ?? 0,
      fiveYearAvgYield:  summary.fiveYearAvgDividendYield?.raw ?? 0,
      fcfPayoutRatio: (() => {
        const divRate = summary.dividendRate?.raw ?? summary.trailingAnnualDividendRate?.raw ?? 0
        const divsPaid = divRate > 0 && sharesOutstanding > 0 ? divRate * sharesOutstanding : 0
        return freeCashflow > 0 && divsPaid > 0 ? divsPaid / freeCashflow : 0
      })(),
      ddmGrowthRate: (() => {
        const g = (financial.earningsGrowth?.raw ?? 0) * 0.7
        return Math.min(Math.max(g, 0), 0.08)
      })(),
      ddmValue: (() => {
        const divRate = summary.dividendRate?.raw ?? summary.trailingAnnualDividendRate?.raw ?? 0
        if (divRate <= 0) return 0
        const g = Math.min(Math.max((financial.earningsGrowth?.raw ?? 0) * 0.7, 0), 0.08)
        const r = 0.10
        if (r <= g) return 0
        return (divRate * (1 + g)) / (r - g)
      })(),
      ddmDiscount: (() => {
        const divRate = summary.dividendRate?.raw ?? summary.trailingAnnualDividendRate?.raw ?? 0
        if (divRate <= 0 || currentPrice <= 0) return 0
        const g = Math.min(Math.max((financial.earningsGrowth?.raw ?? 0) * 0.7, 0), 0.08)
        const r = 0.10
        if (r <= g) return 0
        const ddm = (divRate * (1 + g)) / (r - g)
        return ddm > 0 ? ((ddm - currentPrice) / currentPrice) * 100 : 0
      })(),
      isDividendPayer: (summary.dividendRate?.raw ?? summary.trailingAnnualDividendRate?.raw ?? 0) > 0,

      valueScore:     Math.round(valueScore),
      qualityScore:   Math.round(qualityScore),
      compositeScore,

      earningsDate: (() => {
        const dates: { raw?: number; fmt?: string }[] = calendar.earnings?.earningsDate ?? []
        const next = dates.find(d => d.raw && d.raw * 1000 > Date.now())
        return next?.fmt ?? dates[0]?.fmt ?? undefined
      })(),
    }
  } catch {
    return null
  }
}
