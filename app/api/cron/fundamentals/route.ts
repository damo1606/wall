import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchStockData } from "@/lib/yahoo"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "fundamentals_daily"
const RATE_LIMIT_MS = 3000
const CONCURRENCY = 3

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function pool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) break
      out[idx] = await fn(items[idx])
      await sleep(RATE_LIMIT_MS)
    }
  })
  await Promise.all(workers)
  return out
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url        = new URL(req.url)
  const batchStart = Math.max(0, parseInt(url.searchParams.get("batch_start") ?? "0", 10))
  const batchSize  = Math.max(1, Math.min(200, parseInt(url.searchParams.get("batch_size") ?? "60", 10)))

  const db: TypedClient = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs").insert({ job_name: JOB_NAME, status: "running" }).select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  const { data: syms, error: symErr } = await db
    .from("symbols").select("id, ticker").eq("is_active", true).order("ticker")
    .range(batchStart, batchStart + batchSize - 1)
  if (symErr || !syms) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `symbols query: ${symErr?.message}`, duration_ms: Date.now() - startedAt,
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

  const takenAt = new Date().toISOString()
  let fundOk = 0, incomeOk = 0, profileOk = 0, failed = 0
  const failedTickers: string[] = []

  await pool(syms, CONCURRENCY, async (s) => {
    const d = await fetchStockData(s.ticker, false)
    if (!d) { failed++; failedTickers.push(s.ticker); return }

    const fcfYield = d.marketCap > 0 && d.freeCashflow ? d.freeCashflow / d.marketCap : null

    // fundamentals_snapshots
    const { error: fErr } = await db.from("fundamentals_snapshots").insert({
      symbol_id: s.id, taken_at: takenAt, cron_run_id: runId,
      price: d.currentPrice || null, market_cap: d.marketCap || null,
      pe: d.pe || null, pb: d.pb || null, ev_ebitda: d.evToEbitda || null,
      roe: d.roe || null, roic: d.hasROIC ? d.roic : null, fcf_yield: fcfYield,
      debt_to_equity: d.debtToEquity || null, revenue_ttm: d.totalRevenue || null,
      eps_ttm: d.eps || null, dividend_yield: d.dividendYield || null,
      payout_ratio: d.payoutRatio || null, beta: d.beta || null, iv_30d: null,
      source: "yahoo",
    } as never)
    if (!fErr) fundOk++

    // income_metrics
    const { error: iErr } = await db.from("income_metrics").insert({
      symbol_id: s.id, taken_at: takenAt, cron_run_id: runId,
      revenue_ttm: d.totalRevenue || null, eps_ttm: d.eps || null, source: "yahoo",
    } as never)
    if (!iErr) incomeOk++

    // company_profile (upsert — 1 fila por símbolo)
    const { error: pErr } = await db.from("company_profile").upsert({
      symbol_id: s.id,
      description: d.description ?? null, employees: d.employees ?? null,
      hq_country: d.country ?? null, ceo: d.ceo ?? null,
      founded: d.founded ?? null, website: d.website ?? null,
      updated_at: takenAt,
    } as never, { onConflict: "symbol_id" })
    if (!pErr) profileOk++
  })

  const durationMs = Date.now() - startedAt
  const status: "success" | "partial" | "failed" =
    failed === 0 ? "success" : (fundOk > 0 ? "partial" : "failed")

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(), status,
    rows_inserted: fundOk + incomeOk + profileOk, rows_failed: failed,
    duration_ms: durationMs,
    error_summary: failedTickers.length ? `${failed} fallidos: ${failedTickers.slice(0,5).join(", ")}` : null,
  }).eq("id", runId)

  const done = syms.length < batchSize
  return NextResponse.json({
    ok: status !== "failed", runId, status,
    batch_start: batchStart, batch_size: batchSize,
    processed: syms.length, fundamentals_ok: fundOk, income_ok: incomeOk, profile_ok: profileOk,
    failed, duration_ms: durationMs,
    next_batch_start: done ? null : batchStart + batchSize, done,
  })
}
