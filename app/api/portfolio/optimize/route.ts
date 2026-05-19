import { NextRequest, NextResponse } from "next/server"
import { fetchPriceHistory } from "@/lib/yahoo"
import { logReturns, markowitz, hrp, portfolioMetrics, correlationMatrix } from "@/lib/optimizer"

export const dynamic = "force-dynamic"

// Rango de Yahoo según los días de histórico solicitados.
function rangeForDays(days: number): string {
  if (days <= 130) return "6mo"
  if (days <= 260) return "1y"
  if (days <= 520) return "2y"
  return "5y"
}

/**
 * Optimizador de cartera. POST { symbols: string[], lookbackDays?: number }.
 * Descarga el histórico de cada símbolo, alinea por fechas comunes y devuelve
 * los pesos óptimos por Markowitz (máx. Sharpe + mín. volatilidad) y HRP.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawSymbols: unknown = body.symbols
    const symbols: string[] = Array.isArray(rawSymbols)
      ? [...new Set((rawSymbols as unknown[]).map(s => String(s).trim().toUpperCase()).filter(Boolean))]
      : []

    if (symbols.length < 2) {
      return NextResponse.json({ error: "Se necesitan al menos 2 símbolos" }, { status: 400 })
    }
    if (symbols.length > 30) {
      return NextResponse.json({ error: "Máximo 30 símbolos" }, { status: 400 })
    }

    const range = rangeForDays(Number(body.lookbackDays) || 365)
    const histories = await Promise.all(symbols.map(s => fetchPriceHistory(s, range)))

    // Símbolos con histórico suficiente.
    const ok: { symbol: string; map: Map<string, number> }[] = []
    const failed: string[] = []
    histories.forEach((h, i) => {
      if (h.length >= 30) ok.push({ symbol: symbols[i], map: new Map(h.map(p => [p.date, p.close])) })
      else failed.push(symbols[i])
    })
    if (ok.length < 2) {
      return NextResponse.json(
        { error: "Histórico insuficiente para optimizar", failed }, { status: 422 },
      )
    }

    // Fechas presentes en TODOS los símbolos válidos.
    let common = [...ok[0].map.keys()]
    for (const o of ok.slice(1)) common = common.filter(d => o.map.has(d))
    common.sort()
    if (common.length < 30) {
      return NextResponse.json(
        { error: "Pocas fechas comunes entre los símbolos", failed }, { status: 422 },
      )
    }

    const usedSymbols = ok.map(o => o.symbol)
    const returns = ok.map(o => logReturns(common.map(d => o.map.get(d)!)))

    const mk = markowitz(returns)
    const hrpWeights = hrp(returns)
    const hrpMetrics = portfolioMetrics(hrpWeights, returns)

    return NextResponse.json({
      symbols: usedSymbols,
      failed,
      observations: common.length,
      markowitz: { maxSharpe: mk.maxSharpe, minVol: mk.minVol },
      hrp: { weights: hrpWeights, ...hrpMetrics },
      correlationMatrix: correlationMatrix(returns),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 },
    )
  }
}
