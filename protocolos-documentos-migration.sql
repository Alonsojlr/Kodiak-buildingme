-- Ejecutar en Supabase SQL Editor
-- Agrega columnas para guardar links de PDFs de OC Cliente y Factura BM.

ALTER TABLE protocolos
  ADD COLUMN IF NOT EXISTS oc_cliente_doc_url TEXT,
  ADD COLUMN IF NOT EXISTS factura_bm_doc_url TEXT;

ALTER TABLE protocolos_facturas
  ADD COLUMN IF NOT EXISTS doc_url TEXT;

COMMENT ON COLUMN protocolos.oc_cliente_doc_url IS 'URL pública del PDF de OC Cliente asociado al protocolo';
COMMENT ON COLUMN protocolos.factura_bm_doc_url IS 'URL pública del PDF de Factura BM asociada al protocolo';
COMMENT ON COLUMN protocolos_facturas.doc_url IS 'URL pública del PDF asociado a la factura BM';
