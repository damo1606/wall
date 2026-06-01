import { NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"

export async function GET() {
  const db: TypedClient = supabaseServer()

  // Universo: símbolos no-stock activos (ETFs, índices, etc.)
  const { data: syms, error: symErr } = await db
    .from("symbols")
    .select("id, ticker, name, asset_type")
    .neq("asset_type", "stock")
    .eq("is_active", true)
  if (symErr) return NextResponse.json({ error: symErr.message }, { status: 500 })
  if (!syms || syms.length === 0) return NextResponse.json({ rows: [], asOf: null, count: 0 })

  const ids = syms.map(s => s.id)
  const symById = new Map(syms.map(s => [s.id, s]))

  // Rollup diario — 1 fila por símbolo (upsert onConflict symbol_id)
  const { data: rollup, error: rErr } = await db
    .from("price_summary_daily")
    .select("symbol_id, as_of_date, close, return_1d, return_5d, return_20d, return_60d, return_ytd, drop_from_52w_high_pct, week_52_high, week_52_low, vol_20d_annualized, dollar_volume_20d")
    .in("symbol_id", ids)
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const rows = (rollup ?? []).map(r => {
    const s = symById.get(r.symbol_id)!
    return {
      ticker:        s.ticker,
      name:          s.name,
      assetType:     s.asset_type,
      asOfDate:      r.as_of_date,
      price:         r.close,
      return1d:      r.return_1d,
      return5d:      r.return_5d,
      return20d:     r.return_20d,
      return60d:     r.return_60d,
      returnYtd:     r.return_ytd,
      dropFrom52w:   r.drop_from_52w_high_pct,
      week52High:    r.week_52_high,
      week52Low:     r.week_52_low,
      volAnnualized: r.vol_20d_annualized,
      dollarVolume:  r.dollar_volume_20d,
    }
  })

  // "datos al" = la fecha más reciente del rollup
  const asOf = rows.reduce<string | null>((acc, r) => (!acc || (r.asOfDate && r.asOfDate > acc) ? r.asOfDate : acc), null)

  return NextResponse.json({ rows, asOf, count: rows.length })
}
