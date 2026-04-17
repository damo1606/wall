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
    .from("alerts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json()
  const { symbol, type, label, threshold } = body

  if (!symbol || !type)
    return NextResponse.json({ error: "symbol y type son requeridos" }, { status: 400 })

  const { data, error } = await supabaseServer()
    .from("alerts")
    .insert({ user_id: userId, symbol: symbol.toUpperCase(), type, label, threshold: threshold ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const body = await req.json()

  const { data, error } = await supabaseServer()
    .from("alerts")
    .update(body)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const { error } = await supabaseServer()
    .from("alerts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
