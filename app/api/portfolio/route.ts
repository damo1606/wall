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

async function getOrCreateDefaultPortfolio(userId: string): Promise<string | null> {
  const db = supabaseServer()
  const { data: existing } = await db
    .from("portfolios")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await db
    .from("portfolios")
    .insert({ user_id: userId, name: "Principal" })
    .select("id")
    .single()
  if (error) return null
  return created.id
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

  const portfolioId = await getOrCreateDefaultPortfolio(userId)
  if (!portfolioId) return NextResponse.json({ error: "No se pudo obtener portfolio" }, { status: 500 })

  const { data, error } = await supabaseServer()
    .from("positions")
    .select("id, qty, avg_cost, opened_at, last_updated_at, symbol_id, symbols(ticker, name)")
    .eq("portfolio_id", portfolioId)
    .order("opened_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    qty: r.qty,
    buy_price: r.avg_cost,
    buy_date: r.opened_at,
    symbol: r.symbols?.ticker ?? null,
    company: r.symbols?.name ?? null,
    last_updated_at: r.last_updated_at,
  }))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json()
  const { symbol, qty, buy_price, buy_date, notes } = body
  if (!symbol || qty == null || buy_price == null)
    return NextResponse.json({ error: "symbol, qty y buy_price son requeridos" }, { status: 400 })

  const portfolioId = await getOrCreateDefaultPortfolio(userId)
  if (!portfolioId) return NextResponse.json({ error: "No se pudo obtener portfolio" }, { status: 500 })

  const symbolId = await resolveSymbolId(symbol)
  if (!symbolId) return NextResponse.json({ error: `Símbolo ${symbol} no existe` }, { status: 404 })

  const { data, error } = await supabaseServer()
    .from("transactions")
    .insert({
      portfolio_id: portfolioId,
      symbol_id: symbolId,
      tx_type: "BUY",
      qty: Number(qty),
      price: Number(buy_price),
      executed_at: buy_date || new Date().toISOString(),
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const portfolioId = await getOrCreateDefaultPortfolio(userId)
  if (!portfolioId) return NextResponse.json({ error: "No se pudo obtener portfolio" }, { status: 500 })

  const { error } = await supabaseServer()
    .from("positions")
    .delete()
    .eq("id", id)
    .eq("portfolio_id", portfolioId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
