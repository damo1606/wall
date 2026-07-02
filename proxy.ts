import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/auth";

// Gate de sesión para las páginas: sin cookie válida se redirige a /login.
// Las APIs quedan fuera del matcher a propósito — cada route handler aplica
// su propia auth (sesión JWT en portfolios/watchlist, Bearer CRON_SECRET en
// crons de GitHub Actions, que no tienen cookie) o sirve datos públicos.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let authenticated = false;
  if (token) {
    try {
      await verifyToken(token);
      authenticated = true;
    } catch {
      // Token inválido o expirado: tratar como no autenticado.
    }
  }

  if (pathname === "/login") {
    // Con sesión activa el login no aporta: volver a la portada.
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (!authenticated) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Todo excepto APIs, artefactos de Next y ficheros estáticos (con extensión).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
