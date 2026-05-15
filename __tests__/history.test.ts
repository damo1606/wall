import { percentileOf } from "@/lib/history"

describe("percentileOf", () => {
  const serie = [1, 2, 3, 4, 5]

  it("el valor más alto cae en el percentil 100", () => {
    expect(percentileOf(5, serie)).toBe(100)
  })

  it("el valor más bajo cae en el percentil bajo", () => {
    expect(percentileOf(1, serie)).toBe(20)
  })

  it("un valor intermedio cae en un percentil intermedio", () => {
    expect(percentileOf(3, serie)).toBe(60)
  })

  it("con historia insuficiente devuelve 50 (neutral)", () => {
    expect(percentileOf(5, [5])).toBe(50)
    expect(percentileOf(5, [])).toBe(50)
  })
})
