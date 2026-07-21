// Estados financieros desde XBRL companyfacts → line items normalizados y
// derivados (Altman Z-score, VLN/NCAV, deuda neta). Módulo puro y testeable:
// no hace I/O, recibe el CompanyFactsResponse ya descargado por lib/edgar.ts.

import type { CompanyFactsResponse, XbrlFact } from "@/lib/edgar"

// Line items crudos que persistimos y usamos para los derivados.
export type Financials = {
  periodEnd: string | null       // ancla: fin del último año fiscal (FY)
  fiscalPeriod: string | null    // 'FY' en v1
  form: string | null            // típicamente '10-K'
  totalAssets: number | null
  currentAssets: number | null
  totalLiabilities: number | null
  currentLiabilities: number | null
  retainedEarnings: number | null
  stockholdersEquity: number | null
  cash: number | null
  revenue: number | null
  cogs: number | null
  grossProfit: number | null
  operatingIncome: number | null // EBIT proxy
  netIncome: number | null
  depAmort: number | null
  longTermDebt: number | null
  shortTermDebt: number | null
}

// Tags US-GAAP por line item, en orden de preferencia (las empresas etiquetan
// distinto; se resuelve por la primera lista con datos).
const TAGS = {
  assets: ["Assets"],
  currentAssets: ["AssetsCurrent"],
  liabilities: ["Liabilities"],
  liabAndEquity: ["LiabilitiesAndStockholdersEquity"],
  currentLiabilities: ["LiabilitiesCurrent"],
  retainedEarnings: ["RetainedEarningsAccumulatedDeficit"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ],
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
  ],
  cogs: ["CostOfGoodsAndServicesSold", "CostOfRevenue"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
  depAmort: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
  ],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  shortTermDebt: ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
} as const

// ── selección de hechos ───────────────────────────────────────────────────────
const finite = (arr: XbrlFact[]): XbrlFact[] =>
  arr.filter((f) => Number.isFinite(f.val) && !!f.end)

function latestByEnd(arr: XbrlFact[]): XbrlFact {
  return arr.reduce((a, b) =>
    b.end > a.end || (b.end === a.end && (b.filed ?? "") > (a.filed ?? "")) ? b : a)
}
function latestByFiled(arr: XbrlFact[]): XbrlFact {
  return arr.reduce((a, b) => ((b.filed ?? "") > (a.filed ?? "") ? b : a))
}

// Balance (instant): valor en periodEnd (exacto → más reciente ≤ periodEnd → último).
function instantAt(arr: XbrlFact[] | null, periodEnd: string | null): number | null {
  if (!arr) return null
  const fs = finite(arr)
  if (!fs.length) return null
  if (periodEnd) {
    const exact = fs.filter((f) => f.end === periodEnd)
    if (exact.length) return latestByFiled(exact).val
    const before = fs.filter((f) => f.end <= periodEnd)
    if (before.length) return latestByEnd(before).val
  }
  return latestByEnd(fs).val
}

// Income (duration): valor de año fiscal completo (fp='FY') en periodEnd o el último.
function annualVal(arr: XbrlFact[] | null, periodEnd: string | null): number | null {
  if (!arr) return null
  const fy = finite(arr).filter((f) => f.fp === "FY")
  if (!fy.length) return null
  if (periodEnd) {
    const exact = fy.filter((f) => f.end === periodEnd)
    if (exact.length) return latestByFiled(exact).val
  }
  return latestByEnd(fy).val
}

function latestAnnual(arr: XbrlFact[] | null): { end: string; form: string } | null {
  if (!arr) return null
  const fy = finite(arr).filter((f) => f.fp === "FY")
  if (!fy.length) return null
  const best = latestByEnd(fy)
  return { end: best.end, form: best.form ?? "" }
}

// ── extracción ────────────────────────────────────────────────────────────────
export function extractLatestFacts(facts: CompanyFactsResponse): Financials {
  const gaap = facts.facts?.["us-gaap"] ?? {}
  const usd = (tags: readonly string[]): XbrlFact[] | null => {
    for (const t of tags) {
      const u = gaap[t]?.units?.["USD"]
      if (u && u.length) return u
    }
    return null
  }

  // Ancla temporal: fin del último año fiscal reportado (net income → revenue).
  const anchor = latestAnnual(usd(TAGS.netIncome)) ?? latestAnnual(usd(TAGS.revenue))
  const periodEnd = anchor?.end ?? null

  const equity = instantAt(usd(TAGS.equity), periodEnd)
  let totalLiabilities = instantAt(usd(TAGS.liabilities), periodEnd)
  if (totalLiabilities == null) {
    // Fallback: pasivos = (pasivos + equity) − equity.
    const lae = instantAt(usd(TAGS.liabAndEquity), periodEnd)
    if (lae != null && equity != null) totalLiabilities = lae - equity
  }

  const revenue = annualVal(usd(TAGS.revenue), periodEnd)
  const cogs = annualVal(usd(TAGS.cogs), periodEnd)
  let grossProfit = annualVal(usd(TAGS.grossProfit), periodEnd)
  if (grossProfit == null && revenue != null && cogs != null) grossProfit = revenue - cogs

  return {
    periodEnd,
    fiscalPeriod: periodEnd ? "FY" : null,
    form: anchor?.form || "10-K",
    totalAssets: instantAt(usd(TAGS.assets), periodEnd),
    currentAssets: instantAt(usd(TAGS.currentAssets), periodEnd),
    totalLiabilities,
    currentLiabilities: instantAt(usd(TAGS.currentLiabilities), periodEnd),
    retainedEarnings: instantAt(usd(TAGS.retainedEarnings), periodEnd),
    stockholdersEquity: equity,
    cash: instantAt(usd(TAGS.cash), periodEnd),
    revenue,
    cogs,
    grossProfit,
    operatingIncome: annualVal(usd(TAGS.operatingIncome), periodEnd),
    netIncome: annualVal(usd(TAGS.netIncome), periodEnd),
    depAmort: annualVal(usd(TAGS.depAmort), periodEnd),
    longTermDebt: instantAt(usd(TAGS.longTermDebt), periodEnd),
    shortTermDebt: instantAt(usd(TAGS.shortTermDebt), periodEnd),
  }
}

// ── derivados ─────────────────────────────────────────────────────────────────
// Deuda neta: (deuda LP + CP) − caja. Signo real (negativo = posición de caja neta).
export function computeNetDebt(f: Financials): number | null {
  if (f.longTermDebt == null && f.shortTermDebt == null) return null
  return (f.longTermDebt ?? 0) + (f.shortTermDebt ?? 0) - (f.cash ?? 0)
}

// VLN / NCAV (Graham net-current-asset-value): activos corrientes − pasivos totales.
// Por acción si se pasa sharesOutstanding.
export function computeNCAV(
  f: Financials,
  sharesOutstanding?: number | null,
): { total: number; perShare: number | null } | null {
  if (f.currentAssets == null || f.totalLiabilities == null) return null
  const total = f.currentAssets - f.totalLiabilities
  const perShare = sharesOutstanding && sharesOutstanding > 0 ? total / sharesOutstanding : null
  return { total, perShare }
}

export type AltmanResult =
  | { z: number; zone: "safe" | "grey" | "distress" }
  | { z: null; zone: null; reason: string }

// Altman Z-score original (empresa pública industrial):
// Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5
// X1 = working capital / total assets · X2 = retained earnings / total assets
// X3 = EBIT / total assets · X4 = market value equity / total liabilities
// X5 = sales / total assets. Zonas: >2.99 safe · 1.81–2.99 grey · <1.81 distress.
export function computeAltmanZ(
  f: Financials,
  marketCap: number | null | undefined,
  opts?: { isFinancial?: boolean },
): AltmanResult {
  if (opts?.isFinancial) {
    return { z: null, zone: null, reason: "no aplica a bancos/financieras" }
  }
  const { totalAssets: ta, totalLiabilities: tl, currentAssets: ca, currentLiabilities: cl } = f
  const { retainedEarnings: re, operatingIncome: ebit, revenue: sales } = f
  if (!ta || ta <= 0 || !tl || tl <= 0) {
    return { z: null, zone: null, reason: "faltan activos/pasivos totales" }
  }
  if (ca == null || cl == null || re == null || ebit == null || sales == null || marketCap == null || marketCap <= 0) {
    return { z: null, zone: null, reason: "faltan inputs (WC/RE/EBIT/ventas/marketCap)" }
  }
  const wc = ca - cl
  const z = 1.2 * (wc / ta) + 1.4 * (re / ta) + 3.3 * (ebit / ta) + 0.6 * (marketCap / tl) + 1.0 * (sales / ta)
  const zone = z > 2.99 ? "safe" : z >= 1.81 ? "grey" : "distress"
  return { z: Math.round(z * 100) / 100, zone }
}
