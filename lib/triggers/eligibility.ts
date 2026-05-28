import type { SnapshotPayload } from "./conditions"

// Umbrales mínimos para considerar un ticker negociable.
// Regla de negocio: no perder tiempo/recursos en símbolos sin liquidez,
// volumen u open interest suficientes para entrar/salir sin slippage.
export const MIN_DOLLAR_VOLUME_20D = 5_000_000   // $5M/día promedio
export const MIN_AVG_VOLUME_20D    = 200_000     // 200k acciones/día

export type EligibilityInput = {
  dollarVolume20d: number | null   // price_summary_daily.dollar_volume_20d
  avgVolume20d: number | null      // price_summary_daily.avg_volume_20d
  payload: SnapshotPayload         // para noOptions / m1NetGex
}

export type EligibilityResult = {
  eligible: boolean
  reason: string | null  // por qué se descartó (para logging)
}

/**
 * Decide si un símbolo es negociable. Se evalúa ANTES de las condiciones del
 * gatillo — un símbolo no elegible se salta sin gastar evaluación.
 */
export function checkEligibility(inp: EligibilityInput): EligibilityResult {
  // 1. Debe tener rollup (si dollar_volume es null, no hay historial suficiente)
  if (inp.dollarVolume20d == null) {
    return { eligible: false, reason: "sin_rollup" }
  }
  // 2. Liquidez mínima en USD
  if (inp.dollarVolume20d < MIN_DOLLAR_VOLUME_20D) {
    return { eligible: false, reason: "liquidez_baja" }
  }
  // 3. Volumen mínimo de acciones
  if (inp.avgVolume20d != null && inp.avgVolume20d < MIN_AVG_VOLUME_20D) {
    return { eligible: false, reason: "volumen_bajo" }
  }
  // 4. Open interest / cadena de opciones — noOptions=true significa que no
  //    hay opciones negociables. m1NetGex≈0 también indica sin actividad.
  const noOptions = (inp.payload as { noOptions?: boolean }).noOptions === true
  if (noOptions) {
    return { eligible: false, reason: "sin_opciones" }
  }

  return { eligible: true, reason: null }
}
