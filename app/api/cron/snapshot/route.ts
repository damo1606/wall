import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cron diario que captura el estado de Wall y lo persiste en Supabase.
// Trigger: vercel.json (0 21 * * * = 21:00 UTC = 4-5pm ET cierre de mercado)
// Auth: header `Authorization: Bearer ${CRON_SECRET}` (Vercel lo inyecta automáticamente)

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 min — scanner-pro puede tardar

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return await res.json() as T
  } catch { return null }
}

export async function GET(req: NextRequest) {
  // 1) Verificar autorización (Vercel inyecta el header en cron jobs)
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`
  const errors: string[] = []

  // 2) Fetch en paralelo de las 3 fuentes
  const [macro, sectors, scannerPro] = await Promise.all([
    safeFetch<Record<string, unknown>>(`${base}/api/macro`).catch(e => { errors.push(`macro: ${e}`); return null }),
    safeFetch<unknown>(`${base}/api/sectors-etf`).catch(e => { errors.push(`sectors: ${e}`); return null }),
    safeFetch<{ rows: unknown[]; m6Regime?: string; m6Vix?: number }>(
      `${base}/api/scanner-pro?universe=sp500&limit=50&minBuyScore=0`
    ).catch(e => { errors.push(`scanner-pro: ${e}`); return null }),
  ])

  if (!macro && !sectors && !scannerPro) {
    return NextResponse.json({ error: "All sources failed", errors }, { status: 502 })
  }

  // 3) Extraer headline metrics del macro
  const macroPhase      = (macro?.detection as { phase?: string } | undefined)?.phase ?? null
  const macroConfidence = (macro?.detection as { confidence?: number } | undefined)?.confidence ?? null
  const vix             = macro?.vix as number | null ?? null
  const vix3m           = macro?.vix3m as number | null ?? null

  // 4) Extraer régimen y fear score del scanner-pro (M6 global)
  const regime    = scannerPro?.m6Regime ?? null
  const m6Vix     = scannerPro?.m6Vix ?? vix
  const firstRow  = (scannerPro?.rows?.[0] as { m6FearScore?: number } | undefined)
  const fearScore = firstRow?.m6FearScore ?? null

  // 5) Insertar snapshot
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date().toISOString().split("T")[0]

  const { error } = await supabase
    .from("daily_snapshots")
    .upsert({
      snapshot_date:    today,
      macro_phase:      macroPhase,
      macro_confidence: macroConfidence,
      vix:              m6Vix,
      vix3m,
      fear_score:       fearScore,
      regime,
      macro_indicators: macro,
      sectors,
      sore_signals:     scannerPro?.rows ?? [],
      meta: {
        universe: "sp500",
        limit: 50,
        errors,
        sources: {
          macro:       macro       !== null,
          sectors:     sectors     !== null,
          scanner_pro: scannerPro  !== null,
        },
      },
    }, { onConflict: "snapshot_date" })

  if (error) {
    return NextResponse.json({ error: error.message, errors }, { status: 500 })
  }

  // 6) Discord webhook: notifica si hay GO signals o régimen extremo
  const webhook = process.env.DISCORD_WEBHOOK_URL
  if (webhook) {
    type SoreRow = { symbol: string; soreGate?: string; soreCSS?: number; soreStrategy?: string }
    const rows = (scannerPro?.rows ?? []) as SoreRow[]
    const goSignals = rows
      .filter(r => r.soreGate === "GO")
      .sort((a, b) => (b.soreCSS ?? 0) - (a.soreCSS ?? 0))
      .slice(0, 10)
    const extremeRegime = regime === "PÁNICO AGUDO" || regime === "CRISIS SISTÉMICA"

    if (goSignals.length > 0 || extremeRegime) {
      const goList = goSignals.length > 0
        ? goSignals.map(r => `• **${r.symbol}** CSS=${r.soreCSS} → ${r.soreStrategy}`).join("\n")
        : "_Sin GO signals_"
      const regimeAlert = extremeRegime ? `\n\n🚨 **RÉGIMEN ${regime}** — gatillo suspendido` : ""
      const content = `**SORE Snapshot ${today}** · Régimen: ${regime} · VIX ${m6Vix?.toFixed(2)} · Fear ${fearScore}\n\n${goList}${regimeAlert}`

      fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }).catch(e => errors.push(`webhook: ${(e as Error).message}`))
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    phase: macroPhase,
    regime,
    vix: m6Vix,
    fearScore,
    rowsSnapshotted: scannerPro?.rows?.length ?? 0,
    warnings: errors,
  })
}
