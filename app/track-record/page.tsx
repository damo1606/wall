"use client"

import { useState, useEffect } from "react"

type TopGo = { symbol: string; css?: number; strategy?: string }
type Snapshot = {
  date: string
  phase: string | null
  confidence: number | null
  vix: number | null
  fearScore: number | null
  regime: string | null
  goCount: number
  waitCount: number
  avoidCount: number
  topGo: TopGo[]
}

function RegimeBadge({ regime }: { regime: string | null }) {
  if (!regime) return <span className="text-muted text-xs">—</span>
  const s =
    regime === "COMPRESIÓN"       ? "bg-emerald-900/60 text-emerald-300 border-emerald-800" :
    regime === "TRANSICIÓN"       ? "bg-yellow-900/60 text-yellow-300 border-yellow-800" :
    regime === "EXPANSIÓN"        ? "bg-orange-900/60 text-orange-300 border-orange-800" :
    regime === "PÁNICO AGUDO"     ? "bg-red-900 text-red-200 border-red-700" :
    regime === "CRISIS SISTÉMICA" ? "bg-red-950 text-red-200 border-red-800" :
    "bg-gray-800 text-gray-400 border-gray-700"
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border tracking-widest ${s}`}>{regime}</span>
}

function PhaseBadge({ phase }: { phase: string | null }) {
  if (!phase) return <span className="text-muted text-xs">—</span>
  const map: Record<string, { label: string; cls: string }> = {
    recovery:  { label: "RECUP.",   cls: "bg-blue-900/60 text-blue-300 border-blue-800" },
    expansion: { label: "EXPANS.",  cls: "bg-green-900/60 text-green-300 border-green-800" },
    late:      { label: "DESACEL.", cls: "bg-amber-900/60 text-amber-300 border-amber-800" },
    recession: { label: "RECES.",   cls: "bg-red-900/60 text-red-300 border-red-800" },
  }
  const p = map[phase] ?? { label: phase, cls: "bg-gray-800 text-gray-400 border-gray-700" }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border tracking-widest ${p.cls}`}>{p.label}</span>
}

export default function TrackRecordPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState("")
  const [firstDay, setFirstDay] = useState<string | null>(null)
  const [lastDay,  setLastDay]  = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/track-record")
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        if (j.error) setError(j.error)
        setSnapshots(j.snapshots ?? [])
        setFirstDay(j.firstDay)
        setLastDay(j.lastDay)
      })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const totalGo    = snapshots.reduce((s, x) => s + x.goCount, 0)
  const totalDays  = snapshots.length
  const goPerDay   = totalDays > 0 ? (totalGo / totalDays).toFixed(1) : "—"
  const regimes    = new Set(snapshots.map(s => s.regime).filter(Boolean))
  const phaseCounts = snapshots.reduce<Record<string, number>>((acc, s) => {
    if (s.phase) acc[s.phase] = (acc[s.phase] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="border-b border-border px-4 sm:px-6 py-5 bg-surface">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-black tracking-[0.2em] text-accent mb-1">TRACK RECORD</h1>
          <p className="text-xs text-subtle">Historial inmutable de snapshots diarios. Cada día Vercel cron guarda el estado del sistema en Supabase.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {loading && (
          <div className="text-center py-20 text-muted text-sm tracking-widest">Cargando snapshots...</div>
        )}

        {error && (
          <div className="border border-red-700 bg-red-950/50 px-4 py-3 text-sm text-red-300 rounded">
            Error: {error}
          </div>
        )}

        {!loading && !error && totalDays === 0 && (
          <div className="border border-yellow-700/50 bg-yellow-950/30 px-4 py-6 text-sm text-yellow-300 rounded">
            <p className="font-bold tracking-widest text-xs mb-2">SIN SNAPSHOTS TODAVÍA</p>
            <p className="text-xs text-yellow-200/80">
              El cron de Vercel guarda 1 snapshot por día a las 21:00 UTC (cierre de mercado ET). Si el cron está configurado,
              aparecerá la primera fila mañana. Pasos: <code className="text-yellow-400">supabase/migrations/002_daily_snapshots.sql</code> en SQL Editor +{" "}
              <code className="text-yellow-400">CRON_SECRET</code> en Vercel env vars.
            </p>
          </div>
        )}

        {!loading && totalDays > 0 && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-[10px] text-muted tracking-widest mb-1">DÍAS TRACKED</div>
                <div className="text-3xl font-black font-mono text-accent">{totalDays}</div>
              </div>
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-[10px] text-muted tracking-widest mb-1">TOTAL GO</div>
                <div className="text-3xl font-black font-mono text-emerald-400">{totalGo}</div>
              </div>
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-[10px] text-muted tracking-widest mb-1">GO / DÍA</div>
                <div className="text-3xl font-black font-mono text-text">{goPerDay}</div>
              </div>
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-[10px] text-muted tracking-widest mb-1">REGÍMENES</div>
                <div className="text-3xl font-black font-mono text-text">{regimes.size}</div>
              </div>
              <div className="border border-border bg-surface rounded-lg p-4">
                <div className="text-[10px] text-muted tracking-widest mb-1">VENTANA</div>
                <div className="text-xs font-mono text-subtle">{firstDay}<br />→ {lastDay}</div>
              </div>
            </div>

            {/* Phase distribution */}
            <div className="border border-border bg-surface rounded-lg p-4">
              <div className="text-[10px] text-muted tracking-widest mb-3 font-bold">DISTRIBUCIÓN DE FASES</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(phaseCounts).map(([p, c]) => (
                  <div key={p} className="flex items-center gap-2">
                    <PhaseBadge phase={p} />
                    <span className="text-xs font-mono">{c} días ({((c / totalDays) * 100).toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="border border-border bg-surface rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-xs font-bold tracking-widest text-accent">TIMELINE DE SNAPSHOTS</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-muted tracking-widest">
                    <tr>
                      <th className="text-left px-4 py-2">FECHA</th>
                      <th className="text-left px-4 py-2">FASE</th>
                      <th className="text-left px-4 py-2">CONF.</th>
                      <th className="text-left px-4 py-2">RÉGIMEN</th>
                      <th className="text-left px-4 py-2">VIX</th>
                      <th className="text-left px-4 py-2">FEAR</th>
                      <th className="text-center px-4 py-2">GO</th>
                      <th className="text-center px-4 py-2">WAIT</th>
                      <th className="text-center px-4 py-2">AVOID</th>
                      <th className="text-left px-4 py-2">TOP GO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map(s => (
                      <tr key={s.date} className="border-t border-border/50 hover:bg-surface/60">
                        <td className="px-4 py-2 font-mono text-xs">{s.date}</td>
                        <td className="px-4 py-2"><PhaseBadge phase={s.phase} /></td>
                        <td className="px-4 py-2 font-mono text-xs">{s.confidence != null ? `${s.confidence}%` : "—"}</td>
                        <td className="px-4 py-2"><RegimeBadge regime={s.regime} /></td>
                        <td className="px-4 py-2 font-mono text-xs">{s.vix != null ? s.vix.toFixed(2) : "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{s.fearScore ?? "—"}</td>
                        <td className="px-4 py-2 text-center font-mono text-xs text-emerald-400">{s.goCount}</td>
                        <td className="px-4 py-2 text-center font-mono text-xs text-yellow-400">{s.waitCount}</td>
                        <td className="px-4 py-2 text-center font-mono text-xs text-gray-500">{s.avoidCount}</td>
                        <td className="px-4 py-2 text-xs">
                          {s.topGo.length === 0
                            ? <span className="text-muted">—</span>
                            : s.topGo.map(g => `${g.symbol}(${g.css})`).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
