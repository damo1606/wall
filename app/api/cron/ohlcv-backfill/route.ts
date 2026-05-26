import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { getCrumb } from "@/lib/yahoo"

export const dynamic = "force-dynamic"
export const maxDuration = 300  // Vercel function timeout (5 min)

const JOB_NAME = "ohlcv_backfill"

// Throttle: 60 calls/min total. Con concurrencia 3 → cada worker espera 3s
// entre llamadas. Cero riesgo de 429 según observación de la comunidad.
const RATE_LIMIT_MS = 3000
const CONCURRENCY = 3
const RETRY_DELAYS_MS = [2000, 4000, 8000]

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

type OHLCVRow = {
  date: string         // YYYY-MM-DD
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  adj_close: number | null
  volume: number | null
}

// Yahoo v8/finance/chart con includeAdjustedClose=true devuelve OHLCV+adjclose.
async function fetchOHLCV(symbol: string, cookie: string, crumb: string, range: string): Promise<OHLCVRow[] | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?interval=1d&range=${encodeURIComponent(range)}&includeAdjustedClose=true&crumb=${encodeURIComponent(crumb)}`

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Cookie: cookie, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status === 429) {
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt])
          continue
        }
        return null
      }
      if (!res.ok) return null
      const json = await res.json()
      const result = json?.chart?.result?.[0]
      if (!result) return null
      const ts: number[]              = result?.timestamp ?? []
      const q = result?.indicators?.quote?.[0] ?? {}
      const adj: (number | null)[]    = result?.indicators?.adjclose?.[0]?.adjclose ?? []
      const out: OHLCVRow[] = []
      for (let i = 0; i < ts.length; i++) {
        const close = q.close?.[i] ?? null
        if (close == null) continue  // descarta días inválidos
        out.push({
          date:      new Date(ts[i] * 1000).toISOString().slice(0, 10),
          open:      q.open?.[i]   ?? null,
          high:      q.high?.[i]   ?? null,
          low:       q.low?.[i]    ?? null,
          close,
          adj_close: adj[i]        ?? close,
          volume:    q.volume?.[i] ?? null,
        })
      }
      return out
    } catch {
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      return null
    }
  }
  return null
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) break
      out[idx] = await fn(items[idx], idx)
      await sleep(RATE_LIMIT_MS)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Cron `ohlcv_backfill`: descarga OHLCV diario para los símbolos activos.
 * Parámetros (querystring):
 *   batch_start  índice del primer ticker (default 0)
 *   batch_size   máximo de tickers en esta invocación (default 200)
 *   range        rango Yahoo ("5d" incremental, "10y" backfill inicial) (default "5d")
 *
 * Vercel limita las funciones a 300s. A throttle 60/min, 200 tickers ≈ 200s,
 * cabe holgado. Para 2.500 tickers el workflow loopea 13 invocaciones.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url        = new URL(req.url)
  const batchStart = Math.max(0, parseInt(url.searchParams.get("batch_start") ?? "0", 10))
  const batchSize  = Math.max(1, Math.min(500, parseInt(url.searchParams.get("batch_size") ?? "200", 10)))
  const range      = url.searchParams.get("range") ?? "5d"

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

  // Carga los tickers activos paginados
  const { data: allSymbols, error: symErr } = await db
    .from("symbols")
    .select("id, ticker")
    .eq("is_active", true)
    .order("ticker")
    .range(batchStart, batchStart + batchSize - 1)
  if (symErr || !allSymbols) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(),
      status: "failed",
      error_summary: `symbols query: ${symErr?.message}`,
    }).eq("id", runId)
    return NextResponse.json({ error: "symbols query failed", detail: symErr?.message }, { status: 500 })
  }
  if (allSymbols.length === 0) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(),
      status: "success",
      rows_inserted: 0,
      duration_ms: Date.now() - startedAt,
      error_summary: `batch vacío (start=${batchStart})`,
    }).eq("id", runId)
    return NextResponse.json({ ok: true, runId, batch_start: batchStart, processed: 0, done: true })
  }

  // Auth Yahoo una sola vez para todo el batch
  const auth = await getCrumb()
  if (!auth) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(),
      status: "failed",
      error_summary: "no se pudo obtener crumb de Yahoo",
    }).eq("id", runId)
    return NextResponse.json({ error: "Yahoo crumb failed" }, { status: 500 })
  }

  let rowsInserted = 0
  let tickersOk    = 0
  let tickersFail  = 0
  const failed: string[] = []

  await pool(allSymbols, CONCURRENCY, async (s) => {
    const rows = await fetchOHLCV(s.ticker, auth.cookie, auth.crumb, range)
    if (rows == null) {
      tickersFail++
      failed.push(s.ticker)
      // Log fallo a data_quality_log (no rompe el batch)
      await db.from("data_quality_log").insert({
        cron_run_id: runId,
        check_name: "ohlcv_fetch_failed",
        severity: "warning",
        actual: { ticker: s.ticker } as never,
      })
      return
    }
    if (rows.length === 0) {
      tickersOk++  // ticker válido sin data nueva (mercado cerrado)
      return
    }
    const upsertRows = rows.map(r => ({
      symbol_id: s.id,
      date:      r.date,
      open:      r.open,
      high:      r.high,
      low:       r.low,
      close:     r.close,
      adj_close: r.adj_close,
      volume:    r.volume,
      source:    "yahoo",
    }))
    const { error: upErr, count } = await db
      .from("price_history")
      .upsert(upsertRows as never, { onConflict: "symbol_id,date", count: "exact" })
    if (upErr) {
      tickersFail++
      failed.push(`${s.ticker}(upsert: ${upErr.message})`)
    } else {
      tickersOk++
      rowsInserted += (count ?? upsertRows.length)
    }
  })

  const durationMs = Date.now() - startedAt
  const status: "success" | "partial" | "failed" =
    tickersFail === 0 ? "success" : (tickersOk > 0 ? "partial" : "failed")

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(),
    status,
    rows_inserted: rowsInserted,
    rows_failed: tickersFail,
    duration_ms: durationMs,
    error_summary: failed.length ? `${tickersFail} tickers fallidos: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}` : null,
  }).eq("id", runId)

  // Hint para el workflow: si recibimos exactamente batchSize, probablemente
  // queda más; si menos, ya terminamos el universo.
  const done = allSymbols.length < batchSize

  return NextResponse.json({
    ok: status !== "failed",
    runId,
    status,
    batch_start: batchStart,
    batch_size: batchSize,
    range,
    tickers_processed: allSymbols.length,
    tickers_ok:        tickersOk,
    tickers_failed:    tickersFail,
    rows_inserted:     rowsInserted,
    duration_ms:       durationMs,
    next_batch_start:  done ? null : batchStart + batchSize,
    done,
  })
}
