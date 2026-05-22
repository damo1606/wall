import { NextResponse } from "next/server"
import { fetchPriceHistory } from "@/lib/yahoo"
import { forecast } from "@/lib/forecast"
import { analyzeMarkov } from "@/lib/markov"
import { PAIRS } from "@/lib/forex"
import type { PairForecast, PairMarkov } from "@/types/forex"

// 26 ajustes GARCH ≈ 2-4 s CPU; el caché diario lo amortiza.
export const revalidate = 86400
export const maxDuration = 60

const HORIZON = 20         // velas a proyectar
const BATCH = 6            // concurrencia acotada para no gatillar rate-limit de Yahoo

type PairStats = PairForecast & { markov: PairMarkov | null }

// Pronóstico ARIMA/GARCH + régimen Markov de un par. Yahoo usa el sufijo `=X`
// para divisas (EURUSD=X). Ambos modelos se calculan del mismo histórico.
async function analyzePair(pair: string): Promise<PairStats | null> {
  try {
    const history = await fetchPriceHistory(`${pair}=X`, "2y")
    if (history.length < 70) return null
    const closes = history.map(p => p.close)
    const r = forecast(closes, HORIZON)
    if (!r) return null
    return {
      score: r.score,
      expectedMovePct: r.expectedMovePct,
      dailyVol: r.volatility[0] ?? 0,
      markov: analyzeMarkov(closes),
    }
  } catch {
    return null
  }
}

/**
 * Motor estadístico por par de `/macro-fx`: pronóstico ARIMA/GARCH + régimen
 * de Markov de los 26 pares FX. Dimensiones 3 y 4 junto a macro (FRED) y COT.
 * Devuelve { [pair]: PairStats | null }.
 */
export async function GET() {
  const out: Record<string, PairStats | null> = {}
  for (let i = 0; i < PAIRS.length; i += BATCH) {
    const slice = PAIRS.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(p => analyzePair(p.pair)))
    slice.forEach((p, j) => { out[p.pair] = results[j] })
  }
  return NextResponse.json(out)
}
