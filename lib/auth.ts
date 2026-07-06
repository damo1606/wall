import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sore_session";

function resolveJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret) return new TextEncoder().encode(secret);
  // En producción real NO degradar a un secreto conocido: tokens serían falsificables.
  // Falla cerrado en el arranque para forzar configurar JWT_SECRET.
  // Gate por VERCEL_ENV, no NODE_ENV: Vercel corre Preview con NODE_ENV=production,
  // así que NODE_ENV tumbaría los previews (que no tienen el secreto). VERCEL_ENV
  // solo vale "production" en el entorno productivo real.
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("JWT_SECRET no está configurada — es obligatoria en producción");
  }
  // Preview y desarrollo: fallback explícito para no romper el arranque.
  return new TextEncoder().encode("fallback-dev-secret-change-in-production");
}

const JWT_SECRET = resolveJwtSecret();

const ALGORITHM = "HS256";
const EXPIRY = "7d";

export async function signToken(payload: { sub: string; username: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as { sub: string; username: string; exp: number; iat: number };
}
