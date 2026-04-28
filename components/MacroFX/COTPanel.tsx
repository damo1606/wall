"use client"

import { useState } from 'react'
import { CURRENCIES } from '@/lib/forex'
import type { Currency, COTData } from '@/types/forex'

interface Props {
  cotData: COTData
  onUpdate: (data: COTData) => void
}

export function COTPanel({ cotData, onUpdate }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchFromCFTC() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cot')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json() as COTData
      onUpdate(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function scoreLabel(v: number | undefined): string {
    if (v === undefined) return '—'
    return v > 0 ? '+1 ↑' : v < 0 ? '-1 ↓' : '0'
  }

  function scoreColor(v: number | undefined): string {
    if (v === undefined) return 'text-gray-600'
    return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-gray-500'
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400">COT — Non-Commercial Net</h3>
        <button
          onClick={fetchFromCFTC}
          disabled={loading}
          className="text-xs px-3 py-1.5 bg-blue-900/40 border border-blue-700/60 text-blue-400 rounded-lg hover:bg-blue-900/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Cargando...' : 'Actualizar desde CFTC'}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-3">Error: {error}</p>
      )}

      <div className="grid grid-cols-4 gap-2">
        {CURRENCIES.map(c => (
          <div key={c} className="bg-gray-800/40 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500 mb-1">{c}</div>
            <div className={`text-sm font-bold font-mono ${scoreColor(cotData[c])}`}>
              {scoreLabel(cotData[c])}
            </div>
          </div>
        ))}
      </div>

      <p className="text-gray-700 text-xs mt-3">
        Fuente: CFTC FinFut.txt — Non-Commercial (Long - Short). USD = inverso del promedio de los demás.
      </p>
    </div>
  )
}
