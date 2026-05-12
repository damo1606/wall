-- Tabla de snapshots diarios para construir track record auditable.
-- Cada fila representa el estado completo de Wall en una fecha.
-- Inmutable: una fila por día, no se actualizan ni se borran.

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date     DATE UNIQUE NOT NULL,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Headline macro
  macro_phase       TEXT,        -- recovery | expansion | late | recession
  macro_confidence  NUMERIC(5,2),
  vix               NUMERIC(8,4),
  vix3m             NUMERIC(8,4),
  fear_score        SMALLINT,
  regime            TEXT,        -- COMPRESIÓN | TRANSICIÓN | EXPANSIÓN | PÁNICO | CRISIS

  -- Payloads completos (JSON normalizado)
  macro_indicators  JSONB,       -- 32 series FRED
  sectors           JSONB,       -- 11 ETF sectoriales
  sore_signals      JSONB,       -- Top N tickers con sus scores SORE
  meta              JSONB,       -- universe, limits, errores

  CONSTRAINT one_snapshot_per_day UNIQUE (snapshot_date)
);

CREATE INDEX idx_snapshots_date     ON daily_snapshots(snapshot_date DESC);
CREATE INDEX idx_snapshots_regime   ON daily_snapshots(regime, snapshot_date DESC);
CREATE INDEX idx_snapshots_phase    ON daily_snapshots(macro_phase, snapshot_date DESC);

-- RLS: lectura pública, escritura solo desde service role (cron usa service key)
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_snapshots" ON daily_snapshots
  FOR SELECT USING (true);

-- Sin política INSERT/UPDATE/DELETE → solo service role puede mutarla
