import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

async function getCredentials(): Promise<{ crumb: string; cookie: string }> {
  const res1 = await fetch("https://fc.yahoo.com", {
    headers: HEADERS,
    redirect: "follow",
  });
  const setCookie = res1.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .join("; ");

  const res2 = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    { headers: { ...HEADERS, Cookie: cookie } }
  );
  if (!res2.ok) throw new Error(`Could not get crumb (${res2.status})`);
  const crumb = await res2.text();
  if (!crumb || crumb.includes("<")) throw new Error("Invalid crumb");
  return { crumb, cookie };
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const range = request.nextUrl.searchParams.get("range") ?? "3mo";

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  try {
    const { crumb, cookie } = await getCredentials();

    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}&crumb=${crumb}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Cookie: cookie },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);
    const json = await res.json();

    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`No chart data for ${ticker}`);

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators.quote[0];

    const candles = timestamps
      .map((ts, i) => ({
        time: new Date(ts * 1000).toISOString().split("T")[0],
        open: quote.open[i] != null ? parseFloat(quote.open[i].toFixed(2)) : null,
        high: quote.high[i] != null ? parseFloat(quote.high[i].toFixed(2)) : null,
        low: quote.low[i] != null ? parseFloat(quote.low[i].toFixed(2)) : null,
        close: quote.close[i] != null ? parseFloat(quote.close[i].toFixed(2)) : null,
      }))
      .filter((c) => c.open && c.high && c.low && c.close);

    return NextResponse.json({ candles });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
