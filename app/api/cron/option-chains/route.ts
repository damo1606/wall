import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchOptionChain } from "@/lib/yahoo-options"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "option_chains_daily"
const RATE_LIMIT_MS = 3000
const CONCURRENCY = 3
const MIN_DOLLAR_VOLUME = 5_000_000   // misma regla de elegibilidad

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function pool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) break
      out[idx] = await fn(items[idx])
      await sleep(RATE_LIMIT_MS)
    }
  }))
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
  const batchSize  = Math.max(1, Math.min(100, parseInt(url.searchParams.get("batch_size") ?? "40", 10)))

  const db: TypedClient = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs").insert({ job_name: JOB_NAME, status: "running" }).select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  // Solo símbolos elegibles: liquidez >= $5M (regla de negocio)
  const { data: liquid, error: liqErr } = await db
    .from("price_summary_daily")
    .select("symbol_id")
    .gte("dollar_volume_20d", MIN_DOLLAR_VOLUME)
    .order("symbol_id")
    .range(batchStart, batchStart + batchSize - 1)
  if (liqErr || !liquid) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `liquid query: ${liqErr?.message}`, duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ error: "liquid query failed", detail: liqErr?.message }, { status: 500 })
  }
  if (liquid.length === 0) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "success",
      rows_inserted: 0, duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ ok: true, runId, processed: 0, done: true })
  }

  // Resolver tickers
  const symbolIds = liquid.map(l => l.symbol_id)
  const { data: symRows } = await db.from("symbols").select("id, ticker").in("id", symbolIds)
  const tickerById = new Map((symRows ?? []).map(s => [s.id, s.ticker]))

  const takenAt = new Date().toISOString()
  let rowsInserted = 0, tickersOk = 0, tickersFail = 0
  const failed: string[] = []

  await pool(liquid, CONCURRENCY, async (l) => {
    const ticker = tickerById.get(l.symbol_id)
    if (!ticker) { tickersFail++; return }
    const chain = await fetchOptionChain(ticker, { maxExpirations: 2, strikePct: 0.20 })
    if (!chain || chain.contracts.length === 0) { tickersFail++; failed.push(ticker); return }

    const optionRows = chain.contracts.map(c => ({
      symbol_id: l.symbol_id, expiration: c.expiration, strike: c.strike,
      option_type: c.optionType, bid: c.bid, ask: c.ask, last: c.last,
      iv: c.iv, open_interest: c.openInterest, volume: c.volume,
      taken_at: takenAt, cron_run_id: runId,
    }))
    const { error: upErr, count } = await db
      .from("option_chains").insert(optionRows as never, { count: "exact" })
    if (upErr) { tickersFail++; failed.push(`${ticker}(${upErr.message.slice(0,30)})`); return }
    tickersOk++; rowsInserted += (count ?? optionRows.length)
  })

  const durationMs = Date.now() - startedAt
  const status: "success" | "partial" | "failed" =
    tickersFail === 0 ? "success" : (tickersOk > 0 ? "partial" : "failed")

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(), status,
    rows_inserted: rowsInserted, rows_failed: tickersFail, duration_ms: durationMs,
    error_summary: failed.length ? `${tickersFail} fallidos: ${failed.slice(0,5).join(", ")}` : null,
  }).eq("id", runId)

  const done = liquid.length < batchSize
  return NextResponse.json({
    ok: status !== "failed", runId, status,
    batch_start: batchStart, batch_size: batchSize,
    tickers_processed: liquid.length, tickers_ok: tickersOk, tickers_failed: tickersFail,
    rows_inserted: rowsInserted, duration_ms: durationMs,
    next_batch_start: done ? null : batchStart + batchSize, done,
  })
}
