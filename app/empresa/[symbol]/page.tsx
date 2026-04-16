"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useEffect, useState, useRef } from "react"
import type { StockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"
import type { ScoreBreakdown } from "@/lib/scoring"
import { analyzeForward } from "@/lib/forward"
import { ErrorBoundary } from "@/app/ErrorBoundary"
import type { ForwardAnalysis } from "@/lib/forward"
import { runBrain } from "@/lib/brain"
import type { BrainOutput, MacroContext } from "@/lib/brain"
import { addPosition, addWatch, addAlert, isWatching, getPortfolio } from "@/lib/portfolio"

type FullData = StockData & { score: ScoreBreakdown; forward: ForwardAnalysis; brain: BrainOutput }

function pct(v: number, dec = 1) { return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%` }
function usd(v: number) { return v > 0 ? `$${v.toFixed(2)}` : "—" }
function fmt(v: number, dec = 1) { return v !== 0 ? v.toFixed(dec) : "—" }

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "A+" ? "bg-emerald-500" :
    grade === "A"  ? "bg-green-600" :
    grade === "B"  ? "bg-blue-600" :
    grade === "C"  ? "bg-yellow-600" :
    grade === "D"  ? "bg-orange-600" :
    "bg-red-800"
  return <span className={`${color} text-white text-sm font-black px-3 py-1 rounded-lg`}>{grade}</span>
}

function PillarBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const color = value >= 70 ? "bg-green-500" : value >= 45 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label} <span className="text-gray-600">({weight})</span></span>
        <span className={`font-bold ${value >= 70 ? "text-green-400" : value >= 45 ? "text-yellow-400" : "text-red-400"}`}>{value}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function MetricRow({ label, value, good }: { label: string; value: string; good?: boolean | null }) {
  const color = good == null ? "text-gray-300" : good ? "text-green-400" : "text-red-400"
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-800/50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}

// ─── Gráfica de precio histórico ────────────────────────────────────────────

type ChartRange = "1mo" | "3mo" | "6mo" | "1y"

function calcMA(candles: { close: number; time: string }[], period: number) {
  return candles
    .map((c, i) => {
      if (i < period - 1) return null
      const val = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0) / period
      return { time: c.time, value: parseFloat(val.toFixed(2)) }
    })
    .filter(Boolean) as { time: string; value: number }[]
}

function PriceChart({ symbol, grahamNumber }: { symbol: string; grahamNumber: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<any>(null)
  const seriesRef    = useRef<any>(null)
  const ma50Ref      = useRef<any>(null)
  const ma200Ref     = useRef<any>(null)
  const [range,   setRange]   = useState<ChartRange>("3mo")
  const [loading, setLoading] = useState(true)
  const [ready,   setReady]   = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    let removed = false
    let observer: ResizeObserver | null = null

    import("lightweight-charts").then(({ createChart, ColorType, LineStyle }) => {
      if (removed || !containerRef.current) return
      const chart = createChart(containerRef.current, {
        layout: { background: { type: ColorType.Solid, color: "#030712" }, textColor: "#9ca3af" },
        grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
        width: containerRef.current.clientWidth,
        height: 320,
        rightPriceScale: { borderColor: "#374151" },
        timeScale: { borderColor: "#374151", fixLeftEdge: true, fixRightEdge: true },
      })
      const series = chart.addCandlestickSeries({
        upColor: "#10b981", downColor: "#ef4444",
        borderUpColor: "#10b981", borderDownColor: "#ef4444",
        wickUpColor: "#10b981", wickDownColor: "#ef4444",
      })
      if (grahamNumber > 0) {
        series.createPriceLine({
          price: grahamNumber, color: "#6ee7b7", lineWidth: 1,
          lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Graham",
        })
      }
      const ma50  = chart.addLineSeries({ color: "#f59e0b", lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })
      const ma200 = chart.addLineSeries({ color: "#8b5cf6", lineWidth: 1, priceLineVisible: false, crosshairMarkerVisible: false })

      chartRef.current  = chart
      seriesRef.current = series
      ma50Ref.current   = ma50
      ma200Ref.current  = ma200

      observer = new ResizeObserver(() => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
      })
      observer.observe(containerRef.current)
      setReady(true)
    })

    return () => {
      removed = true
      observer?.disconnect()
      chartRef.current?.remove()
      chartRef.current = null; seriesRef.current = null
      ma50Ref.current  = null; ma200Ref.current  = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/chart?ticker=${symbol}&range=${range}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled || !json?.candles || !seriesRef.current) return
        const candles: { time: string; open: number; high: number; low: number; close: number }[] = json.candles
        seriesRef.current.setData(candles)
        ma50Ref.current?.setData(calcMA(candles, 50))
        ma200Ref.current?.setData(calcMA(candles, 200))
        chartRef.current?.timeScale().fitContent()
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ready, range, symbol])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Precio Histórico</h2>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="text-amber-400">── MA50</span>
            <span className="text-violet-400">── MA200</span>
            {grahamNumber > 0 && <span className="text-emerald-400">-- Graham</span>}
          </div>
        </div>
        <div className="flex gap-1">
          {(["1mo", "3mo", "6mo", "1y"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${range === r ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              {r === "1mo" ? "1M" : r === "3mo" ? "3M" : r === "6mo" ? "6M" : "1A"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative" style={{ height: 320 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-gray-600 text-sm animate-pulse">Cargando gráfica...</div>
          </div>
        )}
        <div ref={containerRef} className={`transition-opacity duration-300 ${loading ? "opacity-0" : "opacity-100"}`} />
      </div>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function EmpresaPage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()
  const [data, setData] = useState<FullData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [inPortfolio, setInPortfolio] = useState(false)
  const [inWatch, setInWatch]         = useState(false)
  const [actionDone, setActionDone]   = useState<string | null>(null)
  const [fetchedAt,  setFetchedAt]    = useState<string | null>(null)
  const [news,       setNews]         = useState<{ title: string; publisher: string; link: string; publishedAt: string }[]>([])

  useEffect(() => {
    setInPortfolio(getPortfolio().some(e => e.symbol === symbol))
    setInWatch(isWatching(symbol))
  }, [symbol])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    // Fetch noticias en paralelo (no bloquea la carga principal)
    fetch(`/api/news/${symbol}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) setNews(d.items) })
      .catch(() => {})

    Promise.all([
      fetch(`/api/stock/${symbol}`, { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject()),
      fetch("/api/macro", { signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([raw, macroData]: [StockData & { fetchedAt?: string }, unknown]) => {
        const { fetchedAt: fa, ...d } = raw as StockData & { fetchedAt?: string }
        setFetchedAt(fa ?? null)
        const score   = scoreStock(d as StockData)
        const forward = analyzeForward(d)
        let macro: MacroContext | undefined
        const md = macroData as { detection?: { phase?: string; confidence?: number } } | null
        if (md?.detection?.phase) {
          macro = { phase: md.detection.phase as MacroContext["phase"], confidence: md.detection.confidence ?? 50 }
        }
        const brain = runBrain({ score, stock: d as StockData, macro, forward })
        setData({ ...(d as StockData), score, forward, brain })
      })
      .catch(err => { if (err.name !== "AbortError") setError(true) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [symbol])

  if (loading) return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 flex items-center justify-center">
      <div className="text-gray-400">Cargando {symbol}...</div>
    </main>
  )

  if (error || !data) return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 flex items-center justify-center">
      <div className="text-red-400">No se pudo obtener datos para {symbol}.</div>
    </main>
  )

  const { score, forward, brain } = data
  const de = data.debtToEquity / 100

  return (
    <ErrorBoundary fallback={`Error al cargar la empresa ${symbol}`}>
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-black text-white">{data.symbol}</h1>
                <GradeBadge grade={score.grade} />
              </div>
              <div className="text-gray-300 text-lg">{data.company}</div>
              <div className="text-gray-500 text-sm mt-1">{data.sector} · {data.industry}</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold font-mono text-white">${data.currentPrice.toFixed(2)}</div>
              <div className="text-sm text-gray-400 font-mono mt-1">
                Máx 52w: ${data.high52w.toFixed(2)}
                <span className={`ml-2 font-bold ${data.dropFrom52w <= -20 ? "text-green-400" : "text-yellow-300"}`}>
                  {data.dropFrom52w.toFixed(1)}%
                </span>
              </div>
              {data.analystTarget > 0 && (
                <div className="text-sm text-gray-400 mt-0.5">
                  Target: ${data.analystTarget.toFixed(2)}
                  <span className={`ml-2 font-bold ${data.upsideToTarget >= 20 ? "text-green-400" : "text-yellow-300"}`}>
                    {pct(data.upsideToTarget)}
                  </span>
                </div>
              )}
              {data.earningsDate && (() => {
                const days = Math.round((new Date(data.earningsDate).getTime() - Date.now()) / 86400000)
                if (days >= -7 && days <= 45) return (
                  <div className={`inline-flex items-center gap-1.5 text-xs font-bold mt-1.5 px-2 py-0.5 rounded ${
                    days <= 7 ? "bg-amber-900/60 text-amber-300 border border-amber-700/50" :
                    "bg-gray-800 text-gray-400 border border-gray-700"
                  }`}>
                    {days < 0 ? `📋 Reportó hace ${Math.abs(days)} días` :
                     days === 0 ? "📋 Earnings HOY" :
                     `📋 Earnings en ${days} días — ${data.earningsDate}`}
                  </div>
                )
                return null
              })()}
              {fetchedAt && (() => {
                const mins = Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000)
                return (
                  <div className={`text-xs mt-1 ${mins > 10 ? "text-amber-400 font-semibold" : "text-gray-700"}`}>
                    {mins > 10 ? "⚠ " : ""}Datos de hace {mins} min
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Gráfica histórica — visible al primer vistazo */}
        <PriceChart symbol={symbol} grahamNumber={data.grahamNumber} />

        {/* Acciones rápidas */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => {
              addPosition({ symbol, company: data.company, qty: 1, buyPrice: data.currentPrice, buyDate: new Date().toISOString().slice(0,10) })
              setInPortfolio(true)
              setActionDone("Agregado al portafolio")
              setTimeout(() => setActionDone(null), 2500)
            }}
            className={`text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors ${inPortfolio ? "border-blue-700 text-blue-400" : "border-gray-700 text-gray-400 hover:border-blue-700 hover:text-blue-300"}`}>
            {inPortfolio ? "✓ En portafolio" : "＋ Portafolio"}
          </button>
          <button
            onClick={() => {
              addWatch({ symbol, company: data.company })
              setInWatch(true)
              setActionDone("Agregado a seguimiento")
              setTimeout(() => setActionDone(null), 2500)
            }}
            disabled={inWatch}
            className={`text-sm px-4 py-1.5 rounded-lg border font-medium transition-colors ${inWatch ? "border-yellow-700 text-yellow-400" : "border-gray-700 text-gray-400 hover:border-yellow-700 hover:text-yellow-300"}`}>
            {inWatch ? "✓ En seguimiento" : "＋ Seguimiento"}
          </button>
          <button
            onClick={() => {
              addAlert({ symbol, type: "price_below", threshold: +(data.currentPrice * 0.9).toFixed(2), label: `${symbol} < $${(data.currentPrice * 0.9).toFixed(2)}`, active: true })
              setActionDone("Alerta creada (precio −10%)")
              setTimeout(() => setActionDone(null), 2500)
            }}
            className="text-sm px-4 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:border-orange-700 hover:text-orange-300 font-medium transition-colors">
            ＋ Alerta
          </button>
          <Link
            href={`/gex?ticker=${symbol}`}
            className="text-sm px-4 py-1.5 rounded-lg bg-emerald-800 text-emerald-200 hover:bg-emerald-700 font-medium transition-colors"
          >
            Ver Opciones →
          </Link>
          {actionDone && (
            <span className="text-sm text-green-400 px-3 py-1.5">{actionDone}</span>
          )}
        </div>

        {/* Buy Ready banner */}
        {score.buyReady && (
          <div className="bg-emerald-900/40 border border-emerald-700 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
            <span className="text-emerald-400 text-lg font-black">Compra</span>
            <span className="text-emerald-300 text-sm">Buy Score <strong>{score.buyScore}</strong> — calidad, precio y descuento de mercado confluyen</span>
          </div>
        )}

        {/* Veredicto */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <p className="text-gray-300 text-sm">{score.verdict}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {score.strengths.map((s, i) => (
              <span key={i} className="text-xs bg-green-900/40 text-green-300 border border-green-800/50 px-2 py-1 rounded">✓ {s}</span>
            ))}
            {score.weaknesses.map((w, i) => (
              <span key={i} className="text-xs bg-red-900/40 text-red-300 border border-red-800/50 px-2 py-1 rounded">✗ {w}</span>
            ))}
          </div>
        </div>

        {/* Veredicto del Cerebro */}
        {(() => {
          const signalColors: Record<string, { badge: string; border: string; header: string }> = {
            "Compra Fuerte": { badge: "bg-emerald-500 text-white", border: "border-emerald-800/60", header: "text-emerald-400" },
            "Compra":        { badge: "bg-green-600 text-white",   border: "border-green-800/60",   header: "text-green-400"   },
            "Mantener":      { badge: "bg-gray-600 text-white",    border: "border-gray-700/60",    header: "text-gray-300"    },
            "Venta":         { badge: "bg-orange-600 text-white",  border: "border-orange-800/60",  header: "text-orange-400"  },
            "Venta Fuerte":  { badge: "bg-red-700 text-white",     border: "border-red-800/60",     header: "text-red-400"     },
          }
          const sc = signalColors[brain.finalSignal] ?? signalColors["Mantener"]
          const fitIcon = brain.cycleFit === "tailwind" ? "↑" : brain.cycleFit === "headwind" ? "↓" : "→"
          const fitColor = brain.cycleFit === "tailwind" ? "text-emerald-400" : brain.cycleFit === "headwind" ? "text-red-400" : "text-gray-500"
          return (
            <div className={`rounded-xl border ${sc.border} bg-gray-900/80 p-4 mb-6`}>
              {/* Header del cerebro */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Veredicto del Cerebro</span>
                  {brain.signalAdjusted && (
                    <span className="text-[10px] bg-violet-900/60 text-violet-300 border border-violet-800/60 px-1.5 py-0.5 rounded font-bold">
                      ⟳ ajustado por ciclo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {brain.signalAdjusted && (
                    <span className="text-xs text-gray-600 line-through">{brain.baseSignal}</span>
                  )}
                  <span className={`text-sm font-black px-3 py-1 rounded-lg ${sc.badge}`}>
                    {brain.finalSignal}
                  </span>
                </div>
              </div>

              {/* Razón final */}
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">{brain.finalReason}</p>

              {/* Factores */}
              <div className="space-y-1.5">
                {brain.factors.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`shrink-0 text-xs font-bold mt-0.5 ${
                      f.impact === "positive" ? "text-emerald-400" :
                      f.impact === "negative" ? "text-red-400" : "text-gray-500"
                    }`}>
                      {f.impact === "positive" ? "▲" : f.impact === "negative" ? "▼" : "●"}
                    </span>
                    <div>
                      <span className="text-xs font-semibold text-gray-300">{f.name}: </span>
                      <span className="text-xs text-gray-500">{f.description}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer: ciclo + confianza */}
              <div className="mt-3 pt-3 border-t border-gray-800/60 flex flex-wrap items-center gap-4 text-xs">
                {brain.cycleFit !== "unknown" && (
                  <span className={`font-semibold ${fitColor}`}>
                    {fitIcon} Ciclo: {brain.cycleFit === "tailwind" ? "Viento de cola" : brain.cycleFit === "headwind" ? "Viento en contra" : "Neutral"} · Heat {brain.sectorHeat}/10
                  </span>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-gray-600">Confianza del cerebro</span>
                  <div className="w-24 bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${brain.confidence >= 75 ? "bg-emerald-500" : brain.confidence >= 55 ? "bg-yellow-500" : "bg-gray-500"}`}
                      style={{ width: `${brain.confidence}%` }}
                    />
                  </div>
                  <span className="font-mono font-bold text-gray-300">{brain.confidence}%</span>
                </div>
              </div>
            </div>
          )
        })()}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          {/* Scoring de calidad */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Calidad del Negocio</h2>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-white">{score.finalScore}</span>
                <GradeBadge grade={score.grade} />
              </div>
            </div>
            <div className="space-y-3">
              <PillarBar label="Eficiencia del Capital" value={score.capitalScore} weight="30%" />
              <PillarBar label="Ventaja Competitiva" value={score.moatScore} weight="30%" />
              <PillarBar label="Solidez Financiera" value={score.healthScore} weight="20%" />
              <PillarBar label="Precio / Valoración" value={score.priceScore} weight="20%" />
            </div>
            <div className="mt-3 text-xs text-gray-600">{score.sectorLabel} · {score.moatType} · CAP {score.capRange}</div>
            {(score.capSizeLabel === "Micro Cap" || score.capSizeLabel === "Small Cap") && (
              <div className="mt-1 text-xs font-semibold text-yellow-400">{score.capSizeLabel} — breakpoints ajustados</div>
            )}
          </div>

          {/* Prospectiva */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Prospectiva</h2>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-white">{forward.forwardScore}</span>
                <span className={`text-sm font-black px-2 py-0.5 rounded ${
                  forward.forwardGrade === "A+" ? "bg-emerald-500 text-white" :
                  forward.forwardGrade === "A"  ? "bg-green-600 text-white" :
                  forward.forwardGrade === "B"  ? "bg-blue-600 text-white" :
                  forward.forwardGrade === "C"  ? "bg-yellow-600 text-white" :
                  "bg-orange-600 text-white"
                }`}>{forward.forwardGrade}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Etapa</span>
                <span style={{ color: forward.growthStageColor }} className="font-semibold">{forward.growthStageLabel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Earnings</span>
                <span style={{ color: forward.earningsDirectionColor }} className="font-semibold">{forward.earningsDirectionLabel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Apal. operativo</span>
                <span className="text-gray-300 font-semibold">{forward.operatingLeverageLabel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Señal moat</span>
                <span style={{ color: forward.capSignalColor }} className="font-semibold">{forward.capSignalLabel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Riesgo disrupción</span>
                <span className={`font-semibold ${forward.disruption.risk >= 4 ? "text-red-400" : forward.disruption.risk >= 3 ? "text-yellow-400" : "text-green-400"}`}>
                  {forward.disruption.label} ({forward.disruption.risk}/5)
                </span>
              </div>
            </div>
            {forward.signals.length > 0 && (
              <div className="mt-3 space-y-1">
                {forward.signals.slice(0, 3).map((s, i) => (
                  <div key={i} className="text-xs text-gray-500">· {s}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Métricas clave */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Valoración */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Valoración</h2>
            <MetricRow label="P/E (trailing)" value={data.pe > 0 ? data.pe.toFixed(1) : "—"} />
            <MetricRow label="P/E (forward)" value={data.forwardPe > 0 ? data.forwardPe.toFixed(1) : "—"} />
            <MetricRow label="P/B" value={data.pb > 0 ? data.pb.toFixed(1) : "—"} />
            <MetricRow label="EV/EBITDA" value={data.evToEbitda > 0 ? data.evToEbitda.toFixed(1) : "—"} />
            <MetricRow label="P/FCF" value={data.pFcf > 0 ? data.pFcf.toFixed(1) : "—"} good={data.pFcf > 0 && data.pFcf < 20} />
            <MetricRow label="Graham #" value={data.grahamNumber > 0 ? usd(data.grahamNumber) : "—"} />
            <MetricRow label="vs Graham" value={data.grahamNumber > 0 ? pct(data.discountToGraham) : "—"} good={data.grahamNumber > 0 ? data.discountToGraham >= 0 : null} />
          </div>

          {/* Rentabilidad */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Rentabilidad</h2>
            <MetricRow label="ROIC" value={data.roic > 0 ? pct(data.roic * 100) : "—"} good={data.roic > 0.12} />
            <MetricRow label="ROE" value={data.roe !== 0 ? pct(data.roe * 100) : "—"} good={data.roe >= 0.15} />
            <MetricRow label="ROA" value={data.roa !== 0 ? pct(data.roa * 100) : "—"} good={data.roa >= 0.08} />
            <MetricRow label="Margen bruto" value={data.grossMargin !== 0 ? pct(data.grossMargin * 100) : "—"} good={data.grossMargin >= 0.4} />
            <MetricRow label="Margen operativo" value={data.operatingMargin !== 0 ? pct(data.operatingMargin * 100) : "—"} good={data.operatingMargin >= 0.15} />
            <MetricRow label="Margen neto" value={data.netMargin !== 0 ? pct(data.netMargin * 100) : "—"} good={data.netMargin >= 0.1} />
            <MetricRow label="FCF Margin" value={data.fcfMargin !== 0 ? pct(data.fcfMargin * 100) : "—"} good={data.fcfMargin >= 0.1} />
          </div>

          {/* Crecimiento y balance */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Crecimiento y Balance</h2>
            <MetricRow label="Crec. ingresos" value={data.revenueGrowth !== 0 ? pct(data.revenueGrowth * 100) : "—"} good={data.revenueGrowth >= 0.08} />
            <MetricRow label="Crec. EPS" value={data.earningsGrowth !== 0 ? pct(data.earningsGrowth * 100) : "—"} good={data.earningsGrowth >= 0.1} />
            <MetricRow label="D/E" value={de !== 0 ? de.toFixed(2) : "—"} good={de <= 1} />
            <MetricRow label="Market Cap" value={data.marketCap > 1e9 ? `$${(data.marketCap / 1e9).toFixed(1)}B` : data.marketCap > 1e6 ? `$${(data.marketCap / 1e6).toFixed(0)}M` : "—"} />
            <MetricRow label="Beta" value={data.beta !== 0 ? data.beta.toFixed(2) : "—"} good={data.beta < 1.2} />
            {data.isDividendPayer && <>
              <MetricRow label="Dividendo" value={data.dividendYield > 0 ? pct(data.dividendYield) : "—"} good={data.dividendYield > 0} />
              <MetricRow label="Payout ratio" value={data.payoutRatio > 0 ? pct(data.payoutRatio * 100) : "—"} good={data.payoutRatio < 0.6} />
            </>}
          </div>
        </div>

        {/* Noticias */}
        {news.length > 0 && (
          <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Noticias recientes</h2>
            <div className="space-y-3">
              {news.map((n, i) => {
                const mins = Math.round((Date.now() - new Date(n.publishedAt).getTime()) / 60000)
                const age  = mins < 60 ? `hace ${mins}m` :
                             mins < 1440 ? `hace ${Math.round(mins / 60)}h` :
                             `hace ${Math.round(mins / 1440)}d`
                return (
                  <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-3 group hover:bg-gray-800/50 rounded-lg p-2 -mx-2 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 group-hover:text-white transition-colors leading-snug line-clamp-2">
                        {n.title}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">{n.publisher} · {age}</div>
                    </div>
                    <div className="text-gray-600 group-hover:text-gray-400 transition-colors shrink-0 text-sm">→</div>
                  </a>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </main>
    </ErrorBoundary>
  )
}
