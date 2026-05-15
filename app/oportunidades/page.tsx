"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"

type OpportunityItem = {
  symbol: string
  company: string
  sector: string
  grade: string
  currentPrice: number
  buyScore: number
  pe: number
  upsideToTarget: number
  historicalPercentile: number | null
  opportunityScore: number
  bucket: "comprar" | "vender" | "neutral"
  tesis: string
}

type FeedResponse = {
  comprar: OpportunityItem[]
  vender: OpportunityItem[]
  total: number
  fallback: boolean
  asOf: string | null
}

const UNIVERSES = [
  { id: "sp500",  label: "S&P 500" },
  { id: "dia",    label: "Dow 30" },
  { id: "nasdaq", label: "Nasdaq 100" },
]

// Barra 0-100 del opportunityScore.
function ScoreBar({ score, tone }: { score: number; tone: "buy" | "sell" }) {
  const color = tone === "buy" ? "bg-green-500" : "bg-red-500"
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
    </div>
  )
}

function OpportunityCard({ item, tone }: { item: OpportunityItem; tone: "buy" | "sell" }) {
  const border = tone === "buy" ? "border-green-800/40" : "border-red-800/40"
  const scoreColor = tone === "buy" ? "text-green-300" : "text-red-300"
  return (
    <Link
      href={`/empresa/${item.symbol}`}
      className={`block bg-gray-900 border ${border} rounded-xl p-4 hover:bg-gray-800/60 transition`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-bold text-sm text-white">{item.symbol}</span>
        <span className="text-xs text-gray-500 truncate flex-1">{item.company}</span>
        <span className={`text-lg font-black ${scoreColor}`}>{item.opportunityScore}</span>
      </div>
      <ScoreBar score={item.opportunityScore} tone={tone} />
      <p className="text-xs text-gray-400 mt-2 leading-relaxed">{item.tesis}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-600">
        <span>Grade {item.grade}</span>
        <span>buyScore {item.buyScore}</span>
        {item.pe > 0 && <span>PE {item.pe.toFixed(0)}</span>}
        {item.upsideToTarget !== 0 && (
          <span>{item.upsideToTarget > 0 ? "+" : ""}{item.upsideToTarget.toFixed(0)}% a target</span>
        )}
        {item.historicalPercentile !== null && (
          <span
            className={
              item.historicalPercentile <= 35 ? "text-green-400"
              : item.historicalPercentile >= 65 ? "text-red-400"
              : "text-gray-500"
            }
            title="Percentil del PE actual vs su propia historia (bajo = barata, alto = cara)"
          >
            PE histórico p{item.historicalPercentile}
          </span>
        )}
      </div>
    </Link>
  )
}

function Section({
  title, emoji, items, tone, empty,
}: {
  title: string; emoji: string; items: OpportunityItem[]; tone: "buy" | "sell"; empty: string
}) {
  return (
    <div>
      <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <span>{emoji}</span>{title}
        <span className="text-xs text-gray-600 font-normal">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-gray-600 py-6 text-center">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(i => <OpportunityCard key={i.symbol} item={i} tone={tone} />)}
        </div>
      )}
    </div>
  )
}

export default function OportunidadesPage() {
  const [universe, setUniverse] = useState("sp500")
  const [data, setData]         = useState<FeedResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState("")

  const load = useCallback(async (u: string) => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/oportunidades?universe=${u}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Error desconocido")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(universe) }, [universe, load])

  return (
    <div className="flex flex-col min-h-screen">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-lg font-bold text-white mb-1">Oportunidades</h1>
          <p className="text-xs text-gray-500">
            Feed rankeado — comprar barato, vender caro. Fusiona scoring fundamental,
            veredicto institucional y régimen de mercado.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-6 py-6 flex flex-col gap-6">

        {/* Filtro de universo */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {UNIVERSES.map(u => (
            <button
              key={u.id}
              onClick={() => setUniverse(u.id)}
              className={`text-xs px-3 py-1 rounded-full transition ${
                universe === u.id ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-400"
              }`}
            >
              {u.label}
            </button>
          ))}
          {data?.asOf && !loading && (
            <span className="ml-auto text-[11px] text-gray-600">
              {data.fallback ? "En vivo · " : "Snapshot "}
              {new Date(data.asOf).toLocaleString("es")}
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Cargando oportunidades...</span>
          </div>
        )}

        {data && !loading && !error && (
          <>
            <Section
              title="Comprar barato" emoji="🟢" tone="buy"
              items={data.comprar}
              empty="Sin oportunidades de compra claras en este universo hoy."
            />
            <Section
              title="Vender caro" emoji="🔴" tone="sell"
              items={data.vender}
              empty="Sin oportunidades de venta claras en este universo hoy."
            />
            {data.total === 0 && (
              <p className="text-center text-xs text-gray-600 py-8">
                No hay snapshot disponible. El feed se llena cuando corre el cron diario
                (<code>/api/cron/snapshot</code>) o cuando scanner-pro responde en vivo.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
