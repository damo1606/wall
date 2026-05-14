import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken, SESSION_COOKIE } from "@/lib/auth"
import { supabaseServer } from "@/lib/supabase"

async function getUserId(): Promise<string | null> {
  try {
    const jar   = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    if (!token) return null
    const payload = await verifyToken(token)
    return payload.sub
  } catch {
    return null
  }
}

async function resolveSymbolId(ticker: string): Promise<string | null> {
  const { data } = await supabaseServer()
    .from("symbols")
    .select("id")
    .eq("ticker", ticker.toUpperCase())
    .maybeSingle()
  return data?.id ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data, error } = await supabaseServer()
    .from("watchlist")
    .select("id, added_at, notes, symbol_id, symbols(ticker, name)")
    .eq("user_id", userId)
    .order("added_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    added_at: r.added_at,
    notes: r.notes,
    symbol_id: r.symbol_id,
    symbol: r.symbols?.ticker ?? null,
    company: r.symbols?.name ?? null,
  }))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json()
  const { symbol, notes } = body
  if (!symbol) return NextResponse.json({ error: "symbol es requerido" }, { status: 400 })

  const symbolId = await resolveSymbolId(symbol)
  if (!symbolId) return NextResponse.json({ error: `Símbolo ${symbol} no existe en symbols` }, { status: 404 })

  const { data: existing } = await supabaseServer()
    .from("watchlist")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol_id", symbolId)
    .maybeSingle()

  if (existing) return NextResponse.json(existing, { status: 200 })

  const { data, error } = await supabaseServer()
    .from("watchlist")
    .insert({ user_id: userId, symbol_id: symbolId, notes: notes ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const symbol = req.nextUrl.searchParams.get("symbol")
  const id     = req.nextUrl.searchParams.get("id")

  if (!symbol && !id)
    return NextResponse.json({ error: "symbol o id requerido" }, { status: 400 })

  let query = supabaseServer().from("watchlist").delete().eq("user_id", userId)

  if (id) {
    query = query.eq("id", id)
  } else {
    const symbolId = await resolveSymbolId(symbol!)
    if (!symbolId) return NextResponse.json({ error: "Símbolo no existe" }, { status: 404 })
    query = query.eq("symbol_id", symbolId)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
