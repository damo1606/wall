-- EDGAR (SEC) integration — shares outstanding autoritativo vía XBRL.
--
-- Yahoo ya expone sharesOutstanding/marketCap, pero para algunos tickers viene
-- 0/stale; cuando marketCap=0 el scanner salta la normalización F1 (insider flow
-- vs market cap) y se pierde la señal. SEC publica el recuento legal de la portada
-- del último 10-Q/10-K (dei:EntityCommonStockSharesOutstanding) — fuente oficial
-- y gratuita que usamos como fallback/cross-check.
--
-- Poblado por /api/cron/edgar-shares (companyconcept XBRL). Solo símbolos con cik.

ALTER TABLE symbols ADD COLUMN shares_outstanding bigint;
ALTER TABLE symbols ADD COLUMN shares_outstanding_asof date;

COMMENT ON COLUMN symbols.shares_outstanding IS
  'Acciones en circulación según SEC (XBRL dei:EntityCommonStockSharesOutstanding, cover-page del último 10-Q/10-K; fallback us-gaap:CommonStockSharesOutstanding). Fuente autoritativa para reconstruir market cap cuando Yahoo da 0. NULL para símbolos sin cik o sin dato XBRL. Poblado por /api/cron/edgar-shares.';

COMMENT ON COLUMN symbols.shares_outstanding_asof IS
  'Fecha "end" del hecho XBRL del que proviene shares_outstanding (típicamente la fecha de portada del filing). Permite descartar datos rancios.';
