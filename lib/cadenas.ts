import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { fetchStockData, validateTickers, type StockData } from '@/lib/yahoo'

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

type PromptFn = (sector: string, subsector: string, finanzas: string, empresas: string[]) => string

// Ancla el análisis en empresas concretas cuando el usuario introduce tickers:
// el LLM reconstruye la cadena partiendo de ellas, no de generalidades del subsector.
function anchorBlock(empresas: string[]): string {
  if (empresas.length === 0) return ''
  return `\nPUNTO DE PARTIDA: ancla el análisis en estas empresas cotizadas — ${empresas.join(', ')}. ` +
    `Reconstruye su cadena partiendo de ellas, no de generalidades del subsector.\n`
}

// Directiva de precisión común a los 3 análisis: empresas concretas, tickers
// globales con prefijo de mercado, sin inventar.
const PRECISION_INSTR =
  'PRECISIÓN MÁXIMA: nombra siempre empresas cotizadas concretas, nunca categorías genéricas ' +
  '("varios fabricantes", "proveedores asiáticos"). Cada "ticker" lleva prefijo de mercado ' +
  '(NYSE:, NASDAQ:, TSE:, KRX:, XETRA:, TPE:, LSE:…). Si no conoces el ticker exacto, deja ' +
  '"ticker":"" — jamás lo inventes. Cuantifica cuota de mercado y país siempre que se pueda.'

// Objetivo del usuario: comprar barato, vender caro. Cada análisis debe terminar con
// tickers bursátiles reales clasificados por valoración (compra / venta / mantener).
const OPORTUNIDADES_INSTR =
  'OBLIGATORIO: en "oportunidades_inversion" lista de 4 a 8 empresas cotizadas reales del subsector. ' +
  'Cada "ticker" DEBE llevar prefijo de mercado (NYSE:VRT, NASDAQ:NVDA, TSE:8035, KRX:005930, ' +
  'XETRA:LIN, TPE:2330, LSE:RIO). No inventes tickers: si no conoces el exacto, deja "ticker":"". ' +
  'Clasifica cada "senal" como "barato" (infravalorada, candidata a COMPRA), "caro" (sobrevalorada, ' +
  'candidata a VENTA) o "justo". Si hay datos financieros, fundamenta la señal en ellos ' +
  '(PE, ROIC, márgenes, crecimiento). "tesis" es una sola línea explicando por qué comprar o vender.'

const OPORTUNIDADES_SCHEMA =
  '"oportunidades_inversion":[{"ticker":"","empresa":"","senal":"barato|caro|justo","tesis":""}]'

const SUPPLY_CHAIN_PROMPT: PromptFn = (sector, subsector, finanzas, empresas) => `
Eres analista de capital riesgo e inversor institucional experto en cadenas de suministro globales.
Analiza el subsector "${subsector}" del sector "${sector}".
${finanzas}${anchorBlock(empresas)}
Haz INGENIERÍA INVERSA de la cadena: parte del producto final y desciende tier-1 → tier-2 → tier-3
hacia atrás, hasta las materias primas, gases purificados, químicos, resinas, metales raros y
equipos de fabricación indispensables. En cada eslabón identifica las empresas dominantes o
exclusivas que lo controlan y marca su "sustituibilidad": "exclusivo" (monopolio de facto),
"dominante" (líder difícil de reemplazar) o "competitivo". Identifica cualquier "single point of
failure" — un único proveedor, planta, químico o región cuya caída paralizaría la cadena.
${PRECISION_INSTR} ${OPORTUNIDADES_INSTR}
Responde SOLO JSON válido, sin texto adicional:
{"subsector":"${subsector}","cadena_inversa":[{"tier":"tier-1|tier-2|tier-3","insumo":"","descripcion":"","empresas":[{"empresa":"","ticker":"","pais":"","cuota_mercado":"","sustituibilidad":"exclusivo|dominante|competitivo"}]}],"single_point_of_failure":[{"punto":"","tipo":"quimico|fisico|geografico|tecnologico","descripcion":"","empresas_implicadas":[],"severidad":"critico|alto|medio"}],"puntos_riesgo":[{"riesgo":"","impacto":"alto|medio|bajo","mitigacion":""}],"indicadores_clave":[],"tendencias":[],${OPORTUNIDADES_SCHEMA}}
`

const VALUE_CHAIN_PROMPT: PromptFn = (sector, subsector, finanzas, empresas) => `
Eres analista de capital riesgo experto en cadena de valor y framework Porter.
Analiza el subsector "${subsector}" del sector "${sector}".
${finanzas}${anchorBlock(empresas)}
Para CADA actividad primaria y de soporte nombra las empresas cotizadas que la dominan, con su
ticker global y cuota de mercado — cada eslabón de la cadena de valor debe ser un nodo invertible.
Si hay datos financieros, compara los márgenes reportados con los típicos de la industria.
${PRECISION_INSTR} ${OPORTUNIDADES_INSTR}
Responde SOLO JSON válido, sin texto adicional:
{"subsector":"${subsector}","actividades_primarias":[{"actividad":"","descripcion":"","margen_tipico":"X-Y%","empresas_dominantes":[{"empresa":"","ticker":"","pais":"","cuota_mercado":""}]}],"actividades_soporte":[{"actividad":"","descripcion":"","empresas_dominantes":[{"empresa":"","ticker":""}]}],"ventajas_competitivas":[],"drivers_valor":[],"margen_industria":{"minimo":"X%","maximo":"Y%","promedio":"Z%"},${OPORTUNIDADES_SCHEMA}}
`

const FODA_PROMPT: PromptFn = (sector, subsector, finanzas, empresas) => `
Eres consultor estratégico e inversor institucional. Realiza un FODA del subsector "${subsector}"
del sector "${sector}".
${finanzas}${anchorBlock(empresas)}
Cada punto del FODA debe citar las empresas cotizadas concretas que lo encarnan, con su ticker
global — una amenaza es un competidor con nombre y ticker, una oportunidad es una empresa
invertible. Si hay datos financieros, cada punto cita además una métrica (ROIC, márgenes, deuda,
crecimiento, valoración).
${PRECISION_INSTR} ${OPORTUNIDADES_INSTR}
Responde SOLO JSON válido, sin texto adicional:
{"subsector":"${subsector}","fortalezas":[{"punto":"","impacto":"alto|medio|bajo","empresas":[{"empresa":"","ticker":""}]}],"oportunidades":[{"punto":"","horizonte":"corto|medio|largo","empresas":[{"empresa":"","ticker":""}]}],"debilidades":[{"punto":"","urgencia":"alta|media|baja","empresas":[{"empresa":"","ticker":""}]}],"amenazas":[{"punto":"","probabilidad":"alta|media|baja","empresas":[{"empresa":"","ticker":""}]}],"estrategia_recomendada":"",${OPORTUNIDADES_SCHEMA}}
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
    required: ['cadena_inversa', 'puntos_riesgo', 'tendencias'],
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
  tickers_usados: string[]          // tickers cuyos datos financieros se inyectaron al prompt
  tickers_no_verificados: string[]  // tickers del análisis que no existen en Yahoo
}

// Recorre el JSON del análisis recogiendo todo objeto con `ticker` string no vacío.
function collectTickerNodes(node: unknown, acc: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTickerNodes(item, acc)
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.ticker === 'string' && obj.ticker.trim()) acc.push(obj)
    for (const v of Object.values(obj)) collectTickerNodes(v, acc)
  }
}

// Valida contra Yahoo todos los tickers del análisis y anota cada objeto empresa
// con `ticker_valido`. Devuelve la lista (sin duplicados) de tickers no verificados.
async function annotateTickers(data: Record<string, unknown>): Promise<string[]> {
  const nodes: Record<string, unknown>[] = []
  collectTickerNodes(data, nodes)
  if (nodes.length === 0) return []

  const checks = await validateTickers(nodes.map(n => (n.ticker as string).trim()))
  const noVerificados: string[] = []
  for (const n of nodes) {
    const ticker = (n.ticker as string).trim()
    const valido = checks.get(ticker)?.valid ?? true
    n.ticker_valido = valido
    if (!valido) noVerificados.push(ticker)
  }
  return [...new Set(noVerificados)]
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

  const prompt = config.prompt(sector, subsector, finanzas, stocks.map(s => s.symbol))
  const { text, proveedor } = await callLLM(prompt)
  const { data, score } = validate(text, type)
  if (score < 0.5) throw new Error('Respuesta incompleta del LLM. Intenta de nuevo.')
  const tickers_no_verificados = await annotateTickers(data)
  return {
    data,
    proveedor,
    confidence: score,
    tickers_usados: stocks.map(s => s.symbol),
    tickers_no_verificados,
  }
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
