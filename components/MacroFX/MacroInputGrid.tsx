"use client"

import { CURRENCIES, INDICATORS } from '@/lib/forex'
import type { Currency, MacroIndicator, MacroInput } from '@/types/forex'

type FredActuals = Partial<Record<Currency, Partial<Record<MacroIndicator, string>>>>

interface Props {
  inputs: MacroInput
  onChange: (currency: Currency, indicator: MacroIndicator, field: 'actual' | 'consensus', value: string) => void
  fredActuals?: FredActuals
}

function parseNum(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

function cellColor(actual: string, consensus: string, indicator: MacroIndicator): string {
  const a = parseNum(actual)
  const c = parseNum(consensus)
  if (a === null || c === null) return ''
  const bull = indicator === 'Unemployment' ? a < c : a > c
  const bear = indicator === 'Unemployment' ? a > c : a < c
  if (bull) return 'bg-emerald-950/40'
  if (bear) return 'bg-red-950/40'
  return ''
}

const INDICATOR_LABELS: Record<MacroIndicator, string> = {
  CPI: 'CPI',
  GDP: 'GDP',
  Unemployment: 'Unemp.',
  PMI: 'PMI',
  RetailSales: 'Retail',
  TradeBalance: 'Trade',
  InterestRate: 'Rate',
}

export function MacroInputGrid({ inputs, onChange, fredActuals }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-400">Indicadores Macro (Actual vs Consenso)</h3>
        {fredActuals && Object.keys(fredActuals).length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-400">Auto FRED</span>
        )}
      </div>
      <table className="text-xs w-full min-w-[640px]">
        <thead>
          <tr className="text-gray-600 border-b border-gray-800">
            <th className="pb-2 text-left w-12">Divisa</th>
            {INDICATORS.map(ind => (
              <th key={ind} className="pb-2 text-center px-1" colSpan={2}>
                {INDICATOR_LABELS[ind]}
              </th>
            ))}
          </tr>
          <tr className="text-gray-700 border-b border-gray-800">
            <th />
            {INDICATORS.map(ind => (
              <>
                <th key={`${ind}-a`} className="pb-1 text-center text-[10px]">Act</th>
                <th key={`${ind}-c`} className="pb-1 text-center text-[10px]">Cons</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {CURRENCIES.map(c => (
            <tr key={c} className="border-b border-gray-800/30 hover:bg-gray-800/20">
              <td className="py-1 font-bold text-white pr-2">{c}</td>
              {INDICATORS.map(ind => {
                const cell = inputs[c][ind]
                const bg = cellColor(cell.actual, cell.consensus, ind)
                const fromFred = fredActuals?.[c]?.[ind] === cell.actual && cell.actual !== ''
                return (
                  <>
                    <td key={`${ind}-a`} className={`px-0.5 py-1 ${bg}`}>
                      <input
                        type="text"
                        value={cell.actual}
                        onChange={e => onChange(c, ind, 'actual', e.target.value)}
                        placeholder="—"
                        title={fromFred ? 'Fuente: FRED' : undefined}
                        className={`w-12 bg-gray-800/60 rounded px-1 py-0.5 text-white text-center focus:outline-none ${fromFred ? 'border border-blue-700/60 focus:border-blue-500' : 'border border-gray-700/50 focus:border-gray-500'}`}
                      />
                    </td>
                    <td key={`${ind}-c`} className="px-0.5 py-1">
                      <input
                        type="text"
                        value={cell.consensus}
                        onChange={e => onChange(c, ind, 'consensus', e.target.value)}
                        placeholder="—"
                        className="w-12 bg-gray-800/60 border border-gray-700/50 rounded px-1 py-0.5 text-gray-400 text-center focus:outline-none focus:border-gray-500"
                      />
                    </td>
                  </>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-700 text-xs mt-2">Unemployment: actual &gt; consenso = negativo (invertido)</p>
    </div>
  )
}
