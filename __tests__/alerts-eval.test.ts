import { detectCrossings, evaluateUserAlert, type AlertScanRow } from "@/lib/alerts-eval"

// Fila base; cada test ajusta lo que necesita.
function row(over: Partial<AlertScanRow>): AlertScanRow {
  return {
    symbol: "TST",
    currentPrice: 100,
    pe: 18,
    buyScore: 50,
    convictionScore: 50,
    m7Score: 0,
    soreGate: "WAIT",
    dropFrom52w: -10,
    discountToGraham: 0,
    upsideToTarget: 10,
    ...over,
  }
}

// Fila que computeOpportunityScore clasifica como compra fuerte (score >= 70).
const strong = row({
  symbol: "BUY", buyScore: 85, convictionScore: 75, m7Score: 50,
  soreGate: "GO", discountToGraham: 35, upsideToTarget: 30,
})
// Fila neutra (no es compra fuerte).
const weak = row({ symbol: "MID", buyScore: 48 })

describe("detectCrossings", () => {
  it("detecta un ticker que cruza a compra fuerte hoy", () => {
    const crossings = detectCrossings([strong], [weak])
    expect(crossings.map(c => c.symbol)).toContain("BUY")
  })

  it("no marca cruce si ya era compra fuerte en el snapshot anterior", () => {
    const crossings = detectCrossings([strong], [strong])
    expect(crossings).toHaveLength(0)
  })

  it("sin snapshot previo no reporta cruces", () => {
    expect(detectCrossings([strong], [])).toHaveLength(0)
  })
})

describe("evaluateUserAlert", () => {
  it("price_below dispara cuando el precio cae bajo el umbral", () => {
    expect(evaluateUserAlert("price_below", { value: 120 }, row({ currentPrice: 100 }))).toBe(true)
    expect(evaluateUserAlert("price_below", { value: 90 }, row({ currentPrice: 100 }))).toBe(false)
  })

  it("pe_below ignora PE no positivo (sin earnings)", () => {
    expect(evaluateUserAlert("pe_below", { value: 20 }, row({ pe: 15 }))).toBe(true)
    expect(evaluateUserAlert("pe_below", { value: 20 }, row({ pe: 0 }))).toBe(false)
  })

  it("la condición por defecto dispara al entrar en bucket de compra", () => {
    expect(evaluateUserAlert("buy_signal", null, strong)).toBe(true)
    expect(evaluateUserAlert("buy_signal", null, weak)).toBe(false)
  })
})
