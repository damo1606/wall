import { buildAnalystConsensus, ratingLabel, type AnalystConsensusInput } from "@/lib/analyst-consensus"

// Caso completo: rango publicado, cobertura amplia y consenso comprador.
const full: AnalystConsensusInput = {
  currentPrice: 100,
  targetMean: 125,
  targetMedian: 120,
  targetHigh: 180,
  targetLow: 80,
  analystCount: 20,
  recommendationMean: 2.0,
  recommendationKey: "buy",
}

const sumWeights = (c: ReturnType<typeof buildAnalystConsensus>) =>
  c.scenarios.reduce((acc, s) => acc + s.weight, 0)

describe("buildAnalystConsensus", () => {
  it("construye las tres ramas del escenario cuando hay rango completo", () => {
    const c = buildAnalystConsensus(full)
    expect(c.available).toBe(true)
    expect(c.scenarios.map(s => s.key)).toEqual(["bear", "base", "bull"])
    expect(c.scenarios[0].price).toBe(80)
    expect(c.scenarios[2].price).toBe(180)
  })

  it("prefiere la mediana sobre la media como escenario base", () => {
    const c = buildAnalystConsensus(full)
    expect(c.base?.price).toBe(120)
    expect(c.base?.source).toBe("targetMedianPrice")
  })

  it("cae a la media cuando no hay mediana", () => {
    const c = buildAnalystConsensus({ ...full, targetMedian: null })
    expect(c.base?.price).toBe(125)
    expect(c.base?.source).toBe("targetMeanPrice")
  })

  it("los pesos de los escenarios suman 1", () => {
    for (const rec of [1, 2, 3, 4, 5, null]) {
      const c = buildAnalystConsensus({ ...full, recommendationMean: rec })
      expect(sumWeights(c)).toBeCloseTo(1, 1)
    }
  })

  it("un rating comprador inclina el peso hacia el escenario alcista", () => {
    const c = buildAnalystConsensus({ ...full, recommendationMean: 1.0 })
    const bear = c.scenarios.find(s => s.key === "bear")!
    const bull = c.scenarios.find(s => s.key === "bull")!
    expect(bull.weight).toBeGreaterThan(bear.weight)
  })

  it("un rating vendedor inclina el peso hacia el escenario bajista", () => {
    const c = buildAnalystConsensus({ ...full, recommendationMean: 5.0 })
    const bear = c.scenarios.find(s => s.key === "bear")!
    const bull = c.scenarios.find(s => s.key === "bull")!
    expect(bear.weight).toBeGreaterThan(bull.weight)
  })

  it("sin rating la distribución queda simétrica", () => {
    const c = buildAnalystConsensus({ ...full, recommendationMean: null })
    const bear = c.scenarios.find(s => s.key === "bear")!
    const bull = c.scenarios.find(s => s.key === "bull")!
    expect(bear.weight).toBeCloseTo(bull.weight, 2)
    expect(c.rating).toBeNull()
  })

  it("el precio esperado cae dentro del rango de objetivos", () => {
    const c = buildAnalystConsensus(full)
    expect(c.expectedPrice).toBeGreaterThan(80)
    expect(c.expectedPrice).toBeLessThan(180)
  })

  // Regresión: con un rango asimétrico y un outlier al alza, la media ponderada
  // cruda superaba todos los objetivos de consenso (caso NVDA real: mediana 300,
  // media 303, alto 500 → esperado 361). La contracción hacia la base lo impide.
  it("un outlier al alza no empuja el esperado por encima del consenso", () => {
    const nvda = buildAnalystConsensus({
      currentPrice: 219.22, targetMean: 302.83, targetMedian: 300,
      targetHigh: 500, targetLow: 180,
      analystCount: 58, recommendationMean: 1.3, recommendationKey: "strong_buy",
    })
    // No puede exceder al mayor de mediana y media — ese es el techo del consenso.
    expect(nvda.expectedPrice!).toBeLessThanOrEqual(Math.max(300, 302.83))
    expect(nvda.dispersionLabel).toBe("DISPERSO")
  })

  it("más dispersión nunca sube el upside esperado", () => {
    // Mismo centro y mismo rating; solo se ensancha el rango. El upside esperado
    // debe ser monótono no creciente: la discrepancia no puede premiar.
    const anchos = [10, 40, 90, 160]
    const upsides = anchos.map(w =>
      buildAnalystConsensus({ ...full, targetLow: 120 - w, targetHigh: 120 + w }).expectedUpside!)
    for (let i = 1; i < upsides.length; i++) {
      expect(upsides[i]).toBeLessThanOrEqual(upsides[i - 1] + 0.05)
    }
  })

  it("con analistas muy de acuerdo respeta la media ponderada", () => {
    // Rango estrecho → contracción mínima → el esperado se separa de la base.
    const c = buildAnalystConsensus({ ...full, targetLow: 118, targetHigh: 124, recommendationMean: 1.0 })
    expect(c.dispersionLabel).toBe("APRETADO")
    expect(c.expectedPrice).toBeGreaterThan(c.base!.price)
  })

  it("mide la dispersión y la etiqueta", () => {
    const disperso = buildAnalystConsensus(full)               // (180-80)/120 = 83%
    expect(disperso.dispersionLabel).toBe("DISPERSO")

    const apretado = buildAnalystConsensus({ ...full, targetLow: 110, targetHigh: 130 })
    expect(apretado.dispersion).toBeCloseTo(16.7, 0)
    expect(apretado.dispersionLabel).toBe("APRETADO")
  })

  it("degrada a una sola rama si Yahoo no publica el rango", () => {
    const c = buildAnalystConsensus({ ...full, targetHigh: null, targetLow: null })
    expect(c.available).toBe(true)
    expect(c.scenarios).toHaveLength(1)
    expect(c.scenarios[0].key).toBe("base")
    expect(c.scenarios[0].weight).toBe(1)
    expect(c.dispersion).toBeNull()
    expect(c.expectedPrice).toBe(120)
  })

  it("marca no disponible cuando no hay ningún precio objetivo", () => {
    const c = buildAnalystConsensus({ ...full, targetMean: null, targetMedian: null })
    expect(c.available).toBe(false)
    expect(c.consensusScore).toBeNull()
    expect(c.scenarios).toHaveLength(0)
  })

  it("distingue 'sin dato' de un upside de cero", () => {
    const sinDato = buildAnalystConsensus({ ...full, targetMean: null, targetMedian: null, targetHigh: null, targetLow: null })
    const planoEnCero = buildAnalystConsensus({ ...full, targetMean: 100, targetMedian: 100, targetHigh: null, targetLow: null })
    expect(sinDato.expectedUpside).toBeNull()
    expect(planoEnCero.expectedUpside).toBe(0)
  })

  it("más cobertura y menos dispersión suben la confianza", () => {
    const pocos = buildAnalystConsensus({ ...full, analystCount: 1 })
    const muchos = buildAnalystConsensus({ ...full, analystCount: 30 })
    expect(muchos.confidence).toBeGreaterThan(pocos.confidence)

    const juntos = buildAnalystConsensus({ ...full, targetLow: 115, targetHigh: 128 })
    expect(juntos.confidence).toBeGreaterThan(buildAnalystConsensus(full).confidence)
  })

  it("la confianza atenúa el score pero nunca lo anula", () => {
    const debil = buildAnalystConsensus({ ...full, analystCount: 1, targetLow: 10, targetHigh: 400 })
    const fuerte = buildAnalystConsensus({ ...full, analystCount: 30, targetLow: 118, targetHigh: 124 })
    expect(debil.consensusScore!).toBeLessThan(fuerte.consensusScore!)
    expect(debil.consensusScore!).toBeGreaterThan(0)
  })

  it("mantiene el score dentro de 0-100 en los extremos", () => {
    const casos: AnalystConsensusInput[] = [
      { ...full, targetMedian: 1000, targetHigh: 2000, targetLow: 500, recommendationMean: 1 },
      { ...full, targetMedian: 10, targetHigh: 20, targetLow: 1, recommendationMean: 5 },
    ]
    for (const caso of casos) {
      const c = buildAnalystConsensus(caso)
      expect(c.consensusScore!).toBeGreaterThanOrEqual(0)
      expect(c.consensusScore!).toBeLessThanOrEqual(100)
      expect(c.confidence).toBeGreaterThanOrEqual(0)
      expect(c.confidence).toBeLessThanOrEqual(100)
    }
  })

  it("ignora precios no utilizables (cero, negativos, NaN)", () => {
    const c = buildAnalystConsensus({ ...full, targetLow: 0, targetHigh: NaN })
    expect(c.scenarios).toHaveLength(1)
    expect(c.dispersion).toBeNull()
  })

  it("descarta un recommendationMean fuera del rango 1-5", () => {
    expect(buildAnalystConsensus({ ...full, recommendationMean: 0 }).rating).toBeNull()
    expect(buildAnalystConsensus({ ...full, recommendationMean: 9 }).rating).toBeNull()
  })

  it("etiqueta el rating según el corte estándar de Yahoo", () => {
    expect(ratingLabel(1.2)).toBe("STRONG BUY")
    expect(ratingLabel(2.1)).toBe("BUY")
    expect(ratingLabel(3.0)).toBe("HOLD")
    expect(ratingLabel(4.2)).toBe("SELL")
    expect(ratingLabel(4.8)).toBe("STRONG SELL")
  })

  it("la tesis nombra el consenso, el valor esperado y el rango", () => {
    const c = buildAnalystConsensus(full)
    expect(c.tesis).toMatch(/BUY/)
    expect(c.tesis).toMatch(/valor esperado/)
    expect(c.tesis).toMatch(/rango \$80\.00–\$180\.00/)
  })
})
