import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken, SESSION_COOKIE } from "@/lib/auth"
import { supabaseServer } from "@/lib/supabase"

async function getUserId(): Promise<string | null> {
  try {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    if (!token) return null
    const payload = await verifyToken(token)
    return payload.sub
  } catch {
    return null
  }
}

/**
 * GET /api/portfolios — devuelve los portafolios del usuario autenticado,
 * más el número de posiciones de cada uno (para mostrar "IA · 10 tickers").
 * Ordenados por created_at ascendente (Principal primero).
 */
export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const db = supabaseServer()
  const { data: portfolios, error } = await db
    .from("portfolios")
    .select("id, name, type, base_currency, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Conteo de posiciones por portafolio. Una sola consulta cubre todos.
  const ids = (portfolios ?? []).map(p => p.id)
  const counts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: rows } = await db.from("positions").select("portfolio_id").in("portfolio_id", ids)
    for (const r of rows ?? []) counts.set(r.portfolio_id, (counts.get(r.portfolio_id) ?? 0) + 1)
  }

  return NextResponse.json(
    (portfolios ?? []).map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      base_currency: p.base_currency,
      created_at: p.created_at,
      positions: counts.get(p.id) ?? 0,
    })),
  )
}
