import type { TypedClient } from "@/lib/supabase"
import { CONDITIONS, evaluateCondition, type SnapshotPayload } from "./conditions"
import { firstFiringExit, type ExitContext, type ExitReason } from "./exits"
import { loadRotationMap, rotationFor, type MacroPhase, type RotationMap, type RotationStatus } from "./rotation"
import { hasEventInWindow, isNearEarnings, type MacroEventInfo } from "./events"

export type EngineResult = {
  entriesOpened: number
  exitsClosed:   number
  symbolsScanned: number
  rulesEvaluated: number
  errors: string[]
  entriesDetail: EntryDetail[]
  exitsDetail:   ExitDetail[]
  macroEvent: MacroEventInfo
  skippedByEarnings: number
  skippedByFomc: number
}

export type EntryDetail = {
  ticker: string
  ruleName: string
  entryPrice: number
  rotationStatus: RotationStatus
  conditionsMet: number
  conditionsTotal: number
  earningsWithin5d: boolean
}

export type ExitDetail = {
  ticker: string
  ruleName: string
  exitReason: ExitReason
  exitPrice: number
  entryPrice: number
  returnPct: number
  daysHeld: number
}

type RuleHeader = {
  id: string
  name: string
  rule_type: "BUY" | "SELL"
  min_conditions_met: number | null
}
type RuleConditionRow = { id: string; rule_id: string; condition_name: string }
type RuleExitRow      = { id: string; rule_id: string; exit_reason: ExitReason; order_index: number }
type RuleFilterRow    = { id: string; rule_id: string; filter_key: string; op: string; filter_value: string }

type RulePack = {
  buy: Array<{
    rule: RuleHeader
    conditions: RuleConditionRow[]
    filters:    RuleFilterRow[]
  }>
  sell: Array<{
    rule: RuleHeader
    exits: RuleExitRow[]
  }>
}

async function loadRules(db: TypedClient): Promise<RulePack> {
  const [{ data: rules }, { data: conds }, { data: exits }, { data: filters }] = await Promise.all([
    db.from("trigger_rules").select("id, name, rule_type, min_conditions_met").eq("active", true),
    db.from("trigger_rule_conditions").select("id, rule_id, condition_name"),
    db.from("trigger_rule_exits").select("id, rule_id, exit_reason, order_index").order("order_index"),
    db.from("trigger_rule_filters").select("id, rule_id, filter_key, op, filter_value"),
  ])

  const byRule = <T extends { rule_id: string }>(arr: T[] | null) => {
    const m = new Map<string, T[]>()
    for (const r of arr ?? []) {
      const a = m.get(r.rule_id) ?? []
      a.push(r); m.set(r.rule_id, a)
    }
    return m
  }

  const condsByRule   = byRule(conds   as RuleConditionRow[] | null)
  const exitsByRule   = byRule(exits   as RuleExitRow[]      | null)
  const filtersByRule = byRule(filters as RuleFilterRow[]    | null)

  const buy:  RulePack["buy"]  = []
  const sell: RulePack["sell"] = []
  for (const r of (rules ?? []) as RuleHeader[]) {
    if (r.rule_type === "BUY") {
      buy.push({ rule: r, conditions: condsByRule.get(r.id) ?? [], filters: filtersByRule.get(r.id) ?? [] })
    } else if (r.rule_type === "SELL") {
      sell.push({ rule: r, exits: exitsByRule.get(r.id) ?? [] })
    }
  }
  return { buy, sell }
}

// ── Filtros: evalúa todas las filas de trigger_rule_filters como AND
type FilterCtx = {
  rotation_status:   RotationStatus
  m6_regime:         string | null
  liquidity_usd_20d: number | null
  macro_phase:       MacroPhase
}

function passesFilters(filters: RuleFilterRow[], ctx: FilterCtx): boolean {
  // Agrupar por (filter_key, op) — múltiples filas con IN/NOT IN del mismo key
  // se interpretan como conjunto de valores.
  // Para los demás operadores cada fila es una condición AND.
  const inGroups = new Map<string, string[]>()
  const conds: RuleFilterRow[] = []
  for (const f of filters) {
    if (f.op === "IN" || f.op === "NOT IN") {
      const k = `${f.filter_key}|${f.op}`
      const a = inGroups.get(k) ?? []
      a.push(f.filter_value)
      inGroups.set(k, a)
    } else conds.push(f)
  }

  // Single-value ops
  for (const f of conds) {
    const left = ctx[f.filter_key as keyof FilterCtx]
    const right = f.filter_value
    const ok = evalOp(left, f.op, right)
    if (!ok) return false
  }
  // IN / NOT IN
  for (const [k, values] of inGroups) {
    const [filterKey, op] = k.split("|")
    const left = ctx[filterKey as keyof FilterCtx]
    if (left == null) return false
    const inSet = values.includes(String(left))
    if (op === "IN" && !inSet) return false
    if (op === "NOT IN" && inSet) return false
  }
  return true
}

function evalOp(left: unknown, op: string, right: string): boolean {
  if (left == null) return false
  const ls = String(left)
  const ln = typeof left === "number" ? left : Number(left)
  const rn = Number(right)
  switch (op) {
    case "=":  return ls === right
    case "!=": return ls !== right
    case ">":  return !Number.isNaN(ln) && !Number.isNaN(rn) && ln >  rn
    case ">=": return !Number.isNaN(ln) && !Number.isNaN(rn) && ln >= rn
    case "<":  return !Number.isNaN(ln) && !Number.isNaN(rn) && ln <  rn
    case "<=": return !Number.isNaN(ln) && !Number.isNaN(rn) && ln <= rn
    default:   return false
  }
}

type SnapshotRow = {
  id: string                  // methodology_snapshots.id
  symbol_id: string
  payload: SnapshotPayload
}

type SymbolMeta = {
  id: string
  ticker: string
}

export type EngineDeps = {
  db: TypedClient
  cronRunId: string
  today: string               // 'YYYY-MM-DD'
  macroPhase: MacroPhase
  m6Regime: string | null
}

export async function runEngine(deps: EngineDeps): Promise<EngineResult> {
  const { db, cronRunId, today, macroPhase, m6Regime } = deps
  const errors: string[] = []
  const entriesDetail: EntryDetail[] = []
  const exitsDetail:   ExitDetail[]  = []
  let entriesOpened = 0
  let exitsClosed   = 0
  let skippedByEarnings = 0
  let skippedByFomc     = 0

  // ── Eventos macro: FOMC en próximos 2 días bloquea aperturas ────────────
  const macroEvent = await hasEventInWindow(db, today, 1)
  const blockAllOpens = macroEvent.hasFomc

  // ── Carga catálogos
  const [rules, rotationMap, { data: symbolsRaw }] = await Promise.all([
    loadRules(db),
    loadRotationMap(db),
    db.from("symbols").select("id, ticker").eq("is_active", true),
  ])
  const symbols = (symbolsRaw ?? []) as SymbolMeta[]
  const tickerById = new Map(symbols.map(s => [s.id, s.ticker]))

  // ── Snapshots del día: últimos por (symbol_id, methodology=M6)
  // Como M6 puede tener varias filas del mismo símbolo en el día, tomar la
  // más reciente por símbolo.
  const todayStart = `${today}T00:00:00Z`
  const todayEnd   = `${today}T23:59:59Z`
  const { data: snapsRaw, error: snapsErr } = await db
    .from("methodology_snapshots")
    .select("id, symbol_id, payload, taken_at")
    .eq("methodology", "M6")
    .gte("taken_at", todayStart)
    .lte("taken_at", todayEnd)
    .order("taken_at", { ascending: false })
  if (snapsErr) errors.push(`snapshots: ${snapsErr.message}`)

  const latestBySymbol = new Map<string, SnapshotRow>()
  for (const s of (snapsRaw ?? []) as Array<{ id: string; symbol_id: string; payload: SnapshotPayload }>) {
    if (!latestBySymbol.has(s.symbol_id)) latestBySymbol.set(s.symbol_id, s)
  }
  const snapshots = Array.from(latestBySymbol.values())

  // ── Liquidez (price_summary_daily.dollar_volume_20d) por symbol_id
  const { data: liqRaw } = await db
    .from("price_summary_daily")
    .select("symbol_id, dollar_volume_20d, close")
  const liqBySymbol = new Map<string, { dvol: number | null; close: number | null }>()
  for (const r of liqRaw ?? []) {
    liqBySymbol.set(r.symbol_id, { dvol: r.dollar_volume_20d as number | null, close: r.close as number | null })
  }

  // ── BUY: por símbolo × regla
  for (const snap of snapshots) {
    const ticker = tickerById.get(snap.symbol_id) ?? "?"

    // FOMC: día 0 o día 1 → no abrir absolutamente nada
    if (blockAllOpens) { skippedByFomc++; continue }

    // Earnings en próximos 3 días → no abrir este símbolo
    const nearEarnings = isNearEarnings(snap.payload, today, 3)
    if (nearEarnings) { skippedByEarnings++; continue }

    // earnings_within_5d se calcula con ventana más amplia (5 días) para tag/análisis
    const earningsWithin5d = isNearEarnings(snap.payload, today, 5)

    const sectorYahoo = snap.payload.sector
    const rot = rotationFor(sectorYahoo, macroPhase, rotationMap)
    const liq = liqBySymbol.get(snap.symbol_id)
    const filterCtx: FilterCtx = {
      rotation_status:   rot.status,
      m6_regime:         m6Regime ?? snap.payload.m6Regime ?? null,
      liquidity_usd_20d: liq?.dvol ?? null,
      macro_phase:       macroPhase,
    }
    const currentPrice = snap.payload.currentPrice ?? liq?.close ?? null

    for (const { rule, conditions, filters } of rules.buy) {
      // 1) Filtros
      if (!passesFilters(filters, filterCtx)) continue

      // 2) Si ya hay una OPEN para (symbol, rule), no se duplica
      const { data: existing } = await db
        .from("trade_entries")
        .select("id")
        .eq("symbol_id", snap.symbol_id)
        .eq("rule_id", rule.id)
        .eq("status", "OPEN")
        .limit(1)
      if (existing && existing.length > 0) continue

      // 3) Evaluar condiciones — contar y registrar cada una
      const conditionResults: Array<{ id: string; met: boolean }> = []
      let met = 0
      for (const c of conditions) {
        const r = evaluateCondition(c.condition_name, snap.payload)
        if (r === null) continue  // condición desconocida — ignorar
        conditionResults.push({ id: c.id, met: r })
        if (r) met++
      }
      const min = rule.min_conditions_met ?? conditions.length
      if (met < min) continue

      // 4) Insertar entry + condiciones
      if (currentPrice == null || currentPrice <= 0) {
        errors.push(`${ticker}/${rule.name}: sin currentPrice`)
        continue
      }
      const { data: entryRow, error: entErr } = await db
        .from("trade_entries")
        .insert({
          snapshot_id: snap.id,
          rule_id:     rule.id,
          symbol_id:   snap.symbol_id,
          sector_id:   rot.sectorId,
          entry_date:  today,
          entry_price: currentPrice,
          rotation_status: rot.status,
          rotation_boost:  rot.weight,
          earnings_within_5d: earningsWithin5d,
          cron_run_id: cronRunId,
          status:      "OPEN",
        })
        .select("id")
        .single()
      if (entErr || !entryRow) { errors.push(`${ticker}/${rule.name}: insert entry — ${entErr?.message}`); continue }

      if (conditionResults.length > 0) {
        const { error: condErr } = await db
          .from("trade_entry_conditions")
          .insert(conditionResults.map(cr => ({
            trade_entry_id: entryRow.id,
            condition_id:   cr.id,
            met:            cr.met,
          })))
        if (condErr) errors.push(`${ticker}/${rule.name}: insert conditions — ${condErr.message}`)
      }
      entriesOpened++
      entriesDetail.push({
        ticker,
        ruleName: rule.name,
        entryPrice: currentPrice,
        rotationStatus: rot.status,
        conditionsMet: met,
        conditionsTotal: conditions.length,
        earningsWithin5d,
      })
    }
  }

  // ── SELL: por trade_entries OPEN
  const { data: openEntries } = await db
    .from("trade_entries")
    .select("id, symbol_id, rule_id, entry_date, entry_price, rotation_status, snapshot_id")
    .eq("status", "OPEN")
  for (const e of (openEntries ?? []) as Array<{
    id: string; symbol_id: string; rule_id: string;
    entry_date: string; entry_price: number; rotation_status: RotationStatus | null;
    snapshot_id: string | null;
  }>) {
    // Obtener payload del entry para CSS
    let entryCss: number | null = null
    if (e.snapshot_id) {
      const { data: esnap } = await db
        .from("methodology_snapshots").select("payload").eq("id", e.snapshot_id).maybeSingle()
      entryCss = (esnap?.payload as SnapshotPayload | undefined)?.soreCSS ?? null
    }

    // Current snapshot del símbolo (último del día)
    const cur = latestBySymbol.get(e.symbol_id)
    const liq = liqBySymbol.get(e.symbol_id)
    const currentPrice = cur?.payload.currentPrice ?? liq?.close ?? null
    const currentCss   = cur?.payload.soreCSS ?? null
    const sectorYahoo  = cur?.payload.sector
    const rotNow = rotationFor(sectorYahoo, macroPhase, rotationMap).status

    if (currentPrice == null || currentPrice <= 0) continue

    // Si hoy hay FOMC o el símbolo tiene earnings hoy/mañana, pausamos
    // STOP_LOSS y SIGNAL_DEGRADED (reacciones intradía) — los exits
    // sistémicos (REGIME_FLIP, ROTATION_FLIP, TIME_EXIT) y TAKE_PROFIT siguen.
    const pauseIntraday =
      macroEvent.hasFomc ||
      (cur?.payload ? isNearEarnings(cur.payload, today, 0) : false)
    const pausedReasons = new Set<ExitReason>(
      pauseIntraday ? ["STOP_LOSS", "SIGNAL_DEGRADED"] : [],
    )

    // Cualquier SELL rule activa
    for (const { exits } of rules.sell) {
      const order = [...exits]
        .sort((a,b) => a.order_index - b.order_index)
        .map(x => x.exit_reason)
        .filter(r => !pausedReasons.has(r))
      const ctx: ExitContext = {
        entry_price:     Number(e.entry_price),
        entry_css:       entryCss,
        entry_rotation:  (e.rotation_status as RotationStatus | null) ?? "NEUTRAL",
        entry_date:      e.entry_date,
        current_price:   currentPrice,
        current_css:     currentCss,
        current_rotation: rotNow,
        current_m6_regime: m6Regime ?? cur?.payload.m6Regime ?? null,
        today,
      }
      const fired = firstFiringExit(ctx, order)
      if (!fired) continue

      const daysHeld   = Math.max(0, Math.floor((Date.parse(today) - Date.parse(e.entry_date)) / 86_400_000))
      const returnPct  = ((currentPrice - Number(e.entry_price)) / Number(e.entry_price)) * 100

      const { error: exErr } = await db.from("trade_exits").insert({
        entry_id:    e.id,
        exit_date:   today,
        exit_price:  currentPrice,
        exit_reason: fired,
        days_held:   daysHeld,
        return_pct:  returnPct,
        cron_run_id: cronRunId,
      })
      if (exErr) { errors.push(`exit ${e.id}: ${exErr.message}`); continue }
      await db.from("trade_entries").update({ status: "CLOSED" }).eq("id", e.id)
      exitsClosed++
      const ticker = tickerById.get(e.symbol_id) ?? "?"
      // Recuperar nombre de regla SELL (la primera y única usada)
      const sellRule = rules.sell[0]?.rule.name ?? "rule_v1_sell"
      exitsDetail.push({
        ticker,
        ruleName: sellRule,
        exitReason: fired,
        exitPrice: currentPrice,
        entryPrice: Number(e.entry_price),
        returnPct,
        daysHeld,
      })
      break  // primer exit que dispara cierra; no se evalúan más reglas
    }
  }

  return {
    entriesOpened, exitsClosed,
    symbolsScanned: snapshots.length,
    rulesEvaluated: rules.buy.length + rules.sell.length,
    errors,
    entriesDetail,
    exitsDetail,
    macroEvent,
    skippedByEarnings,
    skippedByFomc,
  }
}
