export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";

const BCRYPT_ROUNDS = 12;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "username y password requeridos" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const db = supabaseServer();
  const { data, error } = await db
    .from("users")
    .insert({ username, password_hash })
    .select("id, username, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "El usuario ya existe" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user: data }, { status: 201 });
}
