-- =============================================================================
-- Backtest layer v2 — NORMALIZADO
-- =============================================================================
-- Reemplaza v1 (migración 20260526200000_backtest_layer.sql) que usaba JSONB
-- pesado. v2 cumple los requisitos del usuario:
--   1. SIN dependencia de una sola tabla — cada fact en su propia tabla
--   2. Tablas pequeñas, fáciles de query, con FKs (no JSONB de blob)
--   3. Latencia controlada — la UI consume price_summary_daily (no raw price_history)
--   4. Bien construido para backtest reproducible
-- =============================================================================

-- ── 0. DROP v1 (datos mínimos: 44 + 3 filas seed, recuperables) ───────────────
DROP TABLE IF EXISTS trade_exits         CASCADE;
DROP TABLE IF EXISTS trade_entries       CASCADE;
DROP TABLE IF EXISTS trigger_rules       CASCADE;
DROP TABLE IF EXISTS sector_rotation_map CASCADE;
DROP TABLE IF EXISTS regime_history      CASCADE;
DROP TABLE IF EXISTS index_memberships   CASCADE;
DROP TABLE IF EXISTS price_history       CASCADE;

-- =============================================================================
-- CATÁLOGO — seed sectores con FK a ETF proxy (los 11 SPDR ya en `symbols`)
-- =============================================================================
INSERT INTO sectors (name, gics_code, etf_proxy_symbol_id)
SELECT 'Technology',              '45', s.id FROM symbols s WHERE s.ticker = 'XLK' UNION ALL
SELECT 'Healthcare',              '35', s.id FROM symbols s WHERE s.ticker = 'XLV' UNION ALL
SELECT 'Financials',              '40', s.id FROM symbols s WHERE s.ticker = 'XLF' UNION ALL
SELECT 'Consumer Discretionary',  '25', s.id FROM symbols s WHERE s.ticker = 'XLY' UNION ALL
SELECT 'Consumer Staples',        '30', s.id FROM symbols s WHERE s.ticker = 'XLP' UNION ALL
SELECT 'Energy',                  '10', s.id FROM symbols s WHERE s.ticker = 'XLE' UNION ALL
SELECT 'Industrials',             '20', s.id FROM symbols s WHERE s.ticker = 'XLI' UNION ALL
SELECT 'Materials',               '15', s.id FROM symbols s WHERE s.ticker = 'XLB' UNION ALL
SELECT 'Real Estate',             '60', s.id FROM symbols s WHERE s.ticker = 'XLRE' UNION ALL
SELECT 'Utilities',               '55', s.id FROM symbols s WHERE s.ticker = 'XLU' UNION ALL
SELECT 'Communication Services',  '50', s.id FROM symbols s WHERE s.ticker = 'XLC';

-- =============================================================================
-- 1. price_history — OHLCV diario (ground truth)
-- =============================================================================
CREATE TABLE price_history (
  symbol_id   uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  open        numeric(20,4),
  high        numeric(20,4),
  low         numeric(20,4),
  close       numeric(20,4),
  adj_close   numeric(20,4),
  volume      bigint,
  source      text        NOT NULL DEFAULT 'yahoo',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol_id, date)
);
CREATE INDEX price_history_date_idx ON price_history(date);
COMMENT ON TABLE price_history IS 'OHLCV ajustado. Fuente: Yahoo. La UI NO debe consultar esta tabla directo — usar price_summary_daily.';

-- =============================================================================
-- 2. price_summary_daily — agregado low-latency para UI (refrescado por cron)
-- =============================================================================
-- Una fila por símbolo con el último cierre + retornos rolling + 52w + volumen.
-- La UI/screener consulta esta tabla (1 fila/símbolo) en vez de price_history
-- (millones de filas). Refrescado por cron tras ohlcv_backfill.
CREATE TABLE price_summary_daily (
  symbol_id              uuid        PRIMARY KEY REFERENCES symbols(id) ON DELETE CASCADE,
  as_of_date             date        NOT NULL,
  close                  numeric(20,4),
  return_1d              numeric,    -- %
  return_5d              numeric,
  return_20d             numeric,
  return_60d             numeric,
  return_ytd             numeric,
  vol_20d_annualized     numeric,    -- σ × √252
  avg_volume_20d         bigint,
  dollar_volume_20d      numeric,    -- avg_volume_20d × close (filtro de liquidez)
  week_52_high           numeric(20,4),
  week_52_low            numeric(20,4),
  drop_from_52w_high_pct numeric,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_summary_daily_dollar_vol_idx ON price_summary_daily(dollar_volume_20d DESC);
COMMENT ON TABLE price_summary_daily IS 'Rollup pre-computado por símbolo. La UI/screener consulta acá, no price_history.';

-- =============================================================================
-- 3. index_memberships — anti-survivorship
-- =============================================================================
CREATE TABLE index_memberships (
  symbol_id  uuid NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  index_code text NOT NULL CHECK (index_code IN ('SPX','DJIA','IXIC','NDX','RUT','QTUM')),
  since      date NOT NULL,
  until      date,  -- NULL = miembro actual
  PRIMARY KEY (symbol_id, index_code, since)
);
CREATE INDEX index_memberships_code_idx ON index_memberships(index_code, since, until);

-- =============================================================================
-- 4. regime_history — snapshot diario macro+regime (columnas planas, sin JSONB)
-- =============================================================================
CREATE TABLE regime_history (
  date              date PRIMARY KEY,
  macro_phase       text NOT NULL CHECK (macro_phase IN ('expansion','peak','contraction','trough')),
  macro_confidence  numeric CHECK (macro_confidence >= 0 AND macro_confidence <= 1),
  m6_regime         text,
  vix               numeric,
  vix3m             numeric,
  vix9d             numeric,
  vvix              numeric,
  equity_pcr        numeric,
  fear_score        integer,
  fear_label        text,
  cron_run_id       uuid REFERENCES cron_runs(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. sector_rotation_map — FK a sectors (NO texto suelto del ETF)
-- =============================================================================
CREATE TABLE sector_rotation_map (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  macro_phase   text NOT NULL CHECK (macro_phase IN ('expansion','peak','contraction','trough')),
  sector_id     uuid NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('FAVORED','NEUTRAL','AVOID')),
  weight        numeric NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  version       integer NOT NULL DEFAULT 1,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (macro_phase, sector_id, version)
);
CREATE INDEX sector_rotation_phase_idx ON sector_rotation_map(macro_phase) WHERE active;

-- =============================================================================
-- 6. trigger_rules — encabezado de regla (SIN JSONB conditions)
-- =============================================================================
CREATE TABLE trigger_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  version            integer NOT NULL,
  rule_type          text NOT NULL CHECK (rule_type IN ('BUY','SELL')),
  min_conditions_met integer,  -- N de M para BUY; NULL para SELL
  active             boolean NOT NULL DEFAULT true,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

-- =============================================================================
-- 7. trigger_rule_conditions — condiciones de BUY (1 fila por COND_N)
-- =============================================================================
CREATE TABLE trigger_rule_conditions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         uuid NOT NULL REFERENCES trigger_rules(id) ON DELETE CASCADE,
  condition_name  text NOT NULL,            -- 'soreGate_GO', 'dropFrom52w', etc.
  condition_expr  text NOT NULL,            -- DSL evaluable: "payload.soreGate = 'GO'"
  order_index     integer NOT NULL DEFAULT 0,
  UNIQUE (rule_id, condition_name)
);
CREATE INDEX trigger_rule_conditions_rule_idx ON trigger_rule_conditions(rule_id, order_index);

-- =============================================================================
-- 8. trigger_rule_exits — razones de SELL (1 fila por exit_reason)
-- =============================================================================
CREATE TABLE trigger_rule_exits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid NOT NULL REFERENCES trigger_rules(id) ON DELETE CASCADE,
  exit_reason   text NOT NULL CHECK (exit_reason IN (
    'TAKE_PROFIT','STOP_LOSS','REGIME_FLIP','SIGNAL_DEGRADED',
    'TIME_EXIT','ROTATION_FLIP'
  )),
  exit_expr     text NOT NULL,
  order_index   integer NOT NULL DEFAULT 0,
  UNIQUE (rule_id, exit_reason)
);

-- =============================================================================
-- 9. trigger_rule_filters — filtros (1 fila por clave/op/valor)
-- =============================================================================
CREATE TABLE trigger_rule_filters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid NOT NULL REFERENCES trigger_rules(id) ON DELETE CASCADE,
  filter_key    text NOT NULL,            -- 'rotation_status','m6_regime','liquidity_usd_20d'
  op            text NOT NULL CHECK (op IN ('=','!=','>','>=','<','<=','IN','NOT IN')),
  filter_value  text NOT NULL             -- cast a número/bool en la app
);
CREATE INDEX trigger_rule_filters_rule_idx ON trigger_rule_filters(rule_id);

-- =============================================================================
-- 10. trade_entries — apertura de posición
-- =============================================================================
CREATE TABLE trade_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     uuid REFERENCES methodology_snapshots(id) ON DELETE SET NULL,
  rule_id         uuid NOT NULL REFERENCES trigger_rules(id),
  symbol_id       uuid NOT NULL REFERENCES symbols(id),
  sector_id       uuid REFERENCES sectors(id),  -- snapshot del sector al entrar
  entry_date      date NOT NULL,
  entry_price     numeric(20,4) NOT NULL,
  rotation_status text CHECK (rotation_status IN ('FAVORED','NEUTRAL','AVOID')),
  rotation_boost  numeric DEFAULT 0,
  cron_run_id     uuid REFERENCES cron_runs(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_entries_open_idx   ON trade_entries(status, entry_date) WHERE status='OPEN';
CREATE INDEX trade_entries_symbol_idx ON trade_entries(symbol_id, entry_date);
CREATE INDEX trade_entries_rule_idx   ON trade_entries(rule_id, entry_date);

-- =============================================================================
-- 11. trade_entry_conditions — qué condiciones se cumplieron al entrar
-- =============================================================================
-- Permite preguntas como "¿qué condición aporta más alpha?".
CREATE TABLE trade_entry_conditions (
  trade_entry_id  uuid NOT NULL REFERENCES trade_entries(id) ON DELETE CASCADE,
  condition_id    uuid NOT NULL REFERENCES trigger_rule_conditions(id) ON DELETE CASCADE,
  met             boolean NOT NULL,
  actual_value    numeric,
  PRIMARY KEY (trade_entry_id, condition_id)
);

-- =============================================================================
-- 12. trade_exits — cierre de posición
-- =============================================================================
CREATE TABLE trade_exits (
  entry_id      uuid PRIMARY KEY REFERENCES trade_entries(id) ON DELETE CASCADE,
  exit_date     date NOT NULL,
  exit_price    numeric(20,4) NOT NULL,
  exit_reason   text NOT NULL CHECK (exit_reason IN (
    'TAKE_PROFIT','STOP_LOSS','REGIME_FLIP','SIGNAL_DEGRADED',
    'TIME_EXIT','ROTATION_FLIP','MANUAL'
  )),
  days_held     integer NOT NULL,
  return_pct    numeric NOT NULL,
  return_vs_spy numeric,
  slippage_bps  integer NOT NULL DEFAULT 7,
  cron_run_id   uuid REFERENCES cron_runs(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_exits_date_idx ON trade_exits(exit_date);

-- =============================================================================
-- 13. EXTENDER backtest_runs (existente) con FK a regla + ventanas walk-forward
-- =============================================================================
ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS rule_id      uuid REFERENCES trigger_rules(id),
  ADD COLUMN IF NOT EXISTS train_start  date,
  ADD COLUMN IF NOT EXISTS train_end    date,
  ADD COLUMN IF NOT EXISTS test_start   date,
  ADD COLUMN IF NOT EXISTS test_end     date,
  ADD COLUMN IF NOT EXISTS notes        text;
CREATE INDEX IF NOT EXISTS backtest_runs_rule_idx ON backtest_runs(rule_id, created_at DESC);

-- =============================================================================
-- 14. backtest_metrics — 1 fila por métrica (no columnas fijas)
-- =============================================================================
-- Mejor que columnas porque podés agregar métricas nuevas sin migrar el schema.
CREATE TABLE backtest_metrics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id  uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  metric_name      text NOT NULL,
  metric_value     numeric NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (backtest_run_id, metric_name)
);

-- =============================================================================
-- 15. backtest_trades — replay del backtest (simulación trade a trade)
-- =============================================================================
CREATE TABLE backtest_trades (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id       uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  trade_entry_id        uuid REFERENCES trade_entries(id) ON DELETE SET NULL,
  symbol_id             uuid REFERENCES symbols(id),
  simulated_entry_date  date NOT NULL,
  simulated_exit_date   date NOT NULL,
  simulated_return_pct  numeric NOT NULL,
  slippage_bps          integer NOT NULL DEFAULT 7,
  exit_reason           text NOT NULL
);
CREATE INDEX backtest_trades_run_idx ON backtest_trades(backtest_run_id);

-- =============================================================================
-- RLS — habilitada en todas (service_role bypasea; cliente no toca)
-- =============================================================================
ALTER TABLE price_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_summary_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE regime_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_rotation_map     ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_rule_exits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_rule_filters    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_entry_conditions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_exits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_metrics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_trades         ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SEED 1: sector_rotation_map (matriz Stovall, FK a sectors)
-- =============================================================================
WITH s AS (
  SELECT id, name FROM sectors
)
INSERT INTO sector_rotation_map (macro_phase, sector_id, status, weight, version)
SELECT m.macro_phase, s.id, m.status, m.weight, 1
FROM s
JOIN (VALUES
  -- expansion: pro-cíclicos
  ('expansion','Technology','FAVORED',1.5),
  ('expansion','Consumer Discretionary','FAVORED',1.3),
  ('expansion','Communication Services','FAVORED',1.2),
  ('expansion','Industrials','FAVORED',1.1),
  ('expansion','Financials','NEUTRAL',1.0),
  ('expansion','Healthcare','NEUTRAL',1.0),
  ('expansion','Materials','NEUTRAL',1.0),
  ('expansion','Energy','NEUTRAL',1.0),
  ('expansion','Real Estate','NEUTRAL',1.0),
  ('expansion','Consumer Staples','AVOID',0.5),
  ('expansion','Utilities','AVOID',0.5),
  -- peak
  ('peak','Energy','FAVORED',1.5),
  ('peak','Materials','FAVORED',1.3),
  ('peak','Financials','FAVORED',1.2),
  ('peak','Industrials','NEUTRAL',1.0),
  ('peak','Healthcare','NEUTRAL',1.0),
  ('peak','Consumer Staples','NEUTRAL',1.0),
  ('peak','Utilities','NEUTRAL',1.0),
  ('peak','Technology','NEUTRAL',1.0),
  ('peak','Real Estate','NEUTRAL',1.0),
  ('peak','Communication Services','NEUTRAL',1.0),
  ('peak','Consumer Discretionary','AVOID',0.5),
  -- contraction: defensivos
  ('contraction','Consumer Staples','FAVORED',1.5),
  ('contraction','Utilities','FAVORED',1.4),
  ('contraction','Healthcare','FAVORED',1.3),
  ('contraction','Materials','NEUTRAL',1.0),
  ('contraction','Energy','NEUTRAL',1.0),
  ('contraction','Real Estate','NEUTRAL',1.0),
  ('contraction','Communication Services','NEUTRAL',1.0),
  ('contraction','Industrials','NEUTRAL',1.0),
  ('contraction','Technology','AVOID',0.5),
  ('contraction','Consumer Discretionary','AVOID',0.5),
  ('contraction','Financials','AVOID',0.5),
  -- trough
  ('trough','Financials','FAVORED',1.5),
  ('trough','Industrials','FAVORED',1.4),
  ('trough','Materials','FAVORED',1.3),
  ('trough','Technology','FAVORED',1.2),
  ('trough','Consumer Discretionary','NEUTRAL',1.0),
  ('trough','Energy','NEUTRAL',1.0),
  ('trough','Healthcare','NEUTRAL',1.0),
  ('trough','Real Estate','NEUTRAL',1.0),
  ('trough','Communication Services','NEUTRAL',1.0),
  ('trough','Consumer Staples','AVOID',0.5),
  ('trough','Utilities','AVOID',0.5)
) AS m(macro_phase, sector_name, status, weight) ON m.sector_name = s.name;

-- =============================================================================
-- SEED 2: trigger_rules (cabeceras) + conditions + exits + filters
-- =============================================================================
-- ---- BUY: rule_v1_rotate (CON rotación) ----
INSERT INTO trigger_rules (id, name, version, rule_type, min_conditions_met, description)
VALUES ('11111111-1111-1111-1111-111111111101'::uuid, 'rule_v1_rotate', 1, 'BUY', 4,
  'Gatillo de compra v1 con motor de rotación sectorial. Redirige a sectores favorecidos en vez de bloquear.');

INSERT INTO trigger_rule_conditions (rule_id, condition_name, condition_expr, order_index) VALUES
('11111111-1111-1111-1111-111111111101'::uuid, 'soreGate_GO',       'payload.soreGate = ''GO''',                                     1),
('11111111-1111-1111-1111-111111111101'::uuid, 'dropFrom52w',       'payload.dropFrom52w <= -15',                                    2),
('11111111-1111-1111-1111-111111111101'::uuid, 'conviction',        'payload.convictionScore >= 60',                                 3),
('11111111-1111-1111-1111-111111111101'::uuid, 'fear_extreme',      'payload.m6FearScore >= 70 OR payload.m6FearScore <= 30',        4),
('11111111-1111-1111-1111-111111111101'::uuid, 'near_support',      'payload.currentPrice <= payload.m1Support * 1.02',              5),
('11111111-1111-1111-1111-111111111101'::uuid, 'graham_discount',   'payload.discountToGraham >= 10',                                6);

INSERT INTO trigger_rule_filters (rule_id, filter_key, op, filter_value) VALUES
('11111111-1111-1111-1111-111111111101'::uuid, 'rotation_status',     '!=',     'AVOID'),
('11111111-1111-1111-1111-111111111101'::uuid, 'm6_regime',           'NOT IN', 'PÁNICO AGUDO'),
('11111111-1111-1111-1111-111111111101'::uuid, 'm6_regime',           'NOT IN', 'CRISIS SISTÉMICA'),
('11111111-1111-1111-1111-111111111101'::uuid, 'liquidity_usd_20d',   '>=',     '1000000');

-- ---- BUY: rule_v1_block (SIN rotación — control para comparar) ----
INSERT INTO trigger_rules (id, name, version, rule_type, min_conditions_met, description)
VALUES ('11111111-1111-1111-1111-111111111102'::uuid, 'rule_v1_block', 1, 'BUY', 4,
  'Gatillo de compra v1 sin rotación (control). Bloquea cuando macro_phase=contraction. Para A/B vs rule_v1_rotate.');

INSERT INTO trigger_rule_conditions (rule_id, condition_name, condition_expr, order_index) VALUES
('11111111-1111-1111-1111-111111111102'::uuid, 'soreGate_GO',       'payload.soreGate = ''GO''',                                     1),
('11111111-1111-1111-1111-111111111102'::uuid, 'dropFrom52w',       'payload.dropFrom52w <= -15',                                    2),
('11111111-1111-1111-1111-111111111102'::uuid, 'conviction',        'payload.convictionScore >= 60',                                 3),
('11111111-1111-1111-1111-111111111102'::uuid, 'fear_extreme',      'payload.m6FearScore >= 70 OR payload.m6FearScore <= 30',        4),
('11111111-1111-1111-1111-111111111102'::uuid, 'near_support',      'payload.currentPrice <= payload.m1Support * 1.02',              5),
('11111111-1111-1111-1111-111111111102'::uuid, 'graham_discount',   'payload.discountToGraham >= 10',                                6);

INSERT INTO trigger_rule_filters (rule_id, filter_key, op, filter_value) VALUES
('11111111-1111-1111-1111-111111111102'::uuid, 'macro_phase',        'IN',     'expansion'),
('11111111-1111-1111-1111-111111111102'::uuid, 'macro_phase',        'IN',     'peak'),
('11111111-1111-1111-1111-111111111102'::uuid, 'm6_regime',          'NOT IN', 'PÁNICO AGUDO'),
('11111111-1111-1111-1111-111111111102'::uuid, 'm6_regime',          'NOT IN', 'CRISIS SISTÉMICA'),
('11111111-1111-1111-1111-111111111102'::uuid, 'liquidity_usd_20d',  '>=',     '1000000');

-- ---- SELL: rule_v1_sell ----
INSERT INTO trigger_rules (id, name, version, rule_type, min_conditions_met, description)
VALUES ('11111111-1111-1111-1111-111111111103'::uuid, 'rule_v1_sell', 1, 'SELL', NULL,
  'Gatillo de venta v1. Cualquier exit que dispare cierra la posición.');

INSERT INTO trigger_rule_exits (rule_id, exit_reason, exit_expr, order_index) VALUES
('11111111-1111-1111-1111-111111111103'::uuid, 'TAKE_PROFIT',     'current_price >= take_profit_target OR unrealized_pct >= 25',                  1),
('11111111-1111-1111-1111-111111111103'::uuid, 'STOP_LOSS',       'current_price <= stop_loss_target OR support_broken',                          2),
('11111111-1111-1111-1111-111111111103'::uuid, 'REGIME_FLIP',     'm6_regime IN (''PÁNICO AGUDO'',''CRISIS SISTÉMICA'')',                         3),
('11111111-1111-1111-1111-111111111103'::uuid, 'SIGNAL_DEGRADED', 'current_css - entry_css <= -20',                                               4),
('11111111-1111-1111-1111-111111111103'::uuid, 'TIME_EXIT',       'days_held > 60 AND unrealized_pct < 5',                                        5),
('11111111-1111-1111-1111-111111111103'::uuid, 'ROTATION_FLIP',   'rotation_status_now = ''AVOID'' AND rotation_status_entry != ''AVOID''',       6);

-- =============================================================================
-- Comentarios
-- =============================================================================
COMMENT ON TABLE sectors                  IS 'Catálogo GICS. etf_proxy_symbol_id apunta al SPDR sectorial (XLK, XLV, ...).';
COMMENT ON TABLE price_history            IS 'OHLCV ajustado. Fuente Yahoo. NO consumir desde la UI — usar price_summary_daily.';
COMMENT ON TABLE price_summary_daily      IS 'Rollup pre-computado para baja latencia en UI. Refrescado por cron tras backfill.';
COMMENT ON TABLE index_memberships        IS 'Anti-survivorship: pertenencia histórica a SPX/RUT/etc.';
COMMENT ON TABLE regime_history           IS 'Snapshot diario del filtro macro + Markov (columnas planas, no JSONB).';
COMMENT ON TABLE sector_rotation_map      IS 'Matriz Stovall normalizada (FK a sectors). Versionado.';
COMMENT ON TABLE trigger_rules            IS 'Cabecera de regla. Detalle en *_conditions/*_exits/*_filters. NUNCA editar, crear nueva versión.';
COMMENT ON TABLE trigger_rule_conditions  IS 'Condiciones de un gatillo de compra (1 fila por COND).';
COMMENT ON TABLE trigger_rule_exits       IS 'Razones de salida de un gatillo de venta.';
COMMENT ON TABLE trigger_rule_filters     IS 'Filtros (macro, liquidez, rotación) de una regla.';
COMMENT ON TABLE trade_entries            IS 'Cada disparo de un gatillo de compra. Una abierta = una fila status=OPEN.';
COMMENT ON TABLE trade_entry_conditions   IS 'Qué condiciones se cumplieron al entrar (atribución de alpha por condición).';
COMMENT ON TABLE trade_exits              IS 'Cierre de una entrada. 1:1 con trade_entries.';
COMMENT ON TABLE backtest_runs            IS 'Corrida de backtest (extendida con FK a regla + ventanas walk-forward).';
COMMENT ON TABLE backtest_metrics         IS 'Métricas de un backtest: 1 fila por (run, metric). Extensible sin migrar schema.';
COMMENT ON TABLE backtest_trades          IS 'Replay trade-a-trade del backtest. Permite re-analizar sin re-simular.';
