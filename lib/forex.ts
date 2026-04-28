import type { Currency, MacroIndicator, MacroInput, CurrencyScore, PairScore, COTData } from '@/types/forex'

export const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']

export const INDICATORS: MacroIndicator[] = [
  'CPI', 'GDP', 'Unemployment', 'PMI', 'RetailSales', 'TradeBalance', 'InterestRate',
]

export const INDICATOR_LABELS: Record<MacroIndicator, string> = {
  CPI:          'CPI',
  GDP:          'GDP',
  Unemployment: 'Desempleo',
  PMI:          'PMI',
  RetailSales:  'Ventas Retail',
  TradeBalance: 'Balanza Comercial',
  InterestRate: 'Tasa de Interés',
}

// Indicadores donde un valor MAYOR que el consenso es NEGATIVO (ej: más desempleo = peor)
const INVERTED: Set<MacroIndicator> = new Set(['Unemployment'])

export const PAIRS: Array<{ pair: string; base: Currency; quote: Currency }> = [
  { pair: 'EURUSD', base: 'EUR', quote: 'USD' },
  { pair: 'GBPUSD', base: 'GBP', quote: 'USD' },
  { pair: 'AUDUSD', base: 'AUD', quote: 'USD' },
  { pair: 'NZDUSD', base: 'NZD', quote: 'USD' },
  { pair: 'USDCHF', base: 'USD', quote: 'CHF' },
  { pair: 'USDJPY', base: 'USD', quote: 'JPY' },
  { pair: 'USDCAD', base: 'USD', quote: 'CAD' },
  { pair: 'EURGBP', base: 'EUR', quote: 'GBP' },
  { pair: 'EURJPY', base: 'EUR', quote: 'JPY' },
  { pair: 'EURCAD', base: 'EUR', quote: 'CAD' },
  { pair: 'EURCHF', base: 'EUR', quote: 'CHF' },
  { pair: 'EURAUD', base: 'EUR', quote: 'AUD' },
  { pair: 'EURNZD', base: 'EUR', quote: 'NZD' },
  { pair: 'GBPJPY', base: 'GBP', quote: 'JPY' },
  { pair: 'GBPCAD', base: 'GBP', quote: 'CAD' },
  { pair: 'GBPCHF', base: 'GBP', quote: 'CHF' },
  { pair: 'GBPAUD', base: 'GBP', quote: 'AUD' },
  { pair: 'GBPNZD', base: 'GBP', quote: 'NZD' },
  { pair: 'AUDJPY', base: 'AUD', quote: 'JPY' },
  { pair: 'AUDCAD', base: 'AUD', quote: 'CAD' },
  { pair: 'AUDCHF', base: 'AUD', quote: 'CHF' },
  { pair: 'AUDNZD', base: 'AUD', quote: 'NZD' },
  { pair: 'NZDJPY', base: 'NZD', quote: 'JPY' },
  { pair: 'NZDCAD', base: 'NZD', quote: 'CAD' },
  { pair: 'CADJPY', base: 'CAD', quote: 'JPY' },
  { pair: 'CHFJPY', base: 'CHF', quote: 'JPY' },
]

export function emptyInputs(): MacroInput {
  const result = {} as MacroInput
  for (const c of CURRENCIES) {
    result[c] = {} as MacroInput[Currency]
    for (const ind of INDICATORS) {
      result[c][ind] = { actual: '', consensus: '' }
    }
  }
  return result
}

function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(/,/g, ''))
  return isNaN(v) ? null : v
}

function scoreIndicator(indicator: MacroIndicator, actual: string, consensus: string): number {
  const a = parseNum(actual)
  const c = parseNum(consensus)
  if (a === null || c === null) return 0
  const diff = a - c
  if (Math.abs(diff) < 1e-9) return 0
  const raw = diff > 0 ? 1 : -1
  return INVERTED.has(indicator) ? -raw : raw
}

export function computeScores(
  inputs: MacroInput,
  cotData: COTData,
): { scores: Record<Currency, CurrencyScore>; pairScores: PairScore[] } {
  const scores = {} as Record<Currency, CurrencyScore>

  for (const c of CURRENCIES) {
    let macro = 0
    for (const ind of INDICATORS) {
      const cell = inputs[c]?.[ind]
      if (cell) macro += scoreIndicator(ind, cell.actual, cell.consensus)
    }
    const cot = cotData[c] ?? null
    const total = macro + (cot ?? 0)
    scores[c] = { total, macro, cot }
  }

  const pairScores: PairScore[] = PAIRS.map(({ pair, base, quote }) => ({
    pair,
    base,
    quote,
    total: scores[base].total - scores[quote].total,
  }))

  return { scores, pairScores }
}
