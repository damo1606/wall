"use client"

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
          {filtered.map(p => (
            <div key={p.pair} className="flex items-center gap-3">
              <span className="text-xs font-bold text-white w-16">{p.pair}</span>
              <Bar value={p.total} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TopPairs({ pairScores }: Props) {
  const sorted = [...pairScores].sort((a, b) => b.total - a.total)
  return (
    <div className="flex gap-3">
      <PairList pairs={sorted} bull={true} />
      <PairList pairs={sorted} bull={false} />
    </div>
  )
}
