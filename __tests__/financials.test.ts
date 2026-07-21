import {
  extractLatestFacts, computeAltmanZ, computeNCAV, computeNetDebt,
  type Financials,
} from "@/lib/financials"
import type { CompanyFactsResponse } from "@/lib/edgar"

// Fixture ~AAPL FY2024 (recortado). Nota: NO tiene "Revenues" ni "GrossProfit"
// → ejercita el fallback de tags (revenue vía RevenueFromContract..., gross
// profit vía revenue − cogs).
const fact = (val: number) => ({ end: "2024-09-28", val, fp: "FY", form: "10-K", filed: "2024-11-01" })
const usd = (val: number) => ({ units: { USD: [fact(val)] } })

const FIXTURE: CompanyFactsResponse = {
  cik: 320193,
  entityName: "Apple Inc.",
  facts: {
    "us-gaap": {
      Assets: usd(352_583_000_000),
      AssetsCurrent: usd(152_987_000_000),
      Liabilities: usd(308_030_000_000),
      LiabilitiesCurrent: usd(176_392_000_000),
      RetainedEarningsAccumulatedDeficit: usd(-19_154_000_000),
      StockholdersEquity: usd(56_950_000_000),
      CashAndCashEquivalentsAtCarryingValue: usd(29_943_000_000),
      RevenueFromContractWithCustomerExcludingAssessedTax: usd(391_035_000_000),
      CostOfGoodsAndServicesSold: usd(210_352_000_000),
      OperatingIncomeLoss: usd(123_216_000_000),
      NetIncomeLoss: usd(93_736_000_000),
      LongTermDebtNoncurrent: usd(85_750_000_000),
      LongTermDebtCurrent: usd(10_912_000_000),
    },
  },
}

describe("extractLatestFacts", () => {
  const f = extractLatestFacts(FIXTURE)

  it("ancla el periodo en el último FY", () => {
    expect(f.periodEnd).toBe("2024-09-28")
    expect(f.fiscalPeriod).toBe("FY")
  })

  it("resuelve revenue por tag de fallback", () => {
    expect(f.revenue).toBe(391_035_000_000)
  })

  it("calcula gross profit cuando falta el tag (revenue − cogs)", () => {
    expect(f.grossProfit).toBe(391_035_000_000 - 210_352_000_000)
  })

  it("extrae balance e income principales", () => {
    expect(f.totalAssets).toBe(352_583_000_000)
    expect(f.totalLiabilities).toBe(308_030_000_000)
    expect(f.operatingIncome).toBe(123_216_000_000)
    expect(f.longTermDebt).toBe(85_750_000_000)
    expect(f.shortTermDebt).toBe(10_912_000_000)
  })
})

describe("computeAltmanZ", () => {
  it("empresa fuerte con mega market cap → zona segura", () => {
    const f = extractLatestFacts(FIXTURE)
    const r = computeAltmanZ(f, 3_500_000_000_000)
    expect(r.z).not.toBeNull()
    expect(r.zone).toBe("safe")
    expect(r.z as number).toBeGreaterThan(2.99)
  })

  it("empresa débil → distress", () => {
    const f = {
      totalAssets: 1000, totalLiabilities: 1200, currentAssets: 300, currentLiabilities: 800,
      retainedEarnings: -500, operatingIncome: -100, revenue: 400,
    } as Financials
    const r = computeAltmanZ(f, 200)
    expect(r.zone).toBe("distress")
    expect(r.z as number).toBeLessThan(1.81)
  })

  it("financiera → null (no aplica)", () => {
    const f = extractLatestFacts(FIXTURE)
    const r = computeAltmanZ(f, 3_500_000_000_000, { isFinancial: true })
    expect(r.z).toBeNull()
  })

  it("inputs faltantes → null con razón", () => {
    const r = computeAltmanZ({ totalAssets: null } as Financials, 100)
    expect(r.z).toBeNull()
    expect((r as { reason: string }).reason).toBeTruthy()
  })
})

describe("computeNCAV y computeNetDebt", () => {
  it("NCAV = activos corrientes − pasivos totales, con per-share", () => {
    const f = { currentAssets: 1000, totalLiabilities: 400 } as Financials
    const r = computeNCAV(f, 100)
    expect(r?.total).toBe(600)
    expect(r?.perShare).toBe(6)
  })

  it("deuda neta = (LP + CP) − caja", () => {
    const f = { longTermDebt: 500, shortTermDebt: 100, cash: 200 } as Financials
    expect(computeNetDebt(f)).toBe(400)
  })

  it("posición de caja neta → deuda neta negativa", () => {
    const f = { longTermDebt: 100, shortTermDebt: 0, cash: 300 } as Financials
    expect(computeNetDebt(f)).toBe(-200)
  })
})
