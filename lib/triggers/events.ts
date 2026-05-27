import type { TypedClient } from "@/lib/supabase"
import type { SnapshotPayload } from "./conditions"

export type MacroEventInfo = {
  hasFomc: boolean
  nextEvent: { date: string; type: string; description: string | null } | null
}

/**
 * Lee `macro_events` y dice si hay un evento HIGH en la ventana
 * `[today, today + daysAhead]`. Default daysAhead=1 cubre hoy + mañana.
 */
export async function hasEventInWindow(
  db: TypedClient,
  today: string,
  daysAhead = 1,
): Promise<MacroEventInfo> {
  const end = new Date(today)
  end.setDate(end.getDate() + daysAhead)
  const endStr = end.toISOString().slice(0, 10)

  const { data } = await db
    .from("macro_events")
    .select("date, event_type, description")
    .gte("date", today)
    .lte("date", endStr)
    .eq("importance", "HIGH")
    .order("date", { ascending: true })
    .limit(5)

  const events = data ?? []
  const hasFomc = events.some(e => e.event_type === "FOMC")
  const next = events[0] ?? null

  return {
    hasFomc,
    nextEvent: next
      ? { date: next.date, type: next.event_type, description: next.description }
      : null,
  }
}

/**
 * El payload del scanner-pro trae `earningsDate` como string libre tipo
 * "2026-06-15" o "Apr 30, 2026". Esta función tolera ambos formatos y
 * devuelve true si está dentro de `daysAhead` días (default 3) de `today`.
 *
 * Si no hay fecha o no se puede parsear, devuelve false — no bloquea.
 */
export function isNearEarnings(
  payload: SnapshotPayload,
  today: string,
  daysAhead = 3,
): boolean {
  const raw = (payload as { earningsDate?: string }).earningsDate
  if (!raw || typeof raw !== "string") return false
  const ts = Date.parse(raw)
  if (Number.isNaN(ts)) return false
  const todayTs = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(todayTs)) return false
  const diffDays = (ts - todayTs) / 86_400_000
  // Earnings hoy, mañana o pasado mañana → bloquear apertura.
  // Earnings ya pasadas (diffDays < 0) NO bloquean — esa info ya está en el precio.
  return diffDays >= 0 && diffDays <= daysAhead
}
