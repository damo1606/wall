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

function deduplicateDates(rawDates: number[]): string[] {
  const seen = new Set<string>();
  const expirations: string[] = [];
  for (const ts of rawDates.sort((a, b) => a - b)) {
    const dateStr = new Date(ts * 1000).toISOString().split("T")[0];
    if (!seen.has(dateStr)) {
      seen.add(dateStr);
      expirations.push(dateStr);
    }
  }
  return expirations;
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  try {
    const { crumb, cookie } = await getCredentials();

    // Primary fetch: no date param → returns full expirationDates list
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?crumb=${crumb}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Cookie: cookie },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);
    const json = await res.json();
    const result = json?.optionChain?.result?.[0];
    if (!result) throw new Error(`No options data for ${ticker}. Verify the ticker has listed options on US exchanges.`);

    const rawDates: number[] = [];

    if (Array.isArray(result.expirationDates)) {
      rawDates.push(...result.expirationDates);
    }

    // Also collect from options array if present
    if (Array.isArray(result.options)) {
      for (const opt of result.options) {
        if (opt.expirationDate) rawDates.push(opt.expirationDate);
      }
    }

    let expirations = deduplicateDates(rawDates);

    // If we have very few dates, try fetching with a far-future date to discover LEAPS
    if (expirations.length < 5) {
      try {
        const farFutureTs = Math.floor(new Date("2027-01-01T12:00:00Z").getTime() / 1000);
        const url2 = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?crumb=${crumb}&date=${farFutureTs}`;
        const res2 = await fetch(url2, {
          headers: { ...HEADERS, Cookie: cookie },
          cache: "no-store",
        });
        if (res2.ok) {
          const json2 = await res2.json();
          const result2 = json2?.optionChain?.result?.[0];
          if (result2 && Array.isArray(result2.expirationDates)) {
            rawDates.push(...result2.expirationDates);
          }
        }
        expirations = deduplicateDates(rawDates);
      } catch {
        // ignore fallback errors
      }
    }

    const spot = result.quote?.regularMarketPrice ?? 0;

    return NextResponse.json({ expirations, spot });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
