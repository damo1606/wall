export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabase";
import { signToken, SESSION_COOKIE } from "@/lib/auth";
import { comprobarLimite, registrarFallo, limpiarLimite } from "@/lib/rate-limit";

const DUMMY_HASH = "$2b$12$invalidhashfortimingprotectionXXXXXXXXXXXXXXXXXXXXXXX";

// Clave del limitador: IP + usuario. Incluir el usuario evita que un atacante
// desde una IP bloquee a otros; incluir la IP evita rotar usuarios desde la misma
// máquina. Detrás de Vercel la IP real viene en x-forwarded-for.
function claveLimite(request: NextRequest, username: string): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "sin-ip";
  return `${ip}|${String(username).toLowerCase()}`;
}

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Credenciales requeridas" }, { status: 400 });
  }

  // bcrypt a 12 rondas ya cuesta ~460 ms por intento, lo que frena la fuerza
  // bruta secuencial, pero no un ataque paralelo o distribuido.
  const clave = claveLimite(request, username);
  const limite = comprobarLimite(clave);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: `Demasiados intentos fallidos. Reinténtalo en ${limite.esperaSegundos} s.` },
      { status: 429, headers: { "Retry-After": String(limite.esperaSegundos) } },
    );
  }

  const db = supabaseServer();
  const { data: user, error } = await db
    .from("app_users")
    .select("id, username, password_hash")
    .eq("username", username)
    .maybeSingle();

  const hashToCheck = user?.password_hash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCheck);

  if (error || !user || !valid) {
    registrarFallo(clave);
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  limpiarLimite(clave);
  const token = await signToken({ sub: user.id, username: user.username });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
