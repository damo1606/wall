"use client";

import { useState, useCallback, useEffect } from "react";
import type { Heatmap2DData } from "@/app/api/heatmap2d/route";
import GexHeatmap2D from "@/components/GexHeatmap2D";
import SkewPanel from "@/components/SkewPanel";

// ─── OI Accumulation Table ────────────────────────────────────────────────────
function OIAccumulationTable({ data }: { data: Heatmap2DData }) {
  // Aggregate callOI + putOI + gex per strike across all expirations
  const strikeMap = new Map<number, { callOI: number; putOI: number; gex: number }>();
  for (const cell of data.cells) {
    const e = strikeMap.get(cell.strike) ?? { callOI: 0, putOI: 0, gex: 0 };
    strikeMap.set(cell.strike, {
      callOI: e.callOI + cell.callOI,
      putOI:  e.putOI  + cell.putOI,
      gex:    e.gex    + cell.gex,
    });
  }

  const rows = Array.from(strikeMap.entries())
    .map(([strike, d]) => {
      const totalOI = d.callOI + d.putOI;
      const pcr = d.callOI > 0 ? d.putOI / d.callOI : 0;
      // bias: +100 = all calls (alcista), -100 = all puts (bajista)
      const bias = totalOI > 0 ? ((d.callOI - d.putOI) / totalOI) * 100 : 0;
      return { strike, callOI: d.callOI, putOI: d.putOI, totalOI, pcr, bias, gex: d.gex };
    })
    .sort((a, b) => b.strike - a.strike);

  const maxOI = rows[0]?.totalOI ?? 1;

  // Color based on bias intensity
  function rowColor(bias: number, intensity: number): string {
    const alpha = Math.round(intensity * 0.85 * 255).toString(16).padStart(2, "0");
    if (bias > 15)  return `#16a34a${alpha}`; // green — calls dominan
    if (bias < -15) return `#dc2626${alpha}`; // red   — puts dominan
    return `#6b728022`;                        // neutral
  }

  function biasLabel(bias: number): string {
    if (bias > 50)  return "CALLS FUERTES";
    if (bias > 15)  return "CALLS";
    if (bias < -50) return "PUTS FUERTES";
    if (bias < -15) return "PUTS";
    return "NEUTRAL";
  }

  function biasColor(bias: number): string {
    if (bias > 15)  return "text-accent";
    if (bias < -15) return "text-danger";
    return "text-muted";
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b-2 border-border text-left">
            <th className="py-2 px-3 text-muted tracking-wider font-semibold">STRIKE</th>
            <th className="py-2 px-3 text-muted tracking-wider font-semibold">OI TOTAL</th>
            <th className="py-2 px-3 text-accent tracking-wider font-semibold">CALLS OI</th>
            <th className="py-2 px-3 text-danger tracking-wider font-semibold">PUTS OI</th>
            <th className="py-2 px-3 text-muted tracking-wider font-semibold">PCR</th>
            <th className="py-2 px-3 text-muted tracking-wider font-semibold">ACUMULACIÓN</th>
            <th className="py-2 px-3 text-muted tracking-wider font-semibold">SESGO</th>
            <th className="py-2 px-3 text-muted tracking-wider font-semibold">GEX</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const intensity = row.totalOI / maxOI;
            const isSupport    = row.strike === data.support;
            const isResistance = row.strike === data.resistance;
            return (
              <tr
                key={row.strike}
                className="border-b border-border hover:bg-surface transition-colors"
                style={{ backgroundColor: rowColor(row.bias, intensity) }}
              >
                <td className="py-2 px-3 font-bold text-muted">
                  ${row.strike.toFixed(0)}
                  {isSupport    && <span className="ml-2 text-[9px] text-accent font-bold tracking-wider">SOPORTE</span>}
                  {isResistance && <span className="ml-2 text-[9px] text-danger font-bold tracking-wider">RESIST.</span>}
                </td>
                <td className="py-2 px-3 font-semibold text-muted">
                  {(row.totalOI / 1000).toFixed(1)}k
                </td>
                <td className="py-2 px-3 text-muted font-semibold">
                  {(row.callOI / 1000).toFixed(1)}k
                </td>
                <td className="py-2 px-3 text-muted font-semibold">
                  {(row.putOI / 1000).toFixed(1)}k
                </td>
                <td className="py-2 px-3 text-muted">
                  {row.pcr.toFixed(2)}
                </td>
                <td className="py-2 px-3">
                  {/* OI bar */}
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-3 bg-surface border border-border rounded-sm overflow-hidden">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${intensity * 100}%`,
                          backgroundColor: row.bias > 15 ? "#16a34a" : row.bias < -15 ? "#dc2626" : "#6b7280",
                        }}
                      />
                    </div>
                    <span className="text-muted">{(intensity * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className={`py-2 px-3 font-bold tracking-wider ${biasColor(row.bias)}`}>
                  {biasLabel(row.bias)}
                </td>
                <td className="py-2 px-3 font-semibold text-muted">
                  {row.gex >= 0 ? "+" : ""}${(row.gex / 1e9).toFixed(2)}B
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Metodologia4({
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
  const [data, setData] = useState<Heatmap2DData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchHeatmap = useCallback(async (t: string, exp: string) => {
    setLoading(true);
    setError("");
    try {
      const url = exp
        ? `/api/heatmap2d?ticker=${t}&upTo=${exp}`
        : `/api/heatmap2d?ticker=${t}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (analyzeKey > 0 && ticker) {
      fetchHeatmap(ticker, expiration);
    }
  }, [analyzeKey]);

  return (
    <div>
      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-4 border border-danger text-danger text-sm">✕ {error}</div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-muted">
          <div className="w-20 h-20 border-2 border-border flex items-center justify-center text-4xl">⊞</div>
          <p className="text-base tracking-widest">MAPA DE CALOR GEX 2D</p>
          <p className="text-sm opacity-60">Eje Y = strikes · Eje X = vencimientos hasta fecha seleccionada</p>
          <p className="text-sm opacity-40">Verde = soporte (GEX+) · Rojo = resistencia (GEX−) · Barra azul = OI</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-[70vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-base text-muted tracking-widest">CARGANDO VENCIMIENTOS...</p>
          </div>
        </div>
      )}

      {/* Dashboard */}
      {data && !loading && (
        <main className="p-4 sm:p-6 space-y-4 sm:space-y-6">

          {/* Header */}
          <div className="flex flex-wrap items-end gap-4 sm:gap-8">
            <div>
              <div className="text-xs text-muted tracking-widest mb-1">PRECIO SPOT</div>
              <div className="text-4xl sm:text-6xl font-bold text-muted">${data.spot.toFixed(2)}</div>
            </div>
            <div className="border-l-2 border-border pl-4 sm:pl-8">
              <div className="text-xs text-muted tracking-widest mb-1">TICKER</div>
              <div className="text-xl sm:text-3xl font-bold text-accent">{data.ticker}</div>
              {companyName && <div className="text-xs text-muted mt-1">{companyName}</div>}
            </div>
            <div className="border-l-2 border-border pl-4 sm:pl-8">
              <div className="text-xs text-muted tracking-widest mb-1">SOPORTE</div>
              <div className="text-xl sm:text-3xl font-bold text-accent">${data.support.toFixed(2)}</div>
            </div>
            <div className="border-l-2 border-border pl-4 sm:pl-8">
              <div className="text-xs text-muted tracking-widest mb-1">RESISTENCIA</div>
              <div className="text-xl sm:text-3xl font-bold text-danger">${data.resistance.toFixed(2)}</div>
            </div>
            <div className="border-l-2 border-border pl-4 sm:pl-8">
              <div className="text-xs text-muted tracking-widest mb-1">VENCIMIENTOS</div>
              <div className="text-xl sm:text-2xl font-bold text-subtle">{data.expirations.length}</div>
            </div>
          </div>

          {/* 2D Heatmap */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
              MAPA DE CALOR GEX — STRIKE × VENCIMIENTO
            </div>
            <div className="text-xs text-muted mb-5">
              Color = GEX · Barra azul = OI · Barra naranja/azul = Skew IV
            </div>
            <GexHeatmap2D data={data} />
          </div>

          {/* OI Accumulation Table */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
              ACUMULACIÓN DE OI POR STRIKE — TODOS LOS VENCIMIENTOS
            </div>
            <div className="text-xs text-muted mb-5">
              Verde = calls dominan (presión alcista) · Rojo = puts dominan (presión bajista) · Intensidad = tamaño relativo del OI
            </div>
            <OIAccumulationTable data={data} />
          </div>

          {/* Skew Panel */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
              ANÁLISIS DE SKEW — PUTS / CALLS
            </div>
            <div className="text-xs text-muted mb-5">
              Dónde están pagando más por protección · Estructura de plazos del 25Δ skew
            </div>
            <SkewPanel data={data} />
          </div>

          {/* ── RESUMEN M4 ─────────────────────────────────────────────────────── */}
          {(() => {
            let totalCallOI = 0, totalPutOI = 0;
            const strikeMap = new Map<number, number>();
            for (const cell of data.cells) {
              totalCallOI += cell.callOI;
              totalPutOI  += cell.putOI;
              strikeMap.set(cell.strike, (strikeMap.get(cell.strike) ?? 0) + cell.callOI + cell.putOI);
            }
            const topStrike = Array.from(strikeMap.entries()).sort((a, b) => b[1] - a[1])[0];
            const totalOI   = totalCallOI + totalPutOI;
            const callPct   = totalOI > 0 ? (totalCallOI / totalOI * 100) : 50;
            const putPct    = totalOI > 0 ? (totalPutOI  / totalOI * 100) : 50;
            const bias      = callPct > 55 ? "ALCISTA" : putPct > 55 ? "BAJISTA" : "NEUTRAL";
            const biasColor = bias === "ALCISTA" ? "text-accent border-accent" : bias === "BAJISTA" ? "text-danger border-danger" : "text-warning border-warning";
            return (
              <div className="bg-card border border-border p-6">
                <div className="text-sm text-muted tracking-widest mb-4 font-semibold">RESUMEN — INTERPRETACIÓN</div>
                <div className="space-y-3">
                  <div className={`border-l-4 pl-4 py-2 ${biasColor}`}>
                    <div className={`text-sm font-bold ${biasColor.split(" ")[0]}`}>
                      SESGO GLOBAL: CALLS {callPct.toFixed(0)}% · PUTS {putPct.toFixed(0)}% — {bias}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {bias === "ALCISTA"
                        ? "El open interest acumulado en calls supera al de puts en todos los vencimientos. El mercado institucional está posicionado predominantemente al alza."
                        : bias === "BAJISTA"
                        ? "El open interest en puts domina ampliamente. Los participantes institucionales están comprando protección bajista a través de múltiples vencimientos."
                        : "El open interest está distribuido equilibradamente entre calls y puts. No hay sesgo institucional claro en ninguna dirección."}
                    </div>
                  </div>
                  {topStrike && (
                    <div className="border-l-4 border-warning pl-4 py-2">
                      <div className="text-sm font-bold text-warning">
                        STRIKE DE MAYOR CONCENTRACIÓN: ${topStrike[0]}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        El strike ${topStrike[0]} acumula el mayor open interest combinado entre todos los vencimientos. Actúa como imán de precio (pin risk) y puede funcionar como soporte o resistencia magnética en el vencimiento más cercano.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </main>
      )}
    </div>
  );
}
