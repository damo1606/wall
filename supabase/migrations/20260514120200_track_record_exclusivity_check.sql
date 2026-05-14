-- track_record ya tiene signal_id y thesis_id como FKs nullable (cada una
-- apuntando a su tabla). Falta un CHECK que garantice integridad: una fila
-- NO puede referenciar ambos simultáneamente.
--
-- Permitimos:
--   - signal_id=X, thesis_id=NULL  → outcome de una señal
--   - signal_id=NULL, thesis_id=Y  → outcome de una tesis prospectiva
--   - signal_id=NULL, thesis_id=NULL → entrada manual (sin tracking de origen)
--
-- Bloqueamos:
--   - signal_id=X, thesis_id=Y  → ambiguo, ¿de cuál es el outcome?

-- Limpieza defensiva: si hay filas que ya tienen ambos, las marcamos NULL
-- antes de aplicar el constraint (evita que la migration falle).
-- Decisión: en caso de conflicto se prefiere signal_id (era el original).
UPDATE track_record
SET thesis_id = NULL
WHERE signal_id IS NOT NULL
  AND thesis_id IS NOT NULL;

ALTER TABLE track_record
  ADD CONSTRAINT track_record_signal_xor_thesis
  CHECK (num_nonnulls(signal_id, thesis_id) <= 1);

COMMENT ON CONSTRAINT track_record_signal_xor_thesis ON track_record IS
  'Una fila puede referenciar 0 o 1 origen (signal o thesis), nunca ambos.';
