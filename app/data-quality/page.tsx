"use client"

import { useState, useEffect } from "react"

type IndicatorStatus = {
  key: string
  label: string
  group: string
  status: "ok" | "missing" | "stale"
  date: string | null
  daysAgo: number | null
  value: number | null
}

type SourceStatus = {
  name: string
  endpoint: string
  status: "ok" | "fail"
  latencyMs: number | null
}

const GROUPS: Record<string, string> = {
  gdpGrowth: "Headline", inflation: "Headline", unemployment: "Headline", fedRate: "Headline", yieldCurve: "Headline",
  nfp: "Mercado Laboral", joblessClaims: "Mercado Laboral", u6Rate: "Mercado Laboral", jolts: "Mercado Laboral",
  hySpread: "Crédito", igSpread: "Crédito", creditDelinq: "Crédito", finStress: "Crédito",
  coreInflation: "Inflación", pce: "Inflación", corePce: "Inflación", inflExp5y: "Inflación", inflExp10y: "Inflación",
  yc10y3m: "Curva", treasury2y: "Curva", treasury5y: "Curva", treasury10y: "Curva", treasury30y: "Curva",
  indProd: "Real", capUtil: "Real", retailSales: "Real", housStarts: "Real", buildPermits: "Real", consumerSent: "Real",
  m2: "Dinero", ciCredit: "Dinero", bizLoans: "Dinero",
}

const LABELS: Record<string, string> = {
  gdpGrowth: "PIB YoY", inflation: "Inflación CPI", unemployment: "Desempleo", fedRate: "Fed Rate", yieldCurve: "Curva 10Y-2Y",
  nfp: "Nóminas YoY", joblessClaims: "Sol. desempleo", u6Rate: "Desempleo U-6", jolts: "Vacantes JOLTS",
  hySpread: "HY Spread", igSpread: "IG Spread", creditDelinq: "Morosidad tarjetas", finStress: "Estrés financiero",
  coreInflation: "CPI Core", pce: "PCE", corePce: "PCE Core", inflExp5y: "Inf. Exp. 5Y", inflExp10y: "Inf. Exp. 10Y",
  yc10y3m: "Spread 10Y-3M", treasury2y: "Treasury 2Y", treasury5y: "Treasury 5Y", treasury10y: "Treasury 10Y", treasury30y: "Treasury 30Y",
  indProd: "Prod. Industrial", capUtil: "Util. Capacidad", retailSales: "Ventas Minoristas", housStarts: "Construcción", buildPermits: "Permisos", consumerSent: "Confianza Consumidor",
  m2: "M2", ciCredit: "Crédito C&I", bizLoans: "Préstamos empresas",
}

function daysBetween(date: string): number {
  const d1 = new Date(date)
  const d2 = new Date()
  return Math.floor((d2.getTime() - d1.getTime()) / 86_400_000)
}

export default function DataQualityPage() {
  const [indicators, setIndicators] = useState<IndicatorStatus[]>([])
  const [sources, setSources] = useState<SourceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [lastCheck, setLastCheck] = useState("")

  async function runCheck() {
    setLoading(true)
    const tStart = Date.now()

    const sourcesList = [
      { name: "FRED (macro)",         endpoint: "/api/macro" },
      { name: "Yahoo (sectores)",     endpoint: "/api/sectors-etf" },
      { name: "Scanner Pro (SORE)",   endpoint: "/api/scanner-pro?universe=sp500&limit=5&minBuyScore=0" },
      { name: "CFTC (COT FX)",        endpoint: "/api/cot" },
    ]

    const sourceResults: SourceStatus[] = await Promise.all(
      sourcesList.map(async s => {
        const start = Date.now()
        try {
          const res = await fetch(s.endpoint, { cache: "no-store" })
          return { ...s, status: res.ok ? "ok" : "fail" as const, latencyMs: Date.now() - start }
        } catch {
          return { ...s, status: "fail" as const, latencyMs: null }
        }
      })
    )

    const macroRes = sourceResults[0].status === "ok" ? await (await fetch("/api/macro")).json() : null

    const inds: IndicatorStatus[] = Object.keys(LABELS).map(key => {
      const v = macroRes?.[key]
      if (!v || !v.date) {
        return { key, label: LABELS[key], group: GROUPS[key], status: "missing", date: null, daysAgo: null, value: null }
      }
      const daysAgo = daysBetween(v.date)
      const status: "ok" | "stale" = daysAgo > 90 ? "stale" : "ok"
      return { key, label: LABELS[key], group: GROUPS[key], status, date: v.date, daysAgo, value: v.value }
    })

    setIndicators(inds)
    setSources(sourceResults)
    setLastCheck(new Date().toLocaleTimeString("es-ES"))
    setLoading(false)
    void tStart
  }

  useEffect(() => { runCheck() }, [])

  const okCount      = indicators.filter(i => i.status === "ok").length
  const missingCount = indicators.filter(i => i.status === "missing").length
  const staleCount   = indicators.filter(i => i.status === "stale").length
  const total        = indicators.length
  const healthPct    = total > 0 ? Math.round((okCount / total) * 100) : 0

  const grouped = indicators.reduce<Record<string, IndicatorStatus[]>>((acc, i) => {
    (acc[i.group] ??= []).push(i)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="border-b border-border px-4 sm:px-6 py-5 bg-surface">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-black tracking-[0.2em] text-accent mb-1">DATA QUALITY</h1>
          <p className="text-xs text-subtle">Health check de las fuentes de datos. 32 series FRED + 4 endpoints upstream.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Health summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border border-border bg-surface rounded-lg p-4">
            <div className="text-[10px] text-muted tracking-widest mb-1">HEALTH</div>
            <div className={`text-3xl font-black font-mono ${healthPct >= 95 ? "text-emerald-400" : healthPct >= 80 ? "text-yellow-400" : "text-red-400"}`}>
              {healthPct}%
            </div>
          </div>
          <div className="border border-border bg-surface rounded-lg p-4">
            <div className="text-[10px] text-muted tracking-widest mb-1">OK</div>
            <div className="text-3xl font-black font-mono text-emerald-400">{okCount}<span className="text-sm text-muted">/{total}</span></div>
          </div>
          <div className="border border-border bg-surface rounded-lg p-4">
            <div className="text-[10px] text-muted tracking-widest mb-1">FALTANTES</div>
            <div className="text-3xl font-black font-mono text-red-400">{missingCount}</div>
          </div>
          <div className="border border-border bg-surface rounded-lg p-4">
            <div className="text-[10px] text-muted tracking-widest mb-1">STALE &gt; 90D</div>
            <div className="text-3xl font-black font-mono text-orange-400">{staleCount}</div>
          </div>
        </div>

        {/* Sources */}
        <div className="border border-border bg-surface rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-widest text-accent">FUENTES UPSTREAM</h2>
            <button onClick={runCheck} disabled={loading}
              className="text-[10px] px-3 py-1 border border-border hover:border-accent hover:text-accent transition-colors tracking-widest disabled:opacity-40">
              {loading ? "VERIFICANDO..." : "RE-VERIFICAR"}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] text-muted tracking-widest">
              <tr><th className="text-left px-4 py-2">FUENTE</th><th className="text-left px-4 py-2">ENDPOINT</th><th className="text-left px-4 py-2">STATUS</th><th className="text-left px-4 py-2">LATENCIA</th></tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.endpoint} className="border-t border-border/50">
                  <td className="px-4 py-2 font-bold">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-subtle">{s.endpoint}</td>
                  <td className="px-4 py-2">
                    {s.status === "ok"
                      ? <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-700 text-emerald-300 tracking-widest">✓ OK</span>
                      : <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 border border-red-700 text-red-300 tracking-widest">✗ FAIL</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{s.latencyMs != null ? `${s.latencyMs}ms` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FRED indicators by group */}
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="border border-border bg-surface rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-xs font-bold tracking-widest text-accent">{group.toUpperCase()}</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[10px] text-muted tracking-widest">
                <tr><th className="text-left px-4 py-2">SERIE</th><th className="text-left px-4 py-2">VALOR</th><th className="text-left px-4 py-2">FECHA</th><th className="text-left px-4 py-2">EDAD</th><th className="text-left px-4 py-2">STATUS</th></tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.key} className="border-t border-border/50">
                    <td className="px-4 py-2 font-bold text-subtle">{i.label}</td>
                    <td className="px-4 py-2 font-mono text-xs">{i.value != null ? i.value.toFixed(2) : "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-subtle">{i.date ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{i.daysAgo != null ? `${i.daysAgo}d` : "—"}</td>
                    <td className="px-4 py-2">
                      {i.status === "ok"      && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/60 border border-emerald-700 text-emerald-300">✓ OK</span>}
                      {i.status === "stale"   && <span className="text-[10px] px-2 py-0.5 rounded bg-orange-900/60 border border-orange-700 text-orange-300">⚠ STALE</span>}
                      {i.status === "missing" && <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 border border-red-700 text-red-300">✗ FALTA</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {lastCheck && (
          <p className="text-[10px] text-muted tracking-widest text-right">Última verificación: {lastCheck}</p>
        )}
      </div>
    </div>
  )
}
