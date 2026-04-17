// Portafolio, Lista de Seguimiento y Alertas — persistencia en Supabase via API routes

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

export const WATCH_LIMIT = 15

// ─── Portafolio ───────────────────────────────────────────────────────────────

export async function getPortfolio(): Promise<PortfolioEntry[]> {
  try {
    const res = await fetch("/api/portfolio")
    if (!res.ok) return []
    const rows = await res.json()
    return rows.map((r: any): PortfolioEntry => ({
      id:       r.id,
      symbol:   r.symbol,
      company:  r.company ?? "",
      qty:      Number(r.qty),
      buyPrice: Number(r.buy_price),
      buyDate:  r.buy_date ?? "",
      notes:    r.notes ?? undefined,
    }))
  } catch { return [] }
}

export async function addPosition(entry: Omit<PortfolioEntry, "id">): Promise<PortfolioEntry> {
  const res = await fetch("/api/portfolio", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      symbol:    entry.symbol,
      company:   entry.company,
      qty:       entry.qty,
      buy_price: entry.buyPrice,
      buy_date:  entry.buyDate || null,
      notes:     entry.notes,
    }),
  })
  const row = await res.json()
  return { id: row.id, symbol: row.symbol, company: row.company ?? "", qty: Number(row.qty), buyPrice: Number(row.buy_price), buyDate: row.buy_date ?? "", notes: row.notes }
}

export async function removePosition(id: string): Promise<void> {
  await fetch(`/api/portfolio?id=${id}`, { method: "DELETE" })
}

// ─── Lista de Seguimiento ─────────────────────────────────────────────────────

export async function getWatchEntries(): Promise<WatchEntry[]> {
  try {
    const res = await fetch("/api/watchlist")
    if (!res.ok) return []
    const rows = await res.json()
    return rows.map((r: any): WatchEntry => ({
      symbol:      r.symbol,
      company:     r.company ?? "",
      addedAt:     r.added_at?.slice(0, 10) ?? "",
      targetPrice: r.target_price ? Number(r.target_price) : undefined,
      notes:       r.notes ?? undefined,
    }))
  } catch { return [] }
}

export async function addWatch(entry: Omit<WatchEntry, "addedAt">): Promise<WatchEntry> {
  const res = await fetch("/api/watchlist", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ symbol: entry.symbol, company: entry.company, target_price: entry.targetPrice, notes: entry.notes }),
  })
  const row = await res.json()
  return { symbol: row.symbol, company: row.company ?? "", addedAt: row.added_at?.slice(0, 10) ?? "", targetPrice: row.target_price ? Number(row.target_price) : undefined }
}

export async function removeWatch(symbol: string): Promise<void> {
  await fetch(`/api/watchlist?symbol=${symbol}`, { method: "DELETE" })
}

export async function isWatching(symbol: string): Promise<boolean> {
  const list = await getWatchEntries()
  return list.some(e => e.symbol === symbol)
}

// ─── Alertas ──────────────────────────────────────────────────────────────────

export async function getAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch("/api/alerts")
    if (!res.ok) return []
    const rows = await res.json()
    return rows.map((r: any): Alert => ({
      id:          r.id,
      symbol:      r.symbol,
      type:        r.type as AlertType,
      threshold:   Number(r.threshold ?? 0),
      label:       r.label ?? "",
      active:      r.active ?? true,
      triggered:   r.triggered ?? false,
      triggeredAt: r.triggered_at?.slice(0, 10),
      createdAt:   r.created_at?.slice(0, 10) ?? "",
    }))
  } catch { return [] }
}

export async function addAlert(alert: Omit<Alert, "id" | "triggered" | "createdAt">): Promise<Alert> {
  const res = await fetch("/api/alerts", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ symbol: alert.symbol, type: alert.type, label: alert.label, threshold: alert.threshold }),
  })
  const row = await res.json()
  return { id: row.id, symbol: row.symbol, type: row.type, threshold: Number(row.threshold ?? 0), label: row.label ?? "", active: row.active ?? true, triggered: false, createdAt: row.created_at?.slice(0, 10) ?? "" }
}

export async function removeAlert(id: string): Promise<void> {
  await fetch(`/api/alerts?id=${id}`, { method: "DELETE" })
}

export async function toggleAlertActive(id: string, current: boolean): Promise<void> {
  await fetch(`/api/alerts?id=${id}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ active: !current }),
  })
}

export async function markTriggered(id: string): Promise<void> {
  await fetch(`/api/alerts?id=${id}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ triggered: true, triggered_at: new Date().toISOString() }),
  })
}

export async function resetAlert(id: string): Promise<void> {
  await fetch(`/api/alerts?id=${id}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ triggered: false, triggered_at: null }),
  })
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
