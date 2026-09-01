-- Ejecutar en Supabase SQL Editor antes de crear usuarios con rol Ventas.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin', 'compras', 'ventas', 'finanzas', 'comercial', 'diseno', 'auditor', 'trade_marketing'));

-- Después de crear a María José en Authentication > Users, ejecuta este bloque.
INSERT INTO usuarios (auth_id, email, nombre, rol, activo)
SELECT id, email, 'María José Williams', 'ventas', true
FROM auth.users
WHERE lower(email) = lower('mjwilliams@buildingme.cl')
ON CONFLICT (auth_id) DO UPDATE
SET email = EXCLUDED.email,
    nombre = EXCLUDED.nombre,
    rol = EXCLUDED.rol,
    activo = true;
