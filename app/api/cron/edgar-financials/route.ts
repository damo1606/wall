import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchCompanyFacts, pool, EDGAR_CONCURRENCY } from "@/lib/edgar"
import { extractLatestFacts } from "@/lib/financials"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "edgar_financials"

// Backfill de estados financieros (balance + income) desde XBRL companyfacts.
// Persiste el último año fiscal (FY) por símbolo en edgar_financials, base para
// Altman Z / VLN / deuda neta. Idempotente y paginado (batch_start/batch_size)
// como los demás crons EDGAR. Solo símbolos con cik.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const batchStart = Math.max(0, parseInt(url.searchParams.get("batch_start") ?? "0", 10))
  const batchSize  = Math.max(1, Math.min(200, parseInt(url.searchParams.get("batch_size") ?? "50", 10)))

  const db: TypedClient = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs").insert({ job_name: JOB_NAME, status: "running" }).select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

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

  let upserts = 0, noData = 0, fetchErrors = 0, upsertErrors = 0
  const sample: string[] = []

  await pool(syms, EDGAR_CONCURRENCY, async (s) => {
    const cik = s.cik as unknown as string
    let facts
    try { facts = await fetchCompanyFacts(cik) } catch { fetchErrors++; return }
    if (!facts) { noData++; return }

    const f = extractLatestFacts(facts)
    // Sin fin de periodo no hay snapshot usable (empresa sin FY reportado en XBRL).
    if (!f.periodEnd) { noData++; return }

    const { error: upErr } = await db.from("edgar_financials").upsert({
      symbol_id: s.id,
      period_end: f.periodEnd,
      fiscal_period: f.fiscalPeriod ?? "FY",
      form: f.form,
      total_assets: f.totalAssets,
      current_assets: f.currentAssets,
      total_liabilities: f.totalLiabilities,
      current_liabilities: f.currentLiabilities,
      retained_earnings: f.retainedEarnings,
      stockholders_equity: f.stockholdersEquity,
      cash: f.cash,
      revenue: f.revenue,
      cogs: f.cogs,
      gross_profit: f.grossProfit,
      operating_income: f.operatingIncome,
      net_income: f.netIncome,
      dep_amort: f.depAmort,
      long_term_debt: f.longTermDebt,
      short_term_debt: f.shortTermDebt,
      cron_run_id: runId,
    } as never, { onConflict: "symbol_id,period_end,fiscal_period" })
    if (upErr) upsertErrors++
    else {
      upserts++
      if (sample.length < 8) sample.push(`${s.ticker} FY@${f.periodEnd} assets=${f.totalAssets ?? "?"}`)
    }
  })

  const durationMs = Date.now() - startedAt
  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(),
    status: upsertErrors === 0 && fetchErrors === 0 ? "success" : "partial",
    rows_inserted: upserts,
    rows_failed: upsertErrors + fetchErrors,
    duration_ms: durationMs,
  }).eq("id", runId)

  const done = syms.length < batchSize
  return NextResponse.json({
    ok: true, runId,
    batch_start: batchStart, batch_size: batchSize,
    processed: syms.length,
    upserts, no_data: noData, upsert_errors: upsertErrors, fetch_errors: fetchErrors,
    duration_ms: durationMs,
    sample,
    next_batch_start: done ? null : batchStart + batchSize,
    done,
  })
}
