import { NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"

type ViewRow = {
  symbol_id: string
  taken_at: string
  price: number | null
  market_cap: number | null
  beta: number | null
  pe: number | null
  pb: number | null
  ev_ebitda: number | null
  roe: number | null
  roic: number | null
  fcf_yield: number | null
  debt_to_equity: number | null
  dividend_yield: number | null
  revenue_ttm: number | null
  eps_ttm: number | null
}

export async function GET() {
  const db: TypedClient = supabaseServer()

  // Snapshot más reciente persistido (para la etiqueta "datos al …")
  const { data: latest } = await db
    .from("fundamentals_snapshots_v")
    .select("taken_at")
    .order("taken_at", { ascending: false })
    .limit(1)
  const asOf = latest?.[0]?.taken_at ?? null
  if (!asOf) return NextResponse.json({ rows: [], asOf: null, count: 0 })

  // Ventana de 5 días hacia atrás: acota filas bajo el límite de 1000 de
  // PostgREST y captura el último snapshot de cada símbolo aunque alguno
  // vaya un día atrasado.
  const cutoff = new Date(new Date(asOf).getTime() - 5 * 86_400_000).toISOString()
  const { data: rowsRaw, error } = await db
    .from("fundamentals_snapshots_v")
    .select("symbol_id, taken_at, price, market_cap, beta, pe, pb, ev_ebitda, roe, roic, fcf_yield, debt_to_equity, dividend_yield, revenue_ttm, eps_ttm")
    .gte("taken_at", cutoff)
    .order("taken_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Última fila por símbolo (ya viene ordenado desc por taken_at)
  const latestBySymbol = new Map<string, ViewRow>()
  for (const r of (rowsRaw ?? []) as unknown as ViewRow[]) {
    if (r.symbol_id && !latestBySymbol.has(r.symbol_id)) latestBySymbol.set(r.symbol_id, r)
  }
  const symbolIds = [...latestBySymbol.keys()]
  if (symbolIds.length === 0) return NextResponse.json({ rows: [], asOf, count: 0 })

  // Resolver ticker + nombre + sector — solo stocks (los ETFs viven en /etfs)
  const { data: syms } = await db
    .from("symbols").select("id, ticker, name, sector_id")
    .in("id", symbolIds).eq("asset_type", "stock")
  const symById = new Map((syms ?? []).map(s => [s.id, s]))
  const sectorIds = [...new Set((syms ?? []).map(s => s.sector_id).filter((x): x is string => !!x))]
  const { data: secs } = sectorIds.length
    ? await db.from("sectors").select("id, name").in("id", sectorIds)
    : { data: [] as { id: string; name: string }[] }
  const sectorById = new Map((secs ?? []).map(s => [s.id, s.name]))

  const rows = symbolIds.map(id => {
    const f = latestBySymbol.get(id)!
    const s = symById.get(id)
    return {
      ticker:        s?.ticker ?? null,
      company:       s?.name ?? null,
      sector:        s?.sector_id ? (sectorById.get(s.sector_id) ?? null) : null,
      takenAt:       f.taken_at,
      price:         f.price,
      marketCap:     f.market_cap,
      pe:            f.pe,
      pb:            f.pb,
      evEbitda:      f.ev_ebitda,
      roe:           f.roe,
      roic:          f.roic,
      fcfYield:      f.fcf_yield,
      debtToEquity:  f.debt_to_equity,
      dividendYield: f.dividend_yield,
      revenueTtm:    f.revenue_ttm,
      epsTtm:        f.eps_ttm,
    }
  }).filter(r => r.ticker)

  return NextResponse.json({ rows, asOf, count: rows.length })
}
