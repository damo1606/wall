# Wall — Esquema Supabase normalizado

Diseño de base de datos para las funciones actuales de Wall, optimizado para que el cron de snapshots construya un activo de datos auditable y medible.

## 0. Principios de diseño

1. **`symbols` como tabla maestra** — todo se referencia por `symbol_id` (FK), no por ticker string. Permite renombres y delisting sin romper historia.
2. **Append-only para snapshots** — todo lo que genera el cron es inmutable. No `UPDATE`, solo `INSERT` con `taken_at`. Eso da track record real, no reescrito.
3. **Particionado lógico por fecha** (`taken_at::date`) en tablas de alta cardinalidad (`gex_snapshots`, `option_chains`, `fundamentals_snapshots`).
4. **RLS por `user_id`** en todo lo que es de usuario (portafolios, alertas, diario). Datos de mercado son públicos a usuarios autenticados.
5. **Cada tabla snapshot tiene un `cron_run_id`** que ata la fila a la ejecución que la generó → trazabilidad total para `/data-quality`.
6. **Métricas como tablas, no como código** — los KPIs salen de queries SQL sobre `cron_runs` + `data_quality_log`, no de logs de Vercel.

---

## 1. Núcleo / Referencia

### `symbols`
**Para qué:** ancla universal. Reemplaza el string `"AAPL"` en todas partes.
**Columnas clave:** `id (uuid)`, `ticker`, `name`, `sector_id`, `industry`, `exchange`, `asset_type` (`stock|etf|fx|future`), `is_active`, `delisted_at`.

### `sectors`
**Para qué:** taxonomía sectorial estable para rotación y scoring.
**Columnas:** `id`, `name`, `gics_code`, `etf_proxy_symbol_id`.

### `users_profile`
**Para qué:** extiende `auth.users` con preferencias de Wall.
**Columnas:** `user_id (FK auth.users)`, `display_name`, `tier` (`free|pro|institutional`), `base_currency`, `default_horizon_days`.

---

## 2. Pilar Acciones (Fundamental)

### `fundamentals_snapshots`
**Para qué:** estado financiero diario por símbolo. La materia prima del screener.
**Columnas:** `id`, `symbol_id`, `taken_at`, `cron_run_id`, `price`, `market_cap`, `pe`, `pb`, `ev_ebitda`, `roe`, `roic`, `fcf_yield`, `debt_to_equity`, `revenue_ttm`, `eps_ttm`, `dividend_yield`, `payout_ratio`, `beta`, `iv_30d`, `source`.
**Sirve:** `/screener`, `/valoracion`, `/comparar`.

### `valuation_scores`
**Para qué:** salida de las 7 metodologías de análisis (`/api/analysis*`).
**Columnas:** `id`, `symbol_id`, `methodology` (`M1..M7`), `score` (0-100), `components (jsonb)`, `taken_at`, `cron_run_id`.
**Sirve:** screener ordenado, señales, comparador, `/track-record`.

### `signals`
**Para qué:** señales discretas con timestamp inmutable. Auditable.
**Columnas:** `id`, `symbol_id`, `signal_type` (`fundamental|technical|gex|macro`), `direction` (`long|short|neutral`), `strength` (1-5), `rationale (jsonb)`, `triggered_at`, `expires_at`, `closed_at`, `outcome_return`, `cron_run_id`.
**Sirve:** `/senales`, `/track-record`, alertas.

### `sector_scores`
**Para qué:** scoring sectorial diario para rotación top-down.
**Columnas:** `id`, `sector_id`, `score`, `momentum`, `valuation`, `taken_at`.
**Sirve:** `/sectores`, `/rotacion`, screener filtrado por sector caliente.

### `cycle_classifications`
**Para qué:** régimen macro del día (expansion/peak/contraction/trough).
**Columnas:** `id`, `taken_at`, `regime`, `confidence`, `signals (jsonb)`.
**Sirve:** `/ciclos`, scoring contextual.

---

## 3. Pilar Institucional (Opciones / GEX)

### `option_chains`
**Para qué:** cadena cruda de opciones por símbolo y expiración. Materia prima de todo lo institucional.
**Columnas:** `id`, `symbol_id`, `expiration`, `strike`, `option_type` (`call|put`), `bid`, `ask`, `last`, `iv`, `delta`, `gamma`, `theta`, `vega`, `open_interest`, `volume`, `taken_at`, `cron_run_id`.
**Sirve:** `/gex`, `/gamma-map`, `/scanner-pro`, S/R opcional.

### `gex_snapshots`
**Para qué:** GEX agregado por símbolo + spot. Es la vista resumen que más se consulta.
**Columnas:** `id`, `symbol_id`, `taken_at`, `spot_price`, `total_gamma`, `call_gamma`, `put_gamma`, `dealer_position`, `flip_point`, `zero_gamma`, `cron_run_id`.
**Sirve:** dashboards GEX, scanner, alertas.

### `gamma_map`
**Para qué:** GEX por strike — granularidad para el heatmap 2D.
**Columnas:** `id`, `symbol_id`, `expiration`, `strike`, `net_gex`, `call_gex`, `put_gex`, `taken_at`, `cron_run_id`.
**Sirve:** `/gamma-map`, `/api/heatmap2d`.

### `support_resistance_levels`
**Para qué:** niveles S/R derivados de gamma walls / open interest.
**Columnas:** `id`, `symbol_id`, `level_price`, `level_type` (`support|resistance`), `strength`, `source` (`gex|oi|technical`), `taken_at`.
**Sirve:** `/api/sr`, charts.

### `scanner_results`
**Para qué:** resultado diario del scanner (unusual options, gamma squeeze candidates).
**Columnas:** `id`, `taken_at`, `symbol_id`, `scan_type`, `score`, `metrics (jsonb)`, `cron_run_id`.

### `rotation_signals`
**Para qué:** flujo entre sectores derivado de opciones + ETFs.
**Columnas:** `id`, `from_sector_id`, `to_sector_id`, `strength`, `taken_at`.

---

## 4. Pilar Portafolio

### `portfolios`
**Para qué:** un usuario puede tener varios portafolios (real, paper, IRA, etc.).
**Columnas:** `id`, `user_id`, `name`, `type` (`real|paper`), `base_currency`, `broker`, `created_at`.

### `positions`
**Para qué:** estado actual derivado de `transactions`. **Materializada con trigger**, no escrita a mano.
**Columnas:** `id`, `portfolio_id`, `symbol_id`, `qty`, `avg_cost`, `opened_at`, `last_updated_at`.

### `transactions`
**Para qué:** **ledger inmutable**. Fuente de verdad del portafolio. No se edita, se reversa con otra transacción.
**Columnas:** `id`, `portfolio_id`, `symbol_id`, `tx_type` (`buy|sell|dividend|split|fee`), `qty`, `price`, `fee`, `executed_at`, `notes`.

### `watchlist`
**Columnas:** `id`, `user_id`, `symbol_id`, `added_at`, `notes`.

### `alerts`
**Columnas:** `id`, `user_id`, `symbol_id`, `condition` (`price_above|gex_flip|signal_fires|...`), `threshold (jsonb)`, `channel` (`email|webhook`), `is_active`, `created_at`.

### `alert_triggers`
**Para qué:** log de cada disparo. Auditable.
**Columnas:** `id`, `alert_id`, `fired_at`, `payload (jsonb)`, `delivered`, `delivery_attempts`.

### `diario_entries`
**Para qué:** journaling estructurado — clave para mejorar como inversor.
**Columnas:** `id`, `user_id`, `symbol_id`, `entry_date`, `thesis`, `sentiment` (-2..+2), `conviction` (1-10), `attachments (jsonb)`, `linked_signal_id`.

### `prospectiva_theses`
**Para qué:** tesis forward-looking con horizonte y target. Se cierra al alcanzarse o expirar.
**Columnas:** `id`, `user_id`, `symbol_id`, `target_price`, `horizon_days`, `conviction`, `entry_thesis`, `opened_at`, `closed_at`, `outcome` (`hit|miss|expired`), `realized_return`.

---

## 5. Pilar Macro FX

### `cot_reports`
**Para qué:** Commitment of Traders semanal por contrato. Posicionamiento de manos fuertes.
**Columnas:** `id`, `contract_code`, `report_date`, `commercial_long`, `commercial_short`, `non_commercial_long`, `non_commercial_short`, `open_interest`, `cron_run_id`.

### `fred_series`
**Columnas:** `id`, `series_id` (FRED code), `name`, `units`, `frequency`, `category`.

### `fred_observations`
**Columnas:** `id`, `series_id (FK)`, `obs_date`, `value`, `fetched_at`, `cron_run_id`.
**Sirve:** `/macro-fx`, ciclos, contexto.

### `fx_rates`
**Columnas:** `id`, `base`, `quote`, `rate`, `taken_at`, `cron_run_id`.

---

## 6. Pilar Empresa (cualitativo)

### `company_profile`
**Columnas:** `symbol_id (PK)`, `description`, `employees`, `hq_country`, `ceo`, `founded`, `website`.

### `foda_analyses`
**Para qué:** SWOT versionado por símbolo. Cada generación nueva crea otra fila — historial.
**Columnas:** `id`, `symbol_id`, `strengths (jsonb)`, `weaknesses (jsonb)`, `opportunities (jsonb)`, `threats (jsonb)`, `generated_at`, `source` (`ai|manual`).

### `supply_chain_links`
**Columnas:** `id`, `symbol_id`, `partner_symbol_id`, `relation` (`supplier|customer`), `concentration_pct`, `source`, `as_of`.

### `value_chain_segments`
**Columnas:** `id`, `symbol_id`, `segment_name`, `position` (`upstream|midstream|downstream`), `margin_pct`, `as_of`.

### `news_cache`
**Columnas:** `id`, `symbol_id`, `headline`, `summary`, `url`, `source`, `published_at`, `sentiment`, `fetched_at`.

---

## 7. Transversal / Auditoría (el activo estratégico)

### `cron_runs`
**Para qué:** registro de cada ejecución del cron. **De aquí salen casi todos los KPIs.**
**Columnas:** `id`, `job_name`, `started_at`, `finished_at`, `status` (`success|partial|failed`), `rows_inserted`, `rows_failed`, `error_summary`, `duration_ms`.

### `data_quality_log`
**Para qué:** un registro por (job × símbolo × campo) cuando algo está fuera de rango o falta.
**Columnas:** `id`, `cron_run_id`, `symbol_id`, `check_name`, `severity` (`info|warn|error`), `expected (jsonb)`, `actual (jsonb)`, `created_at`.
**Sirve:** `/data-quality`.

### `api_usage_log`
**Para qué:** controlar Yahoo Finance / FRED / proveedores. Defensa contra rate limits.
**Columnas:** `id`, `provider`, `endpoint`, `called_at`, `status_code`, `latency_ms`, `cron_run_id`.

### `track_record`
**Para qué:** **el activo más valioso del producto**. Cada tesis/señal cerrada con outcome real.
**Columnas:** `id`, `user_id` (nullable: global vs por usuario), `symbol_id`, `signal_id` o `thesis_id`, `entry_date`, `entry_price`, `exit_date`, `exit_price`, `return_pct`, `benchmark_return_pct`, `alpha_pct`, `methodology`, `horizon_days`, `notes`.

### `backtest_runs`
**Para qué:** simulaciones reproducibles.
**Columnas:** `id`, `user_id`, `strategy_name`, `config (jsonb)`, `start_date`, `end_date`, `cagr`, `sharpe`, `max_dd`, `trades_count`, `created_at`.

### `snapshots_m1..m7`
**Decisión arquitectónica:** **NO crear 7 tablas separadas**. Una sola tabla `methodology_snapshots` con columna `methodology M1..M7`. Las 7 tablas separadas son una trampa de duplicación de código. (Esto contradice lo que sugiere el path `/api/snapshots/m1..m7` — el endpoint puede seguir separado, pero la tabla destino es una.)

---

## 8. Resultados medibles (KPIs salida del cron)

Estos son los números que aparecen en `/data-quality` y que justifican que el cron está creando valor. **Todos calculables con SQL puro sobre las tablas anteriores.**

| KPI | Query base | Meta inicial |
|---|---|---|
| **Cobertura diaria** | `% symbols con fundamentals_snapshot hoy / total active` | ≥ 98% |
| **Latencia post-close** | `median(finished_at - market_close)` en `cron_runs` | < 15 min |
| **Tasa de error API** | `count(api_usage_log where status_code != 200) / total` | < 1% |
| **Anomalías por día** | `count(data_quality_log where severity='error')` | < 5 |
| **Símbolos stale** | `count(symbols where last snapshot > 48h)` | 0 |
| **Hit rate de señales** | `% signals closed donde outcome_return > 0` (30/90/365d) | > 55% (vs 50% baseline) |
| **Alpha rolling 90d** | `avg(track_record.alpha_pct) últimos 90d` | > 0 |
| **Sharpe del backtest agregado** | desde `backtest_runs` | > 1.0 |
| **Tiempo medio de generación** | `avg(duration_ms)` por job | tendencia estable o ↓ |
| **Costo de API por día** | desde `api_usage_log` × pricing por proveedor | < umbral por tier |

**Vista materializada sugerida:** `data_quality_daily` que reagrega lo anterior por día → eso es lo que pinta `/data-quality` sin queries pesadas en runtime.

---

## 9. Orden de migración recomendado

1. `symbols`, `sectors`, `users_profile` (referencia)
2. `cron_runs`, `data_quality_log`, `api_usage_log` (instrumentación — **antes que cualquier dato**)
3. `fundamentals_snapshots`, `valuation_scores`, `sector_scores`, `cycle_classifications` (Acciones)
4. `option_chains`, `gex_snapshots`, `gamma_map`, `scanner_results`, `support_resistance_levels` (Institucional)
5. `cot_reports`, `fred_series`, `fred_observations`, `fx_rates` (Macro)
6. `portfolios`, `transactions`, `positions` (trigger), `watchlist`, `alerts`, `alert_triggers`, `diario_entries`, `prospectiva_theses` (Usuario)
7. `company_profile`, `foda_analyses`, `supply_chain_links`, `value_chain_segments`, `news_cache` (Cualitativo)
8. `signals`, `track_record`, `backtest_runs` (Auditoría final — depende de las anteriores)

**Regla de oro:** la instrumentación (paso 2) va antes que los datos. Si llega el primer cron y no hay `cron_runs`, no sabes qué falló.

---

## 10. Decisiones pendientes (necesito tu input)

- **¿Multi-portafolio desde el día 1 o un solo portafolio por usuario?** Afecta `positions` y `transactions`.
- **¿Track record global (señales públicas auditables) o solo por usuario?** Si es global, es marketing orgánico permanente.
- **¿Particionado nativo Postgres o solo índices por `taken_at`?** Importante si pasamos de 10k a 5M filas/día en `option_chains`.
- **¿Borramos snapshots viejos a >2 años o los archivamos en cold storage?** El costo Supabase escala con storage.
