# Auditoría — Lógica de datos y señales EDGAR → SORE

Fecha: 2026-06-22 · Alcance: `app/api/cron/edgar-events/route.ts`, `lib/edgar.ts`,
`app/api/scanner-pro/route.ts` (`computeSORE` + integración F1/F2/F3), `app/sore/page.tsx`,
migraciones `insider_flows` / `short_interest` / `material_events`.

---

## 🔴 ALTO — bugs de calibración (la señal no hace lo que dice)

### A1. F1 insider signal: escala 1000× → el ban se dispara a ~0.09%, no a 2% — ✅ RESUELTO (factor → 50)
`scanner-pro/route.ts:539` → `Math.tanh((net_flow_usd / mc) * 1000)`.
El ban de naked sells es `insiderSignal < -0.7` (`:302`). Resolviendo:
`tanh(x) = -0.7 → x ≈ -0.867 → net_flow/mc ≈ -0.087%`.
Pero la migración `insider_flows` documenta el umbral en **−2% del market cap**.
→ El multiplicador `×1000` hace la señal ~23× más sensible de lo diseñado: `tanh`
satura (>0.99) ya a ~0.3% del market cap, así que **casi cualquier venta neta de
insiders fuerza IRON CONDOR**. F1 es prácticamente binario, no graduado.
**Fix:** bajar el factor a ~50 (para que −2% → `tanh(−1)=−0.76` → ban), o recalibrar
el umbral del ban. Documentar el factor elegido.

### A2. F3 hard-block: ventana hacia adelante sobre un campo hacia atrás — ✅ RESUELTO (filtra por filing_date, últimos 4 días)
El cron persiste `event_date = reportDate` (`route.ts:99,118`) = fecha en que **ocurrió**
el evento (siempre ≤ filing date, nunca futura). El scanner filtra
`event_date ∈ [today−1, today+3]` (`scanner-pro:514-515,528-529`).
→ La porción `[today, today+3]` (futuro) **nunca matchea** — los report dates son pasados.
El block efectivo es solo `[today−1, today]`. El objetivo del doc ("bloquear antes de
earnings próximos") **no se cumple**: `material_events` es reactivo (post-evento), no
anticipatorio. Eso requiere el calendario forward (#7 del doc), no construido.
Además hay un hueco de cobertura: el cron ingiere por `filingDate ≥ today−2`, pero el
scanner matchea por `event_date ≥ today−1`. Un 8-K filed hoy de un evento de hace 3 días
(reportDate = today−3) **se guarda pero no bloquea**.
**Fix:** decidir intención. Si es reactivo, filtrar por `filing_date` reciente (no
event_date futuro). Si es anticipatorio, necesitas el earnings calendar forward.

---

## 🟡 MEDIO

### M1. Sobre-bloqueo: 18 item codes hacen AVOID por igual — ✅ RESUELTO (hard AVOID vs soft cap a WAIT)
El route persiste 18 items (`route.ts:13-35`) e incluye 2.02 (earnings), 5.02 (cambio
ejecutivo), 5.07 (voto accionistas), 7.01 (Reg FD), 8.01 (catch-all) — todos comunes.
El scanner bloquea ante **cualquiera** (`scanner-pro:548-550`) con la misma severidad que
1.03 (quiebra). En cualquier día de earnings season eso AVOID-ea una fracción enorme del
S&P. Nota: `eventRes` ya hace `select(... item_code)` (`:526`) pero **nunca lo usa** →
la severidad está disponible y descartada.
**Fix:** escalonar (1.03/2.04/3.01/4.02 → hard AVOID; 2.02/5.02/8.01 → cap suave o WAIT).

### M2. La leyenda del gate en /sore no coincide con el gating real — ✅ RESUELTO (leyenda alineada a la regla de 2 factores)
Leyenda UI: `GO >75 · WAIT 55–75 · AVOID <55` (`page.tsx:193-195`). Lógica real:
GO exige `css≥75 **AND** dss≥65` (`:304`); AVOID solo si `css<45` (`:292`).
→ Un CSS 80 con DSS 60 muestra **WAIT** (contradice "GO >75"); un CSS 50 muestra **WAIT**
(contradice "AVOID <55"). La leyenda es decorativa y engaña al usuario.
**Fix:** alinear leyenda con la regla de dos factores, o mostrar el umbral DSS.

### M3. `short_interest` sin piso de recencia → datos rancios indefinidos — ✅ RESUELTO (.gte settlement_date, 45 días)
`scanner-pro:522-525` ordena por `settlement_date DESC` y toma el último, sin `gte`.
`insider_flows` sí tiene cutoff de 35 días (`:511`); short interest no. Si Yahoo dejó de
poblar un símbolo, se sigue usando un SI de hace meses para capar VRP / banear naked sells.
**Fix:** añadir `.gte("settlement_date", today−45d)` (FINRA es biweekly).

---

## 🟢 BAJO

- **Doc drift:** `docs/edgar-datos-y-features.md` lista "Ampliar filtro 8-K" (#1) como
  quick-win pendiente, pero el route **ya** persiste 1.05/2.04/3.01/5.01/3.02. El comentario
  de la migración `material_events` lista ~8 items y dice que 3.01 "no se persiste" — falso.
- **Fechas UTC vs US/Eastern:** ventanas con `toISOString().slice(0,10)` usan fecha UTC;
  los filings SEC son Eastern. Efecto de borde en el cambio de día. Bajo impacto.
- **`pool` duplicado:** `lib/edgar.ts:28` y `scanner-pro:409` reimplementan el mismo helper.

---

## Resumen ejecutivo
La infraestructura (fetch, dedup, rate-limit, fallback Phase A/B) es sólida. Los problemas
están en **calibración de señales**, no en plumbing: F1 satura ~23× antes de lo documentado
(A1) y el block F3 es reactivo cuando el doc lo vende como anticipatorio (A2). Sumado al
sobre-bloqueo de 18 items (M1), SORE probablemente está marcando AVOID/IRON CONDOR mucho
más de lo intencionado. Priorizar A1 y A2.
