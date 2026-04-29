"use client"

import { useState, useCallback, useEffect } from 'react'
import type { Currency, MacroIndicator, MacroInput, COTData, CurrencyScore, PairScore } from '@/types/forex'
import { emptyInputs } from '@/lib/forex'
import { KPIPills } from '@/components/MacroFX/KPIPills'
import { CurrencyRadar } from '@/components/MacroFX/CurrencyRadar'
import { AlignmentHeatmap } from '@/components/MacroFX/AlignmentHeatmap'
import { TopPairs } from '@/components/MacroFX/TopPairs'
import { HighConvictionSignals } from '@/components/MacroFX/HighConvictionSignals'
import { MacroInputGrid } from '@/components/MacroFX/MacroInputGrid'
import { COTPanel } from '@/components/MacroFX/COTPanel'
import { TechnicalLevels } from '@/components/MacroFX/TechnicalLevels'

const STORAGE_KEY = 'macro-fx-state'

type Tab = 'resumen' | 'datos'
type FredActuals = Partial<Record<Currency, Partial<Record<MacroIndicator, string>>>>

interface ComputedState {
  scores: Record<Currency, CurrencyScore>
  pairScores: PairScore[]
}

function loadFromStorage(): { inputs: MacroInput; cotData: COTData } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveToStorage(inputs: MacroInput, cotData: COTData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ inputs, cotData }))
  } catch {}
}

function mergeFred(inputs: MacroInput, fred: FredActuals): MacroInput {
  const result = { ...inputs } as MacroInput
  for (const [c, indicators] of Object.entries(fred)) {
    for (const [ind, val] of Object.entries(indicators!)) {
      const cur = result[c as Currency][ind as MacroIndicator]
      if (!cur.actual && val) {
        result[c as Currency] = {
          ...result[c as Currency],
          [ind]: { ...cur, actual: val },
        }
      }
    }
  }
  return result
}

export default function MacroFXPage() {
  const [tab, setTab] = useState<Tab>('resumen')
  const [inputs, setInputs] = useState<MacroInput>(emptyInputs)
  const [cotData, setCotData] = useState<COTData>({})
  const [computed, setComputed] = useState<ComputedState | null>(null)
  const [threshold, setThreshold] = useState(6)
  const [loading, setLoading] = useState(false)
  const [fredActuals, setFredActuals] = useState<FredActuals>({})

  useEffect(() => {
    const saved = loadFromStorage()
    if (saved) {
      setInputs(saved.inputs)
      setCotData(saved.cotData)
    }

    fetch('/api/macro-fx/fred')
      .then(r => r.ok ? r.json() : null)
      .then((fred: FredActuals | null) => {
        if (!fred) return
        setFredActuals(fred)
        setInputs(prev => {
          const saved = loadFromStorage()
          return mergeFred(saved?.inputs ?? prev, fred)
        })
      })
      .catch(() => {})
  }, [])

  const handleInputChange = useCallback(
    (currency: Currency, indicator: MacroIndicator, field: 'actual' | 'consensus', value: string) => {
      setInputs(prev => {
        const next = {
          ...prev,
          [currency]: {
            ...prev[currency],
            [indicator]: { ...prev[currency][indicator], [field]: value },
          },
        }
        return next
      })
    },
    [],
  )

  const handleCOTUpdate = useCallback((data: COTData) => {
    setCotData(data)
  }, [])

  async function calculate() {
    setLoading(true)
    saveToStorage(inputs, cotData)
    try {
      const res = await fetch('/api/macro-fx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs, cotData }),
      })
      const data = await res.json() as ComputedState
      setComputed(data)
      setTab('resumen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Macro FX</h1>
          <p className="text-gray-500 text-sm">8 divisas · 26 pares · COT + Macro</p>
        </div>
        <div className="flex gap-2">
          {(['resumen', 'datos'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t
                  ? 'bg-gray-800 text-white border border-gray-700'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'resumen' ? 'Resumen' : 'Cargar Datos'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'resumen' && (
        <div className="flex flex-col gap-4">
          {computed ? (
            <>
              <KPIPills scores={computed.scores} pairScores={computed.pairScores} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyRadar scores={computed.scores} />
                <AlignmentHeatmap scores={computed.scores} />
              </div>
              <TopPairs pairScores={computed.pairScores} />
              <HighConvictionSignals
                scores={computed.scores}
                pairScores={computed.pairScores}
                threshold={threshold}
                onThresholdChange={setThreshold}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <p className="text-gray-500 text-sm">Ingresa los datos macro y calcula para ver el análisis.</p>
              <button
                onClick={() => setTab('datos')}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700 transition-colors"
              >
                Ir a Cargar Datos →
              </button>
            </div>
          )}
          <TechnicalLevels />
        </div>
      )}

      {tab === 'datos' && (
        <div className="flex flex-col gap-4">
          <MacroInputGrid inputs={inputs} onChange={handleInputChange} fredActuals={fredActuals} />
          <COTPanel cotData={cotData} onUpdate={handleCOTUpdate} />
          <div className="flex justify-end">
            <button
              onClick={calculate}
              disabled={loading}
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Calculando...' : 'Calcular →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
