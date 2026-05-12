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

type ImpactBadgeProps = { v: string }
function ImpactBadge({ v }: ImpactBadgeProps) {
  const map: Record<string, string> = {
    alto: "bg-red-900/40 text-red-300", alta: "bg-red-900/40 text-red-300",
    medio: "bg-yellow-900/40 text-yellow-300", media: "bg-yellow-900/40 text-yellow-300",
    bajo: "bg-green-900/40 text-green-300", baja: "bg-green-900/40 text-green-300",
    corto: "bg-green-900/40 text-green-300",
    mediano: "bg-yellow-900/40 text-yellow-300",
    largo: "bg-blue-900/40 text-blue-300",
  }
  const cls = map[v?.toLowerCase()] ?? "bg-gray-800 text-gray-400"
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{v}</span>
}

function SupplyResult({ d }: { d: Record<string, unknown> }) {
  const actores = d.actores_clave as { nombre: string; rol: string; ejemplos: string[] }[] ?? []
  const flujo = d.flujo_materiales as { etapa: string; descripcion: string }[] ?? []
  const riesgos = d.puntos_riesgo as { riesgo: string; impacto: string; mitigacion: string }[] ?? []
  const kpis = d.indicadores_clave as string[] ?? []
  const tendencias = d.tendencias as string[] ?? []

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actores Clave</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {actores.map((a, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="font-medium text-sm mb-1">{a.nombre}</div>
              <div className="text-xs text-gray-400 mb-2">{a.rol}</div>
              <div className="flex flex-wrap gap-1">
                {(a.ejemplos ?? []).map((e, j) => (
                  <span key={j} className="text-xs bg-gray-700 px-2 py-0.5 rounded">{e}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Flujo de Materiales</h4>
        <div className="space-y-2">
          {flujo.map((f, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-blue-900 text-blue-300 text-xs flex items-center justify-center flex-shrink-0 font-bold">{i + 1}</div>
              <div>
                <div className="text-sm font-medium">{f.etapa}</div>
                <div className="text-xs text-gray-400">{f.descripcion}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
  const primarias = d.actividades_primarias as { actividad: string; descripcion: string; margen_tipico: string }[] ?? []
  const soporte = d.actividades_soporte as { actividad: string; descripcion: string }[] ?? []
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

function FodaResult({ d }: { d: Record<string, unknown> }) {
  const fortalezas = d.fortalezas as { punto: string; impacto: string }[] ?? []
  const oportunidades = d.oportunidades as { punto: string; horizonte: string }[] ?? []
  const debilidades = d.debilidades as { punto: string; urgencia: string }[] ?? []
  const amenazas = d.amenazas as { punto: string; probabilidad: string }[] ?? []
  const estrategia = d.estrategia_recomendada as string

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-green-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">✅ Fortalezas</h4>
          <ul className="space-y-2">{fortalezas.map((f, i) => (
            <li key={i} className="text-sm flex gap-2 items-start"><span className="flex-1 text-gray-300">{f.punto}</span><ImpactBadge v={f.impacto} /></li>
          ))}</ul>
        </div>
        <div className="bg-gray-900 border border-blue-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">🚀 Oportunidades</h4>
          <ul className="space-y-2">{oportunidades.map((o, i) => (
            <li key={i} className="text-sm flex gap-2 items-start"><span className="flex-1 text-gray-300">{o.punto}</span><ImpactBadge v={o.horizonte} /></li>
          ))}</ul>
        </div>
        <div className="bg-gray-900 border border-yellow-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-3">⚠️ Debilidades</h4>
          <ul className="space-y-2">{debilidades.map((d2, i) => (
            <li key={i} className="text-sm flex gap-2 items-start"><span className="flex-1 text-gray-300">{d2.punto}</span><ImpactBadge v={d2.urgencia} /></li>
          ))}</ul>
        </div>
        <div className="bg-gray-900 border border-red-800/30 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">🔴 Amenazas</h4>
          <ul className="space-y-2">{amenazas.map((a, i) => (
            <li key={i} className="text-sm flex gap-2 items-start"><span className="flex-1 text-gray-300">{a.punto}</span><ImpactBadge v={a.probabilidad} /></li>
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

export default function CadenasPage() {
  const [sector, setSector] = useState("")
  const [subsector, setSubsector] = useState("")
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [proveedor, setProveedor] = useState("")
  const [error, setError] = useState("")

  const urls: Record<Tab, string> = {
    supply: "/api/cadenas/supply-chain",
    value:  "/api/cadenas/value-chain",
    foda:   "/api/cadenas/foda",
  }

  async function runAnalysis(tab: Tab) {
    if (!sector.trim() || !subsector.trim()) {
      setError("Ingresa sector y subsector")
      return
    }
    setActiveTab(tab)
    setLoading(true)
    setError("")
    setResult(null)

    try {
      const res = await fetch(urls[tab], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: sector.trim(), subsector: subsector.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Error desconocido")
      setResult(json.data)
      setProveedor(json.proveedor)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
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
                value={sector}
                onChange={e => setSector(e.target.value)}
                placeholder="ej. Technology"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1.5 block">SUBSECTOR</label>
              <input
                value={subsector}
                onChange={e => setSubsector(e.target.value)}
                placeholder="ej. Semiconductores"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Sector chips */}
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map(s => (
              <button
                key={s.nombre}
                onClick={() => setSector(s.nombre)}
                className={`text-xs px-2.5 py-1 rounded-full transition ${sector === s.nombre ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Analysis tabs */}
        <div className="flex gap-2">
          {([
            { id: "supply", label: "⛓️ Suministros" },
            { id: "value",  label: "💎 Valores" },
            { id: "foda",   label: "📊 FODA" },
          ] as { id: Tab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => runAnalysis(tab.id)}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
              } disabled:opacity-50`}
            >
              {loading && activeTab === tab.id ? "Analizando..." : tab.label}
            </button>
          ))}

          {proveedor && !loading && (
            <span className={`ml-auto self-center text-xs font-medium px-3 py-1 rounded-full text-white ${proveedor === "gemini" ? "bg-blue-600" : "bg-orange-600"}`}>
              {proveedor === "gemini" ? "Google Gemini" : "Groq LLaMA"}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4 text-sm text-red-400">{error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Generando análisis con IA...</span>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div>
            {activeTab === "supply" && <SupplyResult d={result} />}
            {activeTab === "value"  && <ValueResult d={result} />}
            {activeTab === "foda"   && <FodaResult d={result} />}
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <div className="text-center py-20 text-gray-600">
            <div className="text-4xl mb-3">⛓️</div>
            <p className="text-sm">Selecciona un sector y subsector, luego elige el tipo de análisis</p>
          </div>
        )}
      </div>
    </div>
  )
}
