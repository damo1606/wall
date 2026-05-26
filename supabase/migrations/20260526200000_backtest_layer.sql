-- Capa de backtesting con rotación sectorial — Fase 1 (datos).
-- Plan v3 en ~/.claude/plans/revisa-si-esta-util-modular-badger.md.
-- Filosofía: comprar barato + vender caro + redirigir capital al sector
-- favorecido cuando el original está en régimen bajista.

-- =====================================================================
-- 1. price_history — OHLCV ajustado por símbolo+fecha (ground truth)
-- =====================================================================
CREATE TABLE IF NOT EXISTS price_history (
  symbol_id   uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  open        numeric(20,4),
  high        numeric(20,4),
  low         numeric(20,4),
  close       numeric(20,4),
  adj_close   numeric(20,4),  -- ya ajustado por splits/dividendos
  volume      bigint,
  source      text        NOT NULL DEFAULT 'yahoo',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol_id, date)
);
CREATE INDEX IF NOT EXISTS price_history_date_idx   ON price_history(date);
CREATE INDEX IF NOT EXISTS price_history_symbol_idx ON price_history(symbol_id);

-- =====================================================================
-- 2. index_memberships — anti-survivorship (qué estuvo en SP500 cuándo)
-- =====================================================================
CREATE TABLE IF NOT EXISTS index_memberships (
  symbol_id  uuid NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  index_code text NOT NULL CHECK (index_code IN ('SPX','DJIA','IXIC','NDX','RUT','QTUM')),
  since      date NOT NULL,
  until      date,  -- NULL = miembro actual
  PRIMARY KEY (symbol_id, index_code, since)
);
CREATE INDEX IF NOT EXISTS index_memberships_code_idx ON index_memberships(index_code, since, until);

-- =====================================================================
-- 3. regime_history — snapshot diario del filtro macro
-- =====================================================================
CREATE TABLE IF NOT EXISTS regime_history (
  date          date PRIMARY KEY,
  macro_regime  text CHECK (macro_regime IN ('expansion','peak','contraction','trough')),
  m6_regime     text,
  vix           numeric,
  vix3m         numeric,
  fear_score    integer,
  signals       jsonb,
  cron_run_id   uuid REFERENCES cron_runs(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 4. sector_rotation_map — matriz Stovall (fase × sector → status)
-- =====================================================================
CREATE TABLE IF NOT EXISTS sector_rotation_map (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  macro_phase    text NOT NULL CHECK (macro_phase IN ('expansion','peak','contraction','trough')),
  sector_etf     text NOT NULL,         -- 'XLK','XLP',...
  status         text NOT NULL CHECK (status IN ('FAVORED','NEUTRAL','AVOID')),
  weight         numeric NOT NULL DEFAULT 1.0,  -- peso relativo en allocación
  version        integer NOT NULL DEFAULT 1,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (macro_phase, sector_etf, version)
);
CREATE INDEX IF NOT EXISTS sector_rotation_phase_idx ON sector_rotation_map(macro_phase) WHERE active;

-- =====================================================================
-- 5. trigger_rules — reglas versionadas (config-as-data)
-- =====================================================================
CREATE TABLE IF NOT EXISTS trigger_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  version            integer NOT NULL,
  rule_type          text NOT NULL CHECK (rule_type IN ('BUY','SELL')),
  conditions         jsonb NOT NULL,
  min_conditions_met integer,           -- N de M para gatillo de compra
  active             boolean NOT NULL DEFAULT true,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);
CREATE INDEX IF NOT EXISTS trigger_rules_active_idx ON trigger_rules(rule_type, active) WHERE active;

-- =====================================================================
-- 6. trade_entries — cada vez que un gatillo de compra dispara
-- =====================================================================
CREATE TABLE IF NOT EXISTS trade_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       uuid REFERENCES methodology_snapshots(id) ON DELETE SET NULL,
  rule_id           uuid NOT NULL REFERENCES trigger_rules(id),
  symbol_id         uuid NOT NULL REFERENCES symbols(id),
  entry_date        date NOT NULL,
  entry_price       numeric(20,4) NOT NULL,
  conditions_met    jsonb NOT NULL,    -- {soreGate_GO: true, dropFrom52w: -18.5, ...}
  rotation_status   text CHECK (rotation_status IN ('FAVORED','NEUTRAL','AVOID')),
  rotation_boost    numeric DEFAULT 0,
  cron_run_id       uuid REFERENCES cron_runs(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_entries_open_idx   ON trade_entries(status, entry_date) WHERE status='OPEN';
CREATE INDEX IF NOT EXISTS trade_entries_symbol_idx ON trade_entries(symbol_id, entry_date);

-- =====================================================================
-- 7. trade_exits — cierre por take-profit/stop/regime/etc.
-- =====================================================================
CREATE TABLE IF NOT EXISTS trade_exits (
  entry_id        uuid PRIMARY KEY REFERENCES trade_entries(id) ON DELETE CASCADE,
  exit_date       date NOT NULL,
  exit_price      numeric(20,4) NOT NULL,
  exit_reason     text NOT NULL CHECK (exit_reason IN (
    'TAKE_PROFIT','STOP_LOSS','REGIME_FLIP','SIGNAL_DEGRADED',
    'TIME_EXIT','ROTATION_FLIP','MANUAL'
  )),
  days_held       integer NOT NULL,
  return_pct      numeric NOT NULL,            -- neto de slippage+comisión
  return_vs_spy   numeric,                     -- alpha vs SPY mismo periodo
  slippage_bps    integer NOT NULL DEFAULT 7,  -- 5 slippage + 2 comisión
  cron_run_id     uuid REFERENCES cron_runs(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- RLS — habilitada con policy permisiva al service role (consistente con resto)
-- =====================================================================
ALTER TABLE price_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE regime_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_rotation_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_exits         ENABLE ROW LEVEL SECURITY;
-- El service_role bypasea RLS por defecto; no se definen policies para el público.

-- =====================================================================
-- SEED 1: sector_rotation_map (matriz Stovall)
-- =====================================================================
INSERT INTO sector_rotation_map (macro_phase, sector_etf, status, weight, version) VALUES
-- expansion: pro-cíclicos
('expansion','XLK', 'FAVORED',1.5,1),('expansion','XLY','FAVORED',1.3,1),
('expansion','XLC','FAVORED',1.2,1),('expansion','XLI','FAVORED',1.1,1),
('expansion','XLF','NEUTRAL',1.0,1),('expansion','XLV','NEUTRAL',1.0,1),
('expansion','XLB','NEUTRAL',1.0,1),('expansion','XLE','NEUTRAL',1.0,1),
('expansion','XLRE','NEUTRAL',1.0,1),
('expansion','XLP','AVOID',0.5,1),  ('expansion','XLU','AVOID',0.5,1),
-- peak: tarde-ciclo, materias primas
('peak','XLE','FAVORED',1.5,1),('peak','XLB','FAVORED',1.3,1),('peak','XLF','FAVORED',1.2,1),
('peak','XLI','NEUTRAL',1.0,1),('peak','XLV','NEUTRAL',1.0,1),('peak','XLP','NEUTRAL',1.0,1),
('peak','XLU','NEUTRAL',1.0,1),('peak','XLK','NEUTRAL',1.0,1),('peak','XLRE','NEUTRAL',1.0,1),
('peak','XLC','NEUTRAL',1.0,1),
('peak','XLY','AVOID',0.5,1),
-- contraction: defensivos
('contraction','XLP','FAVORED',1.5,1),('contraction','XLU','FAVORED',1.4,1),
('contraction','XLV','FAVORED',1.3,1),
('contraction','XLB','NEUTRAL',1.0,1),('contraction','XLE','NEUTRAL',1.0,1),
('contraction','XLRE','NEUTRAL',1.0,1),('contraction','XLC','NEUTRAL',1.0,1),
('contraction','XLI','NEUTRAL',1.0,1),
('contraction','XLK','AVOID',0.5,1),('contraction','XLY','AVOID',0.5,1),
('contraction','XLF','AVOID',0.5,1),
-- trough: recuperación
('trough','XLF','FAVORED',1.5,1),('trough','XLI','FAVORED',1.4,1),
('trough','XLB','FAVORED',1.3,1),('trough','XLK','FAVORED',1.2,1),
('trough','XLY','NEUTRAL',1.0,1),('trough','XLE','NEUTRAL',1.0,1),
('trough','XLV','NEUTRAL',1.0,1),('trough','XLRE','NEUTRAL',1.0,1),
('trough','XLC','NEUTRAL',1.0,1),
('trough','XLP','AVOID',0.5,1),('trough','XLU','AVOID',0.5,1)
ON CONFLICT (macro_phase, sector_etf, version) DO NOTHING;

-- =====================================================================
-- SEED 2: trigger_rules — rule_v1_rotate (BUY) y rule_v1_sell (SELL)
-- =====================================================================
INSERT INTO trigger_rules (name, version, rule_type, conditions, min_conditions_met, description) VALUES
('rule_v1_rotate', 1, 'BUY',
  '{
    "conditions": [
      {"name":"soreGate_GO",       "expr":"payload.soreGate = ''GO''"},
      {"name":"dropFrom52w",       "expr":"payload.dropFrom52w <= -15"},
      {"name":"conviction",        "expr":"payload.convictionScore >= 60"},
      {"name":"fear_extreme",      "expr":"payload.m6FearScore >= 70 OR payload.m6FearScore <= 30"},
      {"name":"near_support",      "expr":"payload.currentPrice <= payload.m1Support * 1.02"},
      {"name":"graham_discount",   "expr":"payload.discountToGraham >= 10"}
    ],
    "filter": {
      "rotation_status_not": "AVOID",
      "m6_regime_not_in": ["PÁNICO AGUDO","CRISIS SISTÉMICA"],
      "min_liquidity_usd": 1000000
    }
  }'::jsonb,
  4,
  'Gatillo de compra v1 CON rotación: usa sector_rotation_map para redirigir en vez de bloquear.'
),
('rule_v1_block', 1, 'BUY',
  '{
    "conditions": [
      {"name":"soreGate_GO",       "expr":"payload.soreGate = ''GO''"},
      {"name":"dropFrom52w",       "expr":"payload.dropFrom52w <= -15"},
      {"name":"conviction",        "expr":"payload.convictionScore >= 60"},
      {"name":"fear_extreme",      "expr":"payload.m6FearScore >= 70 OR payload.m6FearScore <= 30"},
      {"name":"near_support",      "expr":"payload.currentPrice <= payload.m1Support * 1.02"},
      {"name":"graham_discount",   "expr":"payload.discountToGraham >= 10"}
    ],
    "filter": {
      "macro_regime_in": ["expansion","peak"],
      "m6_regime_not_in": ["PÁNICO AGUDO","CRISIS SISTÉMICA"],
      "min_liquidity_usd": 1000000
    }
  }'::jsonb,
  4,
  'Gatillo de compra v1 SIN rotación (control): bloquea cuando macro=contraction.'
),
('rule_v1_sell', 1, 'SELL',
  '{
    "exits": [
      {"reason":"TAKE_PROFIT",     "expr":"current_price >= take_profit_target OR unrealized_pct >= 25"},
      {"reason":"STOP_LOSS",       "expr":"current_price <= stop_loss_target OR support_broken"},
      {"reason":"REGIME_FLIP",     "expr":"m6_regime IN (''PÁNICO AGUDO'',''CRISIS SISTÉMICA'')"},
      {"reason":"SIGNAL_DEGRADED", "expr":"current_css - entry_css <= -20"},
      {"reason":"TIME_EXIT",       "expr":"days_held > 60 AND unrealized_pct < 5"},
      {"reason":"ROTATION_FLIP",   "expr":"rotation_status_now = ''AVOID'' AND rotation_status_entry != ''AVOID''"}
    ]
  }'::jsonb,
  NULL,
  'Gatillo de venta v1: cualquier exit que dispare cierra la posición.'
)
ON CONFLICT (name, version) DO NOTHING;

-- =====================================================================
-- Comentarios para auditoría
-- =====================================================================
COMMENT ON TABLE price_history       IS 'OHLCV ajustado por símbolo y fecha. Fuente: Yahoo. Re-fetch últimos 5 días por revisiones.';
COMMENT ON TABLE index_memberships   IS 'Anti-survivorship: pertenencia histórica a índices (SPX, RUT, etc).';
COMMENT ON TABLE regime_history      IS 'Snapshot diario del filtro macro + Markov, para reproducir backtest.';
COMMENT ON TABLE sector_rotation_map IS 'Matriz Stovall: fase macro × sector → FAVORED/NEUTRAL/AVOID. Versionado.';
COMMENT ON TABLE trigger_rules       IS 'Reglas de compra/venta versionadas (config-as-data). NUNCA editar, crear nueva versión.';
COMMENT ON TABLE trade_entries       IS 'Cada disparo de un gatillo de compra. status=OPEN hasta que se cierre.';
COMMENT ON TABLE trade_exits         IS 'Cierre de una entrada. 1:1 con trade_entries.';
