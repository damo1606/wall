import { NextRequest, NextResponse } from 'next/server'
import { analyzeValueChain } from '@/lib/cadenas'

export async function POST(req: NextRequest) {
  try {
    const { sector, subsector } = await req.json()
    if (!sector || !subsector) return NextResponse.json({ error: 'sector y subsector requeridos' }, { status: 400 })
    const result = await analyzeValueChain(sector, subsector)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
