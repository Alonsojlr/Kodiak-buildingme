import { supabase } from '../lib/supabaseClient'

// Obtener todas las órdenes de compra
export const getOrdenesCompra = async () => {
  const { data, error } = await supabase
    .from('ordenes_compra')
    .select(`
      *,
      proveedores (
        razon_social,
        rut,
        direccion,
        contacto
      ),
      ordenes_compra_items (
        id,
        item,
        cantidad,
        descripcion,
        valor_unitario,
        descuento
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// Obtener una orden de compra específica por ID
export const getOrdenCompraById = async (id) => {
  const { data, error } = await supabase
    .from('ordenes_compra')
    .select(`
      *,
      proveedores (
        razon_social,
        rut,
        direccion,
        contacto
      ),
      ordenes_compra_items (
        id,
        item,
        cantidad,
        descripcion,
        valor_unitario,
        descuento
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// Crear nueva orden de compra
export const createOrdenCompra = async (orden, items) => {
  // Primero crear la orden
  const { data: ordenData, error: ordenError } = await supabase
    .from('ordenes_compra')
    .insert([orden])
    .select()

  if (ordenError) throw ordenError

  const ordenId = ordenData[0].id

  // Filtrar items vacíos y normalizar campos antes de insertar
  const itemsValidos = (items || []).filter(item => {
    const nombre = String(item.item || '').trim()
    const descripcion = String(item.descripcion || '').trim()
    const valorUnitario = Number(item.valorUnitario ?? item.valor_unitario ?? 0)
    const cantidad = Number(item.cantidad ?? 0)
    return nombre.length > 0 || descripcion.length > 0 || valorUnitario > 0 || cantidad > 0
  })

  if (itemsValidos.length > 0) {
    const itemsConOrdenId = itemsValidos.map(item => ({
      orden_id: ordenId,
      item: String(item.item || '').trim(),
      cantidad: Number(item.cantidad ?? 0),
      descripcion: String(item.descripcion || '').trim(),
      valor_unitario: Number(item.valorUnitario ?? item.valor_unitario ?? 0),
      descuento: Number(item.descuento ?? 0)
    }))

    const { error: itemsError } = await supabase
      .from('ordenes_compra_items')
      .insert(itemsConOrdenId)

    if (itemsError) {
      // Intentar eliminar la OC huérfana para no dejar datos inconsistentes
      await supabase.from('ordenes_compra').delete().eq('id', ordenId)
      throw new Error(`Error al guardar los items de la OC: ${itemsError.message}`)
    }
  }

  return ordenData[0]
}

// Reemplazar items de una orden de compra - VERSIÓN SIMPLIFICADA Y CORREGIDA
export const replaceOrdenCompraItems = async (ordenId, items) => {
  // Helpers de normalización
  const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const normalizeNumber = (value) => {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? num : 0;
  };

  // Limpiar items (eliminar duplicados y items vacíos)
  const itemsLimpios = (() => {
    const mapa = new Map();
    (items || []).forEach((item) => {
      const nombre = normalizeText(item.item);
      const descripcion = normalizeText(item.descripcion);
      const valorUnitario = normalizeNumber(item.valorUnitario ?? item.valor_unitario);
      const cantidad = normalizeNumber(item.cantidad);
      const descuento = normalizeNumber(item.descuento || 0);

      // Ignorar items vacíos
      const hasContenido = nombre.length > 0 || descripcion.length > 0 || valorUnitario > 0 || cantidad > 0;
      if (!hasContenido) return;

      // Usar key para detectar duplicados (sin incluir descuento)
      const key = `${nombre.toLowerCase()}|${descripcion.toLowerCase()}|${cantidad}|${valorUnitario.toFixed(2)}`;
      mapa.set(key, {
        item: nombre,
        descripcion,
        cantidad,
        valorUnitario,
        descuento
      });
    });
    return Array.from(mapa.values());
  })();

  // SOLUCIÓN SIMPLIFICADA: Eliminar TODOS los items existentes y volver a insertar
  // Esto garantiza que no queden items viejos fantasma

  // 1. Eliminar todos los items de esta orden
  const { error: deleteError } = await supabase
    .from('ordenes_compra_items')
    .delete()
    .eq('orden_id', ordenId)

  if (deleteError) {
    console.error('Error eliminando items:', deleteError);
    throw deleteError;
  }

  // 2. Insertar los nuevos items limpios
  if (itemsLimpios.length > 0) {
    const itemsConOrdenId = itemsLimpios.map(item => ({
      orden_id: ordenId,
      item: item.item || '',
      cantidad: Number(item.cantidad ?? 0),
      descripcion: item.descripcion || '',
      valor_unitario: Number(item.valorUnitario ?? 0),
      descuento: Number(item.descuento ?? 0)
    }));

    const { error: insertError } = await supabase
      .from('ordenes_compra_items')
      .insert(itemsConOrdenId);

    if (insertError) {
      console.error('Error insertando items:', insertError);
      throw insertError;
    }
  }

  console.log(`✅ Items actualizados para orden ${ordenId}: ${itemsLimpios.length} items`);
};

// Actualizar orden de compra
export const updateOrdenCompra = async (id, updates) => {
  const { data, error } = await supabase
    .from('ordenes_compra')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  return data[0]
}

// Eliminar orden de compra
export const deleteOrdenCompra = async (id) => {
  // Primero eliminar los items
  const { error: itemsError } = await supabase
    .from('ordenes_compra_items')
    .delete()
    .eq('orden_id', id)

  if (itemsError) throw itemsError

  // Luego eliminar la orden
  const { data, error } = await supabase
    .from('ordenes_compra')
    .delete()
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('No se pudo eliminar la OC')
  }
}

// ===== Facturas de OC =====

export const getOrdenCompraFacturas = async (ordenIds = []) => {
  let query = supabase
    .from('ordenes_compra_facturas')
    .select('*')
    .order('created_at', { ascending: true })

  if (ordenIds.length > 0) {
    query = query.in('orden_id', ordenIds)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export const createOrdenCompraFactura = async (factura) => {
  const { data, error } = await supabase
    .from('ordenes_compra_facturas')
    .insert([factura])
    .select()

  if (error) throw error
  return data[0]
}

export const deleteOrdenCompraFactura = async (id) => {
  const { error } = await supabase
    .from('ordenes_compra_facturas')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export const updateOrdenCompraFactura = async (id, updates) => {
  const { data, error } = await supabase
    .from('ordenes_compra_facturas')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  return data[0]
}

// Mantiene el estado general de la OC alineado con sus documentos recibidos.
// Una OC con documentos queda pagada solo cuando todos sus documentos lo están.
export const syncOrdenCompraPaymentStatus = async (ordenId) => {
  const [orden, facturas] = await Promise.all([
    getOrdenCompraById(ordenId),
    getOrdenCompraFacturas([ordenId])
  ])

  if (facturas.length === 0) return orden

  const todasPagadas = facturas.every((factura) => factura.estado_pago === 'Pagada')
  const updates = todasPagadas
    ? {
        estado: 'Pagada',
        estado_pago: 'Pagada',
        fecha_pago: orden.fecha_pago || new Date().toISOString().split('T')[0]
      }
    : {
        estado: 'Facturada',
        estado_pago: 'Pendiente',
        fecha_pago: null
      }

  return updateOrdenCompra(ordenId, updates)
}

// Al pagar una OC completa, deja sus documentos en el mismo estado.
export const markOrdenCompraAsPaid = async (ordenId, fechaPago = new Date().toISOString().split('T')[0]) => {
  const facturas = await getOrdenCompraFacturas([ordenId])
  await Promise.all(
    facturas
      .filter((factura) => factura.estado_pago !== 'Pagada')
      .map((factura) => updateOrdenCompraFactura(factura.id, { estado_pago: 'Pagada' }))
  )

  return updateOrdenCompra(ordenId, {
    estado: 'Pagada',
    estado_pago: 'Pagada',
    fecha_pago: fechaPago
  })
}
