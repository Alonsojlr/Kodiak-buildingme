import { supabase } from '../lib/supabaseClient'

const AUDIT_PHOTOS_BUCKET = 'audit-fotos'

const sanitizeFileName = (name) => {
  return String(name || 'foto.jpg')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

const getStoragePathFromPublicUrl = (url) => {
  if (!url) return null
  const marker = `/storage/v1/object/public/${AUDIT_PHOTOS_BUCKET}/`
  const idx = String(url).indexOf(marker)
  if (idx === -1) return null
  const rawPath = String(url).slice(idx + marker.length).split('?')[0]
  return decodeURIComponent(rawPath)
}

export const getStoreStatusSnapshot = async (filters = {}) => {
  let query = supabase
    .from('store_status_snapshot')
    .select('*')
    .order('store_name', { ascending: true })

  if (filters.search) {
    query = query.ilike('store_name', `%${filters.search}%`)
  }
  if (filters.region && filters.region !== 'todas') {
    query = query.eq('region', filters.region)
  }
  if (filters.state && filters.state !== 'todos') {
    query = query.eq('last_state', filters.state)
  }
  if (filters.overdueOnly) {
    query = query.eq('audit_overdue', true)
  }
  if (filters.dateFrom) {
    query = query.gte('last_audit_at', `${filters.dateFrom}T00:00:00`)
  }
  if (filters.dateTo) {
    query = query.lte('last_audit_at', `${filters.dateTo}T23:59:59`)
  }
  if (typeof filters.minInvestment === 'number' && filters.minInvestment > 0) {
    query = query.gte('active_investment_total', filters.minInvestment)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export const getStoreStatusById = async (storeId) => {
  const { data, error } = await supabase
    .from('store_status_snapshot')
    .select('*')
    .eq('store_id', storeId)
    .single()
  if (error) throw error
  return data
}

export const getTiendaFotos = async (storeId) => {
  const { data, error } = await supabase
    .from('audit_tienda_fotos')
    .select('*')
    .eq('tienda_id', storeId)
    .order('fecha_evento', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export const uploadTiendaFotosBatch = async (storeId, files, options = {}) => {
  if (!storeId) throw new Error('Falta storeId')
  if (!files || files.length === 0) throw new Error('Selecciona al menos una foto')

  const tipo = options.tipo || 'otra'
  const fechaEvento = options.fecha_evento || new Date().toISOString().split('T')[0]
  const descripcion = options.descripcion || ''
  const titulo = options.titulo || ''
  const createdBy = options.created_by || null
  const createdByName = options.created_by_name || null

  const uploadedRows = []

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]
    const safeName = sanitizeFileName(file.name)
    const path = `tiendas/${storeId}/${tipo}/${fechaEvento}/${Date.now()}-${i}-${safeName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(AUDIT_PHOTOS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false })

    if (uploadError) throw uploadError

    const { data: publicData } = supabase.storage
      .from(AUDIT_PHOTOS_BUCKET)
      .getPublicUrl(uploadData.path)

    uploadedRows.push({
      tienda_id: storeId,
      tipo,
      fecha_evento: fechaEvento,
      titulo,
      descripcion,
      foto_url: publicData.publicUrl,
      created_by: createdBy,
      created_by_name: createdByName
    })
  }

  const { data, error } = await supabase
    .from('audit_tienda_fotos')
    .insert(uploadedRows)
    .select('*')

  if (error) throw error
  return data || []
}

export const updateTiendaFoto = async (fotoId, updates = {}) => {
  const payload = {
    tipo: updates.tipo,
    fecha_evento: updates.fecha_evento,
    titulo: updates.titulo || null,
    descripcion: updates.descripcion || null
  }

  const { data, error } = await supabase
    .from('audit_tienda_fotos')
    .update(payload)
    .eq('id', fotoId)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export const deleteTiendaFoto = async (foto) => {
  const storagePath = getStoragePathFromPublicUrl(foto?.foto_url)
  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from(AUDIT_PHOTOS_BUCKET)
      .remove([storagePath])
    if (storageError) {
      console.warn('No se pudo borrar archivo de storage, se intentará borrar registro igual:', storageError)
    }
  }

  const { error } = await supabase
    .from('audit_tienda_fotos')
    .delete()
    .eq('id', foto?.id)

  if (error) throw error
}
