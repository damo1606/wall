// Reglas puras del cron de option_chains: ventana de mercado, filtro de
// vencimientos y control de calidad. Sin I/O para poder testearlas.

/** Inicio y fin de la ventana de toma, en minutos desde medianoche NY. */
export const WINDOW_OPEN_MIN  = 9 * 60 + 45   // 09:45 ET: 15 min tras la apertura, quotes ya estables
export const WINDOW_CLOSE_MIN = 16 * 60       // 16:00 ET: cierre regular
/** Vencimientos con menos días que esto se descartan (0DTE / 1DTE). */
export const MIN_DTE = 2
/** Mínimo de contratos con bid y ask > 0 para aceptar una toma. */
export const MIN_QUOTE_RATIO = 0.5

export type NyClock = { date: string; weekday: number; minutes: number }

/** Fecha (YYYY-MM-DD), día de semana (0=dom) y minutos del día en America/New_York. */
export function nyClock(d: Date = new Date()): NyClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ""
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdays.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  }
}

/**
 * ¿Estamos en horario de mercado regular (lun-vie, 09:45-16:00 ET)?
 * Los feriados no se detectan aquí: ese día Yahoo devuelve quotes vacías y la
 * toma la rechaza el control de calidad (quoteRatio).
 */
export function isMarketWindow(d: Date = new Date()): boolean {
  const { weekday, minutes } = nyClock(d)
  if (weekday < 1 || weekday > 5) return false
  return minutes >= WINDOW_OPEN_MIN && minutes < WINDOW_CLOSE_MIN
}

/** Días calendario entre dos fechas YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Timestamp de Yahoo (segundos, 00:00 UTC del vencimiento) → YYYY-MM-DD. */
export function expDateFromTs(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

/**
 * Elige los `max` vencimientos más próximos con DTE >= minDte respecto de
 * `today` (fecha NY). Descarta 0DTE/1DTE: en la toma valen casi solo theta.
 */
export function selectExpirations(
  expTs: number[], today: string, max = 2, minDte = MIN_DTE,
): number[] {
  return [...expTs]
    .sort((a, b) => a - b)
    .filter(ts => daysBetween(today, expDateFromTs(ts)) >= minDte)
    .slice(0, max)
}

/** Fracción de contratos con bid > 0 y ask > 0 (0 si no hay contratos). */
export function quoteRatio(contracts: { bid: number | null; ask: number | null }[]): number {
  if (contracts.length === 0) return 0
  const quoted = contracts.filter(c => (c.bid ?? 0) > 0 && (c.ask ?? 0) > 0).length
  return quoted / contracts.length
}

/**
 * taken_at compartido por todos los lotes de una corrida. El workflow lo
 * calcula una vez y lo pasa en cada lote; se acepta solo si es una fecha
 * válida, no futura y de las últimas 3 h. Si no, se usa `now`.
 */
export function resolveTakenAt(param: string | null, now: Date = new Date()): string {
  if (param) {
    const t = Date.parse(param)
    const age = now.getTime() - t
    if (Number.isFinite(t) && age >= -60_000 && age <= 3 * 3600_000) {
      return new Date(t).toISOString()
    }
  }
  return now.toISOString()
}
