export type GuruData = {
  symbol: string
  company: string
  sector: string
  currentPrice: number
  high52w: number
  dropFrom52w: number
  gfScore: number
  rankFinancialStrength: number
  rankProfitability: number
  rankGrowth: number
  roic: number
  debtToEquity: number
  peRatio: number
  gfValue: number
  gfValuation: string
  marginGfValue: number
}

const BASE = "https://api.gurufocus.com/public/user"

export async function fetchGuruData(symbol: string): Promise<GuruData | null> {
  try {
    const key = process.env.GURUFOCUS_API_KEY
    if (!key) return null

    const res = await fetch(`${BASE}/${key}/stock/${symbol}/summary`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null

    const data = await res.json()
    const g = data?.summary?.general
    if (!g) return null

    const currentPrice = parseFloat(g.price) || 0
    const high52w = parseFloat(g.price52whigh) || 0
    const dropFrom52w = high52w > 0
      ? ((currentPrice - high52w) / high52w) * 100
      : 0

    return {
      symbol,
      company: g.company ?? symbol,
      sector: g.sector ?? "",
      currentPrice,
      high52w,
      dropFrom52w,
      gfScore: parseInt(g.gf_score) || 0,
      rankFinancialStrength: parseInt(g.rank_financial_strength) || 0,
      rankProfitability: parseInt(g.rank_profitability) || 0,
      rankGrowth: parseInt(g.rank_growth) || 0,
      roic: parseFloat(g.roic) || 0,
      debtToEquity: parseFloat(g.debt2equity) || 0,
      peRatio: parseFloat(g.pe_ratio) || 0,
      gfValue: parseFloat(g.gf_value) || 0,
      gfValuation: g.gf_valuation ?? "",
      marginGfValue: parseFloat(g.margin_gf_value) || 0,
    }
  } catch {
    return null
  }
}
