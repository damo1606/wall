"use client"

import { useState } from "react"
import Link from "next/link"
import { DJIA_SYMBOLS, SP500_SYMBOLS, NASDAQ100_SYMBOLS, RUSSELL_SYMBOLS, RUSSELL2000_SYMBOLS, QUANTUM_SYMBOLS, BIOTECH_SMALL_SYMBOLS, TECH_SMALL_SYMBOLS, CONSUMER_SMALL_SYMBOLS } from "@/lib/symbols"
import { scoreStock } from "@/lib/scoring"
import { analyzeForward } from "@/lib/forward"
import type { StockData } from "@/lib/yahoo"
import type { ScoreBreakdown } from "@/lib/scoring"
import type { ForwardAnalysis } from "@/lib/forward"
import { ErrorBoundary } from "@/app/ErrorBoundary"

type Scored = StockData & { score: ScoreBreakdown; forward: ForwardAnalysis }

async function fetchStock(symbol: string): Promise<Scored | null> {
  try {
    const res = await fetch(`/api/stock/${symbol}`)
    if (!res.ok) return null
    const data: StockData = await res.json()
    return { ...data, score: scoreStock(data), forward: analyzeForward(data) }
  } catch {
    return null
  }
}

function pct(v: number, dec = 1) {
  if (v === 0) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`
}
function usd(v: number) { return v > 0 ? `$${v.toFixed(2)}` : "—" }
function fmt(v: number, dec = 1) { return v !== 0 ? v.toFixed(dec) : "—" }

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "A+" ? "bg-emerald-500 text-white" :
    grade === "A"  ? "bg-green-600 text-white" :
    grade === "B"  ? "bg-blue-600 text-white" :
    grade === "C"  ? "bg-yellow-600 text-white" :
    grade === "D"  ? "bg-orange-600 text-white" :
    "bg-red-700 text-white"
  return (
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black shrink-0 ${color}`}>
      {grade}
    </div>
  )
}

function PillarBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const color = value >= 70 ? "bg-green-500" : value >= 45 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label} <span className="text-gray-600">({weight})</span></span>
        <span className={`font-bold ${value >= 70 ? "text-green-400" : value >= 45 ? "text-yellow-400" : "text-red-400"}`}>{value}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function Metric({ label, value, good, note }: { label: string; value: string; good: boolean | null; note?: string }) {
  const color = good === null ? "text-gray-300" : good ? "text-green-400" : "text-red-400"
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        {note && <div className="text-[10px] text-gray-700 mt-0.5">{note}</div>}
      </div>
      <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}

type Universe = "dia" | "sp500" | "nasdaq" | "russell" | "r2000" | "quantum" | "biotech-small" | "tech-small" | "consumer-small"
const UNIVERSES: { key: Universe; label: string; symbols: string[]; small?: boolean }[] = [
  { key: "dia",           label: "Dow Jones 30",         symbols: DJIA_SYMBOLS },
  { key: "sp500",         label: "S&P 500",              symbols: SP500_SYMBOLS },
  { key: "nasdaq",        label: "Nasdaq 100",           symbols: NASDAQ100_SYMBOLS },
  { key: "russell",       label: "Russell 1000",         symbols: RUSSELL_SYMBOLS },
  { key: "r2000",         label: "Russell 2000",         symbols: RUSSELL2000_SYMBOLS,         small: true },
  { key: "quantum",       label: "Quantum / DeepTech",   symbols: QUANTUM_SYMBOLS,            small: true },
  { key: "biotech-small", label: "Biotech Small Cap",    symbols: BIOTECH_SMALL_SYMBOLS,      small: true },
  { key: "tech-small",    label: "Tech Small Cap",       symbols: TECH_SMALL_SYMBOLS,         small: true },
  { key: "consumer-small",label: "Consumo Básico Small", symbols: CONSUMER_SMALL_SYMBOLS,     small: true },
]

type SortCol1 = "final" | "quality" | "price" | "drop" | "grade"

export default function Parte1() {
  const [stocks, setStocks]     = useState<Scored[]>([])
  const [loading, setLoading]   = useState(false)
  const [ran, setRan]           = useState(false)
  const [progress, setProgress] = useState(0)
  const [fetched, setFetched]   = useState(0)
  const [universe, setUniverse] = useState<Universe>("dia")
  const [limit, setLimit]       = useState(50)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [minGrade, setMinGrade] = useState<string>("F")
  const [sectorFilter, setSectorFilter] = useState<string>("all")
  const [sortBy1, setSortBy1]   = useState<SortCol1>("final")
  const [sortDir1, setSortDir1] = useState<"asc" | "desc">("desc")
  const runningRef = { current: false }

  function handleSort1(col: SortCol1) {
    if (sortBy1 === col) setSortDir1(d => d === "desc" ? "asc" : "desc")
    else { setSortBy1(col); setSortDir1("desc") }
  }

  const universeSymbols = UNIVERSES.find(u => u.key === universe)?.symbols ?? DJIA_SYMBOLS
  const symbols = universe === "sp500" ? universeSymbols.slice(0, limit) : universeSymbols

  async function run() {
    runningRef.current = true
    setLoading(true)
    setRan(false)
    setStocks([])
    setProgress(0)
    setFetched(0)
    setSectorFilter("all")

    const results: Scored[] = []
    let done = 0

    for (let i = 0; i < symbols.length; i += 5) {
      if (!runningRef.current) break
      const batch = await Promise.all(symbols.slice(i, i + 5).map(fetchStock))
      batch.forEach(s => { if (s) results.push(s) })
      done += 5
      if (!runningRef.current) break
      setProgress(Math.round((Math.min(done, symbols.length) / symbols.length) * 100))
      setFetched(results.length)
    }

    if (!runningRef.current) return
    const GRADE_ORDER = ["F", "D", "C", "B", "A", "A+"]
    results.sort((a, b) => b.score.finalScore - a.score.finalScore)
    setStocks(results)
    setLoading(false)
    setRan(true)
    runningRef.current = false
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !loading) run()
  }

  const GRADE_ORDER = ["F", "D", "C", "B", "A", "A+"]
  const gradeFiltered = stocks.filter(s =>
    GRADE_ORDER.indexOf(s.score.grade) >= GRADE_ORDER.indexOf(minGrade)
  )
  const sectors = Array.from(new Set(gradeFiltered.map(s => s.sector).filter(Boolean))).sort()
  const filteredRaw = sectorFilter === "all" ? gradeFiltered : gradeFiltered.filter(s => s.sector === sectorFilter)

  const filtered = [...filteredRaw].sort((a, b) => {
    let va: number, vb: number
    const GO = ["F","D","C","B","A","A+"]
    switch (sortBy1) {
      case "grade":   va = GO.indexOf(a.score.grade);   vb = GO.indexOf(b.score.grade);   break
      case "quality": va = a.score.qualityScore;         vb = b.score.qualityScore;         break
      case "price":   va = a.score.priceScore;           vb = b.score.priceScore;           break
      case "drop":    va = -a.dropFrom52w;               vb = -b.dropFrom52w;               break
      default:        va = a.score.finalScore;           vb = b.score.finalScore
    }
    return sortDir1 === "desc" ? vb - va : va - vb
  })

  // Sector distribution: per sector, count grades
  const sectorDist = sectors.map(sec => {
    const inSec = gradeFiltered.filter(s => s.sector === sec)
    const counts = { "A+": 0, A: 0, B: 0, C: 0, D: 0, F: 0 } as Record<string, number>
    inSec.forEach(s => { counts[s.score.grade] = (counts[s.score.grade] ?? 0) + 1 })
    const best = inSec.reduce((best, s) =>
      GRADE_ORDER.indexOf(s.score.grade) > GRADE_ORDER.indexOf(best?.score.grade ?? "F") ? s : best
    , inSec[0])
    return { sector: sec, total: inSec.length, counts, best }
  })

  return (
    <ErrorBoundary fallback="Error al cargar valoración">
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Valoración de Empresas</h1>
            <p className="text-gray-400 mt-1">Modelo de calidad primero — como lo hacen los grandes fondos</p>
          </div>
        </div>

        {/* Panel explicativo */}
        {!ran && !loading && (
          <div className="bg-gray-900 border border-blue-900/60 rounded-xl p-6 mb-6">
            <h2 className="text-base font-bold text-blue-300 mb-3">¿Cómo funciona este modelo?</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-5">
              Los grandes fondos de inversión — Berkshire, Sequoia, Fundsmith — no buscan acciones baratas. Buscan <strong className="text-white">negocios extraordinarios</strong> y solo se preocupan por el precio después de confirmar la calidad. Este modelo replica esa lógica: <strong className="text-white">80% calidad del negocio, 20% precio</strong>.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { pct: "30%", color: "border-purple-700 bg-purple-950/50", title: "Eficiencia del Capital", desc: "ROE, ROA, FCF Margin — ¿el negocio crea valor real?" },
                { pct: "30%", color: "border-blue-700 bg-blue-950/50",   title: "Ventaja Competitiva", desc: "Márgenes bruto, operativo, neto — ¿tiene moat?" },
                { pct: "20%", color: "border-green-700 bg-green-950/50", title: "Solidez Financiera", desc: "Nivel de deuda — ¿el balance es resistente?" },
                { pct: "20%", color: "border-yellow-700 bg-yellow-950/50", title: "Precio", desc: "P/FCF, EV/EBITDA, upside — ¿está a buen precio?" },
              ].map(p => (
                <div key={p.title} className={`border rounded-lg p-3 ${p.color}`}>
                  <div className="text-xs font-bold text-gray-300 mb-0.5">{p.pct} — {p.title}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{p.desc}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-600">Calificaciones:</span>
              {[
                { g: "A+", c: "bg-emerald-500", d: "Negocio excepcional a precio atractivo" },
                { g: "A",  c: "bg-green-600",   d: "Alta calidad, precio razonable" },
                { g: "B",  c: "bg-blue-600",     d: "Buen negocio, oportunidad condicional" },
                { g: "C",  c: "bg-yellow-600",   d: "Promedio — no cumple el estándar" },
                { g: "D",  c: "bg-orange-600",   d: "Debilidades estructurales" },
                { g: "F",  c: "bg-red-700",      d: "Evitar" },
              ].map(x => (
                <span key={x.g} title={x.d}
                  className={`${x.c} text-white text-xs font-bold px-2 py-0.5 rounded cursor-help`}>
                  {x.g}
                </span>
              ))}
            </div>
            <p className="text-xs text-blue-400 mt-4">Selecciona el universo y presiona <strong>Analizar</strong> o <strong>Enter</strong>.</p>
          </div>
        )}

        {/* Controles */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 flex flex-wrap gap-5 items-end" onKeyDown={handleKey}>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Universo</label>
            <select value={universe}
              onChange={e => { setUniverse(e.target.value as Universe); setStocks([]); setRan(false) }}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
              <optgroup label="Large &amp; Mid Cap">
                {UNIVERSES.filter(u => !u.small).map(u => (
                  <option key={u.key} value={u.key}>{u.label} ({u.symbols.length})</option>
                ))}
              </optgroup>
              <optgroup label="Small &amp; Micro Cap">
                {UNIVERSES.filter(u => u.small).map(u => (
                  <option key={u.key} value={u.key}>{u.label} ({u.symbols.length})</option>
                ))}
              </optgroup>
            </select>
            {UNIVERSES.find(u => u.key === universe)?.small && (
              <span className="text-xs font-semibold px-2 py-1 rounded bg-yellow-900/60 border border-yellow-700 text-yellow-300">
                Micro / Small Cap — breakpoints ajustados
              </span>
            )}
          </div>

          {universe === "sp500" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Acciones</label>
              <select value={limit} onChange={e => setLimit(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          )}

          {ran && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Calificación mínima</label>
              <select value={minGrade} onChange={e => setMinGrade(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
                {["F","D","C","B","A","A+"].map(g => <option key={g} value={g}>{g} o mejor</option>)}
              </select>
            </div>
          )}

          <button onClick={run} disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white font-semibold px-6 py-2 rounded-lg transition-colors">
            {loading ? `Analizando... ${progress}%` : "Analizar"}
          </button>

          {loading && fetched > 0 && (
            <span className="text-sm text-gray-500 self-center">{fetched} empresas procesadas</span>
          )}
        </div>

        {ran && !loading && stocks.length === 0 && (
          <div className="text-center py-20 text-red-400">No se pudo obtener datos. Intenta de nuevo.</div>
        )}

        {/* Distribución por sector */}
        {ran && !loading && sectorDist.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Distribución por Sector</span>
              {sectorFilter !== "all" && (
                <button onClick={() => setSectorFilter("all")} className="text-xs text-blue-400 hover:text-blue-300">
                  × Quitar filtro
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {sectorDist.map(({ sector, total, counts, best }) => {
                const topGrade = best?.score.grade ?? "F"
                const active = sectorFilter === sector
                const borderColor =
                  topGrade === "A+" ? "border-emerald-700" :
                  topGrade === "A"  ? "border-green-700" :
                  topGrade === "B"  ? "border-blue-700" :
                  topGrade === "C"  ? "border-yellow-700" :
                  "border-gray-800"
                return (
                  <button key={sector}
                    onClick={() => setSectorFilter(active ? "all" : sector)}
                    className={`text-left p-3 rounded-lg border transition-all ${active ? "bg-gray-800 " + borderColor : "bg-gray-900 border-gray-800 hover:border-gray-700"}`}>
                    <div className="text-xs font-semibold text-gray-300 truncate mb-1.5">{sector}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(["A+","A","B","C","D","F"] as const).map(g =>
                        counts[g] > 0 ? (
                          <span key={g} className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                            g === "A+" ? "bg-emerald-500/20 text-emerald-400" :
                            g === "A"  ? "bg-green-600/20 text-green-400" :
                            g === "B"  ? "bg-blue-600/20 text-blue-400" :
                            g === "C"  ? "bg-yellow-600/20 text-yellow-400" :
                            g === "D"  ? "bg-orange-600/20 text-orange-400" :
                            "bg-red-700/20 text-red-400"
                          }`}>{g}:{counts[g]}</span>
                        ) : null
                      )}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-1">{total} empresa{total !== 1 ? "s" : ""}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Resultados */}
        {filtered.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-gray-500 mr-2">
                {filtered.length} empresa{filtered.length !== 1 ? "s" : ""}
                {sectorFilter !== "all" ? ` en ${sectorFilter}` : ""}
                {filtered.length !== stocks.length ? ` de ${stocks.length}` : ""}
              </p>
              <span className="text-xs text-gray-600">Ordenar:</span>
              {([
                { col: "final"   as SortCol1, label: "Score Final" },
                { col: "quality" as SortCol1, label: "Calidad"     },
                { col: "price"   as SortCol1, label: "Precio"      },
                { col: "drop"    as SortCol1, label: "Caída 52w"   },
                { col: "grade"   as SortCol1, label: "Grade"       },
              ]).map(({ col, label }) => (
                <button key={col} onClick={() => handleSort1(col)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    sortBy1 === col
                      ? "border-blue-600 text-blue-300 bg-blue-900/30"
                      : "border-gray-700 text-gray-500 hover:text-gray-300"
                  }`}>
                  {label} {sortBy1 === col ? (sortDir1 === "desc" ? "▼" : "▲") : ""}
                </button>
              ))}
            </div>

            {filtered.map(s => {
              const open = expanded === s.symbol
              const sc = s.score
              const fw = s.forward
              return (
                <div key={s.symbol} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

                  {/* Fila principal */}
                  <button
                    onClick={() => setExpanded(open ? null : s.symbol)}
                    className="w-full text-left px-5 py-4 hover:bg-gray-800/40 transition-colors">
                    <div className="flex items-center gap-4 flex-wrap">

                      <GradeBadge grade={sc.grade} />

                      {/* Empresa */}
                      <div className="min-w-[150px]">
                        <div className="font-bold text-white text-base">{s.symbol}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[180px]">{s.company}</div>
                        <div className="text-xs text-gray-600">{s.sector}</div>
                      </div>

                      {/* Score final */}
                      <div className="text-center min-w-[52px]">
                        <div className="text-2xl font-black text-white">{sc.finalScore}</div>
                        <div className="text-[10px] text-gray-600">/ 100</div>
                      </div>

                      {/* Pilares */}
                      <div className="flex gap-3 flex-1 min-w-[280px]">
                        {[
                          { label: "Capital", value: sc.capitalScore, color: "text-purple-400" },
                          { label: "Moat",    value: sc.moatScore,    color: "text-blue-400" },
                          { label: "Salud",   value: sc.healthScore,  color: "text-green-400" },
                          { label: "Precio",  value: sc.priceScore,   color: "text-yellow-400" },
                        ].map(p => (
                          <div key={p.label} className="text-center min-w-[52px]">
                            <div className={`text-base font-bold ${p.color}`}>{p.value}</div>
                            <div className="text-[10px] text-gray-600">{p.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Forward grade visible en fila */}
                      {fw && (
                        <div className="text-center min-w-[52px]">
                          <div className={`text-base font-bold ${
                            fw.forwardGrade === "A+" ? "text-emerald-400" :
                            fw.forwardGrade === "A"  ? "text-green-400" :
                            fw.forwardGrade === "B"  ? "text-blue-400" :
                            fw.forwardGrade === "C"  ? "text-yellow-400" : "text-red-400"
                          }`}>{fw.forwardGrade}</div>
                          <div className="text-[10px] text-gray-600">Futuro</div>
                        </div>
                      )}

                      {/* Precio y veredicto */}
                      <div className="ml-auto text-right">
                        <div className="font-mono text-white">${s.currentPrice.toFixed(2)}</div>
                        <div className={`text-xs ${s.dropFrom52w <= -20 ? "text-green-400" : "text-gray-600"}`}>
                          {s.dropFrom52w.toFixed(1)}% vs 52w
                        </div>
                      </div>

                      <span className="text-gray-700 text-xs">{open ? "▲" : "▼"}</span>
                    </div>

                    {/* Veredicto */}
                    <p className="text-xs text-gray-500 mt-2 ml-16 leading-relaxed">{sc.verdict}</p>
                  </button>

                  {/* Detalle expandido */}
                  {open && (
                    <div className="border-t border-gray-800 bg-gray-950 px-5 py-5">

                      {/* Fortalezas y debilidades */}
                      {(sc.strengths.length > 0 || sc.weaknesses.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          {sc.strengths.length > 0 && (
                            <div className="bg-green-950/30 border border-green-900/40 rounded-lg p-3">
                              <div className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">Fortalezas</div>
                              <ul className="space-y-1">
                                {sc.strengths.map((s, i) => (
                                  <li key={i} className="text-xs text-gray-300 flex gap-2">
                                    <span className="text-green-500 shrink-0">✓</span>{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {sc.weaknesses.length > 0 && (
                            <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-3">
                              <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Debilidades</div>
                              <ul className="space-y-1">
                                {sc.weaknesses.map((w, i) => (
                                  <li key={i} className="text-xs text-gray-300 flex gap-2">
                                    <span className="text-red-500 shrink-0">✗</span>{w}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Contexto sectorial */}
                      <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 mb-5 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                        <div><span className="text-gray-600">Sector: </span><span className="text-gray-300 font-medium">{sc.sectorLabel}</span></div>
                        <div><span className="text-gray-600">Tipo de moat: </span><span className="text-blue-300 font-medium">{sc.moatType}</span></div>
                        <div><span className="text-gray-600">CAP estimado: </span><span className="text-yellow-300 font-medium">{sc.capRange}</span></div>
                      </div>

                      {/* Barras de pilares */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="space-y-3">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Desglose del Score</div>
                          <PillarBar label="Eficiencia del Capital" value={sc.capitalScore} weight="30%" />
                          <PillarBar label="Ventaja Competitiva (Moat)" value={sc.moatScore} weight="30%" />
                          <PillarBar label="Solidez Financiera" value={sc.healthScore} weight="20%" />
                          <PillarBar label="Precio" value={sc.priceScore} weight="20%" />
                        </div>

                        {/* Métricas clave */}
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Métricas clave</div>
                          <Metric label="ROIC" value={s.roic > 0 ? pct(s.roic * 100) : "—"}
                            good={s.roic >= 0.12} note="Retorno sobre capital invertido — ROIC > WACC = moat real" />
                          <Metric label="ROE" value={pct(s.roe * 100)}
                            good={s.roe >= 0.20} note="> 20% excelente (referencia secundaria)" />
                          <Metric label="ROA" value={pct(s.roa * 100)}
                            good={s.roa >= 0.10} note="> 10% muy bueno" />
                          <Metric label="FCF Margin" value={pct(s.fcfMargin * 100)}
                            good={s.fcfMargin >= 0.15} note="> 15% excelente" />
                          <Metric label="Margen Bruto" value={pct(s.grossMargin * 100)}
                            good={s.grossMargin >= 0.40} note="Calibrado vs sector" />
                          <Metric label="Margen Operativo" value={pct(s.operatingMargin * 100)}
                            good={s.operatingMargin >= 0.20} note="Calibrado vs sector" />
                          <Metric label="Deuda / Patrimonio" value={s.debtToEquity > 0 ? `${(s.debtToEquity / 100).toFixed(2)}x` : "—"}
                            good={s.debtToEquity > 0 ? s.debtToEquity < 100 : null} note="< 1.0x conservador" />
                        </div>
                      </div>

                      {/* Valoración y precio */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-800">
                        <div>
                          <div className="text-xs text-gray-500 mb-1.5 font-semibold">Ratios de precio</div>
                          <Metric label="P/FCF" value={s.pFcf > 0 ? `${s.pFcf.toFixed(1)}x` : "—"}
                            good={s.pFcf > 0 ? s.pFcf < 20 : null} />
                          <Metric label="EV/EBITDA" value={s.evToEbitda > 0 ? `${s.evToEbitda.toFixed(1)}x` : "—"}
                            good={s.evToEbitda > 0 ? s.evToEbitda < 15 : null} />
                          <Metric label="P/E" value={s.pe > 0 ? `${s.pe.toFixed(1)}x` : "—"} good={null} />
                          <Metric label="P/B" value={s.pb > 0 ? `${s.pb.toFixed(1)}x` : "—"} good={null} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1.5 font-semibold">Analistas</div>
                          <Metric label="Target" value={usd(s.analystTarget)} good={null} />
                          <Metric label="Upside" value={pct(s.upsideToTarget)}
                            good={s.upsideToTarget >= 15} />
                          <Metric label="# Analistas" value={s.analystCount > 0 ? String(s.analystCount) : "—"} good={null} />
                          <Metric label="PEG" value={s.peg > 0 ? s.peg.toFixed(2) : "—"}
                            good={s.peg > 0 ? s.peg < 1.5 : null} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1.5 font-semibold">Crecimiento</div>
                          <Metric label="EPS Growth" value={pct(s.earningsGrowth * 100)}
                            good={s.earningsGrowth >= 0.08} />
                          <Metric label="Revenue Growth" value={pct(s.revenueGrowth * 100)}
                            good={s.revenueGrowth >= 0.05} />
                          <Metric label="FCF" value={s.freeCashflow > 1e9
                            ? `$${(s.freeCashflow / 1e9).toFixed(1)}B`
                            : s.freeCashflow > 0 ? `$${(s.freeCashflow / 1e6).toFixed(0)}M` : "—"} good={null} />
                          <Metric label="Dividend Yield" value={s.dividendYield > 0 ? pct(s.dividendYield * 100) : "No paga"} good={null} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1.5 font-semibold">Precio / mercado</div>
                          <Metric label="Precio actual" value={`$${s.currentPrice.toFixed(2)}`} good={null} />
                          <Metric label="Máx 52 semanas" value={usd(s.high52w)} good={null} />
                          <Metric label="Caída vs 52w" value={`${s.dropFrom52w.toFixed(1)}%`}
                            good={s.dropFrom52w <= -20} />
                          <Metric label="Market Cap" value={s.marketCap > 1e12
                            ? `$${(s.marketCap / 1e12).toFixed(1)}T`
                            : `$${(s.marketCap / 1e9).toFixed(0)}B`} good={null} />
                        </div>
                      </div>

                      {/* Prospectiva del Negocio */}
                      {fw && <div className="mt-5 pt-5 border-t border-gray-800">
                        <div className="flex items-center gap-3 mb-4 flex-wrap">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Prospectiva del Negocio</div>
                          <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                            fw.forwardGrade === "A+" ? "bg-emerald-600 text-white" :
                            fw.forwardGrade === "A"  ? "bg-green-700 text-white" :
                            fw.forwardGrade === "B"  ? "bg-blue-700 text-white" :
                            fw.forwardGrade === "C"  ? "bg-yellow-700 text-white" :
                            "bg-red-800 text-white"
                          }`}>{fw.forwardGrade} Prospectiva — {fw.forwardScore}/100</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          {/* Etapa de crecimiento */}
                          <div className="bg-gray-900 rounded-lg p-3">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Etapa del Negocio</div>
                            <div className={`text-sm font-bold ${fw.growthStageColor}`}>{fw.growthStageLabel}</div>
                            <div className="text-[11px] text-gray-600 mt-1">Revenue YoY {fw.growthStage === "declive" ? "" : "+"}{(s.revenueGrowth * 100).toFixed(1)}%</div>
                          </div>

                          {/* Dirección de earnings */}
                          <div className="bg-gray-900 rounded-lg p-3">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Earnings Futuros</div>
                            <div className={`text-sm font-bold ${fw.earningsDirectionColor}`}>{fw.earningsDirectionLabel}</div>
                            <div className="text-[11px] text-gray-600 mt-1">
                              {s.pe > 0 && s.forwardPe > 0
                                ? `P/E trailing ${s.pe.toFixed(1)}x → forward ${s.forwardPe.toFixed(1)}x`
                                : s.earningsGrowth !== 0 ? `EPS YoY ${s.earningsGrowth >= 0 ? "+" : ""}${(s.earningsGrowth * 100).toFixed(1)}%` : "Sin datos"}
                            </div>
                          </div>

                          {/* Apalancamiento operativo */}
                          <div className="bg-gray-900 rounded-lg p-3">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Apal. Operativo</div>
                            <div className={`text-sm font-bold ${
                              fw.operatingLeverage === "positivo" ? "text-green-400" :
                              fw.operatingLeverage === "negativo" ? "text-red-400" : "text-gray-400"
                            }`}>{fw.operatingLeverage === "positivo" ? "Positivo ↑" : fw.operatingLeverage === "negativo" ? "Negativo ↓" : "Neutro →"}</div>
                            <div className="text-[11px] text-gray-600 mt-1 leading-tight">{fw.operatingLeverageLabel.split(" — ")[1]}</div>
                          </div>

                          {/* Señal de CAP */}
                          <div className="bg-gray-900 rounded-lg p-3">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Moat (CAP signal)</div>
                            <div className={`text-sm font-bold ${fw.capSignalColor}`}>
                              {fw.capSignal === "fortaleciendo" ? "Fortaleciendo ↑" :
                               fw.capSignal === "debilitando"   ? "Debilitando ↓"   : "Estable →"}
                            </div>
                            <div className="text-[11px] text-gray-600 mt-1 leading-tight">
                              {fw.capSignalLabel.split(" — ")[1]?.slice(0, 45) ?? ""}
                            </div>
                          </div>
                        </div>

                        {/* Riesgo de Disrupción */}
                        <div className="bg-gray-900/80 border border-gray-800 rounded-lg p-4 mb-3">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="text-xs font-semibold text-gray-400">Riesgo de Disrupción Sectorial</div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              fw.disruption.risk <= 2 ? "bg-green-900/50 text-green-400" :
                              fw.disruption.risk === 3 ? "bg-yellow-900/50 text-yellow-400" :
                              "bg-red-900/50 text-red-400"
                            }`}>{fw.disruption.label} ({fw.disruption.risk}/5)</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-[10px] text-red-500 uppercase tracking-wider mb-1.5">Amenazas</div>
                              <ul className="space-y-1">
                                {fw.disruption.threats.map((t, i) => (
                                  <li key={i} className="text-[11px] text-gray-400 flex gap-1.5 leading-relaxed">
                                    <span className="text-red-600 shrink-0 mt-0.5">▸</span>{t}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="text-[10px] text-green-500 uppercase tracking-wider mb-1.5">Oportunidades</div>
                              <ul className="space-y-1">
                                {fw.disruption.opportunities.map((o, i) => (
                                  <li key={i} className="text-[11px] text-gray-400 flex gap-1.5 leading-relaxed">
                                    <span className="text-green-600 shrink-0 mt-0.5">▸</span>{o}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>

                        {/* Señales narrativas */}
                        {fw.signals.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {fw.signals.map((sig, i) => (
                              <span key={i} className="text-[11px] bg-gray-800/60 text-gray-400 px-2 py-1 rounded border border-gray-700/50">
                                {sig}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>}

                      {/* Sección Dividendos */}
                      <div className="mt-5 pt-5 border-t border-gray-800">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Valoración por Dividendos Crecientes</div>
                          {s.isDividendPayer && sc.dividendScore !== null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                              sc.dividendGrade === "Excelente" ? "bg-emerald-600 text-white" :
                              sc.dividendGrade === "Bueno"     ? "bg-green-700 text-white" :
                              sc.dividendGrade === "Moderado"  ? "bg-yellow-700 text-white" :
                              "bg-red-800 text-white"
                            }`}>{sc.dividendGrade} — {sc.dividendScore}/100</span>
                          )}
                        </div>

                        {!s.isDividendPayer ? (
                          <p className="text-xs text-gray-600 italic">Esta empresa no paga dividendos — el modelo DDM no aplica.</p>
                        ) : (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="text-xs text-gray-500 mb-1.5 font-semibold">Yield & Tasa</div>
                              <Metric label="Dividend Yield" value={s.dividendYield > 0 ? pct(s.dividendYield * 100) : "—"}
                                good={s.dividendYield >= 0.02} note="> 2% para ingreso real" />
                              <Metric label="Dividendo anual" value={s.dividendRate > 0 ? `$${s.dividendRate.toFixed(2)}` : "—"}
                                good={null} />
                              <Metric label="Yield prom. 5 años" value={s.fiveYearAvgYield > 0 ? pct(s.fiveYearAvgYield) : "—"}
                                good={null} note="Contexto histórico" />
                              <Metric label="Yield vs histórico"
                                value={s.fiveYearAvgYield > 0
                                  ? `${((s.dividendYield / (s.fiveYearAvgYield / 100)) * 100).toFixed(0)}%`
                                  : "—"}
                                good={s.fiveYearAvgYield > 0 ? s.dividendYield >= (s.fiveYearAvgYield / 100) : null}
                                note="> 100% = yield encima de su media" />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1.5 font-semibold">Sostenibilidad</div>
                              <Metric label="Payout ratio (EPS)" value={s.payoutRatio > 0 ? pct(s.payoutRatio * 100) : "—"}
                                good={s.payoutRatio > 0 ? s.payoutRatio < 0.60 : null} note="< 60% conservador" />
                              <Metric label="Payout ratio (FCF)" value={s.fcfPayoutRatio > 0 ? pct(s.fcfPayoutRatio * 100) : "—"}
                                good={s.fcfPayoutRatio > 0 ? s.fcfPayoutRatio < 0.60 : null} note="< 60% seguro" />
                              <Metric label="FCF Margin" value={pct(s.fcfMargin * 100)}
                                good={s.fcfMargin >= 0.12} note="Sustenta el dividendo" />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1.5 font-semibold">Gordon Growth Model</div>
                              <Metric label="Tasa crecim. estimada" value={pct(s.ddmGrowthRate * 100, 1)}
                                good={null} note="70% del EPS growth, máx 8%" />
                              <Metric label="Valor intrínseco (DDM)" value={s.ddmValue > 0 ? `$${s.ddmValue.toFixed(2)}` : "—"}
                                good={null} note="D₁ / (r – g), r=10%" />
                              <Metric label="Descuento vs DDM" value={s.ddmValue > 0 ? pct(s.ddmDiscount) : "—"}
                                good={s.ddmValue > 0 ? s.ddmDiscount >= 0 : null}
                                note="Positivo = cotiza bajo valor DDM" />
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1.5 font-semibold">Contexto</div>
                              <p className="text-[11px] text-gray-500 leading-relaxed">
                                El modelo DDM (Gordon Growth) valora el dividendo futuro descontado a una tasa de retorno requerida del <strong className="text-gray-400">10%</strong>.
                                Un descuento positivo indica que el precio actual cotiza por debajo del valor intrínseco basado en dividendos.
                              </p>
                              <p className="text-[11px] text-gray-600 leading-relaxed mt-2">
                                El FCF payout ratio es más conservador que el EPS payout: mide si la empresa genera suficiente flujo de caja real para sostener el dividendo sin endeudarse.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
    </ErrorBoundary>
  )
}
