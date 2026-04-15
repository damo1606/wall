import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  try {
    // Get crumb + cookie for authenticated requests
    const res0 = await fetch("https://fc.yahoo.com", { headers: HEADERS, redirect: "follow" });
    const setCookie = res0.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(",").map((c) => c.split(";")[0].trim()).join("; ");
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...HEADERS, Cookie: cookie },
    });
    const crumb = crumbRes.ok ? await crumbRes.text() : "";
    const authHeaders = { ...HEADERS, Cookie: cookie };

    // v1/finance/search with auth
    const url1 = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=true&enableNavLinks=false${crumb ? `&crumb=${crumb}` : ""}`;
    const res1 = await fetch(url1, { headers: authHeaders, cache: "no-store" });

    if (res1.ok) {
      const json = await res1.json();
      const quotes = json?.quotes ?? [];
      const results: SearchResult[] = quotes
        .filter((q: any) => ["EQUITY", "ETF", "INDEX"].includes(q.quoteType))
        .map((q: any) => ({
          symbol:   q.symbol ?? "",
          name:     q.shortname ?? q.longname ?? q.symbol ?? "",
          exchange: q.exchDisp ?? q.exchange ?? "",
          type:     q.quoteType ?? "",
        }))
        .filter((r: SearchResult) => r.symbol);
      if (results.length > 0) return NextResponse.json({ results });
    }

    // Fallback: autocomplete endpoint
    const url2 = `https://query1.finance.yahoo.com/v6/finance/autocomplete?query=${encodeURIComponent(q)}&lang=en&region=US`;
    const res2 = await fetch(url2, { headers: authHeaders, cache: "no-store" });
    if (!res2.ok) return NextResponse.json({ results: [] });

    const json2 = await res2.json();
    const items = json2?.ResultSet?.Result ?? [];
    const results2: SearchResult[] = items
      .filter((r: any) => r.symbol && !r.symbol.includes("="))
      .slice(0, 8)
      .map((r: any) => ({
        symbol:   r.symbol ?? "",
        name:     r.name ?? r.symbol ?? "",
        exchange: r.exch ?? "",
        type:     r.typeDisp ?? "",
      }));

    return NextResponse.json({ results: results2 });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
