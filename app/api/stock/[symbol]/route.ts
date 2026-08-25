import { fetchStockData } from "@/lib/yahoo"
import { requireAuth } from "@/lib/api-auth"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const denied = await requireAuth(); if (denied) return denied;
  const { symbol } = await params
  const data = await fetchStockData(symbol.toUpperCase(), true)

  if (!data) {
    return Response.json({ error: "Stock not found" }, { status: 404 })
  }

  return Response.json({ ...data, fetchedAt: new Date().toISOString() })
}
