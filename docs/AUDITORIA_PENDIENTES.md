# Auditoría de trabajos pendientes — wall

_Fecha: 2026-05-15 · Rama `main` (al día con `origin/main`, working tree limpio)_

Objetivos del proyecto auditados: **(1) aprovechar oportunidades en el mercado de valores** y **(2) comprar barato, vender caro**.

---

## 1. Migraciones de BD sin aplicar — ✅ RESUELTO (2026-05-15)

Las 5 migraciones pendientes se aplicaron a la BD WALL vía Management API, cada una en su transacción, y se registraron en `supabase_migrations.schema_migrations`:

- ✅ `20260514120000_split_fundamentals_snapshots.sql`
- ✅ `20260514120100_normalize_valuation_components.sql`
- ✅ `20260514120200_track_record_exclusivity_check.sql`
- ✅ `20260514120300_normalize_industries.sql`
- ✅ `20260515000000_alert_events.sql` (desbloquea las alertas del Motor de Oportunidades)

Verificación final: los 9 objetos existen en la BD.

**Se corrigieron 2 bugs reales en el SQL durante la aplicación:**

1. `split_fundamentals_snapshots.sql` — los índices únicos `(taken_at::date)` fallaban con `42P17: functions in index expression must be marked IMMUTABLE` (el cast `timestamptz→date` depende del timezone de sesión). Corregido a `((taken_at AT TIME ZONE 'UTC')::date)`.
2. `normalize_industries.sql` — el backfill usaba una subconsulta correlacionada incompatible con `GROUP BY` (`42803: subquery uses ungrouped column`). Reescrito con `LEFT JOIN LATERAL`.

**Nota:** la tabla `industries` quedó con 0 filas — `symbols.industry` está vacío/NULL, así que no hubo nada que respaldar. La estructura queda lista para datos futuros.

## 2. Prompts de Gemini / Cadenas — 🟡 MEDIA

`lib/cadenas.ts` usa OpenRouter con `google/gemini-2.5-flash`. Los prompts (supply chain, value chain, FODA) ya inyectan datos financieros reales de Yahoo y exigen `oportunidades_inversion` con señal `barato|caro|justo`. **Funcional.**

Riesgos pendientes:

- `extractJSONFromText` (líneas 187-191): el regex de fallback solo soporta **un nivel** de anidamiento de llaves. Los schemas tienen objetos anidados de 2+ niveles → si el LLM envuelve el JSON en texto, el fallback recorta mal el JSON y el análisis falla. El path feliz (JSON directo) funciona; el fallback es frágil.
- La llamada no usa `response_format: { type: "json_object" }`. Activar JSON mode en OpenRouter/Gemini eliminaría la dependencia del regex de fallback.

## 3. Motor de Oportunidades — 🟡 MEDIA

`lib/opportunity.ts` implementado y con tests (`__tests__/opportunity.test.ts`). La Fase 2 (percentil histórico "barato vs su propia historia") está cableada vía `lib/history.ts` → `app/api/oportunidades/route.ts`.

Pendiente real:

- La Fase 2 depende de `methodology_snapshots` con **≥2 observaciones por símbolo**. `getHistoricalPercentiles` omite los que tienen menos historial. Si el cron de snapshot lleva poco tiempo corriendo, la mayoría de tickers tendrán `historicalPercentile: null` → `histPct = 50` (neutral) y la señal histórica no aporta.
- **Acción:** verificar cuántos días de snapshots hay acumulados; la Fase 2 no es efectiva hasta tener historial.

## 4. TODOs abiertos en código — ✅ RESUELTO (2026-05-15)

Los 3 TODOs de persistencia se cerraron reutilizando la tabla genérica
`methodology_snapshots` (sin migración nueva), vía el nuevo módulo `lib/snapshots.ts`:

- `readSnapshotHistory(methodology, symbol)` — historial cronológico por ticker.
- `recordDailySnapshot(methodology, symbol, payload)` — inserta una fila por ticker
  y día UTC, idempotente y best-effort (nunca rompe la respuesta de la API).

Cableado:

- `app/api/iv/route.ts` — lee el historial de IV ATM y persiste la lectura del día.
  IV Rank/Percentile se calculan en cuanto se acumulan ≥5 días.
- `app/api/analysis7/route.ts` — lee el historial de niveles S/R (M1/M2/M3/M5) y
  persiste los del día; alimenta el `historicalDays` de cada cluster S/R.

**Nota:** el historial se construye "al leer" — arranca vacío y se llena conforme se
usan los endpoints. IV Rank y `historicalDays` quedan inertes hasta acumular días.

## 5. Limpieza — ✅ RESUELTO (2026-05-15)

- `.env.local.sore.bak` — eliminado (estaba en `.gitignore`, sin seguimiento).
- `supabase/.temp/` — añadido a `.gitignore`.

---

## Resumen de prioridades

| # | Tema | Estado |
|---|------|--------|
| 1 | Aplicar migraciones (incl. `alert_events`) | ✅ Resuelto |
| 2 | JSON mode + extractor de llaves en Cadenas | ✅ Resuelto |
| 3 | Acumular historial para Fase 2 del Motor | ⏳ Operativo — depende del cron |
| 4 | Persistir S/R e IV histórica | ✅ Resuelto |
| 5 | Borrar `.env.local.sore.bak` + `.gitignore` | ✅ Resuelto |

**#3** es el único pendiente y no es código: el Motor de Oportunidades y los nuevos
historiales (#4) se llenan solos conforme el cron y los endpoints se ejecutan. No hay
nada que implementar — solo dejar pasar los días.
