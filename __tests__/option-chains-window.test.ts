import {
  isMarketWindow, nyClock, selectExpirations, quoteRatio, resolveTakenAt, daysBetween,
} from "@/lib/option-chains-window"

// Yahoo expresa cada vencimiento como 00:00 UTC de esa fecha.
const ts = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000

describe("nyClock", () => {
  it("convierte a hora de Nueva York en invierno (UTC-5)", () => {
    expect(nyClock(new Date("2026-11-25T15:00:00Z"))).toEqual({ date: "2026-11-25", weekday: 3, minutes: 10 * 60 })
  })
  it("convierte a hora de Nueva York en verano (UTC-4)", () => {
    expect(nyClock(new Date("2026-07-15T14:00:00Z")).minutes).toBe(10 * 60)
  })
  it("de madrugada UTC sigue siendo el día anterior en NY", () => {
    expect(nyClock(new Date("2026-11-26T03:00:00Z")).date).toBe("2026-11-25")
  })
})

describe("isMarketWindow", () => {
  it("acepta el mercado abierto", () => {
    expect(isMarketWindow(new Date("2026-11-25T15:00:00Z"))).toBe(true)   // 10:00 ET
    expect(isMarketWindow(new Date("2026-11-25T20:59:00Z"))).toBe(true)   // 15:59 ET
  })
  it("rechaza el premercado — el caso que llenó option_chains de ceros", () => {
    expect(isMarketWindow(new Date("2026-11-25T12:31:00Z"))).toBe(false)  // 07:31 ET
    expect(isMarketWindow(new Date("2026-11-25T14:40:00Z"))).toBe(false)  // 09:40 ET
  })
  it("rechaza desde el cierre", () => {
    expect(isMarketWindow(new Date("2026-11-25T21:00:00Z"))).toBe(false)  // 16:00 ET
  })
  it("rechaza fines de semana", () => {
    expect(isMarketWindow(new Date("2026-11-28T16:00:00Z"))).toBe(false)  // sábado
    expect(isMarketWindow(new Date("2026-11-29T16:00:00Z"))).toBe(false)  // domingo
  })
})

describe("selectExpirations", () => {
  const today = "2026-11-25"
  const exps = [ts("2026-11-25"), ts("2026-11-26"), ts("2026-11-27"), ts("2026-12-04"), ts("2026-12-11")]

  it("descarta 0DTE y 1DTE y toma los 2 siguientes", () => {
    expect(selectExpirations(exps, today, 2, 2)).toEqual([ts("2026-11-27"), ts("2026-12-04")])
  })
  it("con minDte=0 conserva el comportamiento previo", () => {
    expect(selectExpirations(exps, today, 2, 0)).toEqual([ts("2026-11-25"), ts("2026-11-26")])
  })
  it("ordena aunque Yahoo los entregue desordenados", () => {
    expect(selectExpirations([...exps].reverse(), today, 1, 2)).toEqual([ts("2026-11-27")])
  })
  it("devuelve vacío si no queda ningún vencimiento válido", () => {
    expect(selectExpirations([ts("2026-11-25")], today, 2, 2)).toEqual([])
  })
})

describe("daysBetween", () => {
  it("cuenta días calendario", () => {
    expect(daysBetween("2026-11-25", "2026-11-27")).toBe(2)
    expect(daysBetween("2026-11-25", "2026-11-25")).toBe(0)
  })
})

describe("quoteRatio", () => {
  it("cuenta solo contratos con bid y ask positivos", () => {
    expect(quoteRatio([
      { bid: 1, ask: 1.1 }, { bid: 0, ask: 0 }, { bid: null, ask: 2 }, { bid: 0.5, ask: 0.6 },
    ])).toBe(0.5)
  })
  it("cadena vacía = 0", () => {
    expect(quoteRatio([])).toBe(0)
  })
})

describe("resolveTakenAt", () => {
  const now = new Date("2026-11-25T16:00:00Z")
  it("usa el taken_at del workflow si es reciente", () => {
    expect(resolveTakenAt("2026-11-25T15:30:00Z", now)).toBe("2026-11-25T15:30:00.000Z")
  })
  it("ignora valores viejos, futuros o inválidos", () => {
    expect(resolveTakenAt("2026-11-25T10:00:00Z", now)).toBe(now.toISOString())
    expect(resolveTakenAt("2026-11-25T17:00:00Z", now)).toBe(now.toISOString())
    expect(resolveTakenAt("basura", now)).toBe(now.toISOString())
    expect(resolveTakenAt(null, now)).toBe(now.toISOString())
  })
})
