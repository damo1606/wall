import { gammaBS, deltaBS } from "./blackscholes";

const RISK_FREE_RATE = 0.043;
const CONTRACT_SIZE = 100;
const MAX_DISTANCE = 0.12;

function minOIThreshold(expDataList: ExpData5[]): number {
  let maxOI = 1;
  for (const exp of expDataList) {
    for (const c of exp.calls) maxOI = Math.max(maxOI, c.openInterest);
    for (const p of exp.puts)  maxOI = Math.max(maxOI, p.openInterest);
  }
  return Math.max(10, maxOI * 0.003);
}

function timeWeight(dte: number): number {
  return Math.exp(-Math.max(1, dte) / 45);
}

export interface RawOption5 {
  strike: number;
  impliedVolatility: number;
  openInterest: number;
}

export interface ExpData5 {
  expiration: string;
  calls: RawOption5[];
  puts: RawOption5[];
}

export interface SRLevel {
  strike: number;
  type: "support" | "resistance";
  confidence: number;        // 0-100
  gexScore: number;          // 0-1
  maxPainScore: number;      // 0-1
  notionalOIScore: number;   // 0-1
  totalScore: number;        // 0-1
  notionalOI: number;        // dollar value
  expirationsWithHighOI: number;
  maxPainDistancePct: number;
}

export interface SignalComponent {
  name: string;
  rawValue: number;
  normalizedValue: number;   // -1 to +1
  weight: number;
  contribution: number;      // normalizedValue × weight
  label: string;
}

export interface ScoredStrike {
  strike: number;
  totalScore: number;
  gexTotal: number;
  notionalOI: number;
  isSupport: boolean;
  isResistance: boolean;
}

export interface Analysis5Result {
  ticker: string;
  spot: number;
  maxPain: number;
  expirationUsed: string;
  expirationsAnalyzed: number;
  support: SRLevel | null;
  resistance: SRLevel | null;
  scoredStrikes: ScoredStrike[];
  signals: SignalComponent[];
  score: number;             // -100 to +100
  verdict: "ALCISTA" | "BAJISTA" | "NEUTRAL";
  probability: number;       // 50-95
  // Cross-methodology levels (from M2 and M3)
  m2Support: number;
  m2Resistance: number;
  m3Support: number;
  m3Resistance: number;
}

// Max Pain: the strike that minimizes total dollar value of expiring options
function computeMaxPain(calls: RawOption5[], puts: RawOption5[]): number {
  const strikes = Array.from(new Set([
    ...calls.map((c) => c.strike),
    ...puts.map((p) => p.strike),
  ])).sort((a, b) => a - b);

  if (strikes.length === 0) return 0;

  let minPain = Infinity;
  let maxPainStrike = strikes[Math.floor(strikes.length / 2)];

  for (const candidate of strikes) {
    let pain = 0;
    for (const c of calls) {
      pain += Math.max(0, candidate - c.strike) * (c.openInterest ?? 0) * CONTRACT_SIZE;
    }
    for (const p of puts) {
      pain += Math.max(0, p.strike - candidate) * (p.openInterest ?? 0) * CONTRACT_SIZE;
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = candidate;
    }
  }
  return maxPainStrike;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeAnalysis5(
  ticker: string,
  spot: number,
  expDataList: ExpData5[],
  // From single-expiration M1 analysis (directional signal inputs)
  gammaFlip: number,
  institutionalPressure: number,
  putCallRatio: number,
  // From multi-expiration 25Δ skew (M4 logic)
  avgSkew25d: number,
  // Cross-methodology levels from M2 (Z-score GEX+PCR) and M3 (confluence 3D)
  m2Support: number,
  m2Resistance: number,
  m3Support: number,
  m3Resistance: number,
): Analysis5Result {
  const today = new Date();
  const lower = spot * (1 - MAX_DISTANCE);
  const upper = spot * (1 + MAX_DISTANCE);

  const primaryExp = expDataList[0];
  const maxPain = computeMaxPain(primaryExp.calls, primaryExp.puts);

  // ─── Aggregate per-strike data across all expirations ───────────────────
  const strikeMap = new Map<number, {
    gexSum: number;
    callOISum: number;
    putOISum: number;
    highOIExpCount: number;   // times this strike is in top-5 OI per expiration
  }>();

  for (const expData of expDataList) {
    const expDate = new Date(expData.expiration + "T00:00:00");
    const msToExp = expDate.getTime() - today.getTime();
    const dte = msToExp / (24 * 60 * 60 * 1000);
    const T   = Math.max(dte / 365, 0.001);
    const tW  = timeWeight(dte);

    const allStrikes = Array.from(new Set([
      ...expData.calls.map((c) => c.strike),
      ...expData.puts.map((p) => p.strike),
    ]));

    // Top-5 OI strikes for this expiration (multi-exp convergence signal)
    const strikeOIs = allStrikes.map((strike) => {
      const call = expData.calls.find((c) => c.strike === strike);
      const put = expData.puts.find((p) => p.strike === strike);
      return { strike, oi: (call?.openInterest ?? 0) + (put?.openInterest ?? 0) };
    });
    const top5 = new Set(
      strikeOIs.sort((a, b) => b.oi - a.oi).slice(0, 5).map((s) => s.strike)
    );

    for (const strike of allStrikes) {
      const call = expData.calls.find((c) => c.strike === strike);
      const put = expData.puts.find((p) => p.strike === strike);

      const callOI = call?.openInterest ?? 0;
      const putOI = put?.openInterest ?? 0;
      const callIV = call?.impliedVolatility ?? 0;
      const putIV = put?.impliedVolatility ?? 0;

      const gCall = gammaBS(spot, strike, T, RISK_FREE_RATE, callIV);
      const gPut = gammaBS(spot, strike, T, RISK_FREE_RATE, putIV);
      const gex =
        (callOI * gCall * spot * spot * CONTRACT_SIZE -
         putOI  * gPut  * spot * spot * CONTRACT_SIZE) * tW;

      const existing = strikeMap.get(strike) ?? {
        gexSum: 0, callOISum: 0, putOISum: 0, highOIExpCount: 0,
      };
      strikeMap.set(strike, {
        gexSum:    existing.gexSum    + gex,
        callOISum: existing.callOISum + callOI * tW,
        putOISum:  existing.putOISum  + putOI  * tW,
        highOIExpCount: existing.highOIExpCount + (top5.has(strike) ? 1 : 0),
      });
    }
  }

  // ─── Build raw strike array ±12% with dynamic liquidity filter ───────────
  const minOI = minOIThreshold(expDataList);
  const rawStrikes = Array.from(strikeMap.entries())
    .filter(([strike, d]) =>
      strike >= lower &&
      strike <= upper &&
      d.callOISum + d.putOISum >= minOI
    )
    .map(([strike, d]) => ({
      strike,
      gexTotal: d.gexSum,
      // Dollar-notional OI: weights large $ positions over cheap OTM contracts
      notionalOI: (d.callOISum + d.putOISum) * strike * CONTRACT_SIZE,
      callOI: d.callOISum,
      putOI: d.putOISum,
      highOIExpCount: d.highOIExpCount,
    }))
    .sort((a, b) => a.strike - b.strike);

  if (rawStrikes.length === 0) {
    return {
      ticker, spot, maxPain,
      expirationUsed: primaryExp.expiration,
      expirationsAnalyzed: expDataList.length,
      support: null, resistance: null, scoredStrikes: [],
      signals: [], score: 0, verdict: "NEUTRAL", probability: 50,
      m2Support, m2Resistance, m3Support, m3Resistance,
    };
  }

  // Normalization denominators
  const maxGexAbs = Math.max(...rawStrikes.map((s) => Math.abs(s.gexTotal)), 1);
  const maxNotional = Math.max(...rawStrikes.map((s) => s.notionalOI), 1);
  const maxExpCount = Math.max(...rawStrikes.map((s) => s.highOIExpCount), 1);

  // ─── Score each strike on 3 dimensions ──────────────────────────────────
  const scoredStrikes: ScoredStrike[] = rawStrikes.map((s) => {
    // 1. GEX Wall (30%): magnitude of gamma exposure — how strong is the wall?
    const gexScore = Math.abs(s.gexTotal) / maxGexAbs;

    // 2. Max Pain alignment (35%): distance from max pain
    //    Within 1% → score 1.0 | Beyond 5% → score 0.0
    const distToMaxPain = maxPain > 0 ? Math.abs(s.strike - maxPain) / maxPain : 1;
    const maxPainScore = Math.max(0, 1 - distToMaxPain / 0.05);

    // 3. Notional OI (35%): dollar-weighted OI × multi-expiration convergence
    const notionalScore = s.notionalOI / maxNotional;
    const convergenceScore = s.highOIExpCount / maxExpCount;
    const notionalOIScore = notionalScore * 0.6 + convergenceScore * 0.4;

    const totalScore = 0.30 * gexScore + 0.35 * maxPainScore + 0.35 * notionalOIScore;

    return {
      strike: s.strike,
      totalScore,
      gexTotal: s.gexTotal,
      notionalOI: s.notionalOI,
      isSupport: s.strike < spot && s.gexTotal > 0,
      isResistance: s.strike > spot && s.gexTotal < 0,
    };
  });

  // ─── Helper to build SRLevel detail ─────────────────────────────────────
  const buildSRLevel = (s: ScoredStrike, type: "support" | "resistance"): SRLevel => {
    const raw = rawStrikes.find((r) => r.strike === s.strike)!;
    const gexScore = Math.abs(s.gexTotal) / maxGexAbs;
    const distToMaxPain = maxPain > 0 ? Math.abs(s.strike - maxPain) / maxPain : 1;
    const maxPainScore = Math.max(0, 1 - distToMaxPain / 0.05);
    const notionalScore = s.notionalOI / maxNotional;
    const convergenceScore = raw.highOIExpCount / maxExpCount;
    const notionalOIScore = notionalScore * 0.6 + convergenceScore * 0.4;

    return {
      strike: s.strike,
      type,
      confidence: Math.round(s.totalScore * 100),
      gexScore,
      maxPainScore,
      notionalOIScore,
      totalScore: s.totalScore,
      notionalOI: s.notionalOI,
      expirationsWithHighOI: raw.highOIExpCount,
      maxPainDistancePct: parseFloat((distToMaxPain * 100).toFixed(2)),
    };
  };

  // Best support: below spot, positive GEX (dealers long gamma = pinning), highest composite score
  const supportCandidates = scoredStrikes
    .filter((s) => s.strike < spot && s.gexTotal > 0)
    .sort((a, b) => b.totalScore - a.totalScore);

  // Best resistance: above spot, negative GEX (dealers short gamma = acceleration), highest composite score
  const resistanceCandidates = scoredStrikes
    .filter((s) => s.strike > spot && s.gexTotal < 0)
    .sort((a, b) => b.totalScore - a.totalScore);

  const support = supportCandidates[0]
    ? buildSRLevel(supportCandidates[0], "support")
    : null;
  const resistance = resistanceCandidates[0]
    ? buildSRLevel(resistanceCandidates[0], "resistance")
    : null;

  // ─── Directional Signal Components ──────────────────────────────────────

  // 1. Gamma Regime (20%): spot above/below gamma flip price
  const gammaRegimeNorm: number = spot > gammaFlip ? 1 : -1;
  const gammaLabel = gammaRegimeNorm > 0
    ? "Spot sobre Gamma Flip — dealers compran en caídas (entorno de baja vol)"
    : "Spot bajo Gamma Flip — dealers venden en rebotes (entorno de expansión)";

  // 2. Institutional Pressure (25%): net GEX bias normalized
  const instNorm = clamp(institutionalPressure / 100, -1, 1);
  const instLabel =
    institutionalPressure > 20 ? "Presión institucional alcista fuerte" :
    institutionalPressure > 5  ? "Sesgo alcista moderado" :
    institutionalPressure > -5 ? "Posicionamiento neutral — mercado en equilibrio" :
    institutionalPressure > -20 ? "Sesgo bajista moderado" :
    "Presión institucional bajista fuerte";

  // 3. Put/Call Ratio (15%): PCR < 0.7 → bullish (+1) | PCR > 1.2 → bearish (-1)
  const pcrNorm = clamp(1 - 4 * (putCallRatio - 0.7), -1, 1);
  const pcrLabel =
    putCallRatio < 0.7  ? "PCR bajo — optimismo especulativo" :
    putCallRatio > 1.2  ? "PCR alto — cobertura bajista institucional elevada" :
    "PCR neutral — mercado equilibrado";

  // 4. Confluence S/R Balance (25%): internal M5 balance + cross-methodology alignment
  const supSum = scoredStrikes
    .filter((s) => s.strike < spot && s.gexTotal > 0)
    .reduce((a, s) => a + s.totalScore, 0);
  const resSum = scoredStrikes
    .filter((s) => s.strike > spot && s.gexTotal < 0)
    .reduce((a, s) => a + s.totalScore, 0);
  const totalSR = supSum + resSum;
  const m5ConfluenceNorm = totalSR > 0 ? clamp((supSum - resSum) / totalSR, -1, 1) : 0;

  // Cross-methodology center bias: if the midpoint S/R of M2, M3, and M5 is above spot → bullish
  const center2 = (m2Support + m2Resistance) / 2;
  const center3 = (m3Support + m3Resistance) / 2;
  const center5 = support && resistance ? (support.strike + resistance.strike) / 2 : spot;
  const avgCenter = (center2 + center3 + center5) / 3;
  // Positive = avg center above spot = support dominates the range = bullish bias
  const centerBias = (avgCenter - spot) / spot;
  const crossAlignNorm = clamp(centerBias / 0.03, -1, 1);

  const confluenceNorm = clamp(m5ConfluenceNorm * 0.6 + crossAlignNorm * 0.4, -1, 1);

  // Count how many methodologies have support nearer than resistance to spot
  const supNearCount = [
    m2Support > 0 && m2Resistance > 0 && (spot - m2Support) < (m2Resistance - spot),
    m3Support > 0 && m3Resistance > 0 && (spot - m3Support) < (m3Resistance - spot),
    support && resistance && (spot - support.strike) < (resistance.strike - spot),
  ].filter(Boolean).length;

  const confluenceLabel =
    confluenceNorm > 0.3 ? `${supNearCount}/3 metodologías confirman soporte más cercano — convergencia alcista` :
    confluenceNorm < -0.3 ? `${3 - supNearCount}/3 metodologías confirman resistencia más cercana — convergencia bajista` :
    "Balance S/R sin sesgo claro entre metodologías — señal mixta";

  // 5. IV Skew 25Δ (15%): positive skew (puts > calls IV) = bearish hedge = negative signal
  const skewNorm = clamp(-avgSkew25d / 0.05, -1, 1);
  const skewLabel =
    avgSkew25d > 0.02  ? "Puts cotizan sobre calls — hedge bajista institucional activo" :
    avgSkew25d < -0.02 ? "Calls sobre puts — sesgo alcista de volatilidad implícita" :
    "Skew de volatilidad neutral — sin cobertura direccional clara";

  const signals: SignalComponent[] = [
    {
      name: "GAMMA REGIME",
      rawValue: gammaFlip,
      normalizedValue: gammaRegimeNorm,
      weight: 0.20,
      contribution: gammaRegimeNorm * 0.20,
      label: gammaLabel,
    },
    {
      name: "INST. PRESSURE",
      rawValue: institutionalPressure,
      normalizedValue: instNorm,
      weight: 0.25,
      contribution: instNorm * 0.25,
      label: instLabel,
    },
    {
      name: "PUT/CALL RATIO",
      rawValue: putCallRatio,
      normalizedValue: pcrNorm,
      weight: 0.15,
      contribution: pcrNorm * 0.15,
      label: pcrLabel,
    },
    {
      name: "CONFLUENCE S/R",
      rawValue: confluenceNorm,
      normalizedValue: confluenceNorm,
      weight: 0.25,
      contribution: confluenceNorm * 0.25,
      label: confluenceLabel,
    },
    {
      name: "IV SKEW 25Δ",
      rawValue: avgSkew25d,
      normalizedValue: skewNorm,
      weight: 0.15,
      contribution: skewNorm * 0.15,
      label: skewLabel,
    },
  ];

  const rawScore = signals.reduce((sum, s) => sum + s.contribution, 0); // -1 to +1
  const score = Math.round(rawScore * 100);                              // -100 to +100

  const verdict: "ALCISTA" | "BAJISTA" | "NEUTRAL" =
    score > 25 ? "ALCISTA" : score < -25 ? "BAJISTA" : "NEUTRAL";

  // Probability: 50% at score=0, scales up to ~95% at score=±100
  const probability = Math.min(95, Math.round(50 + Math.abs(rawScore) * 45));

  return {
    ticker,
    spot,
    maxPain,
    expirationUsed: primaryExp.expiration,
    expirationsAnalyzed: expDataList.length,
    support,
    resistance,
    scoredStrikes,
    signals,
    score,
    verdict,
    probability,
    m2Support,
    m2Resistance,
    m3Support,
    m3Resistance,
  };
}

// Utility: compute 25Δ skew for a single expiration
export function compute25dSkew(
  calls: RawOption5[],
  puts: RawOption5[],
  spot: number,
  T: number
): number {
  let best25Call: { iv: number; dist: number } | null = null;
  let best25Put: { iv: number; dist: number } | null = null;

  const strikeSet = new Set<number>([
    ...calls.map((c) => c.strike),
    ...puts.map((p) => p.strike),
  ]);

  for (const strike of Array.from(strikeSet)) {
    const call = calls.find((c) => c.strike === strike);
    const put = puts.find((p) => p.strike === strike);
    const callIV = call?.impliedVolatility ?? 0;
    const putIV = put?.impliedVolatility ?? 0;

    if (callIV > 0) {
      const d = deltaBS(spot, strike, T, RISK_FREE_RATE, callIV, true);
      const dist = Math.abs(d - 0.25);
      if (!best25Call || dist < best25Call.dist) best25Call = { iv: callIV, dist };
    }
    if (putIV > 0) {
      const d = deltaBS(spot, strike, T, RISK_FREE_RATE, putIV, false);
      const dist = Math.abs(Math.abs(d) - 0.25);
      if (!best25Put || dist < best25Put.dist) best25Put = { iv: putIV, dist };
    }
  }

  return best25Call && best25Put ? best25Put.iv - best25Call.iv : 0;
}
