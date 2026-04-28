import { NextResponse } from 'next/server'
import { fetchCOTData } from '@/lib/cot'

export async function GET() {
  try {
    const data = await fetchCOTData()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    )
  }
}
