import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchTickerCikMap, padCik } from "@/lib/edgar"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const JOB_NAME = "edgar_cik_backfill"

// Hidrata symbols.cik desde el mapeo oficial de SEC.
// Cron one-shot — corre cuando hay símbolos nuevos sin cik. La columna ya
// hidratada no se sobreescribe (matching idempotente con .is("cik", null)).
//
// Símbolos no listados en SEC (ETFs, índices, internacionales) quedan con
// cik NULL — los crons EDGAR los saltan, no es un error.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db: TypedClient = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs").insert({ job_name: JOB_NAME, status: "running" }).select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  // Símbolos activos sin CIK (procesamos solo los que necesitan hidratación).
  const { data: syms, error: symErr } = await db
    .from("symbols")
    .select("id, ticker, asset_type")
    .eq("is_active", true)
    .is("cik" as never, null)
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
    return NextResponse.json({ ok: true, runId, message: "todos los símbolos ya tienen cik" })
  }

  // Fetch único del mapeo universal de SEC (~500KB, ~14k tickers).
  let tickerCikMap: Map<string, { cik_str: number; ticker: string; title: string }>
  try {
    tickerCikMap = await fetchTickerCikMap()
  } catch (e) {
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `SEC fetch failed: ${String(e).slice(0, 100)}`,
      duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ error: "SEC fetch failed", detail: String(e) }, { status: 500 })
  }

  // Match + update. Tickers que no aparecen en SEC quedan sin cik (asset_type
  // distinto a stock, internacionales, o tickers raros — todos OK).
  let matched = 0, updateFailed = 0
  const unmatched: string[] = []

  for (const s of syms) {
    const entry = tickerCikMap.get(s.ticker.toUpperCase())
    if (!entry) {
      if (s.asset_type === "stock") unmatched.push(s.ticker)
      continue
    }
    const cik = padCik(entry.cik_str)
    const { error: upErr } = await db.from("symbols").update({ cik } as never).eq("id", s.id)
    if (upErr) updateFailed++
    else matched++
  }

  const durationMs = Date.now() - startedAt
  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(),
    status: updateFailed === 0 ? "success" : "partial",
    rows_inserted: matched,
    rows_failed: updateFailed,
    duration_ms: durationMs,
    error_summary: unmatched.length
      ? `${unmatched.length} stocks sin CIK en SEC: ${unmatched.slice(0, 10).join(", ")}`
      : null,
  }).eq("id", runId)

  return NextResponse.json({
    ok: true, runId,
    candidates: syms.length,
    matched,
    update_failed: updateFailed,
    unmatched_stocks: unmatched.length,
    unmatched_sample: unmatched.slice(0, 20),
    duration_ms: durationMs,
  })
}
