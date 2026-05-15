// Persistencia de snapshots diarios en methodology_snapshots.
//
// methodology_snapshots es una tabla genérica (methodology + payload jsonb).
// La reutilizamos para historiales que se construyen "al leer": cada GET a
// /api/iv y /api/analysis7 deja una fila por ticker y día UTC, y la siguiente
// lectura usa el historial acumulado (IV Rank/Percentile, días de confirmación
// de niveles S/R). No requiere tabla nueva ni migración.

import { supabaseServer } from "@/lib/supabase"

// Metodologías propias de este módulo — distintas de "M6", que escribe el cron.
export const SNAPSHOT_IV = "IV"
export const SNAPSHOT_SR = "SR"

/**
 * Historial de payloads de una metodología para un símbolo concreto, en orden
 * cronológico ascendente (el último es el más reciente). Best-effort: ante
 * cualquier error devuelve [] para no romper la respuesta de la API.
 */
export async function readSnapshotHistory(
  methodology: string,
  symbol: string,
  lookbackDays = 365,
): Promise<Record<string, unknown>[]> {
  try {
    const db = supabaseServer()
    const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
    const { data, error } = await db
      .from("methodology_snapshots")
      .select("payload")
      .eq("methodology", methodology)
      .gte("taken_at", since)
      .order("taken_at", { ascending: true })
    if (error || !data) return []
    return data
      .map(r => r.payload as Record<string, unknown> | null)
      .filter((p): p is Record<string, unknown> => !!p && p.symbol === symbol)
  } catch {
    return []
  }
}

/**
 * Inserta un snapshot del día para `symbol` si aún no existe uno de esa
 * metodología en la fecha UTC actual. Idempotente por día — varias visitas al
 * mismo endpoint no duplican filas. Best-effort: los errores se ignoran porque
 * el historial es un extra y nunca debe tumbar la respuesta de la API.
 */
export async function recordDailySnapshot(
  methodology: string,
  symbol: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const db = supabaseServer()
    const since = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"
    const { data: today } = await db
      .from("methodology_snapshots")
      .select("payload")
      .eq("methodology", methodology)
      .gte("taken_at", since)
    const already = (today ?? []).some(
      r => (r.payload as { symbol?: string } | null)?.symbol === symbol,
    )
    if (already) return
    await db.from("methodology_snapshots").insert({
      methodology,
      payload: { ...payload, symbol } as never,
    })
  } catch {
    /* best-effort */
  }
}
