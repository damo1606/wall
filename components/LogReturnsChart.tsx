"use client"

import { useEffect, useState } from "react"

type Props = {
  symbol: string
  /** Símbolo Yahoo si difiere del display (ej. macro-fx: `EURUSD` → `EURUSD=X`). */
  yahooSymbol?: string
  height?: number
  range?: string
}

type Point = { date: string; r: number }

/**
 * Serie de retornos logarítmicos diarios de un activo (2 años por defecto).
 * Útil como diagnóstico previo al modelado: clusters de volatilidad, outliers,
 * contexto histórico. Pura SVG, sin dependencias de charting.
 */
export function LogReturnsChart({ symbol, yahooSymbol, height = 200, range = "2y" }: Props) {
  const [returns, setReturns] = useState<Point[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    const ticker = (yahooSymbol ?? symbol).trim()
    if (!ticker) return
    let cancelled = false
    setLoading(true); setError("")
    fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(range)}`)
      .then(async r => {
        const j = await r.json()
        if (cancelled) return
        if (!r.ok || !Array.isArray(j.candles)) {
          setError(j.error ?? "Sin datos")
          setReturns(null)
          return
        }
        const candles: { time: string; close: number }[] = j.candles
        const out: Point[] = []
        for (let i = 1; i < candles.length; i++) {
          const a = candles[i - 1].close
          const b = candles[i].close
          if (a > 0 && b > 0) out.push({ date: candles[i].time, r: 100 * Math.log(b / a) })
        }
        setReturns(out)
      })
      .catch(() => { if (!cancelled) setError("Error al cargar datos") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, yahooSymbol, range])

  if (loading) {
    return <div className="text-gray-600 text-sm py-6 text-center animate-pulse">Cargando retornos...</div>
  }
  if (error || !returns) {
    return <div className="text-gray-600 text-sm py-4">Retornos no disponibles{error ? ` — ${error}` : ""}</div>
  }
  if (returns.length < 30) {
    return <div className="text-gray-600 text-sm py-4">Histórico insuficiente ({returns.length} puntos)</div>
  }

  // Estadísticas
  const n = returns.length
  const mean = returns.reduce((a, b) => a + b.r, 0) / n
  const variance = returns.reduce((a, b) => a + (b.r - mean) ** 2, 0) / Math.max(n - 1, 1)
  const sd = Math.sqrt(variance)
  const above2 = returns.filter(p => Math.abs(p.r) > 2 * sd).length
  const extremo = returns.reduce((m, p) => (Math.abs(p.r) > Math.abs(m) ? p.r : m), 0)

  // SVG
  const W = 640, H = height, PAD_L = 36, PAD_R = 8, PAD_T = 8, PAD_B = 18
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const maxAbs = Math.max(...returns.map(p => Math.abs(p.r))) || 1
  const yScale = (v: number) => PAD_T + innerH / 2 - (v / maxAbs) * (innerH / 2)
  const xScale = (i: number) => PAD_L + (i / Math.max(n - 1, 1)) * innerW
  const zeroY = yScale(0)

  // Ticks de año
  const yearTicks: { x: number; year: string }[] = []
  let lastYear = ""
  for (let i = 0; i < n; i++) {
    const y = returns[i].date.slice(0, 4)
    if (y !== lastYear) { yearTicks.push({ x: xScale(i), year: y }); lastYear = y }
  }

  const linePath = "M " + returns.map((p, i) => `${xScale(i)},${yScale(p.r)}`).join(" L ")

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-500 mb-1">
        <span>σ diaria <span className="font-mono text-gray-300">{sd.toFixed(2)}%</span></span>
        <span>|r| &gt; 2σ <span className="font-mono text-gray-300">{((above2 / n) * 100).toFixed(1)}%</span></span>
        <span>extremo <span className={`font-mono ${extremo >= 0 ? "text-green-400" : "text-red-400"}`}>{extremo >= 0 ? "+" : ""}{extremo.toFixed(2)}%</span></span>
        <span className="text-gray-700 ml-auto">{n} velas</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="#6b7280" strokeWidth={1} strokeDasharray="3 3" />
        <text x={2} y={PAD_T + 8}     fill="#6b7280" fontSize={10}>+{maxAbs.toFixed(0)}%</text>
        <text x={2} y={zeroY + 3}     fill="#6b7280" fontSize={10}>0</text>
        <text x={2} y={H - PAD_B + 2} fill="#6b7280" fontSize={10}>-{maxAbs.toFixed(0)}%</text>
        <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth={1} />
        {yearTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 4} fill="#6b7280" fontSize={9} textAnchor="middle">{t.year}</text>
        ))}
      </svg>
    </div>
  )
}
