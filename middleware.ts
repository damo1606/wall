import { NextRequest, NextResponse } from "next/server";

// En WALL, todas las rutas son públicas — sin autenticación requerida
export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
