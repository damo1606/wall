-- EDGAR (SEC) — estados financieros desde XBRL (companyfacts).
--
-- Yahoo (quoteSummary) da ratios y flujos pero NO el balance ni el income
-- statement completos. Esta tabla persiste los line items crudos que faltaban
-- (activos, pasivos, retained earnings, COGS, net income, D+A, deuda LP/CP, etc.)
-- para poder calcular Altman Z-score, VLN (net-current-asset-value) y deuda neta.
--
-- Poblada por /api/cron/edgar-financials (endpoint XBRL companyfacts). Solo
-- símbolos con cik. Un row por (símbolo, fin de periodo, periodo fiscal).

CREATE TABLE edgar_financials (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id            uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  period_end           date        NOT NULL,           -- fecha de cierre del periodo (instant/duration end)
  fiscal_period        text        NOT NULL,           -- 'FY' | 'Q1'..'Q4'
  form                 text,                            -- '10-K' | '10-Q'

  -- Balance (instant)
  total_assets         numeric,
  current_assets       numeric,
  total_liabilities    numeric,
  current_liabilities  numeric,
  retained_earnings    numeric,
  stockholders_equity  numeric,
  cash                 numeric,

  -- Income (duration)
  revenue              numeric,
  cogs                 numeric,
  gross_profit         numeric,
  operating_income     numeric,                         -- EBIT proxy
  net_income           numeric,
  dep_amort            numeric,

  -- Deuda
  long_term_debt       numeric,
  short_term_debt      numeric,

  source               text        NOT NULL DEFAULT 'edgar-xbrl',
  cron_run_id          uuid        REFERENCES cron_runs(id),

  UNIQUE (symbol_id, period_end, fiscal_period)
);

CREATE INDEX idx_edgar_financials_symbol_period
  ON edgar_financials (symbol_id, period_end DESC);

ALTER TABLE edgar_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated"
  ON edgar_financials FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE edgar_financials IS
  'Estados financieros (balance + income) desde SEC/XBRL companyfacts. Line items crudos para computar Altman Z, VLN y deuda neta. Poblada por /api/cron/edgar-financials.';
