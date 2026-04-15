import type { AnalysisResult } from "@/types";
import type { Analysis2Result, Analysis3Result } from "@/types";
import type { Analysis5Result, SRLevel } from "@/lib/gex5";
import type { Analysis6Result } from "@/lib/gex6";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface MethodologyContribution {
  id: "M1" | "M2" | "M3" | "M5" | "M6";
  name: string;
  weight: number;
  rawScore: number;      // −100 a +100
  contribution: number;  // rawScore * weight
  available: boolean;
  label: string;
}

export interface SRCluster {
  strike: number;
  type: "support" | "resistance";
  distPct: number;
  probability: number;
  votes: number;
  gexWeight: number;
  calificacion: number;  // 0-100
  sources: Array<"M1" | "M2" | "M3" | "M5">;
  entryPrice: number;
  targetPrice: number | null;
  stopPrice: number;
  rrRatio: number | null;
  historicalDays?: number;  // 0-7: cuántos snapshots recientes confirmaron este nivel (±0.5%)
}

export interface TimingBlock {
  timeframe: "INTRADAY" | "SEMANAL" | "MENSUAL" | "TRIMESTRAL";
  horizonDays: number;
  signal: "ALCISTA" | "BAJISTA" | "NEUTRAL" | "NO OPERAR";
  entry: number | null;
  target: number | null;
  stop: number | null;
  rrRatio: string | null;
  conviction: number;  // 0-100
  basis: string;
  condition: string;
}

export interface Analysis7Result {
  ticker: string;
  spot: number;
  timestamp: string;
  finalScore: number;
  finalVerdict: "ALCISTA" | "BAJISTA" | "NEUTRAL";
  confidence: number;
  contributions: MethodologyContribution[];
  regimeMultiplier: number;
  signalSuspended: boolean;
  suspendedReason: string;
  srTable: SRCluster[];
  primaryLong: SRCluster | null;
  primaryShort: SRCluster | null;
  timingMatrix: TimingBlock[];
  summaryLines: string[];
  m5Score: number;
  m5Verdict: string;
  m6Regime: string;
  m6FearScore: number;
  m6FearLabel: string;
  m6Vix: number;
  m6VixVelocity: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

// ─── Score final ponderado ───────────────────────────────────────────────────

function computeFinalScore(
  spot: number,
  m1: AnalysisResult,
  m2: Analysis2Result,
  m3: Analysis3Result,
  m5: Analysis5Result,
  m6: Analysis6Result,
): { finalScore: number; finalVerdict: "ALCISTA" | "BAJISTA" | "NEUTRAL"; confidence: number; contributions: MethodologyContribution[] } {

  // M5: ya en −100/+100
  const m5Raw = m5.score;
  const m5Label =
    m5.score > 25 ? `M5 ALCISTA (${m5.score > 0 ? "+" : ""}${m5.score}) — señal consolidada multi-exp apunta al alza` :
    m5.score < -25 ? `M5 BAJISTA (${m5.score}) — señal consolidada multi-exp apunta a la baja` :
    `M5 NEUTRAL (${m5.score}) — sin sesgo direccional claro en la señal consolidada`;

  // M6: usa regimeScore (−1/+1) para amplificar/reducir dirección de M5
  const m6Directional = clamp(m5.score * m6.regimeScore, -100, 100);
  const m6Label =
    m6.regime === "COMPRESIÓN" ? `M6 COMPRESIÓN — amplifica señal M5 (×${fmt(m6.regimeScore, 2)})` :
    m6.regime === "EXPANSIÓN"  ? `M6 EXPANSIÓN — reduce señal M5 (×${fmt(m6.regimeScore, 2)})` :
    m6.regime === "TRANSICIÓN" ? `M6 TRANSICIÓN — señal sin ajuste (régimen ${m6.regime})` :
    `M6 ${m6.regime} — señal suspendida, régimen de pánico/crisis`;

  // M2: proximidad relativa soporte vs resistencia
  const m2Range = m2.resistance - m2.support;
  let m2Raw = 0;
  if (m2Range > 0) {
    const m2SupDist = Math.abs(spot - m2.support);
    const m2ResDist = Math.abs(spot - m2.resistance);
    m2Raw = clamp(((m2ResDist - m2SupDist) / m2Range) * 100, -100, 100);
  }
  const m2Label =
    m2Raw > 20 ? `M2 Z-Score: spot más cercano al soporte $${fmt(m2.support)} que a la resistencia $${fmt(m2.resistance)} — sesgo alcista` :
    m2Raw < -20 ? `M2 Z-Score: spot más cercano a la resistencia $${fmt(m2.resistance)} que al soporte $${fmt(m2.support)} — sesgo bajista` :
    `M2 Z-Score: spot equidistante entre soporte $${fmt(m2.support)} y resistencia $${fmt(m2.resistance)} — zona neutral`;

  // M3: proximidad multi-expiración escalada por confianza
  const m3Range = m3.resistance - m3.support;
  let m3Raw = 0;
  if (m3Range > 0) {
    const m3SupDist = Math.abs(spot - m3.support);
    const m3ResDist = Math.abs(spot - m3.resistance);
    const confFactor = (m3.supportConfidence + m3.resistanceConfidence) / 200;
    m3Raw = clamp(((m3ResDist - m3SupDist) / m3Range) * 100 * confFactor, -100, 100);
  }
  const m3Label =
    m3Raw > 20 ? `M3 Confluencia: soporte ${fmt(m3.supportConfidence, 0)}% conf. vs resistencia ${fmt(m3.resistanceConfidence, 0)}% — respaldo multi-exp alcista` :
    m3Raw < -20 ? `M3 Confluencia: resistencia ${fmt(m3.resistanceConfidence, 0)}% conf. vs soporte ${fmt(m3.supportConfidence, 0)}% — respaldo multi-exp bajista` :
    `M3 Confluencia: confianzas similares (sup ${fmt(m3.supportConfidence, 0)}% / res ${fmt(m3.resistanceConfidence, 0)}%) — señal neutral`;

  // M1: presión institucional + posición vs gamma flip
  const gammaSignal = spot > m1.levels.gammaFlip ? 50 : -50;
  const m1Raw = clamp((m1.institutionalPressure + gammaSignal) / 2, -100, 100);
  const m1Label =
    m1Raw > 20 ? `M1 GEX: spot ${spot > m1.levels.gammaFlip ? "sobre" : "bajo"} gamma flip $${fmt(m1.levels.gammaFlip)} · presión institucional ${fmt(m1.institutionalPressure, 0)}` :
    m1Raw < -20 ? `M1 GEX: presión bajista · spot ${spot > m1.levels.gammaFlip ? "sobre" : "bajo"} gamma flip $${fmt(m1.levels.gammaFlip)}` :
    `M1 GEX: señal mixta · gamma flip $${fmt(m1.levels.gammaFlip)} · presión ${fmt(m1.institutionalPressure, 0)}`;

  const contributions: MethodologyContribution[] = [
    { id: "M5", name: "SEÑAL CONSOLIDADA",      weight: 0.35, rawScore: m5Raw,          contribution: m5Raw * 0.35,          available: true, label: m5Label },
    { id: "M6", name: "RÉGIMEN DE MERCADO",      weight: 0.25, rawScore: m6Directional,  contribution: m6Directional * 0.25,  available: true, label: m6Label },
    { id: "M2", name: "POSICIONAMIENTO Z-SCORE", weight: 0.20, rawScore: m2Raw,          contribution: m2Raw * 0.20,          available: true, label: m2Label },
    { id: "M3", name: "CONFLUENCIA MULTI-EXP",   weight: 0.15, rawScore: m3Raw,          contribution: m3Raw * 0.15,          available: true, label: m3Label },
    { id: "M1", name: "GEX / VANNA / DEALER",    weight: 0.05, rawScore: m1Raw,          contribution: m1Raw * 0.05,          available: true, label: m1Label },
  ];

  const rawSum = contributions.reduce((s, c) => s + c.contribution, 0);
  const finalScore = clamp(Math.round(rawSum * m6.m5Multiplier), -100, 100);
  const finalVerdict: "ALCISTA" | "BAJISTA" | "NEUTRAL" =
    finalScore > 25 ? "ALCISTA" : finalScore < -25 ? "BAJISTA" : "NEUTRAL";
  const confidence = Math.min(95, Math.round(50 + Math.abs(rawSum / 100) * 45));

  return { finalScore, finalVerdict, confidence, contributions };
}

// ─── Tabla institucional S/R ─────────────────────────────────────────────────

interface RawLevel {
  strike: number;
  type: "support" | "resistance";
  score: number;      // 0-1
  gexWeight: number;  // 0-1
  source: "M1" | "M2" | "M3" | "M5";
}

function buildInstitutionalSRTable(
  spot: number,
  m1: AnalysisResult,
  m2: Analysis2Result,
  m3: Analysis3Result,
  m5: Analysis5Result,
): { srTable: SRCluster[]; primaryLong: SRCluster | null; primaryShort: SRCluster | null } {

  const raw: RawLevel[] = [];

  // M1
  if (m1.levels.support > 0)    raw.push({ strike: m1.levels.support,    type: "support",    score: 0.50, gexWeight: 0, source: "M1" });
  if (m1.levels.resistance > 0) raw.push({ strike: m1.levels.resistance, type: "resistance", score: 0.50, gexWeight: 0, source: "M1" });

  // M2
  if (m2.support > 0)    raw.push({ strike: m2.support,    type: "support",    score: 0.60, gexWeight: 0, source: "M2" });
  if (m2.resistance > 0) raw.push({ strike: m2.resistance, type: "resistance", score: 0.60, gexWeight: 0, source: "M2" });

  // M3
  if (m3.support > 0)    raw.push({ strike: m3.support,    type: "support",    score: m3.supportConfidence / 100,    gexWeight: 0, source: "M3" });
  if (m3.resistance > 0) raw.push({ strike: m3.resistance, type: "resistance", score: m3.resistanceConfidence / 100, gexWeight: 0, source: "M3" });

  // M5
  if (m5.support)    raw.push({ strike: m5.support.strike,    type: "support",    score: m5.support.totalScore,    gexWeight: m5.support.gexScore,    source: "M5" });
  if (m5.resistance) raw.push({ strike: m5.resistance.strike, type: "resistance", score: m5.resistance.totalScore, gexWeight: m5.resistance.gexScore, source: "M5" });

  // Filtrar strikes inválidos
  const valid = raw.filter((l) => l.strike > 0);
  valid.sort((a, b) => a.strike - b.strike);

  // Clustering ±0.5%
  type Cluster = { members: RawLevel[] };
  const clusters: Cluster[] = [];

  for (const level of valid) {
    const existing = clusters.find(
      (cl) =>
        cl.members[0].type === level.type &&
        Math.abs(cl.members[0].strike - level.strike) / level.strike <= 0.005
    );
    if (existing) {
      existing.members.push(level);
    } else {
      clusters.push({ members: [level] });
    }
  }

  // Construir SRCluster por cada cluster
  const srTable: SRCluster[] = clusters.map((cl) => {
    const totalScore = cl.members.reduce((s, m) => s + m.score, 0);
    const weightedStrike = cl.members.reduce((s, m) => s + m.strike * m.score, 0) / totalScore;
    const sources = Array.from(new Set(cl.members.map((m) => m.source))) as Array<"M1"|"M2"|"M3"|"M5">;
    const votes = sources.length;
    const gexWeight = Math.max(...cl.members.map((m) => m.gexWeight));
    const meanScore = totalScore / cl.members.length;
    const calificacion = Math.min(100, Math.round(meanScore * 100 + (votes - 1) * 15 + gexWeight * 20));
    const distPct = parseFloat(((weightedStrike - spot) / spot * 100).toFixed(2));
    const type = cl.members[0].type;

    const entryPrice = type === "support"
      ? parseFloat((weightedStrike * 1.001).toFixed(2))
      : parseFloat((weightedStrike * 0.999).toFixed(2));
    const stopPrice = type === "support"
      ? parseFloat((weightedStrike * 0.985).toFixed(2))
      : parseFloat((weightedStrike * 1.015).toFixed(2));

    return {
      strike: parseFloat(weightedStrike.toFixed(2)),
      type,
      distPct,
      probability: calificacion,
      votes,
      gexWeight: parseFloat(gexWeight.toFixed(3)),
      calificacion,
      sources,
      entryPrice,
      targetPrice: null,
      stopPrice,
      rrRatio: null,
    };
  });

  // Ordenar por calificacion DESC
  srTable.sort((a, b) => b.calificacion - a.calificacion);

  // Asignar targets y R/R
  const supports = srTable.filter((c) => c.type === "support");
  const resistances = srTable.filter((c) => c.type === "resistance");

  for (const sup of supports) {
    const target = resistances.find((r) => r.strike > spot);
    if (target) {
      sup.targetPrice = target.entryPrice;
      const gain = sup.targetPrice - sup.entryPrice;
      const risk = sup.entryPrice - sup.stopPrice;
      sup.rrRatio = risk > 0 ? parseFloat((gain / risk).toFixed(2)) : null;
    }
  }
  for (const res of resistances) {
    const target = supports.find((s) => s.strike < spot);
    if (target) {
      res.targetPrice = target.entryPrice;
      const gain = res.entryPrice - res.targetPrice;
      const risk = res.stopPrice - res.entryPrice;
      res.rrRatio = risk > 0 ? parseFloat((gain / risk).toFixed(2)) : null;
    }
  }

  const primaryLong = supports[0] ?? null;
  const primaryShort = resistances[0] ?? null;

  return { srTable, primaryLong, primaryShort };
}

// ─── Timing matrix ────────────────────────────────────────────────────────────

function buildTimingMatrix(
  spot: number,
  m1: AnalysisResult,
  m3: Analysis3Result,
  m5: Analysis5Result,
  m6: Analysis6Result,
  finalScore: number,
  finalVerdict: "ALCISTA" | "BAJISTA" | "NEUTRAL",
  confidence: number,
  primaryLong: SRCluster | null,
  primaryShort: SRCluster | null,
): TimingBlock[] {

  const vix = m6.vix;

  // Helper: target según dirección
  const longTarget  = primaryLong?.strike  ?? null;
  const shortTarget = primaryShort?.strike ?? null;

  function dirTarget(signal: "ALCISTA" | "BAJISTA" | "NEUTRAL" | "NO OPERAR"): number | null {
    if (signal === "ALCISTA") return longTarget;
    if (signal === "BAJISTA") return shortTarget;
    return null;
  }

  function formatRR(entry: number | null, target: number | null, stop: number | null, type: "long" | "short"): string | null {
    if (!entry || !target || !stop) return null;
    const gain = type === "long" ? target - entry : entry - target;
    const risk = type === "long" ? entry - stop  : stop  - entry;
    if (risk <= 0) return null;
    return `${(gain / risk).toFixed(1)}:1`;
  }

  // ── INTRADAY ──────────────────────────────────────────────────────────────
  let intradaySignal: TimingBlock["signal"] =
    m1.institutionalPressure > 10 ? "ALCISTA" :
    m1.institutionalPressure < -10 ? "BAJISTA" : "NEUTRAL";
  if (m6.vixVelocity === "ACELERANDO") intradaySignal = "NO OPERAR";

  const intradayEntry = intradaySignal === "ALCISTA" ? parseFloat((spot * 1.003).toFixed(2))
    : intradaySignal === "BAJISTA" ? parseFloat((spot * 0.997).toFixed(2)) : spot;
  const intradayTarget = dirTarget(intradaySignal);
  const intradayStop = intradaySignal === "ALCISTA" ? parseFloat((intradayEntry * 0.995).toFixed(2))
    : intradaySignal === "BAJISTA" ? parseFloat((intradayEntry * 1.005).toFixed(2)) : null;
  const intradayConviction = intradaySignal === "NO OPERAR" ? 0
    : Math.min(90, Math.round(Math.abs(m1.institutionalPressure) + (m6.vixVelocity === "ESTABLE" ? 20 : 0)));

  const intraday: TimingBlock = {
    timeframe: "INTRADAY",
    horizonDays: 1,
    signal: intradaySignal,
    entry: intradaySignal !== "NO OPERAR" ? intradayEntry : null,
    target: intradayTarget,
    stop: intradayStop,
    rrRatio: formatRR(intradayEntry, intradayTarget, intradayStop, intradaySignal === "BAJISTA" ? "short" : "long"),
    conviction: intradayConviction,
    basis: "M1 Presión Institucional + M6 Velocidad VIX",
    condition: m6.vixVelocity === "ACELERANDO"
      ? `VIX acelerando (${fmt(vix, 1)}) — esperar estabilización antes de operar intraday`
      : `Entrada cuando precio toque $${fmt(intradayEntry)} con volumen confirmación`,
  };

  // ── SEMANAL ───────────────────────────────────────────────────────────────
  let semanalSignal: TimingBlock["signal"] = m5.verdict;
  if (m6.signalSuspended) semanalSignal = "NO OPERAR";

  const semanalEntry = spot;
  const semanalTarget = dirTarget(semanalSignal);
  const atrProxy = vix / 1000 + 0.015;
  const semanalStop = semanalSignal === "ALCISTA" ? parseFloat((spot * (1 - atrProxy)).toFixed(2))
    : semanalSignal === "BAJISTA" ? parseFloat((spot * (1 + atrProxy)).toFixed(2)) : null;
  const semanalConviction = semanalSignal === "NO OPERAR" ? 0
    : Math.min(90, Math.round(Math.abs(m5.score) * m6.m5Multiplier));

  const semanal: TimingBlock = {
    timeframe: "SEMANAL",
    horizonDays: 7,
    signal: semanalSignal,
    entry: semanalSignal !== "NO OPERAR" ? semanalEntry : null,
    target: semanalTarget,
    stop: semanalStop,
    rrRatio: formatRR(semanalEntry, semanalTarget, semanalStop, semanalSignal === "BAJISTA" ? "short" : "long"),
    conviction: semanalConviction,
    basis: "M5 Señal Consolidada + M6 Régimen",
    condition: m6.signalSuspended
      ? m6.suspendedReason
      : `M5 ${m5.verdict} (score ${m5.score > 0 ? "+" : ""}${m5.score}) — régimen ${m6.regime}`,
  };

  // ── MENSUAL ───────────────────────────────────────────────────────────────
  let mensualSignal: TimingBlock["signal"] =
    m3.supportConfidence - m3.resistanceConfidence > 15 ? "ALCISTA" :
    m3.resistanceConfidence - m3.supportConfidence > 15 ? "BAJISTA" : "NEUTRAL";
  if (vix > 35) mensualSignal = "NO OPERAR";

  const mensualEntry = spot;
  const mensualTarget = dirTarget(mensualSignal);
  const mensualStopPct = vix / 400;
  const mensualStop = mensualSignal === "ALCISTA" ? parseFloat((spot * (1 - mensualStopPct)).toFixed(2))
    : mensualSignal === "BAJISTA" ? parseFloat((spot * (1 + mensualStopPct)).toFixed(2)) : null;
  const mensualConviction = mensualSignal === "NO OPERAR" ? 0
    : Math.min(90, Math.round(
        ((m3.supportConfidence + m3.resistanceConfidence) / 2) * m6.m5Multiplier
      ));

  const mensual: TimingBlock = {
    timeframe: "MENSUAL",
    horizonDays: 30,
    signal: mensualSignal,
    entry: mensualSignal !== "NO OPERAR" ? mensualEntry : null,
    target: mensualTarget,
    stop: mensualStop,
    rrRatio: formatRR(mensualEntry, mensualTarget, mensualStop, mensualSignal === "BAJISTA" ? "short" : "long"),
    conviction: mensualConviction,
    basis: "M3 Confluencia Multi-Expiración",
    condition: vix > 35
      ? `VIX ${fmt(vix, 1)} — no operar con modelos GEX en volatilidad extrema`
      : `Sup conf ${fmt(m3.supportConfidence, 0)}% vs Res conf ${fmt(m3.resistanceConfidence, 0)}% — ${m3.expirationsUsed.length} expiraciones analizadas`,
  };

  // ── TRIMESTRAL ────────────────────────────────────────────────────────────
  const trimOkRegimes = ["COMPRESIÓN", "TRANSICIÓN"];
  let trimestralSignal: TimingBlock["signal"] =
    trimOkRegimes.includes(m6.regime) ? finalVerdict : "NO OPERAR";

  const trimestralEntry = spot;
  const trimestralTarget = dirTarget(trimestralSignal);
  const trimestralStop = trimestralSignal === "ALCISTA" ? parseFloat((spot * 0.95).toFixed(2))
    : trimestralSignal === "BAJISTA" ? parseFloat((spot * 1.05).toFixed(2)) : null;
  const trimRegimeFactor = m6.regime === "COMPRESIÓN" ? 1.0 : 0.7;
  const trimestralConviction = trimestralSignal === "NO OPERAR" ? 0
    : Math.min(90, Math.round(confidence * m6.m5Multiplier * trimRegimeFactor));

  const trimestral: TimingBlock = {
    timeframe: "TRIMESTRAL",
    horizonDays: 90,
    signal: trimestralSignal,
    entry: trimestralSignal !== "NO OPERAR" ? trimestralEntry : null,
    target: trimestralTarget,
    stop: trimestralStop,
    rrRatio: formatRR(trimestralEntry, trimestralTarget, trimestralStop, trimestralSignal === "BAJISTA" ? "short" : "long"),
    conviction: trimestralConviction,
    basis: "M6 Régimen de Mercado + Veredicto Final",
    condition: !trimOkRegimes.includes(m6.regime)
      ? `Régimen ${m6.regime} — no operar posiciones trimestrales direccionales`
      : `Régimen ${m6.regime} favorable para posiciones de largo plazo — score final ${finalScore > 0 ? "+" : ""}${finalScore}`,
  };

  return [intraday, semanal, mensual, trimestral];
}

// ─── Líneas de resumen ────────────────────────────────────────────────────────

function buildSummaryLines(
  ticker: string,
  spot: number,
  finalScore: number,
  finalVerdict: "ALCISTA" | "BAJISTA" | "NEUTRAL",
  confidence: number,
  contributions: MethodologyContribution[],
  srTable: SRCluster[],
  m6: Analysis6Result,
  timingMatrix: TimingBlock[],
  primaryLong: SRCluster | null,
  primaryShort: SRCluster | null,
): string[] {

  const countAligned = contributions.filter((c) =>
    (finalVerdict === "ALCISTA" && c.rawScore > 10) ||
    (finalVerdict === "BAJISTA" && c.rawScore < -10)
  ).length;

  const m5c = contributions.find((c) => c.id === "M5")!;
  const m6c = contributions.find((c) => c.id === "M6")!;
  const topTiming = [...timingMatrix].sort((a, b) => b.conviction - a.conviction)[0];

  const regimeRisk =
    m6.regime === "COMPRESIÓN" ?
      `Entorno COMPRESIÓN — GEX altamente fiable. Niveles S/R con alta probabilidad de actuar como pin. Stops ajustados. Aprovechar el rango definido.` :
    m6.regime === "TRANSICIÓN" ?
      `Régimen TRANSICIÓN — señales moderadas. Confirmar entradas con vela de reversión o volumen antes de posicionarse.` :
    m6.regime === "EXPANSIÓN" ?
      `Régimen EXPANSIÓN — niveles S/R se rompen con mayor frecuencia. Ampliar stops 50% y reducir tamaño de posición.` :
      `SEÑALES SUSPENDIDAS — no operar con modelos GEX en ${m6.regime}. Esperar normalización del VIX bajo 28.`;

  return [
    `Score final M7: ${finalScore > 0 ? "+" : ""}${finalScore}/100. Veredicto ${finalVerdict} con ${confidence}% de confianza. Régimen ${m6.regime} aplica multiplicador ×${fmt(m6.m5Multiplier, 1)}. ${countAligned}/5 metodologías apuntan en la misma dirección.`,
    `Señales dominantes: M5 Señal Consolidada (35%) score ${m5c.rawScore > 0 ? "+" : ""}${fmt(m5c.rawScore, 0)} y M6 Régimen (25%) contribución ${m6c.contribution > 0 ? "+" : ""}${fmt(m6c.contribution, 1)}. Juntas aportan ${fmt(m5c.contribution + m6c.contribution, 1)} puntos. VIX ${fmt(m6.vix, 1)} (${m6.vixVelocity}).`,
    primaryLong && primaryShort ?
      `Soporte principal: $${fmt(primaryLong.strike)} (${primaryLong.votes}/4 votos, cal. ${primaryLong.calificacion}%, fuentes: ${primaryLong.sources.join("·")}). Resistencia principal: $${fmt(primaryShort.strike)} (${primaryShort.votes}/4 votos). Rango operativo: $${fmt(primaryLong.strike)}–$${fmt(primaryShort.strike)} (${fmt(Math.abs(primaryShort.distPct - primaryLong.distPct), 1)}% amplitud).` :
      `${srTable.length} niveles institucionales identificados. ${srTable.filter((s) => s.type === "support").length} soportes y ${srTable.filter((s) => s.type === "resistance").length} resistencias. Spot: $${fmt(spot)}.`,
    topTiming && topTiming.entry && topTiming.target && topTiming.stop ?
      `Mejor configuración: ${topTiming.timeframe} (${topTiming.conviction}% convicción). Señal ${topTiming.signal}. Entry $${fmt(topTiming.entry)} → Target $${fmt(topTiming.target)} · Stop $${fmt(topTiming.stop)}${topTiming.rrRatio ? ` → R/R ${topTiming.rrRatio}` : ""}. Base: ${topTiming.basis}.` :
      `Timing multi-marco calculado. ${timingMatrix.filter((t) => t.signal !== "NO OPERAR").length}/4 marcos con señal activa. Régimen ${m6.regime} condiciona las entradas.`,
    regimeRisk,
  ];
}

// ─── Master aggregator ────────────────────────────────────────────────────────

export function computeAnalysis7(
  ticker: string,
  spot: number,
  m1: AnalysisResult,
  m2: Analysis2Result,
  m3: Analysis3Result,
  m5: Analysis5Result,
  m6: Analysis6Result,
): Analysis7Result {

  const { finalScore, finalVerdict, confidence, contributions } =
    computeFinalScore(spot, m1, m2, m3, m5, m6);

  const { srTable, primaryLong, primaryShort } =
    buildInstitutionalSRTable(spot, m1, m2, m3, m5);

  const timingMatrix = buildTimingMatrix(
    spot, m1, m3, m5, m6,
    finalScore, finalVerdict, confidence,
    primaryLong, primaryShort,
  );

  const summaryLines = buildSummaryLines(
    ticker, spot, finalScore, finalVerdict, confidence,
    contributions, srTable, m6, timingMatrix, primaryLong, primaryShort,
  );

  return {
    ticker,
    spot,
    timestamp: new Date().toISOString(),
    finalScore,
    finalVerdict,
    confidence,
    contributions,
    regimeMultiplier: m6.m5Multiplier,
    signalSuspended: m6.signalSuspended,
    suspendedReason: m6.suspendedReason,
    srTable,
    primaryLong,
    primaryShort,
    timingMatrix,
    summaryLines,
    m5Score: m5.score,
    m5Verdict: m5.verdict,
    m6Regime: m6.regime,
    m6FearScore: m6.fearScore,
    m6FearLabel: m6.fearLabel,
    m6Vix: m6.vix,
    m6VixVelocity: m6.vixVelocity,
  };
}
