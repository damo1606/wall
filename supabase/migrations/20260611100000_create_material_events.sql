-- F3 — material_events: eventos 8-K que merecen hard-block en SORE.
--
-- SEC obliga a las companies a reportar eventos materiales en 8-K dentro de
-- 4 días hábiles. Items relevantes para SORE (vol spike risk):
--   1.01 — Entry into a Material Definitive Agreement (M&A, contratos grandes)
--   2.02 — Results of Operations (earnings preview / surprise)
--   2.05 — Material restructuring
--   4.02 — Non-Reliance on prior financial statements (restatement)
--   5.02 — Departure / appointment of CEO/CFO/director
--   5.07 — Submission of matters to vote (gobierno corporativo)
--   7.01 — Reg FD disclosure (info material no programada)
--   8.01 — Other Material Events (catch-all)
--
-- Acción en SORE: si hay 8-K con event_date en ventana [today-1, today+3]
-- → gate = AVOID. Los demás items (3.01 ETF related, 9.01 attached docs)
-- no se persisten — ruido sin señal.

CREATE TABLE material_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id      uuid        NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  event_date     date        NOT NULL,    -- reportDate (cuando ocurrió)
  filing_date    date        NOT NULL,    -- filingDate (cuando lo filed SEC)
  item_code      text        NOT NULL,    -- "2.02", "5.02", etc
  item_label     text,                    -- human readable
  accession_num  text,                    -- ej. "0001140361-26-023363"
  source         text        NOT NULL DEFAULT 'edgar-8k',
  cron_run_id    uuid        REFERENCES cron_runs(id),
  taken_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol_id, accession_num, item_code)
);

CREATE INDEX idx_material_events_symbol_date
  ON material_events(symbol_id, event_date DESC);

CREATE INDEX idx_material_events_event_date
  ON material_events(event_date DESC);

ALTER TABLE material_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_authenticated"
  ON material_events FOR SELECT TO authenticated USING (true);
