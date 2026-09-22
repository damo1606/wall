// Notificaciones por Telegram — mismo bot que usa sore (reutilizado a propósito,
// no uno nuevo). Envío fire-and-forget: si faltan las env vars la función es
// un no-op silencioso, el backend nunca debe fallar por una notificación.

const API_BASE = "https://api.telegram.org"

/** True si las credenciales de Telegram están configuradas. */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
}

/** Envía un mensaje a Telegram. Resuelve siempre — nunca lanza. */
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!res.ok) {
      console.error("[telegram] sendMessage HTTP", res.status, await res.text().catch(() => ""))
      return false
    }
    return true
  } catch (e) {
    console.error("[telegram] error:", e instanceof Error ? e.message : e)
    return false
  }
}

/** Variante fire-and-forget — usar en rutas de API sin `await`. */
export function notifyTelegram(text: string): void {
  sendTelegram(text).catch(() => {})
}
