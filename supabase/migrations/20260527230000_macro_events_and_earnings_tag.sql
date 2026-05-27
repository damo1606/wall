-- =============================================================================
-- Macro events (FOMC, CPI, PPI, etc.) + tag de earnings en trade_entries
-- =============================================================================
-- El motor de gatillos necesita conocer fechas catalíticas predecibles para:
--   1. Bloquear aperturas en ventanas pre-evento
--   2. Pausar exits STOP_LOSS/SIGNAL_DEGRADED el día del evento
--      (los exits sistémicos REGIME_FLIP/ROTATION_FLIP siguen activos)
-- =============================================================================

CREATE TABLE IF NOT EXISTS macro_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date        date NOT NULL,
  event_type  text NOT NULL CHECK (event_type IN ('FOMC','CPI','PPI','JOBS','GDP')),
  importance  text NOT NULL DEFAULT 'HIGH' CHECK (importance IN ('HIGH','MEDIUM','LOW')),
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, event_type)
);
CREATE INDEX IF NOT EXISTS macro_events_date_idx ON macro_events(date);
COMMENT ON TABLE macro_events IS 'Eventos macro predecibles: FOMC, CPI, PPI, jobs, GDP. Usado por el motor de gatillos para pausar aperturas/exits.';

ALTER TABLE trade_entries ADD COLUMN IF NOT EXISTS earnings_within_5d boolean DEFAULT false;
COMMENT ON COLUMN trade_entries.earnings_within_5d IS 'Si el símbolo tenía earnings dentro de 5 días al abrir la posición. Filtrable para analizar performance vs eventos.';

-- =============================================================================
-- SEED: fechas FOMC 2026 (2 días por reunión, anunciadas por el Fed)
-- =============================================================================
INSERT INTO macro_events (date, event_type, importance, description) VALUES
  ('2026-01-27','FOMC','HIGH','FOMC meeting Jan 27-28 (day 1)'),
  ('2026-01-28','FOMC','HIGH','FOMC meeting Jan 27-28 (day 2 + decision)'),
  ('2026-03-17','FOMC','HIGH','FOMC meeting Mar 17-18 (day 1)'),
  ('2026-03-18','FOMC','HIGH','FOMC meeting Mar 17-18 (day 2 + decision + SEP)'),
  ('2026-04-28','FOMC','HIGH','FOMC meeting Apr 28-29 (day 1)'),
  ('2026-04-29','FOMC','HIGH','FOMC meeting Apr 28-29 (day 2 + decision)'),
  ('2026-06-16','FOMC','HIGH','FOMC meeting Jun 16-17 (day 1)'),
  ('2026-06-17','FOMC','HIGH','FOMC meeting Jun 16-17 (day 2 + decision + SEP)'),
  ('2026-07-28','FOMC','HIGH','FOMC meeting Jul 28-29 (day 1)'),
  ('2026-07-29','FOMC','HIGH','FOMC meeting Jul 28-29 (day 2 + decision)'),
  ('2026-09-15','FOMC','HIGH','FOMC meeting Sep 15-16 (day 1)'),
  ('2026-09-16','FOMC','HIGH','FOMC meeting Sep 15-16 (day 2 + decision + SEP)'),
  ('2026-10-27','FOMC','HIGH','FOMC meeting Oct 27-28 (day 1)'),
  ('2026-10-28','FOMC','HIGH','FOMC meeting Oct 27-28 (day 2 + decision)'),
  ('2026-12-08','FOMC','HIGH','FOMC meeting Dec 8-9 (day 1)'),
  ('2026-12-09','FOMC','HIGH','FOMC meeting Dec 8-9 (day 2 + decision + SEP)')
ON CONFLICT (date, event_type) DO NOTHING;

-- RLS — habilitada (service_role bypasea)
ALTER TABLE macro_events ENABLE ROW LEVEL SECURITY;
