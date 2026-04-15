"use client";

import { useState } from "react";
import type { ConvictionRow } from "@/app/api/scanner-pro/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number, d = 1) { return v ? v.toFixed(d) : "—"; }
function pct(v: number) { return v ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—"; }
function dollar(v: number) { return v ? `$${v.toFixed(2)}` : "—"; }

// ── Badges ────────────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "A+" ? "bg-emerald-500 text-white" :
    grade === "A"  ? "bg-green-600 text-white" :
    grade === "B"  ? "bg-blue-600 text-white" :
    grade === "C"  ? "bg-yellow-600 text-white" :
    grade === "D"  ? "bg-orange-600 text-white" :
    "bg-red-800 text-white";
  return <span className={`text-xs font-black px-2 py-0.5 rounded ${color}`}>{grade}</span>;
}

function VerdictBadge({ verdict }: { verdict: ConvictionRow["verdict"] }) {
  const s =
    verdict === "STRONG BUY" ? "bg-emerald-900 text-emerald-200 border border-emerald-700" :
    verdict === "BUY"        ? "bg-green-900/60 text-green-300 border border-green-800" :
    verdict === "WATCH"      ? "bg-yellow-900/60 text-yellow-300 border border-yellow-800" :
    "bg-gray-800 text-gray-400 border border-gray-700";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-widest ${s}`}>{verdict}</span>;
}

function BiasBadge({ bias, noOptions }: { bias: ConvictionRow["soreBias"]; noOptions?: boolean }) {
  if (noOptions) return <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">SIN OPC.</span>;
  const s =
    bias === "BULLISH" ? "bg-emerald-900/60 text-emerald-300 border border-emerald-800" :
    bias === "BEARISH" ? "bg-red-900/60 text-red-300 border border-red-800" :
    "bg-gray-800 text-gray-400 border border-gray-700";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-widest ${s}`}>{bias}</span>;
}

function M7VerdictBadge({ verdict }: { verdict: string }) {
  const s =
    verdict === "ALCISTA" ? "bg-emerald-900/60 text-emerald-300 border border-emerald-800" :
    verdict === "BAJISTA" ? "bg-red-900/60 text-red-300 border border-red-800" :
    "bg-gray-800 text-gray-400 border border-gray-700";
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-widest ${s}`}>{verdict}</span>;
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

function PressureBar({ value }: { value: number }) {
  const c = Math.max(-100, Math.min(100, value));
  const pos = c >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
        {pos
          ? <><div className="w-1/2" /><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${c / 2}%` }} /></>
          : <><div className="h-full bg-red-500 rounded-full ml-auto" style={{ width: `${-c / 2}%` }} /><div className="w-1/2" /></>
        }
      </div>
      <span className={`text-xs font-mono ${pos ? "text-emerald-400" : "text-red-400"}`}>
        {pos ? "+" : ""}{c.toFixed(0)}
      </span>
    </div>
  );
}

function ConfBar({ value, max = 100 }: { value: number; max?: number }) {
  const p = Math.min(100, (value / max) * 100);
  const color = p >= 70 ? "bg-emerald-500" : p >= 40 ? "bg-yellow-500" : "bg-gray-600";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs font-mono text-subtle">{value.toFixed(0)}</span>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "resumen" | "m1" | "m2" | "m3" | "m5" | "m6" | "m7";
const TABS: { id: TabId; label: string; desc: string }[] = [
  { id: "resumen", label: "RESUMEN",           desc: "Score fundamental + convicción combinada" },
  { id: "m1",      label: "M1 · GEX",          desc: "Gamma Exposure · Presión institucional" },
  { id: "m2",      label: "M2 · Z-SCORE",      desc: "Z-Score GEX + PCR · S/R estadístico" },
  { id: "m3",      label: "M3 · CONFLUENCIA",  desc: "Multi-expiración · Confluencia 3D" },
  { id: "m5",      label: "M5 · SEÑAL",        desc: "Señal consolidada multi-metodología" },
  { id: "m6",      label: "M6 · RÉGIMEN",      desc: "Régimen de mercado · VIX · Fear Score" },
  { id: "m7",      label: "M7 · VEREDICTO",    desc: "Veredicto final M1→M6 · Timing" },
];

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = keyof ConvictionRow;

function sortRows(rows: ConvictionRow[], key: SortKey, asc: boolean) {
  return [...rows].sort((a, b) => {
    const av = a[key] as any, bv = b[key] as any;
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScannerProPage() {
  const [universe,    setUniverse]    = useState("sp500");
  const [minBuyScore, setMinBuyScore] = useState(50);
  const [limit,       setLimit]       = useState(20);
  const [rows,        setRows]        = useState<ConvictionRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [tab,         setTab]         = useState<TabId>("resumen");
  const [sortKey,     setSortKey]     = useState<SortKey>("convictionScore");
  const [sortAsc,     setSortAsc]     = useState(false);

  async function handleAnalyze() {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch(
        `/api/scanner-pro?universe=${universe}&limit=${limit}&minBuyScore=${minBuyScore}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error del servidor");
      setRows(json.rows ?? []);
    } catch (e: any) {
      setError(e.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = sortRows(rows, sortKey, sortAsc);
  const strongBuy = rows.filter(r => r.verdict === "STRONG BUY").length;
  const buy = rows.filter(r => r.verdict === "BUY").length;

  // M6 global data (same for all tickers)
  const m6Row = rows[0];

  return (
    <div className="min-h-screen bg-bg text-text">

      {/* Intro */}
      <div className="border-b border-border px-4 sm:px-6 py-4 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-lg font-black tracking-[0.2em] text-accent">SCANNER PRO</h1>
            <span className="text-xs text-muted tracking-widest">FUNDAMENTALES × M1 · M2 · M3 · M5 · M6 · M7</span>
          </div>
          <p className="text-xs text-subtle leading-relaxed max-w-2xl">
            Filtra por score fundamental de Descuentos y valida cada acción con las 7 metodologías de opciones:
            GEX (M1), Z-Score (M2), Confluencia 3D (M3), Señal Consolidada (M5), Régimen (M6) y Veredicto Final (M7).
          </p>
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
            <span className="text-[10px] text-muted tracking-widest">SCORE MÍN.</span>
            <div className="flex gap-1">
              {[40, 50, 60, 70].map(t => (
                <button key={t} onClick={() => setMinBuyScore(t)}
                  className={`text-xs px-2.5 py-1 border transition-colors ${
                    minBuyScore === t ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-text"
                  }`}>{t}+</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted tracking-widest">TOP</span>
            <select value={limit} onChange={e => setLimit(parseInt(e.target.value))}
              className="bg-bg border border-border text-text text-xs px-2 py-1.5 focus:outline-none focus:border-accent">
              {[10, 15, 20, 25, 30].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button onClick={handleAnalyze} disabled={loading}
            className="bg-accent text-white px-5 py-1.5 text-xs font-bold tracking-widest hover:opacity-80 disabled:opacity-40 transition-opacity">
            {loading ? "ANALIZANDO..." : "ANALIZAR"}
          </button>
          {rows.length > 0 && !loading && (
            <span className="text-xs text-muted ml-auto">
              {rows.length} resultados · {strongBuy} STRONG BUY · {buy} BUY
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      {rows.length > 0 && !loading && (
        <div className="border-b border-border bg-bg overflow-x-auto">
          <div className="max-w-7xl mx-auto flex min-w-max px-4 sm:px-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-xs font-bold tracking-widest border-b-2 transition-colors shrink-0 ${
                  tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
                }`}>
                {t.label}
                <span className="hidden sm:inline text-[9px] font-normal ml-1 opacity-60">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted tracking-widest">Obteniendo M1→M7 para {limit} tickers...</p>
            <p className="text-[10px] text-muted/60">Esto puede tomar 25–40 segundos</p>
          </div>
        )}

        {error && !loading && (
          <div className="border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger rounded">{error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-20 text-muted text-sm">
            Selecciona universo y score mínimo, luego presiona ANALIZAR.
          </div>
        )}

        {sorted.length > 0 && !loading && (
          <>
            {/* ── TAB: RESUMEN ── */}
            {tab === "resumen" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b border-border bg-surface">
                    <Th label="TICKER"      sortKey="symbol"           current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="EMPRESA"     sortKey="company"          current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="GRADO"       sortKey="grade"            current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONVICCIÓN"  sortKey="convictionScore"  current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="VEREDICTO"   sortKey="verdict"          current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="BIAS M7"     sortKey="soreBias"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SCORE DESC." sortKey="buyScore"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CAÍDA 52W"   sortKey="dropFrom52w"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="VS GRAHAM"   sortKey="discountToGraham" current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="P/E"         sortKey="pe"               current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="ROE"         sortKey="roe"              current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="UPSIDE"      sortKey="upsideToTarget"   current={sortKey} asc={sortAsc} onSort={handleSort} />
                  </tr></thead>
                  <tbody>
                    {sorted.map(row => (
                      <tr key={row.symbol} className={`border-b border-border/50 hover:bg-surface/60 transition-colors ${row.verdict === "STRONG BUY" ? "border-l-2 border-l-emerald-600" : ""}`}>
                        <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                        <td className="px-3 py-2.5 text-subtle text-xs max-w-[140px] truncate">{row.company}</td>
                        <td className="px-3 py-2.5"><GradeBadge grade={row.grade} /></td>
                        <td className="px-3 py-2.5">
                          <span className={`font-black text-sm ${row.convictionScore >= 75 ? "text-emerald-400" : row.convictionScore >= 60 ? "text-green-400" : row.convictionScore >= 45 ? "text-yellow-400" : "text-gray-500"}`}>
                            {row.convictionScore.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5"><VerdictBadge verdict={row.verdict} /></td>
                        <td className="px-3 py-2.5"><BiasBadge bias={row.soreBias} noOptions={row.noOptions} /></td>
                        <td className="px-3 py-2.5 font-mono text-xs">{row.buyScore}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          <span className={row.dropFrom52w <= -20 ? "text-green-400" : "text-gray-400"}>{pct(row.dropFrom52w)}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          <span className={row.discountToGraham >= 20 ? "text-green-400" : row.discountToGraham >= 0 ? "text-yellow-400" : "text-red-400"}>{pct(row.discountToGraham)}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">{fmt(row.pe)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">{row.roe ? `${(row.roe * 100).toFixed(1)}%` : "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          <span className={row.upsideToTarget >= 20 ? "text-green-400" : "text-gray-400"}>{pct(row.upsideToTarget)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── TAB: M1 ── */}
            {tab === "m1" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b border-border bg-surface">
                    <Th label="TICKER"      sortKey="symbol"           current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PRECIO"      sortKey="currentPrice"     current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PRESIÓN M1"  sortKey="m1Pressure"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="NET GEX"     sortKey="m1NetGex"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SOPORTE M1"  sortKey="m1Support"        current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="RESIST. M1"  sortKey="m1Resistance"     current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="GAMMA FLIP"  sortKey="m1GammaFlip"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PCR"         sortKey="m1Pcr"            current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONVICCIÓN"  sortKey="convictionScore"  current={sortKey} asc={sortAsc} onSort={handleSort} />
                  </tr></thead>
                  <tbody>
                    {sorted.map(row => (
                      <tr key={row.symbol} className="border-b border-border/50 hover:bg-surface/60 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{dollar(row.currentPrice)}</td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <PressureBar value={row.m1Pressure} />}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">
                          {row.noOptions ? "—" : (row.m1NetGex / 1e9).toFixed(2) + "B"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{row.noOptions ? "—" : dollar(row.m1Support)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-red-400">{row.noOptions ? "—" : dollar(row.m1Resistance)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">{row.noOptions ? "—" : dollar(row.m1GammaFlip)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">
                          <span className={row.m1Pcr > 1 ? "text-red-400" : "text-emerald-400"}>{row.noOptions ? "—" : fmt(row.m1Pcr, 2)}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs font-bold text-accent">{row.convictionScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── TAB: M2 ── */}
            {tab === "m2" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b border-border bg-surface">
                    <Th label="TICKER"          sortKey="symbol"          current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PRECIO"          sortKey="currentPrice"    current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PRESIÓN Z (M2)"  sortKey="m2Pressure"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SOPORTE M2"      sortKey="m2Support"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="RESIST. M2"      sortKey="m2Resistance"    current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SOPORTE M1"      sortKey="m1Support"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="RESIST. M1"      sortKey="m1Resistance"    current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONVICCIÓN"      sortKey="convictionScore" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  </tr></thead>
                  <tbody>
                    {sorted.map(row => (
                      <tr key={row.symbol} className="border-b border-border/50 hover:bg-surface/60 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{dollar(row.currentPrice)}</td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <PressureBar value={row.m2Pressure * 20} />}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{row.noOptions ? "—" : dollar(row.m2Support)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-red-400">{row.noOptions ? "—" : dollar(row.m2Resistance)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">{row.noOptions ? "—" : dollar(row.m1Support)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">{row.noOptions ? "—" : dollar(row.m1Resistance)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs font-bold text-accent">{row.convictionScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── TAB: M3 ── */}
            {tab === "m3" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b border-border bg-surface">
                    <Th label="TICKER"         sortKey="symbol"           current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PRECIO"         sortKey="currentPrice"     current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONFLUENCIA M3" sortKey="m3Confluence"     current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONF. SOPORTE"  sortKey="m3SupportConf"    current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONF. RESIST."  sortKey="m3ResistanceConf" current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SOPORTE M3"     sortKey="m3Support"        current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="RESIST. M3"     sortKey="m3Resistance"     current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONVICCIÓN"     sortKey="convictionScore"  current={sortKey} asc={sortAsc} onSort={handleSort} />
                  </tr></thead>
                  <tbody>
                    {sorted.map(row => (
                      <tr key={row.symbol} className="border-b border-border/50 hover:bg-surface/60 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{dollar(row.currentPrice)}</td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <ConfBar value={row.m3Confluence} max={5} />}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <ConfBar value={row.m3SupportConf} />}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <ConfBar value={row.m3ResistanceConf} />}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{row.noOptions ? "—" : dollar(row.m3Support)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-red-400">{row.noOptions ? "—" : dollar(row.m3Resistance)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs font-bold text-accent">{row.convictionScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── TAB: M5 ── */}
            {tab === "m5" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b border-border bg-surface">
                    <Th label="TICKER"        sortKey="symbol"          current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PRECIO"        sortKey="currentPrice"    current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SCORE M5"      sortKey="m5Score"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="VEREDICTO M5"  sortKey="m5Verdict"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PROB."         sortKey="m5Probability"   current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="MAX PAIN"      sortKey="m5MaxPain"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SOPORTE M5"    sortKey="m5Support"       current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="RESIST. M5"    sortKey="m5Resistance"    current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONVICCIÓN"    sortKey="convictionScore" current={sortKey} asc={sortAsc} onSort={handleSort} />
                  </tr></thead>
                  <tbody>
                    {sorted.map(row => (
                      <tr key={row.symbol} className="border-b border-border/50 hover:bg-surface/60 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{dollar(row.currentPrice)}</td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <PressureBar value={row.m5Score} />}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <M7VerdictBadge verdict={row.m5Verdict} />}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">
                          {row.noOptions ? "—" : `${row.m5Probability.toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-subtle">{row.noOptions ? "—" : dollar(row.m5MaxPain)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{row.noOptions ? "—" : dollar(row.m5Support)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-red-400">{row.noOptions ? "—" : dollar(row.m5Resistance)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs font-bold text-accent">{row.convictionScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── TAB: M6 ── */}
            {tab === "m6" && (
              <div>
                {/* Régimen global */}
                {m6Row && (
                  <div className="mb-5 p-4 border border-border bg-surface rounded-lg flex flex-wrap gap-6 items-center">
                    <div>
                      <div className="text-[9px] text-muted tracking-widest mb-1">RÉGIMEN GLOBAL</div>
                      <RegimeBadge regime={m6Row.m6Regime} />
                    </div>
                    <div>
                      <div className="text-[9px] text-muted tracking-widest mb-1">VIX</div>
                      <span className="text-sm font-mono font-bold text-text">{m6Row.m6Vix.toFixed(2)}</span>
                      <span className="text-[10px] text-muted ml-1">{m6Row.m6VixVelocity}</span>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted tracking-widest mb-1">FEAR SCORE</div>
                      <span className={`text-sm font-mono font-bold ${m6Row.m6FearScore < 30 ? "text-red-400" : m6Row.m6FearScore > 70 ? "text-emerald-400" : "text-yellow-400"}`}>
                        {m6Row.m6FearScore.toFixed(0)}
                      </span>
                      <span className="text-[10px] text-muted ml-1">{m6Row.m6FearLabel}</span>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted tracking-widest mb-1">MULTIPLICADOR M5</div>
                      <span className={`text-sm font-mono font-bold ${m6Row.m6Multiplier >= 1 ? "text-emerald-400" : "text-red-400"}`}>×{m6Row.m6Multiplier.toFixed(2)}</span>
                    </div>
                    {m6Row.m6SignalSuspended && (
                      <div className="px-3 py-1.5 bg-red-900/60 border border-red-700 rounded text-xs text-red-300 font-bold tracking-widest">
                        SEÑALES SUSPENDIDAS
                      </div>
                    )}
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="border-b border-border bg-surface">
                      <Th label="TICKER"       sortKey="symbol"           current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="PRECIO"       sortKey="currentPrice"     current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="RÉGIMEN"      sortKey="m6Regime"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="VIX"          sortKey="m6Vix"            current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="FEAR SCORE"   sortKey="m6FearScore"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="FEAR LABEL"   sortKey="m6FearLabel"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="×MULT"        sortKey="m6Multiplier"     current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="SUSPENDIDO"   sortKey="m6SignalSuspended" current={sortKey} asc={sortAsc} onSort={handleSort} />
                      <Th label="CONVICCIÓN"   sortKey="convictionScore"  current={sortKey} asc={sortAsc} onSort={handleSort} />
                    </tr></thead>
                    <tbody>
                      {sorted.map(row => (
                        <tr key={row.symbol} className="border-b border-border/50 hover:bg-surface/60 transition-colors">
                          <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{dollar(row.currentPrice)}</td>
                          <td className="px-3 py-2.5"><RegimeBadge regime={row.m6Regime} /></td>
                          <td className="px-3 py-2.5 font-mono text-xs">{row.m6Vix.toFixed(2)}</td>
                          <td className="px-3 py-2.5">
                            <ConfBar value={row.m6FearScore} />
                          </td>
                          <td className="px-3 py-2.5 text-xs text-subtle">{row.m6FearLabel}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">
                            <span className={row.m6Multiplier >= 1 ? "text-emerald-400" : "text-red-400"}>×{row.m6Multiplier.toFixed(2)}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            {row.m6SignalSuspended
                              ? <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-700">SÍ</span>
                              : <span className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">NO</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs font-bold text-accent">{row.convictionScore.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: M7 ── */}
            {tab === "m7" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b border-border bg-surface">
                    <Th label="TICKER"        sortKey="symbol"               current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="PRECIO"        sortKey="currentPrice"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="SCORE M7"      sortKey="m7Score"              current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="VEREDICTO M7"  sortKey="m7Verdict"            current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONFIANZA"     sortKey="m7Confidence"         current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="ENTRY LONG"    sortKey="m7PrimaryLongEntry"   current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="ENTRY SHORT"   sortKey="m7PrimaryShortEntry"  current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="RÉGIMEN"       sortKey="m6Regime"             current={sortKey} asc={sortAsc} onSort={handleSort} />
                    <Th label="CONVICCIÓN"    sortKey="convictionScore"      current={sortKey} asc={sortAsc} onSort={handleSort} />
                  </tr></thead>
                  <tbody>
                    {sorted.map(row => (
                      <tr key={row.symbol} className={`border-b border-border/50 hover:bg-surface/60 transition-colors ${!row.noOptions && row.m7Verdict === "ALCISTA" ? "border-l-2 border-l-emerald-600" : row.m7Verdict === "BAJISTA" ? "border-l-2 border-l-red-700" : ""}`}>
                        <td className="px-3 py-2.5 font-bold text-accent tracking-wider">{row.symbol}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{dollar(row.currentPrice)}</td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <PressureBar value={row.m7Score} />}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <M7VerdictBadge verdict={row.m7Verdict} />}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.noOptions ? <span className="text-xs text-muted">—</span> : <ConfBar value={row.m7Confidence} />}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">
                          {row.noOptions || !row.m7PrimaryLongEntry ? "—" : dollar(row.m7PrimaryLongEntry)}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-red-400">
                          {row.noOptions || !row.m7PrimaryShortEntry ? "—" : dollar(row.m7PrimaryShortEntry)}
                        </td>
                        <td className="px-3 py-2.5"><RegimeBadge regime={row.m6Regime} /></td>
                        <td className="px-3 py-2.5 font-mono text-xs font-bold text-accent">{row.convictionScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend */}
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-muted tracking-widest border-t border-border pt-4">
              <span>CONVICCIÓN = Desc.(40%) + M7(60%) · M7 agrega M1→M6 ponderados</span>
              <span><span className="text-emerald-500">■</span> STRONG BUY ≥ 75</span>
              <span><span className="text-green-500">■</span> BUY ≥ 60</span>
              <span><span className="text-yellow-500">■</span> WATCH ≥ 45</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
