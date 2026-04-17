"use client"

import { useState, useEffect } from "react"
import type { Analysis7Result, SRCluster, TimingBlock, MethodologyContribution } from "@/lib/gex7"

// ── Types ─────────────────────────────────────────────────────────────────────

type GammaLevels = {
  callWall: number
  putWall: number
  gammaFlip: number
  maxPain: number
  netGex: number
  putCallRatio: number
}

type FlowComponents = { pcr: number; gammaDealer: number; institutional: number; m5Signal: number }
type FlowScoreData  = { score: number; regime: string; gammaRegime: string; detections: string[]; components: FlowComponents }
type LiquidityData  = { score: number; label: string }
type UnifiedScore   = { score: number; classification: string; probability: number; components: { macro: number; expectations: number; positioning: number; flows: number; liquidity: number } }

type GammaMapResult = Analysis7Result & {
  gammaLevels:    GammaLevels
  flowScore:      FlowScoreData
  liquidityScore: LiquidityData
  availableExpirations: string[]
}

const TICKERS = ["SPY", "QQQ"] as const
type Ticker = (typeof TICKERS)[number]

type MacroComponents = { growth: number; labor: number; credit: number; inflation: number; volatility: number }
type MacroScoreData = { score: number; regime: string; volDirection: string; components: MacroComponents }
type ExpectationShiftData = { score: number; label: string; fedBias: string; breakevens: string; yieldCurveTrend: string; shocks: string[] }
type MacroResult = { macroScore: MacroScoreData; expectationShift: ExpectationShiftData; detection: { phase: string; confidence: number; signals: string[] }; vix: number | null; vix3m: number | null; equityPcr: number | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 2) {
  if (n == null || isNaN(n)) return "—"
  return n.toFixed(d)
}

function fmtGex(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`
  return v.toFixed(2)
}

function verdictCls(v: string) {
  if (v === "ALCISTA") return "text-emerald-400"
  if (v === "BAJISTA") return "text-red-400"
  return "text-yellow-400"
}

function verdictBg(v: string) {
  if (v === "ALCISTA") return "bg-emerald-900/40 border-emerald-700 text-emerald-300"
  if (v === "BAJISTA") return "bg-red-900/40 border-red-700 text-red-300"
  return "bg-yellow-900/40 border-yellow-700 text-yellow-300"
}

function regimeBg(r: string) {
  if (r?.includes("COMPRESIÓN"))                      return "bg-emerald-900/40 border-emerald-700 text-emerald-300"
  if (r?.includes("EXPANSIÓN"))                       return "bg-orange-900/40 border-orange-700 text-orange-300"
  if (r?.includes("PÁNICO") || r?.includes("CRISIS")) return "bg-red-900/40 border-red-700 text-red-300"
  return "bg-blue-900/40 border-blue-700 text-blue-300"
}

function signalCls(s: string) {
  if (s === "ALCISTA")   return "text-emerald-400"
  if (s === "BAJISTA")   return "text-red-400"
  if (s === "NO OPERAR") return "text-yellow-500"
  return "text-subtle"
}

function unifiedCls(score: number) {
  if (score >= 75) return "text-emerald-400"
  if (score >= 60) return "text-green-400"
  if (score >= 40) return "text-yellow-400"
  if (score >= 25) return "text-orange-400"
  return "text-red-400"
}

function unifiedBg(score: number) {
  if (score >= 75) return "bg-emerald-900/40 border-emerald-600 text-emerald-200"
  if (score >= 60) return "bg-green-900/40 border-green-700 text-green-200"
  if (score >= 40) return "bg-yellow-900/40 border-yellow-700 text-yellow-200"
  if (score >= 25) return "bg-orange-900/40 border-orange-700 text-orange-200"
  return "bg-red-900/40 border-red-700 text-red-200"
}

function computeUnified(gex: GammaMapResult, macro: MacroResult): UnifiedScore {
  const n = (v: number) => Math.max(0, Math.min(100, Math.round((v + 100) / 2)))
  const m2 = gex.contributions?.find(c => c.id === "M2")
  const macroN       = Math.max(0, Math.min(100, Math.round(macro.macroScore.score)))
  const expectN      = n(macro.expectationShift.score)
  const positioningN = m2 ? n(m2.rawScore) : 50
  const flowN        = gex.flowScore ? n(gex.flowScore.score) : 50
  const liquidityN   = gex.liquidityScore?.score ?? 60
  const score = Math.round(macroN * 0.25 + expectN * 0.15 + positioningN * 0.20 + flowN * 0.30 + liquidityN * 0.10)
  const classification =
    score >= 75 ? "AGGRESSIVE LONG" :
    score >= 60 ? "LONG" :
    score >= 40 ? "NEUTRAL" :
    score >= 25 ? "SHORT" :
    "AGGRESSIVE SHORT"
  return {
    score,
    classification,
    probability: Math.min(95, Math.round(50 + Math.abs(score - 50) * 0.8)),
    components: { macro: macroN, expectations: expectN, positioning: positioningN, flows: flowN, liquidity: liquidityN },
  }
}

function fearCls(f: number) {
  if (f >= 70) return "text-red-400"
  if (f >= 50) return "text-orange-400"
  if (f >= 30) return "text-yellow-400"
  return "text-emerald-400"
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Skeleton({ w = "w-full", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} bg-gray-800 rounded animate-pulse`} />
}

function ScoreMeter({ score }: { score: number }) {
  const pct = Math.round(((score + 100) / 200) * 100)
  const color = score > 25 ? "bg-emerald-500" : score < -25 ? "bg-red-500" : "bg-yellow-500"
  return (
    <div className="w-full">
      <div className="relative h-2 w-full bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
      </div>
      <div className="flex justify-between text-xs text-muted mt-0.5 font-mono">
        <span>-100</span><span>0</span><span>+100</span>
      </div>
    </div>
  )
}

function GammaLevelStrip({ levels, spot }: { levels: GammaLevels; spot: number }) {
  const allValues = [levels.callWall, levels.putWall, levels.gammaFlip, levels.maxPain, spot].filter(v => v > 0)
  if (!allValues.length) return null

  const minV = Math.min(...allValues)
  const maxV = Math.max(...allValues)
  const pad  = (maxV - minV) * 0.15 || spot * 0.02
  const lo   = minV - pad
  const hi   = maxV + pad
  const range = hi - lo

  function pos(v: number) {
    return Math.max(2, Math.min(98, ((v - lo) / range) * 100))
  }

  const markers = [
    { label: "C.Wall",  value: levels.callWall,  color: "#f04444", top: true  },
    { label: "G.Flip",  value: levels.gammaFlip, color: "#fbbf24", top: false },
    { label: "MaxPain", value: levels.maxPain,   color: "#8b98b0", top: true  },
    { label: "P.Wall",  value: levels.putWall,   color: "#3b82f6", top: false },
  ]

  return (
    <div className="relative h-24 w-full mt-3">
      <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />

      {/* Spot */}
      <div
        className="absolute flex flex-col items-center -translate-x-1/2"
        style={{ left: `${pos(spot)}%`, top: "36%" }}
      >
        <div className="w-3 h-3 rounded-full bg-accent border-2 border-white/20" />
        <span className="text-xs font-mono font-bold text-accent whitespace-nowrap">${fmt(spot)}</span>
        <span className="text-xs text-muted">SPOT</span>
      </div>

      {markers.map(m => m.value > 0 && (
        <div
          key={m.label}
          className="absolute flex flex-col items-center -translate-x-1/2"
          style={{ left: `${pos(m.value)}%`, top: m.top ? "2%" : "58%" }}
        >
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
          <span className="text-xs font-mono whitespace-nowrap" style={{ color: m.color }}>${fmt(m.value)}</span>
          <span className="text-xs text-muted">{m.label}</span>
        </div>
      ))}
    </div>
  )
}

function ContributionsTable({ contributions }: { contributions: MethodologyContribution[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-muted tracking-wide border-b border-border">
            <th className="text-left py-1.5 pr-4">METODOLOGÍA</th>
            <th className="text-right pr-4">PESO</th>
            <th className="text-right pr-4">SCORE</th>
            <th className="text-right">CONTRIB.</th>
          </tr>
        </thead>
        <tbody>
          {contributions.map(c => (
            <tr key={c.id} className="border-b border-border/50 hover:bg-surface/50">
              <td className="py-1.5 pr-4">
                <span className="text-muted">{c.id}</span>{" "}
                <span className="text-subtle">{c.name}</span>
              </td>
              <td className="text-right pr-4 text-subtle">{Math.round(c.weight * 100)}%</td>
              <td className={`text-right pr-4 font-bold ${c.rawScore > 0 ? "text-emerald-400" : c.rawScore < 0 ? "text-red-400" : "text-subtle"}`}>
                {c.rawScore > 0 ? "+" : ""}{fmt(c.rawScore, 0)}
              </td>
              <td className={`text-right font-bold ${c.contribution > 0 ? "text-emerald-400" : c.contribution < 0 ? "text-red-400" : "text-subtle"}`}>
                {c.contribution > 0 ? "+" : ""}{fmt(c.contribution, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SRTable({ clusters }: { clusters: SRCluster[] }) {
  if (!clusters.length) return (
    <p className="text-sm text-muted text-center py-4">Sin niveles institucionales disponibles</p>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-muted tracking-wide border-b border-border">
            <th className="text-left py-1.5 pr-3">STRIKE</th>
            <th className="text-left pr-3">TIPO</th>
            <th className="text-right pr-3">DIST%</th>
            <th className="text-right pr-3">CAL</th>
            <th className="text-right pr-3">VOTOS</th>
            <th className="text-left pr-3">FUENTES</th>
            <th className="text-right pr-3">HIST</th>
            <th className="text-right pr-3">ENTRY</th>
            <th className="text-right pr-3">TARGET</th>
            <th className="text-right pr-3">STOP</th>
            <th className="text-right">R/R</th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((c, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-surface/50">
              <td className={`py-1.5 pr-3 font-bold ${c.type === "support" ? "text-emerald-400" : "text-red-400"}`}>
                ${fmt(c.strike)}
              </td>
              <td className={`pr-3 ${c.type === "support" ? "text-emerald-400" : "text-red-400"}`}>
                {c.type === "support" ? "SOPO" : "RESI"}
              </td>
              <td className={`text-right pr-3 ${c.distPct > 0 ? "text-red-300" : "text-emerald-300"}`}>
                {c.distPct > 0 ? "+" : ""}{fmt(c.distPct * 100, 1)}%
              </td>
              <td className={`text-right pr-3 font-bold ${c.calificacion >= 70 ? "text-emerald-400" : c.calificacion >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {c.calificacion}
              </td>
              <td className="text-right pr-3 text-subtle">{c.votes}/4</td>
              <td className="pr-3 text-blue-400">{c.sources.join(" ")}</td>
              <td className={`text-right pr-3 ${(c.historicalDays ?? 0) >= 5 ? "text-emerald-400" : "text-subtle"}`}>
                {c.historicalDays ?? 0}d
              </td>
              <td className="text-right pr-3 text-text">${fmt(c.entryPrice)}</td>
              <td className="text-right pr-3 text-emerald-400">
                {c.targetPrice ? `$${fmt(c.targetPrice)}` : "—"}
              </td>
              <td className="text-right pr-3 text-red-400">${fmt(c.stopPrice)}</td>
              <td className={`text-right font-bold ${(c.rrRatio ?? 0) >= 2 ? "text-emerald-400" : "text-subtle"}`}>
                {c.rrRatio ? `${fmt(c.rrRatio, 1)}x` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TimingMatrix({ matrix }: { matrix: TimingBlock[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {matrix.map(block => (
        <div key={block.timeframe} className="border border-border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold tracking-widest text-subtle">{block.timeframe}</span>
            <span className={`text-xs font-bold ${signalCls(block.signal)}`}>{block.signal}</span>
          </div>
          {block.entry != null ? (
            <div className="flex gap-3 text-xs font-mono flex-wrap">
              <span className="text-muted">E <span className="text-text">${fmt(block.entry)}</span></span>
              <span className="text-muted">T <span className="text-emerald-400">{block.target ? `$${fmt(block.target)}` : "—"}</span></span>
              <span className="text-muted">S <span className="text-red-400">{block.stop ? `$${fmt(block.stop)}` : "—"}</span></span>
              {block.rrRatio && <span className="text-muted">R/R <span className="text-text">{block.rrRatio}</span></span>}
            </div>
          ) : (
            <p className="text-xs text-muted">{block.condition}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${block.signal === "ALCISTA" ? "bg-emerald-500" : block.signal === "BAJISTA" ? "bg-red-500" : "bg-yellow-500"}`}
                style={{ width: `${block.conviction}%` }}
              />
            </div>
            <span className="text-xs text-muted font-mono">{block.conviction}%</span>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">{block.basis}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GammaMapPage() {
  const [data, setData]       = useState<Record<Ticker, GammaMapResult | null>>({ SPY: null, QQQ: null })
  const [loading, setLoading] = useState<Record<Ticker, boolean>>({ SPY: true, QQQ: true })
  const [errors, setErrors]   = useState<Record<Ticker, string>>({ SPY: "", QQQ: "" })
  const [active, setActive]   = useState<Ticker>("SPY")
  const [lastUpdate, setLastUpdate] = useState("")
  const [macro, setMacro]     = useState<MacroResult | null>(null)
  const [macroLoading, setMacroLoading] = useState(false)

  function fetchTicker(t: Ticker) {
    setLoading(prev => ({ ...prev, [t]: true }))
    setErrors(prev => ({ ...prev, [t]: "" }))
    fetch(`/api/analysis7?ticker=${t}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(prev => ({ ...prev, [t]: d }))
        setLastUpdate(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }))
      })
      .catch(e => setErrors(prev => ({ ...prev, [t]: e.message })))
      .finally(() => setLoading(prev => ({ ...prev, [t]: false })))
  }

  function fetchMacro() {
    setMacroLoading(true)
    fetch("/api/macro")
      .then(r => r.json())
      .then(d => setMacro(d))
      .catch(() => null)
      .finally(() => setMacroLoading(false))
  }

  function refreshAll() {
    TICKERS.forEach(fetchTicker)
    fetchMacro()
  }

  useEffect(() => { refreshAll() }, [])

  const d         = data[active]
  const isLoading = loading[active]
  const err       = errors[active]

  return (
    <main className="min-h-screen bg-bg text-text p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-widest text-text">GAMMA MAP</h1>
          <p className="text-xs text-muted tracking-wide">Análisis institucional de microestructura · SPY · QQQ</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && <span className="text-xs text-muted font-mono">{lastUpdate}</span>}
          <button
            onClick={refreshAll}
            disabled={loading.SPY || loading.QQQ}
            className="px-3 py-1.5 text-xs font-bold bg-accent text-white rounded hover:opacity-80 disabled:opacity-40 transition-opacity tracking-wide"
          >
            ↻ ACTUALIZAR
          </button>
        </div>
      </div>

      {/* Dual compare cards */}
      <div className="flex gap-3 mb-6">
        {TICKERS.map(t => {
          const td = data[t]
          return (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={`flex-1 text-left p-4 border rounded-lg transition-all ${
                active === t ? "border-accent bg-surface" : "border-border bg-card hover:border-gray-600"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold tracking-widest text-subtle">{t}</span>
                {td && (
                  <span className={`text-xs px-2 py-0.5 border rounded font-bold ${verdictBg(td.finalVerdict)}`}>
                    {td.finalVerdict}
                  </span>
                )}
              </div>

              {loading[t] && (
                <div className="space-y-2">
                  <Skeleton h="h-3" /><Skeleton h="h-3" w="w-3/4" />
                </div>
              )}
              {errors[t] && !loading[t] && (
                <p className="text-xs text-danger truncate">{errors[t]}</p>
              )}
              {td && !loading[t] && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-mono font-bold ${verdictCls(td.finalVerdict)}`}>
                      {td.finalScore > 0 ? "+" : ""}{td.finalScore}
                    </span>
                    <span className="text-xs text-subtle font-mono">{td.confidence}% conf.</span>
                  </div>
                  <ScoreMeter score={td.finalScore} />
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 border rounded ${regimeBg(td.m6Regime)}`}>
                      {td.m6Regime}
                    </span>
                    <span className={`text-xs font-mono ${fearCls(td.m6FearScore)}`}>
                      Fear {td.m6FearScore}
                    </span>
                  </div>
                  {td.gammaLevels && (
                    <div className="text-xs text-subtle font-mono flex gap-3">
                      <span>Flip <span className="text-text">${fmt(td.gammaLevels.gammaFlip)}</span></span>
                      <span>Spot <span className="text-text">${fmt(td.spot)}</span></span>
                    </div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-border rounded-lg p-4 bg-card">
              <Skeleton h="h-3" w="w-1/4" />
              <div className="mt-3 space-y-2">
                <Skeleton /><Skeleton w="w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {err && !isLoading && (
        <div className="p-4 border border-danger text-danger text-sm tracking-wide rounded">
          ✕ {err}
        </div>
      )}

      {/* Detail */}
      {d && !isLoading && (
        <div className="space-y-4">

          {/* Unified Score — output final del framework */}
          {macro && (() => {
            const u = computeUnified(d, macro)
            const compRows: [string, keyof typeof u.components, number][] = [
              ["MACRO",         "macro",        0.25],
              ["EXPECTATIONS",  "expectations", 0.15],
              ["POSITIONING",   "positioning",  0.20],
              ["FLOWS",         "flows",        0.30],
              ["LIQUIDITY",     "liquidity",    0.10],
            ]
            return (
              <div className={`border rounded-lg p-4 ${unifiedBg(u.score)}`}>
                <p className="text-xs tracking-widest opacity-70 mb-3">TOTAL SCORE — DECISIÓN OPERATIVA</p>
                <div className="flex items-center gap-5 mb-4">
                  <span className={`text-6xl font-mono font-bold ${unifiedCls(u.score)}`}>{u.score}</span>
                  <div>
                    <p className={`text-base font-bold tracking-wider ${unifiedCls(u.score)}`}>{u.classification}</p>
                    <p className="text-xs opacity-60 font-mono mt-0.5">Probabilidad {u.probability}%</p>
                  </div>
                </div>
                <div className="h-2.5 w-full bg-black/30 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${u.score >= 60 ? "bg-emerald-400" : u.score >= 40 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${u.score}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs opacity-50 font-mono mb-4">
                  <span>0 — AGG SHORT</span><span>50 — NEUTRAL</span><span>AGG LONG — 100</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {compRows.map(([label, key, weight]) => {
                    const v = u.components[key]
                    const bar = v >= 60 ? "bg-emerald-500" : v >= 40 ? "bg-yellow-500" : "bg-red-500"
                    return (
                      <div key={key} className="text-center">
                        <p className="text-xs opacity-50 tracking-wide">{label}</p>
                        <p className={`text-lg font-mono font-bold ${unifiedCls(v)}`}>{v}</p>
                        <p className="text-xs opacity-40">{Math.round(weight * 100)}%</p>
                        <div className="h-1 w-full bg-black/30 rounded-full overflow-hidden mt-1">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${v}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Signal suspended */}
          {d.signalSuspended && (
            <div className="p-4 border border-yellow-700 bg-yellow-900/20 rounded-lg">
              <p className="text-yellow-300 text-sm font-bold tracking-wide">⚠ SEÑAL SUSPENDIDA</p>
              <p className="text-yellow-400/80 text-xs mt-1">{d.suspendedReason}</p>
            </div>
          )}

          {/* Regime + VIX + Fear */}
          <div className="border border-border bg-card rounded-lg p-4">
            <p className="text-xs text-muted tracking-widest mb-3">RÉGIMEN DE MERCADO</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted mb-1">RÉGIMEN</p>
                <span className={`text-xs px-2 py-1 border rounded font-bold ${regimeBg(d.m6Regime)}`}>
                  {d.m6Regime}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted mb-1">VIX</p>
                <p className="font-mono font-bold text-text text-lg">{fmt(d.m6Vix)}</p>
                <p className="text-xs text-muted">{d.m6VixVelocity}</p>
              </div>
              <div>
                <p className="text-xs text-muted mb-1">FEAR SCORE</p>
                <p className={`font-mono font-bold text-2xl ${fearCls(d.m6FearScore)}`}>
                  {d.m6FearScore}
                  <span className="text-xs text-muted">/100</span>
                </p>
                <p className="text-xs text-muted">{d.m6FearLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted mb-1">PUT/CALL RATIO</p>
                <p className="font-mono font-bold text-text text-lg">
                  {d.gammaLevels ? fmt(d.gammaLevels.putCallRatio) : "—"}
                </p>
                <p className="text-xs text-muted">
                  {d.gammaLevels
                    ? d.gammaLevels.putCallRatio > 1 ? "Sesgo bajista" : "Sesgo alcista"
                    : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Gamma Levels */}
          {d.gammaLevels && (
            <div className="border border-border bg-card rounded-lg p-4">
              <p className="text-xs text-muted tracking-widest mb-3">NIVELES GAMMA</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: "CALL WALL",  value: d.gammaLevels.callWall,  color: "text-red-400" },
                  {
                    label: "GAMMA FLIP",
                    value: d.gammaLevels.gammaFlip,
                    color: "text-yellow-400",
                    sub: d.spot > d.gammaLevels.gammaFlip ? "↑ spot sobre flip" : "↓ spot bajo flip",
                  },
                  { label: "SPOT",      value: d.spot,                  color: "text-accent" },
                  { label: "PUT WALL",  value: d.gammaLevels.putWall,   color: "text-blue-400" },
                  { label: "MAX PAIN",  value: d.gammaLevels.maxPain,   color: "text-subtle" },
                ].map(item => (
                  <div key={item.label} className="text-center">
                    <p className="text-xs text-muted tracking-wide">{item.label}</p>
                    <p className={`text-xl font-mono font-bold ${item.color}`}>${fmt(item.value)}</p>
                    {"sub" in item && item.sub && (
                      <p className={`text-xs opacity-70 ${item.color}`}>{item.sub}</p>
                    )}
                  </div>
                ))}
              </div>

              <GammaLevelStrip levels={d.gammaLevels} spot={d.spot} />

              <div className="flex gap-4 text-xs font-mono flex-wrap mt-2 pt-2 border-t border-border">
                <span className="text-muted">
                  Net GEX{" "}
                  <span className={`font-bold ${d.gammaLevels.netGex >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {d.gammaLevels.netGex >= 0 ? "+" : ""}{fmtGex(d.gammaLevels.netGex)}
                  </span>
                </span>
                <span className="text-muted">
                  Régimen γ{" "}
                  <span className={`font-bold ${d.gammaLevels.netGex >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {d.gammaLevels.netGex >= 0 ? "POSITIVO → estabilidad" : "NEGATIVO → volatilidad"}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Score M7 */}
          <div className="border border-border bg-card rounded-lg p-4">
            <p className="text-xs text-muted tracking-widest mb-3">SCORE M7 — VEREDICTO FINAL</p>
            <div className="flex items-center gap-4 mb-4">
              <span className={`text-5xl font-mono font-bold ${verdictCls(d.finalVerdict)}`}>
                {d.finalScore > 0 ? "+" : ""}{d.finalScore}
              </span>
              <div>
                <span className={`text-sm font-bold px-2 py-1 border rounded ${verdictBg(d.finalVerdict)}`}>
                  {d.finalVerdict}
                </span>
                <p className="text-xs text-muted mt-1">
                  Confianza {d.confidence}% · Mult. régimen ×{fmt(d.regimeMultiplier, 2)}
                </p>
              </div>
            </div>
            <ScoreMeter score={d.finalScore} />
            <div className="mt-4">
              <ContributionsTable contributions={d.contributions} />
            </div>
          </div>

          {/* Primary Long / Short */}
          {(d.primaryLong || d.primaryShort) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {d.primaryLong && (
                <div className="border border-emerald-800 bg-emerald-900/20 rounded-lg p-4">
                  <p className="text-xs text-emerald-400 tracking-widest font-bold mb-3">LONG PRIMARIO</p>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-2">
                    <div>
                      <p className="text-muted">ENTRY</p>
                      <p className="text-text font-bold">${fmt(d.primaryLong.entryPrice)}</p>
                    </div>
                    <div>
                      <p className="text-muted">TARGET</p>
                      <p className="text-emerald-400 font-bold">
                        {d.primaryLong.targetPrice ? `$${fmt(d.primaryLong.targetPrice)}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">STOP</p>
                      <p className="text-red-400 font-bold">${fmt(d.primaryLong.stopPrice)}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs font-mono text-muted flex-wrap">
                    <span>Cal <span className="text-text">{d.primaryLong.calificacion}</span></span>
                    <span>Votos <span className="text-text">{d.primaryLong.votes}/4</span></span>
                    {d.primaryLong.rrRatio != null && (
                      <span>R/R <span className={`font-bold ${d.primaryLong.rrRatio >= 2 ? "text-emerald-400" : "text-text"}`}>{fmt(d.primaryLong.rrRatio, 1)}x</span></span>
                    )}
                    {(d.primaryLong.historicalDays ?? 0) > 0 && (
                      <span>Hist <span className="text-emerald-400">{d.primaryLong.historicalDays}d</span></span>
                    )}
                  </div>
                </div>
              )}
              {d.primaryShort && (
                <div className="border border-red-800 bg-red-900/20 rounded-lg p-4">
                  <p className="text-xs text-red-400 tracking-widest font-bold mb-3">SHORT PRIMARIO</p>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-2">
                    <div>
                      <p className="text-muted">ENTRY</p>
                      <p className="text-text font-bold">${fmt(d.primaryShort.entryPrice)}</p>
                    </div>
                    <div>
                      <p className="text-muted">TARGET</p>
                      <p className="text-emerald-400 font-bold">
                        {d.primaryShort.targetPrice ? `$${fmt(d.primaryShort.targetPrice)}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">STOP</p>
                      <p className="text-red-400 font-bold">${fmt(d.primaryShort.stopPrice)}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs font-mono text-muted flex-wrap">
                    <span>Cal <span className="text-text">{d.primaryShort.calificacion}</span></span>
                    <span>Votos <span className="text-text">{d.primaryShort.votes}/4</span></span>
                    {d.primaryShort.rrRatio != null && (
                      <span>R/R <span className={`font-bold ${d.primaryShort.rrRatio >= 2 ? "text-emerald-400" : "text-text"}`}>{fmt(d.primaryShort.rrRatio, 1)}x</span></span>
                    )}
                    {(d.primaryShort.historicalDays ?? 0) > 0 && (
                      <span>Hist <span className="text-emerald-400">{d.primaryShort.historicalDays}d</span></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* S/R Institutional Table */}
          <div className="border border-border bg-card rounded-lg p-4">
            <p className="text-xs text-muted tracking-widest mb-3">NIVELES S/R INSTITUCIONALES</p>
            <SRTable clusters={d.srTable} />
          </div>

          {/* Timing Matrix */}
          <div className="border border-border bg-card rounded-lg p-4">
            <p className="text-xs text-muted tracking-widest mb-3">TIMING MATRIX</p>
            <TimingMatrix matrix={d.timingMatrix} />
          </div>

          {/* Summary */}
          {d.summaryLines.length > 0 && (
            <div className="border border-border bg-card rounded-lg p-4">
              <p className="text-xs text-muted tracking-widest mb-3">ANÁLISIS NARRATIVO</p>
              <ul className="space-y-2">
                {d.summaryLines.map((line, i) => (
                  <li key={i} className="flex gap-2 text-sm text-subtle">
                    <span className="text-accent shrink-0">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Flow Score */}
          {d.flowScore && (() => {
            const f = d.flowScore
            const flowCls = f.score > 20 ? "text-emerald-400" : f.score < -20 ? "text-red-400" : "text-yellow-400"
            const compRows: [string, keyof FlowComponents][] = [
              ["PCR",           "pcr"],
              ["DEALER γ",      "gammaDealer"],
              ["INSTITUCIONAL", "institutional"],
              ["M5 SIGNAL",     "m5Signal"],
            ]
            return (
              <div className="border border-border bg-card rounded-lg p-4">
                <p className="text-xs text-muted tracking-widest mb-3">FLOWS — POSICIONAMIENTO REAL</p>
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  <span className={`text-4xl font-mono font-bold ${flowCls}`}>
                    {f.score > 0 ? "+" : ""}{f.score}
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-1 border rounded font-bold ${
                      f.regime === "CALL DOMINANT" ? "bg-emerald-900/40 border-emerald-700 text-emerald-300" :
                      f.regime === "PUT DOMINANT"  ? "bg-red-900/40 border-red-700 text-red-300" :
                      "bg-gray-800 border-gray-700 text-subtle"
                    }`}>{f.regime}</span>
                    <span className={`text-xs px-2 py-1 border rounded font-bold ${
                      f.gammaRegime === "POSITIVE γ"
                        ? "bg-emerald-900/40 border-emerald-700 text-emerald-300"
                        : "bg-red-900/40 border-red-700 text-red-300"
                    }`}>{f.gammaRegime}</span>
                    {d.liquidityScore && (
                      <span className={`text-xs px-2 py-1 border rounded font-bold ${
                        d.liquidityScore.label === "HIGH"     ? "bg-emerald-900/40 border-emerald-700 text-emerald-300" :
                        d.liquidityScore.label === "MODERATE" ? "bg-blue-900/40 border-blue-700 text-blue-300" :
                        d.liquidityScore.label === "LOW"      ? "bg-orange-900/40 border-orange-700 text-orange-300" :
                        "bg-red-900/40 border-red-700 text-red-300"
                      }`}>LIQ {d.liquidityScore.label} {d.liquidityScore.score}</span>
                    )}
                  </div>
                </div>

                {/* Score bar */}
                <div className="relative h-2 w-full bg-border rounded-full overflow-hidden mb-1">
                  <div className={`h-full rounded-full transition-all duration-500 ${f.score > 20 ? "bg-emerald-500" : f.score < -20 ? "bg-red-500" : "bg-yellow-500"}`}
                    style={{ width: `${(f.score + 100) / 2}%` }} />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
                </div>
                <div className="flex justify-between text-xs text-muted mb-3 font-mono">
                  <span>-100</span><span>0</span><span>+100</span>
                </div>

                {/* Components */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  {compRows.map(([label, key]) => {
                    const v = f.components[key]
                    const c = v > 15 ? "text-emerald-400" : v < -15 ? "text-red-400" : "text-yellow-400"
                    return (
                      <div key={key} className="text-center border border-border rounded p-2 bg-surface">
                        <p className="text-xs text-muted tracking-wide">{label}</p>
                        <p className={`text-lg font-mono font-bold ${c}`}>{v > 0 ? "+" : ""}{v}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Detections */}
                {f.detections.length > 0 && (
                  <ul className="space-y-1">
                    {f.detections.map((det, i) => (
                      <li key={i} className="flex gap-2 text-xs text-subtle">
                        <span className="text-blue-400 shrink-0">⟶</span>
                        <span>{det}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })()}

          {/* Macro Score */}
          {(macro || macroLoading) && (
            <div className="border border-border bg-card rounded-lg p-4">
              <p className="text-xs text-muted tracking-widest mb-3">MACRO SCORE — ENTORNO ECONÓMICO</p>

              {macroLoading && (
                <div className="space-y-2"><Skeleton /><Skeleton w="w-3/4" /></div>
              )}

              {macro && !macroLoading && (() => {
                const ms = macro.macroScore
                const es = macro.expectationShift
                const det = macro.detection

                const regimeBgMacro = ms.regime === "RISK ON"
                  ? "bg-emerald-900/40 border-emerald-700 text-emerald-300"
                  : ms.regime === "RISK OFF"
                  ? "bg-red-900/40 border-red-700 text-red-300"
                  : "bg-yellow-900/40 border-yellow-700 text-yellow-300"

                const volDirCls = ms.volDirection === "EXPANDING"
                  ? "text-red-400"
                  : ms.volDirection === "COMPRESSING"
                  ? "text-emerald-400"
                  : "text-yellow-400"

                const esCls = es.score > 20 ? "text-emerald-400" : es.score < -20 ? "text-red-400" : "text-yellow-400"

                const componentLabels: [keyof MacroComponents, string][] = [
                  ["growth",    "CRECIMIENTO"],
                  ["labor",     "LABORAL"],
                  ["credit",    "CRÉDITO"],
                  ["inflation", "INFLACIÓN"],
                  ["volatility","VOLATILIDAD"],
                ]

                return (
                  <div className="space-y-4">
                    {/* Top row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted mb-1">SCORE MACRO</p>
                        <p className={`text-3xl font-mono font-bold ${ms.score >= 60 ? "text-emerald-400" : ms.score >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {ms.score}<span className="text-xs text-muted">/100</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-1">RÉGIMEN</p>
                        <span className={`text-xs px-2 py-1 border rounded font-bold ${regimeBgMacro}`}>
                          {ms.regime}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-1">VOLATILIDAD</p>
                        <p className={`text-sm font-bold ${volDirCls}`}>{ms.volDirection}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted mb-1">FASE ECONÓMICA</p>
                        <p className="text-sm font-bold text-text uppercase">{det.phase}</p>
                        <p className="text-xs text-muted">{det.confidence}% conf.</p>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div>
                      <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${ms.score >= 60 ? "bg-emerald-500" : ms.score >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${ms.score}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted mt-0.5 font-mono">
                        <span>0</span><span>50</span><span>100</span>
                      </div>
                    </div>

                    {/* Component breakdown */}
                    <div className="grid grid-cols-5 gap-2">
                      {componentLabels.map(([key, label]) => {
                        const v = ms.components[key]
                        const color = v >= 65 ? "text-emerald-400" : v >= 45 ? "text-yellow-400" : "text-red-400"
                        const barColor = v >= 65 ? "bg-emerald-500" : v >= 45 ? "bg-yellow-500" : "bg-red-500"
                        return (
                          <div key={key} className="text-center">
                            <p className="text-xs text-muted tracking-wide mb-1">{label}</p>
                            <p className={`text-lg font-mono font-bold ${color}`}>{v}</p>
                            <div className="h-1 w-full bg-border rounded-full overflow-hidden mt-1">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${v}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Expectation Shift */}
                    <div className="border-t border-border pt-3">
                      <p className="text-xs text-muted tracking-widest mb-2">EXPECTATION SHIFT</p>
                      <div className="flex items-center gap-4 flex-wrap mb-2">
                        <span className={`text-2xl font-mono font-bold ${esCls}`}>
                          {es.score > 0 ? "+" : ""}{es.score}
                        </span>
                        <span className={`text-xs px-2 py-0.5 border rounded font-bold ${esCls.replace("text-", "border-").replace("400", "700")} bg-transparent`}>
                          {es.label}
                        </span>
                        <div className="flex gap-3 text-xs font-mono text-muted flex-wrap">
                          <span>Fed <span className={es.fedBias === "HAWKISH" ? "text-red-400" : es.fedBias === "DOVISH" ? "text-emerald-400" : "text-subtle"}>{es.fedBias}</span></span>
                          <span>Breakevens <span className={es.breakevens === "RISING" ? "text-red-400" : es.breakevens === "FALLING" ? "text-emerald-400" : "text-subtle"}>{es.breakevens}</span></span>
                          <span>Curva <span className={es.yieldCurveTrend === "STEEPENING" ? "text-emerald-400" : es.yieldCurveTrend === "FLATTENING" ? "text-red-400" : "text-subtle"}>{es.yieldCurveTrend}</span></span>
                        </div>
                      </div>
                      {es.shocks.length > 0 && (
                        <ul className="space-y-1">
                          {es.shocks.map((s, i) => (
                            <li key={i} className="flex gap-2 text-xs text-subtle">
                              <span className="text-yellow-500 shrink-0">⚡</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Phase signals */}
                    {det.signals.length > 0 && (
                      <div className="border-t border-border pt-3">
                        <p className="text-xs text-muted tracking-widest mb-2">SEÑALES MACRO CLAVE</p>
                        <ul className="space-y-1">
                          {det.signals.slice(0, 4).map((s, i) => (
                            <li key={i} className="flex gap-2 text-xs text-subtle">
                              <span className="text-accent shrink-0">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          <p className="text-xs text-muted text-center py-2 font-mono">
            {active} · {d.timestamp} · {d.availableExpirations?.length ?? 0} expiraciones disponibles
          </p>
        </div>
      )}
    </main>
  )
}
