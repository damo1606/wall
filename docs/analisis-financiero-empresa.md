# Análisis financiero de una empresa — checklist (estilo Bloomberg FA)

> Transcripción de la pantalla **FA Análisis financiero** + mapeo a fuente de datos
> para replicarla en `wall`. Unidad: millones de USD excepto "por acción". Periodo: LTM (12 meses).
> **BEst** = *Bloomberg Estimates* → en nuestro stack = **consenso/estimado forward** (analistas),
> NO sale de EDGAR; requiere Yahoo (`analystEstimates`) o un proveedor (FMP/Finnhub).
>
> Fuente sugerida: **[SEC]** XBRL/companyfacts (autoritativo) · **[Y]** Yahoo · **[EST]** estimados analistas · **[CALC]** derivado.

## 1. Valoración y mercado
| Métrica (pantalla) | Inglés | Fuente |
|---|---|---|
| Valor de empresa | Enterprise Value (EV) | [CALC] mktCap + deuda neta |
| Cap de mercado actual | Market Cap | [Y] price × shares · [SEC] shares |
| Capitalización de mercado a va… (trunc.) | Market cap ratio (≈ P/B) | [CALC] |
| Ratio precio/beneficios (PER) | P/E ratio | [CALC] price / EPS |
| Ratio PER BEst | Forward P/E (estimado) | [EST] |
| Dividendo por acción | Dividend per share | [SEC]/[Y] |
| Valor contable por acción | Book value per share | [SEC] equity / shares |

## 2. Rentabilidad y márgenes
| Métrica | Inglés | Fuente |
|---|---|---|
| Margen bruto | Gross margin | [SEC][CALC] |
| Beneficio bruto | Gross profit | [SEC] |
| EBITDA BEst | EBITDA (estimado) | [EST] · [SEC] histórico |
| ROA BEst | Return on Assets (est.) | [EST]/[CALC] |
| ROE BEst | Return on Equity (est.) | [EST]/[CALC] |
| Retorno de capital invertido | ROIC | [CALC] NOPAT / capital invertido |
| Retorno sobre capital inv… (trunc.) | Return on invested capital | [CALC] |
| Ingresos netos | Net income | [SEC] |
| Coste de ventas | Cost of sales (COGS) | [SEC] |

## 3. Deuda y solvencia
| Métrica | Inglés | Fuente |
|---|---|---|
| Deuda neta | Net debt | [CALC] deuda − caja |
| Deuda a largo plazo | Long-term debt | [SEC] |
| Deuda a corto plazo | Short-term debt | [SEC] |
| Deudas totales a capital total | Total debt / total capital | [CALC] |
| Capital invertido total | Total invested capital | [SEC][CALC] |
| Activos totales | Total assets | [SEC] |
| Préstamos netos | Net loans (banca) | [SEC] |
| Activos ponderados por riesgo | Risk-weighted assets (banca) | [SEC] |

## 4. Flujo de caja y capital
| Métrica | Inglés | Fuente |
|---|---|---|
| Flujo de caja libre | Free cash flow | [SEC][CALC] |
| Depreciación + amortización | D&A | [SEC] |
| Gastos de depreciación de acti… (trunc.) | Depreciation expense | [SEC] |
| Incremento de las inversiones | Increase in investments / capex | [SEC] |

## 5. Calidad, riesgo y liquidación
| Métrica | Inglés | Fuente |
|---|---|---|
| Puntuación Z de Altman | Altman Z-score (riesgo quiebra) | [CALC] |
| Valor de liquidación neta (VLN) | Net liquidation value | [CALC] |
| BEst VLN | Net liquidation value (est.) | [EST] |
| Conteo de publicaciones en not… (trunc.) | News publication count | [Y]/proveedor noticias |

## 6. Consenso de analistas
| Métrica | Inglés | Fuente |
|---|---|---|
| Consenso de recomendación | Recommendation consensus | [EST] |
| Recomendaciones de analistas | Analyst recommendations (nº) | [EST] |
| Recomendaciones de compra | Buy | [EST] |
| Recomendaciones de venta | Sell | [EST] |
| Recomendaciones de mantener | Hold | [EST] |

## Nota de cobertura para `wall`
- **[SEC]** ya lo estás construyendo (EDGAR/XBRL companyfacts) — es el bloque autoritativo.
- **[EST]** (todo lo "BEst" + recomendaciones) es el hueco: no está en EDGAR. Hoy Yahoo da algo de
  `recommendationTrend`/`earningsEstimate`; para consenso serio → FMP/Finnhub.
- **[CALC]** son derivados: se computan una vez tienes SEC + precio.
