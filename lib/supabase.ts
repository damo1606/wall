import { createClient } from "@supabase/supabase-js";

/** Cliente público — usar en componentes y rutas de lectura */
export function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Cliente con service role — usar SOLO en rutas API del servidor (nunca en el cliente) */
export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
