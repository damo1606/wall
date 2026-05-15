import { computeOpportunityScore, type OpportunitySignals } from "@/lib/opportunity"

// Acción claramente barata y con buen institucional.
const cheap: OpportunitySignals = {
  buyScore: 80,
  convictionScore: 70,
  m7Score: 40,
  soreGate: "GO",
  dropFrom52w: -20,
  discountToGraham: 30,
  upsideToTarget: 25,
  pe: 14,
}

// Acción claramente cara y con institucional en contra.
const expensive: OpportunitySignals = {
  buyScore: 20,
  convictionScore: 30,
  m7Score: -30,
  soreGate: "AVOID",
  dropFrom52w: -2,
  discountToGraham: -20,
  upsideToTarget: -5,
  pe: 45,
}

describe("computeOpportunityScore", () => {
  it("clasifica una acción barata como 'comprar'", () => {
    const r = computeOpportunityScore(cheap)
    expect(r.bucket).toBe("comprar")
    expect(r.opportunityScore).toBeGreaterThanOrEqual(60)
    expect(r.tesis).toMatch(/Compra/)
  })

  it("clasifica una acción cara como 'vender'", () => {
    const r = computeOpportunityScore(expensive)
    expect(r.bucket).toBe("vender")
    expect(r.tesis).toMatch(/Venta/)
  })

  it("mantiene el score dentro de 0-100", () => {
    for (const s of [cheap, expensive]) {
      const r = computeOpportunityScore(s)
      expect(r.opportunityScore).toBeGreaterThanOrEqual(0)
      expect(r.opportunityScore).toBeLessThanOrEqual(100)
    }
  })

  it("un percentil histórico bajo sube el atractivo de compra", () => {
    const sinHist = computeOpportunityScore(cheap)
    const baratoVsHistoria = computeOpportunityScore({ ...cheap, historicalPercentile: 5 })
    expect(baratoVsHistoria.opportunityScore).toBeGreaterThan(sinHist.opportunityScore)
  })
})
