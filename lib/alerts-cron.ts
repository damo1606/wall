// Orquestación de alertas para el cron diario (parte que toca la base de datos).
// La lógica pura vive en lib/alerts-eval.ts; aquí solo se lee/escribe Supabase.

import type { TypedClient } from "@/lib/supabase"
import { detectCrossings, evaluateUserAlert, type AlertScanRow } from "@/lib/alerts-eval"

const DEDUP_WINDOW_MS = 20 * 3_600_000   // no repetir el mismo aviso dentro de ~20h

type ConvictionLike = Record<string, unknown>

function toScanRow(r: ConvictionLike): AlertScanRow {
  return {
    symbol:           String(r.symbol ?? ""),
    currentPrice:     Number(r.currentPrice ?? 0),
    pe:               Number(r.pe ?? 0),
    buyScore:         Number(r.buyScore ?? 0),
    convictionScore:  Number(r.convictionScore ?? 0),
    m7Score:          Number(r.m7Score ?? 0),
    soreGate:         (r.soreGate as AlertScanRow["soreGate"]) ?? "WAIT",
    dropFrom52w:      Number(r.dropFrom52w ?? 0),
    discountToGraham: Number(r.discountToGraham ?? 0),
    upsideToTarget:   Number(r.upsideToTarget ?? 0),
  }
}

export type AlertRunResult = { fired: number; messages: string[] }

/**
 * Evalúa la regla global de cruce + las reglas de usuario contra el snapshot de hoy
 * e inserta los disparos en alert_events. Devuelve cuántos disparó y los mensajes
 * (para enviarlos a Discord desde el cron).
 */
export async function evaluateAndStoreAlerts(
  db: TypedClient,
  rows: ConvictionLike[],
  symbolMap: Map<string, string>,   // ticker -> symbol_id
  runStartIso: string,
): Promise<AlertRunResult> {
  const today = rows.map(toScanRow).filter(r => r.symbol)
  if (today.length === 0) return { fired: 0, messages: [] }

  // Snapshot del cron anterior — base de comparación para la regla de cruce.
  const { data: prevMeta } = await db
    .from("methodology_snapshots")
    .select("taken_at")
    .eq("methodology", "M6")
    .lt("taken_at", runStartIso)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let previous: AlertScanRow[] = []
  if (prevMeta?.taken_at) {
    const t = new Date(prevMeta.taken_at).getTime()
    const from = new Date(t - 6 * 3_600_000).toISOString()
    const to   = new Date(t + 6 * 3_600_000).toISOString()
    const { data } = await db
      .from("methodology_snapshots")
      .select("payload")
      .eq("methodology", "M6")
      .gte("taken_at", from)
      .lte("taken_at", to)
    previous = (data ?? [])
      .map(d => toScanRow(d.payload as unknown as ConvictionLike))
      .filter(r => r.symbol)
  }

  // Dedup: avisos ya disparados en las últimas ~20h.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  const { data: recent } = await db
    .from("alert_events")
    .select("alert_id, symbol_id, kind")
    .gte("created_at", dedupSince)
  const recentCrossingSymbols = new Set(
    (recent ?? []).filter(e => e.kind === "cruce_compra_fuerte" && e.symbol_id).map(e => e.symbol_id as string),
  )
  const recentAlertIds = new Set(
    (recent ?? []).filter(e => e.alert_id).map(e => e.alert_id as string),
  )

  type EventInsert = {
    user_id: string | null
    alert_id: string | null
    symbol_id: string | null
    kind: string
    message: string
    opportunity_score: number | null
  }
  const events: EventInsert[] = []
  const messages: string[] = []

  // ── Regla global: tickers que cruzan a compra fuerte ──
  for (const c of detectCrossings(today, previous)) {
    const symbolId = symbolMap.get(c.symbol) ?? null
    if (symbolId && recentCrossingSymbols.has(symbolId)) continue
    const msg = `${c.symbol} cruzó a COMPRA FUERTE (score ${c.score}/100).`
    events.push({
      user_id: null, alert_id: null, symbol_id: symbolId,
      kind: "cruce_compra_fuerte", message: msg, opportunity_score: c.score,
    })
    messages.push(`🟢 ${msg}`)
  }

  // ── Reglas de usuario ──
  const { data: userAlerts } = await db
    .from("alerts")
    .select("id, user_id, condition, threshold, symbol_id, symbols(ticker)")
    .eq("is_active", true)

  const byTicker = new Map(today.map(r => [r.symbol, r]))
  for (const a of userAlerts ?? []) {
    if (recentAlertIds.has(a.id)) continue
    const rel = a.symbols as { ticker?: string } | { ticker?: string }[] | null
    const ticker = Array.isArray(rel) ? rel[0]?.ticker : rel?.ticker
    if (!ticker) continue
    const row = byTicker.get(ticker)
    if (!row) continue

    const threshold = (a.threshold ?? {}) as Record<string, unknown>
    if (!evaluateUserAlert(a.condition, threshold, row)) continue

    const label = typeof threshold.label === "string" ? threshold.label : a.condition
    const msg = `${ticker}: alerta "${label}" activada — precio $${row.currentPrice.toFixed(2)}.`
    events.push({
      user_id: a.user_id, alert_id: a.id, symbol_id: a.symbol_id,
      kind: "alerta_usuario", message: msg, opportunity_score: null,
    })
    messages.push(`🔔 ${msg}`)
  }

  if (events.length > 0) {
    await db.from("alert_events").insert(events)
  }
  return { fired: events.length, messages }
}
