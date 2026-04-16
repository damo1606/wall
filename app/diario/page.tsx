"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import type { StockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"
import {
  getTrades, addTrade, closeTrade, removeTrade,
  tradeResult, tradeResultPct,
} from "@/lib/diario"
import type { TradeEntry, TradeDirection } from "@/lib/diario"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` }
function usd(v: number) { return `$${v.toFixed(2)}` }

function dirBadge(d: TradeDirection) {
  const cfg: Record<TradeDirection, { cls: string; label: string }> = {
    LONG:  { cls: "bg-emerald-800 text-emerald-200", label: "↑ LONG"  },
    SHORT: { cls: "bg-red-900 text-red-200",         label: "↓ SHORT" },
    CALL:  { cls: "bg-blue-800 text-blue-200",       label: "▲ CALL"  },
    PUT:   { cls: "bg-orange-900 text-orange-200",   label: "▼ PUT"   },
  }
  const c = cfg[d]
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>
}

function SignalBadge({ signal }: { signal: string }) {
  const cls =
    signal === "Compra Fuerte" ? "bg-emerald-600 text-white" :
    signal === "Compra"        ? "bg-green-700 text-white"   :
    signal === "Mantener"      ? "bg-gray-600 text-white"    :
    signal === "Venta"         ? "bg-orange-600 text-white"  :
                                 "bg-red-700 text-white"
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{signal}</span>
}

// ─── Modal Cerrar Operación ───────────────────────────────────────────────────

function CloseTradeModal({ trade, onClose, onSave }: {
  trade: TradeEntry
  onClose: () => void
  onSave: (exitPrice: number) => void
}) {
  const [exit, setExit] = useState(trade.exitPrice?.toFixed(2) ?? "")

  function submit() {
    const v = parseFloat(exit)
    if (!v || v <= 0) return
    onSave(v)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-xs">
        <h2 className="text-white font-bold text-lg mb-1">Cerrar operación</h2>
        <p className="text-gray-500 text-sm mb-4">{trade.symbol} · {trade.direction} · entrada {usd(trade.entryPrice)}</p>
        <input
          value={exit}
          onChange={e => setExit(e.target.value)}
          type="number" min="0" step="0.01"
          placeholder="Precio de salida ($)"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 mb-4"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded bg-gray-800 text-gray-400 hover:text-gray-200 text-sm transition-colors">Cancelar</button>
          <button onClick={submit} disabled={!exit}
            className="flex-1 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Nueva Operación ────────────────────────────────────────────────────

function AddTradeModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (entry: Omit<TradeEntry, "id">) => void
}) {
  const [symbol,    setSymbol]    = useState("")
  const [direction, setDirection] = useState<TradeDirection>("LONG")
  const [entryPrice,setEntryPrice]= useState("")
  const [qty,       setQty]       = useState("1")
  const [date,      setDate]      = useState(new Date().toISOString().slice(0, 10))
  const [notes,     setNotes]     = useState("")
  const [fetching,  setFetching]  = useState(false)
  // Contexto
  const [signalAtEntry, setSignalAtEntry] = useState<string | undefined>()
  const [macroPhase,    setMacroPhase]    = useState<string | undefined>()
  const [gexBias,       setGexBias]       = useState<string | undefined>()

  async function fetchContext() {
    if (!symbol) return
    setFetching(true)
    const [stockRes, macroRes, gexRes] = await Promise.allSettled([
      fetch(`/api/stock/${symbol.toUpperCase()}`).then(r => r.ok ? r.json() : null),
      fetch("/api/macro").then(r => r.ok ? r.json() : null),
      fetch(`/api/analysis?ticker=${symbol.toUpperCase()}`).then(r => r.ok ? r.json() : null),
    ])

    if (stockRes.status === "fulfilled" && stockRes.value) {
      const d: StockData = stockRes.value
      const score = scoreStock(d)
      setSignalAtEntry(score.signal)
      if (!entryPrice) setEntryPrice(d.currentPrice.toFixed(2))
    }
    if (macroRes.status === "fulfilled" && macroRes.value?.detection?.phase) {
      setMacroPhase(macroRes.value.detection.phase)
    }
    if (gexRes.status === "fulfilled" && gexRes.value?.netGex !== undefined) {
      setGexBias(gexRes.value.netGex >= 0 ? "POSITIVO" : "NEGATIVO")
    }

    setFetching(false)
  }

  function submit() {
    if (!symbol || !entryPrice || !qty) return
    onAdd({
      date,
      symbol:    symbol.toUpperCase(),
      direction,
      entryPrice: parseFloat(entryPrice),
      qty:        parseFloat(qty),
      notes:      notes || undefined,
      signalAtEntry,
      macroPhase,
      gexBias,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white font-bold text-lg mb-4">Nueva operación</h2>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="Símbolo (ej: AAPL)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600"
            />
            <button onClick={fetchContext} disabled={fetching || !symbol}
              className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-40">
              {fetching ? "…" : "Contexto"}
            </button>
          </div>

          {/* Contexto capturado */}
          {(signalAtEntry || macroPhase || gexBias) && (
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {signalAtEntry && <SignalBadge signal={signalAtEntry} />}
              {macroPhase && <span className="bg-blue-900 text-blue-200 px-1.5 py-0.5 rounded font-bold uppercase">{macroPhase}</span>}
              {gexBias && <span className={`px-1.5 py-0.5 rounded font-bold ${gexBias === "POSITIVO" ? "bg-emerald-900 text-emerald-200" : "bg-red-900 text-red-200"}`}>GEX {gexBias}</span>}
            </div>
          )}

          <div className="grid grid-cols-4 gap-1">
            {(["LONG","SHORT","CALL","PUT"] as TradeDirection[]).map(d => (
              <button key={d} onClick={() => setDirection(d)}
                className={`py-1.5 rounded text-xs font-bold transition-colors ${direction === d ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"}`}>
                {d}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input value={entryPrice} onChange={e => setEntryPrice(e.target.value)} type="number" min="0" step="0.01"
              placeholder="Precio entrada ($)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
            <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0"
              placeholder="Qty"
              className="w-20 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
          </div>

          <input value={date} onChange={e => setDate(e.target.value)} type="date"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />

          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded bg-gray-800 text-gray-400 hover:text-gray-200 text-sm transition-colors">Cancelar</button>
          <button onClick={submit} disabled={!symbol || !entryPrice || !qty}
            className="flex-1 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DiarioPage() {
  const [trades,      setTrades]      = useState<TradeEntry[]>([])
  const [showAdd,     setShowAdd]     = useState(false)
  const [closingId,   setClosingId]   = useState<string | null>(null)
  const [filterOpen,  setFilterOpen]  = useState<"all" | "open" | "closed">("all")

  useEffect(() => { setTrades(getTrades()) }, [])

  function handleAdd(entry: Omit<TradeEntry, "id">) {
    addTrade(entry)
    setTrades(getTrades())
  }

  function handleClose(id: string, exitPrice: number) {
    closeTrade(id, exitPrice)
    setTrades(getTrades())
  }

  function handleRemove(id: string) {
    removeTrade(id)
    setTrades(getTrades())
  }

  const filtered = trades.filter(t => {
    if (filterOpen === "open")   return t.exitPrice === undefined
    if (filterOpen === "closed") return t.exitPrice !== undefined
    return true
  })

  // Estadísticas (sólo trades cerrados)
  const closed = trades.filter(t => t.exitPrice !== undefined)
  const wins   = closed.filter(t => (tradeResult(t) ?? 0) > 0).length
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null
  const totalPnl = closed.reduce((sum, t) => sum + (tradeResult(t) ?? 0), 0)

  const closingTrade = closingId ? trades.find(t => t.id === closingId) : null

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Diario de Operaciones</h1>
            <p className="text-gray-400 mt-1 text-sm">Registra trades con señal Brain + GEX al momento de entrada</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold text-sm rounded-lg transition-colors">
            ＋ Nueva operación
          </button>
        </div>

        {/* Estadísticas */}
        {closed.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Operaciones cerradas</div>
              <div className="text-2xl font-bold font-mono text-white">{closed.length}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Win Rate</div>
              <div className={`text-2xl font-bold font-mono ${winRate !== null && winRate >= 50 ? "text-green-400" : "text-red-400"}`}>
                {winRate !== null ? `${winRate.toFixed(0)}%` : "—"}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">P&L Total</div>
              <div className={`text-2xl font-bold font-mono ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* Filtro */}
        <div className="flex gap-1 mb-4 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(["all","open","closed"] as const).map(f => (
            <button key={f} onClick={() => setFilterOpen(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterOpen === f ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
              }`}>
              {f === "all" ? "Todas" : f === "open" ? "Abiertas" : "Cerradas"}
            </button>
          ))}
        </div>

        {/* Tabla */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-gray-600">
            <div className="text-4xl mb-3">📒</div>
            <p>No hay operaciones registradas.</p>
            <p className="text-sm mt-1">Registra tu primera operación con el botón de arriba.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-700 bg-gray-900">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Dir.</th>
                  <th className="px-4 py-3 text-right">Entrada</th>
                  <th className="px-4 py-3 text-right">Salida</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">P&L $</th>
                  <th className="px-4 py-3 text-right">P&L %</th>
                  <th className="px-4 py-3">Señal entrada</th>
                  <th className="px-4 py-3">Contexto</th>
                  <th className="px-4 py-3">Notas</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const result    = tradeResult(t)
                  const resultPct = tradeResultPct(t)
                  const isOpen    = t.exitPrice === undefined
                  return (
                    <tr key={t.id} className={`border-b border-gray-800/60 hover:bg-gray-900/50 ${i % 2 === 0 ? "bg-gray-950" : "bg-gray-900/30"}`}>
                      <td className="px-4 py-3 text-xs text-gray-500">{t.date}</td>
                      <td className="px-4 py-3">
                        <Link href={`/empresa/${t.symbol}`} className="font-bold text-white hover:text-blue-400 transition-colors">
                          {t.symbol}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{dirBadge(t.direction)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-300">{usd(t.entryPrice)}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {isOpen ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-900 text-blue-200">ABIERTA</span>
                        ) : (
                          <span className="text-gray-300">{usd(t.exitPrice!)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400">{t.qty}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${result === null ? "text-gray-700" : result >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {result !== null ? `${result >= 0 ? "+" : ""}$${result.toFixed(0)}` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${resultPct === null ? "text-gray-700" : resultPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {resultPct !== null ? pct(resultPct) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {t.signalAtEntry ? <SignalBadge signal={t.signalAtEntry} /> : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {t.macroPhase && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900 text-blue-200 uppercase">{t.macroPhase}</span>
                          )}
                          {t.gexBias && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${t.gexBias === "POSITIVO" ? "bg-emerald-900 text-emerald-200" : "bg-red-900 text-red-200"}`}>
                              GEX {t.gexBias}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate">
                        {t.notes ?? ""}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {isOpen && (
                            <button onClick={() => setClosingId(t.id)}
                              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors">
                              Cerrar
                            </button>
                          )}
                          <button onClick={() => handleRemove(t.id)}
                            className="text-gray-700 hover:text-red-400 transition-colors text-lg leading-none">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddTradeModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />
      )}
      {closingTrade && (
        <CloseTradeModal
          trade={closingTrade}
          onClose={() => setClosingId(null)}
          onSave={(exit) => handleClose(closingTrade.id, exit)}
        />
      )}
    </main>
  )
}
