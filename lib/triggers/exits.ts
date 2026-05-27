import type { RotationStatus } from "./rotation"

export type ExitReason =
  | "TAKE_PROFIT" | "STOP_LOSS" | "REGIME_FLIP"
  | "SIGNAL_DEGRADED" | "TIME_EXIT" | "ROTATION_FLIP"

export type ExitContext = {
  entry_price: number
  entry_css: number | null         // soreCSS al abrir
  entry_rotation: RotationStatus   // rotation_status al abrir
  entry_date: string               // 'YYYY-MM-DD'
  current_price: number
  current_css: number | null
  current_rotation: RotationStatus
  current_m6_regime: string | null
  today: string                    // 'YYYY-MM-DD'
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a)
  return Math.floor(ms / 86_400_000)
}

const REGIMES_EXTREMOS = new Set(["PÁNICO AGUDO", "CRISIS SISTÉMICA"])

export const EXITS: Record<ExitReason, (ctx: ExitContext) => boolean> = {
  TAKE_PROFIT: (c) => {
    if (c.entry_price <= 0) return false
    const unrealizedPct = ((c.current_price - c.entry_price) / c.entry_price) * 100
    return unrealizedPct >= 25
  },

  STOP_LOSS: (c) => {
    if (c.entry_price <= 0) return false
    // Hard stop al 8% (constante v1; cuando se acople ATR vivirá en BD)
    return c.current_price <= c.entry_price * 0.92
  },

  REGIME_FLIP: (c) => c.current_m6_regime != null && REGIMES_EXTREMOS.has(c.current_m6_regime),

  SIGNAL_DEGRADED: (c) => {
    if (c.entry_css == null || c.current_css == null) return false
    return c.current_css - c.entry_css <= -20
  },

  TIME_EXIT: (c) => {
    if (c.entry_price <= 0) return false
    const days = daysBetween(c.entry_date, c.today)
    if (days <= 60) return false
    const unrealizedPct = ((c.current_price - c.entry_price) / c.entry_price) * 100
    return unrealizedPct < 5
  },

  ROTATION_FLIP: (c) => c.current_rotation === "AVOID" && c.entry_rotation !== "AVOID",
}

/** Devuelve el primer exit_reason que dispara, o null si ninguno. */
export function firstFiringExit(ctx: ExitContext, order: ExitReason[]): ExitReason | null {
  for (const reason of order) {
    try { if (EXITS[reason](ctx)) return reason } catch { /* ignore */ }
  }
  return null
}
