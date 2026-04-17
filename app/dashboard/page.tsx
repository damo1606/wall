"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import type { StockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"
import type { ScoreBreakdown } from "@/lib/scoring"
import { getTrades, tradeResult } from "@/lib/diario"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Scored = StockData & { score: ScoreBreakdown }
type Phase  = "recovery" | "expansion" | "late" | "recession"

interface MacroData {
  detection?: { phase: Phase; confidence: number }
  vix?: number
  vix9d?: number
  vix3m?: number
  vvix?: number
  equityPcr?: number
  spyPcr?: number
}

interface GexLevels { support: number; gammaFlip: number }

interface GexData {
  spot?: number
  netGex?: number
  presionInstitucional?: number
  pcrTotal?: number
  levels?: { callWall: number; putWall: number; gammaFlip: number; support: number; resistance: number }
}

interface AnomalyRow {
  ticker: string; spot: number; strike: number; type: "CALL" | "PUT"
  expiration: string; oi: number; volume: number; iv: number
  volOiRatio: number; oiZScore: number; anomalyScore: number
  bias: "BULLISH" | "BEARISH" | "NEUTRAL"
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const DEFAULT_SCAN_TICKERS = "SPY,QQQ,IWM,AAPL,TSLA,NVDA,MSFT,META,AMZN,GOOGL"
const LS_SCAN_KEY = "wall_dashboard_tickers"
const OPP_TICKERS  = ["AAPL","MSFT","GOOGL","AMZN","NVDA","META","JPM","JNJ","V","WMT","HD","KO","XOM","UNH","TSLA"]

const PRESET_UNIVERSES: Record<string, string> = {
  "MAG7":        "AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA",
  "BANCOS":      "JPM,BAC,GS,MS,C,WFC,USB",
  "ENERGÍA":     "XOM,CVX,SLB,COP,MPC,VLO,HAL",
  "VOLATILIDAD": "SPY,QQQ,IWM,GLD,TLT,HYG,XLF",
}

const PHASE_CFG: Record<Phase, { label: string; badge: string; icon: string }> = {
  recovery:  { label: "Recuperación",    badge: "bg-blue-900/60 border-blue-700 text-blue-200",   icon: "↗" },
  expansion: { label: "Expansión",       badge: "bg-green-900/60 border-green-700 text-green-200", icon: "▲" },
  late:      { label: "Desaceleración",  badge: "bg-amber-900/60 border-amber-700 text-amber-200", icon: "→" },
  recession: { label: "Recesión",        badge: "bg-red-900/60 border-red-700 text-red-200",       icon: "▼" },
}

const SIGNAL_CFG: Record<string, { cls: string; icon: string }> = {
  "Compra Fuerte": { cls: "bg-emerald-600 text-white", icon: "▲▲" },
  "Compra":        { cls: "bg-green-700 text-white",   icon: "▲"  },
  "Mantener":      { cls: "bg-gray-600 text-white",    icon: "●"  },
  "Venta":         { cls: "bg-orange-600 text-white",  icon: "▼"  },
  "Venta Fuerte":  { cls: "bg-red-700 text-white",     icon: "▼▼" },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` }
function usd(v: number) { return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

function GradeBadge({ grade }: { grade: string }) {
  const c = grade === "A+" ? "bg-emerald-500" : grade === "A" ? "bg-green-600" :
            grade === "B"  ? "bg-blue-600"    : grade === "C" ? "bg-yellow-600" :
            grade === "D"  ? "bg-orange-600"  : "bg-red-800"
  return <span className={`${c} text-white text-xs font-black px-1.5 py-0.5 rounded`}>{grade}</span>
}

function Skeleton({ w = "w-full", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} bg-gray-800 rounded animate-pulse`} />
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [macro,        setMacro]        = useState<MacroData | null>(null)
  const [gex,          setGex]          = useState<GexData | null>(null)
  const [opps,         setOpps]         = useState<Scored[]>([])
  const [anomalies,    setAnomalies]    = useState<AnomalyRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [updatedAt,    setUpdatedAt]    = useState("")
  const [scanTickers,  setScanTickers]  = useState(DEFAULT_SCAN_TICKERS)
  const [editingTickers, setEditingTickers] = useState(false)
  const [editValue,    setEditValue]    = useState("")
  const [oppLevels,    setOppLevels]    = useState<Record<string, GexLevels>>({})
  const [winRates,     setWinRates]     = useState<Record<string, { wr: number; n: number }>>({})
  const [phaseWinRate, setPhaseWinRate] = useState<{ wr: number; n: number } | null>(null)

  async function loadAll() {
    setLoading(true)

    // Todos los fetches en paralelo
    const [macroRes, gexRes, scanRes] = await Promise.allSettled([
      fetch("/api/macro").then(r => r.ok ? r.json() : null),
      fetch("/api/analysis?ticker=SPY").then(r => r.ok ? r.json() : null),
      fetch(`/api/scanner?tickers=${scanTickers}`).then(r => r.ok ? r.json() : null),
    ])

    if (macroRes.status === "fulfilled") setMacro(macroRes.value)
    if (gexRes.status   === "fulfilled") setGex(gexRes.value)
    if (scanRes.status  === "fulfilled") {
      const rows: AnomalyRow[] = scanRes.value?.rows ?? []
      setAnomalies(rows.sort((a, b) => b.anomalyScore - a.anomalyScore).slice(0, 5))
    }

    // Oportunidades: fetch en paralelo de 15 tickers
    const results = await Promise.all(
      OPP_TICKERS.map(async t => {
        try {
          const r = await fetch(`/api/stock/${t}`)
          if (!r.ok) return null
          const d: StockData = await r.json()
          return { ...d, score: scoreStock(d) } as Scored
        } catch { return null }
      })
    )
    const scored = results.filter(Boolean) as Scored[]
    const top5 = scored.sort((a, b) => b.score.buyScore - a.score.buyScore).slice(0, 5)
    setOpps(top5)

    // R2: GEX levels (soporte + gammaFlip) para el top-5
    const levelsResults = await Promise.allSettled(
      top5.map(async s => {
        try {
          const r = await fetch(`/api/analysis?ticker=${s.symbol}`)
          if (!r.ok) return null
          const d = await r.json()
          return { symbol: s.symbol, support: d.levels?.support ?? 0, gammaFlip: d.levels?.gammaFlip ?? 0 }
        } catch { return null }
      })
    )
    const levels: Record<string, GexLevels> = {}
    for (const r of levelsResults) {
      if (r.status === "fulfilled" && r.value) {
        levels[r.value.symbol] = { support: r.value.support, gammaFlip: r.value.gammaFlip }
      }
    }
    setOppLevels(levels)

    // R4: Win rates del Diario por señal y por fase macro
    try {
      const trades = getTrades()
      const closed = trades.filter(t => t.exitPrice != null)
      const sigGroups: Record<string, { wins: number; total: number }> = {}
      for (const t of closed) {
        if (!t.signalAtEntry) continue
        if (!sigGroups[t.signalAtEntry]) sigGroups[t.signalAtEntry] = { wins: 0, total: 0 }
        sigGroups[t.signalAtEntry].total++
        if ((tradeResult(t) ?? 0) > 0) sigGroups[t.signalAtEntry].wins++
      }
      const wrs: Record<string, { wr: number; n: number }> = {}
      for (const [sig, g] of Object.entries(sigGroups)) {
        if (g.total >= 5) wrs[sig] = { wr: Math.round((g.wins / g.total) * 100), n: g.total }
      }
      setWinRates(wrs)

      const currentPhase = macroRes.status === "fulfilled" ? macroRes.value?.detection?.phase : null
      if (currentPhase) {
        const phaseT = closed.filter(t => t.macroPhase === currentPhase)
        if (phaseT.length >= 5) {
          const wins = phaseT.filter(t => (tradeResult(t) ?? 0) > 0).length
          setPhaseWinRate({ wr: Math.round((wins / phaseT.length) * 100), n: phaseT.length })
        }
      }
    } catch {}

    setUpdatedAt(new Date().toLocaleTimeString("es-ES"))
    setLoading(false)
  }

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem(LS_SCAN_KEY) ?? DEFAULT_SCAN_TICKERS) : DEFAULT_SCAN_TICKERS
    setScanTickers(saved)
  }, [])

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const phase = macro?.detection?.phase
  const phaseCfg = phase ? PHASE_CFG[phase] : null

  // GEX regime
  const gammaPositivo = gex?.netGex !== undefined ? gex.netGex > 0 : null

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Morning brief · {updatedAt ? `Actualizado ${updatedAt}` : "Cargando..."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {!editingTickers && (
              <div className="flex items-center gap-1">
                {Object.entries(PRESET_UNIVERSES).map(([name, tickers]) => (
                  <button key={name} onClick={() => {
                    setScanTickers(tickers)
                    localStorage.setItem(LS_SCAN_KEY, tickers)
                  }}
                    className={`text-[10px] px-2 py-1 border transition-colors ${scanTickers === tickers ? "border-blue-600 text-blue-300 bg-blue-900/30" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>
                    {name}
                  </button>
                ))}
              </div>
            )}
            {editingTickers ? (
              <div className="flex items-center gap-2">
                <input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const cleaned = editValue.split(",").map(t => t.trim()).filter(Boolean).join(",")
                      if (cleaned) {
                        setScanTickers(cleaned)
                        localStorage.setItem(LS_SCAN_KEY, cleaned)
                      }
                      setEditingTickers(false)
                    }
                    if (e.key === "Escape") setEditingTickers(false)
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-blue-700 text-white font-mono w-72 focus:outline-none"
                  placeholder="SPY,QQQ,AAPL,..."
                  autoFocus
                />
                <button
                  onClick={() => {
                    const cleaned = editValue.split(",").map(t => t.trim()).filter(Boolean).join(",")
                    if (cleaned) { setScanTickers(cleaned); localStorage.setItem(LS_SCAN_KEY, cleaned) }
                    setEditingTickers(false)
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white transition-colors">
                  OK
                </button>
                <button onClick={() => setEditingTickers(false)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setEditValue(scanTickers); setEditingTickers(true) }}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                title="Editar tickers del scanner">
                ✏ Tickers
              </button>
            )}
            <button onClick={loadAll} disabled={loading}
              className="text-xs px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40 transition-colors">
              {loading ? "Actualizando..." : "↻ Actualizar"}
            </button>
          </div>
        </div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* ── Bloque 1: Régimen Macro ──────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="text-xs text-gray-500 tracking-widest font-bold mb-4">RÉGIMEN MACRO</div>
            {loading && !macro ? (
              <div className="space-y-2"><Skeleton h="h-8" /><Skeleton h="h-4" w="w-2/3" /></div>
            ) : phaseCfg && macro?.detection ? (
              <div>
                <div className={`inline-flex items-center gap-2 text-lg font-black px-4 py-2 rounded-xl border ${phaseCfg.badge} mb-4`}>
                  <span>{phaseCfg.icon}</span>
                  <span>{phaseCfg.label}</span>
                  <span className="text-sm font-normal opacity-80">{macro.detection.confidence}% confianza</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {macro.vix != null && (
                    <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">VIX</div>
                      <div className={`text-xl font-black font-mono ${macro.vix > 30 ? "text-red-400" : macro.vix > 20 ? "text-amber-400" : "text-green-400"}`}>
                        {macro.vix.toFixed(1)}
                      </div>
                    </div>
                  )}
                  {macro.vix3m != null && (
                    <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">VIX3M</div>
                      <div className="text-xl font-black font-mono text-gray-300">{macro.vix3m.toFixed(1)}</div>
                    </div>
                  )}
                  {(macro.equityPcr ?? macro.spyPcr) != null && (() => {
                    const pcr = (macro.equityPcr ?? macro.spyPcr)!
                    return (
                      <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                        <div className="text-xs text-gray-500 mb-1">{macro.equityPcr != null ? "PCR EQUITY" : "PCR SPY"}</div>
                        <div className={`text-xl font-black font-mono ${pcr > 1.2 ? "text-red-400" : pcr < 0.7 ? "text-green-400" : "text-gray-300"}`}>
                          {pcr.toFixed(2)}
                        </div>
                      </div>
                    )
                  })()}
                </div>
                {/* VIX term structure + alertas */}
                {(macro.vix9d != null || macro.vvix != null) && (
                  <div className="mt-3 space-y-1.5">
                    {macro.vix9d != null && macro.vix != null && (
                      <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                        <span className="text-gray-600 text-[10px] tracking-widest">VIX TERM</span>
                        <span className={macro.vix9d > macro.vix ? "text-amber-300 font-bold" : "text-gray-300"}>{macro.vix9d.toFixed(1)}<span className="text-gray-600 text-[9px] ml-0.5">9D</span></span>
                        <span className="text-gray-700">›</span>
                        <span>{macro.vix.toFixed(1)}<span className="text-gray-600 text-[9px] ml-0.5">30D</span></span>
                        {macro.vix3m != null && <><span className="text-gray-700">›</span><span>{macro.vix3m.toFixed(1)}<span className="text-gray-600 text-[9px] ml-0.5">3M</span></span></>}
                      </div>
                    )}
                    {macro.vix9d != null && macro.vix != null && macro.vix9d > macro.vix && (
                      <div className="text-[10px] px-2 py-0.5 rounded bg-amber-900/60 border border-amber-700 text-amber-200 inline-block">
                        ⚡ EVENTO INMINENTE — VIX9D ({macro.vix9d.toFixed(1)}) &gt; VIX ({macro.vix.toFixed(1)})
                      </div>
                    )}
                    {macro.vvix != null && macro.vvix > 100 && (
                      <div className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 border border-red-700 text-red-200 inline-block">
                        ⚠ ESTRÉS SISTÉMICO — VVIX {macro.vvix.toFixed(0)}
                      </div>
                    )}
                  </div>
                )}
                {phaseWinRate && (
                  <div className="mt-2 text-xs text-gray-500">
                    Esta fase en tu historial: <span className={`font-bold ${phaseWinRate.wr >= 50 ? "text-green-400" : "text-red-400"}`}>{phaseWinRate.wr}% WR</span> <span className="text-gray-600">({phaseWinRate.n} trades)</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-600 text-sm">Sin datos de macro disponibles</div>
            )}
          </div>

          {/* ── Bloque 2: GEX SPY ────────────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-gray-500 tracking-widest font-bold">GEX SPY</div>
              <Link href="/gex?ticker=SPY" className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">
                Ver análisis completo →
              </Link>
            </div>
            {loading && !gex ? (
              <div className="space-y-2"><Skeleton h="h-8" /><Skeleton h="h-4" /></div>
            ) : gex ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  {gex.spot && (
                    <div className="text-2xl font-black font-mono text-white">{usd(gex.spot)}</div>
                  )}
                  {gammaPositivo !== null && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${gammaPositivo ? "bg-emerald-800 text-emerald-200" : "bg-red-900 text-red-200"}`}>
                      GAMMA {gammaPositivo ? "▲ POSITIVO" : "▼ NEGATIVO"}
                    </span>
                  )}
                </div>
                {gex.levels && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "CALL WALL", value: gex.levels.callWall, color: "text-green-400" },
                      { label: "GAMMA FLIP", value: gex.levels.gammaFlip, color: "text-yellow-400" },
                      { label: "PUT WALL", value: gex.levels.putWall, color: "text-red-400" },
                    ].map(n => (
                      <div key={n.label} className="bg-gray-800/60 rounded-xl p-3 text-center">
                        <div className="text-[9px] text-gray-500 tracking-widest mb-1">{n.label}</div>
                        <div className={`text-lg font-black font-mono ${n.color}`}>{usd(n.value)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {gex.presionInstitucional != null && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="text-xs text-gray-500">Presión institucional</div>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${gex.presionInstitucional >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(100, Math.abs(gex.presionInstitucional))}%` }}
                      />
                    </div>
                    <div className={`text-xs font-mono font-bold ${gex.presionInstitucional >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {gex.presionInstitucional.toFixed(0)}%
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-600 text-sm">Sin datos de GEX disponibles</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Bloque 3: Top Oportunidades ──────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-gray-500 tracking-widest font-bold">TOP OPORTUNIDADES</div>
              <Link href="/" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">
                Ver screener →
              </Link>
            </div>
            {loading && opps.length === 0 ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} h="h-12" />)}
              </div>
            ) : opps.length === 0 ? (
              <div className="text-gray-600 text-sm">Sin oportunidades detectadas</div>
            ) : (
              <div className="space-y-2">
                {opps.map(s => {
                  const sig = SIGNAL_CFG[s.score.signal]
                  return (
                    <Link key={s.symbol} href={`/empresa/${s.symbol}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors group">
                      <div className="w-10 text-center">
                        <GradeBadge grade={s.score.grade} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm">{s.symbol}</div>
                        <div className="text-xs text-gray-500 truncate">{s.company}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm text-white">{usd(s.currentPrice)}</div>
                        {oppLevels[s.symbol]?.support > 0 && (
                          <div className="text-[10px] font-mono mt-0.5">
                            <span className="text-emerald-400">↓{usd(oppLevels[s.symbol].support)}</span>
                            <span className="text-gray-600 ml-1">stop {usd(oppLevels[s.symbol].gammaFlip)}</span>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sig?.cls ?? "bg-gray-700 text-white"}`}>
                          {sig?.icon} {s.score.signal}
                        </span>
                        {winRates[s.score.signal] && (
                          <div className={`text-[9px] font-mono mt-0.5 text-center ${winRates[s.score.signal].wr >= 50 ? "text-green-400" : "text-red-400"}`}>
                            {winRates[s.score.signal].wr}% WR ({winRates[s.score.signal].n})
                          </div>
                        )}
                      </div>
                      <div className="text-xs font-mono text-gray-400 shrink-0 w-8 text-right">
                        {s.score.buyScore}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Bloque 4: Anomalías de Opciones ──────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-gray-500 tracking-widest font-bold">ANOMALÍAS OI</div>
              <Link href="/scanner" className="text-xs text-orange-500 hover:text-orange-400 transition-colors">
                Ver scanner →
              </Link>
            </div>
            {loading && anomalies.length === 0 ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} h="h-12" />)}
              </div>
            ) : anomalies.length === 0 ? (
              <div className="text-gray-600 text-sm">Sin anomalías detectadas</div>
            ) : (
              <div className="space-y-2">
                {anomalies.map((r, i) => (
                  <Link key={i} href={`/empresa/${r.ticker}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors">
                    <div className="shrink-0 text-center">
                      <div className="font-black text-white text-sm">{r.ticker}</div>
                      <div className={`text-[10px] font-bold px-1 py-0.5 rounded ${r.type === "CALL" ? "bg-green-800 text-green-200" : "bg-red-900 text-red-200"}`}>
                        {r.type}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono text-white">Strike {usd(r.strike)}</div>
                      <div className="text-xs text-gray-500">{r.expiration} · OI {r.oi.toLocaleString()}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xs font-bold px-1.5 py-0.5 rounded ${r.bias === "BULLISH" ? "bg-emerald-800 text-emerald-200" : r.bias === "BEARISH" ? "bg-red-900 text-red-200" : "bg-gray-700 text-gray-300"}`}>
                        {r.bias}
                      </div>
                      <div className={`text-xs font-mono mt-0.5 ${r.anomalyScore >= 3 ? "text-red-400 font-bold" : r.anomalyScore >= 2 ? "text-orange-400" : "text-yellow-500"}`}>
                        Score {r.anomalyScore.toFixed(1)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  )
}
