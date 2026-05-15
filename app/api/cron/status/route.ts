import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase"

export const dynamic = "force-dynamic"

// Frescura del cron diario: corre lun-vie, así que el hueco sano máximo es el
// del fin de semana (viernes 21:00 → lunes 21:00 ≈ 72 h). Más que eso = algo
// va mal (sin deploy, CRON_SECRET ausente, schedule desactivado, 500…).
const STALE_HOURS = 72

/**
 * Estado del cron `snapshot_daily` leído de `cron_runs`. Lo consume el panel
 * "CRON DIARIO" de /data-quality para delatar un cron roto sin mirar Vercel.
 */
export async function GET() {
  try {
    const db = supabaseServer()

    const { data: last } = await db
      .from("cron_runs")
      .select("job_name, status, started_at, finished_at, rows_inserted, rows_failed, error_summary")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: lastOk } = await db
      .from("cron_runs")
      .select("started_at")
      .in("status", ["success", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const hoursSinceSuccess = lastOk?.started_at
      ? (Date.now() - new Date(lastOk.started_at).getTime()) / 3_600_000
      : null
    const stale = hoursSinceSuccess === null || hoursSinceSuccess > STALE_HOURS

    return NextResponse.json({
      last: last ?? null,
      lastSuccessAt: lastOk?.started_at ?? null,
      hoursSinceSuccess: hoursSinceSuccess !== null ? Math.round(hoursSinceSuccess) : null,
      stale,
      neverRan: !last,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Error desconocido",
        last: null,
        lastSuccessAt: null,
        hoursSinceSuccess: null,
        stale: true,
        neverRan: true,
      },
      { status: 500 },
    )
  }
}
