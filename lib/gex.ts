import { gammaBS, vannaBS } from "./blackscholes";
import type { AnalysisResult, GexPoint, VannaPoint } from "@/types";

const RISK_FREE_RATE = 0.05;
const CONTRACT_SIZE = 100;

/** Dynamic liquidity filter: adapts to the ticker's OI scale.
 *  SPY (peak OI ~400k) → threshold ~1,200 | AAPL (~30k) → ~90 | small caps → 10 */
function minOIThreshold(options: RawOption[]): number {
  const maxOI = Math.max(...options.map((o) => o.openInterest), 1);
  return Math.max(10, maxOI * 0.003);
}

interface RawOption {
  strike: number;
  impliedVolatility: number;
  openInterest: number;
}

interface ProcessedOption {
  strike: number;
  iv: number;
  oi: number;
  type: "call" | "put";
  gex: number;
  vanna: number;
}

export function computeAnalysis(
  ticker: string,
  spot: number,
  expiration: string,
  availableExpirations: string[],
  rawCalls: RawOption[],
  rawPuts: RawOption[]
): AnalysisResult {
  const today = new Date();
  const expDate = new Date(expiration + "T00:00:00");
  const T = Math.max(
    (expDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
    0.001
  );

  const options: ProcessedOption[] = [];
  const minOI = minOIThreshold([...rawCalls, ...rawPuts]);

  for (const c of rawCalls) {
    if (!c.impliedVolatility || !c.openInterest || c.openInterest < minOI) continue;
    const g = gammaBS(spot, c.strike, T, RISK_FREE_RATE, c.impliedVolatility);
    const v = vannaBS(spot, c.strike, T, RISK_FREE_RATE, c.impliedVolatility);
    options.push({
      strike: c.strike,
      iv: c.impliedVolatility,
      oi: c.openInterest,
      type: "call",
      gex: g * c.openInterest * CONTRACT_SIZE * spot * spot,
      vanna: v * c.openInterest * CONTRACT_SIZE,
    });
  }

  for (const p of rawPuts) {
    if (!p.impliedVolatility || !p.openInterest || p.openInterest < minOI) continue;
    const g = gammaBS(spot, p.strike, T, RISK_FREE_RATE, p.impliedVolatility);
    const v = vannaBS(spot, p.strike, T, RISK_FREE_RATE, p.impliedVolatility);
    options.push({
      strike: p.strike,
      iv: p.impliedVolatility,
      oi: p.openInterest,
      type: "put",
      gex: -(g * p.openInterest * CONTRACT_SIZE * spot * spot),
      vanna: -(v * p.openInterest * CONTRACT_SIZE),
    });
  }

  if (options.length === 0) {
    throw new Error("No valid options data after filtering");
  }

  // Aggregate by strike
  const gexMap = new Map<number, number>();
  const vannaMap = new Map<number, number>();

  for (const opt of options) {
    gexMap.set(opt.strike, (gexMap.get(opt.strike) ?? 0) + opt.gex);
    vannaMap.set(opt.strike, (vannaMap.get(opt.strike) ?? 0) + opt.vanna);
  }

  const gexProfile: GexPoint[] = Array.from(gexMap.entries())
    .map(([strike, gex]) => ({ strike, gex }))
    .sort((a, b) => a.strike - b.strike);

  const vannaProfile: VannaPoint[] = Array.from(vannaMap.entries())
    .map(([strike, vanna]) => ({ strike, vanna }))
    .sort((a, b) => a.strike - b.strike);

  // Key levels
  const calls = options.filter((o) => o.type === "call");
  const puts = options.filter((o) => o.type === "put");

  const callWall = calls.reduce((m, o) => (o.oi > m.oi ? o : m), calls[0])?.strike ?? spot;
  const putWall = puts.reduce((m, o) => (o.oi > m.oi ? o : m), puts[0])?.strike ?? spot;

  // Gamma flip: strike where cumulative GEX is closest to zero
  let cum = 0;
  let gammaFlip = gexProfile[0]?.strike ?? spot;
  let minAbs = Infinity;
  for (const p of gexProfile) {
    cum += p.gex;
    if (Math.abs(cum) < minAbs) {
      minAbs = Math.abs(cum);
      gammaFlip = p.strike;
    }
  }

  const belowSpot = gexProfile.filter((p) => p.strike < spot);
  const aboveSpot = gexProfile.filter((p) => p.strike > spot);
  const support = (belowSpot.length > 0
    ? belowSpot.reduce((m, p) => (p.gex > m.gex ? p : m), belowSpot[0])
    : gexProfile.reduce((m, p) => (p.gex > m.gex ? p : m), gexProfile[0]))?.strike ?? spot * 0.97;
  const resistance = (aboveSpot.length > 0
    ? aboveSpot.reduce((m, p) => (p.gex < m.gex ? p : m), aboveSpot[0])
    : gexProfile.reduce((m, p) => (p.gex < m.gex ? p : m), gexProfile[0]))?.strike ?? spot * 1.03;

  // Put/Call Ratio (by open interest)
  const totalCallOI = calls.reduce((sum, o) => sum + o.oi, 0);
  const totalPutOI = puts.reduce((sum, o) => sum + o.oi, 0);
  const putCallRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

  // Institutional Pressure: net GEX bias normalized to -100 / +100
  const totalCallGEX = calls.reduce((sum, o) => sum + o.gex, 0);
  const totalPutGEX = Math.abs(puts.reduce((sum, o) => sum + o.gex, 0));
  const netGex = totalCallGEX - totalPutGEX;
  const institutionalPressure =
    totalCallGEX + totalPutGEX > 0
      ? (netGex / (totalCallGEX + totalPutGEX)) * 100
      : 0;

  // Dealer hedging flow model
  const steps = 60;
  const prices: number[] = [];
  const flows: number[] = [];

  for (let i = 0; i < steps; i++) {
    const price = spot * (0.85 + (0.3 * i) / (steps - 1));
    prices.push(parseFloat(price.toFixed(2)));
    let total = 0;
    for (const opt of options) {
      const g = gammaBS(price, opt.strike, T, RISK_FREE_RATE, opt.iv);
      let gex = g * opt.oi * CONTRACT_SIZE * price * price;
      if (opt.type === "put") gex = -gex;
      total += gex;
    }
    flows.push(total);
  }

  return {
    ticker,
    spot,
    expiration,
    availableExpirations,
    levels: { callWall, putWall, gammaFlip, support, resistance },
    gexProfile,
    vannaProfile,
    dealerFlow: { prices, flows },
    putCallRatio: parseFloat(putCallRatio.toFixed(2)),
    institutionalPressure: parseFloat(institutionalPressure.toFixed(1)),
    netGex,
  };
}
