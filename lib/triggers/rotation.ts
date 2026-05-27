import type { TypedClient } from "@/lib/supabase"

export type RotationStatus = "FAVORED" | "NEUTRAL" | "AVOID"
export type MacroPhase = "expansion" | "peak" | "contraction" | "trough"

// Yahoo devuelve nombres de sector que NO siempre coinciden con la
// taxonomía GICS de la tabla `sectors`. Mapeo conservador.
const YAHOO_TO_GICS: Record<string, string> = {
  "Technology":              "Technology",
  "Healthcare":              "Healthcare",
  "Financial Services":      "Financials",
  "Financials":              "Financials",
  "Consumer Cyclical":       "Consumer Discretionary",
  "Consumer Discretionary":  "Consumer Discretionary",
  "Consumer Defensive":      "Consumer Staples",
  "Consumer Staples":        "Consumer Staples",
  "Energy":                  "Energy",
  "Industrials":             "Industrials",
  "Basic Materials":         "Materials",
  "Materials":               "Materials",
  "Real Estate":             "Real Estate",
  "Utilities":               "Utilities",
  "Communication Services":  "Communication Services",
}

export function normalizeSectorName(yahooSector: string | null | undefined): string | null {
  if (!yahooSector) return null
  return YAHOO_TO_GICS[yahooSector.trim()] ?? null
}

export type RotationMap = {
  // key: `${macro_phase}|${sector_id}` → { status, weight, sector_name }
  byPhaseAndSector: Map<string, { status: RotationStatus; weight: number; sectorName: string }>
  // key: sector_name → sector_id
  sectorIdByName: Map<string, string>
}

export async function loadRotationMap(db: TypedClient): Promise<RotationMap> {
  const [{ data: sectors }, { data: rot }] = await Promise.all([
    db.from("sectors").select("id, name"),
    db.from("sector_rotation_map").select("macro_phase, sector_id, status, weight").eq("active", true),
  ])

  const sectorIdByName = new Map<string, string>()
  const sectorNameById = new Map<string, string>()
  for (const s of sectors ?? []) {
    sectorIdByName.set(s.name, s.id)
    sectorNameById.set(s.id, s.name)
  }

  const byPhaseAndSector = new Map<string, { status: RotationStatus; weight: number; sectorName: string }>()
  for (const r of rot ?? []) {
    const sectorName = sectorNameById.get(r.sector_id) ?? "?"
    byPhaseAndSector.set(`${r.macro_phase}|${r.sector_id}`, {
      status: r.status as RotationStatus,
      weight: Number(r.weight ?? 1),
      sectorName,
    })
  }

  return { byPhaseAndSector, sectorIdByName }
}

/**
 * Devuelve `rotation_status` para un símbolo según su sector (texto de Yahoo)
 * y la `macro_phase` actual. Si no se puede resolver el sector o no hay
 * entrada en `sector_rotation_map`, devuelve NEUTRAL con weight 1 — política
 * conservadora para no excluir símbolos por gaps de catálogo.
 */
export function rotationFor(
  yahooSector: string | null | undefined,
  macroPhase: MacroPhase,
  rotationMap: RotationMap,
): { status: RotationStatus; weight: number; sectorId: string | null } {
  const gicsName = normalizeSectorName(yahooSector)
  if (!gicsName) return { status: "NEUTRAL", weight: 1, sectorId: null }
  const sectorId = rotationMap.sectorIdByName.get(gicsName) ?? null
  if (!sectorId) return { status: "NEUTRAL", weight: 1, sectorId: null }
  const hit = rotationMap.byPhaseAndSector.get(`${macroPhase}|${sectorId}`)
  if (!hit) return { status: "NEUTRAL", weight: 1, sectorId }
  return { status: hit.status, weight: hit.weight, sectorId }
}
