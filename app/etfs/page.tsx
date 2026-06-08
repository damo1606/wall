"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ErrorBoundary } from "../ErrorBoundary"

type Row = {
  ticker: string
  name: string
  assetType: string
  asOfDate: string | null
  price: number | null
  return1d: number | null     // % (ej 1.5 = +1.5%)
  return5d: number | null
  return20d: number | null
  return60d: number | null
  returnYtd: number | null
  dropFrom52w: number | null  // % negativo (ej -8.3 = 8.3% bajo 52w high)
  week52High: number | null
  week52Low: number | null
  volAnnualized: number | null  // anualizada (fracción 0.18 = 18%)
  dollarVolume: number | null   // USD/día promedio 20d
}

type ApiResp = { rows: Row[]; asOf: string | null; count: number }

const money = (v: number | null) => {
  if (v == null) return "—"
  const a = Math.abs(v)
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (a >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
  if (a >= 1e3)  return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}
const pct = (v: number | null, dec = 1) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`
const pctFrac = (v: number | null) => v == null ? "—" : `${(v * 100).toFixed(1)}%`

// retornos: verde si sube, rojo si baja
const cRet = (v: number | null) => v == null ? "text-gray-500" : v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-gray-300"
// caída desde 52w high (es % negativo o cero): cerca de 0 = cerca del máximo (verde alza saludable), -20% o más profundo = rojo
const cDrop = (v: number | null) => v == null ? "text-gray-500" : v >= -5 ? "text-green-400" : v >= -15 ? "text-yellow-300" : "text-red-400"
// vol anualizada: <15% calma, 15-30 medio, >30 alto
const cVol = (v: number | null) => v == null ? "text-gray-500" : v < 0.15 ? "text-green-400" : v < 0.30 ? "text-yellow-300" : "text-red-400"

type SortCol = "ticker" | "assetType" | "price" | "return1d" | "return5d" | "return20d" | "return60d" | "returnYtd" | "dropFrom52w" | "volAnnualized" | "dollarVolume"

export default function EtfsPage() {
  const [rows, setRows]       = useState<Row[]>([])
  const [asOf, setAsOf]       = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [sortBy, setSortBy]   = useState<SortCol>("dollarVolume")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/etfs", { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ApiResp) => { setRows(d.rows ?? []); setAsOf(d.asOf) })
      .catch(e => { if (e.name !== "AbortError") setErr(e.message) })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  function val(r: Row, c: SortCol): number | string {
    if (c === "ticker" || c === "assetType") return (r[c] ?? "zzz")
    return (r[c] as number | null) ?? -Infinity
  }
  function sort(c: SortCol) {
    if (sortBy === c) setSortDir(d => d === "desc" ? "asc" : "desc")
    else { setSortBy(c); setSortDir("desc") }
  }
  const sorted = [...rows].sort((a, b) => {
    const av = val(a, sortBy), bv = val(b, sortBy)
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === "desc" ? -cmp : cmp
  })

  function Th({ col, label }: { col: SortCol; label: string }) {
    const active = sortBy === col
    return (
      <th onClick={() => sort(col)}
        className={`pb-2 pr-4 text-right cursor-pointer select-none whitespace-nowrap transition-colors ${active ? "text-white" : "text-gray-500 hover:text-gray-300"}`}>
        {label}{active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
      </th>
    )
  }

  return (
    <ErrorBoundary fallback="Error al cargar ETFs">
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-full mx-auto px-2">

        <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white">ETFs e Índices</h1>
            <p className="text-gray-400 mt-1">Rendimiento y liquidez — datos persistidos en Supabase</p>
          </div>
          {asOf && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded border bg-gray-900 border-gray-700 text-gray-300">
              datos al {(() => {
                // asOf viene como "YYYY-MM-DD" desde price_summary_daily.as_of_date.
                // new Date("YYYY-MM-DD") lo interpreta como midnight UTC → en
                // timezones negativas (Quito UTC-5) se muestra como el día anterior.
                // Parseamos explícitamente como fecha local para evitar el shift.
                const [y, m, d] = asOf.split("-").map(Number)
                return new Date(y, m - 1, d).toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" })
              })()}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
          <span><span className="text-green-400">●</span> al alza / cerca de máximo</span>
          <span><span className="text-yellow-300">●</span> medio</span>
          <span><span className="text-red-400">●</span> a la baja / lejos del máximo</span>
        </div>

        {loading && <div className="text-gray-400 py-20 text-center">Cargando ETFs…</div>}
        {err && !loading && (
          <div className="text-center py-20"><p className="text-red-400 font-semibold">No se pudo cargar: {err}</p></div>
        )}
        {!loading && !err && rows.length === 0 && (
          <div className="text-center py-20">
            <p className="text-yellow-300 font-semibold">Aún no hay datos persistidos para ETFs.</p>
            <p className="text-gray-500 text-sm mt-2">Corre el cron de price-summary para poblar la tabla.</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <>
            <div className="text-sm text-gray-400 mb-3">{sorted.length} ETFs / índices</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs border-b border-gray-800">
                    <th onClick={() => sort("ticker")} className="pb-2 pr-6 text-gray-500 cursor-pointer select-none hover:text-gray-300">Ticker</th>
                    <th onClick={() => sort("assetType")} className="pb-2 pr-4 text-gray-500 cursor-pointer select-none hover:text-gray-300">Tipo</th>
                    <Th col="price"         label="Precio" />
                    <Th col="return1d"      label="1d" />
                    <Th col="return5d"      label="5d" />
                    <Th col="return20d"     label="20d" />
                    <Th col="return60d"     label="60d" />
                    <Th col="returnYtd"     label="YTD" />
                    <Th col="dropFrom52w"   label="vs 52w máx" />
                    <Th col="volAnnualized" label="Vol anual" />
                    <Th col="dollarVolume"  label="Liquidez $/d" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => (
                    <tr key={r.ticker} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                      <td className="py-3 pr-6">
                        <Link href={`/empresa/${r.ticker}`} className="hover:opacity-80 transition-opacity">
                          <div className="font-bold text-white">{r.ticker}</div>
                          <div className="text-xs text-gray-400 max-w-[200px] truncate">{r.name}</div>
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400 uppercase">{r.assetType}</td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cRet(r.return1d)}`}>{pct(r.return1d, 2)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cRet(r.return5d)}`}>{pct(r.return5d)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cRet(r.return20d)}`}>{pct(r.return20d)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cRet(r.return60d)}`}>{pct(r.return60d)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cRet(r.returnYtd)}`}>{pct(r.returnYtd)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cDrop(r.dropFrom52w)}`}>{pct(r.dropFrom52w)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cVol(r.volAnnualized)}`}>{pctFrac(r.volAnnualized)}</td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">{money(r.dollarVolume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
    </ErrorBoundary>
  )
}
