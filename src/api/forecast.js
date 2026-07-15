import { supabase } from '../lib/supabaseClient'

export const getForecasts = async () => {
  const { data, error } = await supabase
    .from('forecasts')
    .select(`
      *,
      clientes (
        razon_social,
        rut
      ),
      cotizaciones (
        id,
        numero,
        estado,
        nombre_proyecto
      ),
      protocolos (
        id,
        folio,
        estado,
        nombre_proyecto
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export const createForecast = async (forecast) => {
  const { data, error } = await supabase
    .from('forecasts')
    .insert([forecast])
    .select()

  if (error) throw error
  return data[0]
}

export const updateForecast = async (id, updates) => {
  const { data, error } = await supabase
    .from('forecasts')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  return data[0]
}

export const deleteForecast = async (id) => {
  const { error } = await supabase
    .from('forecasts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export const getForecastDocuments = async (forecastIds = []) => {
  let query = supabase
    .from('forecast_documentos')
    .select('*')
    .order('created_at', { ascending: false })

  if (forecastIds.length > 0) {
    query = query.in('forecast_id', forecastIds)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export const createForecastDocument = async (documento) => {
  const { data, error } = await supabase
    .from('forecast_documentos')
    .insert([documento])
    .select()

  if (error) throw error
  return data[0]
}

export const updateForecastDocument = async (id, updates) => {
  const { data, error } = await supabase
    .from('forecast_documentos')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  return data[0]
}

export const deleteForecastDocument = async (id) => {
  const { error } = await supabase
    .from('forecast_documentos')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export const getForecastMilestones = async (forecastIds = []) => {
  let query = supabase
    .from('forecast_hitos')
    .select('*')
    .order('fecha', { ascending: true, nullsFirst: false })
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true })

  if (forecastIds.length > 0) {
    query = query.in('forecast_id', forecastIds)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export const createForecastMilestone = async (hito) => {
  const { data, error } = await supabase
    .from('forecast_hitos')
    .insert([hito])
    .select()

  if (error) throw error
  return data[0]
}

export const updateForecastMilestone = async (id, updates) => {
  const { data, error } = await supabase
    .from('forecast_hitos')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) throw error
  return data[0]
}

export const deleteForecastMilestone = async (id) => {
  const { error } = await supabase
    .from('forecast_hitos')
    .delete()
    .eq('id', id)

  if (error) throw error
}
