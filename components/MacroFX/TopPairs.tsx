"use client"

import { useState } from 'react'
import type { PairScore } from '@/types/forex'

interface Props {
  pairScores: PairScore[]
}

function Bar({ value, max = 16 }: { value: number; max?: number }) {
  const pct = Math.min((Math.abs(value) / max) * 100, 100)
  const bull = value > 0
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${bull ? 'bg-emerald-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-bold w-8 text-right ${bull ? 'text-emerald-400' : 'text-red-400'}`}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  )
}

function PairRow({ p }: { p: PairScore }) {
  const fc = p.forecast
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-white w-[68px] flex items-center gap-1">
        {p.pair}
        {p.confluence ? (
          <span title="Triple confluencia: macro+COT y pronóstico apuntan al mismo lado" className="text-amber-400">⚡</span>
        ) : null}
      </span>
      <Bar value={p.total} />
      <span
        title="Movimiento esperado a 20 velas (ARIMA/GARCH)"
        className={`text-[11px] font-mono w-14 text-right ${
          !fc ? 'text-gray-700' : fc.expectedMovePct >= 0 ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {fc ? `${fc.expectedMovePct >= 0 ? '+' : ''}${fc.expectedMovePct.toFixed(1)}%` : '—'}
      </span>
    </div>
  )
}

function PairList({ pairs, bull }: { pairs: PairScore[]; bull: boolean }) {
  const label = bull ? 'Top Alcistas' : 'Top Bajistas'
  const empty = bull ? 'Sin señales alcistas' : 'Sin señales bajistas'
  const threshold = 4

  const filtered = bull
    ? pairs.filter(p => p.total >= threshold).slice(0, 5)
    : pairs.filter(p => p.total <= -threshold).slice(-5).reverse()

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex-1">
      <h3 className={`text-sm font-semibold mb-3 ${bull ? 'text-emerald-400' : 'text-red-400'}`}>{label}</h3>
      {filtered.length === 0 ? (
        <p className="text-gray-600 text-sm">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(p => <PairRow key={p.pair} p={p} />)}
        </div>
      )}
    </div>
  )
}

export function TopPairs({ pairScores }: Props) {
  const [sortMode, setSortMode] = useState<'score' | 'vol'>('score')
  const hasForecast = pairScores.some(p => p.forecast)

  // "Ajustado a vol": penaliza pares con alta volatilidad GARCH — más fiel a
  // comprar barato / vender caro que el score bruto.
  const ranked = [...pairScores].sort((a, b) => {
    if (sortMode === 'vol') {
      const adj = (p: PairScore) => p.total / (1 + (p.forecast?.dailyVol ?? 0) * 0.5)
      return adj(b) - adj(a)
    }
    return b.total - a.total
  })

  return (
    <div className="flex flex-col gap-2">
      {hasForecast && (
        <div className="flex items-center gap-2 self-end text-[11px]">
          <span className="text-gray-600">Orden:</span>
          {(['score', 'vol'] as const).map(m => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={`px-2 py-0.5 rounded transition-colors ${
                sortMode === m ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m === 'score' ? 'Score' : 'Ajustado a vol'}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <PairList pairs={ranked} bull={true} />
        <PairList pairs={ranked} bull={false} />
      </div>
    </div>
  )
}
