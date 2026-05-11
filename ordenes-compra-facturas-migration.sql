-- Tabla para múltiples facturas por Orden de Compra
CREATE TABLE IF NOT EXISTS ordenes_compra_facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL DEFAULT 'Factura',
  numero TEXT NOT NULL,
  fecha DATE,
  monto NUMERIC DEFAULT 0,
  estado_pago TEXT NOT NULL DEFAULT 'Pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ordenes_compra_facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access on ordenes_compra_facturas"
  ON ordenes_compra_facturas
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
