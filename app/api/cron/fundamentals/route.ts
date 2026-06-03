import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchStockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"

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
  let marketOk = 0, quarterlyOk = 0, incomeOk = 0, profileOk = 0, scoreOk = 0
  let fetchFailed = 0, insertErrors = 0
  const failedTickers: string[] = []
  const insertErrMsgs: string[] = []

  // 23505 = unique_violation. Las tablas hijas tienen un índice one-per-day,
  // así que un re-run del mismo día choca: la fila ya existe, no es un fallo.
  const benign = (e: { code?: string } | null) => e?.code === "23505"
  const noteErr = (ticker: string, where: string, e: { message?: string } | null) => {
    insertErrors++
    if (insertErrMsgs.length < 5) insertErrMsgs.push(`${ticker}/${where}: ${(e?.message ?? "").slice(0, 30)}`)
  }

  await pool(syms, CONCURRENCY, async (s) => {
    const d = await fetchStockData(s.ticker, false)
    if (!d) { fetchFailed++; failedTickers.push(s.ticker); return }

    const fcfYield = d.marketCap > 0 && d.freeCashflow ? d.freeCashflow / d.marketCap : null

    // market_snapshots — precio + cap + beta + IV (cambian a diario)
    const { error: mErr } = await db.from("market_snapshots").insert({
      symbol_id: s.id, taken_at: takenAt, cron_run_id: runId,
      price: d.currentPrice || null, market_cap: d.marketCap || null,
      beta: d.beta || null, iv_30d: null, source: "yahoo",
    } as never)
    if (!mErr) marketOk++
    else if (!benign(mErr)) noteErr(s.ticker, "market", mErr)

    // fundamentals_quarterly — múltiplos y ratios derivados
    const { error: qErr } = await db.from("fundamentals_quarterly").insert({
      symbol_id: s.id, taken_at: takenAt, cron_run_id: runId,
      pe: d.pe || null, pb: d.pb || null, ev_ebitda: d.evToEbitda || null,
      roe: d.roe || null, roic: d.hasROIC ? d.roic : null, fcf_yield: fcfYield,
      debt_to_equity: d.debtToEquity || null, dividend_yield: d.dividendYield || null,
      payout_ratio: d.payoutRatio || null, source: "yahoo",
    } as never)
    if (!qErr) quarterlyOk++
    else if (!benign(qErr)) noteErr(s.ticker, "quarterly", qErr)

    // income_metrics — TTM revenue + EPS
    const { error: iErr } = await db.from("income_metrics").insert({
      symbol_id: s.id, taken_at: takenAt, cron_run_id: runId,
      revenue_ttm: d.totalRevenue || null, eps_ttm: d.eps || null, source: "yahoo",
    } as never)
    if (!iErr) incomeOk++
    else if (!benign(iErr)) noteErr(s.ticker, "income", iErr)

    // company_profile (upsert — 1 fila por símbolo)
    const { error: pErr } = await db.from("company_profile").upsert({
      symbol_id: s.id,
      description: d.description ?? null, employees: d.employees ?? null,
      hq_country: d.country ?? null, ceo: d.ceo ?? null,
      founded: d.founded ?? null, website: d.website ?? null,
      updated_at: takenAt,
    } as never, { onConflict: "symbol_id" })
    if (!pErr) profileOk++
    else noteErr(s.ticker, "profile", pErr)

    // valuation_scores (methodology=buyScore) — cachea el score computado +
    // los campos de StockData que el scanner-pro necesita. Esto evita que
    // scanner-pro tenga que hammear Yahoo en vivo: lee de aquí en su lugar.
    const score = scoreStock(d)
    const { error: sErr } = await db.from("valuation_scores").insert({
      methodology: "buyScore",
      symbol_id: s.id,
      score: score.buyScore,
      components: { stock: d, score } as never,
      cron_run_id: runId,
    } as never)
    if (!sErr) scoreOk++
    else noteErr(s.ticker, "score", sErr)
  })

  const durationMs = Date.now() - startedAt
  const rowsInserted = marketOk + quarterlyOk + incomeOk + profileOk + scoreOk
  const hadProblems = fetchFailed > 0 || insertErrors > 0
  const status: "success" | "partial" | "failed" =
    !hadProblems ? "success" : (rowsInserted > 0 ? "partial" : "failed")

  const summaryParts: string[] = []
  if (fetchFailed)  summaryParts.push(`${fetchFailed} fetch fail: ${failedTickers.slice(0, 5).join(", ")}`)
  if (insertErrors) summaryParts.push(`${insertErrors} insert err: ${insertErrMsgs.join("; ")}`)

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(), status,
    rows_inserted: rowsInserted, rows_failed: fetchFailed + insertErrors,
    duration_ms: durationMs,
    error_summary: summaryParts.length ? summaryParts.join(" | ") : null,
  }).eq("id", runId)

  const done = syms.length < batchSize
  return NextResponse.json({
    ok: status !== "failed", runId, status,
    batch_start: batchStart, batch_size: batchSize,
    processed: syms.length,
    market_ok: marketOk, quarterly_ok: quarterlyOk, income_ok: incomeOk, profile_ok: profileOk, score_ok: scoreOk,
    fetch_failed: fetchFailed, insert_errors: insertErrors, duration_ms: durationMs,
    next_batch_start: done ? null : batchStart + batchSize, done,
  })
}
