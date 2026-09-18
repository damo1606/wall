-- Consenso de analistas por acción, snapshot diario vía el cron de fundamentales.
--
-- fetchStockData() ya trae targetMean/Median/High/Low, recommendationMean y
-- analystCount en cada corrida diaria (financialData de Yahoo) — 0 fetches
-- nuevos. Se persiste para poder backtestear si el consenso predijo el
-- movimiento real del precio. Append-only: una fila por símbolo y corrida,
-- igual que market_snapshots/fundamentals_quarterly.

CREATE TABLE analyst_consensus_snapshots (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id           uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  taken_at            timestamptz NOT NULL,
  cron_run_id         uuid        REFERENCES cron_runs(id),
  target_mean         numeric,
  target_median       numeric,
  target_high         numeric,
  target_low          numeric,
  analyst_count       integer,
  recommendation_mean numeric,
  recommendation_key  text,
  source              text        NOT NULL DEFAULT 'yahoo'
);

CREATE INDEX idx_analyst_consensus_symbol_date
  ON analyst_consensus_snapshots(symbol_id, taken_at DESC);

COMMENT ON TABLE analyst_consensus_snapshots IS
  'Consenso de analistas (target price, rating) por símbolo y día. Dato de mercado público, no de usuario.';

ALTER TABLE analyst_consensus_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_authenticated"
  ON analyst_consensus_snapshots FOR SELECT TO authenticated USING (true);
