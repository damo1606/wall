"use client";

import { useState, useCallback, useEffect } from "react";
import type { Analysis5Result, SRLevel, SignalComponent, ScoredStrike } from "@/lib/gex5";
import type { Analysis6Result } from "@/lib/gex6";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, ResponsiveContainer,
} from "recharts";

const fmtNotional = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;

// ─── 5-line summary grid ──────────────────────────────────────────────────────
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

// ─── Summary builders ────────────────────────────────────────────────────────

function buildVerdictSummary(data: Analysis5Result): string[] {
  const strongest = [...data.signals].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  )[0];
  const strongestDir = strongest.contribution >= 0 ? "alcista" : "bajista";

  const mpDist = (((data.maxPain - data.spot) / data.spot) * 100).toFixed(1);
  const mpDir = data.maxPain > data.spot ? "arriba" : "abajo";

  const rangeStr =
    data.support && data.resistance
      ? `$${data.support.strike.toFixed(0)}–$${data.resistance.strike.toFixed(0)}`
      : "indefinido";

  return [
    `Score ${data.score >= 0 ? "+" : ""}${data.score} de 100 posibles. ${data.verdict === "ALCISTA" ? "Las señales institucionales favorecen continuación al alza — compradores dominan el posicionamiento de opciones." : data.verdict === "BAJISTA" ? "Las señales institucionales apuntan a presión bajista — los dealers están posicionados para vender en rebotes." : "Las señales se cancelan mutuamente — el mercado no tiene sesgo estructural claro en este momento."}`,
    `La señal con mayor peso en el score es ${strongest.name} (${Math.round(strongest.weight * 100)}%), apuntando ${strongestDir} con una contribución de ${strongest.contribution >= 0 ? "+" : ""}${Math.round(strongest.contribution * 100)} puntos al score final.`,
    `El Max Pain se ubica en $${data.maxPain.toFixed(2)}, un ${Math.abs(parseFloat(mpDist))}% ${mpDir} del spot actual. El precio tiende a gravitar hacia este nivel conforme se acerca el vencimiento — especialmente en la última semana.`,
    `Se analizaron ${data.expirationsAnalyzed} vencimientos simultáneamente para construir esta señal. A mayor número de vencimientos confirmando el mismo nivel, mayor es la convicción institucional del movimiento.`,
    `Rango S/R institucional detectado: ${rangeStr}. La estrategia de comprar en el soporte y vender en la resistencia tiene una probabilidad estimada de ${data.probability}% basada en el posicionamiento actual de opciones.`,
  ];
}

function buildSRSummary(data: Analysis5Result): string[] {
  const sup = data.support;
  const res = data.resistance;

  const supPct = sup ? (((sup.strike - data.spot) / data.spot) * 100).toFixed(1) : null;
  const resPct = res ? (((res.strike - data.spot) / data.spot) * 100).toFixed(2) : null;
  const range = sup && res ? (res.strike - sup.strike).toFixed(2) : null;
  const rangeRatio = sup && res && data.spot > 0
    ? (((res.strike - sup.strike) / data.spot) * 100).toFixed(1)
    : null;

  return [
    sup
      ? `Soporte en $${sup.strike.toFixed(2)} (${supPct}% bajo el spot) con confianza ${sup.confidence}%. GEX positivo en este strike indica que los dealers están largos en gamma — compran automáticamente cuando el precio cae hacia esta zona, creando un efecto de amortiguación.`
      : "Soporte no disponible — los 3 filtros (GEX Wall, Max Pain, Notional OI) no convergieron en ningún strike bajo el spot. Operar sin nivel de soporte validado implica mayor riesgo en posiciones largas.",
    res
      ? `Resistencia en $${res.strike.toFixed(2)} (+${resPct}% sobre el spot) con confianza ${res.confidence}%. GEX negativo aquí significa que los dealers son cortos en gamma — venden cuando el precio sube, amplificando el rechazo y creando un techo dinámico difícil de romper sin volumen masivo.`
      : "Resistencia no disponible — ningún strike sobre el spot superó los 3 filtros. El precio puede tener espacio libre al alza sin resistencia institucional identificada.",
    range
      ? `El rango S/R tiene una amplitud de $${range} (${rangeRatio}% del precio). ${parseFloat(rangeRatio ?? "0") < 3 ? "Rango estrecho — mercado en compresión, posible expansión de volatilidad próxima." : parseFloat(rangeRatio ?? "0") > 8 ? "Rango amplio — mayor incertidumbre institucional, stops más holgados." : "Rango normal — condiciones operativas estándar para swing dentro del canal S/R."}`
      : "Rango S/R no calculable — al menos uno de los niveles no está disponible.",
    sup
      ? `El Notional OI del soporte es ${fmtNotional(sup.notionalOI)} distribuido en ${sup.expirationsWithHighOI} vencimientos. Cuantos más vencimientos confirman el mismo strike, más institucional es el nivel — los market makers han renovado posición ahí repetidamente.`
      : "Sin datos de Notional OI para el soporte.",
    `El Max Pain del vencimiento primario es $${data.maxPain.toFixed(2)}.${sup && sup.maxPainDistancePct < 2 ? ` El soporte $${sup.strike} está a solo ${sup.maxPainDistancePct}% del Max Pain — confirma fuerte presión de pin en esa zona.` : res && res.maxPainDistancePct < 2 ? ` La resistencia $${res.strike} está a ${res.maxPainDistancePct}% del Max Pain — nivel con doble presión institucional.` : " Ningún nivel coincide directamente con el Max Pain — el mercado puede oscilar entre ellos antes del vencimiento."}`,
  ];
}

function buildSignalSummary(data: Analysis5Result): string[] {
  const [gamma, inst, pcr, conf, skew] = data.signals;

  const bullCount = data.signals.filter((s) => s.contribution > 0).length;
  const bearCount = data.signals.filter((s) => s.contribution < 0).length;

  return [
    `Gamma Regime (peso ${Math.round(gamma.weight * 100)}%): ${gamma.label}. El Gamma Flip en $${gamma.rawValue.toFixed(2)} es la línea divisoria — sobre él los dealers estabilizan el precio, bajo él lo amplifican. Esta señal define el entorno estructural del mercado.`,
    `Institutional Pressure (peso ${Math.round(inst.weight * 100)}%): ${inst.rawValue >= 0 ? "+" : ""}${inst.rawValue.toFixed(1)}% — ${inst.label}. Mide el desbalance neto del GEX entre calls y puts en términos de dólares: positivo significa que los dealers tienen mayor exposición gamma en calls que en puts.`,
    `Put/Call Ratio (peso ${Math.round(pcr.weight * 100)}%): PCR = ${pcr.rawValue.toFixed(2)} — ${pcr.label}. Un PCR bajo (< 0.7) indica que hay más calls que puts — optimismo especulativo. Un PCR alto (> 1.2) indica cobertura masiva al bajista — ya sea por miedo o posicionamiento institucional defensivo.`,
    `Confluence S/R (peso ${Math.round(conf.weight * 100)}%): balance = ${conf.rawValue >= 0 ? "+" : ""}${(conf.rawValue * 100).toFixed(0)}% — ${conf.label}. Combina el balance interno de M5 (60%) con la alineación de niveles de M2 y M3 (40%). Si los tres modelos coinciden en que el soporte está más cerca del spot que la resistencia, el sesgo alcista es estructuralmente robusto.`,
    `${bullCount} de 5 señales apuntan alcista vs ${bearCount} bajistas. IV Skew 25Δ = ${(skew.rawValue * 100).toFixed(1)}% — ${skew.label}. El skew de volatilidad revela si los institucionales están pagando más por protección bajista (puts caros) o si hay demanda de calls, lo que indica sesgo de flujo real de dinero.`,
  ];
}

function buildChartSummary(data: Analysis5Result): string[] {
  const total = data.scoredStrikes.length;
  const supStrikes = data.scoredStrikes.filter((s) => s.isSupport);
  const resStrikes = data.scoredStrikes.filter((s) => s.isResistance);
  const topSup = [...supStrikes].sort((a, b) => b.totalScore - a.totalScore)[0];
  const topRes = [...resStrikes].sort((a, b) => b.totalScore - a.totalScore)[0];
  const avgScore = total > 0
    ? (data.scoredStrikes.reduce((a, s) => a + s.totalScore, 0) / total * 100).toFixed(0)
    : "0";

  const mpStrike = total > 0
    ? data.scoredStrikes.reduce(
        (best, s) =>
          Math.abs(s.strike - data.maxPain) < Math.abs(best.strike - data.maxPain) ? s : best,
        data.scoredStrikes[0]
      )
    : null;

  return [
    `Se evaluaron ${total} strikes dentro del ±12% del spot. El score de calidad combina 3 dimensiones: GEX Wall (30%), alineación con Max Pain (35%) y Notional OI con convergencia multi-expiración (35%). Solo los strikes que superan los 3 filtros se consideran niveles operables.`,
    topSup
      ? `Mejor candidato de soporte: $${topSup.strike.toFixed(2)} con score ${Math.round(topSup.totalScore * 100)}% y ${fmtNotional(topSup.notionalOI)} en Notional OI. GEX positivo confirma que los dealers comprarán delta si el precio cae aquí — efecto de rebote mecánico por hedging.`
      : "No se identificaron candidatos de soporte que pasen los 3 filtros simultáneamente.",
    topRes
      ? `Mejor candidato de resistencia: $${topRes.strike.toFixed(2)} con score ${Math.round(topRes.totalScore * 100)}% y ${fmtNotional(topRes.notionalOI)} en Notional OI. GEX negativo implica que los dealers venderán delta si el precio sube aquí — efecto de rechazo mecánico que crea un techo difícil de romper.`
      : "No se identificaron candidatos de resistencia que pasen los 3 filtros simultáneamente.",
    mpStrike
      ? `El strike más cercano al Max Pain ($${data.maxPain.toFixed(2)}) es $${mpStrike.strike.toFixed(2)} con score ${Math.round(mpStrike.totalScore * 100)}%. El Max Pain actúa como imán gravitacional: el mercado tiende a cerrar cerca de este nivel al vencimiento porque minimiza el valor total de opciones ejercidas.`
      : `Max Pain en $${data.maxPain.toFixed(2)} — verificar alineación manual con los strikes del gráfico.`,
    `Score promedio del universo analizado: ${avgScore}%. Un promedio alto indica buena calidad general de datos — múltiples strikes con señales convergentes. Los strikes en gris no pasan el filtro de GEX direccional y no deben usarse como referencia operativa.`,
  ];
}

// ─── Score bar (-100 to +100, 0 centered) ────────────────────────────────────
function ScoreBar({ value }: { value: number }) {
  const pct = Math.min(Math.abs(value) / 2, 50);
  const isPos = value >= 0;
  return (
    <div className="relative w-full h-5 bg-surface border border-border rounded-sm overflow-hidden">
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
      <div
        className={`absolute top-1 bottom-1 rounded-sm transition-all ${isPos ? "bg-accent" : "bg-danger"}`}
        style={{ left: isPos ? "50%" : `${50 - pct}%`, width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Sub-score bar (0 to 1) ───────────────────────────────────────────────────
function SubScore({ label, value, note }: { label: string; value: number; note?: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-accent" : pct >= 45 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs text-muted w-24 tracking-wider shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-surface border border-border">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs font-bold text-subtle w-8 text-right">{pct}%</div>
      {note && <div className="text-xs text-muted">{note}</div>}
    </div>
  );
}

// ─── S/R Level card ───────────────────────────────────────────────────────────
function SRCard({ level, spot, type }: { level: SRLevel | null; spot: number; type: "support" | "resistance" }) {
  const isSupport = type === "support";
  const borderTop = isSupport ? "border-t-accent" : "border-t-danger";
  const textColor = isSupport ? "text-accent" : "text-danger";
  const barColor = isSupport ? "bg-accent" : "bg-danger";
  const title = isSupport ? "SOPORTE SÓLIDO" : "RESISTENCIA SÓLIDA";

  if (!level) {
    return (
      <div className="bg-card border-t-4 border-t-border border border-border p-6 flex flex-col items-center justify-center min-h-[220px] gap-2 text-muted">
        <div className="text-sm tracking-widest font-semibold">{title}</div>
        <div className="text-xs opacity-60 text-center">
          Nivel no disponible — los 3 filtros no convergieron
        </div>
      </div>
    );
  }

  const pctFromSpot = (((level.strike - spot) / spot) * 100).toFixed(2);
  const sign = level.strike > spot ? "+" : "";
  const confLabel = level.confidence >= 70 ? "ALTA CONFIANZA" : level.confidence >= 45 ? "MEDIA" : "BAJA";
  const confColor = level.confidence >= 70 ? textColor : level.confidence >= 45 ? "text-warning" : "text-muted";

  return (
    <div className={`bg-card border-t-4 ${borderTop} border border-border p-6`}>
      <div className="text-sm text-muted tracking-widest mb-2 font-semibold">{title}</div>
      <div className={`text-5xl font-bold mb-1 ${textColor}`}>${level.strike.toFixed(2)}</div>
      <div className="text-sm text-subtle mb-4">{sign}{pctFromSpot}% vs spot</div>
      <div className="flex items-center gap-3 mb-1">
        <div className={`text-3xl font-bold ${confColor}`}>{level.confidence}%</div>
        <div className={`text-xs tracking-widest font-bold ${confColor}`}>{confLabel}</div>
      </div>
      <div className="w-full h-1.5 bg-surface border border-border mb-4">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${level.confidence}%` }} />
      </div>
      <div className="space-y-2.5">
        <SubScore label="GEX WALL" value={level.gexScore} />
        <SubScore label="MAX PAIN" value={level.maxPainScore} note={`±${level.maxPainDistancePct}% de MP`} />
        <SubScore
          label="NOTIONAL OI"
          value={level.notionalOIScore}
          note={`${fmtNotional(level.notionalOI)} · ${level.expirationsWithHighOI} exp`}
        />
      </div>
    </div>
  );
}

// ─── Signal row ───────────────────────────────────────────────────────────────
function SignalRow({ signal }: { signal: SignalComponent }) {
  const isPos = signal.normalizedValue >= 0;
  const pct = Math.min(Math.abs(signal.normalizedValue) * 50, 50);
  const contribPts = Math.round(signal.contribution * 100);
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3 mb-1.5">
        <div className="text-xs font-bold tracking-wider text-subtle w-36 shrink-0">{signal.name}</div>
        <div className="flex-1 relative h-4 bg-surface border border-border">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
          <div
            className={`absolute top-0.5 bottom-0.5 transition-all ${isPos ? "bg-accent" : "bg-danger"}`}
            style={{ left: isPos ? "50%" : `${50 - pct}%`, width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-muted w-10 text-right shrink-0">{Math.round(signal.weight * 100)}%</div>
        <div className={`text-xs font-bold w-10 text-right shrink-0 ${contribPts >= 0 ? "text-accent" : "text-danger"}`}>
          {contribPts >= 0 ? "+" : ""}{contribPts}
        </div>
      </div>
      <div className="text-xs text-muted ml-36 pl-3 leading-relaxed">{signal.label}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Metodologia5({
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
  const [data, setData] = useState<Analysis5Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalysis = useCallback(async (t: string, exp: string) => {
    setLoading(true);
    setError("");
    try {
      const url = exp ? `/api/analysis5?ticker=${t}&upTo=${exp}` : `/api/analysis5?ticker=${t}`;
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
      fetchAnalysis(ticker, expiration);
    }
  }, [analyzeKey]);

  const verdictColor =
    data?.verdict === "ALCISTA" ? "text-accent" :
    data?.verdict === "BAJISTA" ? "text-danger" : "text-warning";

  const verdictBorderColor =
    data?.verdict === "ALCISTA" ? "border-accent" :
    data?.verdict === "BAJISTA" ? "border-danger" : "border-warning";

  return (
    <div>
      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-4 border border-danger text-danger text-sm tracking-wide">
          ✕ {error}
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-muted">
          <div className="w-20 h-20 border-2 border-border flex items-center justify-center text-4xl">◉</div>
          <p className="text-base tracking-widest">SEÑAL DIRECCIONAL CONSOLIDADA</p>
          <p className="text-sm opacity-60">GEX Wall · Max Pain · Notional OI · Score Unificado</p>
          <p className="text-sm opacity-40">SPY · QQQ · NVDA · AAPL · TSLA · MSFT · AMZN · GOOGL</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-[70vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-base text-muted tracking-widest">CONSOLIDANDO SEÑALES...</p>
          </div>
        </div>
      )}

      {/* Dashboard */}
      {data && !loading && (
        <main className="p-6 space-y-6">

          {/* ── VERDICT HERO ─────────────────────────────────────────────────── */}
          <div className={`bg-card border-2 ${verdictBorderColor} p-8`}>
            <div className="flex flex-wrap items-center gap-8 mb-6">
              <div>
                <div className="text-xs text-muted tracking-widest mb-2">SEÑAL CONSOLIDADA</div>
                <div className={`text-7xl font-black tracking-widest ${verdictColor}`}>{data.verdict}</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">PROBABILIDAD</div>
                <div className={`text-5xl font-bold ${verdictColor}`}>{data.probability}%</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">SCORE</div>
                <div className={`text-5xl font-bold ${data.score >= 0 ? "text-accent" : "text-danger"}`}>
                  {data.score >= 0 ? "+" : ""}{data.score}
                </div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">SPOT</div>
                <div className="text-3xl font-bold text-muted">${data.spot.toFixed(2)}</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">MAX PAIN</div>
                <div className="text-3xl font-bold text-subtle">${data.maxPain.toFixed(2)}</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">PUT WALL · M5</div>
                <div className="text-3xl font-bold text-accent">
                  {data.support ? `$${data.support.strike.toFixed(2)}` : "—"}
                </div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">CALL WALL · M5</div>
                <div className="text-3xl font-bold text-danger">
                  {data.resistance ? `$${data.resistance.strike.toFixed(2)}` : "—"}
                </div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">PUT WALL · M2</div>
                <div className="text-2xl font-bold text-accent">${data.m2Support.toFixed(2)}</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">CALL WALL · M2</div>
                <div className="text-2xl font-bold text-danger">${data.m2Resistance.toFixed(2)}</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">SOPORTE · M3</div>
                <div className="text-2xl font-bold text-accent">${data.m3Support.toFixed(2)}</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">RESIST. · M3</div>
                <div className="text-2xl font-bold text-danger">${data.m3Resistance.toFixed(2)}</div>
              </div>
              <div className="border-l-2 border-border pl-8">
                <div className="text-xs text-muted tracking-widest mb-1">TICKER</div>
                <div className="text-3xl font-bold text-accent">{data.ticker}</div>
                {companyName && <div className="text-xs text-muted mt-1">{companyName}</div>}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted mb-1">
                <span>−100 · BAJISTA</span>
                <span>NEUTRAL</span>
                <span>ALCISTA · +100</span>
              </div>
              <ScoreBar value={data.score} />
            </div>
            <ChartSummary lines={buildVerdictSummary(data)} />
          </div>

          {/* ── SOLID S/R LEVELS ─────────────────────────────────────────────── */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              NIVELES INSTITUCIONALES SÓLIDOS — GEX WALL + MAX PAIN + NOTIONAL OI
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <SRCard level={data.support} spot={data.spot} type="support" />
              <SRCard level={data.resistance} spot={data.spot} type="resistance" />
            </div>
            <ChartSummary lines={buildSRSummary(data)} />
          </div>

          {/* ── SIGNAL BREAKDOWN ─────────────────────────────────────────────── */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
              DESGLOSE DE SEÑALES — 5 DIMENSIONES
            </div>
            <div className="text-xs text-muted mb-1">
              Cada señal contribuye al score final con su peso relativo
            </div>
            <div className="flex justify-between text-xs text-muted mb-4 border-b border-border pb-2 mt-3">
              <span className="w-36">SEÑAL</span>
              <span className="flex-1 text-center">BAJISTA ← · → ALCISTA</span>
              <span className="w-10 text-right">PESO</span>
              <span className="w-10 text-right">+/−</span>
            </div>
            {data.signals.map((s, i) => (
              <SignalRow key={i} signal={s} />
            ))}
            <ChartSummary lines={buildSignalSummary(data)} />
          </div>

          {/* ── SCORED STRIKES CHART ─────────────────────────────────────────── */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
              CALIDAD DE NIVELES POR STRIKE — GEX WALL + MAX PAIN + NOTIONAL OI
            </div>
            <div className="text-xs text-muted mb-5">
              Verde = soporte institucional · Rojo = resistencia institucional · Gris = sin posicionamiento claro
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.scoredStrikes} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis dataKey="strike" tick={{ fill: "#555", fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis
                  tick={{ fill: "#555", fontSize: 10 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12 }}
                  formatter={(v: number, _name: string, props: any) => {
                    const entry: ScoredStrike = props.payload;
                    const tipo = entry.isSupport ? "Soporte" : entry.isResistance ? "Resistencia" : "Neutral";
                    return [`${Math.round(v * 100)}% · ${fmtNotional(entry.notionalOI)}`, tipo];
                  }}
                  labelFormatter={(l) => `Strike: $${l}`}
                />
                <ReferenceLine x={data.spot} stroke="#000" strokeWidth={2} label={{ value: "SPOT", fill: "#000", fontSize: 9 }} />
                {data.support && (
                  <ReferenceLine x={data.support.strike} stroke="#00a854" strokeDasharray="4 4" label={{ value: "SUP", fill: "#00a854", fontSize: 9 }} />
                )}
                {data.resistance && (
                  <ReferenceLine x={data.resistance.strike} stroke="#e53935" strokeDasharray="4 4" label={{ value: "RES", fill: "#e53935", fontSize: 9 }} />
                )}
                {data.maxPain > 0 && (
                  <ReferenceLine x={data.maxPain} stroke="#f9a825" strokeDasharray="2 4" label={{ value: "MP", fill: "#f9a825", fontSize: 9 }} />
                )}
                <Bar dataKey="totalScore" radius={[2, 2, 0, 0]}>
                  {data.scoredStrikes.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.isSupport ? "#00a854" : entry.isResistance ? "#e53935" : "#cccccc"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-6 mt-4 text-xs text-muted">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-accent" />
                <span>GEX+ bajo spot = soporte</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-danger" />
                <span>GEX− sobre spot = resistencia</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3" style={{ background: "#f9a825" }} />
                <span>MP = Max Pain</span>
              </div>
            </div>
            <ChartSummary lines={buildChartSummary(data)} />
          </div>

        </main>
      )}
    </div>
  );
}
