export type Currency = 'EUR' | 'USD' | 'GBP' | 'JPY' | 'CHF' | 'CAD' | 'AUD' | 'NZD'

export type MacroIndicator =
  | 'CPI'
  | 'GDP'
  | 'Unemployment'
  | 'PMI'
  | 'RetailSales'
  | 'TradeBalance'
  | 'InterestRate'

export type MacroInput = {
  [C in Currency]: {
    [I in MacroIndicator]: { actual: string; consensus: string }
  }
}

export type CurrencyScore = {
  total: number    // rango: -8 a +8 (7 macro + 1 COT)
  macro: number    // rango: -7 a +7
  cot: number | null
}

export type PairScore = {
  pair: string
  base: Currency
  quote: Currency
  total: number   // rango: -16 a +16
}

export type COTData = Partial<Record<Currency, number>>

export type ForexState = {
  inputs: MacroInput
  cotData: COTData
}
