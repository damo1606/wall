import { NextResponse } from "next/server"
import { fetchPriceHistory } from "@/lib/yahoo"
import { forecast } from "@/lib/forecast"
import { PAIRS } from "@/lib/forex"
import type { PairForecast } from "@/types/forex"

// 26 ajustes GARCH ≈ 2-4 s CPU; el caché diario lo amortiza.
export const revalidate = 86400
export const maxDuration = 60

const HORIZON = 20         // velas a proyectar
const BATCH = 6            // concurrencia acotada para no gatillar rate-limit de Yahoo

// Pronóstico de un par. Yahoo usa el sufijo `=X` para divisas (EURUSD=X).
async function forecastPair(pair: string): Promise<PairForecast | null> {
  try {
    const history = await fetchPriceHistory(`${pair}=X`, "2y")
    if (history.length < 70) return null
    const r = forecast(history.map(p => p.close), HORIZON)
    if (!r) return null
    return {
      score: r.score,
      expectedMovePct: r.expectedMovePct,
      dailyVol: r.volatility[0] ?? 0,
    }
  } catch {
    return null
  }
}

/**
 * Pronóstico ARIMA/GARCH de los 26 pares FX. Tercera dimensión de `/macro-fx`
 * junto a macro (FRED) y COT (CFTC). Devuelve { [pair]: PairForecast | null }.
 */
export async function GET() {
  const out: Record<string, PairForecast | null> = {}
  for (let i = 0; i < PAIRS.length; i += BATCH) {
    const slice = PAIRS.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(p => forecastPair(p.pair)))
    slice.forEach((p, j) => { out[p.pair] = results[j] })
  }
  return NextResponse.json(out)
}
