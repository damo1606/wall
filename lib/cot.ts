import type { Currency, COTData } from '@/types/forex'

// CFTC Financial Futures legacy report (weekly, public)
const CFTC_URL = 'https://www.cftc.gov/files/dea/newcot/FinFut.txt'

// Mapeo de nombre de contrato CFTC → divisa
const CONTRACT_MAP: Record<string, Currency> = {
  'EURO FX':         'EUR',
  'BRITISH POUND':   'GBP',
  'JAPANESE YEN':    'JPY',
  'SWISS FRANC':     'CHF',
  'CANADIAN DOLLAR': 'CAD',
  'AUSTRALIAN DOLLAR': 'AUD',
  'NEW ZEALAND DOLLAR': 'NZD',
}

export async function fetchCOTData(): Promise<COTData> {
  const res = await fetch(CFTC_URL, {
    next: { revalidate: 60 * 60 * 24 }, // cache 24h — datos semanales
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`CFTC fetch failed: ${res.status}`)

  const text = await res.text()
  return parseCOT(text)
}

export function parseCOT(text: string): COTData {
  const result: COTData = {}
  const lines = text.split('\n')

  // El archivo tiene una línea de header seguida de datos
  // Columnas relevantes (0-indexed):
  //   0: Market_and_Exchange_Names
  //   5: NonComm_Positions_Long_All
  //   6: NonComm_Positions_Short_All
  for (const line of lines) {
    const cols = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
    if (cols.length < 8) continue

    const name = cols[0].toUpperCase()
    const currency = findCurrency(name)
    if (!currency) continue

    const longs  = parseInt(cols[5], 10)
    const shorts = parseInt(cols[6], 10)
    if (isNaN(longs) || isNaN(shorts)) continue

    const net = longs - shorts
    result[currency] = net > 0 ? 1 : net < 0 ? -1 : 0
    // Solo tomamos la primera ocurrencia (más reciente) por divisa
  }

  // USD = inverso del promedio de los otros 7
  const others = (['EUR','GBP','JPY','CHF','CAD','AUD','NZD'] as Currency[])
    .map(c => result[c] ?? 0)
  const avgOthers = others.reduce((a, b) => a + b, 0) / others.length
  result['USD'] = avgOthers > 0 ? -1 : avgOthers < 0 ? 1 : 0

  return result
}

function findCurrency(name: string): Currency | null {
  for (const [key, currency] of Object.entries(CONTRACT_MAP)) {
    if (name.startsWith(key)) return currency
  }
  return null
}
