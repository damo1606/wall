import {
  computeSORE, HARD_EVENT_ITEMS,
  CSS_MIN_OPERABLE, CSS_WAIT, CSS_GO, DSS_MIN_GO,
  type SoreInput, type SoreResult,
} from "@/lib/sore"

// Escenario favorable de referencia: dealers estabilizando, régimen comprimido,
// IV elevada sin pánico. Da GO / SHORT STRANGLE.
const base: SoreInput = {
  m1NetGex: 2e9,
  m1Pressure: 60,
  m1Pcr: 1.0,
  m6Vix: 30,
  m6FearScore: 30,
  m6Regime: "COMPRESIÓN",
  m6Suspended: false,
  m5Score: 10,
}

const con = (over: Partial<SoreInput>): SoreResult => computeSORE({ ...base, ...over })

const ESTRATEGIAS = ["SHORT STRANGLE", "IRON CONDOR", "BWB", "CREDIT SPREAD", "CALENDAR", "AVOID"]

describe("computeSORE — escenario favorable", () => {
  it("da GO con la estrategia más agresiva cuando todo acompaña", () => {
    const r = con({})
    expect(r.gate).toBe("GO")
    expect(r.strategy).toBe("SHORT STRANGLE")
    expect(r.css).toBeGreaterThanOrEqual(CSS_GO)
    expect(r.dss).toBeGreaterThanOrEqual(DSS_MIN_GO)
  })

  it("con PCR bajo prefiere riesgo definido", () => {
    // PCR <= 0.9 → sin soporte de dealers bajo el mercado → IRON CONDOR
    expect(con({ m1Pcr: 0.85 }).strategy).toBe("IRON CONDOR")
  })

  it("fuera de compresión y con miedo bajo elige CALENDAR", () => {
    const r = con({ m6Regime: "TRANSICIÓN", m6Vix: 35, m6FearScore: 30 })
    expect(r.gate).toBe("GO")
    expect(r.strategy).toBe("CALENDAR")
  })
})

describe("computeSORE — hard blocks", () => {
  it.each([
    ["PÁNICO AGUDO", { m6Regime: "PÁNICO AGUDO" }],
    ["CRISIS SISTÉMICA", { m6Regime: "CRISIS SISTÉMICA" }],
    ["señal suspendida", { m6Suspended: true }],
  ])("bloquea con %s aunque el resto sea favorable", (_n, over) => {
    const r = con(over as Partial<SoreInput>)
    expect(r.gate).toBe("AVOID")
    expect(r.strategy).toBe("AVOID")
  })

  it("bloquea por debajo del CSS mínimo operable", () => {
    const r = con({
      m1NetGex: -5e9, m1Pressure: -80, m1Pcr: 0.3,
      m6Vix: 12, m6FearScore: 90, m6Regime: "EXPANSIÓN", m5Score: 90,
    })
    expect(r.css).toBeLessThan(CSS_MIN_OPERABLE)
    expect(r.gate).toBe("AVOID")
  })

  it("el bloqueo conserva los subscores para poder auditarlos", () => {
    const r = con({ m6Suspended: true })
    expect(r.gate).toBe("AVOID")
    expect(r.dss).toBeGreaterThan(0)
    expect(r.vss).toBeGreaterThan(0)
    expect(r.css).toBeGreaterThan(0)
  })
})

describe("computeSORE — umbrales de gate", () => {
  it("entre el mínimo operable y el umbral de espera da WAIT conservador", () => {
    const r = con({ m6Vix: 15 })   // hunde el VRP sin tocar el resto
    expect(r.css).toBeGreaterThanOrEqual(CSS_WAIT)
    expect(r.css).toBeLessThan(CSS_GO)
    expect(r.gate).toBe("WAIT")
    expect(r.strategy).toBe("CREDIT SPREAD")   // COMPRESIÓN
  })

  it("fuera de compresión el WAIT usa BWB", () => {
    const r = con({ m6Regime: "EXPANSIÓN", m6FearScore: 38 })
    expect(r.gate).toBe("WAIT")
    expect(r.strategy).toBe("BWB")
  })

  it("GO exige CSS alto Y dealers estabilizando", () => {
    // GEX negativo hunde el DSS por debajo del mínimo aunque el CSS aguante
    const r = con({ m1NetGex: -3e9 })
    expect(r.dss).toBeLessThan(DSS_MIN_GO)
    expect(r.gate).not.toBe("GO")
  })
})

describe("computeSORE — señales EDGAR", () => {
  it("el insider selling fuerte fuerza riesgo definido", () => {
    const r = con({ insiderSignal: -0.8 })
    expect(r.gate).toBe("GO")
    expect(r.strategy).toBe("IRON CONDOR")   // ban de venta desnuda
  })

  it("un insider comprador no cambia la estrategia agresiva", () => {
    expect(con({ insiderSignal: 0.8 }).strategy).toBe("SHORT STRANGLE")
  })

  it("insiderSignal null es neutral, no penalización", () => {
    expect(con({ insiderSignal: null }).dss).toBe(con({}).dss)
  })

  it("un short interest alto capa el VRP", () => {
    expect(con({ shortRatioFloat: 0.16 }).vrp).toBe(30)
    expect(con({ shortRatioFloat: 0.10 }).vrp).toBeGreaterThan(30)
  })

  // CARACTERIZACIÓN, no aprobación: el ban de venta desnuda por short interest
  // (>20%) es inalcanzable. Cualquier valor que lo activaría supera antes el 15%
  // que capa el VRP a 30, y con el VRP capado el CSS máximo posible es 70 —por
  // debajo del umbral de GO (75)— así que nunca se llega a la rama que lo usa.
  // Se deja fijado para que si alguien recalibra los pesos lo vea aparecer.
  it("el ban por short interest es hoy código inalcanzable", () => {
    const r = con({ shortRatioFloat: 0.25, m1NetGex: 50e9, m1Pressure: 100, m1Pcr: 3, insiderSignal: 1 })
    expect(r.vrp).toBe(30)
    expect(r.css).toBeLessThan(CSS_GO)
    expect(r.gate).not.toBe("GO")
  })

  it("un 8-K rutinario impide GO sin forzar AVOID", () => {
    const sinEvento = con({})
    const conEvento = con({ eventSoftCap: true })
    expect(sinEvento.gate).toBe("GO")
    expect(conEvento.gate).toBe("WAIT")
    expect(conEvento.strategy).toBe("CREDIT SPREAD")
    // Los scores no cambian: el soft cap actúa solo sobre el gate.
    expect(conEvento.css).toBe(sinEvento.css)
  })

  it("el soft cap no rebaja un WAIT ni resucita un AVOID", () => {
    expect(con({ m6Vix: 15, eventSoftCap: true }).gate).toBe("WAIT")
    expect(con({ m6Suspended: true, eventSoftCap: true }).gate).toBe("AVOID")
  })
})

describe("computeSORE — VRP", () => {
  it("es cero en el suelo de VIX y satura arriba", () => {
    expect(con({ m6Vix: 12 }).vrp).toBe(0)
    expect(con({ m6Vix: 5 }).vrp).toBe(0)
    expect(con({ m6Vix: 90 }).vrp).toBe(100)
  })

  it("crece con el VIX", () => {
    const vrps = [15, 20, 25, 30].map(v => con({ m6Vix: v }).vrp)
    for (let i = 1; i < vrps.length; i++) expect(vrps[i]).toBeGreaterThan(vrps[i - 1])
  })
})

describe("computeSORE — invariantes", () => {
  it("todos los scores quedan en 0-100 bajo entradas extremas", () => {
    const extremos: Partial<SoreInput>[] = [
      { m1NetGex: 1e15, m1Pressure: 1e6, m1Pcr: 1e6, m6Vix: 1e6, m6FearScore: 1e6, m5Score: 1e6 },
      { m1NetGex: -1e15, m1Pressure: -1e6, m1Pcr: -1e6, m6Vix: -1e6, m6FearScore: -1e6, m5Score: -1e6 },
      { insiderSignal: -1, shortRatioFloat: 1 },
      { insiderSignal: 1, shortRatioFloat: 0 },
    ]
    for (const over of extremos) {
      const r = con(over)
      for (const k of ["css", "dss", "vss", "vrp"] as const) {
        expect(r[k]).toBeGreaterThanOrEqual(0)
        expect(r[k]).toBeLessThanOrEqual(100)
        expect(Number.isFinite(r[k])).toBe(true)
      }
    }
  })

  it("la estrategia siempre pertenece al conjunto declarado", () => {
    for (const reg of ["COMPRESIÓN", "TRANSICIÓN", "EXPANSIÓN", "PÁNICO AGUDO", "CRISIS SISTÉMICA", "DESCONOCIDO"]) {
      for (const fear of [10, 30, 50, 70, 90]) {
        for (const vix of [12, 20, 30, 45]) {
          const r = con({ m6Regime: reg, m6FearScore: fear, m6Vix: vix })
          expect(ESTRATEGIAS).toContain(r.strategy)
          expect(["GO", "WAIT", "AVOID"]).toContain(r.gate)
        }
      }
    }
  })

  it("un régimen desconocido no rompe el cálculo", () => {
    const r = con({ m6Regime: "RÉGIMEN QUE NO EXISTE" })
    expect(Number.isFinite(r.css)).toBe(true)
    expect(r.gate).not.toBe("AVOID")   // neutral 50, no bloqueo
  })

  it("más GEX positivo nunca baja el DSS", () => {
    const dss = [-2e9, 0, 1e9, 4e9].map(g => con({ m1NetGex: g }).dss)
    for (let i = 1; i < dss.length; i++) expect(dss[i]).toBeGreaterThanOrEqual(dss[i - 1])
  })
})

describe("HARD_EVENT_ITEMS", () => {
  it("incluye los 8-K de distress y excluye los rutinarios", () => {
    for (const grave of ["1.03", "2.04", "4.02", "2.02", "1.05"]) {
      expect(HARD_EVENT_ITEMS.has(grave)).toBe(true)
    }
    for (const rutinario of ["5.02", "5.07", "7.01", "8.01"]) {
      expect(HARD_EVENT_ITEMS.has(rutinario)).toBe(false)
    }
  })
})
