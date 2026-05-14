-- `symbols.industry` es texto libre mientras `sector_id` es FK a `sectors`.
-- Resultado: typos ("Software" vs "software") rompen agregaciones por
-- industria. Normalizamos creando tabla `industries` y un FK desde symbols.
-- El string `industry` se mantiene marcado como deprecado.

CREATE TABLE industries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  sector_id   uuid        REFERENCES sectors(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_industries_sector ON industries (sector_id);

ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated"
  ON industries FOR SELECT TO authenticated USING (true);

-- Backfill: un row por industry string único en symbols
INSERT INTO industries (name, sector_id)
SELECT
  TRIM(s.industry),
  -- Inferir sector dominante de la industry: el sector más común entre los
  -- símbolos que comparten ese industry string
  (
    SELECT s2.sector_id
    FROM symbols s2
    WHERE TRIM(s2.industry) = TRIM(s.industry)
      AND s2.sector_id IS NOT NULL
    GROUP BY s2.sector_id
    ORDER BY count(*) DESC
    LIMIT 1
  )
FROM symbols s
WHERE s.industry IS NOT NULL
  AND TRIM(s.industry) <> ''
GROUP BY TRIM(s.industry)
ON CONFLICT (name) DO NOTHING;

-- Agregar FK en symbols
ALTER TABLE symbols
  ADD COLUMN industry_id uuid REFERENCES industries(id) ON DELETE SET NULL;

CREATE INDEX idx_symbols_industry_id ON symbols (industry_id);

-- Backfill: enlazar cada symbol con su industry_id
UPDATE symbols s
SET industry_id = i.id
FROM industries i
WHERE i.name = TRIM(s.industry);

COMMENT ON COLUMN symbols.industry IS
  'DEPRECATED: usar industry_id (FK a industries). Se mantiene mientras el código migra. DROP en migration posterior.';
