"use client"

import { useState } from "react"
import Link from "next/link"

type BucketStats = {
  count: number
  winRate: number
  meanReturn: number
  sharpe: number
  maxDD: number
  meanReturnDelta: number
  tStatistic: number
  pValue: number
  significant: boolean
}

type YearRow = {
  crowdedLong: { count: number; winRate: number; meanReturn: number }
  crowdedShort: { count: number; winRate: number; meanReturn: number }
}

type Result = {
  config: {
    index: string; etf: string; pctThreshold: number; horizonWeeks: number; rollingWindow: number
    dataStart: string; dataEnd: string; totalWeeks: number; totalTrades: number
  }
  baseline: { count: number; winRate: number; meanReturn: number; sharpe: number; maxDD: number }
  crowdedLong: BucketStats
  crowdedShort: BucketStats
  byYear: Record<string, YearRow>
  verdict: "SHIP_THE_SIGNAL" | "NEEDS_TUNING"
  caveat: string
}

const INDICES = [
  { id: "SPX", label: "S&P 500", etf: "SPY" },
  { id: "NDX", label: "Nasdaq-100", etf: "QQQ" },
  { id: "DJI", label: "Dow Jones", etf: "DIA" },
  { id: "RUT", label: "Russell 2000", etf: "IWM" },
]

function BucketCard({
  title, sub, stats, positiveLabel,
}: {
  title: string; sub: string; stats: BucketStats; positiveLabel: string
}) {
  return (
    <div className={`border ${stats.significant ? "border-emerald-700/60" : "border-border"} bg-surface rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-bold tracking-widest text-accent">{title}</div>
        {stats.significant && (
          <span className="text-[10px] font-bold text-emerald-400 border border-emerald-700 rounded px-1.5 py-0.5">
            SIGNIFICATIVO
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted mb-3">{sub}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>Trades: <span className="font-mono font-bold">{stats.count}</span></div>
        <div>{positiveLabel}: <span className={`font-mono font-bold ${stats.winRate >= 55 ? "text-emerald-400" : "text-red-400"}`}>{stats.winRate}%</span></div>
        <div>Retorno medio: <span className="font-mono font-bold">{stats.meanReturn >= 0 ? "+" : ""}{stats.meanReturn}%</span></div>
        <div>Δ vs. baseline: <span className={`font-mono font-bold ${stats.meanReturnDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>{stats.meanReturnDelta >= 0 ? "+" : ""}{stats.meanReturnDelta}</span></div>
        <div>Sharpe: <span className="font-mono font-bold">{stats.sharpe}</span></div>
        <div>Max DD: <span className="font-mono font-bold text-red-400">−{stats.maxDD}</span></div>
        <div>t-stat: <span className="font-mono font-bold">{stats.tStatistic}</span></div>
        <div>p-value: <span className={`font-mono font-bold ${stats.significant ? "text-emerald-400" : "text-red-400"}`}>{stats.pValue}</span></div>
      </div>
    </div>
  )
}

export default function CotIndexBacktestPage() {
  const [index, setIndex]         = useState("SPX")
  const [threshold, setThreshold] = useState(80)
  const [horizon, setHorizon]     = useState(8)
  const [rolling, setRolling]     = useState(156)
  const [result,  setResult]      = useState<Result | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error,   setError]       = useState("")

  async function run() {
    setLoading(true); setError(""); setResult(null)
    try {
      const r = await fetch(`/api/backtest/cot-index?index=${index}&threshold=${threshold}&horizon=${horizon}&rolling=${rolling}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Error")
      setResult(j)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  const etf = INDICES.find(i => i.id === index)?.etf ?? ""

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="border-b border-border px-4 sm:px-6 py-5 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/backtest" className="text-[10px] text-muted hover:text-accent tracking-widest">← SORE</Link>
          </div>
          <h1 className="text-xl font-black tracking-[0.2em] text-accent mb-1">BACKTEST · COT Índices — Leveraged Money</h1>
          <p className="text-xs text-subtle max-w-3xl">
            Tesis contrarian: cuando los fondos apalancados (CFTC TFF, semanal, 2010-presente) están en un
            percentil extremo de su propia historia de posicionamiento, ¿el índice revierte en las semanas
            siguientes? Extremo largo → se espera caída. Extremo corto → se espera subida.
          </p>
        </div>
      </div>

      <div className="border-b border-border px-4 sm:px-6 py-3 bg-bg">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">ÍNDICE</span>
            <select value={index} onChange={e => setIndex(e.target.value)}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5">
              {INDICES.map(i => <option key={i.id} value={i.id}>{i.label} ({i.etf})</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">PERCENTIL EXTREMO</span>
            <select value={threshold} onChange={e => setThreshold(parseInt(e.target.value))}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5">
              {[70, 75, 80, 85, 90].map(n => <option key={n} value={n}>≥ {n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">HORIZONTE</span>
            <select value={horizon} onChange={e => setHorizon(parseInt(e.target.value))}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5">
              {[4, 8, 13, 26].map(n => <option key={n} value={n}>{n}sem</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">VENTANA PERCENTIL</span>
            <select value={rolling} onChange={e => setRolling(parseInt(e.target.value))}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5">
              {[52, 104, 156, 260].map(n => <option key={n} value={n}>{n}sem</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading}
            className="bg-accent text-white px-5 py-1.5 text-xs font-bold tracking-widest hover:opacity-80 disabled:opacity-40">
            {loading ? "BACKTESTING..." : "EJECUTAR BACKTEST"}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading && <div className="text-center py-20 text-muted text-sm tracking-widest">Pulling 20y COT + {etf} history...</div>}
        {error && <div className="border border-red-700 bg-red-950/50 px-4 py-3 text-sm text-red-300 rounded">Error: {error}</div>}

        {result && (
          <>
            {/* Verdict header */}
            <div className={`border-2 ${result.verdict === "SHIP_THE_SIGNAL" ? "border-emerald-700 bg-emerald-950/30" : "border-yellow-700 bg-yellow-950/30"} rounded-lg p-4`}>
              <div className="text-[10px] tracking-widest text-muted mb-1">VEREDICTO — {result.config.index} ({result.config.etf})</div>
              <div className={`text-3xl font-black tracking-[0.15em] ${result.verdict === "SHIP_THE_SIGNAL" ? "text-emerald-400" : "text-yellow-400"}`}>
                {result.verdict.replace(/_/g, " ")}
              </div>
              <div className="text-xs text-subtle mt-2">
                {result.config.totalWeeks.toLocaleString()} semanas de historial COT · {result.config.totalTrades} trades evaluados ·{" "}
                {result.config.dataStart} → {result.config.dataEnd}
              </div>
            </div>

            {/* Baseline */}
            <div className="border border-border bg-surface rounded-lg p-4">
              <div className="text-[10px] text-muted tracking-widest mb-2">BASELINE (todas las semanas, sin condicionar)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div>Trades: <span className="font-mono font-bold">{result.baseline.count}</span></div>
                <div>Retorno medio: <span className="font-mono font-bold">{result.baseline.meanReturn >= 0 ? "+" : ""}{result.baseline.meanReturn}%</span></div>
                <div>Sharpe: <span className="font-mono font-bold">{result.baseline.sharpe}</span></div>
                <div>Max DD: <span className="font-mono font-bold text-red-400">−{result.baseline.maxDD}</span></div>
              </div>
            </div>

            {/* Los dos buckets contrarian */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <BucketCard
                title={`CROWDED LONG (percentil ≥ ${result.config.pctThreshold})`}
                sub="Gana si el índice cae en el horizonte — reversión bajista"
                stats={result.crowdedLong}
                positiveLabel="Acierto"
              />
              <BucketCard
                title={`CROWDED SHORT (percentil ≤ ${100 - result.config.pctThreshold})`}
                sub="Gana si el índice sube en el horizonte — reversión alcista"
                stats={result.crowdedShort}
                positiveLabel="Acierto"
              />
            </div>

            {/* By year */}
            <div className="border border-border bg-surface rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-bold tracking-widest text-accent">PERFORMANCE POR AÑO</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-muted tracking-widest">
                    <tr>
                      <th className="text-left px-4 py-2">AÑO</th>
                      <th className="text-left px-4 py-2" colSpan={2}>CROWDED LONG</th>
                      <th className="text-left px-4 py-2" colSpan={2}>CROWDED SHORT</th>
                    </tr>
                    <tr>
                      <th className="text-left px-4 py-1"></th>
                      <th className="text-left px-4 py-1">N</th>
                      <th className="text-left px-4 py-1">ACIERTO</th>
                      <th className="text-left px-4 py-1">N</th>
                      <th className="text-left px-4 py-1">ACIERTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.byYear).map(([y, s]) => (
                      <tr key={y} className="border-t border-border/50">
                        <td className="px-4 py-2 font-bold">{y}</td>
                        <td className="px-4 py-2 font-mono text-xs">{s.crowdedLong.count}</td>
                        <td className={`px-4 py-2 font-mono text-xs ${s.crowdedLong.winRate >= 55 ? "text-emerald-400" : "text-red-400"}`}>
                          {s.crowdedLong.count > 0 ? `${s.crowdedLong.winRate}%` : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{s.crowdedShort.count}</td>
                        <td className={`px-4 py-2 font-mono text-xs ${s.crowdedShort.winRate >= 55 ? "text-emerald-400" : "text-red-400"}`}>
                          {s.crowdedShort.count > 0 ? `${s.crowdedShort.winRate}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-[11px] text-muted border border-border/60 rounded-lg px-4 py-3">
              ⚠ {result.caveat}
            </div>
          </>
        )}

        {!result && !loading && !error && (
          <div className="text-center py-20 text-muted text-sm tracking-widest">
            Pulsa <span className="text-accent font-bold">EJECUTAR BACKTEST</span> para correr el historial COT vs retorno futuro
          </div>
        )}
      </div>
    </div>
  )
}
