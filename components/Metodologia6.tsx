"use client";

import { useState, useEffect } from "react";
import type { Analysis6Result, RegimeSignal, RegimeType, FearLabel, FearComponent } from "@/lib/gex6";
import type { Analysis5Result } from "@/lib/gex5";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function regimeColor(regime: RegimeType): string {
  switch (regime) {
    case "COMPRESIÓN":      return "text-accent";
    case "TRANSICIÓN":      return "text-warning";
    case "EXPANSIÓN":       return "text-orange-500";
    case "PÁNICO AGUDO":    return "text-danger";
    case "CRISIS SISTÉMICA":return "text-danger";
  }
}

function regimeBorder(regime: RegimeType): string {
  switch (regime) {
    case "COMPRESIÓN":      return "border-accent";
    case "TRANSICIÓN":      return "border-warning";
    case "EXPANSIÓN":       return "border-orange-500";
    case "PÁNICO AGUDO":    return "border-danger";
    case "CRISIS SISTÉMICA":return "border-danger";
  }
}

function regimeBg(regime: RegimeType): string {
  switch (regime) {
    case "COMPRESIÓN":      return "bg-accent";
    case "TRANSICIÓN":      return "bg-warning";
    case "EXPANSIÓN":       return "bg-orange-500";
    case "PÁNICO AGUDO":    return "bg-danger";
    case "CRISIS SISTÉMICA":return "bg-danger";
  }
}

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

// ─── Fear & Greed gauge ───────────────────────────────────────────────────────
function fearColor(score: number): string {
  if (score <= 20) return "text-danger";
  if (score <= 40) return "text-orange-500";
  if (score <= 60) return "text-warning";
  if (score <= 80) return "text-accent";
  return "text-accent";
}

function fearBgColor(score: number): string {
  if (score <= 20) return "bg-danger";
  if (score <= 40) return "bg-orange-500";
  if (score <= 60) return "bg-warning";
  return "bg-accent";
}

function FearGauge({ score, label, components }: { score: number; label: FearLabel; components: FearComponent[] }) {
  const pct = score;
  const color = fearColor(score);
  const bgColor = fearBgColor(score);

  return (
    <div>
      {/* Score + label */}
      <div className="flex items-end gap-4 mb-4">
        <div className={`text-7xl font-black ${color}`}>{score}</div>
        <div className="mb-2">
          <div className={`text-xl font-black tracking-widest ${color}`}>{label}</div>
          <div className="text-xs text-muted tracking-widest">0 = MIEDO EXTREMO · 100 = CODICIA EXTREMA</div>
        </div>
      </div>

      {/* Main bar */}
      <div className="relative w-full h-6 bg-surface border border-border rounded-sm overflow-hidden mb-2">
        {/* Gradient zones */}
        <div className="absolute inset-0 flex">
          <div className="h-full bg-danger opacity-30"     style={{ width: "20%" }} />
          <div className="h-full bg-orange-500 opacity-25" style={{ width: "20%" }} />
          <div className="h-full bg-warning opacity-20"    style={{ width: "20%" }} />
          <div className="h-full bg-accent opacity-15"     style={{ width: "20%" }} />
          <div className="h-full bg-accent opacity-25"     style={{ width: "20%" }} />
        </div>
        {/* Needle */}
        <div
          className={`absolute top-1 bottom-1 w-1.5 rounded-sm ${bgColor} z-10 -translate-x-1/2 transition-all`}
          style={{ left: `${pct}%` }}
        />
      </div>

      {/* Zone labels */}
      <div className="flex justify-between text-[10px] text-muted mb-5">
        <span>MIEDO EXTREMO</span>
        <span>MIEDO</span>
        <span>NEUTRAL</span>
        <span>CODICIA</span>
        <span>CODICIA EXTREMA</span>
      </div>

      {/* Component breakdown */}
      <div className="space-y-2">
        {components.map((c) => {
          const cBg = fearBgColor(c.score);
          return (
            <div key={c.name} className="flex items-center gap-3">
              <div className="text-[10px] text-muted tracking-wider w-32 shrink-0">{c.name}</div>
              <div className="flex-1 h-2 bg-surface border border-border">
                <div className={`h-full ${cBg} transition-all`} style={{ width: `${c.score}%` }} />
              </div>
              <div className={`text-xs font-bold w-8 text-right shrink-0 ${fearColor(c.score)}`}>{c.score}</div>
              <div className="text-[10px] text-muted flex-1 hidden sm:block">{c.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── VIX gauge ────────────────────────────────────────────────────────────────
function VixGauge({ vix }: { vix: number }) {
  // Map VIX 0-60 to 0-100%
  const pct = Math.min((vix / 60) * 100, 100);
  const color =
    vix < 15 ? "bg-accent" :
    vix < 20 ? "bg-accent" :
    vix < 25 ? "bg-warning" :
    vix < 35 ? "bg-orange-500" : "bg-danger";

  const zones = [
    { label: "15", pct: 25 },
    { label: "20", pct: 33 },
    { label: "25", pct: 42 },
    { label: "35", pct: 58 },
    { label: "50", pct: 83 },
  ];

  return (
    <div className="mt-3">
      <div className="relative w-full h-6 bg-surface border border-border rounded-sm overflow-hidden">
        {/* Zone bands */}
        <div className="absolute inset-0 flex">
          <div className="h-full bg-accent opacity-10" style={{ width: "25%" }} />
          <div className="h-full bg-accent opacity-10" style={{ width: "8%" }} />
          <div className="h-full bg-warning opacity-10" style={{ width: "9%" }} />
          <div className="h-full bg-orange-500 opacity-10" style={{ width: "16%" }} />
          <div className="h-full bg-danger opacity-10" style={{ flex: 1 }} />
        </div>
        {/* Fill */}
        <div
          className={`absolute left-0 top-1 bottom-1 rounded-sm transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
        {/* Marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-card z-10"
          style={{ left: `${pct}%` }}
        />
      </div>
      {/* Labels */}
      <div className="relative h-4 mt-1">
        {zones.map((z) => (
          <span
            key={z.label}
            className="absolute text-[9px] text-muted -translate-x-1/2"
            style={{ left: `${z.pct}%` }}
          >
            {z.label}
          </span>
        ))}
        <span className="absolute right-0 text-[9px] text-muted">60</span>
      </div>
    </div>
  );
}

// ─── Signal row ───────────────────────────────────────────────────────────────
function SignalRow({ signal }: { signal: RegimeSignal }) {
  // For regime: positive = compression (green), negative = expansion (red)
  const isPos = signal.normalizedScore >= 0;
  const pct = Math.min(Math.abs(signal.normalizedScore) * 50, 50);
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
        <div className={`text-xs font-bold w-12 text-right shrink-0 ${contribPts >= 0 ? "text-accent" : "text-danger"}`}>
          {contribPts >= 0 ? "+" : ""}{contribPts}
        </div>
      </div>
      <div className="text-xs text-muted ml-36 pl-3 leading-relaxed">{signal.label}</div>
    </div>
  );
}

// ─── Summary builders ─────────────────────────────────────────────────────────

function buildRegimeSummary(d: Analysis6Result): string[] {
  const velocityMap: Record<string, string> = {
    "ACELERANDO":    "subiendo con fuerza — posible evento de pánico en desarrollo",
    "SUBIENDO":      "en tendencia alcista — régimen transitando hacia expansión",
    "ESTABLE":       "estable — sin presión de volatilidad relevante",
    "BAJANDO":       "en descenso — mercado recuperando calma tras un pico",
    "DESACELERANDO": "cayendo con fuerza — compresión post-pánico, posible oportunidad",
  };

  return [
    `Régimen ${d.regime} detectado con score ${(d.regimeScore * 100).toFixed(0)} puntos. ${d.signalSuspended ? "Las señales de GEX están SUSPENDIDAS — los modelos de opciones pierden validez en este entorno." : `El multiplicador sobre M5 es ×${d.m5Multiplier} — ${d.regime === "COMPRESIÓN" ? "las señales de GEX son altamente confiables" : d.regime === "EXPANSIÓN" ? "los niveles S/R se rompen con mayor frecuencia" : "confiabilidad moderada"}.`}`,
    `VIX en ${d.vix.toFixed(1)}, ${velocityMap[d.vixVelocity] ?? "sin cambios relevantes"}. La velocidad del VIX (+${d.vixChange5d.toFixed(1)}% en 5 días / ${d.vixChange1d >= 0 ? "+" : ""}${d.vixChange1d.toFixed(1)}% hoy) es tan importante como el nivel — un VIX subiendo 40% en días señala pánico aunque el nivel aún sea moderado.`,
    `Estructura de plazos VIX/VIX3M = ${d.vixRatio.toFixed(2)}. ${d.vixRatio < 1 ? "Contango: el mercado anticipa que la volatilidad bajará — entorno favorable para estrategias de venta de opciones." : "Backwardation: el mercado paga más por protección inmediata que a 3 meses — señal de stress que invalida parte del análisis GEX."}`,
    `SPY GEX total: ${d.spyGexTotal >= 0 ? "+" : ""}$${(d.spyGexTotal / 1e9).toFixed(1)}B. ${d.spyGexTotal > 0 ? "Los dealers de SPY están largos gamma — compran en caídas y venden en subidas, actuando como estabilizadores del mercado general." : "Los dealers de SPY están cortos gamma — deben comprar cuando el mercado sube y vender cuando cae, amplificando los movimientos en ambas direcciones."}`,
    `PCR de SPY = ${d.spyPcr.toFixed(2)}. ${d.m5AdjustmentLabel} Este ajuste es crítico: en COMPRESIÓN los soportes aguantan más; en EXPANSIÓN los niveles se rompen con un spread más amplio y stops más generosos son necesarios.`,
  ];
}

function buildSignalDetailSummary(d: Analysis6Result): string[] {
  const bullCount = d.signals.filter((s) => s.normalizedScore > 0).length;
  const compression = d.regime === "COMPRESIÓN" || d.regime === "TRANSICIÓN";

  return [
    `El VIX es la señal dominante (peso 35%) porque define el entorno estructural del mercado. Cuando el VIX está bajo, los market makers pueden hedgear sus posiciones con precisión — los modelos de GEX funcionan bien. Cuando sube, el costo del hedge se dispara y los dealers reducen su actividad de market making.`,
    `La estructura de plazos (25%) captura la "forma" del miedo. Un VIX/VIX3M > 1.0 significa que el mercado tiene más miedo de las próximas semanas que de los próximos meses — señal típica de un evento de corto plazo o pánico puntual, no una crisis de largo plazo.`,
    `El GEX de SPY (30%) es la señal más directa sobre el comportamiento de los dealers en el mercado general. Un SPY en gamma positivo actúa como un "amortiguador" global — cualquier ticker del índice se beneficia de este entorno de estabilización mecánica.`,
    `El PCR de SPY (10%) complementa el GEX mostrando el flujo de dinero institucional. Un PCR > 1.5 en SPY es una señal de cobertura masiva — aunque el GEX sea positivo, los institucionales están pagando por protección bajista a nivel macro.`,
    `${bullCount}/4 señales apuntan a compresión. ${compression ? "Entorno favorable para operar niveles GEX con mayor confianza — los soportes tienden a mantenerse y las resistencias a frenar el movimiento." : "Entorno de expansión — considerar posiciones más pequeñas, stops más amplios y esperar confirmación antes de entrar en los niveles GEX."}`,
  ];
}

// ─── Brief builder ────────────────────────────────────────────────────────────
function buildBrief(d5: Analysis5Result, d6: Analysis6Result) {
  const adjustedScore = Math.round(d5.score * d6.m5Multiplier);
  const entry  = d5.support?.strike ?? null;
  const target = d5.resistance?.strike ?? null;

  // Stop: tighter in compression, wider in expansion
  const stopBuffer =
    d6.regime === "COMPRESIÓN" ? 0.005 :
    d6.regime === "TRANSICIÓN" ? 0.008 : 0.012;
  const stop = entry ? parseFloat((entry * (1 - stopBuffer)).toFixed(2)) : null;

  const risk   = entry && stop   ? entry - stop         : null;
  const reward = entry && target ? target - entry       : null;
  const rr     = risk && reward && risk > 0 ? (reward / risk).toFixed(1) : null;

  // Convergence: how many of M2, M3, M5 supports are within 1.5% of each other
  const supRef = entry;
  let convergence = 0;
  if (supRef) {
    if (Math.abs(d5.m2Support - supRef) / supRef < 0.015) convergence++;
    if (Math.abs(d5.m3Support - supRef) / supRef < 0.015) convergence++;
    convergence++; // M5 always counts
  }

  // Adjusted verdict
  let adjustedVerdict: string;
  if (d6.signalSuspended) {
    adjustedVerdict = "NO OPERAR";
  } else if (adjustedScore > 25) {
    adjustedVerdict = "ALCISTA";
  } else if (adjustedScore < -25) {
    adjustedVerdict = "BAJISTA";
  } else {
    adjustedVerdict = "NEUTRAL";
  }

  // Entry condition
  const condition =
    d6.signalSuspended
      ? "Esperar normalización del VIX antes de operar con modelos de GEX"
      : d5.verdict === "ALCISTA" && d6.regime === "COMPRESIÓN"
      ? "Comprar en toque del soporte · Confirmar con vela de reversión"
      : d5.verdict === "ALCISTA" && d6.regime === "EXPANSIÓN"
      ? "Esperar consolidación sobre soporte · Stops más amplios por régimen expansivo"
      : d5.verdict === "BAJISTA" && d6.regime === "COMPRESIÓN"
      ? "Vender en toque de resistencia · Confirmar rechazo con volumen"
      : d5.verdict === "BAJISTA" && d6.regime === "EXPANSIÓN"
      ? "Esperar ruptura bajo soporte con volumen · Evitar rebotes en régimen expansivo"
      : "Esperar ruptura de S/R con volumen confirmado antes de tomar posición";

  return { adjustedScore, adjustedVerdict, entry, target, stop, rr, convergence, condition };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Metodologia6({
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
  const [data, setData]     = useState<Analysis6Result | null>(null);
  const [data5, setData5]   = useState<Analysis5Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  async function fetchAll() {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    try {
      const url5 = expiration
        ? `/api/analysis5?ticker=${ticker}&upTo=${expiration}`
        : `/api/analysis5?ticker=${ticker}`;
      const [res6, res5] = await Promise.all([
        fetch(`/api/analysis6?ticker=${encodeURIComponent(ticker)}`),
        fetch(url5),
      ]);
      const json6 = await res6.json();
      if (!res6.ok) throw new Error(json6.error ?? "Error");
      setData(json6);
      if (res5.ok) {
        const json5 = await res5.json();
        setData5(json5);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (analyzeKey > 0 && ticker) {
      fetchAll();
    }
  }, [analyzeKey]);

  const regime = data?.regime;
  const color  = regime ? regimeColor(regime) : "text-muted";
  const border = regime ? regimeBorder(regime) : "border-border";
  const bg     = regime ? regimeBg(regime) : "bg-muted";

  return (
    <div>
      {error && (
        <div className="mx-6 mt-4 p-4 border border-danger text-danger text-sm">✕ {error}</div>
      )}

      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4 text-muted">
          <div className="w-20 h-20 border-2 border-border flex items-center justify-center text-4xl">⊛</div>
          <p className="text-base tracking-widest">RÉGIMEN DE MERCADO</p>
          <p className="text-sm opacity-60">VIX · VIX3M · SPY GEX · SPY PCR · Velocidad</p>
          <p className="text-sm opacity-40">COMPRESIÓN · TRANSICIÓN · EXPANSIÓN · PÁNICO · CRISIS</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-[70vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-base text-muted tracking-widest">ANALIZANDO RÉGIMEN...</p>
          </div>
        </div>
      )}

      {data && !loading && (
        <main className="p-4 sm:p-6 space-y-4 sm:space-y-6">

          {/* ── REGIME HERO ──────────────────────────────────────────────────── */}
          <div className={`bg-card border-2 ${border} p-4 sm:p-8`}>

            {/* Signal suspended banner */}
            {data.signalSuspended && (
              <div className="bg-danger text-white px-3 py-2 mb-4 text-xs font-bold tracking-widest flex items-center gap-2">
                <span>⚠</span>
                <span>SEÑALES GEX SUSPENDIDAS — {data.suspendedReason}</span>
              </div>
            )}

            {/* Top: regime + VIX as 2-col grid on mobile */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-4 sm:gap-8 mb-6">
              <div className="col-span-2 sm:col-span-1">
                <div className="text-[10px] text-muted tracking-widest mb-1">RÉGIMEN DE MERCADO</div>
                <div className={`text-2xl sm:text-5xl font-black tracking-widest ${color}`}>{data.regime}</div>
                {companyName && ticker && (
                  <div className="text-xs text-muted mt-1">{ticker} · {companyName}</div>
                )}
              </div>
              <div className="sm:border-l-2 sm:border-border sm:pl-8">
                <div className="text-[10px] text-muted tracking-widest mb-1">VIX</div>
                <div className={`text-3xl sm:text-5xl font-bold ${color}`}>{data.vix.toFixed(1)}</div>
              </div>
              <div className="sm:border-l-2 sm:border-border sm:pl-8">
                <div className="text-[10px] text-muted tracking-widest mb-1">VIX 3M</div>
                <div className="text-2xl sm:text-3xl font-bold text-subtle">{data.vix3m.toFixed(1)}</div>
              </div>
              <div className="sm:border-l-2 sm:border-border sm:pl-8">
                <div className="text-[10px] text-muted tracking-widest mb-1">VIX/VIX3M</div>
                <div className={`text-2xl sm:text-3xl font-bold ${data.vixRatio > 1 ? "text-danger" : "text-accent"}`}>
                  {data.vixRatio.toFixed(2)}
                </div>
              </div>
              <div className="sm:border-l-2 sm:border-border sm:pl-8">
                <div className="text-[10px] text-muted tracking-widest mb-1">CAMBIO 1D</div>
                <div className={`text-2xl sm:text-3xl font-bold ${data.vixChange1d >= 0 ? "text-danger" : "text-accent"}`}>
                  {data.vixChange1d >= 0 ? "+" : ""}{data.vixChange1d.toFixed(1)}%
                </div>
              </div>
              <div className="sm:border-l-2 sm:border-border sm:pl-8">
                <div className="text-[10px] text-muted tracking-widest mb-1">CAMBIO 5D</div>
                <div className={`text-2xl sm:text-3xl font-bold ${data.vixChange5d >= 0 ? "text-danger" : "text-accent"}`}>
                  {data.vixChange5d >= 0 ? "+" : ""}{data.vixChange5d.toFixed(1)}%
                </div>
              </div>
              <div className="sm:border-l-2 sm:border-border sm:pl-8">
                <div className="text-[10px] text-muted tracking-widest mb-1">VELOCIDAD</div>
                <div className={`text-base sm:text-xl font-bold tracking-wider ${data.vixVelocity === "ACELERANDO" ? "text-danger" : data.vixVelocity === "DESACELERANDO" ? "text-accent" : "text-subtle"}`}>
                  {data.vixVelocity}
                </div>
              </div>
            </div>

            {/* VIX Gauge */}
            <div>
              <div className="flex justify-between text-[10px] text-muted mb-1">
                <span>0 · CALMA</span>
                <span className="hidden sm:block">COMPRESIÓN → TRANSICIÓN → EXPANSIÓN → PÁNICO → CRISIS</span>
                <span>60+</span>
              </div>
              <VixGauge vix={data.vix} />
            </div>

            <ChartSummary lines={buildRegimeSummary(data)} />
          </div>

          {/* ── SPY METRICS ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-card border border-border p-6">
              <div className="text-xs text-muted tracking-widest mb-2 font-semibold">SPY SPOT</div>
              <div className="text-4xl font-bold text-muted">${data.spySpot.toFixed(2)}</div>
              <div className="text-xs text-muted mt-2">Precio de referencia del índice</div>
            </div>
            <div className={`bg-card border border-border p-6 border-t-4 ${data.spyGexTotal >= 0 ? "border-t-accent" : "border-t-danger"}`}>
              <div className="text-xs text-muted tracking-widest mb-2 font-semibold">SPY GEX TOTAL</div>
              <div className={`text-4xl font-bold ${data.spyGexTotal >= 0 ? "text-accent" : "text-danger"}`}>
                {data.spyGexTotal >= 0 ? "+" : ""}${(data.spyGexTotal / 1e9).toFixed(1)}B
              </div>
              <div className="text-xs text-muted mt-2">
                {data.spyGexTotal >= 0
                  ? "Dealers largos gamma — entorno amortiguado"
                  : "Dealers cortos gamma — entorno amplificado"}
              </div>
            </div>
            <div className="bg-card border border-border p-6">
              <div className="text-xs text-muted tracking-widest mb-2 font-semibold">SPY PCR</div>
              <div className={`text-4xl font-bold ${data.spyPcr > 1.2 ? "text-danger" : data.spyPcr < 0.7 ? "text-accent" : "text-warning"}`}>
                {data.spyPcr.toFixed(2)}
              </div>
              <div className="text-xs text-muted mt-2">
                {data.spyPcr > 1.5 ? "Hedging masivo institucional" :
                 data.spyPcr > 1.2 ? "Cobertura bajista elevada" :
                 data.spyPcr < 0.7 ? "Complacencia especulativa" : "Posicionamiento equilibrado"}
              </div>
            </div>
          </div>

          {/* ── FEAR & GREED SCORE ───────────────────────────────────────────── */}
          <div className={`bg-card border-2 p-6 ${data.fearScore <= 20 ? "border-danger" : data.fearScore <= 40 ? "border-orange-500" : data.fearScore <= 60 ? "border-warning" : "border-accent"}`}>
            <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
              SORE FEAR & GREED SCORE
            </div>
            <div className="text-xs text-muted mb-5">
              VIX · Term Structure · GEX · PCR · Crédito (HYG) · SPY vs SMA50
            </div>
            <FearGauge score={data.fearScore} label={data.fearLabel} components={data.fearComponents} />
          </div>

          {/* ── SIGNAL BREAKDOWN ─────────────────────────────────────────────── */}
          <div className="bg-card border border-border p-6">
            <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
              SEÑALES DE RÉGIMEN — 4 DIMENSIONES
            </div>
            <div className="text-xs text-muted mb-1">
              Verde = compresión (señales GEX confiables) · Rojo = expansión (señales GEX menos fiables)
            </div>
            <div className="flex justify-between text-xs text-muted mb-4 border-b border-border pb-2 mt-3">
              <span className="w-36">SEÑAL</span>
              <span className="flex-1 text-center">EXPANSIÓN ← · → COMPRESIÓN</span>
              <span className="w-10 text-right">PESO</span>
              <span className="w-12 text-right">+/−</span>
            </div>
            {data.signals.map((s, i) => (
              <SignalRow key={i} signal={s} />
            ))}
            <ChartSummary lines={buildSignalDetailSummary(data)} />
          </div>

          {/* ── INDICADORES ADELANTADOS ──────────────────────────────────────── */}
          {data.leadIndicators && data.leadIndicators.length > 0 && (
            <div className="bg-card border border-border p-6">
              <div className="text-sm text-muted tracking-widest mb-1 font-semibold">
                INDICADORES ADELANTADOS — HIGH BETA
              </div>
              <div className="text-xs text-muted mb-5">
                Tickers de alta beta que suelen anticipar cambios en volatilidad antes que el VIX
              </div>

              <div className="space-y-3">
                {data.leadIndicators.map((ind) => {
                  const signalColor =
                    ind.signal === "ESTRÉS"       ? "text-danger border-danger" :
                    ind.signal === "RECUPERACIÓN" ? "text-accent border-accent" :
                                                    "text-warning border-warning";
                  const signalBg =
                    ind.signal === "ESTRÉS"       ? "bg-danger/10" :
                    ind.signal === "RECUPERACIÓN" ? "bg-accent/10" :
                                                    "bg-warning/10";
                  const change5dColor = ind.change5d >= 0 ? "text-accent" : "text-danger";
                  const change1dColor = ind.change1d >= 0 ? "text-accent" : "text-danger";

                  return (
                    <div key={ind.symbol} className="border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Symbol + price */}
                      <div className="w-24 shrink-0">
                        <div className="text-sm font-black tracking-widest text-accent">{ind.symbol}</div>
                        <div className="text-xs font-mono text-muted">${ind.spot.toFixed(2)}</div>
                      </div>

                      {/* Changes */}
                      <div className="flex gap-6 shrink-0">
                        <div>
                          <div className="text-[10px] text-muted tracking-widest">1D</div>
                          <div className={`text-sm font-bold font-mono ${change1dColor}`}>
                            {ind.change1d >= 0 ? "+" : ""}{ind.change1d.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted tracking-widest">5D</div>
                          <div className={`text-sm font-bold font-mono ${change5dColor}`}>
                            {ind.change5d >= 0 ? "+" : ""}{ind.change5d.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted tracking-widest">GEX</div>
                          <div className={`text-sm font-bold ${ind.gexSign === "POSITIVO" ? "text-accent" : "text-danger"}`}>
                            {ind.gexSign === "POSITIVO" ? "▲ POS" : "▼ NEG"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted tracking-widest">PCR</div>
                          <div className={`text-sm font-bold font-mono ${ind.pcr > 1.2 ? "text-danger" : ind.pcr < 0.8 ? "text-accent" : "text-warning"}`}>
                            {ind.pcr.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Signal badge */}
                      <div className={`shrink-0 border px-3 py-1 text-xs font-black tracking-widest ${signalColor} ${signalBg}`}>
                        {ind.signal === "ESTRÉS" ? "⚠ ESTRÉS" : ind.signal === "RECUPERACIÓN" ? "↑ RECUPERACIÓN" : "— NEUTRO"}
                      </div>

                      {/* Note */}
                      <div className="text-xs text-muted flex-1">{ind.leadNote}</div>
                    </div>
                  );
                })}
              </div>

              {/* Consolidated signal */}
              {(() => {
                const stress = data.leadIndicators.filter((i) => i.signal === "ESTRÉS").length;
                const recovery = data.leadIndicators.filter((i) => i.signal === "RECUPERACIÓN").length;
                const total = data.leadIndicators.length;
                if (stress >= 2) return (
                  <div className="mt-4 border-l-4 border-danger pl-4 py-2 text-sm text-danger font-semibold">
                    ⚠ {stress}/{total} indicadores en ESTRÉS — señal adelantada de presión sobre el mercado. El VIX puede no reflejarlo aún.
                  </div>
                );
                if (recovery >= 2) return (
                  <div className="mt-4 border-l-4 border-accent pl-4 py-2 text-sm text-accent font-semibold">
                    ↑ {recovery}/{total} indicadores en RECUPERACIÓN — el apetito de riesgo está volviendo antes que el VIX lo confirme.
                  </div>
                );
                return (
                  <div className="mt-4 border-l-4 border-warning pl-4 py-2 text-sm text-warning">
                    Sin señal adelantada consolidada — mercado sin dirección clara en tickers de alta beta.
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── M5 ADJUSTMENT ────────────────────────────────────────────────── */}
          <div className={`bg-card border-2 ${border} p-6`}>
            <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
              AJUSTE SOBRE METODOLOGÍA 5 — SCORE CONTEXTUALIZADO
            </div>
            <div className="flex flex-wrap items-center gap-8">
              <div>
                <div className="text-xs text-muted tracking-widest mb-1">MULTIPLICADOR M5</div>
                <div className={`text-6xl font-black ${data.m5Multiplier >= 1 ? "text-accent" : data.m5Multiplier >= 0.7 ? "text-warning" : "text-danger"}`}>
                  ×{data.m5Multiplier.toFixed(1)}
                </div>
              </div>
              <div className="border-l-2 border-border pl-8 flex-1">
                <div className="text-xs text-muted tracking-widest mb-2">INSTRUCCIÓN</div>
                <div className="text-base font-semibold text-muted">{data.m5AdjustmentLabel}</div>
                <div className="text-xs text-muted mt-3">
                  Si M5 da un score de +60 y el régimen es EXPANSIÓN (×0.7) → score contextualizado = +42.
                  Esto refleja que el mismo posicionamiento institucional tiene menos probabilidad de mantenerse
                  cuando los dealers no pueden hedgear eficientemente.
                </div>
              </div>
            </div>

            {/* Multiplier scale */}
            <div className="mt-6">
              <div className="flex items-center gap-3 text-xs text-muted mb-2">
                <span className="w-28">CRISIS ×0</span>
                <span>PÁNICO ×0.3</span>
                <span className="flex-1 text-center">EXPANSIÓN ×0.7</span>
                <span>TRANSICIÓN ×1.0</span>
                <span className="w-28 text-right">COMPRESIÓN ×1.2</span>
              </div>
              <div className="relative w-full h-4 bg-surface border border-border rounded-sm overflow-hidden">
                <div className="absolute inset-0 flex">
                  <div className="h-full bg-danger opacity-30" style={{ width: "5%" }} />
                  <div className="h-full bg-danger opacity-20" style={{ width: "20%" }} />
                  <div className="h-full bg-orange-500 opacity-20" style={{ width: "25%" }} />
                  <div className="h-full bg-warning opacity-20" style={{ width: "25%" }} />
                  <div className="h-full bg-accent opacity-20" style={{ flex: 1 }} />
                </div>
                {/* Current position marker */}
                <div
                  className={`absolute top-1 bottom-1 w-2 rounded-sm ${bg} z-10 -translate-x-1/2`}
                  style={{
                    left: data.m5Multiplier === 0 ? "2.5%" :
                          data.m5Multiplier === 0.3 ? "12%" :
                          data.m5Multiplier === 0.7 ? "37%" :
                          data.m5Multiplier === 1.0 ? "62%" : "88%",
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── BRIEF OPERATIVO ───────────────────────────────────────────────── */}
          {data5 && (() => {
            const b = buildBrief(data5, data);
            const isNoOperar  = b.adjustedVerdict === "NO OPERAR";
            const isNeutral   = b.adjustedVerdict === "NEUTRAL";
            const isAlcista   = b.adjustedVerdict === "ALCISTA";
            const verdictCol  = isNoOperar ? "text-danger" : isNeutral ? "text-warning" : isAlcista ? "text-accent" : "text-danger";
            const borderCol   = isNoOperar ? "border-danger" : isNeutral ? "border-warning" : isAlcista ? "border-accent" : "border-danger";

            return (
              <div className={`bg-card border-2 ${borderCol} p-6`}>
                <div className="text-sm text-muted tracking-widest mb-5 font-semibold">
                  BRIEF OPERATIVO — M5 × RÉGIMEN M6
                </div>

                {/* Header row */}
                <div className="flex flex-wrap items-end gap-8 mb-6 pb-6 border-b border-border">
                  <div>
                    <div className="text-xs text-muted tracking-widest mb-1">VEREDICTO AJUSTADO</div>
                    <div className={`text-5xl font-black tracking-widest ${verdictCol}`}>{b.adjustedVerdict}</div>
                  </div>
                  <div className="border-l-2 border-border pl-8">
                    <div className="text-xs text-muted tracking-widest mb-1">SCORE M5 RAW</div>
                    <div className="text-3xl font-bold text-subtle">
                      {data5.score >= 0 ? "+" : ""}{data5.score}
                    </div>
                  </div>
                  <div className="border-l-2 border-border pl-8">
                    <div className="text-xs text-muted tracking-widest mb-1">× RÉGIMEN</div>
                    <div className={`text-3xl font-bold ${data.m5Multiplier >= 1 ? "text-accent" : data.m5Multiplier >= 0.7 ? "text-warning" : "text-danger"}`}>
                      ×{data.m5Multiplier.toFixed(1)}
                    </div>
                  </div>
                  <div className="border-l-2 border-border pl-8">
                    <div className="text-xs text-muted tracking-widest mb-1">SCORE AJUSTADO</div>
                    <div className={`text-4xl font-bold ${b.adjustedScore >= 0 ? "text-accent" : "text-danger"}`}>
                      {b.adjustedScore >= 0 ? "+" : ""}{b.adjustedScore}
                    </div>
                  </div>
                  <div className="border-l-2 border-border pl-8">
                    <div className="text-xs text-muted tracking-widest mb-1">CONVERGENCIA</div>
                    <div className={`text-3xl font-bold ${b.convergence === 3 ? "text-accent" : b.convergence === 2 ? "text-warning" : "text-muted"}`}>
                      {b.convergence}/3
                    </div>
                    <div className="text-xs text-muted">M2 · M3 · M5</div>
                  </div>
                </div>

                {/* Trading levels */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-surface border border-border p-4">
                    <div className="text-xs text-muted tracking-widest mb-1">ENTRADA</div>
                    <div className="text-2xl font-bold text-accent">
                      {b.entry ? `$${b.entry.toFixed(2)}` : "—"}
                    </div>
                    <div className="text-xs text-muted mt-1">Soporte institucional</div>
                  </div>
                  <div className="bg-surface border border-border p-4">
                    <div className="text-xs text-muted tracking-widest mb-1">OBJETIVO</div>
                    <div className="text-2xl font-bold text-danger">
                      {b.target ? `$${b.target.toFixed(2)}` : "—"}
                    </div>
                    <div className="text-xs text-muted mt-1">Resistencia institucional</div>
                  </div>
                  <div className="bg-surface border border-border p-4">
                    <div className="text-xs text-muted tracking-widest mb-1">STOP</div>
                    <div className="text-2xl font-bold text-subtle">
                      {b.stop ? `$${b.stop.toFixed(2)}` : "—"}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {data.regime === "COMPRESIÓN" ? "−0.5% bajo soporte" :
                       data.regime === "TRANSICIÓN" ? "−0.8% bajo soporte" : "−1.2% bajo soporte"}
                    </div>
                  </div>
                  <div className="bg-surface border border-border p-4">
                    <div className="text-xs text-muted tracking-widest mb-1">RATIO R/R</div>
                    <div className={`text-2xl font-bold ${b.rr && parseFloat(b.rr) >= 2 ? "text-accent" : b.rr && parseFloat(b.rr) >= 1.5 ? "text-warning" : "text-danger"}`}>
                      {b.rr ? `1 : ${b.rr}` : "—"}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {b.rr && parseFloat(b.rr) >= 2 ? "Favorable" : b.rr && parseFloat(b.rr) >= 1.5 ? "Aceptable" : "Desfavorable"}
                    </div>
                  </div>
                </div>

                {/* Condition */}
                <div className={`border-l-4 ${borderCol} pl-4 py-2`}>
                  <div className="text-xs text-muted tracking-widest mb-1">CONDICIÓN DE ENTRADA</div>
                  <div className="text-base font-semibold text-muted">{b.condition}</div>
                </div>
              </div>
            );
          })()}

          {/* ── RESUMEN M6 ─────────────────────────────────────────────────────── */}
          {(() => {
            const regimeSignal = data.regime === "COMPRESIÓN" ? "FAVORABLE" : data.regime === "TRANSICIÓN" ? "NEUTRO" : "DESFAVORABLE";
            const regimeSignalColor = regimeSignal === "FAVORABLE" ? "text-accent border-accent" : regimeSignal === "NEUTRO" ? "text-warning border-warning" : "text-danger border-danger";

            const stress = data.leadIndicators?.filter((i) => i.signal === "ESTRÉS").length ?? 0;
            const recovery = data.leadIndicators?.filter((i) => i.signal === "RECUPERACIÓN").length ?? 0;
            const totalLead = data.leadIndicators?.length ?? 0;
            const leadConsensus = stress >= 2 ? "ESTRÉS" : recovery >= 2 ? "RECUPERACIÓN" : "NEUTRO";
            const leadColor = leadConsensus === "ESTRÉS" ? "text-danger border-danger" : leadConsensus === "RECUPERACIÓN" ? "text-accent border-accent" : "text-warning border-warning";

            const brief = data5 ? buildBrief(data5, data) : null;
            const verdictFinal = brief?.adjustedVerdict ?? "—";
            const verdictFinalColor = verdictFinal === "ALCISTA" ? "text-accent border-accent" : verdictFinal === "NO OPERAR" || verdictFinal === "BAJISTA" ? "text-danger border-danger" : "text-warning border-warning";

            return (
              <div className="bg-card border border-border p-6">
                <div className="text-sm text-muted tracking-widest mb-4 font-semibold">RESUMEN — INTERPRETACIÓN</div>
                <div className="space-y-3">

                  {/* Regime */}
                  <div className={`border-l-4 pl-4 py-2 ${regimeSignalColor}`}>
                    <div className={`text-sm font-bold ${regimeSignalColor.split(" ")[0]}`}>
                      RÉGIMEN: {data.regime} — VIX {data.vix.toFixed(1)} · VIX/VIX3M {data.vixRatio.toFixed(2)} · {data.vixVelocity}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {data.regime === "COMPRESIÓN"
                        ? "El VIX está bajo y estable. Los dealers pueden hedgear eficientemente — las señales GEX son confiables y el multiplicador sobre M5 es favorable (×1.2). Entorno ideal para operar según niveles institucionales."
                        : data.regime === "TRANSICIÓN"
                        ? "El VIX está en zona intermedia o en movimiento. Los dealers tienen incertidumbre en su cobertura — las señales GEX tienen confiabilidad moderada. Multiplicador neutro (×1.0): operar con tamaño reducido."
                        : data.regime === "EXPANSIÓN"
                        ? "El VIX está elevado o acelerando. El hedging de los dealers se vuelve errático — las señales GEX pierden confiabilidad. Multiplicador penalizador (×0.7): reducir exposición y ampliar stops."
                        : data.regime === "PÁNICO AGUDO"
                        ? "VIX en zona de pánico — el mercado está en modo de cobertura masiva. Señales GEX no confiables. Multiplicador (×0.3): solo operar coberturas o permanecer en efectivo."
                        : "Régimen de crisis sistémica — todas las señales GEX están suspendidas. El correlato entre posicionamiento de opciones y precio rompe. No operar según modelos de opciones hasta normalización."}
                    </div>
                  </div>

                  {/* Lead indicators */}
                  {totalLead > 0 && (
                    <div className={`border-l-4 pl-4 py-2 ${leadColor}`}>
                      <div className={`text-sm font-bold ${leadColor.split(" ")[0]}`}>
                        INDICADORES ADELANTADOS: {leadConsensus} ({stress} estrés · {recovery} recuperación · {totalLead - stress - recovery} neutro)
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {leadConsensus === "ESTRÉS"
                          ? `${stress} de ${totalLead} tickers de alta beta muestran señales de estrés simultáneamente. Históricamente esta convergencia precede al VIX en 1–3 sesiones — el mercado puede deteriorarse antes de que los índices lo reflejen.`
                          : leadConsensus === "RECUPERACIÓN"
                          ? `${recovery} de ${totalLead} indicadores high-beta muestran señales de recuperación. El apetito de riesgo está volviendo antes de que el VIX lo confirme — posible ventana de entrada alcista anticipada.`
                          : "Los tickers de alta beta no muestran señal unificada. Sin divergencia adelantada respecto al VIX — el mercado está procesando información de forma dispersa."}
                      </div>
                    </div>
                  )}

                  {/* Signal suspended */}
                  {data.signalSuspended && (
                    <div className="border-l-4 border-danger pl-4 py-2">
                      <div className="text-sm font-bold text-danger">SEÑALES GEX SUSPENDIDAS — {data.suspendedReason}</div>
                      <div className="text-xs text-muted mt-1">
                        En régimen de crisis o pánico extremo, los modelos de GEX pierden validez porque el hedging de los dealers se vuelve no-lineal. No utilizar niveles S/R de M1–M5 hasta que el VIX retorne a zona normal (&lt;25).
                      </div>
                    </div>
                  )}

                  {/* Final verdict */}
                  {brief && (
                    <div className={`border-l-4 pl-4 py-2 ${verdictFinalColor}`}>
                      <div className={`text-sm font-bold ${verdictFinalColor.split(" ")[0]}`}>
                        VEREDICTO AJUSTADO: {verdictFinal} · SCORE {brief.adjustedScore >= 0 ? "+" : ""}{brief.adjustedScore} · CONVERGENCIA {brief.convergence}/3
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {verdictFinal === "ALCISTA"
                          ? `Score M5 ajustado por régimen ${data.regime} (×${data.m5Multiplier.toFixed(1)}) da señal alcista con ${brief.convergence}/3 modelos alineados. ${brief.entry ? `Entrada sugerida: $${brief.entry.toFixed(2)} · Objetivo: $${brief.target?.toFixed(2) ?? "—"} · Stop: $${brief.stop?.toFixed(2) ?? "—"}.` : ""}`
                          : verdictFinal === "BAJISTA"
                          ? `Score ajustado apunta bajista. El régimen ${data.regime} amplifica la presión vendedora — los dealers están posicionados para vender en rebotes. Considerar cobertura o posición corta si el spot rompe bajo el soporte.`
                          : verdictFinal === "NO OPERAR"
                          ? `El régimen ${data.regime} cancela la señal de M5. Aunque el posicionamiento institucional pueda indicar dirección, el entorno de volatilidad hace que el ratio R/R sea desfavorable. Permanecer fuera del mercado.`
                          : "Señal neutral — el balance entre señales alcistas y bajistas no genera convicción suficiente para operar."}
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
