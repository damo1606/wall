import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "price_summary_rollup"

type PriceRow = {
  symbol_id: string
  date: string
  close: number | null
  adj_close: number | null
  volume: number | null
}

type SummaryRow = {
  symbol_id: string
  as_of_date: string
  close: number | null
  return_1d: number | null
  return_5d: number | null
  return_20d: number | null
  return_60d: number | null
  return_ytd: number | null
  vol_20d_annualized: number | null
  avg_volume_20d: number | null
  dollar_volume_20d: number | null
  week_52_high: number | null
  week_52_low: number | null
  drop_from_52w_high_pct: number | null
}

function pctChange(now: number | null, then: number | null): number | null {
  if (now == null || then == null || then === 0) return null
  return ((now - then) / then) * 100
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sqDiffs = values.map(v => (v - mean) ** 2)
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / (values.length - 1))
}

function rollupForSymbol(symbolId: string, rows: PriceRow[]): SummaryRow | null {
  if (rows.length === 0) return null
  // rows entran ordenadas ASC por date
  const last = rows[rows.length - 1]
  const close = last.adj_close ?? last.close
  if (close == null) return null

  const valueAt = (offset: number): number | null => {
    const idx = rows.length - 1 - offset
    if (idx < 0) return null
    const r = rows[idx]
    return r.adj_close ?? r.close
  }

  // YTD: primer cierre del año del último registro
  const lastYear = last.date.slice(0, 4)
  const firstOfYear = rows.find(r => r.date.slice(0, 4) === lastYear)
  const ytdBase = firstOfYear?.adj_close ?? firstOfYear?.close ?? null

  // Retornos diarios sobre los últimos 21 cierres (20 returns)
  const last21 = rows.slice(-21)
  const dailyReturns: number[] = []
  for (let i = 1; i < last21.length; i++) {
    const a = last21[i].adj_close ?? last21[i].close
    const b = last21[i - 1].adj_close ?? last21[i - 1].close
    const r = pctChange(a, b)
    if (r != null) dailyReturns.push(r / 100)  // a fracción para σ
  }
  const sd = stddev(dailyReturns)
  const volAnnualized = sd != null ? sd * Math.sqrt(252) * 100 : null  // a %

  const volumes20 = rows.slice(-20).map(r => r.volume ?? 0)
  const avgVol20 = volumes20.length
    ? Math.round(volumes20.reduce((a, b) => a + b, 0) / volumes20.length)
    : null
  const dollarVol20 = avgVol20 != null ? avgVol20 * close : null

  const last252 = rows.slice(-252)
  const closes252 = last252
    .map(r => r.adj_close ?? r.close)
    .filter((x): x is number => x != null)
  const week52High = closes252.length ? Math.max(...closes252) : null
  const week52Low  = closes252.length ? Math.min(...closes252) : null
  const dropFromHigh = week52High != null && week52High > 0
    ? ((close - week52High) / week52High) * 100
    : null

  return {
    symbol_id: symbolId,
    as_of_date: last.date,
    close,
    return_1d:   pctChange(close, valueAt(1)),
    return_5d:   pctChange(close, valueAt(5)),
    return_20d:  pctChange(close, valueAt(20)),
    return_60d:  pctChange(close, valueAt(60)),
    return_ytd:  pctChange(close, ytdBase),
    vol_20d_annualized: volAnnualized,
    avg_volume_20d:     avgVol20,
    dollar_volume_20d:  dollarVol20,
    week_52_high:       week52High,
    week_52_low:        week52Low,
    drop_from_52w_high_pct: dropFromHigh,
  }
}

async function processBatch(db: TypedClient, symbolIds: string[]): Promise<{ ok: number; failed: number; err?: string }> {
  if (symbolIds.length === 0) return { ok: 0, failed: 0 }

  // Yahoo trading year ≈ 252 días — pedimos 380 calendar days para tener margen.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 380)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data: prices, error } = await db
    .from("price_history")
    .select("symbol_id, date, close, adj_close, volume")
    .in("symbol_id", symbolIds)
    .gte("date", cutoffStr)
    .order("symbol_id", { ascending: true })
    .order("date", { ascending: true })

  if (error) return { ok: 0, failed: symbolIds.length, err: error.message }

  const grouped = new Map<string, PriceRow[]>()
  for (const row of (prices ?? []) as PriceRow[]) {
    const arr = grouped.get(row.symbol_id) ?? []
    arr.push(row)
    grouped.set(row.symbol_id, arr)
  }

  const summaries: SummaryRow[] = []
  for (const sid of symbolIds) {
    const rows = grouped.get(sid) ?? []
    const sum = rollupForSymbol(sid, rows)
    if (sum) summaries.push(sum)
  }

  if (summaries.length === 0) return { ok: 0, failed: symbolIds.length }

  const { error: upErr } = await db
    .from("price_summary_daily")
    .upsert(summaries as never, { onConflict: "symbol_id" })

  if (upErr) return { ok: 0, failed: symbolIds.length, err: upErr.message }
  return { ok: summaries.length, failed: symbolIds.length - summaries.length }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url        = new URL(req.url)
  const batchStart = Math.max(0, parseInt(url.searchParams.get("batch_start") ?? "0", 10))
  const batchSize  = Math.max(1, Math.min(2000, parseInt(url.searchParams.get("batch_size") ?? "500", 10)))
  const chunkSize  = Math.max(1, Math.min(200, parseInt(url.searchParams.get("chunk_size") ?? "50", 10)))

  const db = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs")
    .insert({ job_name: JOB_NAME, status: "running" })
    .select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  const { data: syms, error: symErr } = await db
    .from("symbols")
    .select("id")
    .eq("is_active", true)
    .order("id")
    .range(batchStart, batchStart + batchSize - 1)
  if (symErr || !syms) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(),
      status: "failed",
      error_summary: `symbols query: ${symErr?.message}`,
    }).eq("id", runId)
    return NextResponse.json({ error: "symbols query failed", detail: symErr?.message }, { status: 500 })
  }

  let okTotal = 0
  let failedTotal = 0
  const errors: string[] = []

  for (let i = 0; i < syms.length; i += chunkSize) {
    const chunk = syms.slice(i, i + chunkSize).map(s => s.id)
    const r = await processBatch(db, chunk)
    okTotal += r.ok
    failedTotal += r.failed
    if (r.err) errors.push(r.err)
  }

  const durationMs = Date.now() - startedAt
  const status: "success" | "partial" | "failed" =
    errors.length === 0 ? "success" : (okTotal > 0 ? "partial" : "failed")

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(),
    status,
    rows_inserted: okTotal,
    rows_failed: failedTotal,
    duration_ms: durationMs,
    error_summary: errors.length ? errors.slice(0, 3).join(" | ") : null,
  }).eq("id", runId)

  const done = syms.length < batchSize

  return NextResponse.json({
    ok: status !== "failed",
    runId,
    status,
    batch_start: batchStart,
    batch_size: batchSize,
    symbols_processed: syms.length,
    summaries_ok: okTotal,
    summaries_failed: failedTotal,
    duration_ms: durationMs,
    next_batch_start: done ? null : batchStart + batchSize,
    done,
  })
}
