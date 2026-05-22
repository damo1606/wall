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
  // Cuántas de las 3 dimensiones (macro+COT, pronóstico, régimen Markov)
  // apuntan al lado dominante del par.
  const alignCount = (p: PairScore): number => {
    const dom = Math.sign(p.total)
    if (dom === 0) return 0
    const markovDir = p.markov
      ? (p.markov.state === 'bull' ? 1 : p.markov.state === 'bear' ? -1 : 0)
      : 0
    const dirs = [
      Math.sign(p.total),
      p.forecast ? Math.sign(p.forecast.score) : 0,
      markovDir,
    ]
    return dirs.filter(d => d === dom).length
  }

  // Las señales con más dimensiones alineadas van primero.
  const signals = pairScores
    .filter(p => Math.abs(p.total) >= threshold)
    .sort((a, b) => {
      const d = alignCount(b) - alignCount(a)
      return d !== 0 ? d : Math.abs(b.total) - Math.abs(a.total)
    })

  const badge = (p: PairScore) => {
    const a = alignCount(p)
    if (a >= 3) return { label: '⚡ Triple', cls: 'bg-amber-500/25 text-amber-300 border border-amber-500' }
    if (a === 2) return { label: 'Alta', cls: 'bg-amber-900/40 text-amber-400 border border-amber-700' }
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
            const b = badge(p)
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
                  {p.forecast && (
                    <span
                      title="Pronóstico ARIMA/GARCH a 20 velas"
                      className={`text-[11px] font-mono ${p.forecast.expectedMovePct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                    >
                      {p.forecast.expectedMovePct >= 0 ? '+' : ''}{p.forecast.expectedMovePct.toFixed(1)}%
                    </span>
                  )}
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
