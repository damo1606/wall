// Reglas puras del cron de option_chains: ventana de mercado, filtro de
// vencimientos y control de calidad. Sin I/O para poder testearlas.

/** Inicio y fin de la ventana de toma, en minutos desde medianoche NY. */
export const WINDOW_OPEN_MIN  = 9 * 60 + 45   // 09:45 ET: 15 min tras la apertura, quotes ya estables
export const WINDOW_CLOSE_MIN = 16 * 60       // 16:00 ET: cierre regular
export const EARLY_CLOSE_MIN  = 13 * 60       // 13:00 ET: cierre en medio día
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

// ── Calendario NYSE ─────────────────────────────────────────────────────────
// Los feriados SÍ hay que detectarlos aquí: ese día Yahoo deja congeladas las
// quotes del último cierre (bid/ask > 0), así que el control de calidad no los
// rechaza. Revisar cada año contra el calendario oficial:
// https://www.nyse.com/markets/hours-calendars

/** Días con la bolsa cerrada (America/New_York). */
export const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  // 2028 (sin feriado de Año Nuevo: el 1 de enero cae sábado)
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
  "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
])

/** Medios días: la bolsa cierra a las 13:00 ET. */
export const NYSE_EARLY_CLOSES: ReadonlySet<string> = new Set([
  "2026-11-27", "2026-12-24",
  "2027-11-26",
  "2028-07-03", "2028-11-24",
])

/** Último año cubierto por las tablas de arriba (verificado 2026-11-27). */
export const NYSE_CALENDAR_LAST_YEAR = 2028

export type MarketWindowStatus =
  | { open: true; closeMin: number }
  | { open: false; reason: "weekend" | "holiday" | "outside_hours" }

/**
 * Estado de la ventana de toma: lun-vie hábil NYSE, de 09:45 al cierre
 * (16:00 ET, o 13:00 ET en medio día).
 */
export function marketWindowStatus(d: Date = new Date()): MarketWindowStatus {
  const { date, weekday, minutes } = nyClock(d)
  if (weekday < 1 || weekday > 5) return { open: false, reason: "weekend" }
  if (NYSE_HOLIDAYS.has(date)) return { open: false, reason: "holiday" }
  const closeMin = NYSE_EARLY_CLOSES.has(date) ? EARLY_CLOSE_MIN : WINDOW_CLOSE_MIN
  if (minutes < WINDOW_OPEN_MIN || minutes >= closeMin) return { open: false, reason: "outside_hours" }
  return { open: true, closeMin }
}

/** ¿Estamos dentro de la ventana de toma? */
export function isMarketWindow(d: Date = new Date()): boolean {
  return marketWindowStatus(d).open
}

/** true si el calendario NYSE de este módulo no cubre el año de `d`. */
export function calendarOutdated(d: Date = new Date()): boolean {
  return Number(nyClock(d).date.slice(0, 4)) > NYSE_CALENDAR_LAST_YEAR
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
