import { NextResponse } from 'next/server'
import type { Currency, MacroIndicator } from '@/types/forex'

type SeriesCfg = { id: string; units: 'lin' | 'pc1' }
type FredActuals = Partial<Record<Currency, Partial<Record<MacroIndicator, string>>>>

const FRED_MAP: Partial<Record<Currency, Partial<Record<MacroIndicator, SeriesCfg>>>> = {
  USD: {
    CPI:          { id: 'CPIAUCSL',        units: 'pc1' },
    GDP:          { id: 'A191RL1Q225SBEA', units: 'lin' },
    Unemployment: { id: 'UNRATE',          units: 'lin' },
    RetailSales:  { id: 'RSXFS',           units: 'pc1' },
    InterestRate: { id: 'FEDFUNDS',        units: 'lin' },
    TradeBalance: { id: 'BOPGSTB',         units: 'lin' },
  },
  EUR: {
    CPI:          { id: 'CPALTT01EZM659N',    units: 'lin' },
    GDP:          { id: 'CLVMNACSCAB1GQEZ19', units: 'pc1' },
    Unemployment: { id: 'LRHUTTTTEZM156S',    units: 'lin' },
    InterestRate: { id: 'ECBDFR',             units: 'lin' },
  },
  GBP: {
    CPI:          { id: 'CPGBM659N',        units: 'lin' },
    GDP:          { id: 'CLVMNACSCAB1GQGB', units: 'pc1' },
    Unemployment: { id: 'LRHUTTTTGBM156S',  units: 'lin' },
    InterestRate: { id: 'BOERUKM',          units: 'lin' },
  },
  JPY: {
    CPI:          { id: 'JPNCPIALLMINMEI',  units: 'lin' },
    GDP:          { id: 'JPNRGDPEXP',       units: 'pc1' },
    Unemployment: { id: 'LRHUTTTTJPM156S',  units: 'lin' },
    InterestRate: { id: 'IRSTJPM193N',      units: 'lin' },
  },
  CHF: {
    CPI:          { id: 'CHECPIALLMINMEI',  units: 'lin' },
    GDP:          { id: 'CHEGDPNQDSMEI',    units: 'pc1' },
    Unemployment: { id: 'LRHUTTTTCHM156S',  units: 'lin' },
    InterestRate: { id: 'IRSTCB01CHM156N',  units: 'lin' },
  },
  CAD: {
    CPI:          { id: 'CPALTT01CAM659N',  units: 'lin' },
    GDP:          { id: 'CANGDPNQDSMEI',    units: 'pc1' },
    Unemployment: { id: 'LRHUTTTTCAM156S',  units: 'lin' },
    InterestRate: { id: 'IRSTCB01CAM156N',  units: 'lin' },
  },
  AUD: {
    CPI:          { id: 'CPALTT01AUM659N',  units: 'lin' },
    GDP:          { id: 'AUSGDPNQDSMEI',    units: 'pc1' },
    Unemployment: { id: 'LRHUTTTTAUM156S',  units: 'lin' },
    InterestRate: { id: 'IRSTCB01AUM156N',  units: 'lin' },
  },
  NZD: {
    CPI:          { id: 'CPALTT01NZM659N',  units: 'lin' },
    GDP:          { id: 'NZLGDPNQDSMEI',    units: 'pc1' },
    Unemployment: { id: 'LRHUTTTTNZM156S',  units: 'lin' },
    InterestRate: { id: 'IRSTCB01NZM156N',  units: 'lin' },
  },
}

async function fetchLatest(cfg: SeriesCfg): Promise<string | null> {
  const apiKey = process.env.FRED_API_KEY
  try {
    const since = new Date()
    since.setFullYear(since.getFullYear() - 2)
    const start = since.toISOString().split('T')[0]

    let url: string
    if (apiKey) {
      url = `https://api.stlouisfed.org/fred/series/observations?series_id=${cfg.id}&api_key=${apiKey}&file_type=json&units=${cfg.units}&observation_start=${start}&sort_order=desc&limit=6`
    } else {
      url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${cfg.id}&observation_start=${start}`
    }

    const res = await fetch(url, { next: { revalidate: 43200 } })
    if (!res.ok) return null

    if (apiKey) {
      const json = await res.json() as { observations?: Array<{ value: string }> }
      const obs = (json.observations ?? []).find(o => o.value !== '.' && o.value !== '')
      if (!obs) return null
      const v = parseFloat(obs.value)
      return isNaN(v) ? null : v.toFixed(2)
    } else {
      const text = await res.text()
      const lines = text.trim().split('\n').slice(1).reverse()
      for (const line of lines) {
        const parts = line.split(',')
        const v = parseFloat(parts[1])
        if (!isNaN(v)) return v.toFixed(2)
      }
      return null
    }
  } catch {
    return null
  }
}

export async function GET() {
  const tasks: Array<{ currency: Currency; indicator: MacroIndicator; cfg: SeriesCfg }> = []

  for (const [currency, indicators] of Object.entries(FRED_MAP)) {
    for (const [indicator, cfg] of Object.entries(indicators!)) {
      tasks.push({ currency: currency as Currency, indicator: indicator as MacroIndicator, cfg: cfg as SeriesCfg })
    }
  }

  const values = await Promise.all(tasks.map(t => fetchLatest(t.cfg)))

  const result: FredActuals = {}
  for (let i = 0; i < tasks.length; i++) {
    const { currency, indicator } = tasks[i]
    const val = values[i]
    if (val !== null) {
      if (!result[currency]) result[currency] = {}
      result[currency]![indicator] = val
    }
  }

  return NextResponse.json(result)
}
