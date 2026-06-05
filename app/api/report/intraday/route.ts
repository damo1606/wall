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

// Telegram HTML solo permite tags específicos. Escapamos &, <, > en texto dinámico
// para que tickers o sectores con caracteres raros no rompan el parse.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function postTelegram(botToken: string, chatId: string, htmlText: string) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  })
  if (!r.ok) {
    const text = await r.text().catch(() => "")
    throw new Error(`Telegram sendMessage ${r.status}: ${text.slice(0, 300)}`)
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurada" }, { status: 500 })
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID no configurados" }, { status: 500 })
  }

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

  // 4. Compose Telegram HTML message
  const fmtConvRow = (r: ScannerRow) => {
    const sym = esc(r.symbol.padEnd(5))
    const sec = esc((r.sector ?? "—").slice(0, 16).padEnd(16))
    return `<code>${sym}</code> ${sec} buy=${String(r.buyScore).padStart(2)} conv=${r.convictionScore.toFixed(0)} · ${esc(r.verdict.padEnd(11))} · SORE ${r.soreGate}`
  }
  const fmtBuyRow = (r: ScannerRow) => {
    const sym = esc(r.symbol.padEnd(5))
    const pe = r.pe ? r.pe.toFixed(1) : "—"
    const roe = r.roe ? (r.roe * 100).toFixed(0) + "%" : "—"
    const graham = pct(r.discountToGraham)
    return `<code>${sym}</code> buy=${r.buyScore} ${esc(r.grade ?? "—")} · P/E ${pe} · ROE ${roe} · Graham ${esc(graham)}`
  }

  const topConvBlock = rows.length === 0
    ? "<i>scanner-pro no devolvió datos</i>"
    : `<pre>${topConv.map(fmtConvRow).join("\n")}</pre>`

  const topBuyBlock = rows.length === 0
    ? "<i>scanner-pro no devolvió datos</i>"
    : `<pre>${topBuy.map(fmtBuyRow).join("\n")}</pre>`

  const goSoreBlock = goSore.length
    ? goSore.map(r => `<code>${esc(r.symbol)}</code> CSS=${r.soreCSS} → ${esc(r.soreStrategy)}`).join("\n")
    : "<i>sin oportunidades (régimen no favorable)</i>"

  const triggersBlock = `OPEN ahora: <b>${openNow}</b> · abiertas hoy: <b>${openedToday}</b> · cerradas hoy: <b>${closedToday}</b>`

  const distBlock = rows.length === 0
    ? "<i>sin datos</i>"
    : `STRONG BUY <b>${verdicts["STRONG BUY"] ?? 0}</b> · BUY <b>${verdicts.BUY ?? 0}</b> · WATCH <b>${verdicts.WATCH ?? 0}</b> · NEUTRAL <b>${verdicts.NEUTRAL ?? 0}</b>\nSORE GO <b>${sores.GO ?? 0}</b> · WAIT <b>${sores.WAIT ?? 0}</b> · AVOID <b>${sores.AVOID ?? 0}</b>`

  const macroBlock = `Régimen: <b>${esc(m6Regime)}</b> · VIX <b>${m6Vix?.toFixed(2) ?? "—"}</b> · ${rows.length} símbolos analizados`

  const html = [
    `${mt.emoji} <b>WALL — ${mt.label}</b>`,
    `<i>${esc(mt.subtitle)} · ${quito} Quito · ${utc} UTC · ${et} ET</i>`,
    ``,
    `📊 <b>Macro</b>`,
    macroBlock,
    ``,
    `🎯 <b>Top 5 Convicción</b>`,
    topConvBlock,
    `💎 <b>Top 3 Fundamental</b>`,
    topBuyBlock,
    `💰 <b>SORE GO</b>`,
    goSoreBlock,
    ``,
    `🚦 <b>Triggers</b>`,
    triggersBlock,
    ``,
    `📈 <b>Distribución</b>`,
    distBlock,
    ``,
    `<a href="https://wall-livid.vercel.app/sore">📊 Abrir dashboard</a>`,
  ].join("\n")

  try {
    await postTelegram(botToken, chatId, html)
  } catch (e) {
    return NextResponse.json({ error: "Telegram send failed", detail: String(e) }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, moment, rows: rows.length,
    m6Regime, m6Vix, openNow, openedToday, closedToday,
    topConvictionSymbols: topConv.map(r => r.symbol),
  })
}
