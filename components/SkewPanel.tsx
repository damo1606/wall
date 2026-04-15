"use client";

import type { Heatmap2DData } from "@/app/api/heatmap2d/route";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, ResponsiveContainer,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortExp(exp: string): string {
  const d = new Date(exp + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

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

// ─── Summary builders ─────────────────────────────────────────────────────────

function buildStrikeSkewSummary(
  strikeSkew: { strike: number; skew: number }[],
  support: number,
  resistance: number,
  spot: number
): string[] {
  const sorted     = [...strikeSkew].sort((a, b) => a.skew - b.skew);
  const mostNeg    = sorted[0];
  const mostPos    = sorted[sorted.length - 1];
  const negCount   = strikeSkew.filter((s) => s.skew < 0).length;
  const posCount   = strikeSkew.filter((s) => s.skew > 0).length;
  const supSkew    = strikeSkew.find((s) => s.strike === support);
  const resSkew    = strikeSkew.find((s) => s.strike === resistance);
  const avgSkew    = strikeSkew.reduce((a, b) => a + b.skew, 0) / strikeSkew.length;

  return [
    `El strike $${mostNeg?.strike ?? "—"} tiene el skew más negativo (${mostNeg ? pct(mostNeg.skew) : "—"}): los institucionales están pagando la prima más alta por puts ahí — es el nivel con mayor cobertura bajista activa en toda la cadena.`,
    `El soporte $${support} muestra un skew de ${supSkew ? pct(supSkew.skew) : "—"}. ${(supSkew?.skew ?? 0) < -0.02 ? "Skew negativo confirmado: los fondos tienen puts comprados en ese nivel — refuerza la validez del soporte." : "Skew moderado en el soporte — la cobertura es menor de lo esperado, validar con GEX y OI antes de operar."}`,
    `La resistencia $${resistance} registra un skew de ${resSkew ? pct(resSkew.skew) : "—"}. ${(resSkew?.skew ?? 0) > 0 ? "Calls más caros que puts: demanda de exposición alcista en la resistencia — posible ruptura si hay catalizador." : "Puts siguen dominando en la resistencia — el mercado no anticipa ruptura alcista inminente."}`,
    `${negCount} de ${strikeSkew.length} strikes tienen skew negativo (puts más caros). ${negCount / strikeSkew.length > 0.7 ? "Mayoría bajista — posicionamiento defensivo generalizado en toda la cadena." : negCount / strikeSkew.length > 0.5 ? "Ligero sesgo bajista — cobertura selectiva, no pánico generalizado." : "Equilibrio entre puts y calls — mercado sin sesgo extremo en ninguna dirección."}`,
    `Skew promedio de la cadena: ${pct(avgSkew)}. ${avgSkew < -0.04 ? "Nivel elevado de miedo — prima de riesgo bajista muy alta, opcionales costosas para comprar protección." : avgSkew < -0.02 ? "Nivel normal de skew — cobertura institucional rutinaria sin señales de alerta extrema." : "Skew bajo — mercado complaciente, los fondos están pagando poco por protección, posible señal contraria."}`,
  ];
}

function buildTermStructureSummary(
  termStructure: { exp: string; skew25d: number }[],
  expirations: string[]
): string[] {
  const sorted     = [...termStructure].sort((a, b) => a.skew25d - b.skew25d);
  const mostFear   = sorted[0];
  const leastFear  = sorted[sorted.length - 1];
  const avgSkew    = termStructure.reduce((a, b) => a + b.skew25d, 0) / termStructure.length;
  const firstSkew  = termStructure[0];
  const lastSkew   = termStructure[termStructure.length - 1];
  const isInverted = firstSkew && lastSkew && firstSkew.skew25d < lastSkew.skew25d;

  return [
    `La fecha ${mostFear?.exp ?? "—"} concentra el mayor miedo institucional con un 25Δ skew de ${mostFear ? pct(mostFear.skew25d) : "—"}. Los fondos están pagando la prima más alta por puts OTM para ese vencimiento — identifica una fecha de riesgo clave en el calendario.`,
    `La fecha ${leastFear?.exp ?? "—"} es la más tranquila (skew ${leastFear ? pct(leastFear.skew25d) : "—"}). Menor demanda de protección hacia ese vencimiento — las opciones son relativamente baratas y el mercado percibe menos riesgo.`,
    `${isInverted ? "La estructura está invertida: el skew es más negativo en los vencimientos cercanos que en los lejanos — señal de miedo de corto plazo, posible evento inmediato (FOMC, earnings, datos macro)." : "La estructura es normal: el skew se profundiza a medida que avanza el tiempo — los fondos compran protección de largo plazo de forma rutinaria."}`,
    `Skew 25Δ promedio entre todos los vencimientos: ${pct(avgSkew)}. ${avgSkew < -0.05 ? "Prima de miedo elevada — entorno de alta incertidumbre, los hedge funds están pagando caro para cubrirse en múltiples fechas simultáneamente." : avgSkew < -0.02 ? "Prima moderada — posicionamiento defensivo normal, sin señales de estrés sistémico." : "Prima baja — complacencia generalizada en toda la curva de tiempo, históricamente precede a movimientos bruscos."}`,
    `Con ${expirations.length} vencimientos analizados, la estructura de plazos revela la distribución temporal del riesgo percibido. Un salto abrupto en el skew entre dos fechas consecutivas indica que el mercado anticipa un evento específico entre esas fechas.`,
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SkewPanel({ data }: { data: Heatmap2DData }) {
  const { cells, expirations, skew25d, spot, support, resistance } = data;

  // ── 1. Per-strike skew (avg across all loaded expirations) ──────────────────
  const strikeMap = new Map<number, { sum: number; count: number }>();
  for (const c of cells) {
    if (c.skew === 0) continue;
    const prev = strikeMap.get(c.strike) ?? { sum: 0, count: 0 };
    strikeMap.set(c.strike, { sum: prev.sum + c.skew, count: prev.count + 1 });
  }

  const strikeSkew = Array.from(strikeMap.entries())
    .map(([strike, { sum, count }]) => ({ strike, skew: sum / count }))
    .sort((a, b) => a.strike - b.strike);

  // ── 2. 25Δ term structure ────────────────────────────────────────────────────
  const termStructure = expirations.map((exp) => ({
    exp: shortExp(exp),
    skew25d: skew25d?.[exp] ?? 0,
  }));

  // ── 3. Top tables ────────────────────────────────────────────────────────────
  const topPutSkew  = [...strikeSkew].sort((a, b) => a.skew - b.skew).slice(0, 5);
  const topCallSkew = [...strikeSkew].sort((a, b) => b.skew - a.skew).slice(0, 5);

  return (
    <div className="space-y-6">

      {/* ── Tablas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <div className="border border-border bg-card p-4">
          <div className="text-xs font-bold tracking-widest text-muted mb-3">
            PUTS MÁS CAROS — COBERTURA BAJISTA ACTIVA
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left pb-1">STRIKE</th>
                <th className="text-right pb-1">SKEW (IV put − call)</th>
                <th className="text-right pb-1">NIVEL</th>
              </tr>
            </thead>
            <tbody>
              {topPutSkew.map((row) => (
                <tr key={row.strike} className="border-b border-border last:border-0">
                  <td className="py-1 font-bold text-muted">${row.strike}</td>
                  <td className="py-1 text-right font-bold" style={{ color: "#e65100" }}>{pct(row.skew)}</td>
                  <td className="py-1 text-right text-muted">
                    {row.strike === support ? "SUP ▼" : row.strike === resistance ? "RES ▲" : Math.abs(row.strike - spot) < 0.5 ? "SPOT" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-muted mt-3 leading-relaxed">
            Strikes donde los institucionales pagan más por puts. Mayor skew negativo = mayor demanda de cobertura = nivel más relevante para soporte.
          </div>
        </div>

        <div className="border border-border bg-card p-4">
          <div className="text-xs font-bold tracking-widest text-muted mb-3">
            CALLS MÁS CAROS — SESGO ALCISTA / RUPTURA
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left pb-1">STRIKE</th>
                <th className="text-right pb-1">SKEW (IV call − put)</th>
                <th className="text-right pb-1">NIVEL</th>
              </tr>
            </thead>
            <tbody>
              {topCallSkew.map((row) => (
                <tr key={row.strike} className="border-b border-border last:border-0">
                  <td className="py-1 font-bold text-muted">${row.strike}</td>
                  <td className="py-1 text-right font-bold" style={{ color: "#1565c0" }}>+{pct(Math.abs(row.skew))}</td>
                  <td className="py-1 text-right text-muted">
                    {row.strike === support ? "SUP ▼" : row.strike === resistance ? "RES ▲" : Math.abs(row.strike - spot) < 0.5 ? "SPOT" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-muted mt-3 leading-relaxed">
            Strikes donde los calls son más caros que los puts. Inusual — indica demanda de exposición alcista o expectativa de ruptura en esa zona.
          </div>
        </div>
      </div>

      {/* ── Gráfico 1: Skew por strike ── */}
      <div className="border border-border bg-card p-5">
        <div className="text-xs font-bold tracking-widest text-muted mb-1">
          SKEW POR STRIKE — IV PUT − IV CALL (PROMEDIO ENTRE VENCIMIENTOS)
        </div>
        <div className="text-[11px] text-muted mb-4">
          Barras naranjas = puts más caros · Barras azules = calls más caros
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={strikeSkew} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
            <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 9 }} tickFormatter={(v) => `$${v}`} />
            <YAxis tick={{ fill: "#555", fontSize: 9 }} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} width={52} />
            <Tooltip
              contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 11 }}
              formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "Skew IV put − call"]}
              labelFormatter={(l) => `Strike: $${l}`}
            />
            <ReferenceLine y={0} stroke="#bbb" />
            <ReferenceLine x={spot} stroke="#000" strokeWidth={2} label={{ value: "SPOT", fill: "#000", fontSize: 8 }} />
            <ReferenceLine x={support} stroke="#00a854" strokeDasharray="4 4" label={{ value: "SUP", fill: "#00a854", fontSize: 8 }} />
            <ReferenceLine x={resistance} stroke="#e53935" strokeDasharray="4 4" label={{ value: "RES", fill: "#e53935", fontSize: 8 }} />
            <Bar dataKey="skew" radius={[2, 2, 0, 0]}>
              {strikeSkew.map((entry, i) => (
                <Cell key={i} fill={entry.skew < 0 ? "#e65100" : "#1565c0"} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <ChartSummary lines={buildStrikeSkewSummary(strikeSkew, support, resistance, spot)} />
      </div>

      {/* ── Gráfico 2: Term structure 25Δ ── */}
      <div className="border border-border bg-card p-5">
        <div className="text-xs font-bold tracking-widest text-muted mb-1">
          ESTRUCTURA DE PLAZOS — 25Δ SKEW POR VENCIMIENTO
        </div>
        <div className="text-[11px] text-muted mb-4">
          Más negativo = mayor miedo institucional hacia esa fecha
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={termStructure} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
            <XAxis dataKey="exp" tick={{ fill: "#555", fontSize: 9 }} />
            <YAxis tick={{ fill: "#555", fontSize: 9 }} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} width={52} />
            <Tooltip
              contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 11 }}
              formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "25Δ Skew"]}
            />
            <ReferenceLine y={0} stroke="#bbb" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="skew25d"
              stroke="#e65100"
              strokeWidth={2}
              dot={{ fill: "#e65100", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <ChartSummary lines={buildTermStructureSummary(termStructure, expirations)} />
      </div>

    </div>
  );
}
