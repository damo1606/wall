-- EDGAR (SEC) integration — añade el Central Index Key (CIK) a symbols.
-- CIK es el identificador único de SEC para una entidad pública. Formato:
-- texto de hasta 10 dígitos con padding ceros (ej. "0000320193" para AAPL).
-- Se obtiene de https://www.sec.gov/files/company_tickers.json (mapeo
-- ticker → CIK que el cron edgar-cik-backfill hidrata).
--
-- Sin CIK no se puede consultar EDGAR (Form 4 insiders, 8-K eventos, etc.).
-- Los símbolos no-stock (ETFs, indices) y no listados en SEC quedan con
-- cik NULL — los crons de EDGAR los saltan.

ALTER TABLE symbols ADD COLUMN cik text;

-- Index parcial: solo los símbolos con CIK son útiles para crons EDGAR.
CREATE INDEX idx_symbols_cik ON symbols(cik) WHERE cik IS NOT NULL;

COMMENT ON COLUMN symbols.cik IS
  'SEC Central Index Key (10 dígitos con padding ceros). NULL para símbolos no listados en SEC (ETFs, índices, internacionales). Poblado por /api/cron/edgar-cik-backfill.';
