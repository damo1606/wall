import type { Currency, COTData } from '@/types/forex'

// CFTC Financial Futures legacy report (weekly, public)
const CFTC_URL = 'https://www.cftc.gov/dea/newcot/FinFutWk.txt'

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

// ─── Índices bursátiles (S&P 500, Nasdaq, Dow, Russell) ─────────────────────
//
// Mismo archivo semanal (reporte "Financial Futures"), pero es TFF, no Legacy:
// no existe columna "Non-Commercial" — clasifica por Dealer / Asset Manager /
// Leveraged Money / Other Reportables. Usamos Leveraged Money (fondos
// apalancados/especulativos): es el equivalente TFF más cercano al "dinero
// especulativo" que NonComm mide en el reporte Legacy que usan las divisas.
// Columnas (0-indexed, confirmadas contra el archivo real del CFTC):
//   7  Open_Interest_All
//   14 Lev_Money_Positions_Long_All
//   15 Lev_Money_Positions_Short_All
//
// Nota: las columnas 5/6 que usa `parseCOT` arriba para divisas NO son
// NonComm_Long/Short en este archivo — son región/código de commodity. Ese
// parser lee columnas equivocadas para un formato que además no es el que cree
// (Legacy vs TFF). No se toca aquí porque cambia una señal ya en producción;
// lib/cot.ts necesita ese fix aparte.

export type IndexSymbol = 'SPX' | 'NDX' | 'DJI' | 'RUT'

// Un contrato representativo y líquido por índice — el mismo que cotiza en
// Yahoo (ES=F, NQ=F, YM=F, RTY=F) — para que precio y posicionamiento midan
// exactamente el mismo instrumento.
const INDEX_CONTRACT_MAP: Record<string, IndexSymbol> = {
  'E-MINI S&P 500':  'SPX',
  'NASDAQ MINI':      'NDX',
  'DJIA X $5':        'DJI',
  'RUSSELL E-MINI':   'RUT',
}

export type IndexCOTData = Partial<Record<IndexSymbol, number>>  // -1 | 0 | 1 (neto largo/corto)

export async function fetchIndexCOTData(): Promise<IndexCOTData> {
  const res = await fetch(CFTC_URL, {
    next: { revalidate: 60 * 60 * 24 }, // cache 24h — datos semanales
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`CFTC fetch failed: ${res.status}`)

  const text = await res.text()
  return parseIndexCOT(text)
}

export function parseIndexCOT(text: string): IndexCOTData {
  const result: IndexCOTData = {}
  const lines = text.split('\n')

  for (const line of lines) {
    const cols = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
    if (cols.length < 16) continue

    const name = cols[0].toUpperCase()
    const symbol = findIndex(name)
    if (!symbol) continue

    const longs  = parseInt(cols[14], 10)
    const shorts = parseInt(cols[15], 10)
    if (isNaN(longs) || isNaN(shorts)) continue

    const net = longs - shorts
    result[symbol] = net > 0 ? 1 : net < 0 ? -1 : 0
  }

  return result
}

function findIndex(name: string): IndexSymbol | null {
  for (const [key, symbol] of Object.entries(INDEX_CONTRACT_MAP)) {
    if (name.startsWith(key)) return symbol
  }
  return null
}
