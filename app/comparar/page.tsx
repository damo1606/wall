"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import type { StockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"
import type { ScoreBreakdown } from "@/lib/scoring"

type Scored = StockData & { score: ScoreBreakdown }

const DEFAULT_TICKERS = "AAPL,MSFT,GOOGL"

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "A+" ? "bg-emerald-500 text-white" :
    grade === "A"  ? "bg-green-600 text-white" :
    grade === "B"  ? "bg-blue-600 text-white" :
    grade === "C"  ? "bg-yellow-600 text-white" :
    grade === "D"  ? "bg-orange-600 text-white" :
    "bg-red-800 text-white"
  return <span className={`text-xs font-black px-2 py-0.5 rounded ${color}`}>{grade}</span>
}

function SignalBadge({ signal }: { signal: string }) {
  const s =
    signal === "Compra Fuerte" ? { cls: "bg-emerald-500 text-white", icon: "▲▲" } :
    signal === "Compra"        ? { cls: "bg-green-600 text-white",   icon: "▲"  } :
    signal === "Mantener"      ? { cls: "bg-gray-600 text-white",    icon: "●"  } :
    signal === "Venta"         ? { cls: "bg-orange-600 text-white",  icon: "▼"  } :
                                 { cls: "bg-red-700 text-white",     icon: "▼▼" }
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${s.cls}`}>{s.icon} {signal}</span>
}

function pct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
}

function fmt(v: number, dec = 1) {
  return v != null && v !== 0 ? v.toFixed(dec) : "—"
}

const ROWS: { label: string; render: (s: Scored) => ReactNode; best?: "high" | "low" }[] = [
  { label: "Grade",           render: s => <GradeBadge grade={s.score.grade} /> },
  { label: "Score",           render: s => <span className="font-mono">{s.score.finalScore.toFixed(0)}</span>, best: "high" },
  { label: "Señal",           render: s => <SignalBadge signal={s.score.signal} /> },
  { label: "Precio",          render: s => <span className="font-mono">${s.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> },
  {
    label: "Graham %",
    render: s => (
      <span className={`font-mono font-bold ${s.discountToGraham <= -10 ? "text-green-400" : s.discountToGraham >= 0 ? "text-red-400" : "text-yellow-300"}`}>
        {pct(s.discountToGraham)}
      </span>
    ),
    best: "low",
  },
  {
    label: "Caída 52w",
    render: s => (
      <span className={`font-mono font-bold ${s.dropFrom52w <= -30 ? "text-green-400" : s.dropFrom52w <= -15 ? "text-yellow-300" : "text-gray-400"}`}>
        {s.dropFrom52w.toFixed(1)}%
      </span>
    ),
    best: "low",
  },
  {
    label: "Upside",
    render: s => (
      <span className={`font-mono font-bold ${s.upsideToTarget >= 20 ? "text-green-400" : s.upsideToTarget >= 0 ? "text-yellow-300" : "text-red-400"}`}>
        {pct(s.upsideToTarget)}
      </span>
    ),
    best: "high",
  },
  { label: "P/E",   render: s => <span className="font-mono">{fmt(s.pe)}</span>, best: "low" },
  { label: "ROE",   render: s => <span className="font-mono">{s.roe ? pct(s.roe * 100) : "—"}</span>, best: "high" },
  { label: "D/E",   render: s => <span className="font-mono">{s.debtToEquity > 0 ? (s.debtToEquity / 100).toFixed(2) : "—"}</span>, best: "low" },
  { label: "P/FCF", render: s => <span className="font-mono">{s.pFcf > 0 ? fmt(s.pFcf) : "—"}</span>, best: "low" },
]

export default function CompararPage() {
  const [input, setInput] = useState(DEFAULT_TICKERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [results, setResults] = useState<Scored[]>([])

  async function handleCompare() {
    const tickers = input.split(",").map(t => t.trim().toUpperCase()).filter(Boolean)
    if (tickers.length < 2) { setError("Ingresa al menos 2 tickers separados por coma"); return }
    if (tickers.length > 6) { setError("Máximo 6 tickers"); return }
    setError("")
    setLoading(true)
    setResults([])
    try {
      const fetched = await Promise.all(
        tickers.map(async t => {
          try {
            const res = await fetch(`/api/stock/${t}`)
            if (!res.ok) return null
            const data: StockData = await res.json()
            return { ...data, score: scoreStock(data) } as Scored
          } catch { return null }
        })
      )
      setResults(fetched.filter(Boolean) as Scored[])
    } catch {}
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Comparar Empresas</h1>
          <p className="text-gray-400 mt-1">Hasta 6 tickers lado a lado — métricas de valor e calidad</p>
        </div>

        {/* Input */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">TICKERS (separados por coma)</label>
            <input
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter") handleCompare() }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono tracking-widest focus:outline-none focus:border-blue-500"
              placeholder="AAPL,MSFT,GOOGL,AMZN"
              maxLength={60}
            />
          </div>
          <button
            onClick={handleCompare}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {loading ? "Cargando..." : "COMPARAR"}
          </button>
        </div>

        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

        {results.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-xs text-gray-500 tracking-widest font-bold w-28">MÉTRICA</th>
                  {results.map(s => (
                    <th key={s.symbol} className="px-4 py-3 text-center">
                      <Link href={`/empresa/${s.symbol}`} className="hover:text-blue-400 transition-colors">
                        <div className="text-white font-black text-base">{s.symbol}</div>
                        <div className="text-gray-500 text-xs font-normal truncate max-w-[120px] mx-auto">{s.shortName}</div>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr key={row.label} className={`border-b border-gray-800 ${i % 2 === 0 ? "bg-gray-950" : "bg-gray-900/40"}`}>
                    <td className="px-4 py-3 text-xs text-gray-500 tracking-widest font-bold">{row.label}</td>
                    {results.map(s => (
                      <td key={s.symbol} className="px-4 py-3 text-center">{row.render(s)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="text-center py-20 text-gray-500 text-sm tracking-widest">
            Ingresa tickers y pulsa <span className="text-blue-400 font-bold">COMPARAR</span>
          </div>
        )}

      </div>
    </main>
  )
}
