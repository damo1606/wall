import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchSharesOutstanding, pool, EDGAR_CONCURRENCY } from "@/lib/edgar"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "edgar_shares"

// Backfill de symbols.shares_outstanding desde XBRL de SEC (companyconcept).
// Fuente autoritativa para reconstruir market cap cuando Yahoo da 0 — scanner-pro
// la usa de fallback en la normalización F1 (insider flow / market cap). Idempotente:
// re-corre y refresca el dato; se pagina con batch_start/batch_size como los demás
// crons EDGAR. Solo procesa símbolos con cik (los no-stock se saltan).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const batchStart = Math.max(0, parseInt(url.searchParams.get("batch_start") ?? "0", 10))
  const batchSize  = Math.max(1, Math.min(200, parseInt(url.searchParams.get("batch_size") ?? "100", 10)))

  const db: TypedClient = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs").insert({ job_name: JOB_NAME, status: "running" }).select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  // Símbolos con CIK (solo stocks que SEC reporta)
  const { data: syms, error: symErr } = await db
    .from("symbols").select("id, ticker, cik")
    .eq("is_active", true).not("cik", "is", null)
    .order("ticker")
    .range(batchStart, batchStart + batchSize - 1)
  if (symErr || !syms) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `symbols query: ${symErr?.message}`,
      duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ error: "symbols query failed", detail: symErr?.message }, { status: 500 })
  }
  if (syms.length === 0) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "success",
      rows_inserted: 0, duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ ok: true, runId, processed: 0, done: true })
  }

  let updated = 0, noData = 0, fetchErrors = 0, updateErrors = 0
  const sample: string[] = []

  await pool(syms, EDGAR_CONCURRENCY, async (s) => {
    const cik = s.cik as unknown as string
    let res
    try { res = await fetchSharesOutstanding(cik) } catch { fetchErrors++; return }
    if (!res) { noData++; return }

    const { error: upErr } = await db.from("symbols").update({
      shares_outstanding: res.shares,
      shares_outstanding_asof: res.asof,
    } as never).eq("id", s.id)
    if (upErr) updateErrors++
    else {
      updated++
      if (sample.length < 8) sample.push(`${s.ticker}=${res.shares}@${res.asof}`)
    }
  })

  const durationMs = Date.now() - startedAt
  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(),
    status: updateErrors === 0 && fetchErrors === 0 ? "success" : "partial",
    rows_inserted: updated,
    rows_failed: updateErrors + fetchErrors,
    duration_ms: durationMs,
  }).eq("id", runId)

  const done = syms.length < batchSize
  return NextResponse.json({
    ok: true, runId,
    batch_start: batchStart, batch_size: batchSize,
    processed: syms.length,
    updated, no_data: noData, update_errors: updateErrors, fetch_errors: fetchErrors,
    duration_ms: durationMs,
    sample,
    next_batch_start: done ? null : batchStart + batchSize,
    done,
  })
}
