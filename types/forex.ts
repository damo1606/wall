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

// Pronóstico estadístico (ARIMA/GARCH) de un par FX — dimensión añadida en Fase 2.
export type PairForecast = {
  score: number           // retorno/volatilidad del primer paso (señal a riesgo)
  expectedMovePct: number // movimiento esperado al horizonte (%)
  dailyVol: number        // volatilidad diaria estimada (%)
}

// Régimen de mercado por cadenas de Markov — dimensión añadida en Fase 3.
export type PairMarkov = {
  state: 'bull' | 'side' | 'bear'          // estado actual del par
  signal: 'COMPRA' | 'VENTA' | 'NEUTRAL'   // señal por probabilidad del próximo estado
  probBull: number
  probSide: number
  probBear: number
}

export type PairScore = {
  pair: string
  base: Currency
  quote: Currency
  total: number              // macro+COT, rango: -16 a +16
  forecast?: PairForecast     // pronóstico estadístico (opcional, se fusiona en UI)
  markov?: PairMarkov         // régimen Markov (opcional, se fusiona en UI)
  confluence?: -1 | 0 | 1     // signo si macro+COT y forecast coinciden; 0 si divergen
}

export type COTData = Partial<Record<Currency, number>>

export type ForexState = {
  inputs: MacroInput
  cotData: COTData
}
