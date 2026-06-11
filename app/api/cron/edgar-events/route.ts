import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchSubmissions, pool, EDGAR_CONCURRENCY } from "@/lib/edgar"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "edgar_events"
const LOOKBACK_DAYS = 2  // capturamos filings de hoy y ayer

// Items 8-K relevantes para SORE (vol spike risk). Los demás son ruido.
const RELEVANT_ITEMS: Record<string, string> = {
  "1.01": "Material Definitive Agreement (M&A / contratos)",
  "2.02": "Results of Operations (earnings)",
  "2.05": "Costs Associated with Exit / Restructuring",
  "2.06": "Material Impairments",
  "4.02": "Non-Reliance on Prior Financial Statements (restatement)",
  "5.02": "Departure / Appointment of CEO/CFO/Director",
  "5.07": "Shareholder Vote",
  "7.01": "Reg FD Disclosure (info material no programada)",
  "8.01": "Other Material Events",
}

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

  const today = new Date()
  const lookbackStr = new Date(today.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  let with8K = 0, no8K = 0, fetchErrors = 0, upserts = 0, upsertErrors = 0
  const sample: string[] = []

  await pool(syms, EDGAR_CONCURRENCY, async (s) => {
    const cik = s.cik as unknown as string
    let sub
    try { sub = await fetchSubmissions(cik) } catch { fetchErrors++; return }
    if (!sub || sub.recent.form.length === 0) { no8K++; return }

    // Filings 8-K recientes (lookback window)
    const recents: { accession: string; filingDate: string; reportDate: string; items: string }[] = []
    for (let i = 0; i < sub.recent.form.length; i++) {
      if (sub.recent.form[i] !== "8-K") continue
      if (sub.recent.filingDate[i] < lookbackStr) continue
      recents.push({
        accession: sub.recent.accessionNumber[i],
        filingDate: sub.recent.filingDate[i],
        reportDate: sub.recent.reportDate[i] || sub.recent.filingDate[i],
        items: sub.recent.items[i] ?? "",
      })
    }
    if (recents.length === 0) { no8K++; return }
    with8K++

    // Por cada filing, por cada item relevante: row independiente
    for (const f of recents) {
      const itemList = f.items.split(",").map(x => x.trim()).filter(Boolean)
      for (const item of itemList) {
        const label = RELEVANT_ITEMS[item]
        if (!label) continue  // item no relevante (ej. 9.01 attached docs)
        const { error: upErr } = await db.from("material_events").upsert({
          symbol_id: s.id,
          event_date: f.reportDate,
          filing_date: f.filingDate,
          item_code: item,
          item_label: label,
          accession_num: f.accession,
          cron_run_id: runId,
        } as never, { onConflict: "symbol_id,accession_num,item_code" })
        if (upErr) upsertErrors++
        else {
          upserts++
          if (sample.length < 8) sample.push(`${s.ticker} ${item}@${f.reportDate}`)
        }
      }
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
    with_8k: with8K, no_8k: no8K,
    upserts, upsert_errors: upsertErrors, fetch_errors: fetchErrors,
    duration_ms: durationMs,
    sample,
    next_batch_start: done ? null : batchStart + batchSize,
    done,
  })
}
