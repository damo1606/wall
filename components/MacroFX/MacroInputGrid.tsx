"use client"

import { CURRENCIES, INDICATORS } from '@/lib/forex'
import type { Currency, MacroIndicator, MacroInput } from '@/types/forex'

interface Props {
  inputs: MacroInput
  onChange: (currency: Currency, indicator: MacroIndicator, field: 'actual' | 'consensus', value: string) => void
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

export function MacroInputGrid({ inputs, onChange }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-x-auto">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Indicadores Macro (Actual vs Consenso)</h3>
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
                return (
                  <>
                    <td key={`${ind}-a`} className={`px-0.5 py-1 ${bg}`}>
                      <input
                        type="text"
                        value={cell.actual}
                        onChange={e => onChange(c, ind, 'actual', e.target.value)}
                        placeholder="—"
                        className="w-12 bg-gray-800/60 border border-gray-700/50 rounded px-1 py-0.5 text-white text-center focus:outline-none focus:border-gray-500"
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
