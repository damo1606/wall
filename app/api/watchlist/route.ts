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

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data, error } = await supabaseServer()
    .from("watchlist_entries")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json()
  const { symbol, company, target_price, notes } = body

  if (!symbol) return NextResponse.json({ error: "symbol es requerido" }, { status: 400 })

  // Evitar duplicados
  const { data: existing } = await supabaseServer()
    .from("watchlist_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("symbol", symbol.toUpperCase())
    .maybeSingle()

  if (existing) return NextResponse.json(existing, { status: 200 })

  const { data, error } = await supabaseServer()
    .from("watchlist_entries")
    .insert({ user_id: userId, symbol: symbol.toUpperCase(), company, target_price: target_price ?? null, notes })
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

  let query = supabaseServer().from("watchlist_entries").delete().eq("user_id", userId)
  if (id)     query = query.eq("id", id)
  else        query = query.eq("symbol", symbol!.toUpperCase())

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
