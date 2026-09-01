-- Ejecutar una vez en Supabase SQL Editor.
-- Repara el vínculo recíproco entre la cotización 5584 y el protocolo 30712.

UPDATE cotizaciones c
SET adjudicada_a_protocolo = p.folio::text
FROM protocolos p
WHERE c.numero::text = '5584'
  AND p.folio::text = '30712'
  AND p.numero_cotizacion::text = c.numero::text
RETURNING c.numero AS cotizacion, c.adjudicada_a_protocolo AS protocolo_vinculado;
