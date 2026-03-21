-- Ejecutar en Supabase SQL Editor
-- 1) Revisión puntual: Cotización 5581 vs Protocolo 30678
SELECT
  c.numero AS cotizacion_numero,
  c.neto AS cotizacion_neto,
  p.folio AS protocolo_folio,
  p.monto_neto AS protocolo_neto,
  p.monto_total AS protocolo_total
FROM cotizaciones c
JOIN protocolos p
  ON p.folio::text = c.adjudicada_a_protocolo::text
WHERE c.numero::text = '5581'
   OR p.folio::text = '30678';

-- 2) Corrección puntual del caso reportado
UPDATE protocolos p
SET
  monto_neto = COALESCE(c.neto, c.monto, 0),
  monto_total = COALESCE(c.neto, c.monto, 0) * 1.19
FROM cotizaciones c
WHERE p.folio::text = c.adjudicada_a_protocolo::text
  AND p.folio::text = '30678'
  AND c.numero::text = '5581';

-- 3) (Opcional) Corrección masiva de todos los protocolos vinculados por folio
-- Descomenta si quieres alinear todo en una sola pasada.
-- UPDATE protocolos p
-- SET
--   monto_neto = COALESCE(c.neto, c.monto, 0),
--   monto_total = COALESCE(c.neto, c.monto, 0) * 1.19
-- FROM cotizaciones c
-- WHERE p.folio::text = c.adjudicada_a_protocolo::text;
