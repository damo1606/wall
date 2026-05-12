import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ snapshots: [], error: "Supabase no configurado" })

  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from("daily_snapshots")
    .select("snapshot_date,computed_at,macro_phase,macro_confidence,vix,vix3m,fear_score,regime,sore_signals")
    .order("snapshot_date", { ascending: false })
    .limit(180)

  if (error) return NextResponse.json({ snapshots: [], error: error.message })

  type SoreRow = { symbol: string; soreGate?: string; soreCSS?: number; soreStrategy?: string }
  type Row = {
    snapshot_date: string; computed_at: string;
    macro_phase: string | null; macro_confidence: number | null;
    vix: number | null; vix3m: number | null;
    fear_score: number | null; regime: string | null;
    sore_signals: SoreRow[] | null;
  }
  const rows = (data ?? []) as Row[]

  const snapshots = rows.map(r => {
    const signals = r.sore_signals ?? []
    const goCount    = signals.filter(s => s.soreGate === "GO").length
    const waitCount  = signals.filter(s => s.soreGate === "WAIT").length
    const avoidCount = signals.filter(s => s.soreGate === "AVOID").length
    const topGo = signals
      .filter(s => s.soreGate === "GO")
      .sort((a, b) => (b.soreCSS ?? 0) - (a.soreCSS ?? 0))
      .slice(0, 5)
      .map(s => ({ symbol: s.symbol, css: s.soreCSS, strategy: s.soreStrategy }))
    return {
      date:        r.snapshot_date,
      phase:       r.macro_phase,
      confidence:  r.macro_confidence,
      vix:         r.vix,
      fearScore:   r.fear_score,
      regime:      r.regime,
      goCount, waitCount, avoidCount,
      topGo,
    }
  })

  return NextResponse.json({
    snapshots,
    totalDays: snapshots.length,
    firstDay:  snapshots[snapshots.length - 1]?.date ?? null,
    lastDay:   snapshots[0]?.date ?? null,
  })
}
