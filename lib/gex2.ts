import { gammaBS } from "./blackscholes";
import type { Analysis2Result, StrikeData } from "@/types";

const RISK_FREE_RATE = 0.043;
const CONTRACT_SIZE = 100;
const MAX_DISTANCE = 0.15;

function minOIThreshold(rawCalls: RawOption[], rawPuts: RawOption[]): number {
  const maxOI = Math.max(...rawCalls.map((c) => c.openInterest), ...rawPuts.map((p) => p.openInterest), 1);
  return Math.max(10, maxOI * 0.003);
}

interface RawOption {
  strike: number;
  impliedVolatility: number;
  openInterest: number;
}

function zscore(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return values.map(() => 0);
  return values.map((v) => (v - mean) / std);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeAnalysis2(
  ticker: string,
  spot: number,
  expiration: string,
  availableExpirations: string[],
  rawCalls: RawOption[],
  rawPuts: RawOption[]
): Analysis2Result {
  const today = new Date();
  const expDate = new Date(expiration + "T00:00:00");
  const T = Math.max(
    (expDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
    0.001
  );

  // All unique strikes
  const allStrikes = Array.from(
    new Set([...rawCalls.map((c) => c.strike), ...rawPuts.map((p) => p.strike)])
  ).sort((a, b) => a - b);

  // Build per-strike data
  const strikeData: StrikeData[] = allStrikes.map((strike) => {
    const call = rawCalls.find((c) => c.strike === strike);
    const put = rawPuts.find((p) => p.strike === strike);

    const callOI = call?.openInterest ?? 0;
    const putOI = put?.openInterest ?? 0;
    const callIV = call?.impliedVolatility ?? 0;
    const putIV = put?.impliedVolatility ?? 0;

    const gCall = gammaBS(spot, strike, T, RISK_FREE_RATE, callIV);
    const gPut = gammaBS(spot, strike, T, RISK_FREE_RATE, putIV);

    const gexCall = callOI * gCall * spot * spot * CONTRACT_SIZE;
    const gexPut = -(putOI * gPut * spot * spot * CONTRACT_SIZE);
    const totalGEX = gexCall + gexPut;

    const pcr = callOI > 0 ? putOI / callOI : null;

    return {
      strike,
      callOI,
      putOI,
      gexCall,
      gexPut,
      totalGEX,
      pcr: pcr ?? -1, // -1 = sin datos, se reemplaza con mediana
      zGex: 0,
      zPcr: 0,
      institutionalPressure: 0,
    };
  });

  // 1. Filter to ±15% from spot AND dynamic liquidity threshold
  const lower = spot * (1 - MAX_DISTANCE);
  const upper = spot * (1 + MAX_DISTANCE);
  const minOI = minOIThreshold(rawCalls, rawPuts);
  let filtered = strikeData.filter(
    (d) => d.strike >= lower && d.strike <= upper && (d.callOI + d.putOI) >= minOI
  );

  // Fallback: if too few strikes, relax OI filter
  if (filtered.length < 5) {
    filtered = strikeData.filter((d) => d.strike >= lower && d.strike <= upper);
  }

  if (filtered.length === 0) {
    filtered = strikeData.slice(
      Math.max(0, Math.floor(strikeData.length / 2) - 10),
      Math.floor(strikeData.length / 2) + 10
    );
  }

  // 2. Replace missing PCR with median (only within filtered set)
  const validPCRs = filtered.filter((d) => d.pcr >= 0).map((d) => d.pcr);
  const medPCR = validPCRs.length > 0 ? median(validPCRs) : 1;
  filtered.forEach((d) => {
    if (d.pcr < 0) d.pcr = medPCR;
  });

  // 3. Z-Score normalization ONLY on filtered strikes
  const zGexArr = zscore(filtered.map((d) => d.totalGEX));
  const zPcrArr = zscore(filtered.map((d) => d.pcr));

  filtered.forEach((d, i) => {
    d.zGex = zGexArr[i];
    d.zPcr = zPcrArr[i];
    d.institutionalPressure = d.zGex + d.zPcr;
  });

  // Support: below spot, GEX > 0, PCR > 1 → max institutional pressure
  let supports = filtered.filter((d) => d.strike < spot && d.totalGEX > 0 && d.pcr > 1);
  if (supports.length === 0) supports = filtered.filter((d) => d.strike < spot);
  const supportRow = supports.reduce(
    (max, d) => (d.institutionalPressure > max.institutionalPressure ? d : max),
    supports[0]
  );

  // Resistance: above spot, GEX < 0, PCR < 1 → min institutional pressure
  let resistances = filtered.filter((d) => d.strike > spot && d.totalGEX < 0 && d.pcr < 1);
  if (resistances.length === 0) resistances = filtered.filter((d) => d.strike > spot);
  const resistanceRow = resistances.reduce(
    (min, d) => (d.institutionalPressure < min.institutionalPressure ? d : min),
    resistances[0]
  );

  return {
    ticker,
    spot,
    expiration,
    availableExpirations,
    support: supportRow?.strike ?? spot * 0.97,
    resistance: resistanceRow?.strike ?? spot * 1.03,
    filteredStrikes: filtered,
  };
}
