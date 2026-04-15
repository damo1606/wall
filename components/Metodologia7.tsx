"use client";

import { useState, useCallback, useEffect } from "react";
import type { Analysis7Result, SRCluster, TimingBlock, MethodologyContribution } from "@/lib/gex7";

// ─── ChartSummary ─────────────────────────────────────────────────────────────
function ChartSummary({ lines }: { lines: string[] }) {
  return (
    <div className="mt-5 border-t border-border pt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
      {lines.map((line, i) => (
        <div key={i} className="text-xs text-muted leading-relaxed px-2 border-l-2 border-border">
          {line}
        </div>
      ))}
    </div>
  );
}

// ─── ScoreBar −100/+100 ───────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const pct = Math.abs(score) / 2; // 0-50%
  const isPositive = score >= 0;
  return (
    <div className="w-full h-3 bg-surface rounded-full relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-px h-full bg-border z-10" />
      </div>
      <div
        className={`absolute top-0 h-full ${isPositive ? "bg-accent left-1/2" : "bg-danger right-1/2"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Contribution row ─────────────────────────────────────────────────────────
function ContributionRow({ c }: { c: MethodologyContribution }) {
  const isPositive = c.rawScore >= 0;
  const barPct = Math.abs(c.rawScore) / 2;
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-muted w-6">{c.id}</span>
          <span className="text-xs text-foreground truncate">{c.name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted">{Math.round(c.weight * 100)}%</span>
          <span className={`text-xs font-mono font-bold w-10 text-right ${isPositive ? "text-accent" : "text-danger"}`}>
            {c.rawScore > 0 ? "+" : ""}{Math.round(c.rawScore)}
          </span>
          <span className={`text-xs font-mono w-12 text-right ${c.contribution > 0 ? "text-accent" : "text-danger"}`}>
            {c.contribution > 0 ? "+" : ""}{c.contribution.toFixed(1)}pts
          </span>
        </div>
      </div>
      <div className="w-full h-1.5 bg-surface rounded-full relative overflow-hidden">
        <div className="absolute inset-0 flex items-center">
          <div className="w-px h-full bg-border mx-auto" style={{ marginLeft: "50%" }} />
        </div>
        <div
          className={`absolute top-0 h-full rounded-full ${isPositive ? "bg-accent left-1/2" : "bg-danger right-1/2"}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p className="text-xs text-muted opacity-70 leading-relaxed">{c.label}</p>
    </div>
  );
}

// ─── Calificación mini-bar ────────────────────────────────────────────────────
function CalifBar({ value }: { value: number }) {
  const color = value >= 70 ? "bg-accent" : value >= 45 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono">{value}%</span>
      <div className="w-12 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Timing signal badge ──────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: TimingBlock["signal"] }) {
  const colors: Record<string, string> = {
    ALCISTA:    "bg-accent/20 text-accent border-accent",
    BAJISTA:    "bg-danger/20 text-danger border-danger",
    NEUTRAL:    "bg-border/40 text-muted border-border",
    "NO OPERAR": "bg-danger/10 text-danger border-danger/50",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${colors[signal] ?? colors["NEUTRAL"]}`}>
      {signal}
    </span>
  );
}

// ─── Verdict color helpers ────────────────────────────────────────────────────
function verdictColor(v: string) {
  return v === "ALCISTA" ? "text-accent" : v === "BAJISTA" ? "text-danger" : "text-warning";
}
function verdictBorder(v: string) {
  return v === "ALCISTA" ? "border-accent" : v === "BAJISTA" ? "border-danger" : "border-warning";
}

// ─── PRIMARY SETUP CARD ───────────────────────────────────────────────────────
function PrimarySetupCard({
  cluster,
  type,
  spot,
}: {
  cluster: SRCluster | null;
  type: "long" | "short";
  spot: number;
}) {
  const isLong = type === "long";
  const borderColor = isLong ? "border-accent" : "border-danger";
  const textColor   = isLong ? "text-accent"   : "text-danger";
  const label       = isLong ? "PRIMARY LONG · SOPORTE INSTITUCIONAL" : "PRIMARY SHORT · RESISTENCIA INSTITUCIONAL";

  if (!cluster) {
    return (
      <div className={`bg-card border border-border border-t-4 ${borderColor} p-6 flex flex-col items-center justify-center min-h-[180px]`}>
        <p className="text-xs text-muted tracking-widest">{label}</p>
        <p className="text-sm text-muted mt-2 opacity-50">Sin nivel disponible</p>
      </div>
    );
  }

  return (
    <div className={`bg-card border border-border border-t-4 ${borderColor} p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold tracking-widest ${textColor}`}>{label}</p>
        <span className={`text-xs px-2 py-0.5 border ${borderColor} ${textColor} font-bold`}>
          {cluster.votes}/4 METODOLOGÍAS
        </span>
      </div>

      <div className={`text-5xl font-black font-mono ${textColor}`}>
        ${cluster.strike.toFixed(2)}
      </div>
      <p className="text-xs text-muted">
        {cluster.distPct > 0 ? "+" : ""}{cluster.distPct.toFixed(2)}% desde spot
      </p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <p className="text-muted">ENTRY</p>
          <p className="font-mono text-foreground">${cluster.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-muted">STOP</p>
          <p className="font-mono text-danger">${cluster.stopPrice.toFixed(2)}</p>
        </div>
        {cluster.targetPrice && (
          <div>
            <p className="text-muted">TARGET</p>
            <p className="font-mono text-accent">${cluster.targetPrice.toFixed(2)}</p>
          </div>
        )}
        {cluster.rrRatio && (
          <div>
            <p className="text-muted">R/R</p>
            <p className="font-mono text-foreground">{cluster.rrRatio}:1</p>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">CALIFICACIÓN</span>
          <CalifBar value={cluster.calificacion} />
        </div>
        <p className="text-xs text-muted">Fuentes: {cluster.sources.join(" · ")}</p>
          {cluster.historicalDays != null && (
            <p className="text-xs text-muted mt-0.5">
              Confirmado{" "}
              <span className={cluster.historicalDays >= 5 ? "text-accent font-bold" : cluster.historicalDays >= 3 ? "text-warning font-bold" : "text-muted"}>
                {cluster.historicalDays}/7 días
              </span>
            </p>
          )}
      </div>
    </div>
  );
}

// ─── Timing row (desktop table) ───────────────────────────────────────────────
function TimingRow({ block }: { block: TimingBlock }) {
  const isNoOp = block.signal === "NO OPERAR";
  return (
    <tr className={`border-b border-border text-xs ${isNoOp ? "opacity-50" : ""}`}>
      <td className="py-3 px-3 font-bold text-foreground whitespace-nowrap">{block.timeframe}</td>
      <td className="py-3 px-3"><SignalBadge signal={block.signal} /></td>
      <td className="py-3 px-3 font-mono">{block.entry ? `$${block.entry.toFixed(2)}` : "—"}</td>
      <td className="py-3 px-3 font-mono text-accent">{block.target ? `$${block.target.toFixed(2)}` : "—"}</td>
      <td className="py-3 px-3 font-mono text-danger">{block.stop ? `$${block.stop.toFixed(2)}` : "—"}</td>
      <td className="py-3 px-3 font-mono">{block.rrRatio ?? "—"}</td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: `${block.conviction}%` }} />
          </div>
          <span className="text-muted">{block.conviction}%</span>
        </div>
      </td>
      <td className="py-3 px-3 text-muted max-w-[200px] truncate">{block.basis}</td>
    </tr>
  );
}

// ─── Timing card (mobile) ─────────────────────────────────────────────────────
function TimingCard({ block }: { block: TimingBlock }) {
  return (
    <div className="bg-card border border-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-foreground">{block.timeframe}</span>
        <SignalBadge signal={block.signal} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><p className="text-muted">ENTRY</p><p className="font-mono">{block.entry ? `$${block.entry.toFixed(2)}` : "—"}</p></div>
        <div><p className="text-muted">TARGET</p><p className="font-mono text-accent">{block.target ? `$${block.target.toFixed(2)}` : "—"}</p></div>
        <div><p className="text-muted">STOP</p><p className="font-mono text-danger">{block.stop ? `$${block.stop.toFixed(2)}` : "—"}</p></div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">R/R {block.rrRatio ?? "—"} · Convicción {block.conviction}%</span>
      </div>
      <p className="text-xs text-muted opacity-70">{block.condition}</p>
    </div>
  );
}

// ─── SR Price Ladder Chart ────────────────────────────────────────────────────
function SRPriceLadder({
  srTable,
  spot,
  timingMatrix,
}: {
  srTable: SRCluster[];
  spot: number;
  timingMatrix: TimingBlock[];
}) {
  const monthly = timingMatrix.find((b) => b.timeframe === "MENSUAL");

  const allPrices: number[] = [spot, ...srTable.map((c) => c.strike)];
  if (monthly?.entry)  allPrices.push(monthly.entry);
  if (monthly?.target) allPrices.push(monthly.target);
  if (monthly?.stop)   allPrices.push(monthly.stop);

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad    = (rawMax - rawMin) * 0.08;
  const minP   = rawMin - pad;
  const maxP   = rawMax + pad;
  const range  = maxP - minP;

  const W = 600; const H = 400;
  const CL = 76;  // chart left (after labels)
  const CR = 520; // chart right (before right labels)
  const CT = 12;  // chart top
  const CB = 388; // chart bottom

  const py = (price: number) => CT + ((maxP - price) / range) * (CB - CT);
  const fmt = (p: number) => `$${p.toFixed(p >= 100 ? 0 : 2)}`;

  // Zone between monthly entry and target
  const zoneY1 = monthly?.entry  ? py(monthly.entry)  : null;
  const zoneY2 = monthly?.target ? py(monthly.target) : null;

  const lineProps = (y: number, color: string, dash?: string, width = 1.5) => ({
    x1: CL, y1: y, x2: CR, y2: y,
    stroke: color, strokeWidth: width,
    ...(dash ? { strokeDasharray: dash } : {}),
  });

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxHeight: 420 }}
        aria-label="Mapa de precios S/R mensual"
      >
        {/* Monthly zone */}
        {zoneY1 != null && zoneY2 != null && (
          <rect
            x={CL} width={CR - CL}
            y={Math.min(zoneY1, zoneY2)}
            height={Math.abs(zoneY2 - zoneY1)}
            fill={monthly?.signal === "ALCISTA" ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)"}
          />
        )}

        {/* S/R level lines */}
        {srTable.map((cl, i) => {
          const y        = py(cl.strike);
          const isSupp   = cl.type === "support";
          const color    = isSupp ? "#22c55e" : "#ef4444";
          const opacity  = 0.35 + (cl.calificacion / 100) * 0.65;
          const sw       = 1 + (cl.votes - 1) * 0.7;
          const dash     = cl.votes <= 1 ? "5,3" : undefined;
          return (
            <g key={i} opacity={opacity}>
              <line {...lineProps(y, color, dash, sw)} />
              {/* Left: strike price */}
              <text x={CL - 5} y={y + 4} textAnchor="end" fontSize={10} fill={color} fontFamily="monospace">
                {fmt(cl.strike)}
              </text>
              {/* Right: dist% + votos */}
              <text x={CR + 5} y={y + 4} textAnchor="start" fontSize={9} fill={color} fontFamily="monospace">
                {cl.distPct > 0 ? "+" : ""}{cl.distPct.toFixed(1)}% · {cl.votes}/4
              </text>
            </g>
          );
        })}

        {/* Monthly stop */}
        {monthly?.stop != null && monthly.stop > 0 && (() => {
          const y = py(monthly.stop);
          return (
            <g>
              <line {...lineProps(y, "#ef4444", "7,3")} />
              <text x={CL - 5} y={y + 4} textAnchor="end" fontSize={10} fill="#ef4444" fontFamily="monospace">{fmt(monthly.stop)}</text>
              <text x={CR + 5} y={y + 4} textAnchor="start" fontSize={9} fill="#ef4444">STOP</text>
            </g>
          );
        })()}

        {/* Monthly entry */}
        {monthly?.entry != null && monthly.entry > 0 && (() => {
          const y = py(monthly.entry);
          return (
            <g>
              <line {...lineProps(y, "#f59e0b", "7,3")} />
              <text x={CL - 5} y={y + 4} textAnchor="end" fontSize={10} fill="#f59e0b" fontFamily="monospace">{fmt(monthly.entry)}</text>
              <text x={CR + 5} y={y + 4} textAnchor="start" fontSize={9} fill="#f59e0b">ENTRY</text>
            </g>
          );
        })()}

        {/* Monthly target */}
        {monthly?.target != null && monthly.target > 0 && (() => {
          const y = py(monthly.target);
          return (
            <g>
              <line {...lineProps(y, "#4ade80", "7,3")} />
              <text x={CL - 5} y={y + 4} textAnchor="end" fontSize={10} fill="#4ade80" fontFamily="monospace">{fmt(monthly.target)}</text>
              <text x={CR + 5} y={y + 4} textAnchor="start" fontSize={9} fill="#4ade80">TARGET</text>
            </g>
          );
        })()}

        {/* Spot line — drawn last so it's on top */}
        {(() => {
          const y = py(spot);
          return (
            <g>
              <line {...lineProps(y, "#ffffff", undefined, 2)} opacity={0.9} />
              <text x={CL - 5} y={y - 5} textAnchor="end" fontSize={10} fill="#ffffff" fontWeight="bold" fontFamily="monospace">
                {fmt(spot)}
              </text>
              <text x={CR + 5} y={y - 5} textAnchor="start" fontSize={9} fill="#9ca3af">SPOT</text>
            </g>
          );
        })()}

        {/* Legend */}
        {[
          { color: "#22c55e", label: "SOPORTE",   x: CL },
          { color: "#ef4444", label: "RESIST.",   x: CL + 90 },
          { color: "#ffffff", label: "SPOT",      x: CL + 170 },
          { color: "#f59e0b", label: "ENTRY MES", x: CL + 220 },
          { color: "#4ade80", label: "TARGET MES",x: CL + 320 },
          { color: "#ef4444", label: "STOP MES",  x: CL + 430 },
        ].map(({ color, label, x }) => (
          <g key={label}>
            <rect x={x} y={H - 18} width={14} height={3} fill={color} rx={1} />
            <text x={x + 18} y={H - 12} fontSize={9} fill="#6b7280" fontFamily="sans-serif">{label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Date formatter for multi-date table ─────────────────────────────────────
function formatMultiDate(d: string) {
  const [y, m] = d.split("-");
  const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

// ─── Main component ───────────────────────────────────────────────────────────
type Data7 = Analysis7Result & { availableExpirations?: string[] };

export default function Metodologia7({
  ticker,
  expiration,
  analyzeKey,
  companyName = "",
}: {
  ticker: string;
  expiration: string;
  analyzeKey: number;
  companyName?: string;
}) {
  const [data, setData] = useState<Data7 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [multiData, setMultiData] = useState<{ date: string; result: Analysis7Result }[]>([]);
  const [multiLoading, setMultiLoading] = useState(false);

  const fetchAnalysis = useCallback(async (t: string, exp: string) => {
    setLoading(true);
    setError("");
    try {
      const url = exp
        ? `/api/analysis7?ticker=${t}&upTo=${exp}`
        : `/api/analysis7?ticker=${t}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al obtener análisis M7");
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMulti = useCallback(async (t: string, availableDates: string[]) => {
    setMultiLoading(true);
    const dates = availableDates.filter((_, i) => i % 2 === 0).slice(0, 6);
    try {
      const results = await Promise.all(
        dates.map(async (date) => {
          const res = await fetch(`/api/analysis7?ticker=${t}&upTo=${date}`);
          const json = await res.json();
          return { date, result: json as Analysis7Result };
        })
      );
      setMultiData(results);
    } catch { /* silencioso */ }
    finally { setMultiLoading(false); }
  }, []);

  useEffect(() => {
    if (analyzeKey > 0 && ticker) {
      setMultiData([]);
      fetchAnalysis(ticker, expiration);
    }
  }, [analyzeKey]);

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="mx-6 mt-4 p-4 border border-danger text-danger text-sm">{error}</div>
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!data && !loading) return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-muted">
      <div className="text-5xl">🏆</div>
      <p className="text-base tracking-widest font-bold">METODOLOGÍA 7</p>
      <p className="text-sm opacity-60">VEREDICTO FINAL CONSOLIDADO · S/R INSTITUCIONAL · TIMING MULTI-MARCO</p>
      <p className="text-xs opacity-40 mt-2">Ingresa un ticker y presiona ANALIZAR</p>
      <div className="flex gap-3 text-xs opacity-30 mt-1">
        {["SPY", "QQQ", "AAPL", "NVDA", "TSLA"].map((s) => (
          <span key={s} className="border border-border px-2 py-1">{s}</span>
        ))}
      </div>
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
      <div className="w-10 h-10 border-4 border-accent border-t-transparent animate-spin rounded-full" />
      <p className="text-sm text-muted tracking-widest">CALCULANDO VEREDICTO FINAL...</p>
      <p className="text-xs text-muted opacity-50">Agregando M1 · M2 · M3 · M5 · M6</p>
    </div>
  );

  if (!data) return null;

  const vc = verdictColor(data.finalVerdict);
  const vb = verdictBorder(data.finalVerdict);

  return (
    <main className="p-6 space-y-6">

      {/* ── SECCIÓN 1: VEREDICTO FINAL HERO ──────────────────────────────── */}
      <section className={`bg-card border-2 ${vb} p-6 sm:p-8 space-y-6`}>

        {/* Suspended banner */}
        {data.signalSuspended && (
          <div className="border border-danger bg-danger/10 text-danger text-xs p-3 flex items-start gap-2">
            <span className="font-bold shrink-0">⚠ SEÑALES GEX SUSPENDIDAS</span>
            <span>{data.suspendedReason}</span>
          </div>
        )}

        {/* Métricas principales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-muted tracking-widest mb-1">VEREDICTO FINAL</p>
            <p className={`text-4xl sm:text-5xl font-black ${vc}`}>{data.finalVerdict}</p>
          </div>
          <div>
            <p className="text-xs text-muted tracking-widest mb-1">SCORE M7</p>
            <p className={`text-4xl sm:text-5xl font-black font-mono ${vc}`}>
              {data.finalScore > 0 ? "+" : ""}{data.finalScore}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted tracking-widest mb-1">CONFIANZA</p>
            <p className="text-4xl sm:text-5xl font-black text-foreground">{data.confidence}%</p>
          </div>
          <div>
            <p className="text-xs text-muted tracking-widest mb-1">SPOT</p>
            <p className="text-4xl sm:text-5xl font-black font-mono text-foreground">${data.spot.toFixed(2)}</p>
          </div>
        </div>

        {/* Sub-métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="bg-surface p-3">
            <p className="text-xs text-muted">RÉGIMEN M6</p>
            <p className="font-bold text-foreground mt-0.5">{data.m6Regime}</p>
          </div>
          <div className="bg-surface p-3">
            <p className="text-xs text-muted">VIX · VELOCIDAD</p>
            <p className="font-bold font-mono text-foreground mt-0.5">{data.m6Vix.toFixed(1)} · {data.m6VixVelocity}</p>
          </div>
          <div className="bg-surface p-3">
            <p className="text-xs text-muted">FEAR & GREED</p>
            <p className={`font-bold mt-0.5 ${data.m6FearScore <= 40 ? "text-danger" : data.m6FearScore >= 60 ? "text-accent" : "text-warning"}`}>
              {data.m6FearScore} — {data.m6FearLabel}
            </p>
          </div>
          <div className="bg-surface p-3">
            <p className="text-xs text-muted">MULTIPLICADOR RÉGIMEN</p>
            <p className="font-bold font-mono text-foreground mt-0.5">×{data.regimeMultiplier.toFixed(1)}</p>
          </div>
        </div>

        {/* Score bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted">
            <span>BAJISTA −100</span>
            <span>NEUTRAL 0</span>
            <span>ALCISTA +100</span>
          </div>
          <ScoreBar score={data.finalScore} />
        </div>

        {/* Contribuciones por metodología */}
        <div>
          <p className="text-xs text-muted tracking-widest mb-3">CONTRIBUCIONES POR METODOLOGÍA</p>
          <div className="divide-y divide-border">
            {data.contributions.map((c) => (
              <ContributionRow key={c.id} c={c} />
            ))}
          </div>
        </div>

        <ChartSummary lines={data.summaryLines} />
      </section>

      {/* ── SECCIÓN 2: PRIMARY TRADE SETUPS ──────────────────────────────── */}
      <section>
        <p className="text-xs text-muted tracking-widest mb-3">PRIMARY TRADE SETUPS — NIVELES DE MAYOR CONVICCIÓN INSTITUCIONAL</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PrimarySetupCard cluster={data.primaryLong}  type="long"  spot={data.spot} />
          <PrimarySetupCard cluster={data.primaryShort} type="short" spot={data.spot} />
        </div>
      </section>

      {/* ── SECCIÓN 3: TABLA INSTITUCIONAL S/R ───────────────────────────── */}
      <section className="bg-card border border-border p-6">
        <p className="text-xs text-muted tracking-widest mb-4">
          TABLA INSTITUCIONAL DE SOPORTES Y RESISTENCIAS — TODOS LOS MODELOS CONSOLIDADOS
        </p>

        {data.srTable.length === 0 ? (
          <p className="text-sm text-muted">Sin niveles institucionales detectados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left py-2 px-3">STRIKE</th>
                  <th className="text-left py-2 px-3">TIPO</th>
                  <th className="text-right py-2 px-3">DIST%</th>
                  <th className="text-right py-2 px-3">PROB</th>
                  <th className="text-right py-2 px-3">VOTOS</th>
                  <th className="text-right py-2 px-3">HIST</th>
                  <th className="text-right py-2 px-3">GEX</th>
                  <th className="text-left py-2 px-3">CALIFICACIÓN</th>
                  <th className="text-left py-2 px-3">FUENTES</th>
                </tr>
              </thead>
              <tbody>
                {data.srTable.map((cluster, i) => {
                  const isPrimaryLong  = data.primaryLong?.strike  === cluster.strike && cluster.type === "support";
                  const isPrimaryShort = data.primaryShort?.strike === cluster.strike && cluster.type === "resistance";
                  const rowBg = cluster.type === "support"
                    ? "bg-accent/5 hover:bg-accent/10"
                    : "bg-danger/5 hover:bg-danger/10";
                  return (
                    <tr key={i} className={`border-b border-border transition-colors ${rowBg}`}>
                      <td className="py-2 px-3 font-mono font-bold">
                        ${cluster.strike.toFixed(2)}
                        {isPrimaryLong  && <span className="ml-2 text-accent font-bold">LONG ★</span>}
                        {isPrimaryShort && <span className="ml-2 text-danger font-bold">SHORT ★</span>}
                      </td>
                      <td className={`py-2 px-3 font-bold ${cluster.type === "support" ? "text-accent" : "text-danger"}`}>
                        {cluster.type === "support" ? "SOPORTE" : "RESIST."}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono ${cluster.distPct < 0 ? "text-accent" : "text-danger"}`}>
                        {cluster.distPct > 0 ? "+" : ""}{cluster.distPct.toFixed(2)}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{cluster.probability}%</td>
                      <td className="py-2 px-3 text-right font-mono">{cluster.votes}/4</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {cluster.historicalDays != null ? (
                          <span className={
                            cluster.historicalDays >= 5 ? "text-accent font-bold" :
                            cluster.historicalDays >= 3 ? "text-warning" : "text-muted"
                          }>
                            {cluster.historicalDays}/7
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted">{(cluster.gexWeight * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3"><CalifBar value={cluster.calificacion} /></td>
                      <td className="py-2 px-3 text-muted">{cluster.sources.join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── SECCIÓN 3.5: MAPA DE PRECIOS S/R MENSUAL ─────────────────────── */}
      {data.srTable.length > 0 && (
        <section className="bg-card border border-border p-6">
          <p className="text-xs text-muted tracking-widest mb-4">
            MAPA DE PRECIOS — S/R INSTITUCIONAL · OBJETIVO MENSUAL
          </p>
          <SRPriceLadder
            srTable={data.srTable}
            spot={data.spot}
            timingMatrix={data.timingMatrix}
          />
          {(() => {
            const m = data.timingMatrix.find((b) => b.timeframe === "MENSUAL");
            if (!m || m.signal === "NO OPERAR") return null;
            return (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted border-t border-border pt-3">
                <span>MARCO MENSUAL · <span className={m.signal === "ALCISTA" ? "text-accent font-bold" : "text-danger font-bold"}>{m.signal}</span></span>
                {m.entry  && <span>ENTRY <span className="font-mono text-warning">${m.entry.toFixed(2)}</span></span>}
                {m.target && <span>TARGET <span className="font-mono text-accent">${m.target.toFixed(2)}</span></span>}
                {m.stop   && <span>STOP <span className="font-mono text-danger">${m.stop.toFixed(2)}</span></span>}
                {m.rrRatio && <span>R/R <span className="font-mono text-foreground">{m.rrRatio}</span></span>}
                <span>CONVICTION <span className="font-mono">{m.conviction}%</span></span>
              </div>
            );
          })()}
        </section>
      )}

      {/* ── SECCIÓN 4: TIMING MATRIX ─────────────────────────────────────── */}
      <section className="bg-card border border-border p-6">
        <p className="text-xs text-muted tracking-widest mb-4">
          TIMING MULTI-MARCO — ENTRADA · OBJETIVO · STOP · R/R
        </p>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="text-left py-2 px-3">MARCO</th>
                <th className="text-left py-2 px-3">SEÑAL</th>
                <th className="text-left py-2 px-3">ENTRY</th>
                <th className="text-left py-2 px-3">TARGET</th>
                <th className="text-left py-2 px-3">STOP</th>
                <th className="text-left py-2 px-3">R/R</th>
                <th className="text-left py-2 px-3">CONVICTION</th>
                <th className="text-left py-2 px-3">BASE</th>
              </tr>
            </thead>
            <tbody>
              {data.timingMatrix.map((block) => (
                <TimingRow key={block.timeframe} block={block} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-3">
          {data.timingMatrix.map((block) => (
            <TimingCard key={block.timeframe} block={block} />
          ))}
        </div>

        {/* Condiciones detalladas */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.timingMatrix.map((block) => (
            <div key={block.timeframe} className="text-xs text-muted border-l-2 border-border pl-3">
              <span className="font-bold text-foreground">{block.timeframe}</span>
              {" — "}{block.condition}
            </div>
          ))}
        </div>
      </section>

      {/* ── SECCIÓN 5: RESUMEN FINAL ──────────────────────────────────────── */}
      <section className="bg-card border border-border p-6">
        <p className="text-xs text-muted tracking-widest mb-2">
          RESUMEN FINAL — ANÁLISIS INSTITUCIONAL COMPLETO · {data.ticker} · ${data.spot.toFixed(2)}
        </p>
        <ChartSummary lines={data.summaryLines} />
      </section>

      {/* ── SECCIÓN 6: ANÁLISIS MULTI-EXPIRY ─────────────────────────────── */}
      <section className="bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted tracking-widest">
            ANÁLISIS MULTI-EXPIRY — SENSIBILIDAD POR HORIZONTE DE VENCIMIENTO
          </p>
          {multiData.length === 0 && !multiLoading && (
            <button
              onClick={() => fetchMulti(data.ticker, data.availableExpirations ?? [])}
              className="text-xs border border-accent text-accent px-3 py-1 hover:bg-accent/10 transition-colors"
            >
              CARGAR MULTIFECHAS
            </button>
          )}
        </div>

        {multiLoading && (
          <div className="flex items-center gap-3 py-4 text-muted">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent animate-spin rounded-full" />
            <span className="text-xs">Calculando {(data.availableExpirations ?? []).filter((_, i) => i % 2 === 0).slice(0, 6).length} cortes de expiración...</span>
          </div>
        )}

        {multiData.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="text-left py-2 px-3">CORTE</th>
                    <th className="text-right py-2 px-3">SCORE</th>
                    <th className="text-left py-2 px-3 w-32">BARRA</th>
                    <th className="text-left py-2 px-3">VEREDICTO</th>
                    <th className="text-right py-2 px-3">CONF</th>
                    <th className="text-right py-2 px-3">SUP</th>
                    <th className="text-right py-2 px-3">RES</th>
                  </tr>
                </thead>
                <tbody>
                  {multiData.map(({ date, result: r }) => (
                    <tr key={date} className="border-b border-border hover:bg-surface/50 transition-colors">
                      <td className="py-2 px-3 font-mono font-bold text-foreground">{formatMultiDate(date)}</td>
                      <td className={`py-2 px-3 text-right font-mono font-bold ${r.finalScore >= 0 ? "text-accent" : "text-danger"}`}>
                        {r.finalScore > 0 ? "+" : ""}{r.finalScore}
                      </td>
                      <td className="py-2 px-3">
                        <ScoreBar score={r.finalScore} />
                      </td>
                      <td className="py-2 px-3">
                        <span className={`font-bold text-xs ${verdictColor(r.finalVerdict)}`}>{r.finalVerdict}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted">{r.confidence}%</td>
                      <td className="py-2 px-3 text-right font-mono text-accent">
                        {r.primaryLong ? `$${r.primaryLong.strike.toFixed(0)}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-danger">
                        {r.primaryShort ? `$${r.primaryShort.strike.toFixed(0)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {multiData.map(({ date, result: r }) => (
                <div key={date} className="border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-foreground">{formatMultiDate(date)}</span>
                    <span className={`font-bold text-xs ${verdictColor(r.finalVerdict)}`}>{r.finalVerdict}</span>
                  </div>
                  <ScoreBar score={r.finalScore} />
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted">SCORE</p>
                      <p className={`font-mono font-bold ${r.finalScore >= 0 ? "text-accent" : "text-danger"}`}>
                        {r.finalScore > 0 ? "+" : ""}{r.finalScore}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">SUP</p>
                      <p className="font-mono text-accent">{r.primaryLong ? `$${r.primaryLong.strike.toFixed(0)}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted">RES</p>
                      <p className="font-mono text-danger">{r.primaryShort ? `$${r.primaryShort.strike.toFixed(0)}` : "—"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

    </main>
  );
}
