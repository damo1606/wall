"use client";

import { useState } from "react";
import type { ConvictionRow } from "@/app/api/scanner-pro/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function dollar(v: number) { return v ? `$${v.toFixed(2)}` : "—"; }

// ── Badges ────────────────────────────────────────────────────────────────────

function GateBadge({ gate, noOptions }: { gate: ConvictionRow["soreGate"]; noOptions?: boolean }) {
  if (noOptions) return <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">SIN OPC.</span>;
  const s =
    gate === "GO"   ? "bg-emerald-900/60 border-emerald-700 text-emerald-300" :
    gate === "WAIT" ? "bg-yellow-900/60 border-yellow-700 text-yellow-300" :
                      "bg-gray-800 border-gray-700 text-gray-500";
  const dot = gate === "GO" ? "●" : gate === "WAIT" ? "◐" : "○";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border tracking-widest ${s}`}>{dot} {gate}</span>;
}

function StrategyBadge({ strategy, noOptions }: { strategy: string; noOptions?: boolean }) {
  if (noOptions) return <span className="text-[10px] text-muted">—</span>;
  const c =
    strategy === "SHORT STRANGLE" ? "text-emerald-400" :
    strategy === "IRON CONDOR"    ? "text-blue-400" :
    strategy === "CALENDAR"       ? "text-purple-400" :
    strategy === "CREDIT SPREAD"  ? "text-yellow-400" :
    strategy === "BWB"            ? "text-orange-400" :
    "text-gray-600";
  return <span className={`text-[10px] font-bold tracking-widest ${c}`}>{strategy}</span>;
}

function RegimeBadge({ regime }: { regime: string }) {
  const s =
    regime === "COMPRESIÓN"       ? "bg-emerald-900/60 text-emerald-300 border border-emerald-800" :
    regime === "TRANSICIÓN"       ? "bg-yellow-900/60 text-yellow-300 border border-yellow-800" :
    regime === "EXPANSIÓN"        ? "bg-orange-900/60 text-orange-300 border border-orange-800" :
    regime === "PÁNICO AGUDO"     ? "bg-red-900 text-red-200 border border-red-700" :
    regime === "CRISIS SISTÉMICA" ? "bg-red-950 text-red-200 border border-red-800" :
    "bg-gray-800 text-gray-400 border border-gray-700";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-widest ${s}`}>{regime}</span>;
}

function ScoreBar({ value }: { value: number }) {
  const p = Math.min(100, Math.max(0, value));
  const color = p >= 75 ? "bg-emerald-500" : p >= 55 ? "bg-yellow-500" : p >= 35 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-text w-7 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

// EDGAR F1/F2/F3 — etiquetas compactas que explican por qué SORE modificó el gate.
// Si no hay señales, muestra em dash.
function EdgarReasonBadges({ row }: { row: ConvictionRow }) {
  const tags: { label: string; tip: string; cls: string }[] = []
  if (row.edgarEventBlocked) {
    tags.push({ label: "🚨 8-K", tip: "Material 8-K en ventana [-1d, +3d]: gate forzado a AVOID", cls: "bg-red-900/60 border-red-700 text-red-200" })
  }
  if (typeof row.edgarShortRatioFloat === "number" && row.edgarShortRatioFloat > 0.15) {
    const pct = (row.edgarShortRatioFloat * 100).toFixed(0)
    const danger = row.edgarShortRatioFloat > 0.20
    tags.push({
      label: `⚠️ SI ${pct}%`,
      tip: `Short interest / float = ${pct}%. ${danger ? "VRP capado + ban naked sells (squeeze risk)." : "VRP capado a 30."}`,
      cls: danger ? "bg-orange-900/60 border-orange-700 text-orange-200" : "bg-yellow-900/40 border-yellow-800 text-yellow-300",
    })
  }
  if (typeof row.edgarInsiderSignal === "number" && row.edgarInsiderSignal < -0.7) {
    tags.push({ label: "📉 INS", tip: `Insider selling fuerte (signal ${row.edgarInsiderSignal.toFixed(2)}): ban naked sells.`, cls: "bg-purple-900/60 border-purple-700 text-purple-200" })
  }
  if (tags.length === 0) return <span className="text-[10px] text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t, i) => (
        <span key={i} title={t.tip} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border tracking-wider cursor-help ${t.cls}`}>
          {t.label}
        </span>
      ))}
    </div>
  )
}

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortKey = keyof ConvictionRow;

function sortRows(rows: ConvictionRow[], key: SortKey, asc: boolean) {
  return [...rows].sort((a, b) => {
    const av = a[key] as unknown as number | string;
    const bv = b[key] as unknown as number | string;
    if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
    return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
}

function Th({ label, sortKey, current, asc, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-bold tracking-widest text-muted cursor-pointer hover:text-text select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      {label}{active ? (asc ? " ▲" : " ▼") : ""}
    </th>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIVERSES = [
  { value: "sp500",   label: "S&P 500" },
  { value: "nasdaq",  label: "Nasdaq 100" },
  { value: "dia",     label: "Dow Jones" },
  { value: "russell", label: "Russell 1000" },
];

type GateFilter = "ALL" | "GO" | "WAIT" | "AVOID";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SorePage() {
  const [universe,    setUniverse]    = useState("sp500");
  const [limit,       setLimit]       = useState(20);
  const [gateFilter,  setGateFilter]  = useState<GateFilter>("ALL");
  const [rows,        setRows]        = useState<ConvictionRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [sortKey,     setSortKey]     = useState<SortKey>("soreCSS");
  const [sortAsc,     setSortAsc]     = useState(false);
  const [lastScan,    setLastScan]    = useState("");

  async function handleAnalyze() {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch(`/api/scanner-pro?universe=${universe}&limit=${limit}&minBuyScore=0`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error del servidor");
      setRows(json.rows ?? []);
      setLastScan(new Date().toLocaleTimeString("es-ES"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const filtered = gateFilter === "ALL" ? rows : rows.filter(r => r.soreGate === gateFilter);
  const sorted = sortRows(filtered, sortKey, sortAsc);

  const goCount    = rows.filter(r => r.soreGate === "GO" && !r.noOptions).length;
  const waitCount  = rows.filter(r => r.soreGate === "WAIT" && !r.noOptions).length;
  const avoidCount = rows.filter(r => r.soreGate === "AVOID" && !r.noOptions).length;

  const strategies: Record<string, number> = {};
  for (const r of rows) {
    if (r.noOptions || r.soreGate === "AVOID") continue;
    strategies[r.soreStrategy] = (strategies[r.soreStrategy] ?? 0) + 1;
  }

  const m6 = rows[0];

  return (
    <div className="min-h-screen bg-bg text-text">

      {/* Hero / intro */}
      <div className="border-b border-border px-4 sm:px-6 py-5 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-baseline gap-3 mb-2">
            <h1 className="text-xl font-black tracking-[0.2em] text-accent">SORE</h1>
            <span className="text-xs text-muted tracking-widest">SYSTEMATIC OPTIONS REVENUE ENGINE</span>
          </div>
          <p className="text-xs text-subtle leading-relaxed max-w-3xl">
            Motor institucional de captura de prima por compresión de volatilidad. Detecta cuándo los dealers
            estabilizan el mercado, cuándo el theta decay acelerará y cuándo la prima está inflada vs el movimiento
            esperado. <span className="text-accent">No predice dirección — extrae decay.</span>
          </p>

          {/* Gate legend */}
          <div className="flex flex-wrap gap-4 mt-3 text-[10px] tracking-widest">
            <span className="text-emerald-400 font-bold">● GO &gt;75 · Vender prima activamente</span>
            <span className="text-yellow-400 font-bold">◐ WAIT 55–75 · Solo credit spreads</span>
            <span className="text-gray-500 font-bold">○ AVOID &lt;55 · Régimen adverso</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b border-border px-4 sm:px-6 py-3 bg-bg sticky top-11 z-40">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">UNIVERSO</span>
            <select value={universe} onChange={e => setUniverse(e.target.value)}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5 focus:outline-none focus:border-accent">
              {UNIVERSES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">TOP</span>
            <select value={limit} onChange={e => setLimit(parseInt(e.target.value))}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5 focus:outline-none focus:border-accent">
              {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button onClick={handleAnalyze} disabled={loading}
            className="bg-accent text-white px-5 py-1.5 text-xs font-bold tracking-widest hover:opacity-80 disabled:opacity-40 transition-opacity">
            {loading ? "ANALIZANDO..." : "EJECUTAR GATILLO"}
          </button>
          {rows.length > 0 && !loading && (
            <span className="text-xs text-muted ml-auto">
              {rows.length} tickers · <span className="text-emerald-400 font-bold">{goCount} GO</span> ·{" "}
              <span className="text-yellow-400 font-bold">{waitCount} WAIT</span> ·{" "}
              <span className="text-gray-500 font-bold">{avoidCount} AVOID</span>
              {lastScan && <span className="ml-2">· {lastScan}</span>}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted tracking-widest">Calculando DSS · VSS · VRP · CSS para {limit} tickers...</p>
            <p className="text-[10px] text-muted/60">Esto puede tomar 25–40 segundos</p>
          </div>
        )}

        {error && !loading && (
          <div className="border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger rounded">{error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-20 text-muted text-sm">
            Selecciona universo y pulsa <span className="text-accent font-bold tracking-widest">EJECUTAR GATILLO</span>
          </div>
        )}

        {rows.length > 0 && !loading && (
          <>
            {/* Régimen global + Strategy distribution */}
            {m6 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
                <div className="p-4 border border-border bg-surface rounded-lg col-span-2">
                  <div className="text-[9px] text-muted tracking-widest mb-2 font-bold">RÉGIMEN GLOBAL DE MERCADO</div>
                  <div className="flex flex-wrap gap-5 items-center">
                    <div>
                      <div className="text-[9px] text-muted tracking-widest mb-1">RÉGIMEN</div>
                      <RegimeBadge regime={m6.m6Regime} />
                    </div>
                    <div>
                      <div className="text-[9px] text-muted tracking-widest mb-1">VIX</div>
                      <span className="text-sm font-mono font-bold text-text">{m6.m6Vix.toFixed(2)}</span>
                      <span className="text-[10px] text-muted ml-1">{m6.m6VixVelocity}</span>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted tracking-widest mb-1">FEAR SCORE</div>
                      <span className={`text-sm font-mono font-bold ${m6.m6FearScore < 30 ? "text-red-400" : m6.m6FearScore > 70 ? "text-emerald-400" : "text-yellow-400"}`}>
                        {m6.m6FearScore.toFixed(0)}
                      </span>
                      <span className="text-[10px] text-muted ml-1">{m6.m6FearLabel}</span>
                    </div>
                    {m6.m6SignalSuspended && (
                      <div className="px-3 py-1.5 bg-red-900/60 border border-red-700 rounded text-xs text-red-300 font-bold tracking-widest">
                        ⚠ GATILLO SUSPENDIDO
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 border border-border bg-surface rounded-lg">
                  <div className="text-[9px] text-muted tracking-widest mb-2 font-bold">DISTRIBUCIÓN DE ESTRATEGIAS</div>
                  {Object.keys(strategies).length === 0 ? (
                    <div className="text-xs text-muted">Sin entradas activas</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {Object.entries(strategies).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                        <div key={s} className="flex items-center justify-between text-[10px]">
                          <StrategyBadge strategy={s} />
                          <span className="font-mono text-subtle">{n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Gate filter */}
            <div className="flex gap-1 mb-3">
              {(["ALL", "GO", "WAIT", "AVOID"] as GateFilter[]).map(g => (
                <button key={g} onClick={() => setGateFilter(g)}
                  className={`text-[10px] px-3 py-1 border tracking-widest transition-colors ${
                    gateFilter === g
                      ? g === "GO"    ? "border-emerald-700 text-emerald-300 bg-emerald-900/30"
                      : g === "WAIT"  ? "border-yellow-700 text-yellow-300 bg-yellow-900/30"
                      : g === "AVOID" ? "border-gray-700 text-gray-300 bg-gray-800/60"
                      :                 "border-accent text-accent bg-accent/10"
                      : "border-border text-muted hover:text-text"
                  }`}>
                  {g === "ALL" ? "TODOS" : g}
                </button>
              ))}
            </div>

            {/* Main table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="border-b border-border bg-surface">
                  <Th label="TICKER"     sortKey="symbol"        current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="PRECIO"     sortKey="currentPrice"  current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="GATE"       sortKey="soreGate"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="CSS"        sortKey="soreCSS"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="DSS"        sortKey="soreDSS"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="VSS"        sortKey="soreVSS"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="VRP"        sortKey="soreVRP"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="ESTRATEGIA" sortKey="soreStrategy"  current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <th className="px-3 py-2 text-[10px] tracking-widest text-muted text-left">EDGAR</th>
                  <Th label="GEX"        sortKey="m1NetGex"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="PCR"        sortKey="m1Pcr"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                  <Th label="RÉGIMEN"    sortKey="m6Regime"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                </tr></thead>
                <tbody>
                  {sorted.map(row => (
                    <tr key={row.symbol}
                      className={`border-b border-border/50 hover:bg-surface/60 transition-colors ${
                        row.soreGate === "GO" ? "border-l-2 border-l-emerald-600" :
                        row.soreGate === "WAIT" ? "border-l-2 border-l-yellow-700" : ""
                      }`}>
                      <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{dollar(row.currentPrice)}</td>
                      <td className="px-3 py-2.5"><GateBadge gate={row.soreGate} noOptions={row.noOptions} /></td>
                      <td className="px-3 py-2.5">
                        {row.noOptions ? <span className="text-xs text-muted">—</span> : <ScoreBar value={row.soreCSS} />}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.noOptions ? <span className="text-xs text-muted">—</span> : <ScoreBar value={row.soreDSS} />}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.noOptions ? <span className="text-xs text-muted">—</span> : <ScoreBar value={row.soreVSS} />}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.noOptions ? <span className="text-xs text-muted">—</span> : <ScoreBar value={row.soreVRP} />}
                      </td>
                      <td className="px-3 py-2.5"><StrategyBadge strategy={row.soreStrategy} noOptions={row.noOptions} /></td>
                      <td className="px-3 py-2.5"><EdgarReasonBadges row={row} /></td>
                      <td className="px-3 py-2.5 font-mono text-xs text-subtle">
                        {row.noOptions ? "—" : (row.m1NetGex / 1e9).toFixed(2) + "B"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <span className={row.m1Pcr > 1 ? "text-red-400" : "text-emerald-400"}>
                          {row.noOptions ? "—" : row.m1Pcr.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><RegimeBadge regime={row.m6Regime} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Formula legend */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] tracking-widest border-t border-border pt-4">
              <div>
                <div className="text-muted font-bold mb-1">DSS · DEALER STABILIZATION</div>
                <div className="text-subtle">GEX (40%) + Presión (35%) + PCR (25%). Mide si los dealers estabilizan el mercado.</div>
              </div>
              <div>
                <div className="text-muted font-bold mb-1">VSS · VOLATILITY SUPPRESSION</div>
                <div className="text-subtle">IV environment (40%) + Régimen (40%) + M5 rango (20%). Detecta prima inflada vs movimiento real.</div>
              </div>
              <div>
                <div className="text-muted font-bold mb-1">VRP · VOL RISK PREMIUM</div>
                <div className="text-subtle">(VIX − 12) × 4. Proxy del exceso IV vs RV histórica. Edge estructural del vendedor de prima.</div>
              </div>
              <div className="sm:col-span-3 pt-2 border-t border-border/50">
                <div className="text-muted font-bold mb-1">CSS · COMPOSITE SUPPRESSION SIGNAL</div>
                <div className="text-subtle">35% × DSS + 35% × VSS + 30% × VRP. CSS &gt; 75 + DSS &gt; 65 dispara GO. Régimen PÁNICO/CRISIS bloquea automáticamente.</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
