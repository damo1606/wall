import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = (searchParams.get("tickers") ?? "SPY").split(",").map((t) => t.trim().toUpperCase()).slice(0, 20);
    const symbols = tickers.join(",");

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) throw new Error(`Yahoo Finance error ${res.status}`);

    const json = await res.json();
    const quotes = json?.quoteResponse?.result ?? [];

    const prices: Record<string, { price: number; change: number; changePct: number }> = {};
    for (const q of quotes) {
      prices[q.symbol] = {
        price: parseFloat((q.regularMarketPrice ?? 0).toFixed(2)),
        change: parseFloat((q.regularMarketChange ?? 0).toFixed(2)),
        changePct: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
      };
    }

    return NextResponse.json({ prices });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
