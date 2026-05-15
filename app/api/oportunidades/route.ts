import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase"
import { computeOpportunityScore, type OpportunitySignals } from "@/lib/opportunity"
import { getHistoricalPercentiles } from "@/lib/history"
import { DJIA_SYMBOLS, NASDAQ100_SYMBOLS } from "@/lib/symbols"

export const dynamic = "force-dynamic"

// Subconjunto del payload ConvictionRow (app/api/scanner-pro) que necesita el motor.
type ConvictionPayload = {
  symbol: string
  company: string
  sector: string
  grade: string
  currentPrice: number
  buyScore: number
  convictionScore: number
  m7Score: number
  soreGate: "GO" | "WAIT" | "AVOID"
  dropFrom52w: number
  discountToGraham: number
  upsideToTarget: number
  pe: number
}

function toSignals(p: ConvictionPayload, historicalPercentile?: number): OpportunitySignals {
  return {
    buyScore:         p.buyScore ?? 0,
    convictionScore:  p.convictionScore ?? 0,
    m7Score:          p.m7Score ?? 0,
    soreGate:         p.soreGate ?? "WAIT",
    dropFrom52w:      p.dropFrom52w ?? 0,
    discountToGraham: p.discountToGraham ?? 0,
    upsideToTarget:   p.upsideToTarget ?? 0,
    pe:               p.pe ?? 0,
    historicalPercentile,
  }
}

// Lee la última tanda de methodology_snapshots. El cron guarda una fila por símbolo
// cada día con methodology "M6"; tomamos las filas dentro de una ventana de 6h
// alrededor del taken_at más reciente (mismo cron run).
async function readLatestSnapshot(): Promise<{ rows: ConvictionPayload[]; asOf: string | null }> {
  const db = supabaseServer()

  const { data: latest } = await db
    .from("methodology_snapshots")
    .select("taken_at")
    .eq("methodology", "M6")
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest?.taken_at) return { rows: [], asOf: null }

  const since = new Date(new Date(latest.taken_at).getTime() - 6 * 3600 * 1000).toISOString()
  const { data } = await db
    .from("methodology_snapshots")
    .select("payload")
    .eq("methodology", "M6")
    .gte("taken_at", since)

  const rows = (data ?? [])
    .map(r => r.payload as unknown as ConvictionPayload)
    .filter(p => p && typeof p.symbol === "string")

  return { rows, asOf: latest.taken_at }
}

// Fallback en vivo: si no hay snapshot (ej. el cron no ha corrido), llama a scanner-pro.
async function readLiveFallback(req: NextRequest): Promise<ConvictionPayload[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`
  try {
    const res = await fetch(`${base}/api/scanner-pro?universe=sp500&limit=30&minBuyScore=0`, { cache: "no-store" })
    if (!res.ok) return []
    const json = await res.json() as { rows?: ConvictionPayload[] }
    return json.rows ?? []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const universe = req.nextUrl.searchParams.get("universe") ?? "sp500"

  let { rows, asOf } = await readLatestSnapshot()
  let fallback = false
  if (rows.length === 0) {
    fallback = true
    rows = await readLiveFallback(req)
    asOf = new Date().toISOString()
  }

  // Filtro por universo sobre las filas almacenadas (el snapshot es S&P 500).
  if (universe === "dia") {
    const set = new Set(DJIA_SYMBOLS)
    rows = rows.filter(r => set.has(r.symbol))
  } else if (universe === "nasdaq") {
    const set = new Set(NASDAQ100_SYMBOLS)
    rows = rows.filter(r => set.has(r.symbol))
  }

  // Dedup por símbolo (la ventana de 6h podría capturar dos corridas).
  const bySymbol = new Map<string, ConvictionPayload>()
  for (const r of rows) if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, r)

  // Percentil histórico de PE por ticker (Fase 2 — "barato vs su propia historia").
  const histPct = await getHistoricalPercentiles("pe")

  const items = [...bySymbol.values()].map(p => {
    const percentile = histPct.get(p.symbol)
    return {
      symbol:        p.symbol,
      company:       p.company ?? p.symbol,
      sector:        p.sector ?? "—",
      grade:         p.grade ?? "—",
      currentPrice:  p.currentPrice ?? 0,
      buyScore:      p.buyScore ?? 0,
      pe:            p.pe ?? 0,
      upsideToTarget: p.upsideToTarget ?? 0,
      historicalPercentile: percentile ?? null,
      ...computeOpportunityScore(toSignals(p, percentile)),
    }
  })

  const comprar = items
    .filter(i => i.bucket === "comprar")
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
  const vender = items
    .filter(i => i.bucket === "vender")
    .sort((a, b) => b.opportunityScore - a.opportunityScore)

  return NextResponse.json({
    comprar,
    vender,
    total: items.length,
    fallback,
    asOf,
  })
}
