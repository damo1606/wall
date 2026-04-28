"use client"

import type { Currency, CurrencyScore, PairScore } from '@/types/forex'
import { CURRENCIES } from '@/lib/forex'

interface Props {
  scores: Record<Currency, CurrencyScore>
  pairScores: PairScore[]
}

function pill(label: string, value: string, color: string) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
    </div>
  )
}

export function KPIPills({ scores, pairScores }: Props) {
  const sesgos = CURRENCIES.map(c => scores[c].total)
  const globalBias = sesgos.reduce((a, b) => a + b, 0)
  const biasLabel = globalBias > 2 ? 'Alcista' : globalBias < -2 ? 'Bajista' : 'Neutro'
  const biasColor = globalBias > 2 ? 'text-emerald-400' : globalBias < -2 ? 'text-red-400' : 'text-gray-400'

  const sorted = [...pairScores].sort((a, b) => b.total - a.total)
  const topBull = sorted[0]
  const topBear = sorted[sorted.length - 1]

  const confluencia = CURRENCIES.filter(c => {
    const s = scores[c]
    if (s.cot === null) return false
    return (s.macro > 0 && s.cot > 0) || (s.macro < 0 && s.cot < 0)
  }).length

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {pill('Sesgo Global', `${biasLabel} (${globalBias > 0 ? '+' : ''}${globalBias})`, biasColor)}
      {pill(
        'Par más Alcista',
        topBull && topBull.total > 0 ? `${topBull.pair} +${topBull.total}` : '—',
        'text-emerald-400',
      )}
      {pill(
        'Par más Bajista',
        topBear && topBear.total < 0 ? `${topBear.pair} ${topBear.total}` : '—',
        'text-red-400',
      )}
      {pill('Confluencia COT+Macro', `${confluencia}/8 divisas`, confluencia >= 5 ? 'text-emerald-400' : confluencia >= 3 ? 'text-amber-400' : 'text-gray-400')}
    </div>
  )
}
