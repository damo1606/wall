"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DJIA_SYMBOLS, SP500_SYMBOLS, NASDAQ100_SYMBOLS, RUSSELL_SYMBOLS, RUSSELL2000_SYMBOLS, QUANTUM_SYMBOLS, BIOTECH_SMALL_SYMBOLS, TECH_SMALL_SYMBOLS, CONSUMER_SMALL_SYMBOLS } from "@/lib/symbols"
import type { StockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"
import type { ScoreBreakdown } from "@/lib/scoring"
import { ErrorBoundary } from "./ErrorBoundary"

type Scored = StockData & { score: ScoreBreakdown }

type Phase = "recovery" | "expansion" | "late" | "recession"

// Sectores favorecidos (score >= 7) por fase — Yahoo Finance names
const PHASE_SECTORS: Record<Phase, string[]> = {
  recovery:  ["Financial Services", "Consumer Cyclical", "Industrials", "Real Estate"],
  expansion: ["Technology", "Financial Services", "Consumer Cyclical", "Industrials", "Communication Services", "Basic Materials"],
  late:      ["Energy", "Basic Materials", "Healthcare", "Consumer Defensive"],
  recession: ["Healthcare", "Consumer Defensive", "Utilities"],
}

const PHASE_LABELS: Record<Phase, { label: string; color: string; badge: string }> = {
  recovery:  { label: "Recuperación", color: "text-blue-400",   badge: "bg-blue-900/60 border-blue-800 text-blue-200" },
  expansion: { label: "Expansión",    color: "text-green-400",  badge: "bg-green-900/60 border-green-800 text-green-200" },
  late:      { label: "Desaceleración", color: "text-amber-400", badge: "bg-amber-900/60 border-amber-800 text-amber-200" },
  recession: { label: "Recesión",     color: "text-red-400",    badge: "bg-red-900/60 border-red-800 text-red-200" },
}

async function fetchStock(symbol: string): Promise<Scored | null> {
  try {
    const res = await fetch(`/api/stock/${symbol}`)
    if (!res.ok) return null
    const data: StockData = await res.json()
    return { ...data, score: scoreStock(data) }
  } catch {
    return null
  }
}

function pct(v: number, decimals = 1) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`
}

function fmt(v: number, decimals = 1) {
  return v > 0 ? v.toFixed(decimals) : "—"
}

function DropBadge({ value }: { value: number }) {
  const color =
    value <= -30 ? "text-green-400" :
    value <= -15 ? "text-yellow-300" :
    "text-gray-400"
  return <span className={`font-bold font-mono ${color}`}>{value.toFixed(1)}%</span>
}

function UpBadge({ value }: { value: number }) {
  const color = value >= 20 ? "text-green-400" : value >= 0 ? "text-yellow-300" : "text-red-400"
  return <span className={`font-bold font-mono ${color}`}>{pct(value)}</span>
}

function GrahamBadge({ value }: { value: number }) {
  const color = value >= 20 ? "text-green-400" : value >= 0 ? "text-yellow-300" : "text-red-400"
  return <span className={`font-bold font-mono ${color}`}>{pct(value)}</span>
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

export default function Home() {
  const [stocks, setStocks]           = useState<Scored[]>([])
  const [loading, setLoading]         = useState(false)
  const [ran, setRan]                 = useState(false)
  const [progress, setProgress]       = useState(0)
  const [fetchedCount, setFetchedCount] = useState(0)
  const [universe, setUniverse]       = useState<"dia" | "sp500" | "nasdaq" | "russell" | "r2000" | "quantum" | "biotech-small" | "tech-small" | "consumer-small">("dia")
  const [limit, setLimit]             = useState(50)
  type SortCol = "symbol" | "grade" | "buy" | "sector" | "price" | "drop" | "graham" | "upside" | "pe" | "pb" | "roe" | "de" | "eps"
  const [sortBy, setSortBy]           = useState<SortCol>("drop")
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("asc")
  const [phase, setPhase]             = useState<Phase | null>(null)
  const [phaseConf, setPhaseConf]     = useState<number>(0)
  const [filterByCycle, setFilterByCycle] = useState(false)
  const [watchlist, setWatchlist]     = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try { return new Set(JSON.parse(localStorage.getItem("descuentos-watchlist") ?? "[]")) } catch { return new Set() }
  })
  const [showWatchlist, setShowWatchlist] = useState(false)

  function toggleWatch(symbol: string) {
    setWatchlist(prev => {
      const next = new Set(prev)
      next.has(symbol) ? next.delete(symbol) : next.add(symbol)
      localStorage.setItem("descuentos-watchlist", JSON.stringify([...next]))
      return next
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/macro", { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.phase) { setPhase(d.phase.phase); setPhaseConf(d.phase.confidence) }
      })
      .catch(err => { if (err.name !== "AbortError") console.warn("[macro]", err) })
    return () => controller.abort()
  }, [])

  async function runScreener() {
    setLoading(true)
    setRan(false)
    setStocks([])
    setProgress(0)
    setFetchedCount(0)

    const symbols =
      universe === "dia"           ? DJIA_SYMBOLS :
      universe === "nasdaq"        ? NASDAQ100_SYMBOLS :
      universe === "russell"       ? RUSSELL_SYMBOLS :
      universe === "r2000"         ? RUSSELL2000_SYMBOLS :
      universe === "quantum"       ? QUANTUM_SYMBOLS :
      universe === "biotech-small" ? BIOTECH_SMALL_SYMBOLS :
      universe === "tech-small"    ? TECH_SMALL_SYMBOLS :
      universe === "consumer-small"? CONSUMER_SMALL_SYMBOLS :
      SP500_SYMBOLS.slice(0, limit)
    const results: Scored[] = []
    let done = 0

    const batchSize = 5
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      const fetched = await Promise.all(batch.map(fetchStock))
      fetched.forEach((s) => { if (s) results.push(s) })
      done += batch.length
      setProgress(Math.round((done / symbols.length) * 100))
      setFetchedCount(results.length)
    }

    setStocks(results)
    setLoading(false)
    setRan(true)
  }

  function getSortValue(s: Scored, col: SortCol): number | string {
    const GRADE_ORDER = ["F","D","C","B","A","A+"]
    switch (col) {
      case "symbol":  return s.symbol
      case "sector":  return s.sector
      case "grade":   return GRADE_ORDER.indexOf(s.score.grade)
      case "buy":     return s.score.buyScore
      case "price":   return s.currentPrice
      case "drop":    return s.dropFrom52w
      case "graham":  return s.discountToGraham
      case "upside":  return s.upsideToTarget
      case "pe":      return s.pe
      case "pb":      return s.pb
      case "roe":     return s.roe * 100
      case "de":      return s.debtToEquity / 100
      case "eps":     return s.earningsGrowth * 100
    }
  }

  function handleSort(col: SortCol) {
    if (sortBy === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc")
    } else {
      setSortBy(col)
      setSortDir("desc")
    }
  }

  return (
    <ErrorBoundary fallback="Error al cargar el screener">
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-full mx-auto px-2">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Descuentos</h1>
          <p className="text-gray-400 mt-1">Empresas de calidad castigadas por el mercado — Yahoo Finance</p>
        </div>

        {/* Filtros */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 flex flex-wrap gap-6 items-end">

          <div>
            <label className="block text-xs text-gray-400 mb-1">Universo</label>
            <select
              value={universe}
              onChange={(e) => { setUniverse(e.target.value as typeof universe); setStocks([]); setRan(false) }}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
            >
              <optgroup label="Large &amp; Mid Cap">
                <option value="dia">Dow Jones 30</option>
                <option value="sp500">S&P 500</option>
                <option value="nasdaq">Nasdaq 100</option>
                <option value="russell">Russell 1000</option>
              </optgroup>
              <optgroup label="Small &amp; Micro Cap">
                <option value="r2000">Russell 2000</option>
                <option value="quantum">Quantum / DeepTech</option>
                <option value="biotech-small">Biotech Small Cap</option>
                <option value="tech-small">Tech Small Cap</option>
                <option value="consumer-small">Consumo Básico Small</option>
              </optgroup>
            </select>
            {["r2000","quantum","biotech-small","tech-small","consumer-small"].includes(universe) && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-yellow-900/60 border border-yellow-700 text-yellow-300">
                Micro / Small Cap — breakpoints ajustados
              </span>
            )}
          </div>

          {universe === "sp500" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Acciones</label>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          )}

          {phase && (
            <div className="flex items-center gap-2">
              <label className="block text-xs text-gray-400 mb-1 w-full">Ciclo</label>
              <div className="flex items-center gap-2 mt-[-4px]">
                <span className={`text-xs font-semibold border px-2 py-1 rounded ${PHASE_LABELS[phase].badge}`}>
                  {PHASE_LABELS[phase].label} {phaseConf}%
                </span>
                <button
                  onClick={() => setFilterByCycle(v => !v)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${filterByCycle ? "bg-blue-700 border-blue-600 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}
                >
                  {filterByCycle ? "✓ Filtrado" : "Filtrar"}
                </button>
              </div>
            </div>
          )}

          {watchlist.size > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Watchlist</label>
              <button
                onClick={() => setShowWatchlist(v => !v)}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${showWatchlist ? "bg-yellow-700 border-yellow-600 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}
              >
                ★ {watchlist.size} guardadas{showWatchlist ? " (mostrando)" : ""}
              </button>
            </div>
          )}

          <button onClick={runScreener} disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
            {loading ? `Consultando... ${progress}%` : "Buscar descuentos"}
          </button>
        </div>

        {/* Estado */}
        {loading && fetchedCount > 0 && (
          <div className="text-sm text-gray-400 mb-4">
            {fetchedCount} acciones obtenidas...
          </div>
        )}

        {ran && !loading && stocks.length === 0 && fetchedCount === 0 && (
          <div className="text-center py-20">
            <p className="text-red-400 font-semibold">No se pudo obtener datos de Yahoo Finance.</p>
            <p className="text-gray-500 text-sm mt-2">Intenta de nuevo en unos segundos.</p>
          </div>
        )}

        {/* Top 5 Oportunidades */}
        {stocks.length > 0 && (() => {
          const top5 = stocks
            .filter(s => s.score.signal === "Compra Fuerte" || s.score.signal === "Compra")
            .sort((a, b) => b.score.finalScore - a.score.finalScore)
            .slice(0, 5)
          if (top5.length === 0) return null
          return (
            <div className="mb-6">
              <div className="text-xs text-gray-500 tracking-widest font-bold mb-3">TOP OPORTUNIDADES</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {top5.map(s => (
                  <Link
                    key={s.symbol}
                    href={`/empresa/${s.symbol}`}
                    className="shrink-0 w-44 bg-gray-900 border border-gray-700 rounded-xl p-4 hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-black text-sm">{s.symbol}</span>
                      <GradeBadge grade={s.score.grade} />
                    </div>
                    <div className="text-white font-mono font-bold">
                      ${s.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs font-mono mt-1 ${s.discountToGraham <= -10 ? "text-green-400" : s.discountToGraham >= 0 ? "text-red-400" : "text-yellow-300"}`}>
                      Graham: {s.discountToGraham >= 0 ? "+" : ""}{s.discountToGraham.toFixed(1)}%
                    </div>
                    <div className={`text-xs font-mono mt-0.5 ${s.upsideToTarget >= 20 ? "text-green-400" : s.upsideToTarget >= 0 ? "text-yellow-300" : "text-red-400"}`}>
                      Upside: {pct(s.upsideToTarget)}
                    </div>
                    <div className="mt-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${s.score.signal === "Compra Fuerte" ? "bg-emerald-500 text-white" : "bg-green-600 text-white"}`}>
                        {s.score.signal === "Compra Fuerte" ? "▲▲" : "▲"} {s.score.signal}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Tabla */}
        {stocks.length > 0 && (() => {
          const filtered = filterByCycle && phase
            ? stocks.filter(s => PHASE_SECTORS[phase].includes(s.sector))
            : stocks
          const watchFiltered = showWatchlist
            ? filtered.filter(s => watchlist.has(s.symbol))
            : filtered
          const displayed = [...watchFiltered].sort((a, b) => {
            const av = getSortValue(a, sortBy)
            const bv = getSortValue(b, sortBy)
            const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)
            return sortDir === "desc" ? -cmp : cmp
          })

          function Th({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
            const active = sortBy === col
            const arrow = active ? (sortDir === "desc" ? " ↓" : " ↑") : ""
            return (
              <th
                onClick={() => handleSort(col)}
                className={`pb-2 pr-4 ${right ? "text-right" : ""} cursor-pointer select-none whitespace-nowrap transition-colors ${active ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                {label}{arrow}
              </th>
            )
          }

          return (
          <>
            <div className="text-sm text-gray-400 mb-3">
              {displayed.length} empresas{filterByCycle && phase ? ` en sectores favorecidos (${PHASE_LABELS[phase].label})` : " consultadas"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs border-b border-gray-800">
                    <th className="pb-2 pr-6 text-gray-500">Empresa</th>
                    <Th col="grade"  label="Grado" />
                    <Th col="buy"    label="Compra" right />
                    <Th col="sector" label="Sector" />
                    <Th col="price"  label="Precio" right />
                    <th className="pb-2 pr-4 text-right text-gray-500">Máx 52w</th>
                    <Th col="drop"    label="Caída"    right />
                    <th className="pb-2 pr-4 text-right text-gray-500">Graham #</th>
                    <Th col="graham"  label="vs Graham" right />
                    <th className="pb-2 pr-4 text-right text-gray-500">Target</th>
                    <Th col="upside"  label="Upside"   right />
                    <Th col="pe"      label="P/E"      right />
                    <Th col="pb"      label="P/B"      right />
                    <Th col="roe"     label="ROE"      right />
                    <Th col="de"      label="D/E"      right />
                    <Th col="eps"     label="Crec. EPS" right />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((s) => (
                    <tr key={s.symbol} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                      <td className="py-3 pr-6">
                        <div className="flex items-start gap-2">
                          <button onClick={() => toggleWatch(s.symbol)} className={`mt-0.5 text-sm leading-none transition-colors ${watchlist.has(s.symbol) ? "text-yellow-400" : "text-gray-700 hover:text-gray-400"}`}>★</button>
                          <Link href={`/empresa/${s.symbol}`} className="hover:opacity-80 transition-opacity">
                            <div className="font-bold text-white">{s.symbol}</div>
                            <div className="text-xs text-gray-400 max-w-[160px] truncate">{s.company}</div>
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 pr-4"><GradeBadge grade={s.score.grade} /></td>
                      <td className="py-3 pr-4 text-right">
                        {s.score.buyReady
                          ? <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-700 text-white">Compra {s.score.buyScore}</span>
                          : <span className="font-mono text-xs text-gray-500">{s.score.buyScore}</span>
                        }
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400 max-w-[100px] truncate">{s.sector}</td>
                      <td className="py-3 pr-4 text-right font-mono">${s.currentPrice.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-400">${s.high52w.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-right"><DropBadge value={s.dropFrom52w} /></td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">
                        {s.grahamNumber > 0 ? `$${s.grahamNumber.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {s.grahamNumber > 0 ? <GrahamBadge value={s.discountToGraham} /> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">
                        {s.analystTarget > 0 ? `$${s.analystTarget.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {s.analystTarget > 0 ? <UpBadge value={s.upsideToTarget} /> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">{fmt(s.pe)}</td>
                      <td className="py-3 pr-4 text-right font-mono">{fmt(s.pb)}</td>
                      <td className="py-3 pr-4 text-right font-mono">{s.roe !== 0 ? pct(s.roe * 100) : "—"}</td>
                      <td className="py-3 pr-4 text-right font-mono">{fmt(s.debtToEquity / 100)}</td>
                      <td className="py-3 text-right font-mono">
                        {s.earningsGrowth !== 0 ? pct(s.earningsGrowth * 100) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
          )
        })()}
      </div>
    </main>
    </ErrorBoundary>
  )
}
