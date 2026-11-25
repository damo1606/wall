import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchOptionChain } from "@/lib/yahoo-options"
import { intParam } from "@/lib/query-params"
import {
  isMarketWindow, nyClock, quoteRatio, resolveTakenAt, MIN_DTE, MIN_QUOTE_RATIO,
} from "@/lib/option-chains-window"

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

/**
 * Toma diaria de cadenas de opciones (Yahoo) para los símbolos líquidos.
 *
 * Reglas (ver lib/option-chains-window.ts):
 *  - Solo corre en horario de mercado (lun-vie 09:45-16:00 ET). Fuera de esa
 *    ventana responde 200 con skipped y no escribe nada: Yahoo devuelve
 *    bid/ask/OI en 0 de madrugada. `force=1` salta la ventana (pruebas), pero
 *    no el control de calidad.
 *  - Idempotente por (símbolo, día NY) vía la PK de option_chain_snapshots:
 *    varias corridas el mismo día no duplican; un símbolo que falló en la
 *    primera se reintenta en la siguiente.
 *  - Un único taken_at por corrida (param `taken_at` que pasa el workflow a
 *    todos los lotes).
 *  - Descarta vencimientos 0DTE/1DTE y tomas con quote_ratio < 0.5.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url        = new URL(req.url)
  const batchStart = intParam(url.searchParams.get("batch_start"), { def: 0, min: 0 })
  const batchSize  = intParam(url.searchParams.get("batch_size"), { def: 40, min: 1, max: 100 })
  const force      = url.searchParams.get("force") === "1"

  const now = new Date()
  const ny  = nyClock(now)
  if (!force && !isMarketWindow(now)) {
    return NextResponse.json({
      ok: true, skipped: "outside_market_hours", done: true,
      ny_date: ny.date, ny_time: `${String(Math.floor(ny.minutes / 60)).padStart(2, "0")}:${String(ny.minutes % 60).padStart(2, "0")}`,
    })
  }
  const takenAt   = resolveTakenAt(url.searchParams.get("taken_at"), now)
  const tradeDate = ny.date

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

  // Resolver tickers y saltar los que ya tienen toma válida hoy
  const symbolIds = liquid.map(l => l.symbol_id)
  const [{ data: symRows }, { data: doneRows, error: doneErr }] = await Promise.all([
    db.from("symbols").select("id, ticker").in("id", symbolIds),
    db.from("option_chain_snapshots").select("symbol_id").eq("trade_date", tradeDate).in("symbol_id", symbolIds),
  ])
  if (doneErr) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `snapshots query: ${doneErr.message}`, duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ error: "snapshots query failed", detail: doneErr.message }, { status: 500 })
  }
  const tickerById  = new Map((symRows ?? []).map(s => [s.id, s.ticker]))
  const alreadyDone = new Set((doneRows ?? []).map(r => r.symbol_id))
  const pending     = liquid.filter(l => !alreadyDone.has(l.symbol_id))

  let rowsInserted = 0, tickersOk = 0, tickersFail = 0, tickersDup = 0
  const failed: string[] = [], rejected: string[] = []

  await pool(pending, CONCURRENCY, async (l) => {
    const ticker = tickerById.get(l.symbol_id)
    if (!ticker) { tickersFail++; failed.push(`sin-ticker:${l.symbol_id.slice(0, 8)}`); return }
    const chain = await fetchOptionChain(ticker, {
      maxExpirations: 2, strikePct: 0.20, minDte: MIN_DTE, today: tradeDate,
    })
    if (!chain || chain.contracts.length === 0) { tickersFail++; failed.push(ticker); return }

    // Control de calidad: quotes vacías = Yahoo fuera de horario o feriado.
    const ratio = quoteRatio(chain.contracts)
    if (ratio < MIN_QUOTE_RATIO) {
      tickersFail++; rejected.push(`${ticker}(${(ratio * 100).toFixed(0)}%)`); return
    }

    // Reserva (símbolo, día). Si otra corrida ya la tomó, no hace nada.
    const { data: snap, error: snapErr } = await db
      .from("option_chain_snapshots")
      .upsert({
        symbol_id: l.symbol_id, trade_date: tradeDate, taken_at: takenAt,
        spot: chain.spot, contracts: chain.contracts.length,
        quote_ratio: Number(ratio.toFixed(4)), cron_run_id: runId,
      }, { onConflict: "symbol_id,trade_date", ignoreDuplicates: true })
      .select("symbol_id")
    if (snapErr) { tickersFail++; failed.push(`${ticker}(${snapErr.message.slice(0, 30)})`); return }
    if (!snap || snap.length === 0) { tickersDup++; return }

    const optionRows = chain.contracts.map(c => ({
      symbol_id: l.symbol_id, expiration: c.expiration, strike: c.strike,
      option_type: c.optionType, bid: c.bid, ask: c.ask, last: c.last,
      iv: c.iv, open_interest: c.openInterest, volume: c.volume,
      taken_at: takenAt, cron_run_id: runId,
    }))
    const { error: upErr, count } = await db
      .from("option_chains").insert(optionRows as never, { count: "exact" })
    if (upErr) {
      // Libera la reserva para que la siguiente corrida reintente el símbolo.
      await db.from("option_chain_snapshots").delete()
        .eq("symbol_id", l.symbol_id).eq("trade_date", tradeDate)
      tickersFail++; failed.push(`${ticker}(${upErr.message.slice(0, 30)})`); return
    }
    tickersOk++; rowsInserted += (count ?? optionRows.length)
  })

  const durationMs = Date.now() - startedAt
  const status: "success" | "partial" | "failed" =
    tickersFail === 0 ? "success" : (tickersOk > 0 || tickersDup > 0 || alreadyDone.size > 0 ? "partial" : "failed")

  const issues = [
    failed.length   ? `fallidos: ${failed.slice(0, 5).join(", ")}` : "",
    rejected.length ? `sin quotes: ${rejected.slice(0, 5).join(", ")}` : "",
  ].filter(Boolean).join(" · ")

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(), status,
    rows_inserted: rowsInserted, rows_failed: tickersFail, duration_ms: durationMs,
    error_summary: issues ? `${tickersFail} con problema — ${issues}` : null,
  }).eq("id", runId)

  const done = liquid.length < batchSize
  return NextResponse.json({
    ok: status !== "failed", runId, status,
    trade_date: tradeDate, taken_at: takenAt,
    batch_start: batchStart, batch_size: batchSize,
    tickers_processed: liquid.length, tickers_already_done: alreadyDone.size + tickersDup,
    tickers_ok: tickersOk, tickers_failed: failed.length, tickers_rejected_quality: rejected.length,
    rows_inserted: rowsInserted, duration_ms: durationMs,
    next_batch_start: done ? null : batchStart + batchSize, done,
  })
}
