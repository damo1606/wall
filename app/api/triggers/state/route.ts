import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export type TriggersState = {
  openEntries: Array<{
    id: string
    ticker: string
    ruleName: string
    entryDate: string
    entryPrice: number
    rotationStatus: string | null
    currentPrice: number | null
    unrealizedPct: number | null
    daysOpen: number
  }>
  recentExits: Array<{
    id: string
    ticker: string
    ruleName: string
    entryDate: string
    exitDate: string
    entryPrice: number
    exitPrice: number
    returnPct: number
    daysHeld: number
    exitReason: string
  }>
  conditionAttribution: Array<{
    conditionName: string
    metCount: number
    totalCount: number
    metRate: number  // 0-1
  }>
  // Conteos rápidos para el header
  stats: {
    openCount: number
    closedLast30d: number
    winRate30d: number | null  // % de cierres con return_pct > 0
  }
}

export async function GET(): Promise<NextResponse<TriggersState | { error: string }>> {
  const db = supabaseServer()

  // ── 1. Entries OPEN
  const { data: openRaw, error: openErr } = await db
    .from("trade_entries")
    .select(`
      id, entry_date, entry_price, rotation_status, symbol_id, rule_id, created_at
    `)
    .eq("status", "OPEN")
    .order("entry_date", { ascending: false })
  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 })

  // ── 2. Cierres recientes (últimos 30 días)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data: exitsRaw, error: exErr } = await db
    .from("trade_exits")
    .select(`
      entry_id, exit_date, exit_price, exit_reason, return_pct, days_held
    `)
    .gte("exit_date", cutoffStr)
    .order("exit_date", { ascending: false })
    .limit(100)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

  // Lookups: símbolos, reglas, precios
  const allSymbolIds = new Set<string>()
  const allRuleIds   = new Set<string>()
  for (const r of openRaw ?? []) { allSymbolIds.add(r.symbol_id); allRuleIds.add(r.rule_id) }

  const exitEntryIds = (exitsRaw ?? []).map(e => e.entry_id)
  let exitEntriesData: Array<{ id: string; symbol_id: string; rule_id: string; entry_date: string; entry_price: number }> = []
  if (exitEntryIds.length > 0) {
    const { data } = await db
      .from("trade_entries")
      .select("id, symbol_id, rule_id, entry_date, entry_price")
      .in("id", exitEntryIds)
    exitEntriesData = (data ?? []) as typeof exitEntriesData
    for (const e of exitEntriesData) { allSymbolIds.add(e.symbol_id); allRuleIds.add(e.rule_id) }
  }

  const symbolIds = Array.from(allSymbolIds)
  const ruleIds   = Array.from(allRuleIds)

  const [symbolsR, rulesR, pricesR] = await Promise.all([
    symbolIds.length
      ? db.from("symbols").select("id, ticker").in("id", symbolIds)
      : Promise.resolve({ data: [] as Array<{ id: string; ticker: string }> }),
    ruleIds.length
      ? db.from("trigger_rules").select("id, name").in("id", ruleIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    symbolIds.length
      ? db.from("price_summary_daily").select("symbol_id, close").in("symbol_id", symbolIds)
      : Promise.resolve({ data: [] as Array<{ symbol_id: string; close: number | null }> }),
  ])
  const tickerById = new Map((symbolsR.data ?? []).map(s => [s.id, s.ticker]))
  const ruleNameById = new Map((rulesR.data ?? []).map(r => [r.id, r.name]))
  const closeBySymbol = new Map((pricesR.data ?? []).map(p => [p.symbol_id, p.close ? Number(p.close) : null]))

  const today = new Date()
  const daysSince = (d: string) => Math.max(0, Math.floor((today.getTime() - Date.parse(d)) / 86_400_000))

  const openEntries: TriggersState["openEntries"] = (openRaw ?? []).map(r => {
    const cur = closeBySymbol.get(r.symbol_id) ?? null
    const entryPrice = Number(r.entry_price)
    const unrealized = cur != null && entryPrice > 0 ? ((cur - entryPrice) / entryPrice) * 100 : null
    return {
      id: r.id,
      ticker: tickerById.get(r.symbol_id) ?? "?",
      ruleName: ruleNameById.get(r.rule_id) ?? "?",
      entryDate: r.entry_date,
      entryPrice,
      rotationStatus: r.rotation_status,
      currentPrice: cur,
      unrealizedPct: unrealized,
      daysOpen: daysSince(r.entry_date),
    }
  })

  const exitEntriesById = new Map(exitEntriesData.map(e => [e.id, e]))
  const recentExits: TriggersState["recentExits"] = (exitsRaw ?? []).map(x => {
    const ent = exitEntriesById.get(x.entry_id)
    return {
      id: x.entry_id,
      ticker: ent ? (tickerById.get(ent.symbol_id) ?? "?") : "?",
      ruleName: ent ? (ruleNameById.get(ent.rule_id) ?? "?") : "?",
      entryDate: ent?.entry_date ?? "—",
      exitDate: x.exit_date,
      entryPrice: ent ? Number(ent.entry_price) : 0,
      exitPrice: Number(x.exit_price),
      returnPct: Number(x.return_pct),
      daysHeld: x.days_held,
      exitReason: x.exit_reason,
    }
  })

  // ── 3. Atribución por condición
  const { data: condRows } = await db
    .from("trade_entry_conditions")
    .select(`met, condition_id`)
  const { data: condDefs } = await db
    .from("trigger_rule_conditions")
    .select(`id, condition_name`)
  const condNameById = new Map((condDefs ?? []).map(c => [c.id, c.condition_name]))
  const agg = new Map<string, { met: number; total: number }>()
  for (const r of condRows ?? []) {
    const name = condNameById.get(r.condition_id)
    if (!name) continue
    const cur = agg.get(name) ?? { met: 0, total: 0 }
    cur.total++
    if (r.met) cur.met++
    agg.set(name, cur)
  }
  const conditionAttribution: TriggersState["conditionAttribution"] = Array.from(agg.entries())
    .map(([name, c]) => ({
      conditionName: name,
      metCount: c.met,
      totalCount: c.total,
      metRate: c.total > 0 ? c.met / c.total : 0,
    }))
    .sort((a, b) => b.metCount - a.metCount)

  // ── 4. Stats rápidas
  const wins = recentExits.filter(e => e.returnPct > 0).length
  const winRate30d = recentExits.length > 0 ? wins / recentExits.length : null

  return NextResponse.json({
    openEntries,
    recentExits,
    conditionAttribution,
    stats: {
      openCount: openEntries.length,
      closedLast30d: recentExits.length,
      winRate30d,
    },
  })
}
