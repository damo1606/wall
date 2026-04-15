"use client";

import { useState, useCallback, useEffect } from "react";
import type { Analysis2Result } from "@/types";
import CandlestickChart from "@/components/CandlestickChart";
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

export default function Metodologia2({
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
  const [data, setData] = useState<Analysis2Result | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalysis = useCallback(async (t: string, exp: string) => {
    setLoading(true);
    setError("");
    try {
      const url = exp
        ? `/api/analysis2?ticker=${t}&expiration=${exp}`
        : `/api/analysis2?ticker=${t}`;

      const [analysisRes, chartRes] = await Promise.all([
        fetch(url),
        fetch(`/api/chart?ticker=${t}&range=5mo`),
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
      {error && (
        <div className="mx-6 mt-4 p-4 border border-danger text-danger text-sm">✕ {error}</div>
      )}

      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-muted">
          <div className="w-20 h-20 border-2 border-border flex items-center justify-center text-4xl">◈</div>
          <p className="text-base tracking-widest">ENTER ANY US TICKER AND CLICK ANALYZE</p>
          <p className="text-sm opacity-60">SPY · QQQ · NVDA · AAPL · TSLA · MSFT · AMZN · GOOGL · META · AMD</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-[70vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-base text-muted tracking-widest">FETCHING OPTIONS DATA...</p>
          </div>
        </div>
      )}

      {data && !loading && (
        <main className="p-6 space-y-6">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-card border-t-4 border-t-accent border border-border p-6">
              <div className="text-sm text-muted tracking-widest mb-2 font-semibold">SOPORTE INSTITUCIONAL</div>
              <div className="text-5xl font-bold text-accent">${data.support.toFixed(2)}</div>
              <div className="text-sm text-subtle mt-2">
                {(((data.support - data.spot) / data.spot) * 100).toFixed(2)}% vs spot
              </div>
              <div className="text-xs text-muted mt-2">
                Strike con mayor presión institucional — GEX positivo + PCR &gt; 1
              </div>
            </div>
            <div className="bg-card border-t-4 border-t-danger border border-border p-6">
              <div className="text-sm text-muted tracking-widest mb-2 font-semibold">RESISTENCIA INSTITUCIONAL</div>
              <div className="text-5xl font-bold text-danger">${data.resistance.toFixed(2)}</div>
              <div className="text-sm text-subtle mt-2">
                +{(((data.resistance - data.spot) / data.spot) * 100).toFixed(2)}% vs spot
              </div>
              <div className="text-xs text-muted mt-2">
                Strike con menor presión institucional — GEX negativo + PCR &lt; 1
              </div>
            </div>
          </div>

          {candleLevels && (
            <div className="bg-card border border-border p-6">
              <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
                PRICE ACTION — VELAS JAPONESAS + NIVELES INSTITUCIONALES (5 MESES)
              </div>
              <CandlestickChart candles={candles} levels={candleLevels} spot={data.spot} />
            </div>
          )}

          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              GAMMA EXPOSURE (GEX) POR STRIKE — ±10% DEL SPOT
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.filteredStrikes} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} tickFormatter={fmtB} width={60} />
                <Tooltip
                  contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12 }}
                  formatter={(v: number) => [fmtB(v), "Total GEX"]}
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
            <ChartSummary lines={[
              `GEX positivo (verde) = dealers largos gamma en ese strike → compran delta cuando el precio cae. Actúa como soporte mecánico. GEX negativo (rojo) = dealers cortos gamma → amplifican movimientos.`,
              `Soporte en $${data.support.toFixed(2)}: strike con mayor GEX positivo en el vencimiento analizado. Los dealers tienen la mayor cantidad de calls vendidas aquí — su cobertura estabiliza el precio.`,
              `Resistencia en $${data.resistance.toFixed(2)}: strike con mayor presión gamma negativa. Los dealers están cortos en gamma aquí — cuando el precio llega, el hedging amplifica el movimiento en lugar de frenarlo.`,
              "La distribución del GEX define el mapa de fuerzas del mercado. Zonas con muchas barras verdes seguidas = canal de compresión. Zonas alternas de verde/rojo = mercado errático con pocos niveles claros.",
              `Rango analizado: ±10% del spot ($${data.spot.toFixed(2)}). Strikes fuera de este rango tienen delta muy bajo y su GEX tiene menor impacto en el precio a corto plazo.`,
            ]} />
          </div>

          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              PUT / CALL RATIO POR STRIKE
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.filteredStrikes} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} width={50} />
                <Tooltip
                  contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12 }}
                  formatter={(v: number) => [v.toFixed(2), "PCR"]}
                  labelFormatter={(l) => `Strike: $${l}`}
                />
                <ReferenceLine y={1} stroke="#f9a825" strokeDasharray="4 4" label={{ value: "PCR=1", fill: "#f9a825", fontSize: 9 }} />
                <ReferenceLine x={data.spot} stroke="#000" strokeWidth={2} />
                <ReferenceLine x={data.support} stroke="#00a854" strokeDasharray="4 4" />
                <ReferenceLine x={data.resistance} stroke="#e53935" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="pcr" stroke="#1565c0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <ChartSummary lines={[
              "PCR (Put/Call Ratio) por strike = open interest en puts dividido entre open interest en calls. Un PCR > 1 indica que hay más puts que calls en ese strike — señal de cobertura bajista institucional.",
              "PCR > 1.2 en strikes bajo el spot = institucionales comprando protección bajista → el soporte está bien respaldado por hedging. PCR < 0.8 en strikes bajo el spot = poca cobertura → soporte más frágil.",
              "PCR > 1 en strikes sobre el spot es inusual. Puede indicar posicionamiento bajista anticipado o cobertura de posiciones largas. Este tipo de configuración refuerza la resistencia en esa zona.",
              `La línea naranja en PCR=1 es el equilibrio neutro. Strikes con PCR alejados de 1 tienen posicionamiento institucional claro. En el soporte $${data.support.toFixed(2)} y la resistencia $${data.resistance.toFixed(2)}, el PCR confirma o contradice el GEX.`,
              "Combina este gráfico con el de GEX: si un strike tiene GEX positivo Y PCR > 1, la convergencia de ambas señales hace al soporte mucho más robusto que cuando solo una de las dos métricas lo indica.",
            ]} />
          </div>

          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              INSTITUTIONAL PRESSURE SCORE — Z(GEX) + Z(PCR)
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.filteredStrikes} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} width={50} />
                <Tooltip
                  contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12 }}
                  formatter={(v: number) => [v.toFixed(2), "Pressure"]}
                  labelFormatter={(l) => `Strike: $${l}`}
                />
                <ReferenceLine y={0} stroke="#ccc" />
                <ReferenceLine x={data.spot} stroke="#000" strokeWidth={2} label={{ value: "SPOT", fill: "#000", fontSize: 9 }} />
                <ReferenceLine x={data.support} stroke="#00a854" strokeDasharray="4 4" label={{ value: "SUP", fill: "#00a854", fontSize: 9 }} />
                <ReferenceLine x={data.resistance} stroke="#e53935" strokeDasharray="4 4" label={{ value: "RES", fill: "#e53935", fontSize: 9 }} />
                <Bar dataKey="institutionalPressure" radius={[2, 2, 0, 0]}>
                  {data.filteredStrikes.map((entry, i) => (
                    <Cell key={i} fill={entry.institutionalPressure >= 0 ? "#00a854" : "#e53935"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ChartSummary lines={[
              "El Institutional Pressure Score combina Z(GEX) + Z(PCR) en una sola métrica estandarizada. Z-score normaliza ambas señales para que sean comparables entre sí. Un score alto positivo = confluencia de soporte institucional.",
              "Score positivo (verde): GEX positivo Y PCR > 1 convergen. Los dealers tienen exposición gamma larga y además hay más puts que calls — doble señal de soporte institucional en ese strike.",
              "Score negativo (rojo): GEX negativo Y/O PCR bajo convergen. Los dealers amplifican movimientos bajistas y hay escasa cobertura de puts — zona de debilidad estructural.",
              `El soporte institucional ($${data.support.toFixed(2)}) es el strike con el mayor score positivo: máxima confluencia de GEX+ y PCR>1. La resistencia ($${data.resistance.toFixed(2)}) es el strike con el menor score (más negativo).`,
              "Este modelo supera a mirar GEX o PCR por separado porque la normalización Z elimina el ruido de magnitud. Un strike con GEX moderado y PCR muy alto puede tener mayor score que uno con GEX enorme y PCR bajo.",
            ]} />
          </div>

          {/* ── RESUMEN M2 ─────────────────────────────────────────────────────── */}
          {(() => {
            const rangeAmp = (data.resistance - data.support) / data.spot * 100;
            const posInRange = data.resistance > data.support
              ? (data.spot - data.support) / (data.resistance - data.support) * 100
              : 50;
            const midIdx = Math.floor(data.filteredStrikes.length / 2);
            const lastPCR = data.filteredStrikes[midIdx]?.pcr ?? 1;
            const pcrSignal = lastPCR > 1.2 ? "BAJISTA" : lastPCR < 0.8 ? "ALCISTA" : "NEUTRAL";
            const pcrColor  = lastPCR > 1.2 ? "text-danger border-danger" : lastPCR < 0.8 ? "text-accent border-accent" : "text-warning border-warning";
            const rangeColor = posInRange > 70 ? "text-danger border-danger" : posInRange < 30 ? "text-accent border-accent" : "text-warning border-warning";
            return (
              <div className="bg-card border border-border p-6">
                <div className="text-sm text-muted tracking-widest mb-4 font-semibold">RESUMEN — INTERPRETACIÓN</div>
                <div className="space-y-3">
                  <div className={`border-l-4 pl-4 py-2 ${rangeColor}`}>
                    <div className={`text-sm font-bold ${rangeColor.split(" ")[0]}`}>
                      POSICIÓN EN RANGO: {posInRange.toFixed(0)}% · AMPLITUD {rangeAmp.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {posInRange > 70
                        ? `Spot cerca de la resistencia ($${data.resistance.toFixed(2)}). El precio está en la parte alta del rango de opciones — probabilidad de rechazo o consolidación.`
                        : posInRange < 30
                        ? `Spot cerca del soporte ($${data.support.toFixed(2)}). El precio está en la parte baja del rango — zona con potencial rebote institucional.`
                        : `Spot en zona media del rango ($${data.support.toFixed(2)} – $${data.resistance.toFixed(2)}). Sin presión clara desde ninguno de los extremos.`}
                    </div>
                  </div>
                  <div className={`border-l-4 pl-4 py-2 ${pcrColor}`}>
                    <div className={`text-sm font-bold ${pcrColor.split(" ")[0]}`}>
                      PCR (PUT/CALL RATIO): {lastPCR.toFixed(2)} — SESGO {pcrSignal}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {lastPCR > 1.2
                        ? "El volumen de puts supera ampliamente al de calls. El mercado está comprando protección bajista — señal de precaución."
                        : lastPCR < 0.8
                        ? "El volumen de calls supera al de puts. Los participantes están posicionándose al alza con más agresividad."
                        : "El ratio puts/calls está en zona neutral. Sin sesgo direccional claro en el posicionamiento de opciones."}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </main>
      )}
    </div>
  );
}
