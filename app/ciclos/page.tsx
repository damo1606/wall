"use client"

import { useState, useEffect } from "react"
import type { MacroData, PhaseDetection } from "@/lib/macro"
import { ErrorBoundary } from "@/app/ErrorBoundary"

type EtfData = {
  symbol: string; sector: string; name: string
  currentPrice: number; change1d: number | null
  change52w: number | null; ytdReturn: number | null
}

type Phase = "recovery" | "expansion" | "late" | "recession"
type Rating = "strong" | "neutral" | "weak"

// Score de calor 1-10: intensidad de atractivo del sector en cada fase
function heat(score: number): { bg: string; text: string; border: string; label: string } {
  if (score >= 9) return { bg: "bg-emerald-600",    text: "text-white",        border: "border-emerald-500", label: "Outperform" }
  if (score >= 7) return { bg: "bg-green-700/80",   text: "text-green-100",    border: "border-green-600",   label: "Outperform" }
  if (score >= 5) return { bg: "bg-gray-700/60",    text: "text-gray-300",     border: "border-gray-600",    label: "Neutral" }
  if (score >= 3) return { bg: "bg-orange-900/70",  text: "text-orange-300",   border: "border-orange-800",  label: "Underperform" }
  return           { bg: "bg-red-900/70",   text: "text-red-300",      border: "border-red-800",     label: "Underperform" }
}

const PHASES: Record<Phase, {
  label: string
  labelShort: string
  color: string
  colorDim: string
  ring: string
  text: string
  badge: string
  border: string
  bg: string
  description: string
  indicators: string[]
  duration: string
  gdp: string
  rates: string
  unemployment: string
  inflation: string
}> = {
  recovery: {
    label: "Recuperación",
    labelShort: "Recup.",
    color: "#3b82f6",
    colorDim: "#1e3a5f",
    ring: "ring-blue-500",
    text: "text-blue-300",
    badge: "bg-blue-900/60 text-blue-200 border border-blue-800",
    border: "border-blue-800",
    bg: "bg-blue-950/40",
    description: "La economía sale de la recesión. GDP crece desde niveles bajos, el desempleo está alto pero mejorando y las tasas de interés en mínimos. El mercado anticipa la recuperación antes que los datos macroeconómicos lo confirmen.",
    indicators: ["GDP acelerando desde contracción", "Tasas de interés en mínimos históricos", "Crédito comenzando a expandirse", "Confianza del consumidor subiendo"],
    duration: "12–24 meses",
    gdp: "↑ Acelerando",
    rates: "↓ Mínimos",
    unemployment: "↓ Bajando",
    inflation: "→ Baja",
  },
  expansion: {
    label: "Expansión",
    labelShort: "Expans.",
    color: "#22c55e",
    colorDim: "#14532d",
    ring: "ring-green-500",
    text: "text-green-300",
    badge: "bg-green-900/60 text-green-200 border border-green-800",
    border: "border-green-800",
    bg: "bg-green-950/40",
    description: "La fase más larga del ciclo. GDP crece por encima de tendencia, empleo pleno, consumo fuerte e inversión empresarial alta. Los bancos centrales comienzan a subir tasas para controlar la inflación.",
    indicators: ["GDP sobre tendencia histórica", "Desempleo en mínimos del ciclo", "Inversión empresarial (capex) máxima", "Bancos centrales subiendo tasas"],
    duration: "24–60 meses",
    gdp: "↑↑ Fuerte",
    rates: "↑ Subiendo",
    unemployment: "→ Mínimos",
    inflation: "↑ Moderada",
  },
  late: {
    label: "Desaceleración",
    labelShort: "Desacel.",
    color: "#f59e0b",
    colorDim: "#78350f",
    ring: "ring-amber-500",
    text: "text-amber-300",
    badge: "bg-amber-900/60 text-amber-200 border border-amber-800",
    border: "border-amber-800",
    bg: "bg-amber-950/40",
    description: "El ciclo madura. GDP crece pero desacelera, inflación en máximos, tasas de interés en techo. Las empresas comienzan a ver compresión de márgenes por costos más altos. El mercado empieza a anticipar el enfriamiento.",
    indicators: ["Inflación en máximos del ciclo", "Tasas de interés en techo", "Márgenes corporativos comprimiéndose", "Inventarios acumulándose"],
    duration: "12–18 meses",
    gdp: "→ Desacelerando",
    rates: "→ En techo",
    unemployment: "→ Bajo pero estable",
    inflation: "↑↑ Alta",
  },
  recession: {
    label: "Recesión",
    labelShort: "Recesión",
    color: "#ef4444",
    colorDim: "#7f1d1d",
    ring: "ring-red-500",
    text: "text-red-300",
    badge: "bg-red-900/60 text-red-200 border border-red-800",
    border: "border-red-800",
    bg: "bg-red-950/40",
    description: "GDP negativo dos trimestres consecutivos o más. Desempleo subiendo rápido, consumo cayendo, crédito contrayéndose. Los bancos centrales bajan tasas agresivamente para estimular la economía.",
    indicators: ["GDP negativo (dos trimestres)", "Desempleo subiendo aceleradamente", "Crédito contrayéndose", "Bancos centrales bajando tasas agresivamente"],
    duration: "6–18 meses",
    gdp: "↓ Negativo",
    rates: "↓ Bajando",
    unemployment: "↑ Subiendo",
    inflation: "↓ Cayendo",
  },
}

type SectorCycle = {
  name: string
  emoji: string
  recovery: Rating
  expansion: Rating
  late: Rating
  recession: Rating
  // Score de calor 1-10 por fase
  scores: { recovery: number; expansion: number; late: number; recession: number }
  note: string
}

const SECTORS: SectorCycle[] = [
  { name: "Servicios Financieros", emoji: "🏦",
    recovery: "strong",  expansion: "strong",  late: "neutral", recession: "weak",
    scores: { recovery: 9, expansion: 8, late: 5, recession: 2 },
    note: "Beneficia de tasas bajas, crédito expansivo y valuaciones de activos subiendo" },
  { name: "Consumo Discrecional",  emoji: "🛍️",
    recovery: "strong",  expansion: "strong",  late: "weak",    recession: "weak",
    scores: { recovery: 8, expansion: 8, late: 3, recession: 2 },
    note: "Directamente ligado al empleo y confianza del consumidor" },
  { name: "Industriales",          emoji: "⚙️",
    recovery: "strong",  expansion: "strong",  late: "neutral", recession: "weak",
    scores: { recovery: 8, expansion: 8, late: 5, recession: 2 },
    note: "El capex empresarial sigue al ciclo con cierto retraso" },
  { name: "Inmobiliario",          emoji: "🏢",
    recovery: "strong",  expansion: "neutral", late: "weak",    recession: "neutral",
    scores: { recovery: 8, expansion: 5, late: 3, recession: 5 },
    note: "Tasas bajas en recuperación impulsan las valuaciones inmobiliarias" },
  { name: "Tecnología",            emoji: "💻",
    recovery: "neutral", expansion: "strong",  late: "weak",    recession: "neutral",
    scores: { recovery: 5, expansion: 9, late: 3, recession: 5 },
    note: "Las valuaciones altas son vulnerables cuando las tasas suben" },
  { name: "Comunicaciones",        emoji: "📡",
    recovery: "neutral", expansion: "strong",  late: "neutral", recession: "neutral",
    scores: { recovery: 5, expansion: 8, late: 5, recession: 5 },
    note: "La publicidad digital sigue el ciclo económico" },
  { name: "Materiales",            emoji: "⛏️",
    recovery: "neutral", expansion: "strong",  late: "strong",  recession: "weak",
    scores: { recovery: 5, expansion: 8, late: 8, recession: 2 },
    note: "La demanda de commodities llega a su pico al final del ciclo" },
  { name: "Energía",               emoji: "⛽",
    recovery: "neutral", expansion: "neutral", late: "strong",  recession: "weak",
    scores: { recovery: 4, expansion: 5, late: 9, recession: 2 },
    note: "El precio del petróleo sube con la inflación en ciclo tardío" },
  { name: "Salud / Biotech",       emoji: "🧬",
    recovery: "neutral", expansion: "neutral", late: "strong",  recession: "strong",
    scores: { recovery: 5, expansion: 5, late: 8, recession: 9 },
    note: "Demanda inelástica — defensivo en cualquier entorno económico" },
  { name: "Consumo Básico",        emoji: "🛒",
    recovery: "weak",    expansion: "weak",    late: "strong",  recession: "strong",
    scores: { recovery: 3, expansion: 3, late: 8, recession: 9 },
    note: "Productos esenciales — protección en recesión y desaceleración" },
  { name: "Utilities",             emoji: "⚡",
    recovery: "weak",    expansion: "weak",    late: "neutral", recession: "strong",
    scores: { recovery: 2, expansion: 2, late: 5, recession: 9 },
    note: "Se comporta como bono largo — sube cuando las tasas bajan" },
]

const RATING = {
  strong:  { label: "Outperform", icon: "↑", cell: "bg-green-950/60 text-green-300 border-green-900/50",  dot: "bg-green-400" },
  neutral: { label: "Neutral",    icon: "→", cell: "bg-gray-900/60 text-gray-500 border-gray-800/50",      dot: "bg-gray-600" },
  weak:    { label: "Underperform",icon:"↓", cell: "bg-red-950/60 text-red-400 border-red-900/50",         dot: "bg-red-500" },
}

// SVG donut wheel — 4 segments, clockwise starting from top
// viewBox 0 0 300 300, center 150 150, R_outer=135, R_inner=70
const WHEEL_PATHS: Record<Phase, string> = {
  recovery:  "M 150 15 A 135 135 0 0 1 285 150 L 220 150 A 70 70 0 0 0 150 80 Z",
  expansion: "M 285 150 A 135 135 0 0 1 150 285 L 150 220 A 70 70 0 0 0 220 150 Z",
  late:      "M 150 285 A 135 135 0 0 1 15 150 L 80 150 A 70 70 0 0 0 150 220 Z",
  recession: "M 15 150 A 135 135 0 0 1 150 15 L 150 80 A 70 70 0 0 0 80 150 Z",
}

// Label positions at mid-radius (105) of each segment
const WHEEL_LABELS: Record<Phase, { x: number; y: number; anchor: string }> = {
  recovery:  { x: 224, y: 76,  anchor: "middle" },
  expansion: { x: 224, y: 224, anchor: "middle" },
  late:      { x: 76,  y: 224, anchor: "middle" },
  recession: { x: 76,  y: 76,  anchor: "middle" },
}

// Sector counts per phase for the wheel
function phaseSectorCount(phase: Phase, rating: Rating) {
  return SECTORS.filter(s => s[phase] === rating).length
}

export default function Ciclos() {
  const [active, setActive]       = useState<Phase>("recovery")
  const [macro,  setMacro]        = useState<(MacroData & { detection: PhaseDetection }) | null>(null)
  const [etfs,   setEtfs]         = useState<EtfData[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const opts = { signal: controller.signal }
    Promise.all([
      fetch("/api/macro",       opts).then(r => r.json()).catch(() => null),
      fetch("/api/sectors-etf", opts).then(r => r.json()).catch(() => null),
    ]).then(([macroRes, etfRes]) => {
      if (macroRes && !macroRes.error) {
        setMacro(macroRes)
        setActive(macroRes.detection?.phase ?? "expansion")
      }
      if (etfRes?.etfs) setEtfs(etfRes.etfs)
      setLoading(false)
    }).catch(err => { if (err.name !== "AbortError") setLoading(false) })
    return () => controller.abort()
  }, [])

  const etfBySector = Object.fromEntries(etfs.map(e => [e.sector, e]))
  const phase = PHASES[active]

  return (
    <ErrorBoundary fallback="Error al cargar ciclos económicos">
    <main className="min-h-screen bg-gray-950 text-gray-100">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Ciclos Económicos</h1>
            <p className="text-gray-400 text-sm mt-1">Rotación sectorial según la fase del ciclo — modelo Fidelity / Goldman Sachs</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Panel de fase actual detectada */}
        {loading ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-gray-400">Consultando datos reales de FRED y Yahoo Finance...</span>
          </div>
        ) : macro ? (
          <div className={`rounded-xl border px-5 py-4 ${PHASES[macro.detection.phase].bg} ${PHASES[macro.detection.phase].border}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: PHASES[macro.detection.phase].color }} />
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Fase actual detectada</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${PHASES[macro.detection.phase].badge}`}>
                    {macro.detection.confidence}% confianza
                  </span>
                </div>
                <h3 className={`text-xl font-black ${PHASES[macro.detection.phase].text}`}>
                  {PHASES[macro.detection.phase].label}
                </h3>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {macro.detection.signals.slice(0, 3).map((s, i) => (
                    <span key={i} className="text-xs bg-gray-900/60 text-gray-400 px-2 py-0.5 rounded border border-gray-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Indicadores macro reales */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { d: macro.gdpGrowth,    label: "PIB YoY"       },
                  { d: macro.inflation,    label: "Inflación"     },
                  { d: macro.unemployment, label: "Desempleo"     },
                  { d: macro.fedRate,      label: "Fed Rate"      },
                  { d: macro.yieldCurve,   label: "Curva 10Y-2Y"  },
                ].map(({ d, label }) => d && (
                  <div key={label} className="bg-gray-900/70 rounded-lg px-3 py-2 min-w-[90px]">
                    <div className="text-[10px] text-gray-600 mb-0.5">{label}</div>
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-bold font-mono ${
                        d.trend === "up" ? "text-green-400" :
                        d.trend === "down" ? "text-red-400" : "text-gray-300"
                      }`}>
                        {d.value.toFixed(2)}{d.unit === "%" ? "%" : ""}
                      </span>
                      <span className="text-xs">{d.trend === "up" ? "↑" : d.trend === "down" ? "↓" : "→"}</span>
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {d.date?.substring(0, 7)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 border border-red-900/40 rounded-xl px-5 py-3 text-sm text-red-400">
            No se pudo obtener datos macroeconómicos. Mostrando modelo teórico.
          </div>
        )}

        {/* Dashboard de indicadores FRED */}
        {macro && (() => {
          type IndGroup = {
            title: string
            color: string
            items: Array<{ key: keyof typeof macro; label: string }>
          }
          const GROUPS: IndGroup[] = [
            {
              title: "Mercado Laboral",
              color: "text-blue-400",
              items: [
                { key: "nfp",          label: "Nóminas YoY" },
                { key: "joblessClaims",label: "Sol. desempleo" },
                { key: "u6Rate",       label: "Desempleo U-6" },
                { key: "jolts",        label: "Vacantes JOLTS" },
              ],
            },
            {
              title: "Crédito y Condiciones",
              color: "text-orange-400",
              items: [
                { key: "hySpread",     label: "HY Spread" },
                { key: "igSpread",     label: "IG Spread" },
                { key: "creditDelinq", label: "Morosidad tarjetas" },
                { key: "finStress",    label: "Estrés financiero" },
              ],
            },
            {
              title: "Inflación Desagregada",
              color: "text-red-400",
              items: [
                { key: "coreInflation",label: "CPI Core" },
                { key: "pce",          label: "PCE" },
                { key: "corePce",      label: "PCE Core" },
                { key: "inflExp5y",    label: "Inf. Exp. 5Y" },
                { key: "inflExp10y",   label: "Inf. Exp. 10Y" },
              ],
            },
            {
              title: "Curva de Tasas",
              color: "text-purple-400",
              items: [
                { key: "yc10y3m",    label: "Spread 10Y-3M" },
                { key: "yieldCurve", label: "Spread 10Y-2Y" },
                { key: "treasury2y", label: "Treasury 2Y" },
                { key: "treasury5y", label: "Treasury 5Y" },
                { key: "treasury10y",label: "Treasury 10Y" },
                { key: "treasury30y",label: "Treasury 30Y" },
              ],
            },
            {
              title: "Economía Real",
              color: "text-emerald-400",
              items: [
                { key: "indProd",      label: "Prod. Industrial" },
                { key: "capUtil",      label: "Utiliz. Capacidad" },
                { key: "retailSales",  label: "Ventas Minoristas" },
                { key: "housStarts",   label: "Inicio Construcc." },
                { key: "buildPermits", label: "Permisos Construcc." },
                { key: "consumerSent", label: "Confianza Consumidor" },
              ],
            },
            {
              title: "Dinero y Crédito",
              color: "text-cyan-400",
              items: [
                { key: "m2",       label: "M2" },
                { key: "ciCredit", label: "Crédito C&I" },
                { key: "bizLoans", label: "Préstamos empresas" },
              ],
            },
          ]

          return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Panel Macro — FRED</h2>
                  <p className="text-xs text-gray-500 mt-0.5">32 series en tiempo real · Actualiza cada 12h</p>
                </div>
                <span className="text-[10px] text-gray-600 font-mono">{macro.fetchedAt?.substring(0, 10)}</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {GROUPS.map(g => (
                  <div key={g.title} className="bg-gray-950/50 rounded-lg border border-gray-800/60 overflow-hidden">
                    <div className={`px-3 py-2 border-b border-gray-800/60 text-xs font-bold uppercase tracking-wider ${g.color}`}>
                      {g.title}
                    </div>
                    <div className="divide-y divide-gray-800/40">
                      {g.items.map(({ key, label }) => {
                        const d = macro[key] as import("@/lib/macro").MacroIndicator | null
                        if (!d) return (
                          <div key={key as string} className="px-3 py-2 flex items-center justify-between">
                            <span className="text-xs text-gray-600">{label}</span>
                            <span className="text-xs text-gray-700">—</span>
                          </div>
                        )
                        const trendColor = d.trend === "up" ? "text-green-400" : d.trend === "down" ? "text-red-400" : "text-gray-400"
                        const trendIcon  = d.trend === "up" ? "↑" : d.trend === "down" ? "↓" : "→"
                        return (
                          <div key={key as string} className="px-3 py-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs text-gray-500 truncate">{label}</div>
                              <div className="text-[10px] text-gray-700">{d.date?.substring(0, 7)}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`text-sm font-bold font-mono ${trendColor}`}>
                                {d.value.toFixed(2)}{d.unit.startsWith("%") ? "%" : ""}
                              </span>
                              <span className={`text-xs ${trendColor}`}>{trendIcon}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Wheel + Phase detail */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Wheel */}
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col items-center">
            <p className="text-xs text-gray-500 mb-4 text-center">Haz click en una fase para ver los detalles</p>

            <svg viewBox="0 0 300 300" className="w-full max-w-[260px]">
              {(["recovery","expansion","late","recession"] as Phase[]).map((p) => (
                <path
                  key={p}
                  d={WHEEL_PATHS[p]}
                  fill={active === p ? PHASES[p].color : PHASES[p].colorDim}
                  stroke="#030712"
                  strokeWidth="4"
                  className="cursor-pointer transition-all duration-200 hover:opacity-90"
                  onClick={() => setActive(p)}
                />
              ))}

              {/* Divider lines */}
              <line x1="150" y1="15"  x2="150" y2="80"  stroke="#030712" strokeWidth="4"/>
              <line x1="285" y1="150" x2="220" y2="150" stroke="#030712" strokeWidth="4"/>
              <line x1="150" y1="285" x2="150" y2="220" stroke="#030712" strokeWidth="4"/>
              <line x1="15"  y1="150" x2="80"  y2="150" stroke="#030712" strokeWidth="4"/>

              {/* Center circle */}
              <circle cx="150" cy="150" r="68" fill="#030712" stroke="#1f2937" strokeWidth="1"/>
              <text x="150" y="142" textAnchor="middle" fill="#6b7280" fontSize="10" fontFamily="monospace">CICLO</text>
              <text x="150" y="157" textAnchor="middle" fill="#374151" fontSize="22">↻</text>
              <text x="150" y="172" textAnchor="middle" fill="#6b7280" fontSize="10" fontFamily="monospace">ECONÓMICO</text>

              {/* Phase labels inside wheel */}
              {(["recovery","expansion","late","recession"] as Phase[]).map((p) => {
                const pos = WHEEL_LABELS[p]
                return (
                  <text
                    key={p}
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    fill={active === p ? "#ffffff" : "#9ca3af"}
                    fontSize="9"
                    fontWeight={active === p ? "bold" : "normal"}
                    fontFamily="sans-serif"
                    className="cursor-pointer select-none"
                    onClick={() => setActive(p)}
                  >
                    {PHASES[p].labelShort}
                  </text>
                )
              })}
            </svg>

            {/* Phase buttons */}
            <div className="grid grid-cols-2 gap-2 mt-4 w-full">
              {(["recovery","expansion","late","recession"] as Phase[]).map(p => (
                <button
                  key={p}
                  onClick={() => setActive(p)}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg transition-all border ${
                    active === p
                      ? `${PHASES[p].badge} ring-1 ring-offset-1 ring-offset-gray-900 ${PHASES[p].ring}`
                      : "bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200"
                  }`}
                >
                  {PHASES[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Phase detail */}
          <div className={`lg:col-span-3 rounded-xl border p-5 space-y-4 ${phase.bg} ${phase.border}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`text-xl font-bold ${phase.text}`}>{phase.label}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Duración típica: {phase.duration}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${phase.badge}`}>
                {phaseSectorCount(active, "strong")} sectores outperform
              </span>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed">{phase.description}</p>

            {/* Macro indicators */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "GDP",          value: phase.gdp },
                { label: "Tasas",        value: phase.rates },
                { label: "Desempleo",    value: phase.unemployment },
                { label: "Inflación",    value: phase.inflation },
              ].map(ind => (
                <div key={ind.label} className="bg-gray-900/60 rounded-lg px-3 py-2">
                  <div className="text-xs text-gray-600">{ind.label}</div>
                  <div className="text-sm font-semibold text-gray-200 mt-0.5">{ind.value}</div>
                </div>
              ))}
            </div>

            {/* Indicators list */}
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Señales clave</div>
              <ul className="space-y-1.5">
                {phase.indicators.map((ind, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-300">
                    <span className={`${phase.text} shrink-0 font-bold`}>▸</span>
                    {ind}
                  </li>
                ))}
              </ul>
            </div>

            {/* Sectors en esta fase — ordenados por score */}
            <div>
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Ranking de sectores — esta fase</div>
              <div className="space-y-1.5">
                {[...SECTORS]
                  .sort((a, b) => b.scores[active] - a.scores[active])
                  .map(s => {
                    const score = s.scores[active]
                    const h = heat(score)
                    return (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center shrink-0 border ${h.bg} ${h.text} ${h.border}`}>
                          {score}
                        </span>
                        <span className="text-xs text-gray-300">{s.emoji} {s.name}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-1 ml-1">
                          <div className={`h-1 rounded-full ${h.bg}`} style={{ width: `${score * 10}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Sector rotation matrix */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Matriz de Rotación Sectorial</h2>
            <p className="text-xs text-gray-500 mt-0.5">Comportamiento relativo de cada sector a lo largo del ciclo completo</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-semibold w-52">Sector</th>
                  {(["recovery","expansion","late","recession"] as Phase[]).map(p => (
                    <th key={p}
                      className={`px-4 py-3 text-xs font-semibold text-center cursor-pointer transition-colors ${
                        active === p ? PHASES[p].text : "text-gray-500 hover:text-gray-300"
                      }`}
                      onClick={() => setActive(p)}
                    >
                      {PHASES[p].label}
                    </th>
                  ))}
                  {etfs.length > 0 && (
                    <>
                      <th className="px-3 py-3 text-xs font-semibold text-center text-gray-500">1 Año</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center text-gray-500">YTD</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 text-xs text-gray-600 font-semibold hidden lg:table-cell">
                    Por qué
                  </th>
                </tr>
              </thead>
              <tbody>
                {SECTORS.map(s => (
                  <tr key={s.name} className="border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-200">{s.emoji} {s.name}</span>
                    </td>
                    {(["recovery","expansion","late","recession"] as Phase[]).map(p => {
                      const score = s.scores[p]
                      const h = heat(score)
                      return (
                        <td key={p} className={`px-2 py-2.5 text-center ${active === p ? "bg-white/5" : ""}`}>
                          <div className="flex flex-col items-center gap-1">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black border ${h.bg} ${h.text} ${h.border} ${
                              active === p ? "ring-2 ring-offset-1 ring-offset-gray-900 ring-white/30" : ""
                            }`}>
                              {score}
                            </span>
                            <span className={`text-[10px] font-medium ${h.text} opacity-70 hidden sm:block`}>
                              {h.label}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                    {etfs.length > 0 && (() => {
                      const etf = etfBySector[
                        s.name === "Tecnología" ? "Technology" :
                        s.name === "Servicios Financieros" ? "Financial Services" :
                        s.name === "Salud / Biotech" ? "Healthcare" :
                        s.name === "Consumo Discrecional" ? "Consumer Discretionary" :
                        s.name === "Consumo Básico" ? "Consumer Staples" :
                        s.name === "Industrial" ? "Industrials" :
                        s.name === "Comunicaciones" ? "Communication Services" :
                        s.name === "Energía" ? "Energy" :
                        s.name === "Utilities" ? "Utilities" :
                        s.name === "Inmobiliario" ? "Real Estate" :
                        "Basic Materials"
                      ]
                      const fmt = (v: number | null) => v === null ? "—" :
                        `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
                      const color = (v: number | null) => v === null ? "text-gray-600" :
                        v >= 10 ? "text-emerald-400" : v >= 0 ? "text-green-400" :
                        v >= -10 ? "text-orange-400" : "text-red-400"
                      return (
                        <>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-xs font-bold font-mono ${color(etf?.change52w ?? null)}`}>
                              {fmt(etf?.change52w ?? null)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-xs font-bold font-mono ${color(etf?.ytdReturn ?? null)}`}>
                              {fmt(etf?.ytdReturn ?? null)}
                            </span>
                          </td>
                        </>
                      )
                    })()}
                    <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell max-w-xs">
                      {s.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-5 py-3 border-t border-gray-800 flex flex-wrap gap-3 items-center">
            {[
              { score: "9-10", label: "Outperform fuerte",  bg: "bg-emerald-600",   text: "text-white" },
              { score: "7-8",  label: "Outperform",         bg: "bg-green-700/80",  text: "text-green-100" },
              { score: "5-6",  label: "Neutral",            bg: "bg-gray-700/60",   text: "text-gray-300" },
              { score: "3-4",  label: "Underperform",       bg: "bg-orange-900/70", text: "text-orange-300" },
              { score: "1-2",  label: "Underperform fuerte",bg: "bg-red-900/70",    text: "text-red-300" },
            ].map(l => (
              <div key={l.score} className="flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded text-xs font-black flex items-center justify-center ${l.bg} ${l.text}`}>
                  {l.score.split("-")[0]}
                </span>
                <span className="text-xs text-gray-500">{l.label}</span>
              </div>
            ))}
            <span className="text-xs text-gray-700 ml-auto hidden lg:block">
              Modelo Fidelity / Goldman Sachs — escala 1-10
            </span>
          </div>
        </div>

        {/* Nota metodológica */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-400">Nota metodológica:</strong> Este modelo representa el comportamiento <em>promedio</em> histórico de los sectores en cada fase del ciclo. Los ciclos no son idénticos — la duración, la intensidad y las condiciones específicas varían. En ciclos dominados por eventos exógenos (pandemias, guerras, crisis financieras) los patrones pueden desviarse significativamente. Usar como contexto general, no como señal de trading.
          </p>
        </div>

      </div>
    </main>
    </ErrorBoundary>
  )
}
