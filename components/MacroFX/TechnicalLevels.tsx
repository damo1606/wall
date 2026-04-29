"use client"

import { useState, useEffect } from "react"

type SRData = {
  symbol: string
  price: number
  atr14: number
  pdh: number
  pdl: number
  pivots: { pp: number; r1: number; r2: number; s1: number; s2: number }
  vwap: number | null
  vwapBands: { s1up: number; s1dn: number; s2up: number; s2dn: number } | null
  openingRange: { high: number; low: number } | null
  emas: { ema20: number; ema50: number; ema200: number }
  marketState: string
}

type Level = { label: string; value: number; kind: "vwap" | "pivot" | "ema" | "pd" | "or" }

function buildLevels(d: SRData): Level[] {
  const all: Level[] = [
    { label: "R2",     value: d.pivots.r2,   kind: "pivot" },
    { label: "R1",     value: d.pivots.r1,   kind: "pivot" },
    { label: "PP",     value: d.pivots.pp,   kind: "pivot" },
    { label: "S1",     value: d.pivots.s1,   kind: "pivot" },
    { label: "S2",     value: d.pivots.s2,   kind: "pivot" },
    { label: "PDH",    value: d.pdh,         kind: "pd"    },
    { label: "PDL",    value: d.pdl,         kind: "pd"    },
    { label: "EMA20",  value: d.emas.ema20,  kind: "ema"   },
    { label: "EMA50",  value: d.emas.ema50,  kind: "ema"   },
    { label: "EMA200", value: d.emas.ema200, kind: "ema"   },
  ]

  if (d.vwap && d.vwapBands) {
    all.push({ label: "VWAP",    value: d.vwap,              kind: "vwap" })
    all.push({ label: "VWAP+1σ", value: d.vwapBands.s1up,   kind: "vwap" })
    all.push({ label: "VWAP+2σ", value: d.vwapBands.s2up,   kind: "vwap" })
    all.push({ label: "VWAP-1σ", value: d.vwapBands.s1dn,   kind: "vwap" })
    all.push({ label: "VWAP-2σ", value: d.vwapBands.s2dn,   kind: "vwap" })
  }

  if (d.openingRange) {
    all.push({ label: "ORH", value: d.openingRange.high, kind: "or" })
    all.push({ label: "ORL", value: d.openingRange.low,  kind: "or" })
  }

  return all.filter(l => l.value > 0).sort((a, b) => b.value - a.value)
}

function distPct(level: number, price: number) {
  const d = ((level - price) / price) * 100
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`
}

function LevelRow({ label, value, price, kind }: Level & { price: number }) {
  const above   = value > price
  const isVwap  = kind === "vwap"
  const isPP    = kind === "pivot" && label === "PP"

  const labelColor = isVwap ? "text-amber-400" : isPP ? "text-gray-400" : above ? "text-red-400" : "text-emerald-400"
  const distColor  = above ? "text-red-600" : "text-emerald-700"

  return (
    <div className={`flex items-center justify-between py-0.5 text-xs ${labelColor}`}>
      <span className="w-16 font-mono">{label}</span>
      <span className="font-mono font-semibold">${value.toFixed(2)}</span>
      <span className={`font-mono text-right w-12 ${distColor}`}>{distPct(value, price)}</span>
    </div>
  )
}

function AssetCard({ data }: { data: SRData }) {
  const levels      = buildLevels(data)
  const resistances = levels.filter(l => l.value > data.price)
  const supports    = levels.filter(l => l.value <= data.price)
  const inSession   = data.marketState === "REGULAR"

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-black text-white text-sm">{data.symbol}</span>
          <span className="text-gray-200 font-mono ml-2 text-sm">${data.price.toFixed(2)}</span>
          {inSession && (
            <span className="ml-2 text-[9px] font-bold text-emerald-500 bg-emerald-900/40 px-1.5 py-0.5 rounded">LIVE</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-[9px] text-gray-600 tracking-wide">ATR-14</div>
          <div className="text-xs font-mono text-gray-400">${data.atr14.toFixed(2)}</div>
        </div>
      </div>

      {/* Resistencias */}
      <div className="text-[9px] text-red-800 tracking-widest font-bold mb-0.5">RESISTENCIAS</div>
      <div className="mb-1">
        {resistances.length > 0
          ? resistances.map(l => <LevelRow key={`${l.label}-${l.value}`} {...l} price={data.price} />)
          : <div className="text-[10px] text-gray-700 py-1">— precio en máximos del rango —</div>
        }
      </div>

      {/* Precio actual */}
      <div className="flex items-center gap-2 my-2">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-xs font-mono font-bold text-white whitespace-nowrap">${data.price.toFixed(2)}</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      {/* Soportes */}
      <div className="text-[9px] text-emerald-900 tracking-widest font-bold mb-0.5">SOPORTES</div>
      <div className="mb-3">
        {supports.length > 0
          ? supports.map(l => <LevelRow key={`${l.label}-${l.value}`} {...l} price={data.price} />)
          : <div className="text-[10px] text-gray-700 py-1">— precio en mínimos del rango —</div>
        }
      </div>

      {/* Stops */}
      <div className="border-t border-gray-800 pt-2.5">
        <div className="text-[9px] text-gray-600 tracking-widest font-bold mb-1.5">STOPS SUGERIDOS (LONG)</div>
        <div className="grid grid-cols-3 gap-1">
          {[0.5, 1, 2].map(mult => (
            <div key={mult} className="bg-gray-800/60 rounded px-1.5 py-1 text-center">
              <div className="text-[9px] text-gray-600">{mult}×ATR</div>
              <div className="text-xs font-mono text-gray-300">${(data.price - data.atr14 * mult).toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TechnicalLevels() {
  const [data, setData]         = useState<{ GLD: SRData; QQQ: SRData } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [updated, setUpdated]   = useState<Date | null>(null)

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const res = await fetch("/api/sr")
        if (!res.ok) throw new Error("No se pudieron cargar los niveles")
        const json = await res.json()
        if (alive) { setData(json); setUpdated(new Date()); setError(null) }
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-gray-500 tracking-widest font-bold">NIVELES CFD</div>
          <div className="text-[10px] text-gray-600 mt-0.5">Pivot · VWAP · EMA20/50/200 · ATR-14</div>
        </div>
        {updated && (
          <div className="text-[10px] text-gray-700">
            {updated.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        )}
      </div>

      {loading && (
        <div className="py-10 text-center text-gray-600 text-sm">Cargando niveles...</div>
      )}

      {error && (
        <div className="py-4 text-center text-red-500 text-xs">{error}</div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AssetCard data={data.GLD} />
          <div className="md:pl-6 md:border-l md:border-gray-800">
            <AssetCard data={data.QQQ} />
          </div>
        </div>
      )}
    </div>
  )
}
