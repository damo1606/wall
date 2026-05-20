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

/**
 * Si `explicitId` está presente, valida que pertenezca al usuario y la devuelve.
 * Si no, cae al portafolio por defecto (Principal) para preservar el contrato previo.
 * Devuelve null sólo cuando explicitId es inválido (caller debe responder 404).
 */
async function resolvePortfolioId(
  userId: string,
  explicitId: string | null | undefined,
): Promise<string | null> {
  if (explicitId) {
    const { data } = await supabaseServer()
      .from("portfolios")
      .select("id")
      .eq("id", explicitId)
      .eq("user_id", userId)
      .maybeSingle()
    return data?.id ?? null
  }
  return getOrCreateDefaultPortfolio(userId)
}

export async function GET(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const portfolioId = await resolvePortfolioId(userId, req.nextUrl.searchParams.get("portfolio_id"))
  if (!portfolioId) return NextResponse.json({ error: "Portafolio no encontrado" }, { status: 404 })

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
  // tx_type opcional — default 'buy'; admite 'sell' para registrar ventas.
  // El trigger tx_recalc_position solo dispara con minúsculas ('buy'/'sell').
  const txType: "buy" | "sell" = body.tx_type === "sell" ? "sell" : "buy"
  if (!symbol || qty == null || buy_price == null)
    return NextResponse.json({ error: "symbol, qty y buy_price son requeridos" }, { status: 400 })

  const portfolioId = await resolvePortfolioId(userId, body.portfolio_id)
  if (!portfolioId) return NextResponse.json({ error: "Portafolio no encontrado" }, { status: 404 })

  const symbolId = await resolveSymbolId(symbol)
  if (!symbolId) return NextResponse.json({ error: `Símbolo ${symbol} no existe` }, { status: 404 })

  const { data, error } = await supabaseServer()
    .from("transactions")
    .insert({
      portfolio_id: portfolioId,
      symbol_id: symbolId,
      tx_type: txType,
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

/**
 * PATCH /api/portfolio
 * Edita una posición DIRECTAMENTE en la tabla `positions` — corrección manual,
 * sin generar transacción. Para ventas reales usar POST con tx_type:'sell'.
 *
 * body: { id, qty?, buy_price?, buy_date?, symbol? }
 */
export async function PATCH(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json()
  const { id, qty, buy_price, buy_date, symbol } = body
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const portfolioId = await resolvePortfolioId(userId, body.portfolio_id)
  if (!portfolioId) return NextResponse.json({ error: "Portafolio no encontrado" }, { status: 404 })

  const update: {
    qty?: number; avg_cost?: number; opened_at?: string
    symbol_id?: string; last_updated_at: string
  } = { last_updated_at: new Date().toISOString() }
  if (qty != null)        update.qty = Number(qty)
  if (buy_price != null)  update.avg_cost = Number(buy_price)
  if (buy_date)           update.opened_at = buy_date
  if (symbol) {
    const newSymbolId = await resolveSymbolId(symbol)
    if (!newSymbolId) return NextResponse.json({ error: `Símbolo ${symbol} no existe` }, { status: 404 })
    update.symbol_id = newSymbolId
  }
  if (Object.keys(update).length <= 1) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 })
  }

  const { data, error } = await supabaseServer()
    .from("positions")
    .update(update)
    .eq("id", id)
    .eq("portfolio_id", portfolioId)
    .select("id, qty, avg_cost, opened_at, symbol_id, symbols(ticker, name)")
    .maybeSingle()

  if (error) {
    const status = error.code === "23505" ? 409 : 500
    const msg = status === 409
      ? "Ya existe una posición con ese ticker en este portafolio"
      : error.message
    return NextResponse.json({ error: msg }, { status })
  }
  if (!data) return NextResponse.json({ error: "Posición no encontrada" }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const portfolioId = await resolvePortfolioId(userId, req.nextUrl.searchParams.get("portfolio_id"))
  if (!portfolioId) return NextResponse.json({ error: "Portafolio no encontrado" }, { status: 404 })

  const { error } = await supabaseServer()
    .from("positions")
    .delete()
    .eq("id", id)
    .eq("portfolio_id", portfolioId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
