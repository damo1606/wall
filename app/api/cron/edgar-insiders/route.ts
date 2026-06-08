import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { fetchSubmissions, fetchFilingDocument, form345RawXmlPath, pool, EDGAR_CONCURRENCY } from "@/lib/edgar"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "edgar_insiders_daily"
const WINDOW_DAYS = 30
const LOOKBACK_DAYS = 35   // bajamos 35d para captar filings con lag de 2-5 días

// Form 4 transaction codes que cuentan como flujo direccional:
// P = Open market or private purchase (buy)
// S = Open market or private sale (sell)
// Otros codes (A awards, M option exercise, F tax withholding, G gift, etc.)
// los excluimos: no son señales de convicción del insider.
const COUNTED_CODES = new Set(["P", "S"])

type Form4Txn = {
  code: string                  // P/S/A/M/F/G/...
  shares: number
  price: number
  acquiredDisposed: "A" | "D"  // A = adquirido (buy), D = dispuesto (sell)
  date: string                  // YYYY-MM-DD
  ownerCik: string              // CIK del insider que reporta
}

// Parser ligero del Form 4 XML. Estructura estable hace 15+ años en SEC, regex
// suficiente. Solo extraemos nonDerivativeTransaction (acciones comunes), no
// derivativeTransaction (opciones/warrants ejercidos), que tienen otra semántica.
function parseForm4Xml(xml: string): Form4Txn[] {
  const txns: Form4Txn[] = []
  const ownerCikMatch = xml.match(/<rptOwnerCik>([^<]+)<\/rptOwnerCik>/)
  const ownerCik = ownerCikMatch ? ownerCikMatch[1].trim() : "unknown"

  const txnBlocks = xml.match(/<nonDerivativeTransaction[\s\S]*?<\/nonDerivativeTransaction>/g) ?? []
  for (const blk of txnBlocks) {
    const date = blk.match(/<transactionDate>[\s\S]*?<value>([^<]+)<\/value>/)?.[1]?.trim()
    const code = blk.match(/<transactionCode>([^<]+)<\/transactionCode>/)?.[1]?.trim()
    const shares = parseFloat(blk.match(/<transactionShares>[\s\S]*?<value>([^<]+)<\/value>/)?.[1] ?? "0")
    const price  = parseFloat(blk.match(/<transactionPricePerShare>[\s\S]*?<value>([^<]+)<\/value>/)?.[1] ?? "0")
    const ad     = blk.match(/<transactionAcquiredDisposedCode>[\s\S]*?<value>([^<]+)<\/value>/)?.[1]?.trim()
    if (!date || !code || !shares || !(ad === "A" || ad === "D")) continue
    txns.push({ code, shares, price, acquiredDisposed: ad as "A" | "D", date, ownerCik })
  }
  return txns
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const batchStart = Math.max(0, parseInt(url.searchParams.get("batch_start") ?? "0", 10))
  const batchSize  = Math.max(1, Math.min(200, parseInt(url.searchParams.get("batch_size") ?? "80", 10)))

  const db: TypedClient = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs").insert({ job_name: JOB_NAME, status: "running" }).select("id").single()
  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  // Solo símbolos con CIK (stocks listados en SEC). ETFs/índices se filtran solos
  // porque tienen cik IS NULL.
  const { data: syms, error: symErr } = await db
    .from("symbols")
    .select("id, ticker, cik")
    .eq("is_active", true)
    .not("cik" as never, "is", null)
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
  const windowEnd = today.toISOString().slice(0, 10)
  const windowStart = new Date(today.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const lookbackStr = new Date(today.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)

  let withForm4 = 0, noForm4 = 0, fetchErrors = 0, upsertErrors = 0
  const sampleAgg: Array<{ ticker: string; net: number; trades: number }> = []

  await pool(syms, EDGAR_CONCURRENCY, async (s) => {
    const cik = s.cik as unknown as string  // sabemos que no es null por el filtro
    let sub
    try {
      sub = await fetchSubmissions(cik)
    } catch {
      fetchErrors++
      return
    }
    if (!sub || sub.recent.form.length === 0) { noForm4++; return }

    // Filtrar Form 4 recientes
    const form4Indices: number[] = []
    for (let i = 0; i < sub.recent.form.length; i++) {
      if (sub.recent.form[i] === "4" && sub.recent.filingDate[i] >= lookbackStr) {
        form4Indices.push(i)
      }
    }
    if (form4Indices.length === 0) { noForm4++; return }

    withForm4++

    // Bajar cada Form 4 y parsear sus transacciones
    const allTxns: Form4Txn[] = []
    for (const i of form4Indices) {
      try {
        // El primaryDocument de SEC apunta al HTML renderizado; pedimos el XML crudo.
        const xmlPath = form345RawXmlPath(sub.recent.primaryDocument[i])
        const doc = await fetchFilingDocument(cik, sub.recent.accessionNumber[i], xmlPath)
        if (doc) allTxns.push(...parseForm4Xml(doc))
      } catch {
        // ignoramos filings individuales que fallen — el agregado del resto sigue siendo válido
      }
    }

    // Agregar solo transacciones dentro de la ventana y con código contado
    let buyUsd = 0, sellUsd = 0, nTrades = 0
    const insiders = new Set<string>()
    let lastTradeDate: string | null = null
    for (const t of allTxns) {
      if (t.date < windowStart || t.date > windowEnd) continue
      if (!COUNTED_CODES.has(t.code)) continue
      const usd = t.shares * t.price
      if (t.acquiredDisposed === "A") buyUsd += usd
      else if (t.acquiredDisposed === "D") sellUsd += usd
      nTrades++
      insiders.add(t.ownerCik)
      if (!lastTradeDate || t.date > lastTradeDate) lastTradeDate = t.date
    }

    if (nTrades === 0) {
      // Hay Form 4 reciente pero ninguna transaction de tipo P/S en la ventana
      // (ej. solo grants, exercises). Registramos un row vacío para que el join
      // de scanner-pro no devuelva null por ausencia.
    }

    const netFlowUsd = buyUsd - sellUsd

    const { error: upErr } = await db.from("insider_flows").upsert({
      symbol_id: s.id,
      period_start: windowStart,
      period_end: windowEnd,
      net_flow_usd: netFlowUsd,
      buy_usd: buyUsd,
      sell_usd: sellUsd,
      n_trades: nTrades,
      n_insiders: insiders.size,
      last_trade_date: lastTradeDate,
      cron_run_id: runId,
    } as never, { onConflict: "symbol_id,period_end,period_start" })
    if (upErr) upsertErrors++

    if (nTrades > 0 && sampleAgg.length < 8) {
      sampleAgg.push({ ticker: s.ticker, net: netFlowUsd, trades: nTrades })
    }
  })

  const durationMs = Date.now() - startedAt
  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(),
    status: upsertErrors === 0 && fetchErrors === 0 ? "success" : "partial",
    rows_inserted: withForm4 - upsertErrors,
    rows_failed: upsertErrors + fetchErrors,
    duration_ms: durationMs,
  }).eq("id", runId)

  const done = syms.length < batchSize
  return NextResponse.json({
    ok: true, runId,
    batch_start: batchStart, batch_size: batchSize,
    processed: syms.length,
    with_form4: withForm4, no_form4: noForm4,
    fetch_errors: fetchErrors, upsert_errors: upsertErrors,
    duration_ms: durationMs,
    sample: sampleAgg.map(x => `${x.ticker}: net=$${(x.net/1e6).toFixed(2)}M trades=${x.trades}`),
    next_batch_start: done ? null : batchStart + batchSize,
    done,
  })
}
