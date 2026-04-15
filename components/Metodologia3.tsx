"use client";

import { useState, useCallback, useEffect } from "react";
import type { Analysis3Result, AggStrikeData } from "@/types";
import CandlestickChart from "@/components/CandlestickChart";
import ProximityHeatmap from "@/components/ProximityHeatmap";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, ResponsiveContainer,
} from "recharts";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const fmtB = (v: number) => `${(v / 1e9).toFixed(2)}B`;

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

function buildGexSummary(
  strikes: AggStrikeData[],
  support: number,
  resistance: number,
  spot: number
): string[] {
  const supStrike = strikes.find((s) => s.strike === support);
  const resStrike = strikes.find((s) => s.strike === resistance);
  const positiveCount = strikes.filter((s) => s.totalGEX > 0).length;
  const negativeCount = strikes.filter((s) => s.totalGEX < 0).length;
  const maxPos = strikes.filter((s) => s.totalGEX > 0).reduce((a, b) => b.totalGEX > a.totalGEX ? b : a, strikes[0]);
  const maxNeg = strikes.filter((s) => s.totalGEX < 0).reduce((a, b) => b.totalGEX < a.totalGEX ? b : a, strikes[strikes.length - 1]);

  return [
    `El soporte $${support} concentra un GEX de ${supStrike ? fmtB(supStrike.totalGEX) : "N/A"}, indicando que los dealers tienen posiciones largas en gamma — absorben ventas y estabilizan el precio en esa zona.`,
    `La resistencia $${resistance} muestra GEX de ${resStrike ? fmtB(resStrike.totalGEX) : "N/A"}. GEX negativo significa dealers cortos en gamma — amplifican movimientos alcistas generando un techo dinámico.`,
    `El strike con mayor GEX positivo es $${maxPos?.strike ?? "—"} (${maxPos ? fmtB(maxPos.totalGEX) : "—"}). Es el muro de pin más fuerte: el mercado tiende a gravitar hacia este nivel al vencimiento.`,
    `El strike con mayor GEX negativo es $${maxNeg?.strike ?? "—"} (${maxNeg ? fmtB(maxNeg.totalGEX) : "—"}). Zona de aceleración: si el spot supera este nivel, el hedging de dealers amplifica el movimiento.`,
    `${positiveCount} strikes con GEX positivo vs ${negativeCount} con GEX negativo. ${positiveCount > negativeCount ? "Mayoría positiva — entorno de baja volatilidad y tendencia a comprimir el rango." : "Mayoría negativa — entorno expansivo con potencial de movimientos bruscos."}`,
  ];
}

function buildConfluenceSummary(
  strikes: AggStrikeData[],
  support: number,
  resistance: number,
  supportConfidence: number,
  resistanceConfidence: number
): string[] {
  const supStrike = strikes.find((s) => s.strike === support);
  const resStrike = strikes.find((s) => s.strike === resistance);
  const topSupports = [...strikes].filter((s) => s.confluenceScore > 0).sort((a, b) => b.confluenceScore - a.confluenceScore).slice(0, 2);
  const topResistances = [...strikes].filter((s) => s.confluenceScore < 0).sort((a, b) => a.confluenceScore - b.confluenceScore).slice(0, 2);

  return [
    `Soporte $${support} obtiene un Confluence Score de ${supStrike?.confluenceScore.toFixed(2) ?? "—"} (confianza ${supportConfidence}%). Los tres vectores Z(GEX), Z(OI) y Z(PCR) apuntan en la misma dirección — señal institucional convergente.`,
    `Resistencia $${resistance} con score ${resStrike?.confluenceScore.toFixed(2) ?? "—"} (confianza ${resistanceConfidence}%). Score mínimo indica que GEX negativo, OI elevado y PCR bajo coinciden sobre este strike.`,
    `Los 2 strikes con mayor soporte institucional son $${topSupports[0]?.strike ?? "—"} y $${topSupports[1]?.strike ?? "—"}. Cuanto más alto el score, más alineadas están las tres señales y más probable el rebote.`,
    `Los 2 strikes con mayor presión vendedora son $${topResistances[0]?.strike ?? "—"} y $${topResistances[1]?.strike ?? "—"}. Un cierre por encima de la resistencia con volumen activa el siguiente nivel como nuevo objetivo.`,
    `El Confluence Score diferencia este modelo de M1 y M2 al incorporar el Open Interest como tercer eje — los niveles con alto OI tienen mayor validez estadística independientemente del GEX.`,
  ];
}

function buildPcrSummary(
  strikes: AggStrikeData[],
  support: number,
  resistance: number,
  spot: number
): string[] {
  const supStrike = strikes.find((s) => s.strike === support);
  const resStrike = strikes.find((s) => s.strike === resistance);
  const aboveOne = strikes.filter((s) => s.weightedPCR > 1).length;
  const avgPcr = strikes.reduce((a, b) => a + b.weightedPCR, 0) / strikes.length;
  const belowSpot = strikes.filter((s) => s.strike < spot);
  const aboveSpot = strikes.filter((s) => s.strike > spot);
  const avgPcrBelow = belowSpot.length ? belowSpot.reduce((a, b) => a + b.weightedPCR, 0) / belowSpot.length : 0;
  const avgPcrAbove = aboveSpot.length ? aboveSpot.reduce((a, b) => a + b.weightedPCR, 0) / aboveSpot.length : 0;

  return [
    `El soporte $${support} tiene un PCR ponderado de ${supStrike?.weightedPCR.toFixed(2) ?? "—"}${(supStrike?.weightedPCR ?? 0) > 1 ? " — más puts que calls: los institucionales están comprando protección bajista en este strike, lo que actúa como colchón de soporte." : " — PCR bajo: menor cobertura bajista en la zona de soporte, señal mixta."}`,
    `La resistencia $${resistance} registra PCR de ${resStrike?.weightedPCR.toFixed(2) ?? "—"}${(resStrike?.weightedPCR ?? 0) < 1 ? " — más calls que puts: los institucionales especulan al alza pero sin cobertura, creando una zona de rechazo cuando el precio llega." : " — PCR elevado sobre la resistencia es inusual; validar con GEX antes de operar."}`,
    `PCR promedio por debajo del spot: ${avgPcrBelow.toFixed(2)}. PCR promedio por encima: ${avgPcrAbove.toFixed(2)}. ${avgPcrBelow > avgPcrAbove ? "Mayor cobertura bajista bajo el spot confirma estructura de soporte institucional robusta." : "Mayor cobertura bajista sobre el spot sugiere expectativa de caída — operar con cautela en rebotes."}`,
    `${aboveOne} de ${strikes.length} strikes tienen PCR > 1 (zona de cobertura). ${aboveOne > strikes.length / 2 ? "Mayoría con PCR > 1 — posicionamiento institucional defensivo, mercado cubierto al bajista." : "Mayoría con PCR < 1 — sesgo especulativo alcista predominante en la cadena de opciones."}`,
    `PCR promedio general: ${avgPcr.toFixed(2)}. ${avgPcr > 1.2 ? "Nivel elevado — posible hedging masivo; soporte tiene alta probabilidad de mantenerse." : avgPcr < 0.8 ? "Nivel bajo — optimismo extremo; resistencia puede generar rechazo fuerte por falta de cobertura." : "Nivel balanceado — mercado sin sesgo extremo, los niveles S/R son guías de probabilidad moderada."}`,
  ];
}

function ConfidenceBadge({ value }: { value: number }) {
  const color =
    value >= 75 ? "text-accent" : value >= 45 ? "text-warning" : "text-muted";
  const label =
    value >= 75 ? "ALTA" : value >= 45 ? "MEDIA" : "BAJA";
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <div className="text-5xl font-bold">{value}%</div>
      <div className="text-sm font-bold tracking-widest">{label}</div>
    </div>
  );
}

export default function Metodologia3({
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
  const [data, setData] = useState<Analysis3Result | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalysis = useCallback(async (t: string, exp: string) => {
    setLoading(true);
    setError("");
    try {
      const url = exp
        ? `/api/analysis3?ticker=${t}&expiration=${exp}`
        : `/api/analysis3?ticker=${t}`;

      const [analysisRes, chartRes] = await Promise.all([
        fetch(url),
        fetch(`/api/chart?ticker=${t}&range=3mo`),
      ]);

      const analysisJson = await analysisRes.json();
      if (!analysisRes.ok) throw new Error(analysisJson.error ?? "Error");

      const chartJson = await chartRes.json();
      setData(analysisJson);
      setCandles(chartJson.candles ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (analyzeKey > 0 && ticker) {
      fetchAnalysis(ticker, expiration);
    }
  }, [analyzeKey]);

  const candleLevels = data
    ? {
        callWall: data.resistance,
        resistance: data.resistance,
        gammaFlip: (data.support + data.resistance) / 2,
        support: data.support,
        putWall: data.support,
      }
    : null;

  return (
    <div>
      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-4 border border-danger text-danger text-sm">✕ {error}</div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-muted">
          <div className="w-20 h-20 border-2 border-border flex items-center justify-center text-4xl">◈</div>
          <p className="text-base tracking-widest">MODELO MULTI-EXPIRACIÓN — MÁXIMA CONFIABILIDAD</p>
          <p className="text-sm opacity-60">Z(GEX) + Z(OI) + Z(PCR) — modelo de confluencia de 3 dimensiones</p>
          <p className="text-sm opacity-40">SPY · QQQ · NVDA · AAPL · TSLA · MSFT · AMZN · GOOGL</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-[70vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-base text-muted tracking-widest">AGREGANDO VENCIMIENTOS...</p>
          </div>
        </div>
      )}

      {/* Dashboard */}
      {data && !loading && (
        <main className="p-6 space-y-6">

          {/* Spot */}
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="text-sm text-muted tracking-widest mb-1">SPOT PRICE</div>
              <div className="text-6xl font-bold text-muted">${data.spot.toFixed(2)}</div>
            </div>
            <div className="border-l-2 border-border pl-8">
              <div className="text-sm text-muted tracking-widest mb-1">TICKER</div>
              <div className="text-3xl font-bold text-accent">{data.ticker}</div>
              {companyName && <div className="text-xs text-muted mt-1">{companyName}</div>}
            </div>
            <div className="border-l-2 border-border pl-8">
              <div className="text-sm text-muted tracking-widest mb-1">VENCIMIENTO</div>
              <div className="text-3xl font-bold text-subtle">{data.expiration}</div>
            </div>
          </div>

          {/* Support / Resistance with confidence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-card border-t-4 border-t-accent border border-border p-6">
              <div className="text-sm text-muted tracking-widest mb-3 font-semibold">
                SOPORTE INSTITUCIONAL AGREGADO
              </div>
              <div className="text-5xl font-bold text-accent mb-3">${data.support.toFixed(2)}</div>
              <div className="text-sm text-subtle mb-4">
                {(((data.support - data.spot) / data.spot) * 100).toFixed(2)}% vs spot
              </div>
              <div className="border-t border-border pt-4">
                <div className="text-xs text-muted tracking-widest mb-2">CONFIANZA DEL NIVEL</div>
                <ConfidenceBadge value={data.supportConfidence} />
                <div className="w-full h-2 bg-surface border border-border rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${data.supportConfidence}%` }}
                  />
                </div>
              </div>
              <div className="text-xs text-muted mt-3">
                Z(GEX) + Z(OI) + Z(PCR) — confluencia máxima por debajo del spot
              </div>
            </div>

            <div className="bg-card border-t-4 border-t-danger border border-border p-6">
              <div className="text-sm text-muted tracking-widest mb-3 font-semibold">
                RESISTENCIA INSTITUCIONAL AGREGADA
              </div>
              <div className="text-5xl font-bold text-danger mb-3">${data.resistance.toFixed(2)}</div>
              <div className="text-sm text-subtle mb-4">
                +{(((data.resistance - data.spot) / data.spot) * 100).toFixed(2)}% vs spot
              </div>
              <div className="border-t border-border pt-4">
                <div className="text-xs text-muted tracking-widest mb-2">CONFIANZA DEL NIVEL</div>
                <ConfidenceBadge value={data.resistanceConfidence} />
                <div className="w-full h-2 bg-surface border border-border rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-danger rounded-full transition-all"
                    style={{ width: `${data.resistanceConfidence}%` }}
                  />
                </div>
              </div>
              <div className="text-xs text-muted mt-3">
                Z(GEX) + Z(OI) + Z(PCR) — confluencia mínima por encima del spot
              </div>
            </div>
          </div>

          {/* Candlestick */}
          {candleLevels && (
            <div className="bg-card border border-border p-6">
              <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
                PRICE ACTION — NIVELES INSTITUCIONALES AGREGADOS (3 MESES)
              </div>
              <CandlestickChart candles={candles} levels={candleLevels} spot={data.spot} />
            </div>
          )}

          {/* Aggregated GEX */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              GAMMA EXPOSURE (GEX) POR STRIKE — ±15% DEL SPOT
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.filteredStrikes} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} tickFormatter={fmtB} width={60} />
                <Tooltip
                  contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12 }}
                  formatter={(v: number) => [fmtB(v), "GEX Agregado"]}
                  labelFormatter={(l) => `Strike: $${l}`}
                />
                <ReferenceLine x={data.spot} stroke="#000" strokeWidth={2} label={{ value: "SPOT", fill: "#000", fontSize: 9 }} />
                <ReferenceLine x={data.support} stroke="#00a854" strokeDasharray="4 4" label={{ value: "SUP", fill: "#00a854", fontSize: 9 }} />
                <ReferenceLine x={data.resistance} stroke="#e53935" strokeDasharray="4 4" label={{ value: "RES", fill: "#e53935", fontSize: 9 }} />
                <ReferenceLine y={0} stroke="#ccc" />
                <Bar dataKey="totalGEX" radius={[2, 2, 0, 0]}>
                  {data.filteredStrikes.map((entry, i) => (
                    <Cell key={i} fill={entry.totalGEX >= 0 ? "#00a854" : "#e53935"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ChartSummary lines={buildGexSummary(data.filteredStrikes, data.support, data.resistance, data.spot)} />
          </div>

          {/* Confluence Score */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              CONFLUENCE SCORE — Z(GEX) + Z(OI) + Z(PCR)
            </div>
            <div className="text-xs text-muted mb-4">
              Valores altos = soporte fuerte · Valores bajos = resistencia fuerte
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.filteredStrikes} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} width={50} />
                <Tooltip
                  contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12 }}
                  formatter={(v: number) => [v.toFixed(3), "Confluence"]}
                  labelFormatter={(l) => `Strike: $${l}`}
                />
                <ReferenceLine y={0} stroke="#ccc" />
                <ReferenceLine x={data.spot} stroke="#000" strokeWidth={2} label={{ value: "SPOT", fill: "#000", fontSize: 9 }} />
                <ReferenceLine x={data.support} stroke="#00a854" strokeDasharray="4 4" label={{ value: "SUP", fill: "#00a854", fontSize: 9 }} />
                <ReferenceLine x={data.resistance} stroke="#e53935" strokeDasharray="4 4" label={{ value: "RES", fill: "#e53935", fontSize: 9 }} />
                <Bar dataKey="confluenceScore" radius={[2, 2, 0, 0]}>
                  {data.filteredStrikes.map((entry, i) => (
                    <Cell key={i} fill={entry.confluenceScore >= 0 ? "#00a854" : "#e53935"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ChartSummary lines={buildConfluenceSummary(data.filteredStrikes, data.support, data.resistance, data.supportConfidence, data.resistanceConfidence)} />
          </div>

          {/* Weighted PCR */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              PCR PONDERADO POR OI — MULTI-EXPIRACIÓN
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.filteredStrikes} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} width={50} />
                <Tooltip
                  contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12 }}
                  formatter={(v: number) => [v.toFixed(2), "PCR Ponderado"]}
                  labelFormatter={(l) => `Strike: $${l}`}
                />
                <ReferenceLine y={1} stroke="#f9a825" strokeDasharray="4 4" label={{ value: "PCR=1", fill: "#f9a825", fontSize: 9 }} />
                <ReferenceLine x={data.spot} stroke="#000" strokeWidth={2} />
                <ReferenceLine x={data.support} stroke="#00a854" strokeDasharray="4 4" />
                <ReferenceLine x={data.resistance} stroke="#e53935" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="weightedPCR" stroke="#1565c0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <ChartSummary lines={buildPcrSummary(data.filteredStrikes, data.support, data.resistance, data.spot)} />
          </div>

          {/* Proximity Heatmap */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-2 font-semibold">
              MAPA DE CALOR — PROXIMIDAD DEL SPOT A CADA STRIKE
            </div>
            <div className="text-xs text-muted mb-5">
              Intensidad del color = cercanía al precio actual · Columnas: GEX · OI · PCR · Confluence Score
            </div>
            <ProximityHeatmap
              strikes={data.filteredStrikes}
              spot={data.spot}
              support={data.support}
              resistance={data.resistance}
            />
          </div>

        </main>
      )}
    </div>
  );
}
