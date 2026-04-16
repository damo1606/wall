// Diario de Operaciones — persistencia en localStorage

const KEY = "wall_diario"

export type TradeDirection = "LONG" | "SHORT" | "CALL" | "PUT"

export type TradeEntry = {
  id: string
  date: string           // "2026-04-16"
  symbol: string
  direction: TradeDirection
  entryPrice: number
  exitPrice?: number
  qty: number
  notes?: string
  // Contexto automático al momento de entrada
  signalAtEntry?: string  // "Compra Fuerte" | "Compra" | …
  macroPhase?: string     // "expansion" | "recovery" | …
  gexBias?: string        // "POSITIVO" | "NEGATIVO"
}

function read(): TradeEntry[] {
  if (typeof window === "undefined") return []
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") } catch { return [] }
}

function write(data: TradeEntry[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function getTrades(): TradeEntry[] {
  return read()
}

export function addTrade(entry: Omit<TradeEntry, "id">): TradeEntry {
  const item: TradeEntry = { ...entry, id: `${entry.symbol}-${Date.now()}` }
  write([item, ...read()])
  return item
}

export function closeTrade(id: string, exitPrice: number) {
  write(read().map(t => t.id === id ? { ...t, exitPrice } : t))
}

export function removeTrade(id: string) {
  write(read().filter(t => t.id !== id))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function tradeResult(t: TradeEntry): number | null {
  if (t.exitPrice === undefined) return null
  const diff = t.direction === "SHORT"
    ? (t.entryPrice - t.exitPrice) * t.qty
    : (t.exitPrice - t.entryPrice) * t.qty
  return diff
}

export function tradeResultPct(t: TradeEntry): number | null {
  if (t.exitPrice === undefined) return null
  return t.direction === "SHORT"
    ? ((t.entryPrice - t.exitPrice) / t.entryPrice) * 100
    : ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100
}
