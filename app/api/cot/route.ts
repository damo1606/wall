import { NextResponse } from 'next/server'
import { fetchCOTData } from '@/lib/cot'
import { requireAuth } from "@/lib/api-auth"

export async function GET() {
  const denied = await requireAuth(); if (denied) return denied;
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
