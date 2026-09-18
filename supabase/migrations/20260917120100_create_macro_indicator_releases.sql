-- Calendario + consenso/actual de releases macro (CPI, GDP, PMI, etc.) por
-- divisa, para las 8 divisas que usa el módulo forex (app/macro-fx).
--
-- A diferencia de las tablas snapshot (append-only), esta es upsert por
-- diseño: un release real tiene su consensus conocido antes que su actual —
-- es el mismo evento evolucionando, no una lectura independiente cada vez.
--
-- release_date (no period) es la clave: es lo único que el feed de
-- ForexFactory garantiza sin ambigüedad — la fecha en que se PUBLICA el
-- dato, no el periodo/mes que representa (ej. el CPI de agosto se publica
-- en septiembre). `period` queda best-effort para cuando haga falta derivarlo.

CREATE TABLE macro_indicator_releases (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  currency      text        NOT NULL CHECK (currency IN ('EUR','USD','GBP','JPY','CHF','CAD','AUD','NZD')),
  indicator     text        NOT NULL CHECK (indicator IN ('CPI','GDP','Unemployment','PMI','RetailSales','TradeBalance','InterestRate')),
  release_date  date        NOT NULL,
  period        date,
  event_title   text,
  actual        numeric,
  consensus     numeric,
  previous_raw  numeric,
  source        text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','fred','forexfactory')),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency, indicator, release_date)
);

CREATE INDEX idx_macro_releases_series
  ON macro_indicator_releases(currency, indicator, release_date DESC);

COMMENT ON TABLE macro_indicator_releases IS
  'Calendario y consenso/actual de releases macro por divisa. Dato de mercado público, no de usuario. Upsert por (currency, indicator, release_date).';
COMMENT ON COLUMN macro_indicator_releases.previous_raw IS
  'Valor "previous" tal cual lo reporta la fuente (ForexFactory) — preferir sobre calcular la fila anterior propia.';

ALTER TABLE macro_indicator_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_authenticated"
  ON macro_indicator_releases FOR SELECT TO authenticated USING (true);
