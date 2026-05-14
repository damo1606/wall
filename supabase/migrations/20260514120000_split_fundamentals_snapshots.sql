-- Split `fundamentals_snapshots` (tabla "dios" de 20 columnas) en 3 tablas
-- según frecuencia de cambio real. La vieja se deja intacta para no romper
-- /screener, /valoracion, /comparar, /api/cron/snapshot — se migra el código
-- en un PR aparte y luego se DROP en una migration posterior.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) market_snapshots — precio + cap + beta + IV. Cambian a diario.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE market_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id    uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  taken_at     timestamptz NOT NULL DEFAULT now(),
  price        numeric,
  market_cap   numeric,
  beta         numeric,
  iv_30d       numeric,
  source       text        NOT NULL DEFAULT 'yahoo',
  cron_run_id  uuid        REFERENCES cron_runs(id)
);

CREATE UNIQUE INDEX market_snapshots_one_per_day
  ON market_snapshots (symbol_id, (taken_at::date));

CREATE INDEX idx_market_snapshots_symbol_taken
  ON market_snapshots (symbol_id, taken_at DESC);

ALTER TABLE market_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated"
  ON market_snapshots FOR SELECT TO authenticated USING (true);

INSERT INTO market_snapshots (symbol_id, taken_at, price, market_cap, beta, iv_30d, source, cron_run_id)
SELECT symbol_id, taken_at, price, market_cap, beta, iv_30d, source, cron_run_id
FROM fundamentals_snapshots
WHERE price IS NOT NULL
   OR market_cap IS NOT NULL
   OR beta IS NOT NULL
   OR iv_30d IS NOT NULL
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) fundamentals_quarterly — múltiplos y ratios derivados.
--    Refrescan al publicarse el 10-Q (cada ~90 días), pero pe/pb cambian a
--    diario por el precio, así que mantenemos taken_at diario.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE fundamentals_quarterly (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id       uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  taken_at        timestamptz NOT NULL DEFAULT now(),
  pe              numeric,
  pb              numeric,
  ev_ebitda       numeric,
  roe             numeric,
  roic            numeric,
  fcf_yield       numeric,
  debt_to_equity  numeric,
  dividend_yield  numeric,
  payout_ratio    numeric,
  source          text        NOT NULL DEFAULT 'yahoo',
  cron_run_id     uuid        REFERENCES cron_runs(id)
);

CREATE UNIQUE INDEX fundamentals_quarterly_one_per_day
  ON fundamentals_quarterly (symbol_id, (taken_at::date));

CREATE INDEX idx_fundamentals_quarterly_symbol_taken
  ON fundamentals_quarterly (symbol_id, taken_at DESC);

ALTER TABLE fundamentals_quarterly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated"
  ON fundamentals_quarterly FOR SELECT TO authenticated USING (true);

INSERT INTO fundamentals_quarterly (symbol_id, taken_at, pe, pb, ev_ebitda, roe, roic, fcf_yield, debt_to_equity, dividend_yield, payout_ratio, source, cron_run_id)
SELECT symbol_id, taken_at, pe, pb, ev_ebitda, roe, roic, fcf_yield, debt_to_equity, dividend_yield, payout_ratio, source, cron_run_id
FROM fundamentals_snapshots
WHERE pe IS NOT NULL
   OR pb IS NOT NULL
   OR ev_ebitda IS NOT NULL
   OR roe IS NOT NULL
   OR roic IS NOT NULL
   OR fcf_yield IS NOT NULL
   OR debt_to_equity IS NOT NULL
   OR dividend_yield IS NOT NULL
   OR payout_ratio IS NOT NULL
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) income_metrics — TTM revenue + EPS. Refrescan trimestralmente.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE income_metrics (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id    uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  taken_at     timestamptz NOT NULL DEFAULT now(),
  revenue_ttm  numeric,
  eps_ttm      numeric,
  source       text        NOT NULL DEFAULT 'yahoo',
  cron_run_id  uuid        REFERENCES cron_runs(id)
);

CREATE UNIQUE INDEX income_metrics_one_per_day
  ON income_metrics (symbol_id, (taken_at::date));

CREATE INDEX idx_income_metrics_symbol_taken
  ON income_metrics (symbol_id, taken_at DESC);

ALTER TABLE income_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated"
  ON income_metrics FOR SELECT TO authenticated USING (true);

INSERT INTO income_metrics (symbol_id, taken_at, revenue_ttm, eps_ttm, source, cron_run_id)
SELECT symbol_id, taken_at, revenue_ttm, eps_ttm, source, cron_run_id
FROM fundamentals_snapshots
WHERE revenue_ttm IS NOT NULL
   OR eps_ttm IS NOT NULL
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Vista de compatibilidad para que el código viejo siga funcionando.
--    Hace JOIN de las 3 tablas hijas con LATEST por símbolo.
--    /screener puede seguir leyendo `fundamentals_snapshots_v` mientras se
--    migra a las 3 tablas individuales.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW fundamentals_snapshots_v AS
SELECT
  ms.id,
  ms.symbol_id,
  ms.taken_at,
  ms.cron_run_id,
  ms.source,
  ms.price,
  ms.market_cap,
  ms.beta,
  ms.iv_30d,
  fq.pe,
  fq.pb,
  fq.ev_ebitda,
  fq.roe,
  fq.roic,
  fq.fcf_yield,
  fq.debt_to_equity,
  fq.dividend_yield,
  fq.payout_ratio,
  im.revenue_ttm,
  im.eps_ttm
FROM market_snapshots ms
LEFT JOIN fundamentals_quarterly fq
  ON fq.symbol_id = ms.symbol_id
 AND fq.taken_at::date = ms.taken_at::date
LEFT JOIN income_metrics im
  ON im.symbol_id = ms.symbol_id
 AND im.taken_at::date = ms.taken_at::date;

COMMENT ON TABLE fundamentals_snapshots IS
  'DEPRECATED: tabla original. Reemplazada por market_snapshots + fundamentals_quarterly + income_metrics. Se mantiene mientras el código migra. DROP en migration posterior.';
