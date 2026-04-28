"use client"

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import type { Currency, CurrencyScore } from '@/types/forex'
import { CURRENCIES } from '@/lib/forex'

interface Props {
  scores: Record<Currency, CurrencyScore>
}

export function CurrencyRadar({ scores }: Props) {
  const allZero = CURRENCIES.every(c => scores[c].total === 0)

  const data = CURRENCIES.map(c => ({
    currency: c,
    score: scores[c].total,
  }))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 relative">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Fortaleza de Divisas</h3>

      {allZero && (
        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl bg-gray-900/80">
          <span className="text-gray-500 text-sm">Scores neutrales — ingresa datos para ver sesgo</span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis
            dataKey="currency"
            tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            domain={[-8, 8]}
            tickCount={5}
            tick={{ fill: '#4b5563', fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#34d399"
            fill="#34d399"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#e5e7eb', fontWeight: 700 }}
            formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
