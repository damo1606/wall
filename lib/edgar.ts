// EDGAR (SEC) — helpers compartidos por todos los crons de la integración.
//
// EDGAR es la base de datos pública de SEC (Securities and Exchange Commission).
// Free, oficial, estructurada en JSON. La única restricción es el header
// User-Agent identificable (sin él te devuelve 403). Rate limit: 10 req/s.
//
// Endpoints clave:
// - https://www.sec.gov/files/company_tickers.json  → mapeo ticker→CIK universal
// - https://data.sec.gov/submissions/CIK{cik}.json  → lista de filings por CIK
// - https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{file}  → documentos raw
//
// Doc oficial: https://www.sec.gov/edgar/sec-api-documentation

export const EDGAR_USER_AGENT = "Wall Research danielinmonrero12345@gmail.com"
export const EDGAR_HEADERS = {
  "User-Agent": EDGAR_USER_AGENT,
  "Accept": "application/json",
  "Accept-Encoding": "gzip, deflate",
}

// SEC rate-limit es 10 req/s. Con 3 workers y 200ms entre llamadas hacemos
// máximo ~15 req/s en bursts cortos, ~5 req/s sostenido. Margen cómodo.
export const EDGAR_CONCURRENCY = 3
export const EDGAR_RATE_LIMIT_MS = 200

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  delayMs = EDGAR_RATE_LIMIT_MS,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) break
      out[idx] = await fn(items[idx])
      if (delayMs > 0) await sleep(delayMs)
    }
  }))
  return out
}

// CIK formato: padded a 10 dígitos con ceros a la izquierda. AAPL es 320193 → "0000320193".
export const padCik = (cik: number | string): string =>
  String(cik).padStart(10, "0")

// SEC mapping ticker → CIK universal. ~14k tickers, single ~500KB JSON.
// Llamar una vez por backfill, cachear en memoria.
export type TickerCikEntry = {
  cik_str: number       // CIK como número (no padded)
  ticker: string        // ej. "AAPL"
  title: string         // ej. "Apple Inc."
}

export async function fetchTickerCikMap(): Promise<Map<string, TickerCikEntry>> {
  const r = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: EDGAR_HEADERS,
    cache: "no-store",
  })
  if (!r.ok) throw new Error(`SEC company_tickers ${r.status}`)
  const json = await r.json() as Record<string, TickerCikEntry>
  // El JSON viene como { "0": { cik_str, ticker, title }, "1": {...}, ... }
  const map = new Map<string, TickerCikEntry>()
  for (const entry of Object.values(json)) {
    // Algunos tickers tienen . o - (BRK.B, BF-B). Normalizamos.
    map.set(entry.ticker.toUpperCase(), entry)
  }
  return map
}

// Lista paginada de submissions de un CIK (formularios filed por la entidad).
// El JSON incluye recent (últimos ~1000) y enlaces a archivos older.json si hay más.
export type SubmissionsResponse = {
  cik: string
  name: string
  tickers: string[]
  recent: {
    accessionNumber: string[]
    filingDate: string[]
    reportDate: string[]
    form: string[]
    primaryDocument: string[]
    primaryDocDescription: string[]
    items: string[]   // para 8-K, comma-separated tipo "2.02,9.01"
  }
}

export async function fetchSubmissions(cikPadded: string): Promise<SubmissionsResponse | null> {
  const r = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
    headers: EDGAR_HEADERS,
    cache: "no-store",
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`SEC submissions ${cikPadded} ${r.status}`)
  // El JSON tiene shape { cik, name, tickers, filings: { recent: {...} } }
  // pero por simplicidad aquí aplanamos: la propiedad relevante es filings.recent.
  type Raw = { cik: string; name: string; tickers: string[]; filings: { recent: SubmissionsResponse["recent"] } }
  const j = await r.json() as Raw
  return {
    cik: j.cik,
    name: j.name,
    tickers: j.tickers ?? [],
    recent: j.filings?.recent ?? {
      accessionNumber: [], filingDate: [], reportDate: [], form: [],
      primaryDocument: [], primaryDocDescription: [], items: [],
    },
  }
}

// Descarga un documento crudo de un filing (típicamente XML o HTML).
// accessionNumber viene con dashes (0000320193-23-000001); en URL se quitan.
export async function fetchFilingDocument(
  cikPadded: string,
  accessionNumber: string,
  primaryDocument: string,
): Promise<string | null> {
  const accNoDashes = accessionNumber.replace(/-/g, "")
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cikPadded)}/${accNoDashes}/${primaryDocument}`
  const r = await fetch(url, { headers: EDGAR_HEADERS, cache: "no-store" })
  if (!r.ok) return null
  return await r.text()
}
