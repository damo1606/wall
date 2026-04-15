// Portafolio, Lista de Seguimiento y Alertas — persistencia en localStorage

const KEYS = {
  portfolio: "descuentos-portfolio",
  watchlist: "descuentos-watchlist2",
  alerts:    "descuentos-alerts",
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PortfolioEntry = {
  id: string          // symbol + timestamp
  symbol: string
  company: string
  qty: number
  buyPrice: number
  buyDate: string     // "2026-04-06"
  notes?: string
}

export type WatchEntry = {
  symbol: string
  company: string
  addedAt: string
  targetPrice?: number
  notes?: string
}

export type AlertType =
  | "price_below"      // currentPrice <= threshold
  | "price_above"      // currentPrice >= threshold
  | "buy_ready"        // score.buyReady === true  (threshold ignorado)
  | "grade_min"        // GRADE_ORDER.indexOf(grade) >= threshold (0=F … 5=A+)
  | "drop_pct"         // dropFrom52w <= -threshold
  | "upside_pct"       // upsideToTarget >= threshold
  | "graham_discount"  // discountToGraham <= -threshold (precio X% bajo Graham Number)

export type Alert = {
  id: string
  symbol: string
  type: AlertType
  threshold: number
  label: string       // "AAPL < $180"
  active: boolean
  triggered: boolean
  triggeredAt?: string
  createdAt: string
}

export type AlertCheckInput = {
  symbol: string
  currentPrice: number
  dropFrom52w: number
  upsideToTarget: number
  grade: string
  buyReady: boolean
  discountToGraham?: number
}

// ─── Helpers de lectura / escritura ──────────────────────────────────────────

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") } catch { return [] }
}

function write<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(data))
}

// ─── Portafolio ───────────────────────────────────────────────────────────────

export function getPortfolio(): PortfolioEntry[] {
  return read<PortfolioEntry>(KEYS.portfolio)
}

export function addPosition(entry: Omit<PortfolioEntry, "id">): PortfolioEntry {
  const item: PortfolioEntry = { ...entry, id: `${entry.symbol}-${Date.now()}` }
  write(KEYS.portfolio, [...getPortfolio(), item])
  return item
}

export function removePosition(id: string) {
  write(KEYS.portfolio, getPortfolio().filter(e => e.id !== id))
}

// ─── Lista de Seguimiento ─────────────────────────────────────────────────────

export function getWatchEntries(): WatchEntry[] {
  return read<WatchEntry>(KEYS.watchlist)
}

export function addWatch(entry: Omit<WatchEntry, "addedAt">): WatchEntry {
  const item: WatchEntry = { ...entry, addedAt: new Date().toISOString().slice(0, 10) }
  const existing = getWatchEntries()
  if (existing.find(e => e.symbol === entry.symbol)) return item // ya existe
  write(KEYS.watchlist, [...existing, item])
  return item
}

export function removeWatch(symbol: string) {
  write(KEYS.watchlist, getWatchEntries().filter(e => e.symbol !== symbol))
}

export function isWatching(symbol: string): boolean {
  return getWatchEntries().some(e => e.symbol === symbol)
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

export function getAlerts(): Alert[] {
  return read<Alert>(KEYS.alerts)
}

export function addAlert(alert: Omit<Alert, "id" | "triggered" | "createdAt">): Alert {
  const item: Alert = {
    ...alert,
    id: `${alert.symbol}-${alert.type}-${Date.now()}`,
    triggered: false,
    createdAt: new Date().toISOString().slice(0, 10),
  }
  write(KEYS.alerts, [...getAlerts(), item])
  return item
}

export function removeAlert(id: string) {
  write(KEYS.alerts, getAlerts().filter(a => a.id !== id))
}

export function toggleAlertActive(id: string) {
  write(KEYS.alerts, getAlerts().map(a => a.id === id ? { ...a, active: !a.active } : a))
}

export function markTriggered(id: string) {
  write(KEYS.alerts, getAlerts().map(a =>
    a.id === id ? { ...a, triggered: true, triggeredAt: new Date().toISOString().slice(0, 10) } : a
  ))
}

export function resetAlert(id: string) {
  write(KEYS.alerts, getAlerts().map(a =>
    a.id === id ? { ...a, triggered: false, triggeredAt: undefined } : a
  ))
}

// ─── Verificar alertas ────────────────────────────────────────────────────────

const GRADE_ORDER = ["F", "D", "C", "B", "A", "A+"]

export function checkAlerts(
  alerts: Alert[],
  dataMap: Map<string, AlertCheckInput>
): string[] {
  // Devuelve IDs de alertas que se dispararon ahora
  const triggered: string[] = []
  for (const a of alerts) {
    if (!a.active || a.triggered) continue
    const d = dataMap.get(a.symbol)
    if (!d) continue
    let fires = false
    switch (a.type) {
      case "price_below":  fires = d.currentPrice <= a.threshold; break
      case "price_above":  fires = d.currentPrice >= a.threshold; break
      case "buy_ready":    fires = d.buyReady; break
      case "grade_min":    fires = GRADE_ORDER.indexOf(d.grade) >= a.threshold; break
      case "drop_pct":     fires = d.dropFrom52w <= -Math.abs(a.threshold); break
      case "upside_pct":     fires = d.upsideToTarget >= a.threshold; break
      case "graham_discount": fires = d.discountToGraham !== undefined && d.discountToGraham <= -Math.abs(a.threshold); break
    }
    if (fires) triggered.push(a.id)
  }
  return triggered
}

// ─── Helpers de UI ───────────────────────────────────────────────────────────

export function alertTypeLabel(type: AlertType): string {
  switch (type) {
    case "price_below":  return "Precio cae por debajo de"
    case "price_above":  return "Precio sube por encima de"
    case "buy_ready":    return "Buy Ready activado"
    case "grade_min":    return "Grado mínimo"
    case "drop_pct":     return "Caída desde máximos ≥"
    case "upside_pct":      return "Upside analistas ≥"
    case "graham_discount": return "Descuento vs Graham ≥"
  }
}

export function alertThresholdSuffix(type: AlertType): string {
  switch (type) {
    case "price_below":
    case "price_above":  return "$"
    case "buy_ready":    return ""
    case "grade_min":    return " (grado)"
    case "drop_pct":
    case "upside_pct":
    case "graham_discount": return "%"
  }
}

export function gradeToIndex(grade: string): number {
  return GRADE_ORDER.indexOf(grade)
}
export { GRADE_ORDER }
