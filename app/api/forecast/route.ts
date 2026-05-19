import { NextRequest, NextResponse } from "next/server"
import { fetchPriceHistory } from "@/lib/yahoo"
import { forecast } from "@/lib/forecast"

// Pronóstico estable a diario — el modelo no cambia intradía.
export const revalidate = 86400

/**
 * Pronóstico de precio AR(p) + GARCH(1,1).
 * GET ?symbol=AAPL&steps=30 → precio proyectado + banda de volatilidad 95%.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase()
  const steps = Math.min(Math.max(Number(req.nextUrl.searchParams.get("steps")) || 30, 5), 120)
  if (!symbol) {
    return NextResponse.json({ error: "symbol requerido" }, { status: 400 })
  }

  try {
    const history = await fetchPriceHistory(symbol, "2y")
    if (history.length < 70) {
      return NextResponse.json(
        { error: "Histórico insuficiente para pronosticar" }, { status: 422 },
      )
    }
    const result = forecast(history.map(p => p.close), steps)
    if (!result) {
      return NextResponse.json({ error: "No se pudo estimar el modelo" }, { status: 422 })
    }
    return NextResponse.json({ symbol, lastDate: history[history.length - 1].date, ...result })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 },
    )
  }
}
