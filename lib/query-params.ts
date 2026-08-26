// Lectura segura de parámetros numéricos de query.
//
// El patrón que había repartido por el repo no protegía:
//
//   Math.max(1, Math.min(200, parseInt(raw ?? "100", 10)))
//
// `Math.max`/`Math.min` PROPAGAN NaN, así que `?batch_size=abc` daba NaN y de ahí
// pasaba a `slice(0, NaN)` → lista vacía. En un endpoint de señales eso devuelve
// 200 con cero resultados —indistinguible de "hoy no hay nada"— y en un cron hace
// que procese 0 filas y reporte éxito.

export type IntParamOptions = {
  def: number            // valor si falta o es inválido
  min?: number
  max?: number
}

// Entero limpio y nada más. `parseInt` a secas es demasiado permisivo para un
// parámetro de API: "1e" daría 1 y "7.9" daría 7, aceptando en silencio algo que
// el cliente claramente no quiso mandar.
const ENTERO = /^[+-]?\d+$/

function parseEntero(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const s = raw.trim()
  if (!ENTERO.test(s)) return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Entero de un query param, acotado. Cae al valor por defecto ante ausencia o
 * entrada inválida — nunca devuelve NaN.
 */
export function intParam(raw: string | null | undefined, opts: IntParamOptions): number {
  const parsed = parseEntero(raw)
  return clampInt(parsed ?? opts.def, opts.min, opts.max)
}

/**
 * Igual que `intParam` pero distingue "no lo mandaron" (usa el defecto) de "lo
 * mandaron mal" (null), para que el handler pueda responder 400 en vez de callar.
 */
export function strictIntParam(raw: string | null | undefined, opts: IntParamOptions): number | null {
  if (raw == null || raw.trim() === "") return clampInt(opts.def, opts.min, opts.max)
  const parsed = parseEntero(raw)
  if (parsed === null) return null
  return clampInt(parsed, opts.min, opts.max)
}

function clampInt(v: number, min?: number, max?: number): number {
  let out = v
  if (min != null) out = Math.max(min, out)
  if (max != null) out = Math.min(max, out)
  return out
}
