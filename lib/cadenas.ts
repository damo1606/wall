import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

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

const SUPPLY_CHAIN_PROMPT = (sector: string, subsector: string) => `
Eres un experto en cadenas de suministros globales.
Analiza la cadena de suministros del subsector "${subsector}" dentro del sector "${sector}".

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "subsector": "${subsector}",
  "actores_clave": [
    {"nombre": "Actor", "rol": "Rol en la cadena", "ejemplos": ["Empresa A", "Empresa B"]}
  ],
  "flujo_materiales": [
    {"etapa": "Nombre etapa", "descripcion": "Qué ocurre", "actores": ["Actor 1"]}
  ],
  "puntos_riesgo": [
    {"riesgo": "Descripción", "impacto": "alto", "mitigacion": "Cómo mitigarlo"}
  ],
  "indicadores_clave": ["KPI 1", "KPI 2"],
  "tendencias": ["Tendencia 1", "Tendencia 2"]
}
`

const VALUE_CHAIN_PROMPT = (sector: string, subsector: string) => `
Eres un experto en cadenas de valor y ventajas competitivas (framework Porter).
Analiza la cadena de valores del subsector "${subsector}" dentro del sector "${sector}".

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "subsector": "${subsector}",
  "actividades_primarias": [
    {"actividad": "Nombre", "descripcion": "Descripción", "margen_tipico": "X-Y%"}
  ],
  "actividades_soporte": [
    {"actividad": "Nombre", "descripcion": "Descripción"}
  ],
  "ventajas_competitivas": ["Ventaja 1", "Ventaja 2"],
  "drivers_valor": ["Driver 1", "Driver 2"],
  "margen_industria": {"minimo": "X%", "maximo": "Y%", "promedio": "Z%"}
}
`

const FODA_PROMPT = (sector: string, subsector: string) => `
Eres un consultor estratégico especialista en análisis sectorial.
Realiza un FODA detallado del subsector "${subsector}" dentro del sector "${sector}".

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "subsector": "${subsector}",
  "fortalezas": [{"punto": "Descripción", "impacto": "alto"}],
  "oportunidades": [{"punto": "Descripción", "horizonte": "corto"}],
  "debilidades": [{"punto": "Descripción", "urgencia": "alta"}],
  "amenazas": [{"punto": "Descripción", "probabilidad": "alta"}],
  "estrategia_recomendada": "Párrafo con la estrategia recomendada"
}
`

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
  // Extract JSON object from text using regex (handles LLM responses with extra text)
  const match = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
  return match?.[0] ?? null
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
}

async function _analyze(type: AnalysisType, sector: string, subsector: string): Promise<AnalysisResult> {
  const config = ANALYSIS_CONFIG[type]
  const prompt = config.prompt(sector, subsector)
  const { text, proveedor } = await callLLM(prompt)
  const { data, score } = validate(text, type)
  if (score < 0.5) throw new Error('Respuesta incompleta del LLM. Intenta de nuevo.')
  return { data, proveedor, confidence: score }
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
  analyzer: (sector: string, subsector: string) => Promise<AnalysisResult>
) {
  return async (req: NextRequest) => {
    try {
      const { sector, subsector } = await req.json()
      const error = validateInput(sector, subsector)
      if (error) {
        return NextResponse.json({ error }, { status: HTTP_STATUS.BAD_REQUEST })
      }
      const result = await analyzer(sector.trim(), subsector.trim())
      return NextResponse.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ERROR_MESSAGES.UNKNOWN_ERROR
      return NextResponse.json({ error: msg }, { status: HTTP_STATUS.UNPROCESSABLE_ENTITY })
    }
  }
}

// ── Cached exports (24h TTL) ──────────────────────────────────────────────────

// Generate cached analyzers from config to reduce copy-paste and maintain DRY principle
export const analyzeSupplyChain = unstable_cache(
  (sector: string, subsector: string) => _analyze('supply_chain', sector, subsector),
  ['cadenas-supply'],
  { revalidate: 86400, tags: ['cadenas'] }
)

export const analyzeValueChain = unstable_cache(
  (sector: string, subsector: string) => _analyze('value_chain', sector, subsector),
  ['cadenas-value'],
  { revalidate: 86400, tags: ['cadenas'] }
)

export const analyzeFoda = unstable_cache(
  (sector: string, subsector: string) => _analyze('foda', sector, subsector),
  ['cadenas-foda'],
  { revalidate: 86400, tags: ['cadenas'] }
)
