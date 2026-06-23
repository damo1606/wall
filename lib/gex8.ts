// M8 — Volume/OI Flow Imbalance & Liquidez
//
// Mide el flujo FRESCO de opciones (volumen de hoy) frente al posicionamiento
// ESTÁTICO (open interest acumulado), y evalúa si el subyacente es operable.
//
// Dos salidas independientes:
//  1. flowImbalance / freshFlowRatio → dinero nuevo entrando (posible squeeze o
//     evento que la foto estática de GEX no capta).
//  2. tradeable / liquidityTier → gate de liquidez: ¿hay OI y volumen suficientes
//     near-the-money para entrar Y, sobre todo, poder cerrar la posición?
//
// Diseño aditivo: M8 NO altera M1–M7. Solo su flag `tradeable` se conecta a SORE
// (reusando el codepath de suspensión existente), como un filtro de seguridad.

const NTM_BAND = 0.10;            // ±10% del spot = near-the-money (zona operable)
const OI_MIN_TRADEABLE = 500;     // OI NTM mínimo (ambas patas) para operar
const VOL_MIN_TRADEABLE = 50;     // algo de actividad fresca hoy
const OI_TIER_BAJA = 2000;
const OI_TIER_MEDIA = 10000;

export interface RawOption8 {
  strike: number;
  openInterest: number;
  volume: number;
}

export interface ExpData8 {
  expiration: string;
  calls: RawOption8[];
  puts: RawOption8[];
}

export interface Analysis8Result {
  ticker: string;
  spot: number;
  // Flujo fresco vs posicionamiento estático
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
  volumePcr: number;       // put vol / call vol (flujo direccional de hoy)
  oiPcr: number;           // put OI / call OI (posicionamiento acumulado)
  flowImbalance: number;   // -100..+100: call-dominado (+) vs put-dominado (−), por volumen
  freshFlowRatio: number;  // volumen NTM / OI NTM: cuán "nuevo" es el posicionamiento
  // Liquidez
  ntmVolume: number;
  ntmOpenInterest: number;
  liquidityTier: "ALTA" | "MEDIA" | "BAJA" | "ILÍQUIDO";
  tradeable: boolean;      // false → no operable (gate de seguridad para SORE)
  // Señal consolidada
  score: number;           // -100..+100: sesgo de flujo fresco
  verdict: "ACUMULACIÓN" | "DISTRIBUCIÓN" | "NEUTRAL";
  notes: string[];
}

export function computeAnalysis8(
  ticker: string,
  spot: number,
  expDataList: ExpData8[],
): Analysis8Result {
  let callVolume = 0, putVolume = 0, callOI = 0, putOI = 0;
  let ntmVolume = 0, ntmOpenInterest = 0;

  const isNtm = (strike: number) => spot > 0 && Math.abs(strike - spot) / spot <= NTM_BAND;

  for (const exp of expDataList) {
    for (const c of exp.calls ?? []) {
      const v = c.volume ?? 0, oi = c.openInterest ?? 0;
      callVolume += v; callOI += oi;
      if (isNtm(c.strike)) { ntmVolume += v; ntmOpenInterest += oi; }
    }
    for (const p of exp.puts ?? []) {
      const v = p.volume ?? 0, oi = p.openInterest ?? 0;
      putVolume += v; putOI += oi;
      if (isNtm(p.strike)) { ntmVolume += v; ntmOpenInterest += oi; }
    }
  }

  const totalVol = callVolume + putVolume;
  const volumePcr = callVolume > 0 ? parseFloat((putVolume / callVolume).toFixed(2)) : 0;
  const oiPcr = callOI > 0 ? parseFloat((putOI / callOI).toFixed(2)) : 0;
  const flowImbalance = totalVol > 0
    ? parseFloat((((callVolume - putVolume) / totalVol) * 100).toFixed(1))
    : 0;
  const freshFlowRatio = ntmOpenInterest > 0
    ? parseFloat((ntmVolume / ntmOpenInterest).toFixed(3))
    : 0;

  // ── Liquidez ──────────────────────────────────────────────────────────────
  const tradeable = ntmOpenInterest >= OI_MIN_TRADEABLE && ntmVolume >= VOL_MIN_TRADEABLE;
  const liquidityTier: Analysis8Result["liquidityTier"] =
    !tradeable ? "ILÍQUIDO" :
    ntmOpenInterest < OI_TIER_BAJA ? "BAJA" :
    ntmOpenInterest < OI_TIER_MEDIA ? "MEDIA" : "ALTA";

  // ── Señal de flujo fresco ───────────────────────────────────────────────────
  // Dirección (flowImbalance) amortiguada por cuán fresco es el posicionamiento.
  // Sin flujo nuevo relevante (freshFlowRatio bajo) → la señal direccional se diluye.
  const freshness = Math.min(1, freshFlowRatio * 2);
  const score = Math.round(Math.max(-100, Math.min(100, flowImbalance * freshness)));
  const verdict: Analysis8Result["verdict"] =
    score > 25 ? "ACUMULACIÓN" : score < -25 ? "DISTRIBUCIÓN" : "NEUTRAL";

  // ── Notas ─────────────────────────────────────────────────────────────────
  const notes: string[] = [];
  if (!tradeable) {
    notes.push(`Liquidez insuficiente: OI NTM ${ntmOpenInterest} (mín ${OI_MIN_TRADEABLE}), vol NTM ${ntmVolume} (mín ${VOL_MIN_TRADEABLE}). No operable — riesgo de no poder cerrar la posición.`);
  } else {
    notes.push(`Liquidez ${liquidityTier}: OI NTM ${ntmOpenInterest}, vol NTM ${ntmVolume}.`);
  }
  if (freshFlowRatio > 0.5) {
    notes.push(`Flujo fresco elevado (vol/OI NTM ${freshFlowRatio}): dinero nuevo entrando — posible evento/squeeze; cautela al vender prima.`);
  }
  if (verdict !== "NEUTRAL") {
    notes.push(`Sesgo de flujo ${verdict} (score ${score}): volumen ${flowImbalance >= 0 ? "call" : "put"}-dominado hoy (vol PCR ${volumePcr}) vs OI PCR ${oiPcr}. Nota: el volumen de puts puede ser cobertura, no dirección.`);
  }

  return {
    ticker, spot,
    callVolume, putVolume, callOI, putOI,
    volumePcr, oiPcr, flowImbalance, freshFlowRatio,
    ntmVolume, ntmOpenInterest, liquidityTier, tradeable,
    score, verdict, notes,
  };
}
