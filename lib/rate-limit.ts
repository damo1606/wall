// Limitador de intentos en memoria, con backoff exponencial.
//
// LIMITACIÓN CONOCIDA: el estado vive en el proceso. En Vercel cada instancia
// serverless tiene el suyo, así que un atacante repartido entre instancias
// obtiene más intentos de los que dice el límite. Aun así sube el coste del
// ataque de forma significativa y no necesita tabla ni migración.
//
// Si en algún momento hace falta un límite duro y global, el sitio natural es
// una tabla en Supabase con (clave, intentos, bloqueado_hasta); esta interfaz
// se puede mantener igual.

type Registro = { fallos: number; primerFallo: number; bloqueadoHasta: number }

const registros = new Map<string, Registro>()

export type RateLimitOptions = {
  /** Fallos permitidos antes de empezar a bloquear. */
  maxIntentos: number
  /** Ventana en la que se acumulan los fallos (ms). */
  ventanaMs: number
  /** Bloqueo tras superar el límite (ms). Se duplica por cada fallo extra. */
  bloqueoBaseMs: number
  /** Techo del bloqueo (ms). */
  bloqueoMaxMs: number
}

export const LOGIN_LIMITS: RateLimitOptions = {
  maxIntentos: 5,
  ventanaMs: 15 * 60_000,
  bloqueoBaseMs: 60_000,
  bloqueoMaxMs: 30 * 60_000,
}

export type RateLimitResult =
  | { permitido: true }
  | { permitido: false; esperaSegundos: number }

/** Consulta si la clave puede intentar. No cuenta como intento. */
export function comprobarLimite(
  clave: string,
  opts: RateLimitOptions = LOGIN_LIMITS,
  ahora = Date.now(),
): RateLimitResult {
  purgar(ahora, opts)
  const r = registros.get(clave)
  if (!r) return { permitido: true }

  if (r.bloqueadoHasta > ahora) {
    return { permitido: false, esperaSegundos: Math.ceil((r.bloqueadoHasta - ahora) / 1000) }
  }
  return { permitido: true }
}

/** Registra un intento fallido y aplica bloqueo si toca. */
export function registrarFallo(
  clave: string,
  opts: RateLimitOptions = LOGIN_LIMITS,
  ahora = Date.now(),
): void {
  const previo = registros.get(clave)

  // Fuera de la ventana, se empieza a contar de cero.
  const r: Registro = previo && ahora - previo.primerFallo <= opts.ventanaMs
    ? previo
    : { fallos: 0, primerFallo: ahora, bloqueadoHasta: 0 }

  r.fallos += 1

  if (r.fallos > opts.maxIntentos) {
    const exceso = r.fallos - opts.maxIntentos - 1
    const espera = Math.min(opts.bloqueoBaseMs * 2 ** exceso, opts.bloqueoMaxMs)
    r.bloqueadoHasta = ahora + espera
  }

  registros.set(clave, r)
}

/** Login correcto: se borra el historial de la clave. */
export function limpiarLimite(clave: string): void {
  registros.delete(clave)
}

// Evita que el Map crezca sin fin en una instancia de vida larga.
function purgar(ahora: number, opts: RateLimitOptions) {
  if (registros.size < 1000) return
  for (const [k, r] of registros) {
    if (r.bloqueadoHasta <= ahora && ahora - r.primerFallo > opts.ventanaMs) registros.delete(k)
  }
}

/** Solo para tests. */
export function _reset(): void {
  registros.clear()
}
