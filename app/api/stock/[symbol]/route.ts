import { fetchStockData } from "@/lib/yahoo"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const data = await fetchStockData(symbol.toUpperCase(), true)

  if (!data) {
    return Response.json({ error: "Stock not found" }, { status: 404 })
  }

  return Response.json({ ...data, fetchedAt: new Date().toISOString() })
}
