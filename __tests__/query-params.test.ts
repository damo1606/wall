import { intParam, strictIntParam } from "@/lib/query-params"

describe("intParam", () => {
  it("lee un entero válido", () => {
    expect(intParam("42", { def: 20 })).toBe(42)
  })

  it("usa el defecto si falta el parámetro", () => {
    expect(intParam(null, { def: 20 })).toBe(20)
    expect(intParam(undefined, { def: 20 })).toBe(20)
    expect(intParam("", { def: 20 })).toBe(20)
  })

  // El bug original: Math.max/Math.min PROPAGAN NaN, así que el patrón anterior
  // devolvía NaN y de ahí salía un slice(0, NaN) → lista vacía silenciosa.
  it("nunca devuelve NaN con entradas basura", () => {
    for (const basura of ["abc", "1e", "--5", "NaN", "Infinity", "null", "{}"]) {
      const v = intParam(basura, { def: 20, min: 1, max: 100 })
      expect(Number.isNaN(v)).toBe(false)
      expect(v).toBe(20)
    }
  })

  it("reproduce el escenario de cron que procesaba 0 filas", () => {
    // Antes: Math.max(1, Math.min(200, parseInt("abc", 10))) === NaN
    expect(Math.max(1, Math.min(200, Number.parseInt("abc", 10)))).toBeNaN()
    // Ahora:
    expect(intParam("abc", { def: 100, min: 1, max: 200 })).toBe(100)
  })

  it("acota por min y max", () => {
    expect(intParam("999", { def: 20, min: 1, max: 100 })).toBe(100)
    expect(intParam("-5",  { def: 20, min: 1, max: 100 })).toBe(1)
  })

  it("acota también el valor por defecto", () => {
    expect(intParam(null, { def: 999, min: 1, max: 100 })).toBe(100)
  })

  // parseInt a secas aceptaría "7.9" como 7 y "1e" como 1. Para un parámetro de
  // API eso es tragarse en silencio algo que el cliente no quiso mandar.
  it("rechaza enteros sucios en vez de truncarlos", () => {
    expect(intParam("7.9", { def: 1 })).toBe(1)
    expect(intParam("1e",  { def: 1 })).toBe(1)
    expect(intParam("12abc", { def: 1 })).toBe(1)
  })

  it("tolera espacios alrededor", () => {
    expect(intParam("  42  ", { def: 1 })).toBe(42)
  })
})

describe("strictIntParam", () => {
  it("devuelve null ante una entrada inválida, para poder responder 400", () => {
    expect(strictIntParam("abc", { def: 20 })).toBeNull()
    expect(strictIntParam("xyz", { def: 50, min: 0, max: 100 })).toBeNull()
  })

  it("distingue 'ausente' de 'inválido'", () => {
    expect(strictIntParam(null, { def: 20 })).toBe(20)   // ausente → defecto
    expect(strictIntParam("abc", { def: 20 })).toBeNull() // inválido → error
  })

  it("acota igual que intParam cuando el valor es válido", () => {
    expect(strictIntParam("999", { def: 20, min: 1, max: 100 })).toBe(100)
  })
})
