import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"
import { verifyToken, SESSION_COOKIE } from "@/lib/auth"

// Guard de autenticación para los route handlers.
//
// `proxy.ts` deja las APIs fuera de su matcher a propósito, así que cada handler
// aplica la suya. Este helper centraliza las dos formas legítimas de llamar a un
// endpoint de cómputo:
//
//   1. Navegador con sesión iniciada  → cookie JWT
//   2. Servidor a servidor (crons, y las llamadas internas de `oportunidades` y
//      `report/intraday` a `scanner-pro`) → Authorization: Bearer CRON_SECRET
//
// Se lee de `next/headers` en vez de un `NextRequest` para poder insertarse igual
// en handlers con cualquier firma, incluidos los `GET()` sin argumentos.
//
// Uso:
//   export async function GET() {
//     const denied = await requireAuth(); if (denied) return denied
//     …
//   }
// El tipo de retorno es concreto (no `NextResponse<unknown>`) para que el 401 sea
// asignable en handlers que declaran su propio tipo de respuesta.
export async function requireAuth(): Promise<NextResponse<{ error: string }> | null> {
  // Bearer CRON_SECRET — sin secreto configurado esta vía queda cerrada, no abierta.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = (await headers()).get("authorization")
    if (auth === `Bearer ${cronSecret}`) return null
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) {
    try {
      await verifyToken(token)
      return null
    } catch {
      // Token inválido o expirado: cae al 401 de abajo.
    }
  }

  return NextResponse.json({ error: "No autenticado" }, { status: 401 })
}

// Cabeceras para propagar credenciales en una llamada interna servidor→servidor.
// Reenvía la cookie de sesión de quien nos llamó; si no hay (caso cron), usa el
// Bearer. Así una petición del navegador conserva su identidad y una del cron
// sigue funcionando sin cookie.
export async function internalAuthHeaders(): Promise<Record<string, string>> {
  const cookie = (await cookies()).get(SESSION_COOKIE)
  if (cookie?.value) return { cookie: `${SESSION_COOKIE}=${cookie.value}` }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) return { authorization: `Bearer ${cronSecret}` }

  return {}
}
