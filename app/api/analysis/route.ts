import { NextRequest, NextResponse } from "next/server";
import { computeAnalysis } from "@/lib/gex";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

async function getCredentials(): Promise<{ crumb: string; cookie: string }> {
  // Step 1: hit Yahoo to get session cookie
  const res1 = await fetch("https://fc.yahoo.com", {
    headers: HEADERS,
    redirect: "follow",
  });

  const setCookie = res1.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .join("; ");

  // Step 2: exchange cookie for crumb
  const res2 = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    { headers: { ...HEADERS, Cookie: cookie } }
  );

  if (!res2.ok) throw new Error(`Could not get crumb (${res2.status})`);
  const crumb = await res2.text();
  if (!crumb || crumb.includes("<")) throw new Error("Invalid crumb response");

  return { crumb, cookie };
}

async function fetchOptions(
  ticker: string,
  cookie: string,
  crumb: string,
  dateTs?: number
) {
  const params = new URLSearchParams({ crumb });
  if (dateTs) params.set("date", String(dateTs));

  const url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?${params}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Cookie: cookie },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);
  const json = await res.json();
  const result = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${ticker}`);
  return result;
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const expiration = request.nextUrl.searchParams.get("expiration") ?? undefined;

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  try {
    const { crumb, cookie } = await getCredentials();

    const initial = await fetchOptions(ticker, cookie, crumb);

    const spot: number = initial.quote?.regularMarketPrice;
    if (!spot) {
      return NextResponse.json(
        { error: `No price data for ${ticker}` },
        { status: 400 }
      );
    }

    const availableExpirations: string[] = (
      initial.expirationDates as number[]
    ).map((ts) => new Date(ts * 1000).toISOString().split("T")[0]);

    let optData = initial.options?.[0];
    let selectedExpiration = availableExpirations[0];

    if (expiration && expiration !== selectedExpiration) {
      // Use the exact timestamp from Yahoo's expirationDates list to avoid
      // mismatches (Yahoo uses midnight UTC, not noon UTC)
      const exactTs = (initial.expirationDates as number[]).find(
        (ts) => new Date(ts * 1000).toISOString().split("T")[0] === expiration
      );
      if (exactTs) {
        const specific = await fetchOptions(ticker, cookie, crumb, exactTs);
        optData = specific.options?.[0];
        selectedExpiration = expiration;
      }
    }

    if (!optData) {
      return NextResponse.json(
        { error: "No options chain available" },
        { status: 400 }
      );
    }

    const rawCalls = (optData.calls ?? []).map((c: any) => ({
      strike: c.strike ?? 0,
      impliedVolatility: c.impliedVolatility ?? 0,
      openInterest: c.openInterest ?? 0,
    }));

    const rawPuts = (optData.puts ?? []).map((p: any) => ({
      strike: p.strike ?? 0,
      impliedVolatility: p.impliedVolatility ?? 0,
      openInterest: p.openInterest ?? 0,
    }));

    const result = computeAnalysis(
      ticker,
      spot,
      selectedExpiration,
      availableExpirations,
      rawCalls,
      rawPuts
    );

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
