import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"
import { requireAuth } from "@/lib/api-auth"

// Persistencia del grid de consenso macro (app/macro-fx). Reemplaza el
// localStorage-only que había antes — dato de mercado compartido, no de
// usuario (sin RLS por user_id, mismo criterio que /api/fundamentals).

export const dynamic = "force-dynamic"

type ReleaseRow = {
  currency: string
  indicator: string
  release_date: string
  actual: number | string | null
  consensus: number | string | null
  previous_raw: number | string | null
  event_title: string | null
  source: string
}

// Fila "actual" del grid por (currency, indicator) — la de release_date más
// reciente. `previous` preferimos previous_raw del feed (más confiable que
// calcular la fila anterior propia, que puede tener huecos).
type CurrentCell = { actual: string; consensus: string; previous: string; releaseDate: string; source: string }

export async function GET() {
  const denied = await requireAuth(); if (denied) return denied
  const db: TypedClient = supabaseServer()

  const { data, error } = await db
    .from("macro_indicator_releases")
    .select("currency, indicator, release_date, actual, consensus, previous_raw, event_title, source")
    .order("release_date", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as ReleaseRow[]

  // Ya viene ordenado ascendente por release_date — la última asignación
  // por key es la más reciente.
  const latestByKey = new Map<string, ReleaseRow>()
  for (const r of rows) latestByKey.set(`${r.currency}|${r.indicator}`, r)

  const current: Record<string, Record<string, CurrentCell>> = {}
  for (const [key, r] of latestByKey) {
    const [currency, indicator] = key.split("|")
    current[currency] ??= {}
    current[currency][indicator] = {
      actual:      r.actual != null ? String(r.actual) : "",
      consensus:   r.consensus != null ? String(r.consensus) : "",
      previous:    r.previous_raw != null ? String(r.previous_raw) : "",
      releaseDate: r.release_date,
      source:      r.source,
    }
  }

  return NextResponse.json({ current, rows })
}

export async function POST(req: NextRequest) {
  const denied = await requireAuth(); if (denied) return denied
  const db: TypedClient = supabaseServer()

  const body = await req.json().catch(() => null) as {
    currency?: string; indicator?: string; release_date?: string
    actual?: string | number | null; consensus?: string | number | null
    source?: string
  } | null
  if (!body?.currency || !body?.indicator || !body?.release_date) {
    return NextResponse.json({ error: "currency, indicator y release_date son requeridos" }, { status: 400 })
  }
  if (body.actual === undefined && body.consensus === undefined) {
    return NextResponse.json({ error: "nada que guardar (actual o consensus)" }, { status: 400 })
  }

  const toNum = (v: string | number | null | undefined): number | null | undefined => {
    if (v === undefined) return undefined
    if (v === null || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  // Preserva `source`/`event_title` de una fila existente (ej. sincronizada
  // por el cron de ForexFactory) en vez de pisarla con 'manual' solo porque
  // el usuario corrigió el `actual`.
  const { data: existing } = await db
    .from("macro_indicator_releases")
    .select("id, source")
    .eq("currency", body.currency).eq("indicator", body.indicator).eq("release_date", body.release_date)
    .maybeSingle()

  const patch: Record<string, unknown> = {
    currency: body.currency, indicator: body.indicator, release_date: body.release_date,
    updated_at: new Date().toISOString(),
  }
  const actualNum = toNum(body.actual)
  const consensusNum = toNum(body.consensus)
  if (actualNum !== undefined) patch.actual = actualNum
  if (consensusNum !== undefined) patch.consensus = consensusNum
  if (!existing) patch.source = body.source ?? "manual"

  const { data, error } = await db
    .from("macro_indicator_releases")
    .upsert(patch as never, { onConflict: "currency,indicator,release_date" })
    .select("currency, indicator, release_date, actual, consensus, previous_raw, source")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
