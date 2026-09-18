import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"

// Sincroniza el calendario económico de ForexFactory a macro_indicator_releases.
//
// Fuente: el JSON público (sin login/API key) que alimenta el widget de
// calendario de ForexFactory — NO es una API oficial documentada, solo el
// archivo estático que sirven para su propio embed. Sin SLA: si cambia de
// formato o deja de responder, este cron falla solo (status "failed" en
// cron_runs) y el grid manual de /macro-fx sigue funcionando igual —
// degradación aislada, no en cascada.
//
// El feed da `forecast` (=consensus) y `previous` de antemano, antes de que
// el dato se publique — resuelve el calendario hacia adelante sin que el
// usuario teclee nada. No trae `actual` nunca (verificado): eso sigue
// viniendo de FRED (solo USD) o entrada manual vía /api/macro-fx/releases.

export const dynamic = "force-dynamic"
export const maxDuration = 60

const JOB_NAME = "macro_calendar_sync"
const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

const CURRENCIES = new Set(["EUR", "USD", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"])

type WallIndicator = "CPI" | "GDP" | "Unemployment" | "PMI" | "RetailSales" | "TradeBalance" | "InterestRate"

// Orden de prioridad por indicador: la primera regex que matchea el título
// gana. Existen varias variantes del mismo concepto el mismo día (ej. CPI
// m/m, Trimmed CPI y/y, Common CPI y/y para Canadá) — solo queremos "la
// cabecera", no todas.
const INDICATOR_PATTERNS: Record<WallIndicator, RegExp[]> = {
  CPI:           [/\bCPI y\/y\b/i, /\bCPI m\/m\b/i, /\bCPI\b/i],
  GDP:           [/\bGDP q\/q\b/i, /\bGDP m\/m\b/i, /\bGDP\b/i],
  Unemployment:  [/\bUnemployment Rate\b/i],
  PMI:           [/Manufacturing PMI/i, /Services PMI/i, /\bPMI\b/i],
  RetailSales:   [/Retail Sales m\/m/i, /\bRetail Sales\b/i],
  TradeBalance:  [/\bTrade Balance\b/i],
  // Cada banco central tiene su propio nombre en ForexFactory — no hay un
  // "Interest Rate Decision" genérico universal. Verificado contra el feed
  // real: Fed = "Federal Funds Rate", BOE = "Official Bank Rate", RBNZ =
  // "Official Cash Rate"/OCR, BOJ/SNB = "... Policy Rate", RBA = "Cash Rate",
  // BOC = "Overnight Rate", ECB = "Main Refinancing Rate".
  InterestRate:  [
    /Federal Funds Rate/i,
    /Interest Rate Decision/i,
    /Official (Bank|Cash) Rate/i,
    /\bOCR\b/i,
    /(BOJ|SNB)\s*Policy Rate/i,
    /Main Refinancing (Rate|Operations)/i,
    /Overnight Rate/i,
    /\bCash Rate\b/i,
  ],
}
const INDICATOR_ORDER = Object.keys(INDICATOR_PATTERNS) as WallIndicator[]

// "Votes"/"Minutes" son artefactos secundarios de una decisión de tasa (el
// conteo de votos del comité, el acta de la reunión) — su forecast/previous
// no es la tasa en sí, y competirían por prioridad con la fila que sí importa.
const EXCLUDE_TITLE = /\b(Votes|Minutes)\b/i

type FFEvent = { title: string; country: string; date: string; impact: string; forecast: string; previous: string }

// Convierte "-0.1%" / "480B" / "2.0%" / "" a número. null si no hay dato o
// no se puede parsear — nunca NaN (mismo espíritu que lib/query-params.ts).
function parseFFNumber(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const m = s.replace(/,/g, "").match(/^(-?\d+(?:\.\d+)?)\s*([KMBT%])?$/i)
  if (!m) return null
  let v = parseFloat(m[1])
  if (!Number.isFinite(v)) return null
  const suffix = m[2]?.toUpperCase()
  if (suffix === "K") v *= 1e3
  else if (suffix === "M") v *= 1e6
  else if (suffix === "B") v *= 1e9
  else if (suffix === "T") v *= 1e12
  return v
}

function matchIndicator(title: string): { indicator: WallIndicator; priority: number } | null {
  if (EXCLUDE_TITLE.test(title)) return null
  for (const indicator of INDICATOR_ORDER) {
    const patterns = INDICATOR_PATTERNS[indicator]
    for (let priority = 0; priority < patterns.length; priority++) {
      if (patterns[priority].test(title)) return { indicator, priority }
    }
  }
  return null
}

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

  let events: FFEvent[]
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" })
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`)
    events = await res.json()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.from("cron_runs").update({
      finished_at: new Date().toISOString(), status: "failed",
      error_summary: `fetch feed: ${msg}`, duration_ms: Date.now() - startedAt,
    }).eq("id", runId)
    return NextResponse.json({ error: "No se pudo leer el feed de ForexFactory", detail: msg }, { status: 502 })
  }

  // Filtra a las 8 divisas de wall y descarta lo que no matchea ningún
  // indicador (no todo lo que publica FF es uno de los 7 que rastreamos).
  type Candidate = { currency: string; indicator: WallIndicator; releaseDate: string; title: string; forecast: string; previous: string; priority: number }
  const candidates: Candidate[] = []
  for (const ev of events) {
    if (!CURRENCIES.has(ev.country)) continue
    const match = matchIndicator(ev.title)
    if (!match) continue
    candidates.push({
      currency: ev.country,
      indicator: match.indicator,
      releaseDate: ev.date.slice(0, 10),
      title: ev.title,
      forecast: ev.forecast,
      previous: ev.previous,
      priority: match.priority,
    })
  }

  // Dedupe: si el mismo (currency, indicator, releaseDate) tiene varias
  // variantes ese día (CPI y/y + CPI m/m), queda la de menor prioridad.
  const bestByKey = new Map<string, Candidate>()
  for (const c of candidates) {
    const key = `${c.currency}|${c.indicator}|${c.releaseDate}`
    const prev = bestByKey.get(key)
    if (!prev || c.priority < prev.priority) bestByKey.set(key, c)
  }

  const rows = [...bestByKey.values()].map(c => ({
    currency: c.currency,
    indicator: c.indicator,
    release_date: c.releaseDate,
    event_title: c.title,
    consensus: parseFFNumber(c.forecast),
    previous_raw: parseFFNumber(c.previous),
    source: "forexfactory",
    updated_at: new Date().toISOString(),
  }))

  let upserted = 0
  let upsertError: string | null = null
  if (rows.length > 0) {
    const { error, count } = await db
      .from("macro_indicator_releases")
      .upsert(rows as never, { onConflict: "currency,indicator,release_date", count: "exact" })
    if (error) upsertError = error.message
    else upserted = count ?? rows.length
  }

  const durationMs = Date.now() - startedAt
  const status: "success" | "failed" = upsertError ? "failed" : "success"

  await db.from("cron_runs").update({
    finished_at: new Date().toISOString(), status,
    rows_inserted: upserted, rows_failed: upsertError ? rows.length : 0,
    duration_ms: durationMs, error_summary: upsertError,
  }).eq("id", runId)

  return NextResponse.json({
    ok: !upsertError, runId, status,
    events_total: events.length, candidates: candidates.length,
    rows_upserted: upserted, duration_ms: durationMs,
    error: upsertError,
  }, { status: upsertError ? 500 : 200 })
}
