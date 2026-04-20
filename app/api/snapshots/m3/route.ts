import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase"
import { verifyToken } from "@/lib/auth"

async function getUserId(): Promise<string | null> {
  const token = (await cookies()).get("sore_session")?.value
  if (!token) return null
  try { return (await verifyToken(token)).sub } catch { return null }
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const { data, error } = await supabaseServer()
    .from("m3_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabaseServer()
    .from("m3_snapshots")
    .insert({ user_id: userId, ...body })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
