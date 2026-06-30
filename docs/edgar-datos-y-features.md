# EDGAR — Datos disponibles y features para SORE

> EDGAR (SEC) es gratis, oficial y estructurado. Única restricción: header `User-Agent`
> identificable (ya lo tienes en `lib/edgar.ts`). Rate limit 10 req/s.
> Contexto del producto: **SORE = motor de cosecha de volatilidad** (venta de premium:
> strangles, iron condors, credit spreads). EDGAR hoy modula riesgo, no dirección.

## Escala de scores
- **Esfuerzo** (1 = horas · 2 = medio día · 3 = 1–2 días · 4 = varios días · 5 = semana+)
- **Viabilidad/Valor para SORE** (★1 bajo fit … ★5 alto fit)
- *Reuse* = infra que ya existe y se reaprovecha (`fetchSubmissions`, `pool`, `EDGAR_HEADERS`, patrón cron + Supabase).

---

## 0. Lo que YA extraemos (base instalada)

| Señal | Fuente EDGAR | Estado |
|---|---|---|
| **F1 Insider flow** (net_flow_usd, n_insiders, buy/sell) | Form 4 (no-derivative, códigos P/S) | ✅ `edgar-insiders` |
| **F3 Eventos materiales** (item_code, event_date) | 8-K (9 items filtrados) | ✅ `edgar-events` |
| **CIK map** (symbols.cik) | `company_tickers.json` | ✅ `edgar-cik-backfill` |

Infra reutilizable: `fetchSubmissions`, `fetchFilingDocument`, `pool` (rate-limit), `form345RawXmlPath`, headers, scaffolding de cron + tablas Supabase con dedup.

---

## 1. QUICK WINS — bajo esfuerzo, alto valor (hacer primero)

| # | Feature | Datos EDGAR | Esfuerzo | Valor | Por qué para SORE |
|---|---|---|---|---|---|
| 1 | **Ampliar filtro 8-K** | items `1.05` (ciber), `2.04` (default/aceleración deuda), `3.01` (delisting), `5.01` (cambio de control), `3.02` (dilución) | **1** (reuse total) | ★★★★★ | Default/delisting = explosión de vol y gap. Hoy se te escapan; solo añadir item codes al filtro existente. |
| 2 | **Shares outstanding reales (XBRL)** | `companyconcept/.../CommonStockSharesOutstanding` | **2** | ★★★★★ | Arregla la normalización de **F1** (`netFlow/marketCap`) y el **float de F2**. Mejora precisión de señales que YA usas, sin tabla nueva. |
| 3 | **NT 10-K / NT 10-Q** (late filing) | form `NT 10-K`/`NT 10-Q` en submissions | **2** (reuse) | ★★★★ | Reporte tarde = problema contable/distress. Flag → cap VRP o hard-block naked sells. Señal barata y muy limpia. |
| 4 | **Cluster buys de insiders** | ya tienes `n_insiders` en `insider_flows` | **1** | ★★★★ | Varios insiders comprando a la vez = la señal alcista más fuerte. Solo lógica sobre datos existentes. |
| 5 | **Ofertas / dilución** | forms `424B5`, `S-3`, 8-K `3.02`/`8.01` ATM | **2** (reuse) | ★★★★ | Secondary/ATM = presión bajista + nueva oferta de acciones → risk flag contra naked sells. |
| 6 | **Filtrar planes 10b5-1 en Form 4** | footnotes XML del Form 4 | **2** | ★★★ | Ventas programadas son ruido; limpiarlas afina **F1** (menos falsos "insiders vendiendo"). |

---

## 2. TIER MEDIO — 1–3 días, fuerte fit

| # | Feature | Datos EDGAR | Esfuerzo | Valor | Notas |
|---|---|---|---|---|---|
| 7 | **Calendario de earnings forward** | inferir cadencia de 10-Q + 8-K `2.02` históricos | **3** | ★★★★★ | **Lo más valioso para timing.** Vender premium justo antes de earnings = riesgo de vol crush/gap. Predecir fecha → bloquear/ajustar ventana. |
| 8 | **Fundamentales XBRL completos** | `companyfacts` (revenue, EPS, deuda, caja, márgenes) | **3** | ★★★★ | Enriquece `buyScore`/`grade` y la página `empresa`. Earnings surprise (reportado vs prior) para timing de vol. |
| 9 | **M&A pendiente → vol crush esperado** | `SC TO-T`, `DEFM14A`, 8-K `1.01` | **3** | ★★★★ | Deal anunciado = IV colapsa hacia precio de oferta. Oportunidad/alerta de venta de premium. |
| 10 | **Full-text monitor (efts)** | `efts.sec.gov` keywords: "going concern", "material weakness", "SEC investigation", "restatement" | **3** | ★★★★ | Screening de tail-risk transversal sobre todo el portafolio. |
| 11 | **Form 144** (ventas insider planeadas) | filings form `144` | **3** | ★★★★ | Leading indicator vs Form 4 (que es ex-post). Anticipa presión de venta → complementa F1. |
| 12 | **13D/13G activist ownership** | forms `SC 13D`/`SC 13G` | **3** | ★★★ | Activista o >5% holder → catalizador direccional, mayor vol. Alerta. |

---

## 3. TIER ALTO — varios días/semana, valioso pero pesado

| # | Feature | Datos EDGAR | Esfuerzo | Valor | Notas |
|---|---|---|---|---|---|
| 13 | **13F institutional holdings (smart money)** | `13F-HR` de filers grandes | **5** | ★★★★ | Hay que parsear el lado *filer* y **invertir el índice** por holding (qué fondos tienen X). Pesado pero único: acumulación/distribución institucional. |
| 14 | **NLP de 10-K/10-Q** (cambios en risk factors, sentiment) | texto MD&A + risk factors | **4** | ★★★ | Requiere LLM + diffing entre filings. Detecta deterioro narrativo. |
| 15 | **DEF 14A governance/comp** | proxy statements | **4** | ★★ | Bajo fit para cosecha de vol (más value/ESG). |
| 16 | **Form D private placements** | form `D` | **3** | ★ | Casi todo empresas privadas → irrelevante para tu universo cotizado. |

---

## 4. Ideas de producto (capa UI/alertas, encima de los datos)

| Idea | Esfuerzo | Valor | Descripción |
|---|---|---|---|
| **"EDGAR Radar"** — feed cronológico | **2** | ★★★★ | Página/tab con eventos materiales del portafolio en orden temporal (ya tienes `material_events`). |
| **Triggers EDGAR en alertas push** | **2** | ★★★★ | Conectar 8-K/NT/144 al tab de alertas existente → notificación al usuario. |
| **Badges enriquecidos en `/sore`** | **1** | ★★★ | Extender `EdgarReasonBadges` con los nuevos eventos (default, dilución, earnings próximo). |

---

## Recomendación de orden
1. **#1 + #2** (mismo día): tapan huecos críticos de riesgo y mejoran F1/F2 que ya usas.
2. **#7 (earnings forward)**: el mayor multiplicador de valor para un motor de venta de premium.
3. **#3, #5** (distress/dilución) → endurecen los circuit-breakers.
4. Luego tier medio según apetito; dejar 13F/NLP para una fase 2.
