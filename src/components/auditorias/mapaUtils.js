export const STATE_META = {
  ok: { label: 'OK', color: '#16a34a' },
  observada: { label: 'Observada', color: '#f59e0b' },
  critica: { label: 'Crítica', color: '#dc2626' },
  sin_auditoria: { label: 'Sin auditoría', color: '#64748b' }
}

export const PHOTO_TYPE_LABELS = {
  visita_inicial: 'Visita inicial',
  render: 'Renders',
  implementacion: 'Implementación',
  seguimiento: 'Seguimiento',
  otra: 'Otra'
}

export const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const hasValidLatLng = (store) => {
  const lat = toNumber(store?.lat, Number.NaN)
  const lng = toNumber(store?.lng, Number.NaN)
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export const normalizeState = (stateValue) => {
  const normalized = String(stateValue || '')
    .toLowerCase()
    .replace('sin_auditoría', 'sin_auditoria')
    .replace('sin auditoría', 'sin_auditoria')
    .replace('sin auditoria', 'sin_auditoria')

  if (STATE_META[normalized]) return normalized
  return 'sin_auditoria'
}

export const formatDate = (value) => {
  if (!value) return 'Sin auditoría'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin auditoría'
  return date.toLocaleDateString('es-CL')
}

export const buildGeoJSON = (stores) => {
  return {
    type: 'FeatureCollection',
    features: (stores || [])
      .filter((store) => hasValidLatLng(store))
      .map((store) => {
        const lat = toNumber(store.lat, 0)
        const lng = toNumber(store.lng, 0)
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          properties: {
            store_id: store.store_id,
            store_name: store.store_name,
            city: store.city || '',
            region: store.region || '',
            last_state: normalizeState(store.last_state),
            last_score: store.last_score == null ? null : toNumber(store.last_score),
            last_audit_at: store.last_audit_at || null,
            audit_overdue: Boolean(store.audit_overdue),
            overdue_days: store.overdue_days == null ? null : toNumber(store.overdue_days),
            active_investment_total: toNumber(store.active_investment_total)
          }
        }
      })
  }
}

export const computeKPIs = (stores, hideFinancialInfo = false) => {
  const safeStores = stores || []
  return {
    visibleStores: safeStores.length,
    criticalStores: safeStores.filter((s) => normalizeState(s.last_state) === 'critica').length,
    overdueStores: safeStores.filter((s) => Boolean(s.audit_overdue)).length,
    visibleInvestment: hideFinancialInfo
      ? null
      : safeStores.reduce((sum, s) => sum + toNumber(s.active_investment_total), 0)
  }
}

export const groupPhotosByDateAndType = (photos) => {
  const grouped = {}
  ;(photos || []).forEach((photo) => {
    const key = `${photo.fecha_evento || ''}|${photo.tipo || 'otra'}`
    if (!grouped[key]) {
      grouped[key] = {
        fecha_evento: photo.fecha_evento,
        tipo: photo.tipo || 'otra',
        descripcion: photo.descripcion || '',
        items: []
      }
    }
    grouped[key].items.push(photo)
  })

  return Object.values(grouped).sort((a, b) => {
    const aDate = new Date(a.fecha_evento || 0).getTime()
    const bDate = new Date(b.fecha_evento || 0).getTime()
    return bDate - aDate
  })
}
