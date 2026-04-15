import { fetchStockData } from "@/lib/yahoo"
import { DJIA_SYMBOLS, SP500_SYMBOLS, NASDAQ100_SYMBOLS, RUSSELL_SYMBOLS } from "@/lib/symbols"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const universe = searchParams.get("universe") ?? "dia"
  const limit    = parseInt(searchParams.get("limit") ?? "50")

  const symbols =
    universe === "dia"     ? DJIA_SYMBOLS :
    universe === "nasdaq"  ? NASDAQ100_SYMBOLS :
    universe === "russell" ? RUSSELL_SYMBOLS :
    SP500_SYMBOLS.slice(0, limit)

  const results = await Promise.allSettled(symbols.map(fetchStockData))

  const stocks = results
    .filter(
      (r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof fetchStockData>>>> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value)

  return Response.json({ stocks, total: stocks.length })
}
