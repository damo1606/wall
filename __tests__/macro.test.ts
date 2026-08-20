import { computeMacroScore, weightedAvg, type MacroData, type MacroIndicator } from "@/lib/macro"

// Indicador mínimo: solo `value` y `trend` alimentan los pilares de crédito e inflación.
const ind = (value: number, trend: MacroIndicator["trend"] = "stable"): MacroIndicator => ({
  value, prev: value, trend, label: "test", unit: "", date: "2026-01-01",
})

// Los campos ausentes quedan `undefined`, que el motor trata igual que `null`.
const macro = (partial: Partial<MacroData>): MacroData => partial as MacroData

describe("weightedAvg", () => {
  it("aplica los pesos declarados", () => {
    // 90×0.5 + 88×0.35 + 20×0.15 = 45 + 30.8 + 3 = 78.8
    expect(weightedAvg([[90, 0.5], [88, 0.35], [20, 0.15]])).toBeCloseTo(78.8, 1)
  })

  it("no es una media simple", () => {
    const ponderada = weightedAvg([[90, 0.5], [88, 0.35], [20, 0.15]])
    const simple = (90 + 88 + 20) / 3
    expect(ponderada).not.toBeCloseTo(simple, 1)
  })

  it("renormaliza cuando falta un componente", () => {
    // Sin el tercero, los pesos 0.5 y 0.35 reparten el total: (90×0.5 + 50×0.35) / 0.85
    expect(weightedAvg([[90, 0.5], [50, 0.35], [null, 0.15]]))
      .toBeCloseTo((90 * 0.5 + 50 * 0.35) / 0.85, 4)
  })

  it("devuelve 50 neutro si no hay ningún componente", () => {
    expect(weightedAvg([[null, 0.5], [undefined, 0.5]])).toBe(50)
  })

  it("el orden de los pares no altera el resultado", () => {
    const a = weightedAvg([[10, 0.2], [90, 0.8]])
    const b = weightedAvg([[90, 0.8], [10, 0.2]])
    expect(a).toBeCloseTo(b, 10)
  })
})

describe("computeMacroScore — pilar de crédito", () => {
  // El spread HY pesa 0.50 y la morosidad 0.15: mover el que más pesa tiene que
  // mover más el pilar. Con la media simple que había antes, ambos movían igual.
  it("el spread HY manda más que la morosidad", () => {
    const base = macro({ hySpread: ind(4.0), finStress: ind(0), creditDelinq: ind(2.5) })

    const hyMejora     = macro({ ...base, hySpread: ind(2.5) })      // 62 → 90
    const delinqMejora = macro({ ...base, creditDelinq: ind(1.5) })  // 64 → 82

    const dHy     = computeMacroScore(hyMejora).components.credit
                  - computeMacroScore(base).components.credit
    const dDelinq = computeMacroScore(delinqMejora).components.credit
                  - computeMacroScore(base).components.credit

    expect(dHy).toBeGreaterThan(0)
    expect(dDelinq).toBeGreaterThan(0)
    expect(dHy).toBeGreaterThan(dDelinq)
  })

  it("reproduce el caso que destapó el bug", () => {
    // hyScore 90 · stressScore 88 · delinqScore 20 → ponderado 78.8, media simple 66
    const data = macro({
      hySpread:     ind(2.5),   // < 3   → 90
      finStress:    ind(-1.5),  // < -1  → 88
      creditDelinq: ind(4.5),   // >= 4  → 20
    })
    expect(computeMacroScore(data).components.credit).toBe(79)
  })

  it("con crédito ausente el pilar cae al neutro", () => {
    expect(computeMacroScore(macro({})).components.credit).toBe(50)
  })
})

describe("computeMacroScore — pilar de inflación", () => {
  it("la curva de tipos manda más que el CPI", () => {
    const base = macro({ inflation: ind(2.2), yieldCurve: ind(0.2), fedRate: ind(4, "stable") })

    const curvaEmpeora = macro({ ...base, yieldCurve: ind(-1.0) })  // 35 → 20
    const cpiEmpeora   = macro({ ...base, inflation: ind(3.5) })    // 88 → 52

    const dCurva = computeMacroScore(base).components.inflation
                 - computeMacroScore(curvaEmpeora).components.inflation
    const dCpi   = computeMacroScore(base).components.inflation
                 - computeMacroScore(cpiEmpeora).components.inflation

    expect(dCurva).toBeGreaterThan(0)
    expect(dCpi).toBeGreaterThan(0)
    // 15 puntos × 0.45 = 6.75 frente a 36 × 0.30 = 10.8 — aquí gana el CPI por
    // magnitud, así que lo que se comprueba es la sensibilidad POR PUNTO movido.
    expect(dCurva / 15).toBeGreaterThan(dCpi / 36)
  })

  it("fedScore siempre está presente, así que el pilar nunca es neutro por defecto", () => {
    // Sin CPI ni curva, queda solo fedRate (trend stable → 55)
    expect(computeMacroScore(macro({})).components.inflation).toBe(55)
  })
})
