"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ErrorBoundary } from "../ErrorBoundary"

type Row = {
  ticker: string
  company: string | null
  sector: string | null
  takenAt: string
  price: number | null
  marketCap: number | null
  pe: number | null
  pb: number | null
  evEbitda: number | null
  roe: number | null            // fracción (0.15 = 15%)
  roic: number | null           // fracción
  fcfYield: number | null       // fracción
  debtToEquity: number | null   // estilo Yahoo (150 = 1.5x)
  dividendYield: number | null  // fracción
  revenueTtm: number | null
  epsTtm: number | null
}

type ApiResp = { rows: Row[]; asOf: string | null; count: number }

// ── formateadores ─────────────────────────────────────────────────────────
const money = (v: number | null) => {
  if (v == null) return "—"
  const a = Math.abs(v)
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (a >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(2)}`
}
const ratio = (v: number | null) => (v != null && v > 0 ? v.toFixed(2) : "—")
const pctFrac = (v: number | null) => (v != null && v !== 0 ? `${(v * 100).toFixed(1)}%` : "—")

// ── semáforos (verde = bueno para el inversor) ──────────────────────────────
const cPE   = (v: number | null) => v == null || v <= 0 ? "text-gray-500" : v < 15 ? "text-green-400" : v < 25 ? "text-yellow-300" : "text-red-400"
const cPB   = (v: number | null) => v == null || v <= 0 ? "text-gray-500" : v < 1.5 ? "text-green-400" : v < 3 ? "text-yellow-300" : "text-red-400"
const cEV   = (v: number | null) => v == null || v <= 0 ? "text-gray-500" : v < 10 ? "text-green-400" : v < 16 ? "text-yellow-300" : "text-red-400"
const cROE  = (v: number | null) => v == null ? "text-gray-500" : v >= 0.15 ? "text-green-400" : v >= 0.05 ? "text-yellow-300" : "text-red-400"
const cROIC = (v: number | null) => v == null ? "text-gray-500" : v >= 0.12 ? "text-green-400" : v >= 0.06 ? "text-yellow-300" : "text-red-400"
const cFCF  = (v: number | null) => v == null ? "text-gray-500" : v >= 0.05 ? "text-green-400" : v >= 0.02 ? "text-yellow-300" : "text-red-400"
const cDE   = (v: number | null) => v == null ? "text-gray-500" : v < 50 ? "text-green-400" : v < 150 ? "text-yellow-300" : "text-red-400"

type SortCol = "ticker" | "sector" | "marketCap" | "pe" | "pb" | "evEbitda" | "roe" | "roic" | "fcfYield" | "debtToEquity" | "dividendYield" | "revenueTtm"

export default function FundamentalesPage() {
  const [rows, setRows]       = useState<Row[]>([])
  const [asOf, setAsOf]       = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [sortBy, setSortBy]   = useState<SortCol>("marketCap")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/fundamentals", { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: ApiResp) => { setRows(d.rows ?? []); setAsOf(d.asOf) })
      .catch(e => { if (e.name !== "AbortError") setErr(e.message) })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  function val(r: Row, c: SortCol): number | string {
    if (c === "ticker") return r.ticker
    if (c === "sector") return r.sector ?? "zzz"
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
    <ErrorBoundary fallback="Error al cargar fundamentales">
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-full mx-auto px-2">

        <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white">Fundamentales</h1>
            <p className="text-gray-400 mt-1">Múltiplos y calidad — datos persistidos en Supabase</p>
          </div>
          {asOf && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded border bg-gray-900 border-gray-700 text-gray-300">
              datos al {new Date(asOf).toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" })}
            </span>
          )}
        </div>

        {/* leyenda de color */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
          <span><span className="text-green-400">●</span> atractivo / sano</span>
          <span><span className="text-yellow-300">●</span> neutral</span>
          <span><span className="text-red-400">●</span> caro / riesgoso</span>
        </div>

        {loading && <div className="text-gray-400 py-20 text-center">Cargando fundamentales…</div>}

        {err && !loading && (
          <div className="text-center py-20">
            <p className="text-red-400 font-semibold">No se pudo cargar: {err}</p>
          </div>
        )}

        {!loading && !err && rows.length === 0 && (
          <div className="text-center py-20">
            <p className="text-yellow-300 font-semibold">Aún no hay datos persistidos.</p>
            <p className="text-gray-500 text-sm mt-2">Corre el cron de fundamentales para poblar las tablas y vuelve a entrar.</p>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <>
            <div className="text-sm text-gray-400 mb-3">{sorted.length} empresas</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs border-b border-gray-800">
                    <th onClick={() => sort("ticker")} className="pb-2 pr-6 text-gray-500 cursor-pointer select-none hover:text-gray-300">Empresa</th>
                    <th onClick={() => sort("sector")} className="pb-2 pr-4 text-gray-500 cursor-pointer select-none hover:text-gray-300">Sector</th>
                    <th className="pb-2 pr-4 text-right text-gray-500">Precio</th>
                    <Th col="marketCap"     label="Mkt Cap" />
                    <Th col="pe"            label="P/E" />
                    <Th col="pb"            label="P/B" />
                    <Th col="evEbitda"     label="EV/EBITDA" />
                    <Th col="roe"          label="ROE" />
                    <Th col="roic"         label="ROIC" />
                    <Th col="fcfYield"     label="FCF Yield" />
                    <Th col="debtToEquity" label="D/E" />
                    <Th col="dividendYield" label="Div" />
                    <Th col="revenueTtm"   label="Ingresos TTM" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => (
                    <tr key={r.ticker} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                      <td className="py-3 pr-6">
                        <Link href={`/empresa/${r.ticker}`} className="hover:opacity-80 transition-opacity">
                          <div className="font-bold text-white">{r.ticker}</div>
                          <div className="text-xs text-gray-400 max-w-[180px] truncate">{r.company ?? ""}</div>
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400 max-w-[120px] truncate">{r.sector ?? "—"}</td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">{r.price != null ? `$${r.price.toFixed(2)}` : "—"}</td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">{money(r.marketCap)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cPE(r.pe)}`}>{ratio(r.pe)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cPB(r.pb)}`}>{ratio(r.pb)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cEV(r.evEbitda)}`}>{ratio(r.evEbitda)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cROE(r.roe)}`}>{pctFrac(r.roe)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cROIC(r.roic)}`}>{pctFrac(r.roic)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cFCF(r.fcfYield)}`}>{pctFrac(r.fcfYield)}</td>
                      <td className={`py-3 pr-4 text-right font-mono ${cDE(r.debtToEquity)}`}>{r.debtToEquity != null ? (r.debtToEquity / 100).toFixed(2) : "—"}</td>
                      <td className="py-3 pr-4 text-right font-mono text-cyan-300">{pctFrac(r.dividendYield)}</td>
                      <td className="py-3 pr-4 text-right font-mono text-gray-300">{money(r.revenueTtm)}</td>
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
