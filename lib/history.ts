// Valoración histórica — "¿está barata vs su propia historia?"
//
// Lee methodology_snapshots (el cron guarda una fila por símbolo/día) y, para cada
// ticker, calcula en qué percentil de su propia historia está su valor más reciente.
//
// Percentil alto de PE = la acción está cara respecto a como cotizó antes.
// Percentil bajo de PE = está barata respecto a su propia historia → señal de compra.

import { supabaseServer } from "@/lib/supabase"

// Métricas del payload ConvictionRow sobre las que se mide el percentil.
export type HistoricalMetric = "pe" | "buyScore" | "discountToGraham"

// Percentil 0-100: porcentaje de observaciones históricas <= el valor actual.
// Exportada para test unitario.
export function percentileOf(value: number, history: number[]): number {
  if (history.length < 2) return 50
  const below = history.filter(h => h <= value).length
  return Math.round((below / history.length) * 100)
}

/**
 * Para cada símbolo en methodology_snapshots, devuelve el percentil histórico de su
 * valor más reciente de `metric`. Una sola consulta cubre todo el universo.
 *
 * @returns Map<ticker, percentil 0-100>. Símbolos sin historia suficiente se omiten.
 */
export async function getHistoricalPercentiles(
  metric: HistoricalMetric = "pe",
  lookbackDays = 365,
): Promise<Map<string, number>> {
  const db = supabaseServer()
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()

  const { data, error } = await db
    .from("methodology_snapshots")
    .select("payload, taken_at")
    .eq("methodology", "M6")
    .gte("taken_at", since)
    .order("taken_at", { ascending: true })

  if (error || !data) return new Map()

  // Agrupar valores por ticker en orden cronológico (el último es el actual).
  const series = new Map<string, number[]>()
  for (const row of data) {
    const p = row.payload as Record<string, unknown> | null
    if (!p) continue
    const symbol = typeof p.symbol === "string" ? p.symbol : null
    const raw = p[metric]
    if (!symbol || typeof raw !== "number" || !Number.isFinite(raw)) continue
    if (metric === "pe" && raw <= 0) continue   // PE no positivo = sin earnings, se ignora

    const arr = series.get(symbol) ?? []
    arr.push(raw)
    series.set(symbol, arr)
  }

  const result = new Map<string, number>()
  for (const [symbol, values] of series) {
    if (values.length < 2) continue   // sin historia suficiente para un percentil útil
    const current = values[values.length - 1]
    result.set(symbol, percentileOf(current, values))
  }
  return result
}
