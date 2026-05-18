"use client"

import { useState } from "react"

const SECTORS = [
  { label: "Tecnología",    nombre: "Technology" },
  { label: "Salud",         nombre: "Healthcare" },
  { label: "Finanzas",      nombre: "Financial Services" },
  { label: "Consumo Disc.", nombre: "Consumer Cyclical" },
  { label: "Industriales",  nombre: "Industrials" },
  { label: "Energía",       nombre: "Energy" },
  { label: "Comunicación",  nombre: "Communication Services" },
  { label: "Consumo Bás.",  nombre: "Consumer Defensive" },
  { label: "Materiales",    nombre: "Basic Materials" },
  { label: "Utilities",     nombre: "Utilities" },
  { label: "Inmobiliario",  nombre: "Real Estate" },
]

type Tab = "supply" | "value" | "foda"

// Tab configuration with metadata
const TABS: { id: Tab; label: string; apiPath: string }[] = [
  { id: "supply", label: "⛓️ Suministros", apiPath: "/api/cadenas/supply-chain" },
  { id: "value",  label: "💎 Valores", apiPath: "/api/cadenas/value-chain" },
  { id: "foda",   label: "📊 FODA", apiPath: "/api/cadenas/foda" },
]

// Impact level color mapping (supports es/en variants)
const IMPACT_COLORS: Record<string, string> = {
  // High/Alto
  alto: "bg-red-900/40 text-red-300",
  alta: "bg-red-900/40 text-red-300",
  high: "bg-red-900/40 text-red-300",
  // Medium/Medio
  medio: "bg-yellow-900/40 text-yellow-300",
  media: "bg-yellow-900/40 text-yellow-300",
  mediano: "bg-yellow-900/40 text-yellow-300",
  medium: "bg-yellow-900/40 text-yellow-300",
  // Low/Bajo
  bajo: "bg-green-900/40 text-green-300",
  baja: "bg-green-900/40 text-green-300",
  low: "bg-green-900/40 text-green-300",
  // Time horizons
  corto: "bg-green-900/40 text-green-300",
  largo: "bg-blue-900/40 text-blue-300",
}

type ImpactBadgeProps = { v: string }
function ImpactBadge({ v }: ImpactBadgeProps) {
  const cls = IMPACT_COLORS[v?.toLowerCase()] ?? "bg-gray-800 text-gray-400"
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{v}</span>
}

// Sustituibilidad de un proveedor en la cadena inversa
const SUSTITUIBILIDAD_COLORS: Record<string, string> = {
  exclusivo:   "bg-red-900/40 text-red-300",
  dominante:   "bg-orange-900/40 text-orange-300",
  competitivo: "bg-green-900/40 text-green-300",
}

// Severidad de un single point of failure
const SEVERIDAD_COLORS: Record<string, string> = {
  critico: "bg-red-900/40 text-red-300",
  alto:    "bg-orange-900/40 text-orange-300",
  medio:   "bg-yellow-900/40 text-yellow-300",
}

function Badge({ v, colors }: { v: string; colors: Record<string, string> }) {
  if (!v) return null
  const cls = colors[v.toLowerCase()] ?? "bg-gray-800 text-gray-400"
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{v}</span>
}

type Empresa = { empresa: string; ticker?: string; pais?: string; cuota_mercado?: string }

// Chips empresa+ticker — cada eslabón es un nodo invertible
function CompanyChips({ empresas }: { empresas: Empresa[] }) {
  if (!empresas || empresas.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {empresas.map((e, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] bg-gray-700 px-2 py-1 rounded">
          {e.ticker ? <span className="font-bold text-blue-300">{e.ticker}</span> : null}
          <span className="text-gray-200">{e.empresa}</span>
          {e.pais ? <span className="text-gray-500">{e.pais}</span> : null}
          {e.cuota_mercado ? <span className="text-gray-400">{e.cuota_mercado}</span> : null}
        </span>
      ))}
    </div>
  )
}

function SupplyResult({ d }: { d: Record<string, unknown> }) {
  const cadena = d.cadena_inversa as {
    tier: string; insumo: string; descripcion: string
    empresas: { empresa: string; ticker?: string; pais?: string; cuota_mercado?: string; sustituibilidad?: string }[]
  }[] ?? []
  const spof = d.single_point_of_failure as {
    punto: string; tipo: string; descripcion: string; empresas_implicadas: string[]; severidad: string
  }[] ?? []
  const riesgos = d.puntos_riesgo as { riesgo: string; impacto: string; mitigacion: string }[] ?? []
  const kpis = d.indicadores_clave as string[] ?? []
  const tendencias = d.tendencias as string[] ?? []

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Cadena Inversa · tier-1 → tier-3</h4>
        <div className="space-y-3">
          {cadena.map((link, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300">{link.tier}</span>
                <span className="text-sm font-medium flex-1">{link.insumo}</span>
              </div>
              <div className="text-xs text-gray-400">{link.descripcion}</div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(link.empresas ?? []).map((e, j) => (
                  <span key={j} className="inline-flex items-center gap-1.5 text-[11px] bg-gray-700 px-2 py-1 rounded">
                    {e.ticker ? <span className="font-bold text-blue-300">{e.ticker}</span> : null}
                    <span className="text-gray-200">{e.empresa}</span>
                    {e.pais ? <span className="text-gray-500">{e.pais}</span> : null}
                    {e.cuota_mercado ? <span className="text-gray-400">{e.cuota_mercado}</span> : null}
                    {e.sustituibilidad ? <Badge v={e.sustituibilidad} colors={SUSTITUIBILIDAD_COLORS} /> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {spof.length > 0 && (
        <div className="bg-gray-900 border border-red-800/40 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">⚠️ Single Point of Failure</h4>
          <div className="space-y-2">
            {spof.map((s, i) => (
              <div key={i} className="bg-red-950/30 border border-red-900/40 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium flex-1">{s.punto}</span>
                  {s.tipo ? <span className="text-[10px] text-gray-500 uppercase">{s.tipo}</span> : null}
                  <Badge v={s.severidad} colors={SEVERIDAD_COLORS} />
                </div>
                <div className="text-xs text-gray-400">{s.descripcion}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(s.empresas_implicadas ?? []).map((e, j) => (
                    <span key={j} className="text-[11px] bg-gray-800 px-2 py-0.5 rounded text-gray-300">{e}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Puntos de Riesgo</h4>
        <div className="space-y-2">
          {riesgos.map((r, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium flex-1">{r.riesgo}</span>
                <ImpactBadge v={r.impacto} />
              </div>
              <div className="text-xs text-gray-400">↳ {r.mitigacion}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">KPIs</h4>
          <ul className="space-y-1">{kpis.map((k, i) => <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-blue-400">→</span>{k}</li>)}</ul>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tendencias</h4>
          <ul className="space-y-1">{tendencias.map((t, i) => <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-violet-400">↑</span>{t}</li>)}</ul>
        </div>
      </div>
    </div>
  )
}

function ValueResult({ d }: { d: Record<string, unknown> }) {
  const primarias = d.actividades_primarias as { actividad: string; descripcion: string; margen_tipico: string; empresas_dominantes?: Empresa[] }[] ?? []
  const soporte = d.actividades_soporte as { actividad: string; descripcion: string; empresas_dominantes?: Empresa[] }[] ?? []
  const ventajas = d.ventajas_competitivas as string[] ?? []
  const drivers = d.drivers_valor as string[] ?? []
  const margen = d.margen_industria as { minimo: string; promedio: string; maximo: string } | undefined

  return (
    <div className="space-y-4">
      {margen && (
        <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-800/20 rounded-xl p-4 flex gap-8">
          <div><div className="text-xs text-gray-500 mb-0.5">Mín</div><div className="font-bold text-green-400">{margen.minimo}</div></div>
          <div><div className="text-xs text-gray-500 mb-0.5">Prom</div><div className="font-bold text-blue-400">{margen.promedio}</div></div>
          <div><div className="text-xs text-gray-500 mb-0.5">Máx</div><div className="font-bold text-violet-400">{margen.maximo}</div></div>
        </div>
      )}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actividades Primarias</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {primarias.map((a, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-sm">{a.actividad}</span>
                <span className="text-xs text-green-400 font-semibold ml-2">{a.margen_tipico}</span>
              </div>
              <div className="text-xs text-gray-400">{a.descripcion}</div>
              <CompanyChips empresas={a.empresas_dominantes ?? []} />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actividades de Soporte</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {soporte.map((a, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="font-medium text-sm mb-1">{a.actividad}</div>
              <div className="text-xs text-gray-400">{a.descripcion}</div>
              <CompanyChips empresas={a.empresas_dominantes ?? []} />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ventajas Competitivas</h4>
          <ul className="space-y-1">{ventajas.map((v, i) => <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-yellow-400">★</span>{v}</li>)}</ul>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Drivers de Valor</h4>
          <ul className="space-y-1">{drivers.map((v, i) => <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-blue-400">◆</span>{v}</li>)}</ul>
        </div>
      </div>
    </div>
  )
}

function FodaItem({ punto, badge, empresas }: { punto: string; badge: string; empresas?: Empresa[] }) {
  return (
    <li className="text-sm">
      <div className="flex gap-2 items-start">
        <span className="flex-1 text-gray-300">{punto}</span>
        <ImpactBadge v={badge} />
      </div>
      <CompanyChips empresas={empresas ?? []} />
    </li>
  )
}

function FodaResult({ d }: { d: Record<string, unknown> }) {
  const fortalezas = d.fortalezas as { punto: string; impacto: string; empresas?: Empresa[] }[] ?? []
  const oportunidades = d.oportunidades as { punto: string; horizonte: string; empresas?: Empresa[] }[] ?? []
  const debilidades = d.debilidades as { punto: string; urgencia: string; empresas?: Empresa[] }[] ?? []
  const amenazas = d.amenazas as { punto: string; probabilidad: string; empresas?: Empresa[] }[] ?? []
  const estrategia = d.estrategia_recomendada as string

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-green-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">✅ Fortalezas</h4>
          <ul className="space-y-2">{fortalezas.map((f, i) => (
            <FodaItem key={i} punto={f.punto} badge={f.impacto} empresas={f.empresas} />
          ))}</ul>
        </div>
        <div className="bg-gray-900 border border-blue-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">🚀 Oportunidades</h4>
          <ul className="space-y-2">{oportunidades.map((o, i) => (
            <FodaItem key={i} punto={o.punto} badge={o.horizonte} empresas={o.empresas} />
          ))}</ul>
        </div>
        <div className="bg-gray-900 border border-yellow-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-3">⚠️ Debilidades</h4>
          <ul className="space-y-2">{debilidades.map((d2, i) => (
            <FodaItem key={i} punto={d2.punto} badge={d2.urgencia} empresas={d2.empresas} />
          ))}</ul>
        </div>
        <div className="bg-gray-900 border border-red-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">🔴 Amenazas</h4>
          <ul className="space-y-2">{amenazas.map((a, i) => (
            <FodaItem key={i} punto={a.punto} badge={a.probabilidad} empresas={a.empresas} />
          ))}</ul>
        </div>
      </div>
      {estrategia && (
        <div className="bg-gradient-to-r from-blue-900/20 to-violet-900/20 border border-blue-800/20 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-2">💡 Estrategia Recomendada</h4>
          <p className="text-sm text-gray-300 leading-relaxed">{estrategia}</p>
        </div>
      )}
    </div>
  )
}

// Señal de valoración → estilo y etiqueta de acción (comprar barato / vender caro)
const SENAL_CONFIG: Record<string, { cls: string; label: string }> = {
  barato: { cls: "bg-green-900/40 text-green-300 border-green-800/40", label: "COMPRA" },
  caro:   { cls: "bg-red-900/40 text-red-300 border-red-800/40",       label: "VENTA" },
  justo:  { cls: "bg-gray-800 text-gray-400 border-gray-700",          label: "MANTENER" },
}

// Bloque común a los 3 análisis: tickers clasificados por oportunidad de inversión
function OportunidadesResult({ d }: { d: Record<string, unknown> }) {
  const ops = d.oportunidades_inversion as
    { ticker: string; empresa: string; senal: string; tesis: string }[] ?? []
  if (ops.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mt-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        💰 Oportunidades de inversión
      </h4>
      <div className="space-y-2">
        {ops.map((o, i) => {
          const s = SENAL_CONFIG[o.senal?.toLowerCase()] ?? SENAL_CONFIG.justo
          return (
            <div key={i} className={`rounded-lg p-3 border ${s.cls}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm text-white">{o.ticker}</span>
                <span className="text-xs text-gray-400 flex-1">{o.empresa}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/30">{s.label}</span>
              </div>
              <div className="text-xs">{o.tesis}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// API URL lookup from TABS configuration
const API_URLS: Record<Tab, string> = Object.fromEntries(
  TABS.map(t => [t.id, t.apiPath])
) as Record<Tab, string>

interface AnalysisState {
  sector: string
  subsector: string
  tickers: string
  activeTab: Tab | null
  loading: boolean
  result: Record<string, unknown> | null
  proveedor: string
  tickersUsados: string[]
  error: string
}

export default function CadenasPage() {
  const [state, setState] = useState<AnalysisState>({
    sector: "",
    subsector: "",
    tickers: "",
    activeTab: null,
    loading: false,
    result: null,
    proveedor: "",
    tickersUsados: [],
    error: "",
  })

  async function runAnalysis(tab: Tab) {
    if (!state.sector.trim() || !state.subsector.trim()) {
      setState(prev => ({ ...prev, error: "Ingresa sector y subsector" }))
      return
    }

    setState(prev => ({ ...prev, activeTab: tab, loading: true, error: "", result: null, tickersUsados: [] }))

    try {
      const res = await fetch(API_URLS[tab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector: state.sector.trim(),
          subsector: state.subsector.trim(),
          tickers: state.tickers.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Error desconocido")
      setState(prev => ({ ...prev, result: json.data, proveedor: json.proveedor, tickersUsados: json.tickers_usados ?? [] }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido"
      setState(prev => ({ ...prev, error: msg }))
    } finally {
      setState(prev => ({ ...prev, loading: false }))
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-lg font-bold text-white mb-1">Cadenas</h1>
          <p className="text-xs text-gray-500">Análisis de cadena de suministros y valores por sector · IA</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-6 py-6 flex flex-col gap-6">

        {/* Inputs */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1.5 block">SECTOR</label>
              <input
                value={state.sector}
                onChange={e => setState(prev => ({ ...prev, sector: e.target.value }))}
                placeholder="ej. Technology"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1.5 block">SUBSECTOR</label>
              <input
                value={state.subsector}
                onChange={e => setState(prev => ({ ...prev, subsector: e.target.value }))}
                placeholder="ej. Semiconductores"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Tickers — opcional: inyecta datos financieros reales (Yahoo Finance) */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 font-medium mb-1.5 block">
              TICKERS <span className="text-gray-600">(opcional · separados por coma · máx. 8)</span>
            </label>
            <input
              value={state.tickers}
              onChange={e => setState(prev => ({ ...prev, tickers: e.target.value }))}
              placeholder="ej. NVDA, AMD, AVGO"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
            />
            <p className="text-[11px] text-gray-600 mt-1">
              1 ticker → análisis de la empresa · varios → promedio del subsector · vacío → análisis sectorial
            </p>
          </div>

          {/* Sector chips */}
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map(s => (
              <button
                key={s.nombre}
                onClick={() => setState(prev => ({ ...prev, sector: s.nombre }))}
                className={`text-xs px-2.5 py-1 rounded-full transition ${state.sector === s.nombre ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Analysis tabs */}
        <div className="flex gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => runAnalysis(tab.id)}
              disabled={state.loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                state.activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
              } disabled:opacity-50`}
            >
              {state.loading && state.activeTab === tab.id ? "Analizando..." : tab.label}
            </button>
          ))}

          {state.tickersUsados.length > 0 && !state.loading && (
            <span className="ml-auto self-center text-xs font-medium px-3 py-1 rounded-full bg-green-700 text-white">
              📊 Datos: {state.tickersUsados.join(", ")}
            </span>
          )}

          {state.proveedor && !state.loading && (
            <span className={`${state.tickersUsados.length > 0 ? "" : "ml-auto"} self-center text-xs font-medium px-3 py-1 rounded-full bg-blue-600 text-white`}>
              {state.proveedor}
            </span>
          )}
        </div>

        {/* Error */}
        {state.error && (
          <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4 text-sm text-red-400">{state.error}</div>
        )}

        {/* Loading */}
        {state.loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Generando análisis con IA...</span>
          </div>
        )}

        {/* Results */}
        {state.result && !state.loading && (
          <div>
            {state.activeTab === "supply" && <SupplyResult d={state.result} />}
            {state.activeTab === "value"  && <ValueResult d={state.result} />}
            {state.activeTab === "foda"   && <FodaResult d={state.result} />}
            <OportunidadesResult d={state.result} />
          </div>
        )}

        {/* Empty state */}
        {!state.result && !state.loading && !state.error && (
          <div className="text-center py-20 text-gray-600">
            <div className="text-4xl mb-3">⛓️</div>
            <p className="text-sm">Selecciona un sector y subsector, luego elige el tipo de análisis</p>
          </div>
        )}
      </div>
    </div>
  )
}
