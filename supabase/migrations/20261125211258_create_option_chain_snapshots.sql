-- option_chain_snapshots: cabecera de cada toma de cadena de opciones.
--
-- Una fila por (símbolo, día de mercado NY). Guarda el spot del subyacente en
-- el momento de la toma — dato que depende de la toma, no del contrato, así
-- que vive aquí y no en option_chains (3NF).
--
-- La PK (symbol_id, trade_date) es la idempotencia del cron: varias corridas
-- en el mismo día (GitHub Actions retrasa los schedules horas) no duplican
-- la cadena; la primera toma válida en horario de mercado gana.
--
-- quote_ratio = fracción de contratos con bid > 0 y ask > 0. El cron rechaza
-- tomas con quote_ratio < 0.5 (Yahoo fuera de horario devuelve bid/ask/OI en 0).

CREATE TABLE option_chain_snapshots (
  symbol_id    uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  trade_date   date        NOT NULL,                 -- día de mercado en America/New_York
  taken_at     timestamptz NOT NULL,                 -- = option_chains.taken_at de esa toma
  spot         numeric     NOT NULL CHECK (spot > 0),
  contracts    integer     NOT NULL CHECK (contracts > 0),
  quote_ratio  numeric     NOT NULL CHECK (quote_ratio >= 0 AND quote_ratio <= 1),
  cron_run_id  uuid        REFERENCES cron_runs(id) ON DELETE SET NULL,
  PRIMARY KEY (symbol_id, trade_date)
);

CREATE INDEX idx_option_chain_snapshots_taken
  ON option_chain_snapshots(taken_at DESC);

COMMENT ON TABLE option_chain_snapshots IS
  'Cabecera de toma de option_chains: 1 por símbolo y día NY, con spot. Join con option_chains por (symbol_id, taken_at).';

ALTER TABLE option_chain_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_authenticated"
  ON option_chain_snapshots FOR SELECT TO authenticated USING (true);
