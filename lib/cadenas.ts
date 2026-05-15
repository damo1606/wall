import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData, type StockData } from '@/lib/yahoo'

// ── Environment Configuration ─────────────────────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'google/gemini-2.5-flash'

// ── Constants ─────────────────────────────────────────────────────────────────

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNPROCESSABLE_ENTITY: 422,
} as const

const ERROR_MESSAGES = {
  UNKNOWN_ERROR: 'Error desconocido',
} as const

// ── Prompts ───────────────────────────────────────────────────────────────────
// `finanzas` es un bloque de métricas reales (Yahoo Finance) o "" si no hay tickers.

type PromptFn = (sector: string, subsector: string, finanzas: string) => string

// Objetivo del usuario: comprar barato, vender caro. Cada análisis debe terminar con
// tickers bursátiles reales clasificados por valoración (compra / venta / mantener).
const OPORTUNIDADES_INSTR =
  'OBLIGATORIO: en "oportunidades_inversion" lista de 4 a 8 empresas cotizadas reales del subsector ' +
  'con su ticker bursátil exacto (símbolo de la bolsa). Clasifica cada "senal" como ' +
  '"barato" (infravalorada, candidata a COMPRA), "caro" (sobrevalorada, candidata a VENTA) o "justo". ' +
  'Si hay datos financieros, fundamenta la señal en ellos (PE, ROIC, márgenes, crecimiento). ' +
  '"tesis" es una sola línea explicando por qué comprar o vender.'

const OPORTUNIDADES_SCHEMA =
  '"oportunidades_inversion":[{"ticker":"","empresa":"","senal":"barato|caro|justo","tesis":""}]'

const SUPPLY_CHAIN_PROMPT: PromptFn = (sector, subsector, finanzas) => `
Experto en cadenas de suministro globales. Analiza el subsector "${subsector}" del sector "${sector}".
${finanzas}
Si hay datos financieros, úsalos para justificar riesgos y puntos críticos. ${OPORTUNIDADES_INSTR}
Responde SOLO JSON válido, sin texto adicional:
{"subsector":"${subsector}","actores_clave":[{"nombre":"","rol":"","ejemplos":[]}],"flujo_materiales":[{"etapa":"","descripcion":"","actores":[]}],"puntos_riesgo":[{"riesgo":"","impacto":"alto|medio|bajo","mitigacion":""}],"indicadores_clave":[],"tendencias":[],${OPORTUNIDADES_SCHEMA}}
`

const VALUE_CHAIN_PROMPT: PromptFn = (sector, subsector, finanzas) => `
Experto en cadena de valor y framework Porter. Analiza el subsector "${subsector}" del sector "${sector}".
${finanzas}
Si hay datos financieros, compara los márgenes reportados con los típicos de la industria. ${OPORTUNIDADES_INSTR}
Responde SOLO JSON válido, sin texto adicional:
{"subsector":"${subsector}","actividades_primarias":[{"actividad":"","descripcion":"","margen_tipico":"X-Y%"}],"actividades_soporte":[{"actividad":"","descripcion":""}],"ventajas_competitivas":[],"drivers_valor":[],"margen_industria":{"minimo":"X%","maximo":"Y%","promedio":"Z%"},${OPORTUNIDADES_SCHEMA}}
`

const FODA_PROMPT: PromptFn = (sector, subsector, finanzas) => `
Consultor estratégico sectorial. Realiza un FODA del subsector "${subsector}" del sector "${sector}".
${finanzas}
Si hay datos financieros, cada punto debe citar una métrica (ROIC, márgenes, deuda, crecimiento, valoración). ${OPORTUNIDADES_INSTR}
Responde SOLO JSON válido, sin texto adicional:
{"subsector":"${subsector}","fortalezas":[{"punto":"","impacto":"alto|medio|bajo"}],"oportunidades":[{"punto":"","horizonte":"corto|medio|largo"}],"debilidades":[{"punto":"","urgencia":"alta|media|baja"}],"amenazas":[{"punto":"","probabilidad":"alta|media|baja"}],"estrategia_recomendada":"",${OPORTUNIDADES_SCHEMA}}
`

// ── Bloque de datos financieros (Yahoo Finance) ───────────────────────────────

const TICKER_RE = /^[A-Z][A-Z.\-]{0,9}$/
const MAX_TICKERS = 8

// Normaliza la entrada de tickers: acepta array o string separado por comas
function normalizeTickers(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : []
  const seen = new Set<string>()
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const sym = t.trim().toUpperCase()
    if (sym && TICKER_RE.test(sym)) seen.add(sym)
  }
  return [...seen].slice(0, MAX_TICKERS)
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

// Promedio ignorando ceros y valores no finitos (datos faltantes de Yahoo)
function avg(nums: number[]): number {
  const valid = nums.filter(n => Number.isFinite(n) && n !== 0)
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
}

type FinanceMetrics = Pick<
  StockData,
  'pe' | 'roic' | 'operatingMargin' | 'netMargin' | 'debtToEquity' | 'revenueGrowth' | 'fcfMargin' | 'upsideToTarget'
>

function formatMetrics(m: FinanceMetrics): string {
  return [
    `PE ${m.pe ? m.pe.toFixed(1) : 'n/d'}`,
    `ROIC ${pct(m.roic)}`,
    `margen op. ${pct(m.operatingMargin)}`,
    `margen neto ${pct(m.netMargin)}`,
    `deuda/equity ${(m.debtToEquity / 100).toFixed(2)}`,
    `crec. ingresos ${pct(m.revenueGrowth)}`,
    `FCF margin ${pct(m.fcfMargin)}`,
    `upside analistas ${m.upsideToTarget >= 0 ? '+' : ''}${m.upsideToTarget.toFixed(0)}%`,
  ].join(' · ')
}

// Construye el bloque DATOS REALES inyectado en el prompt — "" si no hay datos
function buildFinanceBlock(stocks: StockData[]): string {
  if (stocks.length === 0) return ''
  if (stocks.length === 1) {
    const s = stocks[0]
    return `\nDATOS REALES (Yahoo Finance — ${s.symbol}, ${s.company}):\n${formatMetrics(s)}\n`
  }
  const agg: FinanceMetrics = {
    pe: avg(stocks.map(s => s.pe)),
    roic: avg(stocks.map(s => s.roic)),
    operatingMargin: avg(stocks.map(s => s.operatingMargin)),
    netMargin: avg(stocks.map(s => s.netMargin)),
    debtToEquity: avg(stocks.map(s => s.debtToEquity)),
    revenueGrowth: avg(stocks.map(s => s.revenueGrowth)),
    fcfMargin: avg(stocks.map(s => s.fcfMargin)),
    upsideToTarget: avg(stocks.map(s => s.upsideToTarget)),
  }
  return `\nDATOS REALES (Yahoo Finance — promedio de ${stocks.map(s => s.symbol).join(', ')}):\n${formatMetrics(agg)}\n`
}

// ── LLM Provider (OpenRouter, OpenAI-compatible) ──────────────────────────────

async function callLLM(prompt: string, model: string = DEFAULT_MODEL): Promise<{ text: string; proveedor: string }> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY no configurada')
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://wall.app',
      'X-Title': 'Wall - Cadenas',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      // JSON mode: Gemini devuelve JSON válido directamente, sin envolver en texto.
      // Hace que el path rápido de validate() acierte y reduce el uso del fallback.
      response_format: { type: 'json_object' },
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`)
  const json = await res.json()
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter returned no message content')
  return { text, proveedor: model }
}

// ── Analysis Configuration ────────────────────────────────────────────────────

const ANALYSIS_CONFIG = {
  supply_chain: {
    prompt: SUPPLY_CHAIN_PROMPT,
    required: ['actores_clave', 'flujo_materiales', 'puntos_riesgo'],
  },
  value_chain: {
    prompt: VALUE_CHAIN_PROMPT,
    required: ['actividades_primarias', 'actividades_soporte', 'ventajas_competitivas'],
  },
  foda: {
    prompt: FODA_PROMPT,
    required: ['fortalezas', 'oportunidades', 'debilidades', 'amenazas'],
  },
} as const

export type AnalysisType = keyof typeof ANALYSIS_CONFIG

// ── Validation ────────────────────────────────────────────────────────────────

function scoreValidation(data: Record<string, unknown>, type: AnalysisType): number {
  const keys = ANALYSIS_CONFIG[type].required
  const found = keys.filter(k => Array.isArray(data[k]) ? data[k].length > 0 : k in data)
  return found.length / Math.max(keys.length, 1)
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractJSONFromText(text: string): string | null {
  // Extrae el primer objeto JSON balanceando llaves. Soporta anidamiento
  // arbitrario (los schemas de Cadenas tienen objetos dentro de arrays) e
  // ignora llaves que aparecen dentro de strings.
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

function validate(text: string, type: AnalysisType): { data: Record<string, unknown>; score: number } {
  // Try direct JSON parse first (fast path for valid JSON responses)
  let data = tryParseJSON(text)
  if (data) return { data, score: scoreValidation(data, type) }

  // Fallback: extract JSON from text using regex
  const jsonText = extractJSONFromText(text)
  if (!jsonText) return { data: {}, score: 0 }

  data = tryParseJSON(jsonText)
  return { data: data ?? {}, score: data ? scoreValidation(data, type) : 0 }
}

// ── Core analyze ──────────────────────────────────────────────────────────────

export type AnalysisResult = {
  data: Record<string, unknown>
  proveedor: string
  confidence: number
  tickers_usados: string[]   // tickers cuyos datos financieros se inyectaron al prompt
}

async function _analyze(
  type: AnalysisType,
  sector: string,
  subsector: string,
  tickers: string[]
): Promise<AnalysisResult> {
  const config = ANALYSIS_CONFIG[type]

  // Datos financieros: solo si el usuario ingresó tickers (respeta Yahoo como fuente única)
  const stocks = tickers.length
    ? (await Promise.all(tickers.map(t => fetchStockData(t)))).filter(
        (s): s is StockData => s !== null
      )
    : []
  const finanzas = buildFinanceBlock(stocks)

  const prompt = config.prompt(sector, subsector, finanzas)
  const { text, proveedor } = await callLLM(prompt)
  const { data, score } = validate(text, type)
  if (score < 0.5) throw new Error('Respuesta incompleta del LLM. Intenta de nuevo.')
  return { data, proveedor, confidence: score, tickers_usados: stocks.map(s => s.symbol) }
}

// ── Validation for API routes ────────────────────────────────────────────────

function validateInput(sector: string, subsector: string): string | null {
  const trimmedSector = sector?.trim()
  const trimmedSubsector = subsector?.trim()

  if (!trimmedSector || trimmedSector.length > 200) return 'Sector inválido'
  if (!trimmedSubsector || trimmedSubsector.length > 200) return 'Subsector inválido'
  return null
}

// ── Request handler factory ───────────────────────────────────────────────────

export function createCadenasHandler(
  analyzer: (sector: string, subsector: string, tickers: string[]) => Promise<AnalysisResult>
) {
  return async (req: NextRequest) => {
    try {
      const body = await req.json()
      const { sector, subsector } = body
      const error = validateInput(sector, subsector)
      if (error) {
        return NextResponse.json({ error }, { status: HTTP_STATUS.BAD_REQUEST })
      }
      const tickers = normalizeTickers(body.tickers)
      const result = await analyzer(sector.trim(), subsector.trim(), tickers)
      return NextResponse.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ERROR_MESSAGES.UNKNOWN_ERROR
      return NextResponse.json({ error: msg }, { status: HTTP_STATUS.UNPROCESSABLE_ENTITY })
    }
  }
}

// ── Cached exports (24h TTL) ──────────────────────────────────────────────────

// Generate cached analyzers from config to reduce copy-paste and maintain DRY principle
// El array `tickers` forma parte de la clave de caché — distintas empresas → distinto resultado
export const analyzeSupplyChain = unstable_cache(
  (sector: string, subsector: string, tickers: string[]) =>
    _analyze('supply_chain', sector, subsector, tickers),
  ['cadenas-supply'],
  { revalidate: 86400, tags: ['cadenas'] }
)

export const analyzeValueChain = unstable_cache(
  (sector: string, subsector: string, tickers: string[]) =>
    _analyze('value_chain', sector, subsector, tickers),
  ['cadenas-value'],
  { revalidate: 86400, tags: ['cadenas'] }
)

export const analyzeFoda = unstable_cache(
  (sector: string, subsector: string, tickers: string[]) =>
    _analyze('foda', sector, subsector, tickers),
  ['cadenas-foda'],
  { revalidate: 86400, tags: ['cadenas'] }
)
