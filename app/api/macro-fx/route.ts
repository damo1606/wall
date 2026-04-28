import { NextResponse } from 'next/server'
import { computeScores, emptyInputs } from '@/lib/forex'
import type { MacroInput, COTData } from '@/types/forex'

// GET: devuelve estructura vacía (el estado real vive en localStorage del cliente)
export async function GET() {
  return NextResponse.json({ inputs: emptyInputs(), cotData: {} })
}

// POST: recibe inputs + cotData, devuelve scores calculados
export async function POST(req: Request) {
  try {
    const body = await req.json() as { inputs: MacroInput; cotData: COTData }
    const { inputs, cotData } = body
    const { scores, pairScores } = computeScores(inputs, cotData)
    return NextResponse.json({ scores, pairScores })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    )
  }
}
