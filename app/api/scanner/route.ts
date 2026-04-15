import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

const DEFAULT_TICKERS = ["SPY", "QQQ", "IWM", "AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "META", "AMD"];

async function getCredentials(): Promise<{ crumb: string; cookie: string }> {
  const res1 = await fetch("https://fc.yahoo.com", { headers: HEADERS, redirect: "follow" });
  const setCookie = res1.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(",").map((c) => c.split(";")[0].trim()).join("; ");
  const res2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...HEADERS, Cookie: cookie },
  });
  if (!res2.ok) throw new Error(`Could not get crumb (${res2.status})`);
  const crumb = await res2.text();
  if (!crumb || crumb.includes("<")) throw new Error("Invalid crumb");
  return { crumb, cookie };
}

function zScore(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return values.map((v) => (v - mean) / std);
}

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface AnomalyRow {
  ticker: string;
  spot: number;
  strike: number;
  type: "CALL" | "PUT";
  expiration: string;
  oi: number;
  volume: number;
  iv: number;
  volOiRatio: number;
  oiZScore: number;
  anomalyScore: number;
  bias: Bias;
}

function computeBias(type: "CALL" | "PUT", strike: number, spot: number, volOiRatio: number): Bias {
  const aboveSpot = strike >= spot;
  // CALLs above spot = bullish speculation
  // PUTs above spot = strong bearish hedge (unusual)
  // PUTs below spot = bearish protection
  // CALLs below spot = neutral (covered call / deep ITM)
  if (type === "CALL" && aboveSpot) return "BULLISH";
  if (type === "PUT") return "BEARISH";
  // CALL below spot: neutral unless heavy fresh flow
  if (type === "CALL" && !aboveSpot && volOiRatio >= 1) return "BULLISH";
  return "NEUTRAL";
}

async function scanTicker(
  ticker: string,
  cookie: string,
  crumb: string,
  expTs?: number
): Promise<AnomalyRow[]> {
  const dateParam = expTs ? `&date=${expTs}` : "";
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${crumb}${dateParam}`;
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie }, cache: "no-store" });
  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.optionChain?.result?.[0];
  if (!result) return [];

  const spot: number = result.quote?.regularMarketPrice ?? 0;
  const optData = result.options?.[0];
  if (!optData) return [];

  const firstExpTs: number = expTs ?? result.expirationDates?.[0] ?? 0;
  const expiration = new Date(firstExpTs * 1000).toISOString().split("T")[0];

  interface YahooOption {
    strike?: number;
    openInterest?: number;
    volume?: number;
    impliedVolatility?: number;
  }

  const rows: { strike: number; type: "CALL" | "PUT"; oi: number; volume: number; iv: number }[] = [];

  for (const c of (optData.calls ?? []) as YahooOption[]) {
    const strike = c.strike ?? 0;
    const oi = c.openInterest ?? 0;
    const volume = c.volume ?? 0;
    const iv = c.impliedVolatility ?? 0;
    if (oi < 10 || strike <= 0) continue;
    // Only scan strikes within ±15% of spot
    if (spot > 0 && (strike < spot * 0.85 || strike > spot * 1.15)) continue;
    rows.push({ strike, type: "CALL", oi, volume, iv });
  }

  for (const p of (optData.puts ?? []) as YahooOption[]) {
    const strike = p.strike ?? 0;
    const oi = p.openInterest ?? 0;
    const volume = p.volume ?? 0;
    const iv = p.impliedVolatility ?? 0;
    if (oi < 10 || strike <= 0) continue;
    if (spot > 0 && (strike < spot * 0.85 || strike > spot * 1.15)) continue;
    rows.push({ strike, type: "PUT", oi, volume, iv });
  }

  if (rows.length === 0) return [];

  const oiValues = rows.map((r) => r.oi);
  const zScores = zScore(oiValues);

  return rows.map((r, i) => {
    const volOiRatio = r.oi > 0 ? r.volume / r.oi : 0;
    const anomalyScore = parseFloat(
      (Math.max(0, zScores[i]) * 0.5 + Math.min(volOiRatio, 5) * 0.35 + Math.min(r.iv * 10, 3) * 0.15).toFixed(3)
    );
    const bias = computeBias(r.type, r.strike, spot, volOiRatio);
    return {
      ticker,
      spot: parseFloat(spot.toFixed(2)),
      strike: r.strike,
      type: r.type,
      expiration,
      oi: r.oi,
      volume: r.volume,
      iv: parseFloat((r.iv * 100).toFixed(1)),
      volOiRatio: parseFloat(volOiRatio.toFixed(2)),
      oiZScore: parseFloat(zScores[i].toFixed(2)),
      anomalyScore,
      bias,
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickerParam = searchParams.get("tickers");
    const tickers = tickerParam
      ? tickerParam.split(",").map((t) => t.trim().toUpperCase()).slice(0, 15)
      : DEFAULT_TICKERS;

    const expParam = searchParams.get("expiration");
    const expTs = expParam ? parseInt(expParam) : undefined;

    const { crumb, cookie } = await getCredentials();

    const results = await Promise.allSettled(
      tickers.map((t) => scanTicker(t, cookie, crumb, expTs))
    );

    const allRows: AnomalyRow[] = results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .filter((r) => r.anomalyScore > 0.5)
      .sort((a, b) => b.anomalyScore - a.anomalyScore)
      .slice(0, 100);

    return NextResponse.json({ rows: allRows, scannedTickers: tickers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
