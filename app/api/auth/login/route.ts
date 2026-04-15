export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import { signToken, SESSION_COOKIE } from "@/lib/auth";

// Hash falso para la ruta de timing-attack prevention (cuando el usuario no existe)
const DUMMY_HASH = "$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXXX";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Credenciales requeridas" }, { status: 400 });
  }

  const db = supabaseServer();
  const { data: user, error } = await db
    .from("users")
    .select("id, username, password_hash")
    .eq("username", username)
    .single();

  // Siempre ejecutar bcrypt aunque el usuario no exista (previene enumeración por tiempo)
  const hashToCheck = user?.password_hash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCheck);

  if (error || !user || !valid) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  const token = await signToken({ sub: user.id, username: user.username });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });

  return response;
}
