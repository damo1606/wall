"use client"

import { useState } from "react"
import Link from "next/link"
import { DJIA_SYMBOLS, SP500_SYMBOLS, NASDAQ100_SYMBOLS, RUSSELL_SYMBOLS, RUSSELL2000_SYMBOLS, QUANTUM_SYMBOLS, BIOTECH_SMALL_SYMBOLS, TECH_SMALL_SYMBOLS, CONSUMER_SMALL_SYMBOLS } from "@/lib/symbols"
import { analyzeForward } from "@/lib/forward"
import type { StockData } from "@/lib/yahoo"
import type { ForwardAnalysis } from "@/lib/forward"
import { ErrorBoundary } from "@/app/ErrorBoundary"

type Analyzed = StockData & { forward: ForwardAnalysis }

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

async function fetchStock(symbol: string): Promise<Analyzed | null> {
  try {
    const res = await fetch(`/api/stock/${symbol}`)
    if (!res.ok) return null
    const data: StockData = await res.json()
    return { ...data, forward: analyzeForward(data) }
  } catch {
    return null
  }
}

function pct(v: number, dec = 1) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`
}

function GradeChip({ grade, size = "md" }: { grade: string; size?: "sm" | "md" }) {
  const color =
    grade === "A+" ? "bg-emerald-600" :
    grade === "A"  ? "bg-green-700" :
    grade === "B"  ? "bg-blue-700" :
    grade === "C"  ? "bg-yellow-700" :
    "bg-red-800"
  const sz = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm font-black px-2.5 py-1"
  return <span className={`${color} text-white font-bold rounded ${sz}`}>{grade}</span>
}

function RiskDot({ risk }: { risk: number }) {
  const color =
    risk <= 2 ? "bg-green-500" :
    risk === 3 ? "bg-yellow-500" :
    risk === 4 ? "bg-orange-500" : "bg-red-500"
  const label =
    risk <= 2 ? "Bajo" :
    risk === 3 ? "Moderado" :
    risk === 4 ? "Alto" : "Crítico"
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-400">{label} ({risk}/5)</span>
    </div>
  )
}

function StageBar({ stage }: { stage: string }) {
  const stages = ["declive", "estancamiento", "madurez", "expansion", "hypercrecimiento"]
  const idx = stages.indexOf(stage)
  const colors = ["bg-red-600", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-emerald-500"]
  return (
    <div className="flex gap-0.5">
      {stages.map((s, i) => (
        <div key={s} title={s}
          className={`h-2 w-4 rounded-sm transition-all ${i <= idx ? colors[idx] : "bg-gray-800"}`} />
      ))}
    </div>
  )
}

const GRADE_ORDER = ["F", "D", "C", "B", "A", "A+"]

export default function Prospectiva() {
  const [stocks, setStocks]     = useState<Analyzed[]>([])
  const [loading, setLoading]   = useState(false)
  const [ran, setRan]           = useState(false)
  const [progress, setProgress] = useState(0)
  const [fetched, setFetched]   = useState(0)
  const [universe, setUniverse] = useState<Universe>("dia")
  const [limit, setLimit]       = useState(50)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [gradeFilter, setGradeFilter] = useState("C")
  const [stageFilter, setStageFilter] = useState("all")
  const runningRef = { current: false }

  const universeSymbols = UNIVERSES.find(u => u.key === universe)?.symbols ?? DJIA_SYMBOLS
  const symbols = universe === "sp500" ? universeSymbols.slice(0, limit) : universeSymbols

  async function run() {
    runningRef.current = true
    setLoading(true); setRan(false); setStocks([])
    setProgress(0); setFetched(0); setExpanded(null)

    const results: Analyzed[] = []
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
    results.sort((a, b) => b.forward.forwardScore - a.forward.forwardScore)
    setStocks(results)
    setLoading(false)
    setRan(true)
    runningRef.current = false
  }

  const stages = ["hypercrecimiento", "expansion", "madurez", "estancamiento", "declive"]

  const filtered = stocks.filter(s =>
    GRADE_ORDER.indexOf(s.forward.forwardGrade) >= GRADE_ORDER.indexOf(gradeFilter) &&
    (stageFilter === "all" || s.forward.growthStage === stageFilter)
  )

  // Distribución de etapas
  const stageDist = stages.map(st => ({
    stage: st,
    count: stocks.filter(s => s.forward.growthStage === st).length,
  })).filter(x => x.count > 0)

  return (
    <ErrorBoundary fallback="Error al cargar prospectiva">
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Prospectiva del Negocio</h1>
            <p className="text-gray-400 mt-1">Análisis de trayectoria futura — más allá de los números de hoy</p>
          </div>
        </div>

        {/* Explicación */}
        {!ran && !loading && (
          <div className="bg-gray-900 border border-purple-900/50 rounded-xl p-6 mb-6">
            <h2 className="text-base font-bold text-purple-300 mb-3">¿Qué mide este análisis?</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              El modelo de calidad mide la empresa <strong className="text-white">hoy</strong>. Este módulo mide hacia <strong className="text-white">dónde va</strong>.
              Un negocio puede tener A en calidad pero D en prospectiva si sus márgenes se están comprimiendo,
              sus earnings no crecen y enfrenta un disruptor estructural. El inversor inteligente necesita las dos señales.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { icon: "📈", label: "Etapa del negocio",     desc: "Hypercrecimiento → Declive" },
                { icon: "🔮", label: "Dirección de earnings", desc: "Trailing P/E vs Forward P/E" },
                { icon: "⚙️", label: "Apalancamiento op.",    desc: "¿Márgenes expandiéndose?" },
                { icon: "🏰", label: "Señal de CAP",          desc: "¿El moat se fortalece?" },
                { icon: "⚡", label: "Riesgo de disrupción",  desc: "Amenazas sectoriales 1–5" },
              ].map(c => (
                <div key={c.label} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className="text-xs font-semibold text-gray-300">{c.label}</div>
                  <div className="text-[11px] text-gray-600 mt-0.5">{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controles */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 flex flex-wrap gap-5 items-end">
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
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Grade mínimo</label>
                <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
                  {["F","D","C","B","A","A+"].map(g => <option key={g} value={g}>{g} o mejor</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Etapa</label>
                <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white">
                  <option value="all">Todas</option>
                  {stages.map(st => <option key={st} value={st}>{st.charAt(0).toUpperCase() + st.slice(1)}</option>)}
                </select>
              </div>
            </>
          )}

          <button onClick={run} disabled={loading}
            className="bg-purple-700 hover:bg-purple-600 disabled:bg-purple-950 disabled:text-purple-400 text-white font-semibold px-6 py-2 rounded-lg transition-colors">
            {loading ? `Analizando... ${progress}%` : "Analizar Prospectiva"}
          </button>

          {loading && fetched > 0 && (
            <span className="text-sm text-gray-500 self-center">{fetched} empresas procesadas</span>
          )}
        </div>

        {/* Distribución de etapas */}
        {ran && !loading && stageDist.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Distribución por Etapa de Negocio</div>
            <div className="flex flex-wrap gap-3">
              {[
                { st: "hypercrecimiento", label: "Hypercrecimiento", color: "bg-emerald-600/20 text-emerald-400 border-emerald-800/50" },
                { st: "expansion",        label: "Expansión",         color: "bg-green-700/20 text-green-400 border-green-800/50" },
                { st: "madurez",          label: "Madurez",           color: "bg-blue-700/20 text-blue-400 border-blue-800/50" },
                { st: "estancamiento",    label: "Estancamiento",     color: "bg-yellow-700/20 text-yellow-400 border-yellow-800/50" },
                { st: "declive",          label: "Declive",           color: "bg-red-800/20 text-red-400 border-red-800/50" },
              ].map(({ st, label, color }) => {
                const count = stocks.filter(s => s.forward.growthStage === st).length
                if (count === 0) return null
                const pct = Math.round((count / stocks.length) * 100)
                return (
                  <button key={st}
                    onClick={() => setStageFilter(stageFilter === st ? "all" : st)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${color} ${stageFilter === st ? "ring-1 ring-white/30" : ""}`}>
                    <span className="font-black">{count}</span>
                    <span>{label}</span>
                    <span className="text-gray-600">{pct}%</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabla de resultados */}
        {filtered.length > 0 && (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              {filtered.length} empresa{filtered.length !== 1 ? "s" : ""}
              {filtered.length !== stocks.length ? ` de ${stocks.length}` : ""} — ordenadas por score prospectivo
            </p>

            <div className="space-y-2">
              {filtered.map(s => {
                const fw = s.forward
                const open = expanded === s.symbol
                return (
                  <div key={s.symbol} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

                    {/* Fila */}
                    <button onClick={() => setExpanded(open ? null : s.symbol)}
                      className="w-full text-left px-5 py-3.5 hover:bg-gray-800/40 transition-colors">
                      <div className="flex items-center gap-4 flex-wrap">

                        {/* Grade + Score */}
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <GradeChip grade={fw.forwardGrade} />
                          <div>
                            <div className="text-lg font-black text-white">{fw.forwardScore}</div>
                            <div className="text-[10px] text-gray-600">/ 100</div>
                          </div>
                        </div>

                        {/* Empresa */}
                        <div className="min-w-[140px]">
                          <div className="font-bold text-white">{s.symbol}</div>
                          <div className="text-xs text-gray-400 truncate max-w-[160px]">{s.company}</div>
                          <div className="text-[10px] text-gray-600">{s.sector}</div>
                        </div>

                        {/* Etapa */}
                        <div className="min-w-[120px]">
                          <div className={`text-xs font-semibold ${fw.growthStageColor}`}>{fw.growthStageLabel}</div>
                          <StageBar stage={fw.growthStage} />
                          <div className="text-[10px] text-gray-600 mt-0.5">Rev {s.revenueGrowth >= 0 ? "+" : ""}{(s.revenueGrowth * 100).toFixed(1)}%</div>
                        </div>

                        {/* Earnings */}
                        <div className="min-w-[110px]">
                          <div className="text-[10px] text-gray-600 mb-0.5">Earnings</div>
                          <div className={`text-xs font-semibold ${fw.earningsDirectionColor}`}>{fw.earningsDirectionLabel}</div>
                          <div className="text-[10px] text-gray-600">
                            {s.pe > 0 && s.forwardPe > 0 ? `${s.pe.toFixed(0)}x → ${s.forwardPe.toFixed(0)}x` : "—"}
                          </div>
                        </div>

                        {/* Apal. Op. */}
                        <div className="min-w-[80px]">
                          <div className="text-[10px] text-gray-600 mb-0.5">Apal. Op.</div>
                          <div className={`text-xs font-semibold ${
                            fw.operatingLeverage === "positivo" ? "text-green-400" :
                            fw.operatingLeverage === "negativo" ? "text-red-400" : "text-gray-500"
                          }`}>
                            {fw.operatingLeverage === "positivo" ? "Positivo ↑" :
                             fw.operatingLeverage === "negativo" ? "Negativo ↓" : "Neutro →"}
                          </div>
                        </div>

                        {/* CAP */}
                        <div className="min-w-[100px]">
                          <div className="text-[10px] text-gray-600 mb-0.5">Moat</div>
                          <div className={`text-xs font-semibold ${fw.capSignalColor}`}>
                            {fw.capSignal === "fortaleciendo" ? "Fortaleciendo ↑" :
                             fw.capSignal === "debilitando"   ? "Debilitando ↓"   : "Estable →"}
                          </div>
                        </div>

                        {/* Disrupción */}
                        <div className="ml-auto">
                          <div className="text-[10px] text-gray-600 mb-0.5">Disrupción</div>
                          <RiskDot risk={fw.disruption.risk} />
                        </div>

                        <span className="text-gray-700 text-xs">{open ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {/* Detalle expandido */}
                    {open && (
                      <div className="border-t border-gray-800 bg-gray-950 px-5 py-5">

                        {/* Señales narrativas */}
                        {fw.signals.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-5">
                            {fw.signals.map((sig, i) => (
                              <span key={i} className="text-[11px] bg-gray-800/60 text-gray-300 px-2.5 py-1 rounded border border-gray-700/50">
                                {sig}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {/* Métricas de trayectoria */}
                          <div className="space-y-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trayectoria del Negocio</div>

                            {[
                              {
                                label: "Etapa de Crecimiento",
                                value: fw.growthStageLabel,
                                color: fw.growthStageColor,
                                note: `Revenue YoY: ${s.revenueGrowth >= 0 ? "+" : ""}${(s.revenueGrowth * 100).toFixed(1)}%`
                              },
                              {
                                label: "Dirección de Earnings",
                                value: fw.earningsDirectionLabel,
                                color: fw.earningsDirectionColor,
                                note: s.pe > 0 && s.forwardPe > 0
                                  ? `P/E trailing ${s.pe.toFixed(1)}x → forward ${s.forwardPe.toFixed(1)}x`
                                  : `EPS YoY: ${s.earningsGrowth >= 0 ? "+" : ""}${(s.earningsGrowth * 100).toFixed(1)}%`
                              },
                              {
                                label: "Apalancamiento Operativo",
                                value: fw.operatingLeverage === "positivo" ? "Positivo ↑" : fw.operatingLeverage === "negativo" ? "Negativo ↓" : "Neutro →",
                                color: fw.operatingLeverage === "positivo" ? "text-green-400" : fw.operatingLeverage === "negativo" ? "text-red-400" : "text-gray-400",
                                note: fw.operatingLeverageLabel.split(" — ")[1] ?? ""
                              },
                              {
                                label: "Señal de Moat (CAP)",
                                value: fw.capSignal === "fortaleciendo" ? "Fortaleciendo ↑" : fw.capSignal === "debilitando" ? "Debilitando ↓" : "Estable →",
                                color: fw.capSignalColor,
                                note: fw.capSignalLabel.split(" — ")[1] ?? ""
                              },
                            ].map(row => (
                              <div key={row.label} className="flex justify-between items-start gap-2 py-1.5 border-b border-gray-800/60 last:border-0">
                                <div>
                                  <div className="text-xs text-gray-500">{row.label}</div>
                                  {row.note && <div className="text-[10px] text-gray-700 mt-0.5">{row.note}</div>}
                                </div>
                                <div className={`text-xs font-semibold text-right ${row.color}`}>{row.value}</div>
                              </div>
                            ))}

                            {/* Datos de crecimiento adicionales */}
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {[
                                { label: "Revenue YoY",  v: `${s.revenueGrowth >= 0 ? "+" : ""}${(s.revenueGrowth * 100).toFixed(1)}%`, good: s.revenueGrowth > 0.05 },
                                { label: "EPS YoY",      v: `${s.earningsGrowth >= 0 ? "+" : ""}${(s.earningsGrowth * 100).toFixed(1)}%`, good: s.earningsGrowth > 0.05 },
                                { label: "P/E trailing", v: s.pe > 0 ? `${s.pe.toFixed(1)}x` : "—", good: null },
                                { label: "P/E forward",  v: s.forwardPe > 0 ? `${s.forwardPe.toFixed(1)}x` : "—", good: null },
                                { label: "ROIC",         v: s.roic > 0 ? `${(s.roic * 100).toFixed(1)}%` : "—", good: s.roic >= 0.12 },
                                { label: "PEG",          v: s.peg > 0 ? s.peg.toFixed(2) : "—", good: s.peg > 0 ? s.peg < 1.5 : null },
                              ].map(m => (
                                <div key={m.label} className="bg-gray-900 rounded p-2">
                                  <div className="text-[10px] text-gray-600">{m.label}</div>
                                  <div className={`text-xs font-mono font-semibold mt-0.5 ${
                                    m.good === null ? "text-gray-300" : m.good ? "text-green-400" : "text-red-400"
                                  }`}>{m.v}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Disrupción */}
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Disrupción Sectorial</div>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                fw.disruption.risk <= 2 ? "bg-green-900/50 text-green-400" :
                                fw.disruption.risk === 3 ? "bg-yellow-900/50 text-yellow-400" :
                                "bg-red-900/50 text-red-400"
                              }`}>{fw.disruption.label} — {fw.disruption.risk}/5</span>
                            </div>

                            <div className="mb-3">
                              <div className="text-[10px] text-red-500 uppercase tracking-wider mb-1.5">Amenazas</div>
                              <ul className="space-y-1.5">
                                {fw.disruption.threats.map((t, i) => (
                                  <li key={i} className="text-[11px] text-gray-400 flex gap-1.5 leading-relaxed">
                                    <span className="text-red-600 shrink-0 mt-0.5">▸</span>{t}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div>
                              <div className="text-[10px] text-green-500 uppercase tracking-wider mb-1.5">Oportunidades</div>
                              <ul className="space-y-1.5">
                                {fw.disruption.opportunities.map((o, i) => (
                                  <li key={i} className="text-[11px] text-gray-400 flex gap-1.5 leading-relaxed">
                                    <span className="text-green-600 shrink-0 mt-0.5">▸</span>{o}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {ran && !loading && stocks.length === 0 && (
          <div className="text-center py-20 text-red-400">No se pudo obtener datos. Intenta de nuevo.</div>
        )}

      </div>
    </main>
    </ErrorBoundary>
  )
}
