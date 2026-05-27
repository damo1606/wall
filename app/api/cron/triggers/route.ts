import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase"
import { runEngine } from "@/lib/triggers/engine"
import type { MacroPhase } from "@/lib/triggers/rotation"

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

  return NextResponse.json({
    ok: status !== "failed",
    runId,
    status,
    today,
    macroPhase: regimeRow.macro_phase,
    m6Regime:   regimeRow.m6_regime,
    entriesOpened: result.entriesOpened,
    exitsClosed:   result.exitsClosed,
    symbolsScanned: result.symbolsScanned,
    rulesEvaluated: result.rulesEvaluated,
    durationMs,
    warnings: result.errors,
  })
}
