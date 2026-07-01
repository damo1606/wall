import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sore_session";

// Resolución perezosa (no en carga de módulo): `next build` evalúa los módulos
// con NODE_ENV=production y rompería sin JWT_SECRET configurada en build-time.
function resolveJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret) return new TextEncoder().encode(secret);
  // En producción NO degradar a un secreto conocido: tokens serían falsificables.
  // Falla cerrado en el primer uso para forzar configurar JWT_SECRET.
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET no está configurada — es obligatoria en producción");
  }
  // Solo en desarrollo: fallback explícito para no romper el arranque local.
  return new TextEncoder().encode("fallback-dev-secret-change-in-production");
}

const ALGORITHM = "HS256";
const EXPIRY = "7d";

export async function signToken(payload: { sub: string; username: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(resolveJwtSecret());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, resolveJwtSecret());
  return payload as { sub: string; username: string; exp: number; iat: number };
}
