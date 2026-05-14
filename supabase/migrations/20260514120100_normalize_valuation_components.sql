-- Normaliza `valuation_scores.components (jsonb)` a tabla hija para poder
-- filtrar/agregar por sub-métrica (ej. "símbolos donde M3 component
-- 'momentum' > 70"). El jsonb se mantiene mientras el código se adapta.
--
-- Asunción de shape: components es un objeto JSON plano del tipo
--   { "momentum": 72, "quality": 64, "valuation": 81 }
-- Si tu shape real anida {"value": ..., "weight": ...}, el CASE de abajo
-- también lo soporta.

CREATE TABLE valuation_score_components (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_score_id  uuid    NOT NULL REFERENCES valuation_scores(id) ON DELETE CASCADE,
  component_name      text    NOT NULL,
  component_value     numeric,
  component_weight    numeric,
  UNIQUE (valuation_score_id, component_name)
);

CREATE INDEX idx_vsc_score
  ON valuation_score_components (valuation_score_id);

CREATE INDEX idx_vsc_name_value
  ON valuation_score_components (component_name, component_value);

ALTER TABLE valuation_score_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_authenticated"
  ON valuation_score_components FOR SELECT TO authenticated USING (true);

-- Backfill: unpack components jsonb a filas
INSERT INTO valuation_score_components (valuation_score_id, component_name, component_value, component_weight)
SELECT
  vs.id,
  kv.key,
  CASE
    WHEN jsonb_typeof(kv.value) = 'number' THEN (kv.value)::text::numeric
    WHEN jsonb_typeof(kv.value) = 'object' AND kv.value ? 'value'
      THEN NULLIF(kv.value->>'value', '')::numeric
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(kv.value) = 'object' AND kv.value ? 'weight'
      THEN NULLIF(kv.value->>'weight', '')::numeric
    ELSE NULL
  END
FROM valuation_scores vs,
     LATERAL jsonb_each(vs.components) AS kv(key, value)
WHERE vs.components IS NOT NULL
  AND jsonb_typeof(vs.components) = 'object'
ON CONFLICT (valuation_score_id, component_name) DO NOTHING;

COMMENT ON COLUMN valuation_scores.components IS
  'DEPRECATED: usar tabla valuation_score_components. Se mantiene para back-compat mientras el código migra.';
