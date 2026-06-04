import { NextRequest, NextResponse } from "next/server"
import { supabaseServer, type TypedClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Moments y su emoji/etiqueta visual
const MOMENTS = {
  "PREP":     { emoji: "🌅", label: "PREP",     subtitle: "3h antes de apertura" },
  "OPEN-30":  { emoji: "🔔", label: "OPEN-30",  subtitle: "30 min antes de apertura" },
  "LUNCH":    { emoji: "🍽️", label: "LUNCH",    subtitle: "almuerzo NY" },
  "CLOSE-30": { emoji: "🏁", label: "CLOSE-30", subtitle: "30 min antes del cierre" },
} as const
type Moment = keyof typeof MOMENTS

// Color de embed por momento (decimal Discord colors)
const COLORS: Record<Moment, number> = {
  "PREP":     0x4A90E2, // azul calmo
  "OPEN-30":  0xF5A623, // ámbar (atención)
  "LUNCH":    0x9B9B9B, // gris (revisión)
  "CLOSE-30": 0xD0021B, // rojo (urgencia)
}

// Deriva el moment del UTC actual si no viene como param.
// PREP=10:30, OPEN-30=13:00, LUNCH=16:00, CLOSE-30=19:30 UTC (lun-vie).
function deriveMoment(d = new Date()): Moment {
  const utcH = d.getUTCHours()
  const utcM = d.getUTCMinutes()
  const t = utcH * 60 + utcM
  // Margen ±45min por slot
  if (Math.abs(t - (10 * 60 + 30)) < 45) return "PREP"
  if (Math.abs(t - (13 * 60))      < 45) return "OPEN-30"
  if (Math.abs(t - (16 * 60))      < 45) return "LUNCH"
  if (Math.abs(t - (19 * 60 + 30)) < 45) return "CLOSE-30"
  // Default razonable: el más reciente del día
  if (t < 12 * 60) return "PREP"
  if (t < 14 * 60 + 30) return "OPEN-30"
  if (t < 17 * 60 + 45) return "LUNCH"
  return "CLOSE-30"
}

type ScannerRow = {
  symbol: string; company?: string; sector?: string
  buyScore: number; grade?: string; pe?: number; roe?: number
  discountToGraham?: number
  convictionScore: number; verdict: string
  soreGate: "GO" | "WAIT" | "AVOID"; soreStrategy: string; soreCSS: number; soreDSS: number; soreVSS: number
}

function pct(v: number | null | undefined, dec = 1) {
  if (v == null) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`
}

function fmtTime(d: Date) {
  const quito = d.toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false })
  const utc = `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
  const et = d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false })
  return { quito, utc, et }
}

async function postDiscord(webhook: string, payload: object) {
  const r = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => "")
    throw new Error(`Discord webhook ${r.status}: ${text.slice(0, 200)}`)
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const webhook = process.env.DISCORD_WEBHOOK_URL
  if (!webhook) return NextResponse.json({ error: "DISCORD_WEBHOOK_URL no configurada" }, { status: 500 })

  const url = new URL(req.url)
  const momentParam = (url.searchParams.get("moment") ?? "").toUpperCase()
  const moment: Moment = (momentParam in MOMENTS ? momentParam : deriveMoment()) as Moment
  const mt = MOMENTS[moment]

  // Base URL para llamar scanner-pro internamente
  const proto = req.headers.get("x-forwarded-proto") ?? "https"
  const host = req.headers.get("host") ?? "wall-livid.vercel.app"
  const base = `${proto}://${host}`

  // 1. Scanner-pro (cobertura completa)
  let rows: ScannerRow[] = []
  let m6Regime = "—", m6Vix: number | null = null
  try {
    const r = await fetch(`${base}/api/scanner-pro?universe=sp500&limit=100&minBuyScore=0`, { cache: "no-store" })
    const j = await r.json()
    rows = (j.rows ?? []) as ScannerRow[]
    m6Regime = j.m6Regime ?? "—"
    m6Vix = j.m6Vix ?? null
  } catch (e) {
    console.error("[report/intraday] scanner-pro falló:", e)
  }

  // 2. Triggers status
  const db: TypedClient = supabaseServer()
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()
  let openNow = 0, openedToday = 0, closedToday = 0
  try {
    const opened = await db.from("trade_entries").select("id", { count: "exact", head: true }).eq("status", "OPEN")
    openNow = opened.count ?? 0
    const today = await db.from("trade_entries").select("id", { count: "exact", head: true }).gte("created_at", todayIso)
    openedToday = today.count ?? 0
    const closed = await db.from("trade_entries").select("id", { count: "exact", head: true }).eq("status", "CLOSED").gte("created_at", todayIso)
    closedToday = closed.count ?? 0
  } catch (e) {
    console.error("[report/intraday] trade_entries falló:", e)
  }

  // 3. Aggregations
  const topConv = [...rows].sort((a, b) => b.convictionScore - a.convictionScore).slice(0, 5)
  const topBuy  = [...rows].sort((a, b) => b.buyScore - a.buyScore).slice(0, 3)
  const goSore  = rows.filter(r => r.soreGate === "GO").slice(0, 5)
  const verdicts = rows.reduce<Record<string, number>>((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a }, {})
  const sores    = rows.reduce<Record<string, number>>((a, r) => { a[r.soreGate] = (a[r.soreGate] || 0) + 1; return a }, {})

  const now = new Date()
  const { quito, utc, et } = fmtTime(now)

  // 4. Compose Discord embed
  const fmtRow = (r: ScannerRow) =>
    `\`${r.symbol.padEnd(5)}\` ${(r.sector ?? "—").slice(0, 16).padEnd(16)} buy=${String(r.buyScore).padStart(2)} conv=${r.convictionScore.toFixed(0)} · ${r.verdict.padEnd(11)} · SORE ${r.soreGate}`
  const topConvStr = topConv.length ? topConv.map(fmtRow).join("\n") : "_sin datos_"

  const fmtBuyRow = (r: ScannerRow) => {
    const pe = r.pe ? r.pe.toFixed(1) : "—"
    const roe = r.roe ? (r.roe * 100).toFixed(0) + "%" : "—"
    const graham = pct(r.discountToGraham)
    return `\`${r.symbol.padEnd(5)}\` buy=${r.buyScore} ${r.grade ?? "—"} · P/E ${pe} · ROE ${roe} · Graham ${graham}`
  }
  const topBuyStr = topBuy.length ? topBuy.map(fmtBuyRow).join("\n") : "_sin datos_"

  const goSoreStr = goSore.length
    ? goSore.map(r => `\`${r.symbol}\` CSS=${r.soreCSS} → ${r.soreStrategy}`).join("\n")
    : "_sin oportunidades (régimen no favorable)_"

  const triggersStr = `OPEN ahora: **${openNow}** · abiertas hoy: **${openedToday}** · cerradas hoy: **${closedToday}**`

  const distStr = `STRONG BUY **${verdicts["STRONG BUY"] ?? 0}** · BUY **${verdicts.BUY ?? 0}** · WATCH **${verdicts.WATCH ?? 0}** · NEUTRAL **${verdicts.NEUTRAL ?? 0}**\nSORE GO **${sores.GO ?? 0}** · WAIT **${sores.WAIT ?? 0}** · AVOID **${sores.AVOID ?? 0}**`

  const macroStr = `Régimen: **${m6Regime}** · VIX **${m6Vix?.toFixed(2) ?? "—"}** · ${rows.length} símbolos analizados`

  const embed = {
    title: `${mt.emoji} WALL — ${mt.label}`,
    description: `**${mt.subtitle}** · ${quito} Quito · ${utc} UTC · ${et} ET`,
    color: COLORS[moment],
    fields: [
      { name: "📊 Macro", value: macroStr, inline: false },
      { name: "🎯 Top 5 Convicción", value: "```\n" + topConv.map(fmtRow).join("\n") + "\n```", inline: false },
      { name: "💎 Top 3 Fundamental", value: "```\n" + topBuy.map(fmtBuyRow).join("\n") + "\n```", inline: false },
      { name: "💰 SORE GO", value: goSoreStr, inline: false },
      { name: "🚦 Triggers", value: triggersStr, inline: false },
      { name: "📈 Distribución", value: distStr, inline: false },
    ],
    timestamp: now.toISOString(),
    footer: { text: "wall-livid.vercel.app/sore" },
  }

  // Fallback: si rows está vacío, no postear top conviction code-block (vacío)
  if (rows.length === 0) {
    embed.fields[1].value = "_scanner-pro no devolvió datos_"
    embed.fields[2].value = "_scanner-pro no devolvió datos_"
    embed.fields[5].value = "_sin datos_"
  }

  try {
    await postDiscord(webhook, { embeds: [embed] })
  } catch (e) {
    return NextResponse.json({ error: "Discord post failed", detail: String(e) }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, moment, rows: rows.length,
    m6Regime, m6Vix, openNow, openedToday, closedToday,
    topConvictionSymbols: topConv.map(r => r.symbol),
  })
}
