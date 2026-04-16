import { NextRequest, NextResponse } from "next/server"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export type NewsItem = {
  title: string
  publisher: string
  link: string
  publishedAt: string  // ISO date string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=6&quotesCount=0&enableFuzzyQuery=false`
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: "https://finance.yahoo.com/",
      },
      next: { revalidate: 900 }, // cache 15 min
    })

    if (!res.ok) throw new Error(`Yahoo news ${res.status}`)

    const json = await res.json()
    const raw: Array<{
      title?: string
      publisher?: string
      link?: string
      providerPublishTime?: number
    }> = json?.news ?? []

    const items: NewsItem[] = raw
      .filter(n => n.title && n.link)
      .slice(0, 5)
      .map(n => ({
        title:       n.title!,
        publisher:   n.publisher ?? "",
        link:        n.link!,
        publishedAt: n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString()
          : new Date().toISOString(),
      }))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
