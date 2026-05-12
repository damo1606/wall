"use client"

import { useState } from "react"

type Result = {
  config: { cssThreshold: number; horizonDays: number; rollingWindow: number; dataStart: string; dataEnd: string; totalDays: number }
  signal: { count: number; winRate: number; meanVrp: number; sharpe: number; maxDD: number }
  random: { count: number; winRate: number; meanVrp: number; sharpe: number; maxDD: number }
  edge: { winRateDelta: number; meanVrpDelta: number; tStatistic: number; pValue: number; significant: boolean }
  byYear: Record<string, { count: number; winRate: number; meanVrp: number; sharpe: number; maxDD: number }>
  verdict: "SHIP_THE_SIGNAL" | "NEEDS_TUNING"
  thresholds: Record<string, { target: number; actual: number; pass: boolean }>
}

export default function BacktestPage() {
  const [result,    setResult]    = useState<Result | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState("")
  const [threshold, setThreshold] = useState(75)
  const [horizon,   setHorizon]   = useState(30)

  async function run() {
    setLoading(true); setError(""); setResult(null)
    try {
      const r = await fetch(`/api/backtest/sore?threshold=${threshold}&horizon=${horizon}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Error")
      setResult(j)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="border-b border-border px-4 sm:px-6 py-5 bg-surface">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-black tracking-[0.2em] text-accent mb-1">BACKTEST · SORE Signal</h1>
          <p className="text-xs text-subtle max-w-3xl">
            Validación VIX-proxy del signal: cuando VIX está en percentil &gt; N, ¿la volatilidad realizada de los siguientes 30 días
            queda por debajo de la implícita? Si sí, vender prima tiene edge estadístico real.
          </p>
        </div>
      </div>

      <div className="border-b border-border px-4 sm:px-6 py-3 bg-bg">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">PERCENTIL VIX</span>
            <select value={threshold} onChange={e => setThreshold(parseInt(e.target.value))}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5">
              {[60, 70, 75, 80, 85, 90].map(n => <option key={n} value={n}>&gt; {n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">HORIZON</span>
            <select value={horizon} onChange={e => setHorizon(parseInt(e.target.value))}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5">
              {[21, 30, 45].map(n => <option key={n} value={n}>{n}d</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading}
            className="bg-accent text-white px-5 py-1.5 text-xs font-bold tracking-widest hover:opacity-80 disabled:opacity-40">
            {loading ? "BACKTESTING..." : "EJECUTAR BACKTEST"}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {loading && <div className="text-center py-20 text-muted text-sm tracking-widest">Pulling 10y VIX + SPY history...</div>}
        {error && <div className="border border-red-700 bg-red-950/50 px-4 py-3 text-sm text-red-300 rounded">Error: {error}</div>}

        {result && (
          <>
            {/* Verdict header */}
            <div className={`border-2 ${result.verdict === "SHIP_THE_SIGNAL" ? "border-emerald-700 bg-emerald-950/30" : "border-yellow-700 bg-yellow-950/30"} rounded-lg p-4`}>
              <div className="text-[10px] tracking-widest text-muted mb-1">VEREDICTO</div>
              <div className={`text-3xl font-black tracking-[0.15em] ${result.verdict === "SHIP_THE_SIGNAL" ? "text-emerald-400" : "text-yellow-400"}`}>
                {result.verdict.replace(/_/g, " ")}
              </div>
              <div className="text-xs text-subtle mt-2">
                {result.config.totalDays.toLocaleString()} días analizados · {result.config.dataStart} → {result.config.dataEnd}
              </div>
            </div>

            {/* Thresholds */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(result.thresholds).map(([k, v]) => (
                <div key={k} className={`border ${v.pass ? "border-emerald-700 bg-emerald-950/30" : "border-red-700 bg-red-950/30"} rounded-lg p-4`}>
                  <div className="text-[10px] text-muted tracking-widest mb-1">{k.toUpperCase()}</div>
                  <div className={`text-2xl font-black font-mono ${v.pass ? "text-emerald-400" : "text-red-400"}`}>
                    {v.actual}{k === "winRate" ? "%" : ""}
                  </div>
                  <div className="text-[10px] text-muted">target: {k === "pValue" ? "≤" : "≥"} {v.target}{k === "winRate" ? "%" : ""}</div>
                </div>
              ))}
            </div>

            {/* Signal vs Random */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-emerald-700/50 bg-surface rounded-lg p-4">
                <div className="text-[10px] text-muted tracking-widest mb-2">SIGNAL (VIX percentil &gt; {result.config.cssThreshold})</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Trades: <span className="font-mono font-bold">{result.signal.count}</span></div>
                  <div>Win rate: <span className="font-mono font-bold text-emerald-400">{result.signal.winRate}%</span></div>
                  <div>Mean VRP: <span className="font-mono font-bold text-emerald-400">+{result.signal.meanVrp}</span></div>
                  <div>Sharpe: <span className="font-mono font-bold">{result.signal.sharpe}</span></div>
                  <div>Max DD: <span className="font-mono font-bold text-red-400">−{result.signal.maxDD}</span></div>
                </div>
              </div>
              <div className="border border-gray-700 bg-surface rounded-lg p-4">
                <div className="text-[10px] text-muted tracking-widest mb-2">BENCHMARK (random / todos los días)</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Trades: <span className="font-mono">{result.random.count}</span></div>
                  <div>Win rate: <span className="font-mono">{result.random.winRate}%</span></div>
                  <div>Mean VRP: <span className="font-mono">{result.random.meanVrp}</span></div>
                  <div>Sharpe: <span className="font-mono">{result.random.sharpe}</span></div>
                  <div>Max DD: <span className="font-mono text-red-400">−{result.random.maxDD}</span></div>
                </div>
              </div>
            </div>

            {/* Edge */}
            <div className="border border-border bg-surface rounded-lg p-4">
              <h3 className="text-xs font-bold tracking-widest text-accent mb-3">EDGE vs BENCHMARK</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-muted">Δ Win rate</div>
                  <div className={`text-xl font-mono font-bold ${result.edge.winRateDelta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {result.edge.winRateDelta > 0 ? "+" : ""}{result.edge.winRateDelta}%
                  </div>
                </div>
                <div>
                  <div className="text-muted">Δ Mean VRP</div>
                  <div className={`text-xl font-mono font-bold ${result.edge.meanVrpDelta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {result.edge.meanVrpDelta > 0 ? "+" : ""}{result.edge.meanVrpDelta}
                  </div>
                </div>
                <div>
                  <div className="text-muted">t-statistic</div>
                  <div className="text-xl font-mono font-bold">{result.edge.tStatistic}</div>
                </div>
                <div>
                  <div className="text-muted">p-value</div>
                  <div className={`text-xl font-mono font-bold ${result.edge.significant ? "text-emerald-400" : "text-red-400"}`}>
                    {result.edge.pValue}
                  </div>
                </div>
              </div>
            </div>

            {/* By year */}
            <div className="border border-border bg-surface rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-xs font-bold tracking-widest text-accent">PERFORMANCE POR AÑO</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="text-[10px] text-muted tracking-widest">
                  <tr>
                    <th className="text-left px-4 py-2">AÑO</th>
                    <th className="text-left px-4 py-2">TRADES</th>
                    <th className="text-left px-4 py-2">WIN %</th>
                    <th className="text-left px-4 py-2">MEAN VRP</th>
                    <th className="text-left px-4 py-2">SHARPE</th>
                    <th className="text-left px-4 py-2">MAX DD</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.byYear).map(([y, s]) => (
                    <tr key={y} className="border-t border-border/50">
                      <td className="px-4 py-2 font-bold">{y}</td>
                      <td className="px-4 py-2 font-mono text-xs">{s.count}</td>
                      <td className={`px-4 py-2 font-mono text-xs ${s.winRate >= 55 ? "text-emerald-400" : "text-red-400"}`}>{s.winRate}%</td>
                      <td className={`px-4 py-2 font-mono text-xs ${s.meanVrp >= 1 ? "text-emerald-400" : "text-red-400"}`}>{s.meanVrp}</td>
                      <td className="px-4 py-2 font-mono text-xs">{s.sharpe}</td>
                      <td className="px-4 py-2 font-mono text-xs text-red-400">−{s.maxDD}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!result && !loading && !error && (
          <div className="text-center py-20 text-muted text-sm tracking-widest">
            Pulsa <span className="text-accent font-bold">EJECUTAR BACKTEST</span> para correr 10 años de VIX vs RV_30d en SPY
          </div>
        )}
      </div>
    </div>
  )
}
