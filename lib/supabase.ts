import { createClient } from "@supabase/supabase-js";

/** Cliente público — usar en componentes y rutas de lectura */
export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('[supabase] Env vars NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no configuradas')
  return createClient(url, key)
}

/** Cliente con service role — usar SOLO en rutas API del servidor (nunca en el cliente) */
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('[supabase] Env vars NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas')
  return createClient(url, key)
}
