import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken, SESSION_COOKIE } from "@/lib/auth"
import { supabaseServer } from "@/lib/supabase"

export const dynamic = "force-dynamic"

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

// Feed de alertas disparadas: las del usuario + las globales (user_id null).
export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data, error } = await supabaseServer()
    .from("alert_events")
    .select("id, kind, message, opportunity_score, created_at, read_at, symbols(ticker)")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
