import { fetchMacroData, detectPhase } from "@/lib/macro"

export async function GET() {
  try {
    const data  = await fetchMacroData()
    const phase = detectPhase(data)
    return Response.json({ ...data, detection: phase })
  } catch {
    return Response.json({ error: "No se pudo obtener datos macroeconómicos" }, { status: 500 })
  }
}
