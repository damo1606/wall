import { NextResponse } from "next/server";
import { computeAnalysis } from "@/lib/gex";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

const SECTOR_ETFS = [
  { ticker: "SPY",  label: "S&P 500",           group: "broad"       },
  { ticker: "QQQ",  label: "Nasdaq 100",         group: "broad"       },
  { ticker: "XLK",  label: "Tecnología",         group: "sector"      },
  { ticker: "XLE",  label: "Energía",            group: "sector"      },
  { ticker: "XLF",  label: "Finanzas",           group: "sector"      },
  { ticker: "XLV",  label: "Salud",              group: "sector"      },
  { ticker: "XLI",  label: "Industriales",       group: "sector"      },
  { ticker: "XLY",  label: "Cons. Discrecional", group: "sector"      },
  { ticker: "XLP",  label: "Cons. Básico",       group: "sector"      },
  { ticker: "XLC",  label: "Comunicaciones",     group: "sector"      },
  { ticker: "GLD",  label: "Oro",                group: "alternative" },
  { ticker: "TLT",  label: "Bonos 20Y",          group: "alternative" },
] as const;

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

async function fetchOptions(ticker: string, cookie: string, crumb: string) {
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${crumb}`;
  const res = await fetch(url, { headers: { ...HEADERS, Cookie: cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status} for ${ticker}`);
  const json = await res.json();
  const result = json?.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for ${ticker}`);
  return result;
}

function toVerdict(pressure: number): "ALCISTA" | "BAJISTA" | "NEUTRAL" {
  if (pressure > 15)  return "ALCISTA";
  if (pressure < -15) return "BAJISTA";
  return "NEUTRAL";
}

export async function GET() {
  try {
    const { crumb, cookie } = await getCredentials();

    const results = await Promise.allSettled(
      SECTOR_ETFS.map(async ({ ticker, label, group }) => {
        const data  = await fetchOptions(ticker, cookie, crumb);
        const spot: number = data.quote?.regularMarketPrice;
        if (!spot) throw new Error(`No price for ${ticker}`);

        const optData = data.options?.[0];
        if (!optData) throw new Error(`No options chain for ${ticker}`);

        const expirationDates: number[] = data.expirationDates ?? [];
        const availableExpirations = expirationDates.map(
          (ts) => new Date(ts * 1000).toISOString().split("T")[0]
        );
        const primaryExp = availableExpirations[0] ?? "";

        const calls = (optData.calls ?? []).map((c: any) => ({
          strike: c.strike ?? 0,
          impliedVolatility: c.impliedVolatility ?? 0,
          openInterest: c.openInterest ?? 0,
        }));
        const puts = (optData.puts ?? []).map((p: any) => ({
          strike: p.strike ?? 0,
          impliedVolatility: p.impliedVolatility ?? 0,
          openInterest: p.openInterest ?? 0,
        }));

        const analysis = computeAnalysis(ticker, spot, primaryExp, availableExpirations, calls, puts);

        return {
          ticker,
          label,
          group,
          spot,
          netGex:               analysis.netGex,
          institutionalPressure: analysis.institutionalPressure,
          putCallRatio:         analysis.putCallRatio,
          gammaFlip:            analysis.levels.gammaFlip,
          support:              analysis.levels.support,
          resistance:           analysis.levels.resistance,
          verdict:              toVerdict(analysis.institutionalPressure),
        };
      })
    );

    const etfs = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        ticker:               SECTOR_ETFS[i].ticker,
        label:                SECTOR_ETFS[i].label,
        group:                SECTOR_ETFS[i].group,
        spot:                 0,
        netGex:               0,
        institutionalPressure: 0,
        putCallRatio:         0,
        gammaFlip:            0,
        support:              0,
        resistance:           0,
        verdict:              "NEUTRAL" as const,
        error:                (r.reason as Error).message,
      };
    });

    // Ordenar: primero ALCISTA (mayor pressure), luego NEUTRAL, luego BAJISTA
    etfs.sort((a, b) => b.institutionalPressure - a.institutionalPressure);

    return NextResponse.json({ etfs, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
