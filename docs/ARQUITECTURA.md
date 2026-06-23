# Arquitectura del sistema — Pipeline de análisis y SORE

**Actualizado:** 2026-06-22 (Charm en M1/M7; nuevo módulo M8 flujo/liquidez)

## Visión general

El motor vive en `app/api/scanner-pro/route.ts` y orquesta 7 módulos de opciones
(M1, M2, M3, M5, M6, M7, M8) más el motor de decisión `computeSORE`. Cada módulo
es una función pura en `lib/gex*.ts`. Greeks en `lib/blackscholes.ts`.

```
                         ┌─────────────────────────────────────────────┐
                         │  Yahoo Finance (cadena de opciones, spot, VIX) │
                         └───────────────────────┬─────────────────────┘
                                                 │
   valuation_scores (buyScore) ──► filtro minBuyScore ──► universo de tickers
                                                 │
                          ┌──────────────────────┼───────────────────────┐
                          ▼                       ▼                        ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  Por ticker (analyzeTickerFull):                                          │
   │                                                                            │
   │   M1 gex.ts ── GEX neto · vanna · CHARM · dealer flow · pinStrike          │
   │     │                                                                      │
   │     ├─► M2 gex2.ts  (z-score GEX+PCR, 1 exp)                               │
   │     ├─► M3 gex3.ts  (confluencia multi-exp)                                │
   │     ├─► M5 gex5.ts  (señal consolidada; usa gammaFlip, pressure, PCR de M1)│
   │     │                                                                      │
   │   M6 gex6.ts ── régimen de mercado global (VIX, SPY GEX/PCR) [cache 5min]  │
   │     │                                                                      │
   │   M8 gex8.ts ── flujo fresco (volumen vs OI) + gate de liquidez (tradeable)│
   │     │                                                                      │
   │     ▼                                                                      │
   │   M7 gex7.ts ── agregador: score ponderado + tabla S/R + timing + RESUMEN  │
   │                 · refuerza niveles S/R que coinciden con el pin de CHARM   │
   └──────────────────────────────────────────────────────────────────────────┘
                          │            │                      │
                          ▼            │ M8.tradeable=false    ▼
   ┌───────────────────────────────────┴──┐   ┌──────────────────────────────────┐
   │  computeSORE(...)  [MATEMÁTICA INTACTA]│   │  conviction = f(buyScore, m7)      │
   │  inputs: m1.netGex, m1.pressure,       │   │  ConvictionRow → /sore             │
   │  m1.pcr, m5.score, m6.*, F1/F2/F3      │   └──────────────────────────────────┘
   │  suspend ← m6 ∨ 8-K(F3) ∨ ILIQUIDEZ(M8)│
   │  → CSS/DSS/VSS/VRP · gate · estrategia  │
   └────────────────────────────────────────┘
```

## Módulos

| Módulo | Archivo | Rol |
|---|---|---|
| **M1** | `lib/gex.ts` | GEX neto, **vanna**, **charm (∂Δ/∂t)**, dealer flow, niveles, `pinStrike` |
| M2 | `lib/gex2.ts` | Z-score GEX+PCR, una expiración (±15%) |
| M3 | `lib/gex3.ts` | Confluencia GEX+OI+PCR multi-expiración |
| M5 | `lib/gex5.ts` | Señal consolidada (max pain, notional OI, skew 25Δ) |
| M6 | `lib/gex6.ts` | Régimen de mercado + fear score (global, cache 5 min) |
| **M7** | `lib/gex7.ts` | Agregador ponderado + tabla S/R + timing + resumen; **refuerzo por charm** |
| **M8** | `lib/gex8.ts` | **Flujo fresco (volumen vs OI) + gate de liquidez (`tradeable`)** |
| SORE | `scanner-pro/route.ts` (`computeSORE`) | Motor de decisión: gate GO/WAIT/AVOID + estrategia |

> No existe `gex4.ts`: el "M4" conceptual es el pilar de **precio/valuation** (`lib/scoring.ts`, tabla `valuation_scores`).

## Greeks (`lib/blackscholes.ts`)

`deltaBS`, `gammaBS`, `vannaBS`, **`charmBS`** (nuevo). Todos sin dividendos (q=0),
`RISK_FREE_RATE = 0.05`, `CONTRACT_SIZE = 100`.

## Charm — qué mide y dónde vive

**Charm = ∂Δ/∂t**: cuánto decae el delta de una opción por el simple paso del
tiempo (no por movimiento de precio). Genera flujo de cobertura de dealers que
"clava" el precio hacia un strike (pinning) al acercarse el vencimiento.

- **M1** lo calcula igual que vanna/GEX: `charmBS × OI × 100`, puts negados.
  Expone `charmProfile[]`, `netCharm` y `pinStrike` (strike de mayor |charm|).
- **M7** usa `pinStrike` para **reforzar la convicción** de los niveles S/R que
  coinciden con él (±0.5% → `charmPin = true`, +12 de calificación, capada a 100)
  y emite una línea de **resumen** dedicada a charm/pin.

## M8 — Flujo fresco y liquidez

**Volume/OI Flow Imbalance**: compara el volumen de opciones de HOY (flujo fresco)
con el open interest acumulado (posicionamiento estático).

- **Flujo**: `flowImbalance` (-100..+100, call vs put dominado por volumen),
  `volumePcr` vs `oiPcr`, y `freshFlowRatio` (vol/OI near-the-money). Ratio alto =
  dinero nuevo entrando → posible evento/squeeze; cautela al vender prima.
- **Liquidez** (`lib/gex8.ts`, constantes): `tradeable` = OI NTM ≥ 500 **y** vol NTM
  ≥ 50; `liquidityTier` ALTA/MEDIA/BAJA/ILÍQUIDO. Requiere `volume` por strike, que
  ahora `extractRaw` captura (`c.volume`).
- **Conexión a SORE**: `tradeable === false` fuerza AVOID. Cierra el hallazgo
  crítico #1 de la auditoría (SORE no filtraba liquidez a nivel de ticker): no se
  vende prima en opciones que luego no se pueden cerrar.

## Invariante de SORE (crítico)

**Charm (M1/M7) es estrictamente aditivo y NO toca SORE.** La integración de charm:

- M1 **no** modifica `netGex`, `institutionalPressure`, `putCallRatio`, `gammaFlip`
  ni `levels`. Solo añade `charmProfile`, `netCharm`, `pinStrike`.
- Por tanto **M5 no cambia** (consume `gammaFlip`/`pressure`/`pcr` de M1) y
  **`computeSORE` no cambia** (consume `netGex`, `pressure`, `pcr`, `m5.score`,
  `m6.*`, F1/F2/F3 — nunca M7 ni charm).
- El charm influye **solo en M7** (tabla S/R, timing, resumen, confianza), que
  alimenta la `conviction` mostrada en `/sore`, **no** el gate de SORE.

Resultado: el gate GO/WAIT/AVOID y la selección de estrategia son numéricamente
idénticos antes y después de charm; charm aporta convicción/contexto, no altera
la decisión de operar.

**M8 sí participa en el gate, pero sin tocar la matemática de SORE.** Su flag
`tradeable` se conecta por el **mismo codepath de suspensión** que F3 (8-K):
`suspend ← m6.signalSuspended ∨ blockedByEvent ∨ !m8.tradeable`. `computeSORE` no
cambia su firma de scoring ni sus fórmulas CSS/DSS/VSS/VRP — solo recibe un motivo
más de AVOID. Es un **filtro de seguridad aditivo**, no una reescritura de la lógica.
Las señales `flowImbalance`/`score`/`freshFlowRatio` de M8 son display/contexto en
`ConvictionRow`, no entran al scoring.

## Señales EDGAR (no son módulos "M")

`F1` insider Form 4 (`insider_flows`) · `F2` short interest (`short_interest`) ·
`F3` evento 8-K (`material_events`). Entran directo a `computeSORE`.
