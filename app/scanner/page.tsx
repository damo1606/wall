"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";

interface AnomalyRow {
  ticker: string;
  spot: number;
  strike: number;
  type: "CALL" | "PUT";
  expiration: string;
  oi: number;
  volume: number;
  iv: number;
  volOiRatio: number;
  oiZScore: number;
  anomalyScore: number;
  bias: Bias;
}

// Proximity: 0 = far (>10%), 1 = ATM (0%)
function proximity(strike: number, spot: number): number {
  if (spot <= 0) return 0;
  const dist = Math.abs(strike - spot) / spot;
  return Math.max(0, 1 - dist / 0.10);
}

function biasHeatmapStyle(bias: Bias, prox: number): React.CSSProperties {
  const intensity = Math.round(prox * 255);
  if (bias === "BULLISH") {
    return {
      backgroundColor: `rgba(22, 163, 74, ${0.08 + prox * 0.72})`,
      color: prox > 0.5 ? `rgb(${Math.round(255 - intensity * 0.6)}, ${Math.round(200 - intensity * 0.3)}, ${Math.round(255 - intensity)})` : "rgb(21,128,61)",
      borderColor: `rgba(22, 163, 74, ${0.3 + prox * 0.7})`,
    };
  }
  if (bias === "BEARISH") {
    return {
      backgroundColor: `rgba(220, 38, 38, ${0.08 + prox * 0.72})`,
      color: prox > 0.5 ? `rgb(255, ${Math.round(255 - intensity * 0.8)}, ${Math.round(255 - intensity)})` : "rgb(185,28,28)",
      borderColor: `rgba(220, 38, 38, ${0.3 + prox * 0.7})`,
    };
  }
  return { backgroundColor: "rgb(243,244,246)", color: "rgb(107,114,128)", borderColor: "rgb(209,213,219)" };
}

const DEFAULT_TICKERS = "SPY,QQQ,IWM,AAPL,TSLA,NVDA,AMZN,MSFT,META,AMD";

type SortKey = keyof AnomalyRow;
type FilterType = "ALL" | "CALL" | "PUT";

function scoreColor(score: number): string {
  if (score >= 3) return "text-red-600 font-bold";
  if (score >= 2) return "text-orange-500 font-bold";
  if (score >= 1) return "text-yellow-600 font-semibold";
  return "text-muted";
}

function scoreBadge(score: number): string {
  if (score >= 3) return "bg-red-100 text-red-700 border border-red-300";
  if (score >= 2) return "bg-orange-100 text-orange-700 border border-orange-300";
  return "bg-yellow-50 text-yellow-700 border border-yellow-200";
}

interface Expiration { ts: number; date: string; }
interface LivePrice { price: number; change: number; changePct: number; }

export default function ScannerPage() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKERS);
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [scannedTickers, setScannedTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("anomalyScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [filterTicker, setFilterTicker] = useState("ALL");
  const [lastScan, setLastScan] = useState("");
  const [expirations, setExpirations] = useState<Expiration[]>([]);
  const [selectedExp, setSelectedExp] = useState<number | "">("");
  const [loadingExps, setLoadingExps] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [lastPrice, setLastPrice] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchLivePrices(tickers: string) {
    try {
      const res = await fetch(`/api/scanner/prices?tickers=${encodeURIComponent(tickers)}`);
      const json = await res.json();
      if (json.prices) {
        setLivePrices(json.prices);
        setLastPrice(new Date().toLocaleTimeString("es-ES"));
      }
    } catch {}
  }

  // Auto-refresh prices every 30s
  useEffect(() => {
    const tickers = tickerInput.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean).join(",");
    fetchLivePrices(tickers);
    intervalRef.current = setInterval(() => fetchLivePrices(tickers), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tickerInput]);

  async function fetchExpirations() {
    const firstTicker = tickerInput.split(",")[0].trim().toUpperCase() || "SPY";
    setLoadingExps(true);
    try {
      const res = await fetch(`/api/scanner/expirations?ticker=${firstTicker}`);
      const json = await res.json();
      setExpirations(json.expirations ?? []);
      setSelectedExp("");
    } catch {}
    setLoadingExps(false);
  }

  async function handleScan() {
    setLoading(true);
    setError("");
    try {
      const tickers = tickerInput.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean).join(",");
      const expParam = selectedExp ? `&expiration=${selectedExp}` : "";
      const res = await fetch(`/api/scanner?tickers=${encodeURIComponent(tickers)}${expParam}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error en el scanner");
      setRows(json.rows ?? []);
      setScannedTickers(json.scannedTickers ?? []);
      setLastScan(new Date().toLocaleTimeString("es-ES"));
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const filtered = rows
    .filter((r) => filterType === "ALL" || r.type === filterType)
    .filter((r) => filterTicker === "ALL" || r.ticker === filterTicker)
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });

  const uniqueTickers = ["ALL", ...Array.from(new Set(rows.map((r) => r.ticker)))];

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        className={`px-3 py-2 text-left text-[10px] tracking-widest font-bold cursor-pointer select-none whitespace-nowrap ${active ? "text-accent" : "text-muted"} hover:text-text transition-colors`}
        onClick={() => handleSort(k)}
      >
        {label} {active ? (sortAsc ? "▲" : "▼") : ""}
      </th>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Live Prices Bar */}
      {Object.keys(livePrices).length > 0 && (
        <div className="bg-card px-4 sm:px-6 py-2 flex gap-4 overflow-x-auto items-center">
          {Object.entries(livePrices).map(([ticker, data]) => (
            <div key={ticker} className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-bold text-white tracking-widest">{ticker}</span>
              <span className="text-xs font-mono text-white">${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-[10px] font-mono ${data.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                {data.change >= 0 ? "+" : ""}{data.change.toFixed(2)} ({data.changePct >= 0 ? "+" : ""}{data.changePct.toFixed(2)}%)
              </span>
            </div>
          ))}
          <span className="text-[9px] text-muted ml-auto shrink-0 tracking-widest">
            ● LIVE · {lastPrice}
          </span>
        </div>
      )}

      {/* Intro */}
      <div className="bg-surface border-b border-border px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-[9px] text-muted tracking-widest font-bold mb-1">QUÉ DETECTA</div>
          <div className="text-xs text-subtle leading-relaxed">Strikes donde el Open Interest es estadísticamente anómalo — concentraciones inusuales de posicionamiento institucional.</div>
        </div>
        <div>
          <div className="text-[9px] text-muted tracking-widest font-bold mb-1">CÓMO FUNCIONA</div>
          <div className="text-xs text-subtle leading-relaxed">Z-score de OI por strike + ratio Volumen/OI (actividad intradiaria). Score ponderado: OI z-score 50%, Vol/OI 35%, IV 15%.</div>
        </div>
        <div>
          <div className="text-[9px] text-muted tracking-widest font-bold mb-1">CÓMO LEERLO</div>
          <div className="text-xs text-subtle leading-relaxed">Score &gt; 3 = anomalía fuerte (rojo). Score &gt; 2 = presión institucional alta (naranja). Vol/OI &gt; 1 = más contratos operados hoy que OI existente.</div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-border px-4 sm:px-6 py-3 bg-bg flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="text-[9px] text-muted tracking-widest font-bold block mb-1">TICKERS (separados por coma)</label>
          <input
            className="bg-bg border border-border text-text px-3 py-2 text-xs uppercase tracking-widest w-full focus:outline-none focus:border-accent transition-colors"
            value={tickerInput}
            onChange={(e) => { setTickerInput(e.target.value.toUpperCase()); setExpirations([]); setSelectedExp(""); }}
            placeholder="SPY,QQQ,AAPL,TSLA..."
          />
        </div>
        <div>
          <label className="text-[9px] text-muted tracking-widest font-bold block mb-1">FECHA DE EXPIRACIÓN</label>
          <div className="flex gap-2">
            <button
              onClick={fetchExpirations}
              disabled={loadingExps}
              className="border border-border text-xs text-muted px-3 py-2 hover:text-text hover:border-accent disabled:opacity-40 transition-colors tracking-widest whitespace-nowrap"
            >
              {loadingExps ? "..." : "CARGAR FECHAS"}
            </button>
            {expirations.length > 0 && (
              <select
                className="bg-bg border border-border text-text px-3 py-2 text-xs focus:outline-none focus:border-accent transition-colors"
                value={selectedExp}
                onChange={(e) => setSelectedExp(e.target.value ? parseInt(e.target.value) : "")}
              >
                <option value="">PRÓXIMO VENCIMIENTO</option>
                {expirations.map(({ ts, date }) => {
                  const d = new Date(date + "T12:00:00");
                  const dow = d.getDay();
                  const day = d.getDate();
                  const mon = d.getMonth();
                  const isThirdFri = dow === 5 && day >= 15 && day <= 21;
                  const isQuart = isThirdFri && [2, 5, 8, 11].includes(mon);
                  const suffix = isQuart ? " ★ TRIM" : isThirdFri ? " · MEN" : "";
                  return <option key={ts} value={ts}>{date}{suffix}</option>;
                })}
              </select>
            )}
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={loading}
          className="bg-accent text-white px-6 py-2 text-sm font-bold tracking-widest hover:opacity-80 disabled:opacity-40 transition-opacity"
        >
          {loading ? "ESCANEANDO..." : "ESCANEAR"}
        </button>
      </div>

      {/* Filters */}
      {rows.length > 0 && (
        <div className="border-b border-border px-4 sm:px-6 py-2 bg-surface flex flex-wrap gap-3 items-center">
          <div className="flex gap-1">
            {(["ALL", "CALL", "PUT"] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-3 py-1 text-xs font-bold tracking-widest border transition-colors ${filterType === f ? "bg-accent text-white border-accent" : "border-border text-muted hover:text-text"}`}
              >
                {f === "ALL" ? "TODOS" : f}
              </button>
            ))}
          </div>
          <select
            className="bg-bg border border-border text-text px-3 py-1 text-xs focus:outline-none focus:border-accent"
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
          >
            {uniqueTickers.map((t) => <option key={t} value={t}>{t === "ALL" ? "TODOS LOS TICKERS" : t}</option>)}
          </select>
          <span className="text-xs text-muted ml-auto">
            {filtered.length} anomalías · {scannedTickers.length} tickers escaneados
            {lastScan && ` · ${lastScan}`}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="px-4 sm:px-6 py-4">
        {error && (
          <div className="border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm mb-4">{error}</div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="text-center py-20 text-muted text-sm tracking-widest">
            Configura los tickers y pulsa <span className="text-accent font-bold">ESCANEAR</span>
          </div>
        )}

        {loading && (
          <div className="text-center py-20 text-muted text-sm tracking-widest animate-pulse">
            ANALIZANDO CADENAS DE OPCIONES...
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-accent bg-surface">
                  <SortHeader label="TICKER" k="ticker" />
                  <SortHeader label="SPOT" k="spot" />
                  <SortHeader label="STRIKE" k="strike" />
                  <th className="px-3 py-2 text-left text-[10px] tracking-widest font-bold text-muted">STRIKE VS SPOT</th>
                  <th className="px-3 py-2 text-left text-[10px] tracking-widest font-bold text-muted">TIPO</th>
                  <SortHeader label="VENCE" k="expiration" />
                  <SortHeader label="OI" k="oi" />
                  <SortHeader label="VOLUMEN" k="volume" />
                  <SortHeader label="VOL/OI" k="volOiRatio" />
                  <SortHeader label="IV %" k="iv" />
                  <SortHeader label="Z-SCORE OI" k="oiZScore" />
                  <SortHeader label="ANOMALÍA" k="anomalyScore" />
                  <SortHeader label="SESGO" k="bias" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={`${r.ticker}-${r.strike}-${r.type}-${i}`}
                    className="border-b border-border hover:bg-surface transition-colors"
                  >
                    <td className="px-3 py-2 font-bold tracking-widest">
                      <Link href={`/empresa/${r.ticker}`} className="text-accent hover:underline">{r.ticker}</Link>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {(() => {
                        const live = livePrices[r.ticker];
                        const price = live ? live.price : r.spot;
                        const change = live?.change ?? 0;
                        return (
                          <div className="flex flex-col">
                            <span className="font-mono text-sm">${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            {live && (
                              <span className={`text-[9px] font-mono ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {change >= 0 ? "+" : ""}{change.toFixed(2)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.strike.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const spot = livePrices[r.ticker]?.price ?? r.spot;
                        const diff = r.strike - spot;
                        const pct = spot > 0 ? (diff / spot) * 100 : 0;
                        const isAbove = diff > 0;
                        return (
                          <div className="flex flex-col">
                            <span className={`text-xs font-mono font-bold ${isAbove ? "text-green-600" : "text-red-600"}`}>
                              {isAbove ? "+" : ""}{diff.toFixed(2)}
                            </span>
                            <span className={`text-[9px] font-mono ${isAbove ? "text-green-500" : "text-red-500"}`}>
                              {isAbove ? "+" : ""}{pct.toFixed(2)}% {isAbove ? "↑ OTM" : "↓ OTM"}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold px-2 py-0.5 ${r.type === "CALL" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted font-mono">{r.expiration}</td>
                    <td className="px-3 py-2 font-mono">{r.oi.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono">{r.volume.toLocaleString()}</td>
                    <td className={`px-3 py-2 font-mono ${r.volOiRatio >= 1 ? "text-orange-600 font-bold" : ""}`}>
                      {r.volOiRatio.toFixed(2)}x
                    </td>
                    <td className="px-3 py-2 font-mono">{r.iv.toFixed(1)}%</td>
                    <td className={`px-3 py-2 font-mono ${scoreColor(r.oiZScore)}`}>{r.oiZScore.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold px-2 py-0.5 ${scoreBadge(r.anomalyScore)}`}>
                        {r.anomalyScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const prox = proximity(r.strike, r.spot);
                        const style = biasHeatmapStyle(r.bias, prox);
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="text-xs font-bold px-2 py-0.5 border text-center"
                              style={style}
                            >
                              {r.bias}
                            </span>
                            <div className="w-full h-1 rounded-full bg-surface overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.round(prox * 100)}%`,
                                  backgroundColor: r.bias === "BULLISH" ? "rgb(22,163,74)" : r.bias === "BEARISH" ? "rgb(220,38,38)" : "rgb(156,163,175)",
                                  opacity: 0.4 + prox * 0.6,
                                }}
                              />
                            </div>
                            <span className="text-[9px] text-muted text-center tracking-widest">
                              {Math.round(prox * 100)}% ATM
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
