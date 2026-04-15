"use client"

import { useState } from "react"
import Link from "next/link"
import { DJIA_SYMBOLS, SP500_SYMBOLS, NASDAQ100_SYMBOLS, RUSSELL_SYMBOLS } from "@/lib/symbols"
import type { StockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"
import type { ScoreBreakdown } from "@/lib/scoring"
import { runBrain } from "@/lib/brain"
import type { BrainOutput, MacroContext } from "@/lib/brain"
import { ErrorBoundary } from "../ErrorBoundary"

type Scored = StockData & { score: ScoreBreakdown; brain: BrainOutput }
type Signal = ScoreBreakdown["signal"]
type SortCol = "grade" | "quality" | "price" | "final" | "heat" | "drop" | "pfcf" | "graham" | "upside"

const GRADE_ORDER = ["F", "D", "C", "B", "A", "A+"]

function getSortValue(s: Scored, col: SortCol): number {
  switch (col) {
    case "grade":   return GRADE_ORDER.indexOf(s.score.grade)
    case "quality": return s.score.qualityScore
    case "price":   return s.score.priceScore
    case "final":   return s.score.finalScore
    case "heat":    return s.brain.sectorHeat
    case "drop":    return -s.dropFrom52w          // más negativo = mayor caída = valor más alto al ordenar
    case "pfcf":    return s.pFcf > 0 ? -s.pFcf : -999
    case "graham":  return s.discountToGraham
    case "upside":  return s.upsideToTarget
  }
}

const SIGNAL_ORDER: Signal[] = ["Compra Fuerte", "Compra", "Mantener", "Venta", "Venta Fuerte"]

const SIGNAL_STYLE: Record<Signal, {
  badge:   string
  header:  string
  border:  string
  icon:    string
  desc:    string
}> = {
  "Compra Fuerte": {
    badge:  "bg-emerald-500 text-white font-black",
    header: "text-emerald-400",
    border: "border-emerald-800/60",
    icon:   "▲▲",
    desc:   "Calidad alta + precio con descuento real + caída ≥15% desde máximos",
  },
  "Compra": {
    badge:  "bg-green-600 text-white font-bold",
    header: "text-green-400",
    border: "border-green-800/60",
    icon:   "▲",
    desc:   "Buen negocio a precio razonable — momento aceptable de entrada",
  },
  "Mantener": {
    badge:  "bg-gray-600 text-white font-medium",
    header: "text-gray-300",
    border: "border-gray-700/60",
    icon:   "●",
    desc:   "Posición neutral — ni urgencia de comprar ni razón para salir",
  },
  "Venta": {
    badge:  "bg-orange-600 text-white font-bold",
    header: "text-orange-400",
    border: "border-orange-800/60",
    icon:   "▼",
    desc:   "Relación riesgo/retorno desfavorable — reducir o salir",
  },
  "Venta Fuerte": {
    badge:  "bg-red-700 text-white font-black",
    header: "text-red-400",
    border: "border-red-800/60",
    icon:   "▼▼",
    desc:   "Deterioro severo o calidad baja + precio caro — salir",
  },
}

async function fetchStock(symbol: string, macro?: MacroContext): Promise<Scored | null> {
  try {
    const res = await fetch(`/api/stock/${symbol}`)
    if (!res.ok) return null
    const data: StockData = await res.json()
    const score = scoreStock(data)
    const brain = runBrain({ score, stock: data, macro })
    return { ...data, score, brain }
  } catch {
    return null
  }
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
}

function SignalBadge({ signal }: { signal: Signal }) {
  const s = SIGNAL_STYLE[signal]
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${s.badge}`}>
      {s.icon} {signal}
    </span>
  )
}

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "A+" ? "bg-emerald-500 text-white" :
    grade === "A"  ? "bg-green-600 text-white" :
    grade === "B"  ? "bg-blue-600 text-white" :
    grade === "C"  ? "bg-yellow-600 text-white" :
    grade === "D"  ? "bg-orange-600 text-white" :
    "bg-red-800 text-white"
  return <span className={`text-xs font-black px-2 py-0.5 rounded ${color}`}>{grade}</span>
}

export default function SenalesPage() {
  const [stocks, setStocks]     = useState<Scored[]>([])
  const [loading, setLoading]   = useState(false)
  const [ran, setRan]           = useState(false)
  const [progress, setProgress] = useState(0)
  const [universe, setUniverse] = useState<"dia" | "sp500" | "nasdaq" | "russell">("dia")
  const [filter, setFilter]     = useState<Signal | "Todas">("Todas")
  const [macroCtx, setMacroCtx] = useState<MacroContext | null>(null)
  const [sortBy, setSortBy]     = useState<SortCol>("final")
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc")

  function handleSort(col: SortCol) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc")
    else { setSortBy(col); setSortDir("desc") }
  }

  function sortItems(items: Scored[]): Scored[] {
    return [...items].sort((a, b) => {
      const cmp = getSortValue(a, sortBy) - getSortValue(b, sortBy)
      return sortDir === "desc" ? -cmp : cmp
    })
  }

  function SortTh({ col, label, align = "right" }: { col: SortCol; label: string; align?: string }) {
    const active = sortBy === col
    return (
      <th
        onClick={() => handleSort(col)}
        className={`px-3 py-2.5 text-${align} cursor-pointer select-none hover:text-gray-300 transition-colors ${active ? "text-white" : "text-gray-500"} uppercase tracking-wide text-xs`}
      >
        {label} <span className="text-[10px]">{active ? (sortDir === "desc" ? "▼" : "▲") : "↕"}</span>
      </th>
    )
  }

  async function run() {
    setLoading(true)
    setRan(false)
    setStocks([])
    setProgress(0)

    // Obtener contexto macro una sola vez antes del scan
    let macro: MacroContext | undefined
    try {
      const macroRes = await fetch("/api/macro")
      if (macroRes.ok) {
        const macroData = await macroRes.json()
        if (macroData?.detection?.phase) {
          macro = { phase: macroData.detection.phase, confidence: macroData.detection.confidence }
          setMacroCtx(macro)
        }
      }
    } catch { /* sin macro — el cerebro opera solo con fundamentales */ }

    const symbols =
      universe === "nasdaq"  ? NASDAQ100_SYMBOLS :
      universe === "russell" ? RUSSELL_SYMBOLS :
      universe === "sp500"   ? SP500_SYMBOLS.slice(0, 100) :
      DJIA_SYMBOLS

    const results: Scored[] = []
    let done = 0
    const batchSize = 5

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      const fetched = await Promise.all(batch.map(s => fetchStock(s, macro)))
      fetched.forEach(s => { if (s) results.push(s) })
      done += batch.length
      setProgress(Math.round((done / symbols.length) * 100))
    }

    setStocks(results)
    setLoading(false)
    setRan(true)
  }

  // Agrupar por señal del cerebro (finalSignal)
  const bySignal: Record<Signal, Scored[]> = {
    "Compra Fuerte": [],
    "Compra":        [],
    "Mantener":      [],
    "Venta":         [],
    "Venta Fuerte":  [],
  }
  for (const s of stocks) {
    bySignal[s.brain.finalSignal].push(s)
  }

  // El sort dinámico se aplica en render via sortItems()

  const visibleSignals = filter === "Todas"
    ? SIGNAL_ORDER
    : SIGNAL_ORDER.filter(s => s === filter)

  const totalCompras = bySignal["Compra Fuerte"].length + bySignal["Compra"].length
  const totalVentas  = bySignal["Venta"].length + bySignal["Venta Fuerte"].length

  return (
    <ErrorBoundary fallback="Error al cargar las señales">
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-full mx-auto px-2">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Señales de Trading</h1>
          <p className="text-gray-400 mt-1">
            Clasificación automática por calidad del negocio × atractivo del precio
          </p>
        </div>

        {/* Controles */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 flex flex-wrap gap-6 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Universo</label>
            <select
              value={universe}
              onChange={e => setUniverse(e.target.value as typeof universe)}
              className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none"
            >
              <option value="dia">DJIA (30)</option>
              <option value="sp500">S&P 500 (100)</option>
              <option value="nasdaq">NASDAQ 100</option>
              <option value="russell">Russell Top 50</option>
            </select>
          </div>

          <button
            onClick={run}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {loading ? `Analizando… ${progress}%` : "Analizar"}
          </button>

          {loading && (
            <div className="flex-1 min-w-[200px]">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {macroCtx && !loading && (
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className="text-gray-600">Cerebro activo —</span>
              <span className={`px-2 py-0.5 rounded font-semibold ${
                macroCtx.phase === "expansion" ? "bg-green-900/60 text-green-300" :
                macroCtx.phase === "recovery"  ? "bg-blue-900/60 text-blue-300"   :
                macroCtx.phase === "late"      ? "bg-amber-900/60 text-amber-300" :
                "bg-red-900/60 text-red-300"
              }`}>
                {macroCtx.phase === "expansion" ? "Expansión" :
                 macroCtx.phase === "recovery"  ? "Recuperación" :
                 macroCtx.phase === "late"      ? "Desaceleración" : "Recesión"}
              </span>
              <span className="text-gray-600">{macroCtx.confidence}% confianza</span>
            </div>
          )}
        </div>

        {/* Resumen de señales */}
        {ran && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {SIGNAL_ORDER.map(sig => {
              const s = SIGNAL_STYLE[sig]
              const count = bySignal[sig].length
              const pct = stocks.length > 0 ? Math.round(count / stocks.length * 100) : 0
              return (
                <button
                  key={sig}
                  onClick={() => setFilter(filter === sig ? "Todas" : sig)}
                  className={`rounded-xl border p-4 text-left transition-all ${s.border} ${
                    filter === sig
                      ? "bg-gray-800 ring-1 ring-white/20"
                      : "bg-gray-900 hover:bg-gray-800/70"
                  }`}
                >
                  <div className={`text-2xl font-black ${s.header}`}>{count}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{sig}</div>
                  <div className="text-xs text-gray-600 mt-1">{pct}% del total</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Distribución resumen */}
        {ran && stocks.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap gap-6 text-sm">
            <span className="text-gray-400">
              Total analizadas: <span className="text-white font-bold">{stocks.length}</span>
            </span>
            <span className={totalCompras > 0 ? "text-emerald-400" : "text-gray-500"}>
              Oportunidades de compra: <strong>{totalCompras}</strong>
            </span>
            <span className={totalVentas > 0 ? "text-red-400" : "text-gray-500"}>
              Señales de venta: <strong>{totalVentas}</strong>
            </span>
            {filter !== "Todas" && (
              <button
                onClick={() => setFilter("Todas")}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Ver todas
              </button>
            )}
          </div>
        )}

        {/* Tablas por señal */}
        {ran && visibleSignals.map(sig => {
          const items = sortItems(bySignal[sig])
          if (items.length === 0) return null
          const s = SIGNAL_STYLE[sig]

          return (
            <div key={sig} className={`mb-8 rounded-xl border ${s.border} overflow-hidden`}>
              {/* Header de grupo */}
              <div className={`px-5 py-3 bg-gray-900/80 border-b ${s.border} flex items-center justify-between`}>
                <div>
                  <span className={`text-lg font-black ${s.header}`}>{s.icon} {sig}</span>
                  <span className="ml-3 text-xs text-gray-500">{s.desc}</span>
                </div>
                <span className="text-xs text-gray-500">{items.length} empresa{items.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Tabla */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-900/60">
                      <th className="text-left px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wide">Empresa</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-500 uppercase tracking-wide">Sector</th>
                      <SortTh col="grade"   label="Grade" />
                      <SortTh col="quality" label="Calidad" />
                      <SortTh col="price"   label="Precio" />
                      <SortTh col="final"   label="Final" />
                      <SortTh col="heat"    label="Ciclo" />
                      <SortTh col="drop"    label="Caída 52w" />
                      <SortTh col="pfcf"    label="P/FCF" />
                      <SortTh col="graham"  label="Graham" />
                      <SortTh col="upside"  label="Upside" />
                      <th className="px-4 py-2.5 text-xs text-gray-500 uppercase tracking-wide">Razón</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {items.map(stock => {
                      const sc = stock.score
                      const br = stock.brain
                      const heatColor = br.sectorHeat >= 8 ? "text-emerald-400" : br.sectorHeat >= 5 ? "text-gray-400" : "text-red-400"
                      return (
                        <tr key={stock.symbol} className="hover:bg-gray-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/empresa/${stock.symbol}`}
                                className="font-bold text-blue-400 hover:text-blue-300"
                              >
                                {stock.symbol}
                              </Link>
                              {br.signalAdjusted && (
                                <span title={br.macroAdjustment ?? "Señal ajustada por ciclo macro"}
                                  className="text-[10px] bg-violet-900/60 text-violet-300 border border-violet-800/60 px-1 py-0.5 rounded font-bold">
                                  ⟳ macro
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate max-w-[140px]">{stock.company}</div>
                          </td>
                          <td className="px-3 py-3 text-gray-400 text-xs">{stock.sector}</td>
                          <td className="px-3 py-3 text-right"><GradeBadge grade={sc.grade} /></td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono font-bold ${sc.qualityScore >= 65 ? "text-emerald-400" : sc.qualityScore >= 45 ? "text-yellow-300" : "text-red-400"}`}>
                              {sc.qualityScore}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono font-bold ${sc.priceScore >= 55 ? "text-emerald-400" : sc.priceScore >= 35 ? "text-yellow-300" : "text-red-400"}`}>
                              {sc.priceScore}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-white font-bold">{sc.finalScore}</td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono font-bold ${heatColor}`} title={`Sector heat en fase actual: ${br.sectorHeat}/10`}>
                              {br.sectorHeat > 0 ? `${br.sectorHeat}/10` : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono font-bold ${stock.dropFrom52w <= -15 ? "text-green-400" : stock.dropFrom52w <= -5 ? "text-yellow-300" : "text-gray-400"}`}>
                              {stock.dropFrom52w.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-gray-300">
                            {stock.pFcf > 0 ? `${stock.pFcf.toFixed(1)}x` : "—"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono ${stock.discountToGraham >= 20 ? "text-green-400" : stock.discountToGraham >= 0 ? "text-yellow-300" : "text-red-400"}`}>
                              {pct(stock.discountToGraham)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`font-mono ${stock.upsideToTarget >= 20 ? "text-green-400" : stock.upsideToTarget >= 0 ? "text-yellow-300" : "text-red-400"}`}>
                              {stock.analystTarget > 0 ? pct(stock.upsideToTarget) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 max-w-[260px]">
                            {br.finalReason}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {ran && stocks.length === 0 && (
          <div className="text-center text-gray-500 py-16">No se encontraron datos para el universo seleccionado.</div>
        )}

      </div>
    </main>
    </ErrorBoundary>
  )
}
