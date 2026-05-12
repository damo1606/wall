import { unstable_cache } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

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

// ── LLM Providers ─────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY no configurada')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
      cache: 'no-store',
    }
  )
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
  const json = await res.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no text content')
  return text
}

async function callGroq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY no configurada')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`)
  const json = await res.json()
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('Groq returned no message content')
  return text
}

async function callLLM(prompt: string): Promise<{ text: string; proveedor: string }> {
  if (process.env.GEMINI_API_KEY) {
    try {
      return { text: await callGemini(prompt), proveedor: 'gemini' }
    } catch (e) {
      console.error('Gemini failed, falling back to Groq:', e instanceof Error ? e.message : String(e))
    }
  }
  if (process.env.GROQ_API_KEY) {
    return { text: await callGroq(prompt), proveedor: 'groq' }
  }
  throw new Error('Configura GEMINI_API_KEY o GROQ_API_KEY en las variables de entorno')
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

function scoreValidation(data: Record<string, unknown>, type: string): number {
  const keys = ANALYSIS_CONFIG[type as AnalysisType]?.required ?? []
  const found = keys.filter(k => Array.isArray(data[k]) ? data[k].length > 0 : k in data)
  return found.length / Math.max(keys.length, 1)
}

function validate(text: string, type: string): { data: Record<string, unknown>; score: number } {
  // Try direct JSON parse first
  try {
    const data = JSON.parse(text)
    return { data, score: scoreValidation(data, type) }
  } catch {
    // Fallback to regex with non-greedy matching
    const match = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
    if (!match) return { data: {}, score: 0 }
    try {
      const data = JSON.parse(match[0])
      return { data, score: scoreValidation(data, type) }
    } catch {
      return { data: {}, score: 0 }
    }
  }
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
  if (!sector?.length || sector.length > 200) return 'Sector inválido'
  if (!subsector?.length || subsector.length > 200) return 'Subsector inválido'
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
        return NextResponse.json({ error }, { status: 400 })
      }
      const result = await analyzer(sector.trim(), subsector.trim())
      return NextResponse.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      return NextResponse.json({ error: msg }, { status: 422 })
    }
  }
}

// ── Cached exports (24h TTL) ──────────────────────────────────────────────────

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
