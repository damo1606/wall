import { fetchStockData } from "@/lib/yahoo"

export async function GET() {
  const data = await fetchStockData("AAPL")
  return Response.json(data ?? { error: "Failed to fetch AAPL from Yahoo Finance" })
}
