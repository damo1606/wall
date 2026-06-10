-- F2 — short interest persistido desde Yahoo defaultKeyStatistics.
--
-- Yahoo expone los datos de short interest reportados por exchanges (FINRA
-- biweekly) en su payload de quoteSummary. Como el cron fundamentals_daily ya
-- hace fetchStockData() para los 159 stocks, persistimos también la fila
-- de short_interest en la misma corrida — 0 llamadas Yahoo adicionales,
-- daily refresh.
--
-- Campos clave para SORE:
-- - short_ratio_float: shortPercentOfFloat de Yahoo (0-1). Si > 0.15 → degrada
--   VRP. Si > 0.20 → strategy ban de naked sells (squeeze risk).
-- - short_ratio_days: shortRatio de Yahoo (days to cover). Útil para context.

CREATE TABLE short_interest (
  symbol_id           uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  settlement_date     date        NOT NULL,    -- dateShortInterest (FINRA settlement)
  short_shares        bigint      NOT NULL,    -- sharesShort
  short_shares_prior  bigint,                  -- sharesShortPriorMonth
  float_shares        bigint,                  -- floatShares
  shares_outstanding  bigint,                  -- sharesOutstanding
  short_ratio_float   numeric,                 -- shortPercentOfFloat (0-1)
  short_ratio_days    numeric,                 -- shortRatio (days to cover)
  source              text        NOT NULL DEFAULT 'yahoo',
  cron_run_id         uuid        REFERENCES cron_runs(id),
  taken_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol_id, settlement_date)
);

CREATE INDEX idx_short_interest_symbol_date
  ON short_interest(symbol_id, settlement_date DESC);

ALTER TABLE short_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_authenticated"
  ON short_interest FOR SELECT TO authenticated USING (true);
