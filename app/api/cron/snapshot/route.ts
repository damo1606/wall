import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { evaluateAndStoreAlerts } from "@/lib/alerts-cron"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const JOB_NAME = "snapshot_daily"

type FetchResult<T> = { data: T | null; status: number; latencyMs: number; ok: boolean }

async function timedFetch<T>(url: string): Promise<FetchResult<T>> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { cache: "no-store" })
    const latencyMs = Date.now() - t0
    if (!res.ok) return { data: null, status: res.status, latencyMs, ok: false }
    return { data: await res.json() as T, status: res.status, latencyMs, ok: true }
  } catch {
    return { data: null, status: 0, latencyMs: Date.now() - t0, ok: false }
  }
}

async function logApi(db: TypedClient, runId: string, provider: string, endpoint: string, r: FetchResult<unknown>) {
  await db.from("api_usage_log").insert({
    provider, endpoint, status_code: r.status, latency_ms: r.latencyMs, cron_run_id: runId,
  })
}

async function logDqError(db: TypedClient, runId: string, check: string, actual: unknown) {
  await db.from("data_quality_log").insert({
    cron_run_id: runId, check_name: check, severity: "error", actual: actual as never,
  })
}

function mapRegime(phase: string | null | undefined): "expansion" | "peak" | "contraction" | "trough" | null {
  if (!phase) return null
  const p = phase.toLowerCase()
  if (/(expan|grow|recov|early)/.test(p)) return "expansion"
  if (/(peak|mid|late)/.test(p)) return "peak"
  if (/(contract|reces|crisis|panico|pánico)/.test(p)) return "contraction"
  if (/(trough|bottom|depres)/.test(p)) return "trough"
  return null
}

async function upsertSymbolsByTicker(db: TypedClient, tickers: string[]): Promise<Map<string, string>> {
  if (tickers.length === 0) return new Map()
  const unique = Array.from(new Set(tickers.filter(Boolean)))
  await db.from("symbols").upsert(
    unique.map(t => ({ ticker: t, name: t, asset_type: "stock" as const })),
    { onConflict: "ticker", ignoreDuplicates: true }
  )
  const { data } = await db.from("symbols").select("id, ticker").in("ticker", unique)
  const map = new Map<string, string>()
  for (const row of data ?? []) map.set(row.ticker, row.id)
  return map
}

export async function GET(req: NextRequest) {
  // Sin CRON_SECRET la comparación quedaría como `Bearer undefined` — un 401
  // engañoso (y `Bearer undefined` literal pasaría). Tratamos la falta de
  // configuración como un 500 explícito para que el fallo sea diagnosticable.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurada en el entorno" }, { status: 500 })
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = supabaseServer()
  const startedAt = Date.now()

  const { data: runRow, error: runErr } = await db
    .from("cron_runs")
    .insert({ job_name: JOB_NAME, status: "running" })
    .select("id")
    .single()

  if (runErr || !runRow) {
    return NextResponse.json({ error: "cron_runs insert failed", detail: runErr?.message }, { status: 500 })
  }
  const runId = runRow.id

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`
  let rowsInserted = 0
  let rowsFailed = 0
  const errors: string[] = []

  const [macro, sectors, scannerPro] = await Promise.all([
    timedFetch<{ detection?: { phase?: string; confidence?: number }; vix?: number; vix3m?: number }>(`${base}/api/macro`),
    timedFetch<unknown>(`${base}/api/sectors-etf`),
    timedFetch<{ rows: Array<Record<string, unknown>>; m6Regime?: string; m6Vix?: number }>(
      `${base}/api/scanner-pro?universe=sp500&limit=50&minBuyScore=0`
    ),
  ])

  await Promise.all([
    logApi(db, runId, "wall-internal", "/api/macro",        macro),
    logApi(db, runId, "wall-internal", "/api/sectors-etf",  sectors),
    logApi(db, runId, "wall-internal", "/api/scanner-pro",  scannerPro),
  ])

  if (!macro.ok)      { errors.push("macro");      await logDqError(db, runId, "fetch_macro_failed", { status: macro.status }) }
  if (!sectors.ok)    { errors.push("sectors");    await logDqError(db, runId, "fetch_sectors_failed", { status: sectors.status }) }
  if (!scannerPro.ok) { errors.push("scannerPro"); await logDqError(db, runId, "fetch_scanner_pro_failed", { status: scannerPro.status }) }

  const macroPhase      = macro.data?.detection?.phase ?? null
  const macroConfidence = macro.data?.detection?.confidence ?? null
  const vix             = macro.data?.vix ?? null
  const vix3m           = macro.data?.vix3m ?? null
  const m6Regime        = scannerPro.data?.m6Regime ?? null
  const m6Vix           = scannerPro.data?.m6Vix ?? vix
  const firstRow        = scannerPro.data?.rows?.[0] as { m6FearScore?: number } | undefined
  const fearScore       = firstRow?.m6FearScore ?? null

  const mappedRegime = mapRegime(macroPhase) ?? mapRegime(m6Regime)
  if (mappedRegime) {
    const { error } = await db.from("cycle_classifications").insert({
      regime: mappedRegime,
      confidence: macroConfidence,
      signals: { raw_macro_phase: macroPhase, raw_m6_regime: m6Regime, vix, vix3m, m6Vix, fearScore } as never,
      cron_run_id: runId,
    })
    if (error) { rowsFailed++; errors.push(`cycle: ${error.message}`) } else { rowsInserted++ }
  } else if (macroPhase || m6Regime) {
    await logDqError(db, runId, "regime_unmappable", { macroPhase, m6Regime })
  }

  const rows = scannerPro.data?.rows ?? []
  if (rows.length > 0) {
    const tickers = rows.map(r => (r.symbol as string) || "").filter(Boolean)
    const symbolMap = await upsertSymbolsByTicker(db, tickers)

    const methodologyRows = rows
      .map(r => {
        const ticker = r.symbol as string
        const symbolId = ticker ? symbolMap.get(ticker) : undefined
        if (!symbolId) return null
        return {
          methodology: "M6" as const,
          symbol_id: symbolId,
          payload: r as never,
          cron_run_id: runId,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (methodologyRows.length > 0) {
      const { error } = await db.from("methodology_snapshots").insert(methodologyRows)
      if (error) { rowsFailed += methodologyRows.length; errors.push(`methodology: ${error.message}`) }
      else       { rowsInserted += methodologyRows.length }
    }

    // ── Motor de Oportunidades: evaluación de alertas ───────────────────────
    try {
      const alertResult = await evaluateAndStoreAlerts(
        db, rows, symbolMap, new Date(startedAt).toISOString(),
      )
      rowsInserted += alertResult.fired

      const alertWebhook = process.env.DISCORD_WEBHOOK_URL
      if (alertResult.fired > 0 && alertWebhook) {
        const today = new Date().toISOString().split("T")[0]
        fetch(alertWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `**Alertas de Oportunidad ${today}** · ${alertResult.fired} disparada(s)\n\n${alertResult.messages.slice(0, 15).join("\n")}`,
          }),
        }).catch(() => {})
      }
    } catch (e) {
      errors.push(`alerts: ${(e as Error).message}`)
    }
  }

  const durationMs = Date.now() - startedAt
  const allOk = macro.ok && sectors.ok && scannerPro.ok && errors.length === 0
  const someOk = macro.ok || sectors.ok || scannerPro.ok
  const status: "success" | "partial" | "failed" = allOk ? "success" : someOk ? "partial" : "failed"

  await db.from("cron_runs").update({
    finished_at:   new Date().toISOString(),
    status,
    rows_inserted: rowsInserted,
    rows_failed:   rowsFailed,
    duration_ms:   durationMs,
    error_summary: errors.length > 0 ? errors.join(" | ") : null,
  }).eq("id", runId)

  const webhook = process.env.DISCORD_WEBHOOK_URL
  if (webhook && rows.length > 0) {
    type SoreRow = { symbol: string; soreGate?: string; soreCSS?: number; soreStrategy?: string }
    const goSignals = (rows as SoreRow[])
      .filter(r => r.soreGate === "GO")
      .sort((a, b) => (b.soreCSS ?? 0) - (a.soreCSS ?? 0))
      .slice(0, 10)
    const extremeRegime = m6Regime === "PÁNICO AGUDO" || m6Regime === "CRISIS SISTÉMICA"

    if (goSignals.length > 0 || extremeRegime) {
      const today = new Date().toISOString().split("T")[0]
      const goList = goSignals.length > 0
        ? goSignals.map(r => `• **${r.symbol}** CSS=${r.soreCSS} → ${r.soreStrategy}`).join("\n")
        : "_Sin GO signals_"
      const regimeAlert = extremeRegime ? `\n\n🚨 **RÉGIMEN ${m6Regime}** — gatillo suspendido` : ""
      const content = `**SORE Snapshot ${today}** · Régimen: ${m6Regime} · VIX ${m6Vix?.toFixed(2)} · Fear ${fearScore}\n\n${goList}${regimeAlert}`
      fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({
    ok: status !== "failed",
    runId, status,
    phase: macroPhase, mappedRegime,
    m6Regime, m6Vix, fearScore,
    rowsInserted, rowsFailed,
    durationMs,
    warnings: errors,
  })
}
