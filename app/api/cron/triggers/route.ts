import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase"
import { runEngine, type EngineResult } from "@/lib/triggers/engine"
import type { MacroPhase } from "@/lib/triggers/rotation"

// Mensaje compacto para Discord. Diseño:
//   - Header con fecha + contexto macro
//   - Si hay aperturas: 🟢 lista (max 8)
//   - Si hay cierres:   🔴 lista (max 8) con razón y P&L
//   - Si nada se movió: bloque "Sin actividad" para que sepas que sí corrió
function buildDiscordMessage(
  today: string,
  macroPhase: string,
  m6Regime: string | null,
  result: EngineResult,
): string {
  const fomc = result.macroEvent.hasFomc ? " · 🏦 FOMC" : ""
  const header = `**Motor de gatillos ${today}** · macro=${macroPhase} · m6=${m6Regime ?? "?"}${fomc}`

  if (result.entriesOpened === 0 && result.exitsClosed === 0) {
    const skipped = result.skippedByFomc + result.skippedByEarnings
    const skipNote = skipped > 0
      ? ` (skip ${result.skippedByFomc} FOMC + ${result.skippedByEarnings} earnings)`
      : ""
    return `${header}\n_Sin actividad — ${result.symbolsScanned} símbolo(s) evaluados${skipNote}, ninguno califica._`
  }

  const lines: string[] = [header]
  if (result.entriesOpened > 0) {
    lines.push(`\n🟢 **Aperturas (${result.entriesOpened})**`)
    for (const e of result.entriesDetail.slice(0, 8)) {
      const earnTag = e.earningsWithin5d ? " 📅" : ""
      lines.push(`  • **${e.ticker}** · ${e.ruleName} · $${e.entryPrice.toFixed(2)} · ${e.rotationStatus} · ${e.conditionsMet}/${e.conditionsTotal} cond${earnTag}`)
    }
    if (result.entriesDetail.length > 8) lines.push(`  _… +${result.entriesDetail.length - 8} más_`)
  }
  if (result.exitsClosed > 0) {
    lines.push(`\n🔴 **Cierres (${result.exitsClosed})**`)
    for (const x of result.exitsDetail.slice(0, 8)) {
      const sign = x.returnPct >= 0 ? "+" : ""
      lines.push(`  • **${x.ticker}** · ${x.exitReason} · $${x.entryPrice.toFixed(2)}→$${x.exitPrice.toFixed(2)} (${sign}${x.returnPct.toFixed(1)}%, ${x.daysHeld}d)`)
    }
    if (result.exitsDetail.length > 8) lines.push(`  _… +${result.exitsDetail.length - 8} más_`)
  }
  return lines.join("\n")
}

async function postDiscord(webhook: string, content: string): Promise<void> {
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Discord trunca a 2000 chars
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    })
  } catch { /* no romper el cron por un webhook caído */ }
}

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "trigger_engine"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = supabaseServer()
  const startedAt = Date.now()
  const today = new Date(startedAt).toISOString().slice(0, 10)

  const { data: runRow, error: runErr } = await db
    .from("cron_runs")
    .insert({ job_name: JOB_NAME, status: "running" })
    .select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  // ── Cargar contexto macro/regime de HOY desde regime_history
  const { data: regimeRow, error: regErr } = await db
    .from("regime_history")
    .select("macro_phase, m6_regime")
    .eq("date", today)
    .maybeSingle()
  if (regErr) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `regime read: ${regErr.message}`,
      duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ error: "regime read failed", detail: regErr.message }, { status: 500 })
  }
  if (!regimeRow) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `sin regime_history para ${today}`,
      duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({
      error: "Falta regime_history del día — correr /api/cron/snapshot antes",
      today,
    }, { status: 409 })
  }

  let result
  try {
    result = await runEngine({
      db,
      cronRunId: runId,
      today,
      macroPhase: regimeRow.macro_phase as MacroPhase,
      m6Regime:   regimeRow.m6_regime,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: msg, duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ error: "engine threw", detail: msg }, { status: 500 })
  }

  const durationMs = Date.now() - startedAt
  const status: "success" | "partial" | "failed" =
    result.errors.length === 0 ? "success"
      : (result.entriesOpened + result.exitsClosed > 0 ? "partial" : "failed")

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(),
    status,
    rows_inserted: result.entriesOpened + result.exitsClosed,
    rows_failed: 0,
    duration_ms: durationMs,
    error_summary: result.errors.length ? result.errors.slice(0, 5).join(" | ") : null,
  }).eq("id", runId)

  // Discord webhook — solo si hay movimiento o si es la primera corrida del día.
  // No se notifica "sin actividad" todos los días para no ahogar el canal.
  const webhook = process.env.DISCORD_WEBHOOK_URL
  if (webhook && (result.entriesOpened > 0 || result.exitsClosed > 0)) {
    const content = buildDiscordMessage(
      today,
      regimeRow.macro_phase as string,
      regimeRow.m6_regime,
      result,
    )
    await postDiscord(webhook, content)
  }

  return NextResponse.json({
    ok: status !== "failed",
    runId,
    status,
    today,
    macroPhase: regimeRow.macro_phase,
    m6Regime:   regimeRow.m6_regime,
    macroEvent: result.macroEvent,
    entriesOpened: result.entriesOpened,
    exitsClosed:   result.exitsClosed,
    symbolsScanned: result.symbolsScanned,
    skippedByFomc:      result.skippedByFomc,
    skippedByEarnings:  result.skippedByEarnings,
    skippedByLiquidity: result.skippedByLiquidity,
    rulesEvaluated: result.rulesEvaluated,
    durationMs,
    warnings: result.errors,
  })
}
