"use client"

import type { Currency, CurrencyScore } from '@/types/forex'
import { CURRENCIES } from '@/lib/forex'

interface Props {
  scores: Record<Currency, CurrencyScore>
}

function rowColor(macro: number, cot: number | null): string {
  if (cot === null) return ''
  if (macro > 0 && cot > 0) return 'bg-emerald-950/30 border-l-2 border-emerald-700'
  if (macro < 0 && cot < 0) return 'bg-red-950/30 border-l-2 border-red-700'
  return 'bg-gray-900/20 border-l-2 border-gray-700'
}

function alignIcon(macro: number, cot: number | null): string {
  if (cot === null) return '—'
  return (macro > 0 && cot > 0) || (macro < 0 && cot < 0) ? '✓' : '✗'
}

function alignColor(macro: number, cot: number | null): string {
  if (cot === null) return 'text-gray-600'
  return (macro > 0 && cot > 0) || (macro < 0 && cot < 0) ? 'text-emerald-400 font-bold' : 'text-red-400'
}

function scoreColor(v: number): string {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-500'
}

export function AlignmentHeatmap({ scores }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Alineación COT + Macro</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-600 border-b border-gray-800">
            <th className="pb-2 text-left">Divisa</th>
            <th className="pb-2 text-right">Macro</th>
            <th className="pb-2 text-right">COT</th>
            <th className="pb-2 text-center">Alineados</th>
          </tr>
        </thead>
        <tbody>
          {CURRENCIES.map(c => {
            const s = scores[c]
            return (
              <tr key={c} className={`border-b border-gray-800/40 ${rowColor(s.macro, s.cot)}`}>
                <td className="py-2 font-bold text-white">{c}</td>
                <td className={`py-2 text-right font-mono font-bold ${scoreColor(s.macro)}`}>
                  {s.macro > 0 ? `+${s.macro}` : s.macro}
                </td>
                <td className={`py-2 text-right font-mono font-bold ${s.cot !== null ? scoreColor(s.cot) : 'text-gray-600'}`}>
                  {s.cot !== null ? (s.cot > 0 ? '+1' : s.cot < 0 ? '-1' : '0') : '—'}
                </td>
                <td className={`py-2 text-center text-base ${alignColor(s.macro, s.cot)}`}>
                  {alignIcon(s.macro, s.cot)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
