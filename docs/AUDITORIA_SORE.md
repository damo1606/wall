# Auditoría SORE / Descuentos

**Fecha:** 2026-06-22
**Alcance:** Motor `computeSORE` y pipeline `/sore` (SORE absorbió Descuentos; no existe ruta `/descuentos` separada).
**Archivo núcleo:** `app/api/scanner-pro/route.ts`

---

## Resumen ejecutivo

El motor SORE está bien estructurado (DSS/VSS/VRP → CSS → gate/estrategia) y la integración EDGAR (F1/F2/F3) es coherente y con hard-blocks correctos. Sin embargo hay **una violación directa de una regla declarada del proyecto** (filtro de liquidez ausente) y varios riesgos de robustez y calibración que conviene cerrar antes de confiar en las señales para operar.

---

## Hallazgos

### 🔴 CRÍTICO

**1. La regla de liquidez/volumen/open interest NO está implementada.**
Regla del proyecto: *"solo negociar tickers con liquidez, volumen y open interest suficientes; excluir el resto"*.
- `openInterest` se lee de la cadena de opciones pero solo se almacena con `?? 0` (`route.ts:80,85,124,127`); **nunca se usa como filtro de exclusión**.
- No existe umbral de volumen ni de OI por strike, ni filtro de spread bid/ask.
- El único filtro de entrada es `minBuyScore` (fundamentales), que no dice nada sobre liquidez del subyacente ni de las opciones.
- **Consecuencia:** SORE puede emitir SHORT STRANGLE / IRON CONDOR sobre strikes ilíquidos donde el fill real es imposible o el slippage destruye el edge. Contradice el principio "SORE confiable, no especulativo".
- **Acción:** filtrar por OI mínimo por pata (p.ej. ≥ 500–1000), volumen de opción > 0, y spread bid/ask relativo acotado, antes de seleccionar estrategia.

### 🟠 ALTO

**2. `computeSORE` no tiene tests unitarios.**
Función de decisión financiera (umbrales 45/55/75, bans, hard-blocks) sin un solo test en `__tests__/`. Un cambio de coeficiente puede alterar señales sin que nada lo detecte. Añadir tabla de casos: regímenes, bordes de CSS, activación de `banNakedSells`, paths F1/F2/F3.

**3. Endpoint `/api/scanner-pro` totalmente público.**
`middleware.ts` deja **todas** las rutas sin autenticación. Las señales de trading (estrategia, gate, strikes implícitos) quedan expuestas a cualquiera y el endpoint hace screening pesado (fallback ~100s contra Yahoo) sin rate-limit ni auth → vector de abuso/coste. Evaluar proteger al menos los endpoints de cómputo.

### 🟡 MEDIO

**4. Calibración del insiderSignal (F1) parece sobre-sensible.**
`Math.tanh((netFlowUsd / marketCap) * 1000)`. Con netFlow $1M sobre market cap $1B (ratio 0.001) → tanh(1)=0.76. Una sola venta moderada de insider casi dispara el ban (`insiderSignal < -0.7`). El factor `1000` es mágico y satura tanh muy rápido. Revisar la constante con datos históricos.

**5. Frescura de datos asimétrica.**
`valuation_scores` usa cutoff de 5 días (`route.ts:452`), pero `short_interest` toma el "latest" sin cutoff. Riesgo de mezclar buyScore reciente con short interest stale. Definir TTL explícito por señal.

**6. Single point of failure en Yahoo.**
Tanto Phase B (DB) como el fallback Phase A dependen de Yahoo; si `getCrumb()` falla → 500 global. Es consistente con "Yahoo es fuente única", pero la regla del proyecto pide **blindar la integración antes de migrar**: añadir cache de último-bueno y degradación parcial en vez de fallo total.

### 🟢 BAJO

**7. Validación de query params.**
`parseInt(limit)` y `parseInt(minBuyScore)` sin guarda de `NaN`. `?limit=abc` → `Math.min(NaN,100)=NaN` → `slice(0,NaN)=[]` → respuesta vacía silenciosa en vez de 400. Validar y default explícito.

**8. Comentario semántico de PCR dudoso (`route.ts:255`).**
"PCR > 0.8: dealers sold puts = long delta = support" — la inferencia de posicionamiento del dealer a partir del PCR agregado es frágil; documentar el supuesto o derivarlo de GEX firmado en vez del PCR.

---

## Lo que está bien

- Hard-blocks de régimen (PÁNICO/CRISIS) y evento 8-K (F3) bien colocados y con prioridad correcta.
- Crons protegidos con `Authorization: Bearer CRON_SECRET`.
- Manejo de errores de Yahoo clasificado (rate_limit/not_found/no_data) con backoff.
- `NoOptionsError` distingue "sin opciones" de "sin precio" correctamente (`route.ts:336,340`).

---

## Prioridad sugerida
1. Implementar filtro de liquidez/OI/volumen (#1) — bloquea la fiabilidad de toda señal.
2. Tests de `computeSORE` (#2).
3. Decidir exposición pública del endpoint (#3).
4. Recalibrar F1 y TTLs (#4, #5).
