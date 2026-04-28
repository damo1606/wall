"use client"

import type { Currency, CurrencyScore, PairScore } from '@/types/forex'
import { CURRENCIES } from '@/lib/forex'

interface Props {
  scores: Record<Currency, CurrencyScore>
  pairScores: PairScore[]
  threshold: number
  onThresholdChange: (v: number) => void
}

export function HighConvictionSignals({ scores, pairScores, threshold, onThresholdChange }: Props) {
  const signals = pairScores
    .filter(p => Math.abs(p.total) >= threshold)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  const badge = (total: number) => {
    const abs = Math.abs(total)
    if (abs >= 10) return { label: 'Alta', cls: 'bg-amber-900/40 text-amber-400 border border-amber-700' }
    return { label: 'Media', cls: 'bg-blue-900/30 text-blue-400 border border-blue-700' }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">Señales Alta Convicción</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Umbral</span>
          <input
            type="number"
            min={1}
            max={16}
            value={threshold}
            onChange={e => onThresholdChange(Number(e.target.value))}
            className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center"
          />
        </div>
      </div>

      {signals.length === 0 ? (
        <p className="text-gray-600 text-sm">No hay señales con umbral ≥ {threshold}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {signals.map(p => {
            const bull = p.total > 0
            const b = badge(p.total)
            return (
              <div key={p.pair} className="flex items-center justify-between py-1 border-b border-gray-800/40 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{p.pair}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${b.cls}`}>{b.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {scores[p.base].macro > 0 ? `${p.base}↑` : `${p.base}↓`} / {scores[p.quote].macro > 0 ? `${p.quote}↑` : `${p.quote}↓`}
                  </span>
                  <span className={`font-mono font-bold text-sm ${bull ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.total > 0 ? `+${p.total}` : p.total}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
