"use client"

import { useEffect, useState } from "react"
import type { TriggersState } from "@/app/api/triggers/state/route"
import { scoreColorClass, scoreTier } from "@/lib/triggers/scoring"

// ── Formatters inline (mismo patrón que el resto del proyecto) ─────────────
function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `$${v.toFixed(2)}`
}
function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
}
function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-gray-400"
  if (v >= 5) return "text-emerald-400"
  if (v >= 0) return "text-emerald-300"
  if (v >= -5) return "text-orange-300"
  return "text-red-400"
}
function rotationBadge(s: string | null): string {
  if (s === "FAVORED") return "bg-emerald-900/40 text-emerald-300 border-emerald-700"
  if (s === "AVOID")   return "bg-red-900/40 text-red-300 border-red-700"
  return "bg-gray-800 text-gray-300 border-gray-700"
}
function reasonBadge(r: string): string {
  if (r === "TAKE_PROFIT")     return "bg-emerald-900/40 text-emerald-300 border-emerald-700"
  if (r === "STOP_LOSS")       return "bg-red-900/40 text-red-300 border-red-700"
  if (r === "REGIME_FLIP")     return "bg-orange-900/40 text-orange-300 border-orange-700"
  if (r === "SIGNAL_DEGRADED") return "bg-yellow-900/40 text-yellow-300 border-yellow-700"
  if (r === "TIME_EXIT")       return "bg-gray-800 text-gray-300 border-gray-700"
  if (r === "ROTATION_FLIP")   return "bg-blue-900/40 text-blue-300 border-blue-700"
  return "bg-gray-800 text-gray-300 border-gray-700"
}

export default function TriggersPage() {
  const [data, setData] = useState<TriggersState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch("/api/triggers/state", { cache: "no-store" })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json() as TriggersState
        if (!cancelled) { setData(j); setError(null) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="p-8 text-gray-400">Cargando estado del motor de gatillos…</div>
  }
  if (error || !data) {
    return <div className="p-8 text-red-400">Error: {error ?? "sin datos"}</div>
  }

  const winRateLabel = data.stats.winRate30d != null
    ? `${(data.stats.winRate30d * 100).toFixed(0)}%`
    : "—"

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Motor de gatillos</h1>
        <p className="text-sm text-gray-400">
          Estado en vivo de las entries OPEN, cierres recientes y atribución por condición.
        </p>
      </header>

      {/* Stats top */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard label="Entries OPEN"  value={String(data.stats.openCount)} />
        <StatCard label="Cierres 30d"   value={String(data.stats.closedLast30d)} />
        <StatCard label="Win rate 30d"  value={winRateLabel}
          color={data.stats.winRate30d == null ? "neutral"
            : data.stats.winRate30d >= 0.5 ? "good" : "warn"} />
      </div>

      {/* Section 1: Entries OPEN */}
      <Section title={`Entries abiertas (${data.openEntries.length})`}>
        {data.openEntries.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Sin posiciones abiertas.</p>
        ) : (
          <>
            <ScoreLegend />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-400 border-b border-gray-800">
                  <tr>
                    <Th>Ticker</Th>
                    <Th>Regla</Th>
                    <Th className="text-center">Score</Th>
                    <Th className="text-right">Cond.</Th>
                    <Th>Entry date</Th>
                    <Th className="text-right">Entry $</Th>
                    <Th className="text-right">Actual $</Th>
                    <Th className="text-right">P&amp;L</Th>
                    <Th className="text-right">Días</Th>
                    <Th>Rotación</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.openEntries.map(e => (
                    <tr key={e.id} className="border-b border-gray-800/60">
                      <Td className="font-semibold">{e.ticker}</Td>
                      <Td className="text-gray-300 font-mono text-xs">{e.ruleName}</Td>
                      <Td className="text-center">
                        <span className={`inline-flex items-center justify-center w-14 py-1 rounded border font-mono text-sm font-bold ${scoreColorClass(e.triggerScore)}`}
                              title={scoreTier(e.triggerScore)}>
                          {e.triggerScore}
                        </span>
                      </Td>
                      <Td className="text-right text-gray-300 font-mono text-xs">{e.conditionsMet}/{e.conditionsTotal}</Td>
                      <Td className="text-gray-400">{e.entryDate}</Td>
                      <Td className="text-right font-mono">{usd(e.entryPrice)}</Td>
                      <Td className="text-right font-mono">{usd(e.currentPrice)}</Td>
                      <Td className={`text-right font-mono ${pctClass(e.unrealizedPct)}`}>{pct(e.unrealizedPct)}</Td>
                      <Td className="text-right text-gray-400">{e.daysOpen}d</Td>
                      <Td>
                        <span className={`inline-block px-2 py-0.5 rounded border text-xs ${rotationBadge(e.rotationStatus)}`}>
                          {e.rotationStatus ?? "—"}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* Section 2: Cierres recientes */}
      <Section title={`Cierres recientes (${data.recentExits.length})`}>
        {data.recentExits.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Sin cierres en los últimos 30 días.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-400 border-b border-gray-800">
                <tr>
                  <Th>Ticker</Th>
                  <Th>Regla</Th>
                  <Th>Entry → Exit</Th>
                  <Th className="text-right">P&amp;L</Th>
                  <Th className="text-right">Días</Th>
                  <Th>Razón</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentExits.map(x => (
                  <tr key={x.id} className="border-b border-gray-800/60">
                    <Td className="font-semibold">{x.ticker}</Td>
                    <Td className="text-gray-300 font-mono text-xs">{x.ruleName}</Td>
                    <Td className="text-gray-400 font-mono text-xs">
                      {usd(x.entryPrice)} → {usd(x.exitPrice)}
                    </Td>
                    <Td className={`text-right font-mono ${pctClass(x.returnPct)}`}>{pct(x.returnPct)}</Td>
                    <Td className="text-right text-gray-400">{x.daysHeld}d</Td>
                    <Td>
                      <span className={`inline-block px-2 py-0.5 rounded border text-xs ${reasonBadge(x.exitReason)}`}>
                        {x.exitReason}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section 3: Atribución por condición */}
      <Section title="Atribución por condición">
        {data.conditionAttribution.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Sin datos de condiciones evaluadas todavía.</p>
        ) : (
          <div className="space-y-2">
            {data.conditionAttribution.map(c => {
              const pctRate = c.metRate * 100
              // Heatmap: el bar usa el mismo color tier que el score
              const barColor =
                pctRate >= 80 ? "bg-emerald-500/70" :
                pctRate >= 60 ? "bg-yellow-500/70" :
                pctRate >= 40 ? "bg-orange-500/70" :
                                "bg-red-500/70"
              return (
                <div key={c.conditionName} className="flex items-center gap-3 text-sm">
                  <div className="w-44 font-mono text-xs text-gray-300">{c.conditionName}</div>
                  <div className="flex-1 h-6 bg-gray-900 rounded overflow-hidden border border-gray-800">
                    <div
                      className={`h-full transition-all ${barColor}`}
                      style={{ width: `${pctRate}%` }}
                    />
                  </div>
                  <div className="w-32 text-right text-gray-400 text-xs font-mono">
                    {c.metCount} / {c.totalCount} ({pctRate.toFixed(0)}%)
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3 text-gray-200">{title}</h2>
      {children}
    </section>
  )
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`py-2 px-2 font-medium ${className}`}>{children}</th>
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2 px-2 ${className}`}>{children}</td>
}

function ScoreLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
      <span className="text-gray-500">TriggerScore:</span>
      <LegendChip range="80–100" label="fuerte"   className={scoreColorClass(90)} />
      <LegendChip range="60–80"  label="moderado" className={scoreColorClass(70)} />
      <LegendChip range="40–60"  label="tibio"    className={scoreColorClass(50)} />
      <LegendChip range="0–40"   label="débil"    className={scoreColorClass(20)} />
      <span className="text-gray-500 ml-auto">condiciones (50pts) + rotación (25) + liquidez (15) + macro (10)</span>
    </div>
  )
}

function LegendChip({ range, label, className }: { range: string; label: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${className}`}>
      <span className="font-mono">{range}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
    </span>
  )
}

function StatCard({ label, value, color = "neutral" }: {
  label: string
  value: string
  color?: "neutral" | "good" | "warn"
}) {
  const colorClass =
    color === "good" ? "text-emerald-300"
    : color === "warn" ? "text-orange-300"
    : "text-gray-100"
  return (
    <div className="border border-gray-800 rounded p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${colorClass}`}>{value}</div>
    </div>
  )
}
