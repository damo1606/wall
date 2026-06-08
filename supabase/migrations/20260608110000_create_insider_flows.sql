-- EDGAR F1: tabla agregada de flujo de insiders (Form 4) por símbolo y ventana.
--
-- Cada Form 4 declara una transacción individual de un insider (director,
-- officer, owner >10%). El cron edgar-insiders agrega TODAS las transacciones
-- de los últimos N días por símbolo en un solo row: net_flow_usd =
-- sum(buys) - sum(sells), buys/sells contados por transactionAcquiredDisposedCode
-- (A = acquired, D = disposed), solo nonDerivativeTransaction con codes P/S/M.
--
-- Esta tabla alimenta SORE: insiderSignal entra a DSS con 15% de peso.
-- Insider selling fuerte (net_flow < -2% del market cap) → strategy ban
-- de naked sells.

CREATE TABLE insider_flows (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id       uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  net_flow_usd    numeric     NOT NULL,    -- buys - sells (signed, USD)
  buy_usd         numeric     NOT NULL,    -- sum compras
  sell_usd        numeric     NOT NULL,    -- sum ventas
  n_trades        integer     NOT NULL,    -- # de transacciones totales
  n_insiders      integer     NOT NULL,    -- # de insiders distintos (CIKs únicos)
  last_trade_date date,                    -- fecha del trade más reciente
  source          text        NOT NULL DEFAULT 'edgar-form4',
  cron_run_id     uuid        REFERENCES cron_runs(id),
  taken_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol_id, period_end, period_start)
);

CREATE INDEX idx_insider_flows_symbol_period
  ON insider_flows(symbol_id, period_end DESC);

ALTER TABLE insider_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_authenticated"
  ON insider_flows FOR SELECT TO authenticated USING (true);
