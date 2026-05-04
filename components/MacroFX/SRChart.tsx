"use client"

import { useState, useEffect, useRef } from "react"
import {
  createChart,
  CrosshairMode,
  LineStyle,
  IChartApi,
  UTCTimestamp,
} from "lightweight-charts"

type Tf = "1d" | "4h" | "1h" | "15m"

type SRData = {
  price: number
  pdh: number
  pdl: number
  pivots: { pp: number; r1: number; r2: number; s1: number; s2: number }
  vwap: number | null
  vwapBands: { s1up: number; s1dn: number; s2up: number; s2dn: number } | null
  openingRange: { high: number; low: number } | null
  emas: { ema20: number; ema50: number; ema200: number }
}

type Candle = {
  time:   UTCTimestamp
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

type Level = { label: string; value: number; kind: "vwap" | "pivot" | "ema" | "pd" | "or" }

function getLevels(d: SRData): Level[] {
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
    all.push({ label: "VWAP",    value: d.vwap,            kind: "vwap" })
    all.push({ label: "VWAP+1σ", value: d.vwapBands.s1up,  kind: "vwap" })
    all.push({ label: "VWAP+2σ", value: d.vwapBands.s2up,  kind: "vwap" })
    all.push({ label: "VWAP-1σ", value: d.vwapBands.s1dn,  kind: "vwap" })
    all.push({ label: "VWAP-2σ", value: d.vwapBands.s2dn,  kind: "vwap" })
  }
  if (d.openingRange) {
    all.push({ label: "ORH", value: d.openingRange.high, kind: "or" })
    all.push({ label: "ORL", value: d.openingRange.low,  kind: "or" })
  }
  return all.filter(l => l.value > 0)
}

function levelColor(l: Level, price: number): string {
  if (l.kind === "vwap") return "#f59e0b"
  if (l.kind === "ema")  return "#6b7280"
  if (l.kind === "pd")   return "#94a3b8"
  if (l.kind === "or")   return "#a78bfa"
  return l.value > price ? "#ef4444" : "#22c55e"
}

// ─── Inner chart panel — one instance per (symbol, tf) via key ───────────────

function ChartPanel({ symbol, tf, levels }: { symbol: "GLD" | "QQQ"; tf: Tf; levels: SRData | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [status,  setStatus]  = useState<"loading" | "ok" | "error">("loading")

  // Fetch candles once on mount (key remounts on symbol/tf change)
  useEffect(() => {
    let alive = true
    fetch(`/api/chart-data?symbol=${symbol}&tf=${tf}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ candles: data }: { candles: Candle[] }) => { if (alive) setCandles(data) })
      .catch(() => { if (alive) setStatus("error") })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build / rebuild chart when candles or levels are ready
  useEffect(() => {
    if (!candles || !containerRef.current) return

    const w = containerRef.current.clientWidth || containerRef.current.offsetWidth || 800
    const chart = createChart(containerRef.current, {
      width:  w,
      height: 480,
      layout: {
        background: { color: "#0f172a" },
        textColor:  "#9ca3af",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: { borderColor: "#374151" },
      timeScale: {
        borderColor:    "#374151",
        timeVisible:    tf !== "1d" && tf !== "4h",
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
    })
    chartRef.current = chart

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor:         "#22c55e",
      downColor:       "#ef4444",
      borderUpColor:   "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor:     "#22c55e",
      wickDownColor:   "#ef4444",
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candleSeries.setData(candles as any)

    // Volume histogram — bottom 15%
    try {
      const volSeries = chart.addHistogramSeries({
        priceFormat:  { type: "volume" },
        priceScaleId: "vol",
      })
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      volSeries.setData(candles.map(c => ({
        time:  c.time,
        value: c.volume,
        color: c.close >= c.open ? "#22c55e30" : "#ef444430",
      })) as any)
    } catch { /* volume histogram optional */ }

    // S/R price lines
    if (levels) {
      candleSeries.createPriceLine({
        price:            levels.price,
        color:            "#ffffff",
        lineWidth:        2,
        lineStyle:        LineStyle.Solid,
        axisLabelVisible: true,
        title:            "NOW",
      })
      for (const l of getLevels(levels)) {
        candleSeries.createPriceLine({
          price:            l.value,
          color:            levelColor(l, levels.price),
          lineWidth:        1,
          lineStyle:        LineStyle.Dashed,
          axisLabelVisible: true,
          title:            l.label,
        })
      }
    }

    chart.timeScale().fitContent()

    let roTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (roTimer) clearTimeout(roTimer)
      roTimer = setTimeout(() => {
        if (containerRef.current) {
          const w = containerRef.current.clientWidth
          if (w > 0) chart.applyOptions({ width: w })
        }
      }, 100)
    })
    ro.observe(containerRef.current)
    setStatus("ok")

    return () => { if (roTimer) clearTimeout(roTimer); ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [candles, levels]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-[480px]">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-10 rounded-lg">
          <span className="text-gray-500 text-xs">Cargando velas…</span>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 text-xs">
          Error al cargar datos
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

const TF_LABELS: Record<Tf, string> = { "1d": "1D", "4h": "H4", "1h": "H1", "15m": "M15" }

export function SRChart() {
  const [symbol,  setSymbol]  = useState<"GLD" | "QQQ">("GLD")
  const [tf,      setTf]      = useState<Tf>("1d")
  const [srData,  setSrData]  = useState<{ GLD: SRData; QQQ: SRData } | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await fetch("/api/sr")
        if (res.ok) { const d = await res.json(); if (alive) setSrData(d) }
      } catch {}
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {/* Symbol tabs */}
        <div className="flex gap-1">
          {(["GLD", "QQQ"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                symbol === s ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {s === "GLD" ? "GLD / XAU·USD" : "QQQ / NQ100"}
            </button>
          ))}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1">
          {(Object.keys(TF_LABELS) as Tf[]).map(t => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                tf === t ? "bg-gray-700 text-white" : "text-gray-600 hover:text-gray-400"
              }`}
            >
              {TF_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <ChartPanel
        key={`${symbol}-${tf}`}
        symbol={symbol}
        tf={tf}
        levels={srData?.[symbol] ?? null}
      />
    </div>
  )
}
