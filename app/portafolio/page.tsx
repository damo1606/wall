"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import type { StockData } from "@/lib/yahoo"
import { scoreStock } from "@/lib/scoring"
import type { ScoreBreakdown } from "@/lib/scoring"
import {
  getPortfolio, addPosition, removePosition,
  getWatchEntries, addWatch, removeWatch,
  getAlerts, addAlert, removeAlert, toggleAlertActive, markTriggered, resetAlert, checkAlerts,
  alertTypeLabel, alertThresholdSuffix, GRADE_ORDER, WATCH_LIMIT,
} from "@/lib/portfolio"
import type { PortfolioEntry, WatchEntry, Alert, AlertType } from "@/lib/portfolio"
import { ErrorBoundary } from "@/app/ErrorBoundary"

type LiveData = StockData & { score: ScoreBreakdown }

function pct(v: number, dec = 1) { return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%` }
function usd(v: number) { return v !== 0 ? `$${v.toFixed(2)}` : "—" }

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "A+" ? "bg-emerald-500" :
    grade === "A"  ? "bg-green-600" :
    grade === "B"  ? "bg-blue-600" :
    grade === "C"  ? "bg-yellow-600" :
    grade === "D"  ? "bg-orange-600" : "bg-red-800"
  return <span className={`${color} text-white text-xs font-black px-2 py-0.5 rounded`}>{grade}</span>
}

const SIGNAL_RANK: Record<string, number> = {
  "Compra Fuerte": 4, "Compra": 3, "Mantener": 2, "Venta": 1, "Venta Fuerte": 0,
}

function SignalBadge({ signal }: { signal: string }) {
  const s =
    signal === "Compra Fuerte" ? { cls: "bg-emerald-600 text-white", icon: "▲▲" } :
    signal === "Compra"        ? { cls: "bg-green-700 text-white",   icon: "▲"  } :
    signal === "Mantener"      ? { cls: "bg-gray-600 text-white",    icon: "●"  } :
    signal === "Venta"         ? { cls: "bg-orange-600 text-white",  icon: "▼"  } :
                                 { cls: "bg-red-700 text-white",     icon: "▼▼" }
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.cls}`}>{s.icon} {signal}</span>
}

function heatRow(buyScore: number | undefined): string {
  if (buyScore === undefined) return "border-l-4 border-gray-800"
  if (buyScore >= 75) return "border-l-4 border-emerald-500 bg-emerald-950/20"
  if (buyScore >= 55) return "border-l-4 border-green-600 bg-green-950/10"
  if (buyScore >= 35) return "border-l-4 border-yellow-600 bg-yellow-950/10"
  if (buyScore >= 15) return "border-l-4 border-orange-600 bg-orange-950/10"
  return "border-l-4 border-red-700 bg-red-950/20"
}

// ─── Modal Agregar Posición ───────────────────────────────────────────────────

function AddPositionModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (entry: Omit<PortfolioEntry, "id">) => void
}) {
  const [symbol, setSymbol]     = useState("")
  const [qty, setQty]           = useState("")
  const [buyPrice, setBuyPrice] = useState("")
  const [buyDate, setBuyDate]   = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [company, setCompany]   = useState("")

  async function resolve() {
    if (!symbol) return
    setLoading(true)
    try {
      const res = await fetch(`/api/stock/${symbol.toUpperCase()}`)
      if (res.ok) {
        const d: StockData = await res.json()
        setCompany(d.company)
        if (!buyPrice) setBuyPrice(d.currentPrice.toFixed(2))
      }
    } catch {}
    setLoading(false)
  }

  function submit() {
    if (!symbol || !qty || !buyPrice) return
    onAdd({
      symbol:   symbol.toUpperCase(),
      company:  company || symbol.toUpperCase(),
      qty:      parseFloat(qty),
      buyPrice: parseFloat(buyPrice),
      buyDate,
      notes:    notes || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white font-bold text-lg mb-4">Agregar posición</h2>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="Símbolo (ej: AAPL)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
            <button onClick={resolve} disabled={loading || !symbol}
              className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-40">
              {loading ? "..." : "Buscar"}
            </button>
          </div>
          {company && <div className="text-xs text-gray-400">{company}</div>}
          <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0"
            placeholder="Cantidad de acciones"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
          <input value={buyPrice} onChange={e => setBuyPrice(e.target.value)} type="number" min="0"
            placeholder="Precio de compra ($)"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
          <input value={buyDate} onChange={e => setBuyDate(e.target.value)} type="date"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white" />
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded bg-gray-800 text-gray-400 hover:text-gray-200 text-sm transition-colors">Cancelar</button>
          <button onClick={submit} disabled={!symbol || !qty || !buyPrice}
            className="flex-1 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            Agregar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Agregar Alerta ─────────────────────────────────────────────────────

function AddAlertModal({ onClose, onAdd, defaultSymbol = "" }: {
  onClose: () => void
  onAdd: (a: Omit<Alert, "id" | "triggered" | "createdAt">) => void
  defaultSymbol?: string
}) {
  const [symbol,    setSymbol]    = useState(defaultSymbol)
  const [type,      setType]      = useState<AlertType>("price_below")
  const [threshold, setThreshold] = useState("")

  const ALERT_TYPES: AlertType[] = ["price_below","price_above","buy_ready","grade_min","drop_pct","upside_pct"]
  const needsThreshold = type !== "buy_ready"

  function buildLabel() {
    if (type === "buy_ready") return `${symbol} — Buy Ready`
    if (type === "grade_min") {
      const g = GRADE_ORDER[parseInt(threshold)] ?? "?"
      return `${symbol} — grado ≥ ${g}`
    }
    const suffix = type === "price_below" || type === "price_above" ? "$" : "%"
    const op = type === "price_below" ? "<" : type === "price_above" ? ">" : type === "drop_pct" ? "caída ≥" : "upside ≥"
    return `${symbol} ${op} ${threshold}${suffix}`
  }

  function submit() {
    if (!symbol || (needsThreshold && !threshold)) return
    onAdd({
      symbol: symbol.toUpperCase(),
      type,
      threshold: needsThreshold ? parseFloat(threshold) : 0,
      label: buildLabel(),
      active: true,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white font-bold text-lg mb-4">Nueva alerta</h2>
        <div className="space-y-3">
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="Símbolo (ej: NVDA)"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
          <select value={type} onChange={e => setType(e.target.value as AlertType)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white">
            {ALERT_TYPES.map(t => (
              <option key={t} value={t}>{alertTypeLabel(t)}</option>
            ))}
          </select>
          {type === "grade_min" ? (
            <select value={threshold} onChange={e => setThreshold(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white">
              <option value="">Seleccionar grado mínimo</option>
              {GRADE_ORDER.map((g, i) => <option key={g} value={i}>{g}</option>)}
            </select>
          ) : needsThreshold ? (
            <div className="flex items-center gap-2">
              <input value={threshold} onChange={e => setThreshold(e.target.value)} type="number" min="0"
                placeholder="Valor"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600" />
              <span className="text-gray-500 text-sm">{alertThresholdSuffix(type)}</span>
            </div>
          ) : null}
          {symbol && <div className="text-xs text-gray-500">Vista previa: {buildLabel()}</div>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded bg-gray-800 text-gray-400 hover:text-gray-200 text-sm transition-colors">Cancelar</button>
          <button onClick={submit} disabled={!symbol || (needsThreshold && !threshold)}
            className="flex-1 py-2 rounded bg-orange-700 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            Crear alerta
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type PortSortCol  = "symbol" | "qty" | "buy" | "current" | "pnl" | "pnlpct" | "grade" | "buyscore"
type WatchSortCol = "symbol" | "current" | "target" | "vstarget" | "drop" | "grade" | "buyscore" | "signal"

export default function PortafolioPage() {
  const [tab, setTab]             = useState<"portfolio" | "watch" | "alerts">("portfolio")
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([])
  const [watchList, setWatchList] = useState<WatchEntry[]>([])
  const [alerts, setAlerts]       = useState<Alert[]>([])
  const [liveData, setLiveData]   = useState<Map<string, LiveData>>(new Map())
  const [loadingSymbols, setLoadingSymbols] = useState<Set<string>>(new Set())
  const [showAddPos, setShowAddPos]   = useState(false)
  const [showAddAlert, setShowAddAlert] = useState(false)
  const [portSort, setPortSort]   = useState<PortSortCol>("pnlpct")
  const [portDir, setPortDir]     = useState<"asc" | "desc">("desc")
  const [watchSort, setWatchSort] = useState<WatchSortCol>("buyscore")
  const [watchDir, setWatchDir]   = useState<"asc" | "desc">("desc")
  const [savedSignals, setSavedSignals] = useState<Record<string, string>>({})

  function handlePortSort(col: PortSortCol) {
    if (portSort === col) setPortDir(d => d === "desc" ? "asc" : "desc")
    else { setPortSort(col); setPortDir("desc") }
  }
  function handleWatchSort(col: WatchSortCol) {
    if (watchSort === col) setWatchDir(d => d === "desc" ? "asc" : "desc")
    else { setWatchSort(col); setWatchDir("desc") }
  }
  function sortIcon(active: boolean, dir: "asc" | "desc") {
    return <span className="text-[10px]">{active ? (dir === "desc" ? "▼" : "▲") : "↕"}</span>
  }

  // Cargar desde localStorage al montar
  useEffect(() => {
    setPortfolio(getPortfolio())
    setWatchList(getWatchEntries())
    setAlerts(getAlerts())
    try {
      const saved = JSON.parse(localStorage.getItem("wall_watchlist_state") ?? "{}")
      setSavedSignals(saved)
    } catch {}
  }, [])

  // Todos los símbolos únicos que necesitan datos live
  const allSymbols = Array.from(new Set([
    ...portfolio.map(e => e.symbol),
    ...watchList.map(e => e.symbol),
    ...alerts.map(a => a.symbol),
  ]))

  async function fetchSymbol(symbol: string, signal?: AbortSignal): Promise<LiveData | null> {
    try {
      const res = await fetch(`/api/stock/${symbol}`, signal ? { signal } : undefined)
      if (!res.ok) return null
      const d: StockData = await res.json()
      return { ...d, score: scoreStock(d) }
    } catch (err) {
      if ((err as Error).name === "AbortError") return null
      return null
    }
  }

  const refreshData = useCallback(async (symbols: string[], signal?: AbortSignal) => {
    if (symbols.length === 0) return
    setLoadingSymbols(new Set(symbols))
    const results = await Promise.all(symbols.map(s => fetchSymbol(s, signal)))
    if (signal?.aborted) return
    setLiveData(prev => {
      const next = new Map(prev)
      symbols.forEach((s, i) => { if (results[i]) next.set(s, results[i]!) })
      return next
    })
    setLoadingSymbols(new Set())
  }, [])

  // Auto-fetch al cargar
  useEffect(() => {
    if (allSymbols.length === 0) return
    const controller = new AbortController()
    refreshData(allSymbols, controller.signal)
    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Alertas: verificar y marcar disparadas ──────────────────────────────────
  function verifyAlerts() {
    const dataMap = new Map<string, Parameters<typeof checkAlerts>[1] extends Map<string, infer V> ? V : never>()
    liveData.forEach((d, sym) => dataMap.set(sym, {
      symbol: sym,
      currentPrice: d.currentPrice,
      dropFrom52w: d.dropFrom52w,
      upsideToTarget: d.upsideToTarget,
      grade: d.score.grade,
      buyReady: d.score.buyReady,
    }))
    const triggered = checkAlerts(alerts, dataMap)
    triggered.forEach(id => markTriggered(id))
    setAlerts(getAlerts())
  }

  const triggeredCount = alerts.filter(a => a.triggered).length

  function saveSignalState() {
    const state: Record<string, string> = {}
    watchList.forEach(e => {
      const live = liveData.get(e.symbol)
      if (live) state[e.symbol] = live.score.signal
    })
    try { localStorage.setItem("wall_watchlist_state", JSON.stringify(state)) } catch {}
    setSavedSignals(state)
  }

  // ── Portafolio: cálculos ────────────────────────────────────────────────────
  const portfolioWithLive = portfolio.map(e => {
    const live = liveData.get(e.symbol)
    const cost = e.qty * e.buyPrice
    const current = live ? e.qty * live.currentPrice : null
    const pnlUsd = current !== null ? current - cost : null
    const pnlPct = pnlUsd !== null && cost > 0 ? (pnlUsd / cost) * 100 : null
    return { ...e, live, cost, current, pnlUsd, pnlPct }
  })

  const GO = ["F","D","C","B","A","A+"]

  const portfolioSorted = [...portfolioWithLive].sort((a, b) => {
    let va: number, vb: number
    switch (portSort) {
      case "symbol":   return portDir === "desc" ? b.symbol.localeCompare(a.symbol) : a.symbol.localeCompare(b.symbol)
      case "qty":      va = a.qty;                              vb = b.qty;                              break
      case "buy":      va = a.buyPrice;                         vb = b.buyPrice;                         break
      case "current":  va = a.live?.currentPrice ?? 0;          vb = b.live?.currentPrice ?? 0;          break
      case "pnl":      va = a.pnlUsd ?? 0;                      vb = b.pnlUsd ?? 0;                      break
      case "pnlpct":   va = a.pnlPct ?? 0;                      vb = b.pnlPct ?? 0;                      break
      case "grade":    va = GO.indexOf(a.live?.score.grade ?? "F"); vb = GO.indexOf(b.live?.score.grade ?? "F"); break
      case "buyscore": va = a.live?.score.buyScore ?? 0;         vb = b.live?.score.buyScore ?? 0;       break
      default:         va = 0; vb = 0
    }
    return portDir === "desc" ? vb - va : va - vb
  })

  const totalCost    = portfolioWithLive.reduce((s, e) => s + e.cost, 0)
  const totalCurrent = portfolioWithLive.reduce((s, e) => s + (e.current ?? e.cost), 0)
  const totalPnl     = totalCurrent - totalCost
  const totalPnlPct  = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  return (
    <ErrorBoundary fallback="Error al cargar portafolio">
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Portafolio</h1>
            <p className="text-gray-400 mt-1 text-sm">Posiciones · Seguimiento · Alertas</p>
          </div>
          <button onClick={() => refreshData(allSymbols)}
            disabled={loadingSymbols.size > 0}
            className="text-xs px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-40">
            {loadingSymbols.size > 0 ? "Actualizando..." : "↻ Actualizar"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {([
            { key: "portfolio", label: "Portafolio" },
            { key: "watch",     label: `Seguimiento (${watchList.length}/${WATCH_LIMIT})` },
            { key: "alerts",    label: `Alertas${triggeredCount > 0 ? ` (${triggeredCount})` : ""}` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              } ${t.key === "alerts" && triggeredCount > 0 ? "text-orange-400" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: PORTAFOLIO ───────────────────────────────────────────────── */}
        {tab === "portfolio" && (
          <div>
            {/* Resumen */}
            {portfolio.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: "Invertido", value: `$${totalCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                  { label: "Valor actual", value: `$${totalCurrent.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                  { label: "P&L total", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${pct(totalPnlPct)})`, color: totalPnl >= 0 ? "text-green-400" : "text-red-400" },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                    <div className={`text-xl font-bold font-mono ${item.color ?? "text-white"}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-400">{portfolio.length} posiciones</span>
              <button onClick={() => setShowAddPos(true)}
                className="text-sm px-4 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-semibold transition-colors">
                ＋ Agregar posición
              </button>
            </div>

            {portfolio.length === 0 ? (
              <div className="text-center py-20 text-gray-600">
                <div className="text-4xl mb-3">📊</div>
                <p>No tienes posiciones registradas.</p>
                <p className="text-sm mt-1">Agrega tu primera posición con el botón de arriba.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                      {([
                        { col: "symbol"  as PortSortCol, label: "Empresa",    align: "left"  },
                        { col: "qty"     as PortSortCol, label: "Qty",         align: "right" },
                        { col: "buy"     as PortSortCol, label: "Compra",      align: "right" },
                        { col: "current" as PortSortCol, label: "Actual",      align: "right" },
                        { col: "pnl"     as PortSortCol, label: "P&L $",       align: "right" },
                        { col: "pnlpct"  as PortSortCol, label: "P&L %",       align: "right" },
                        { col: "grade"   as PortSortCol, label: "Grado",       align: "left"  },
                        { col: "buyscore"as PortSortCol, label: "Score",       align: "right" },
                      ]).map(({ col, label, align }) => (
                        <th key={col}
                          onClick={() => handlePortSort(col)}
                          className={`pb-2 pr-4 text-${align} cursor-pointer select-none hover:text-gray-300 transition-colors ${portSort === col ? "text-white" : ""}`}>
                          {label} {sortIcon(portSort === col, portDir)}
                        </th>
                      ))}
                      <th className="pb-2 pr-4 text-left text-xs text-gray-500">Señal</th>
                      <th className="pb-2 pr-4 text-left text-xs text-gray-500">Fecha</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioSorted.map(e => (
                      <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td className="py-3 pr-6">
                          <Link href={`/empresa/${e.symbol}`} className="hover:opacity-80">
                            <div className="font-bold text-white">{e.symbol}</div>
                            <div className="text-xs text-gray-500 truncate max-w-[150px]">{e.company}</div>
                          </Link>
                          {e.notes && <div className="text-[10px] text-gray-700 mt-0.5 truncate max-w-[150px]">{e.notes}</div>}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-gray-300">{e.qty}</td>
                        <td className="py-3 pr-4 text-right font-mono text-gray-300">${e.buyPrice.toFixed(2)}</td>
                        <td className="py-3 pr-4 text-right font-mono">
                          {loadingSymbols.has(e.symbol) ? <span className="text-gray-600">…</span> : usd(e.live?.currentPrice ?? 0)}
                        </td>
                        <td className={`py-3 pr-4 text-right font-mono ${e.pnlUsd === null ? "text-gray-600" : e.pnlUsd >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {e.pnlUsd !== null ? `${e.pnlUsd >= 0 ? "+" : ""}$${e.pnlUsd.toFixed(0)}` : "—"}
                        </td>
                        <td className={`py-3 pr-4 text-right font-mono font-bold ${e.pnlPct === null ? "text-gray-600" : e.pnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {e.pnlPct !== null ? pct(e.pnlPct) : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {e.live ? <GradeBadge grade={e.live.score.grade} /> : <span className="text-gray-700 text-xs">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-gray-300 font-bold">
                          {e.live ? e.live.score.buyScore : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {e.live ? (
                            e.live.score.signal === "Venta" || e.live.score.signal === "Venta Fuerte"
                              ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-700 text-white">⚠ Revisar</span>
                              : <SignalBadge signal={e.live.score.signal} />
                          ) : <span className="text-gray-700 text-xs">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-600">{e.buyDate}</td>
                        <td className="py-3">
                          <button onClick={() => { removePosition(e.id); setPortfolio(getPortfolio()) }}
                            className="text-gray-700 hover:text-red-400 transition-colors text-lg leading-none">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SEGUIMIENTO ─────────────────────────────────────────────── */}
        {tab === "watch" && (() => {
          const watchSorted = [...watchList].sort((a, b) => {
            const la = liveData.get(a.symbol)
            const lb = liveData.get(b.symbol)
            let va: number, vb: number
            switch (watchSort) {
              case "symbol":   return watchDir === "desc" ? b.symbol.localeCompare(a.symbol) : a.symbol.localeCompare(b.symbol)
              case "current":  va = la?.currentPrice ?? 0;   vb = lb?.currentPrice ?? 0;   break
              case "target":   va = a.targetPrice ?? 0;       vb = b.targetPrice ?? 0;       break
              case "vstarget":
                va = (la && a.targetPrice) ? ((a.targetPrice - la.currentPrice) / la.currentPrice) * 100 : 0
                vb = (lb && b.targetPrice) ? ((b.targetPrice - lb.currentPrice) / lb.currentPrice) * 100 : 0
                break
              case "drop":     va = la?.dropFrom52w ?? 0;    vb = lb?.dropFrom52w ?? 0;    break
              case "grade":    va = GO.indexOf(la?.score.grade ?? "F"); vb = GO.indexOf(lb?.score.grade ?? "F"); break
              case "buyscore": va = la?.score.buyScore ?? 0; vb = lb?.score.buyScore ?? 0; break
              case "signal":   va = SIGNAL_RANK[la?.score.signal ?? ""] ?? 0; vb = SIGNAL_RANK[lb?.score.signal ?? ""] ?? 0; break
              default:         va = 0; vb = 0
            }
            return watchDir === "desc" ? vb - va : va - vb
          })
          return (
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-400">
                {watchList.length}/{WATCH_LIMIT} en seguimiento
                {watchList.length >= WATCH_LIMIT && <span className="ml-2 text-orange-400 text-xs font-semibold">límite alcanzado</span>}
              </span>
              <div className="flex gap-2">
                <button onClick={saveSignalState}
                  disabled={liveData.size === 0}
                  className="text-xs px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
                  title="Guarda las señales actuales como referencia para detectar cambios">
                  Guardar estado
                </button>
                <button onClick={() => refreshData(watchList.map(e => e.symbol))}
                  disabled={loadingSymbols.size > 0}
                  className="text-xs px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-40">
                  Verificar ahora
                </button>
              </div>
            </div>

            {watchList.length === 0 ? (
              <div className="text-center py-20 text-gray-600">
                <div className="text-4xl mb-3">👁</div>
                <p>No tienes empresas en seguimiento.</p>
                <p className="text-sm mt-1">Agrégalas desde la página de cada empresa.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                      {([
                        { col: "signal"  as WatchSortCol, label: "Señal",       align: "left"  },
                        { col: "symbol"  as WatchSortCol, label: "Empresa",     align: "left"  },
                        { col: "current" as WatchSortCol, label: "Precio",      align: "right" },
                        { col: "drop"    as WatchSortCol, label: "Caída 52w",   align: "right" },
                        { col: "target"  as WatchSortCol, label: "Graham %",    align: "right" },
                        { col: "vstarget"as WatchSortCol, label: "Upside",      align: "right" },
                        { col: "grade"   as WatchSortCol, label: "Grado",       align: "left"  },
                        { col: "buyscore"as WatchSortCol, label: "Score",       align: "right" },
                      ]).map(({ col, label, align }) => (
                        <th key={col}
                          onClick={() => handleWatchSort(col)}
                          className={`pb-2 pr-4 text-${align} cursor-pointer select-none hover:text-gray-300 transition-colors ${watchSort === col ? "text-white" : ""}`}>
                          {label} {sortIcon(watchSort === col, watchDir)}
                        </th>
                      ))}
                      <th className="pb-2 pr-4">Agregado</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchSorted.map(e => {
                      const live = liveData.get(e.symbol)
                      const graham = live?.discountToGraham ?? null
                      const upside = live?.upsideToTarget ?? null
                      return (
                        <tr key={e.symbol} className={`border-b border-gray-800/50 hover:brightness-110 transition-all ${heatRow(live?.score.buyScore)}`}>
                          <td className="py-3 pr-4">
                            <div className="flex flex-col gap-0.5 items-start">
                              {live ? <SignalBadge signal={live.score.signal} /> : <span className="text-gray-700 text-xs">—</span>}
                              {live && savedSignals[e.symbol] && live.score.signal !== savedSignals[e.symbol] && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white whitespace-nowrap">
                                  ⚠ CAMBIÓ
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-6">
                            <Link href={`/empresa/${e.symbol}`} className="hover:opacity-80">
                              <div className="font-bold text-white">{e.symbol}</div>
                              <div className="text-xs text-gray-500 truncate max-w-[130px]">{e.company}</div>
                            </Link>
                          </td>
                          <td className="py-3 pr-4 text-right font-mono">
                            {loadingSymbols.has(e.symbol) ? <span className="text-gray-600">…</span> : usd(live?.currentPrice ?? 0)}
                          </td>
                          <td className={`py-3 pr-4 text-right font-mono ${live && live.dropFrom52w <= -20 ? "text-green-400" : "text-gray-400"}`}>
                            {live ? `${live.dropFrom52w.toFixed(1)}%` : "—"}
                          </td>
                          <td className={`py-3 pr-4 text-right font-mono font-bold ${graham === null ? "text-gray-600" : graham <= -10 ? "text-green-400" : graham >= 0 ? "text-red-400" : "text-yellow-300"}`}>
                            {graham !== null ? pct(graham) : "—"}
                          </td>
                          <td className={`py-3 pr-4 text-right font-mono font-bold ${upside === null ? "text-gray-600" : upside >= 20 ? "text-green-400" : upside >= 0 ? "text-yellow-300" : "text-red-400"}`}>
                            {upside !== null ? pct(upside) : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            {live ? <GradeBadge grade={live.score.grade} /> : <span className="text-gray-700 text-xs">—</span>}
                          </td>
                          <td className="py-3 pr-4 text-right font-mono text-gray-300 font-bold">
                            {live ? live.score.buyScore : "—"}
                          </td>
                          <td className="py-3 pr-4 text-xs text-gray-600">{e.addedAt}</td>
                          <td className="py-3">
                            <button onClick={() => { removeWatch(e.symbol); setWatchList(getWatchEntries()) }}
                              className="text-gray-700 hover:text-red-400 transition-colors text-lg leading-none">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )
        })()}

        {/* ── TAB: ALERTAS ─────────────────────────────────────────────────── */}
        {tab === "alerts" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-400">
                {alerts.length} alertas
                {triggeredCount > 0 && <span className="ml-2 text-orange-400 font-semibold">{triggeredCount} disparadas</span>}
              </span>
              <div className="flex gap-2">
                <button onClick={() => { refreshData(alerts.map(a => a.symbol)); verifyAlerts() }}
                  disabled={loadingSymbols.size > 0}
                  className="text-xs px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-40">
                  Verificar alertas
                </button>
                <button onClick={() => setShowAddAlert(true)}
                  className="text-xs px-3 py-1.5 rounded bg-orange-700 hover:bg-orange-600 text-white font-semibold transition-colors">
                  ＋ Nueva alerta
                </button>
              </div>
            </div>

            {alerts.length === 0 ? (
              <div className="text-center py-20 text-gray-600">
                <div className="text-4xl mb-3">🔔</div>
                <p>No tienes alertas configuradas.</p>
                <p className="text-sm mt-1">Crea una alerta para ser notificado cuando se cumplan tus condiciones.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map(a => (
                  <div key={a.id} className={`flex items-center gap-3 p-4 rounded-xl border ${
                    a.triggered ? "bg-orange-950/40 border-orange-800" :
                    a.active    ? "bg-gray-900 border-gray-800" :
                                  "bg-gray-900/50 border-gray-800/50 opacity-50"
                  }`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-white">{a.symbol}</span>
                        <span className="text-xs text-gray-500">{a.label}</span>
                        {a.triggered && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-600 text-white">
                            Disparada {a.triggeredAt ?? ""}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-600">
                        {alertTypeLabel(a.type)}
                        {a.type !== "buy_ready" && ` — umbral: ${a.threshold}${alertThresholdSuffix(a.type)}`}
                        {" · "}{a.active ? "Activa" : "Pausada"}{" · creada "}{a.createdAt}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.triggered ? (
                        <button onClick={() => { resetAlert(a.id); setAlerts(getAlerts()) }}
                          className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:text-white transition-colors">
                          Reset
                        </button>
                      ) : (
                        <button onClick={() => { toggleAlertActive(a.id); setAlerts(getAlerts()) }}
                          className={`text-xs px-2 py-1 rounded transition-colors ${a.active ? "bg-gray-700 text-gray-300 hover:text-white" : "bg-green-900 text-green-400 hover:text-white"}`}>
                          {a.active ? "Pausar" : "Activar"}
                        </button>
                      )}
                      <button onClick={() => { removeAlert(a.id); setAlerts(getAlerts()) }}
                        className="text-gray-700 hover:text-red-400 transition-colors text-lg leading-none">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modales */}
      {showAddPos && (
        <AddPositionModal
          onClose={() => setShowAddPos(false)}
          onAdd={entry => { addPosition(entry); setPortfolio(getPortfolio()); refreshData([entry.symbol]) }}
        />
      )}
      {showAddAlert && (
        <AddAlertModal
          onClose={() => setShowAddAlert(false)}
          onAdd={a => { addAlert(a); setAlerts(getAlerts()) }}
        />
      )}
    </main>
    </ErrorBoundary>
  )
}
