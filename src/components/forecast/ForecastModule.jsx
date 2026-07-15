import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { getClientes } from '../../api/clientes'
import {
  getForecasts,
  createForecast,
  updateForecast,
  deleteForecast,
  getForecastDocuments,
  createForecastDocument,
  deleteForecastDocument,
  getForecastMilestones,
  createForecastMilestone,
  updateForecastMilestone,
  deleteForecastMilestone
} from '../../api/forecast'
import {
  Plus,
  FileText,
  Package,
  Calendar,
  CheckCircle,
  Clock,
  Link as LinkIcon,
  Trash2,
  XCircle,
  Download
} from 'lucide-react'

const TOAST_EVENT = 'app-toast'
const FORECAST_DOCS_BUCKET = 'audit-fotos'
const FORECAST_STAGES = ['Brief', 'Render 1', 'Correcciones', 'Render 2', 'Cotización', 'OK Cliente', 'Protocolo']
const FORECAST_PRIORITIES = ['Baja', 'Media', 'Alta', 'Urgente']
const FORECAST_MILESTONE_TYPES = ['Diseño', 'Solicitud Planos', 'Planos', 'Producción Taller', 'Entrega Archivos', 'Carpeta Documentos', 'Entrega Final', 'Otro']

const notifyToast = (message, type = 'success') => {
  if (!message) return
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }))
}

const sanitizeStorageFileName = (name) =>
  String(name || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')

const uploadForecastFile = async ({ forecastId, file, folder = 'documentos' }) => {
  if (!forecastId) throw new Error('Falta el ID del forecast')
  if (!file) return null

  const safeName = sanitizeStorageFileName(file.name || 'documento')
  const path = `forecasts/${forecastId}/${folder}/${Date.now()}-${safeName}`

  const { error } = await supabase.storage
    .from(FORECAST_DOCS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    })

  if (error) throw error

  const { data } = supabase.storage.from(FORECAST_DOCS_BUCKET).getPublicUrl(path)
  return data?.publicUrl || null
}

const formatDate = (value) => {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return date.toLocaleDateString('es-CL')
}

const formatDateTime = (value) => {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getStageIndex = (stage) => {
  const index = FORECAST_STAGES.indexOf(stage)
  return index >= 0 ? index : 0
}

const DocumentoPreviewModal = ({ documento, onClose }) => {
  if (!documento) return null

  const isPdf = String(documento.archivoUrl || '').toLowerCase().includes('.pdf')
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(String(documento.archivoUrl || ''))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div>
            <h3 className="text-2xl font-bold text-white">{documento.nombre}</h3>
            <p className="text-sm text-white/80 mt-1">{documento.tipo} · {documento.etapa}</p>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4 bg-gray-50 max-h-[calc(90vh-100px)] overflow-auto">
          {documento.archivoUrl ? (
            isPdf ? (
              <iframe title={documento.nombre} src={documento.archivoUrl} className="w-full h-[72vh] rounded-xl bg-white" />
            ) : isImage ? (
              <img src={documento.archivoUrl} alt={documento.nombre} className="max-w-full max-h-[72vh] mx-auto rounded-xl shadow" />
            ) : (
              <div className="bg-white rounded-xl border p-8 text-center">
                <p className="text-gray-700 mb-4">Este archivo no tiene preview embebido.</p>
                <a href={documento.archivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-4 py-2 rounded-xl text-white font-semibold" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
                  Abrir archivo
                </a>
              </div>
            )
          ) : (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
              Este documento no tiene archivo subido.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ForecastFormModal = ({ onClose, onSave, clients = [] }) => {
  const [formData, setFormData] = useState({
    clienteId: '',
    nombreCliente: '',
    nombreProyecto: '',
    descripcion: '',
    unidadNegocio: '',
    contactoNombre: '',
    contactoEmail: '',
    contactoTelefono: '',
    etapaActual: 'Brief',
    prioridad: 'Media',
    observaciones: '',
    fechaLimiteGeneral: ''
  })

  const handleSubmit = (event) => {
    event.preventDefault()
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="p-6 border-b" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Nuevo Forecast</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cliente existente</label>
              <select
                value={formData.clienteId}
                onChange={(e) => setFormData((prev) => ({ ...prev, clienteId: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
              >
                <option value="">Sin vincular</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.razon_social}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Prospecto / Cliente *</label>
              <input
                required
                value={formData.nombreCliente}
                onChange={(e) => setFormData((prev) => ({ ...prev, nombreCliente: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: Cliente feria minería"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Proyecto *</label>
              <input
                required
                value={formData.nombreProyecto}
                onChange={(e) => setFormData((prev) => ({ ...prev, nombreProyecto: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: Stand Expomin 2026"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Unidad de Negocio</label>
              <input
                value={formData.unidadNegocio}
                onChange={(e) => setFormData((prev) => ({ ...prev, unidadNegocio: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: Stand y Ferias"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Contacto</label>
              <input
                value={formData.contactoNombre}
                onChange={(e) => setFormData((prev) => ({ ...prev, contactoNombre: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email contacto</label>
              <input
                type="email"
                value={formData.contactoEmail}
                onChange={(e) => setFormData((prev) => ({ ...prev, contactoEmail: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono contacto</label>
              <input
                value={formData.contactoTelefono}
                onChange={(e) => setFormData((prev) => ({ ...prev, contactoTelefono: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha límite general</label>
              <input
                type="date"
                value={formData.fechaLimiteGeneral}
                onChange={(e) => setFormData((prev) => ({ ...prev, fechaLimiteGeneral: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Etapa inicial</label>
              <select
                value={formData.etapaActual}
                onChange={(e) => setFormData((prev) => ({ ...prev, etapaActual: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
              >
                {FORECAST_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Prioridad</label>
              <select
                value={formData.prioridad}
                onChange={(e) => setFormData((prev) => ({ ...prev, prioridad: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
              >
                {FORECAST_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
              <textarea
                rows="3"
                value={formData.descripcion}
                onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
              <textarea
                rows="3"
                value={formData.observaciones}
                onChange={(e) => setFormData((prev) => ({ ...prev, observaciones: e.target.value }))}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-6 py-3 border-2 border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
              Crear Forecast
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const StagePill = ({ active, completed, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-w-[130px] px-4 py-3 rounded-2xl border text-sm font-semibold transition-all ${
      active
        ? 'text-white shadow-lg border-transparent'
        : completed
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-white text-gray-500 border-gray-200'
    }`}
    style={active ? { background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' } : {}}
  >
    {label}
  </button>
)

const ForecastModule = ({
  activeModule,
  sharedCotizaciones = [],
  sharedProtocolos = [],
  currentUserName,
  onOpenCotizacion,
  onOpenProtocolo
}) => {
  const [forecasts, setForecasts] = useState([])
  const [clientes, setClientes] = useState([])
  const [selectedForecastId, setSelectedForecastId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStage, setFilterStage] = useState('todos')
  const [previewDocumento, setPreviewDocumento] = useState(null)
  const [documentForm, setDocumentForm] = useState({
    etapa: 'Brief',
    tipo: 'Brief',
    nombre: '',
    editUrl: '',
    comentarios: '',
    file: null
  })
  const [milestoneForm, setMilestoneForm] = useState({
    titulo: '',
    tipo: 'Diseño',
    fecha: '',
    fechaFin: '',
    responsable: '',
    notas: ''
  })
  const [linkSelection, setLinkSelection] = useState({
    cotizacionId: '',
    protocoloId: ''
  })

  const selectedForecast = useMemo(
    () => forecasts.find((item) => item.id === selectedForecastId) || null,
    [forecasts, selectedForecastId]
  )

  const filteredForecasts = useMemo(() => {
    const searchLower = searchTerm.toLowerCase()
    return forecasts.filter((forecast) => {
      const matchSearch =
        String(forecast.numero || '').includes(searchTerm) ||
        String(forecast.nombreProyecto || '').toLowerCase().includes(searchLower) ||
        String(forecast.clienteNombre || '').toLowerCase().includes(searchLower)
      const matchStage = filterStage === 'todos' || forecast.etapaActual === filterStage
      return matchSearch && matchStage
    })
  }, [forecasts, filterStage, searchTerm])

  useEffect(() => {
    if (activeModule !== 'forecast') return
    loadForecastData()
  }, [activeModule])

  useEffect(() => {
    if (!selectedForecast) return
    setLinkSelection({
      cotizacionId: selectedForecast.cotizacionId || '',
      protocoloId: selectedForecast.protocoloId || ''
    })
    setDocumentForm((prev) => ({ ...prev, etapa: selectedForecast.etapaActual || 'Brief' }))
  }, [selectedForecast])

  const mapForecasts = (forecastRows, documentosRows, hitosRows) => {
    const documentosByForecast = documentosRows.reduce((acc, documento) => {
      if (!acc[documento.forecast_id]) acc[documento.forecast_id] = []
      acc[documento.forecast_id].push({
        id: documento.id,
        etapa: documento.etapa || 'Brief',
        tipo: documento.tipo || 'Documento',
        nombre: documento.nombre || 'Documento',
        archivoUrl: documento.archivo_url || '',
        editUrl: documento.edit_url || '',
        comentarios: documento.comentarios || '',
        createdAt: documento.created_at || null
      })
      return acc
    }, {})

    const hitosByForecast = hitosRows.reduce((acc, hito) => {
      if (!acc[hito.forecast_id]) acc[hito.forecast_id] = []
      acc[hito.forecast_id].push({
        id: hito.id,
        titulo: hito.titulo || '',
        tipo: hito.tipo || 'Otro',
        estado: hito.estado || 'Pendiente',
        fecha: hito.fecha || '',
        fechaFin: hito.fecha_fin || '',
        responsable: hito.responsable || '',
        notas: hito.notas || '',
        orden: hito.orden || 0
      })
      return acc
    }, {})

    return forecastRows.map((row) => ({
      id: row.id,
      numero: row.numero,
      clienteId: row.cliente_id || '',
      clienteNombre: row.clientes?.razon_social || row.nombre_cliente || 'Sin cliente',
      rutCliente: row.clientes?.rut || '',
      nombreProyecto: row.nombre_proyecto || '',
      descripcion: row.descripcion || '',
      unidadNegocio: row.unidad_negocio || '',
      contactoNombre: row.contacto_nombre || '',
      contactoEmail: row.contacto_email || '',
      contactoTelefono: row.contacto_telefono || '',
      etapaActual: row.etapa_actual || 'Brief',
      estado: row.estado || 'Activo',
      prioridad: row.prioridad || 'Media',
      briefDocUrl: row.brief_doc_url || '',
      briefEditUrl: row.brief_edit_url || '',
      cotizacionId: row.cotizacion_id || '',
      cotizacionNumero: row.cotizaciones?.numero || '',
      cotizacionEstado: row.cotizaciones?.estado || '',
      protocoloId: row.protocolo_id || '',
      protocoloFolio: row.protocolos?.folio || '',
      protocoloEstado: row.protocolos?.estado || '',
      observaciones: row.observaciones || '',
      fechaLimiteGeneral: row.fecha_limite_general || '',
      createdAt: row.created_at || '',
      documentos: documentosByForecast[row.id] || [],
      hitos: hitosByForecast[row.id] || []
    }))
  }

  const loadForecastData = async (keepSelection = true) => {
    try {
      setLoading(true)
      setError('')
      const [forecastRows, documentoRows, hitoRows, clientRows] = await Promise.all([
        getForecasts(),
        getForecastDocuments(),
        getForecastMilestones(),
        getClientes()
      ])

      const mapped = mapForecasts(forecastRows || [], documentoRows || [], hitoRows || [])
      setForecasts(mapped)
      setClientes(clientRows || [])
      if (!keepSelection || !selectedForecastId) {
        setSelectedForecastId(mapped[0]?.id || null)
      } else if (!mapped.some((item) => item.id === selectedForecastId)) {
        setSelectedForecastId(mapped[0]?.id || null)
      }
    } catch (loadError) {
      console.error('Error cargando forecast:', loadError)
      setError('No se pudo cargar Forecast. Ejecuta primero forecast-migration.sql en Supabase.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateForecast = async (formData) => {
    try {
      const created = await createForecast({
        cliente_id: formData.clienteId || null,
        nombre_cliente: formData.nombreCliente,
        nombre_proyecto: formData.nombreProyecto,
        descripcion: formData.descripcion,
        unidad_negocio: formData.unidadNegocio,
        contacto_nombre: formData.contactoNombre,
        contacto_email: formData.contactoEmail,
        contacto_telefono: formData.contactoTelefono,
        etapa_actual: formData.etapaActual,
        prioridad: formData.prioridad,
        observaciones: formData.observaciones,
        fecha_limite_general: formData.fechaLimiteGeneral || null,
        created_by: currentUserName || ''
      })
      await loadForecastData(false)
      setSelectedForecastId(created?.id || null)
      setShowNewModal(false)
      notifyToast('Forecast creado correctamente', 'success')
    } catch (createError) {
      console.error('Error creando forecast:', createError)
      notifyToast('No se pudo crear el forecast', 'error')
    }
  }

  const handleDeleteForecast = async (forecast) => {
    const confirmed = window.confirm(`¿Eliminar el Forecast FW-${forecast.numero}?`)
    if (!confirmed) return

    try {
      await deleteForecast(forecast.id)
      await loadForecastData(false)
      notifyToast('Forecast eliminado correctamente', 'success')
    } catch (deleteError) {
      console.error('Error eliminando forecast:', deleteError)
      notifyToast('No se pudo eliminar el forecast', 'error')
    }
  }

  const handleUpdateStage = async (forecast, nextStage) => {
    try {
      await updateForecast(forecast.id, { etapa_actual: nextStage })
      await loadForecastData()
      notifyToast('Etapa actualizada', 'success')
    } catch (updateError) {
      console.error('Error actualizando etapa:', updateError)
      notifyToast('No se pudo actualizar la etapa', 'error')
    }
  }

  const handleSaveLinks = async () => {
    if (!selectedForecast) return
    try {
      const selectedCotizacion = sharedCotizaciones.find((item) => String(item.id) === String(linkSelection.cotizacionId))
      const selectedProtocolo = sharedProtocolos.find((item) => String(item.id) === String(linkSelection.protocoloId))

      await updateForecast(selectedForecast.id, {
        cotizacion_id: linkSelection.cotizacionId || null,
        protocolo_id: linkSelection.protocoloId || null,
        etapa_actual: linkSelection.protocoloId
          ? 'Protocolo'
          : selectedForecast.etapaActual === 'Protocolo' && !linkSelection.protocoloId
            ? 'OK Cliente'
            : selectedForecast.etapaActual,
        nombre_cliente: selectedForecast.clienteNombre,
        brief_doc_url: selectedForecast.briefDocUrl || null,
        brief_edit_url: selectedForecast.briefEditUrl || null
      })
      await loadForecastData()
      if (selectedCotizacion && !selectedForecast.cotizacionNumero) {
        notifyToast(`Cotización #${selectedCotizacion.numero} vinculada`, 'success')
      } else if (selectedProtocolo && !selectedForecast.protocoloFolio) {
        notifyToast(`Protocolo PT-${selectedProtocolo.folio} vinculado`, 'success')
      } else {
        notifyToast('Vínculos actualizados', 'success')
      }
    } catch (linkError) {
      console.error('Error guardando vínculos:', linkError)
      notifyToast('No se pudieron guardar los vínculos', 'error')
    }
  }

  const handleAddDocument = async () => {
    if (!selectedForecast) return
    if (!documentForm.nombre.trim()) {
      notifyToast('Ingresa nombre del documento', 'warning')
      return
    }
    if (!documentForm.file && !documentForm.editUrl.trim()) {
      notifyToast('Sube un archivo o agrega un link editable', 'warning')
      return
    }

    try {
      const archivoUrl = documentForm.file
        ? await uploadForecastFile({
            forecastId: selectedForecast.id,
            file: documentForm.file,
            folder: documentForm.etapa.toLowerCase().replace(/\s+/g, '-')
          })
        : ''

      const created = await createForecastDocument({
        forecast_id: selectedForecast.id,
        etapa: documentForm.etapa,
        tipo: documentForm.tipo,
        nombre: documentForm.nombre,
        archivo_url: archivoUrl || null,
        edit_url: documentForm.editUrl || null,
        comentarios: documentForm.comentarios || null,
        created_by: currentUserName || ''
      })

      if (documentForm.tipo === 'Brief' && documentForm.etapa === 'Brief') {
        await updateForecast(selectedForecast.id, {
          brief_doc_url: archivoUrl || selectedForecast.briefDocUrl || null,
          brief_edit_url: documentForm.editUrl || selectedForecast.briefEditUrl || null
        })
      }

      await loadForecastData()
      setDocumentForm({
        etapa: selectedForecast.etapaActual || 'Brief',
        tipo: 'Documento',
        nombre: '',
        editUrl: '',
        comentarios: '',
        file: null
      })
      notifyToast(`Documento "${created?.nombre || 'nuevo'}" agregado`, 'success')
    } catch (documentError) {
      console.error('Error agregando documento:', documentError)
      notifyToast('No se pudo agregar el documento', 'error')
    }
  }

  const handleDeleteDocument = async (documento) => {
    const confirmed = window.confirm(`¿Eliminar el documento "${documento.nombre}"?`)
    if (!confirmed) return
    try {
      await deleteForecastDocument(documento.id)
      await loadForecastData()
      notifyToast('Documento eliminado', 'success')
    } catch (documentError) {
      console.error('Error eliminando documento:', documentError)
      notifyToast('No se pudo eliminar el documento', 'error')
    }
  }

  const handleAddMilestone = async () => {
    if (!selectedForecast) return
    if (!milestoneForm.titulo.trim()) {
      notifyToast('Ingresa título del hito', 'warning')
      return
    }

    try {
      await createForecastMilestone({
        forecast_id: selectedForecast.id,
        titulo: milestoneForm.titulo,
        tipo: milestoneForm.tipo,
        fecha: milestoneForm.fecha || null,
        fecha_fin: milestoneForm.fechaFin || null,
        responsable: milestoneForm.responsable || null,
        notas: milestoneForm.notas || null,
        orden: (selectedForecast.hitos?.length || 0) + 1
      })
      await loadForecastData()
      setMilestoneForm({
        titulo: '',
        tipo: 'Diseño',
        fecha: '',
        fechaFin: '',
        responsable: '',
        notas: ''
      })
      notifyToast('Hito agregado', 'success')
    } catch (milestoneError) {
      console.error('Error creando hito:', milestoneError)
      notifyToast('No se pudo agregar el hito', 'error')
    }
  }

  const handleMilestoneStatusChange = async (milestone, estado) => {
    try {
      await updateForecastMilestone(milestone.id, { estado })
      await loadForecastData()
    } catch (milestoneError) {
      console.error('Error actualizando hito:', milestoneError)
      notifyToast('No se pudo actualizar el hito', 'error')
    }
  }

  const handleDeleteMilestone = async (milestone) => {
    const confirmed = window.confirm(`¿Eliminar el hito "${milestone.titulo}"?`)
    if (!confirmed) return
    try {
      await deleteForecastMilestone(milestone.id)
      await loadForecastData()
      notifyToast('Hito eliminado', 'success')
    } catch (milestoneError) {
      console.error('Error eliminando hito:', milestoneError)
      notifyToast('No se pudo eliminar el hito', 'error')
    }
  }

  if (activeModule !== 'forecast') return null

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Forecast</h2>
          <p className="text-gray-600">Antesala del proyecto desde brief hasta protocolo</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
        >
          <Plus className="w-5 h-5" />
          <span>Nuevo Forecast</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <div className="space-y-4 mb-4">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por número, cliente o proyecto..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              <option value="todos">Todas las etapas</option>
              {FORECAST_STAGES.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-12 text-gray-500">Cargando forecast...</div>
            ) : filteredForecasts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay forecast registrados</div>
            ) : (
              filteredForecasts.map((forecast) => (
                <button
                  key={forecast.id}
                  type="button"
                  onClick={() => setSelectedForecastId(forecast.id)}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                    selectedForecastId === forecast.id
                      ? 'border-[#45ad98] bg-[#45ad98]/5 shadow-md'
                      : 'border-gray-200 hover:border-[#45ad98]/50 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-[#235250]">FW-{forecast.numero}</p>
                      <p className="font-semibold text-gray-800 mt-1 truncate">{forecast.nombreProyecto}</p>
                      <p className="text-sm text-gray-500 truncate">{forecast.clienteNombre}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 whitespace-nowrap">
                      {forecast.etapaActual}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span>{forecast.documentos.length} docs</span>
                    <span>{forecast.hitos.length} hitos</span>
                    {forecast.cotizacionNumero ? <span>Cot #{forecast.cotizacionNumero}</span> : null}
                    {forecast.protocoloFolio ? <span>PT-{forecast.protocoloFolio}</span> : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          {!selectedForecast ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center text-gray-500">
              Selecciona un forecast para ver el detalle.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-bold text-xl text-[#235250]">FW-{selectedForecast.numero}</span>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#45ad98]/10 text-[#235250]">
                        {selectedForecast.prioridad}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {selectedForecast.etapaActual}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mt-3">{selectedForecast.nombreProyecto}</h3>
                    <p className="text-gray-600 mt-1">{selectedForecast.clienteNombre}</p>
                    <p className="text-sm text-gray-500 mt-2">{selectedForecast.descripcion || 'Sin descripción'}</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleDeleteForecast(selectedForecast)}
                      className="px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Contacto</p>
                    <p className="text-sm text-gray-800">{selectedForecast.contactoNombre || 'Sin contacto'}</p>
                    <p className="text-xs text-gray-500 mt-1">{selectedForecast.contactoEmail || 'Sin email'}</p>
                    <p className="text-xs text-gray-500">{selectedForecast.contactoTelefono || 'Sin teléfono'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Unidad de negocio</p>
                    <p className="text-sm text-gray-800">{selectedForecast.unidadNegocio || 'Sin asignar'}</p>
                    <p className="text-xs text-gray-500 mt-2">Fecha límite general</p>
                    <p className="text-sm text-gray-800">{selectedForecast.fechaLimiteGeneral ? formatDate(selectedForecast.fechaLimiteGeneral) : 'Sin fecha'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Observaciones</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedForecast.observaciones || 'Sin observaciones'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-gray-800">Línea de tiempo</h4>
                    <p className="text-sm text-gray-500">Marca la etapa actual del proyecto</p>
                  </div>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {FORECAST_STAGES.map((stage, index) => {
                    const currentIndex = getStageIndex(selectedForecast.etapaActual)
                    return (
                      <StagePill
                        key={stage}
                        label={stage}
                        active={stage === selectedForecast.etapaActual}
                        completed={index < currentIndex}
                        onClick={() => handleUpdateStage(selectedForecast, stage)}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <LinkIcon className="w-5 h-5 text-[#235250]" />
                  <h4 className="text-lg font-bold text-gray-800">Vínculos</h4>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-2xl p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Cotización</p>
                    <select
                      value={linkSelection.cotizacionId}
                      onChange={(e) => setLinkSelection((prev) => ({ ...prev, cotizacionId: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                    >
                      <option value="">Sin vincular</option>
                      {sharedCotizaciones.map((cotizacion) => (
                        <option key={cotizacion.id} value={cotizacion.id}>
                          #{cotizacion.numero} · {cotizacion.nombreProyecto || cotizacion.cliente}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-3 mt-3">
                      <button
                        type="button"
                        onClick={handleSaveLinks}
                        className="px-4 py-2 rounded-xl text-white font-semibold"
                        style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                      >
                        Guardar
                      </button>
                      {selectedForecast.cotizacionId && (
                        <button
                          type="button"
                          onClick={() => onOpenCotizacion?.(selectedForecast.cotizacionId)}
                          className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          Abrir cotización
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-2xl p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Protocolo</p>
                    <select
                      value={linkSelection.protocoloId}
                      onChange={(e) => setLinkSelection((prev) => ({ ...prev, protocoloId: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                    >
                      <option value="">Sin vincular</option>
                      {sharedProtocolos.map((protocolo) => (
                        <option key={protocolo.id} value={protocolo.id}>
                          PT-{protocolo.folio} · {protocolo.nombreProyecto || protocolo.cliente}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-3 mt-3">
                      <button
                        type="button"
                        onClick={handleSaveLinks}
                        className="px-4 py-2 rounded-xl text-white font-semibold"
                        style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                      >
                        Guardar
                      </button>
                      {selectedForecast.protocoloId && (
                        <button
                          type="button"
                          onClick={() => onOpenProtocolo?.(selectedForecast.protocoloId)}
                          className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          Abrir protocolo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-[#235250]" />
                  <h4 className="text-lg font-bold text-gray-800">Documentos</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
                  <select
                    value={documentForm.etapa}
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, etapa: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                  >
                    {FORECAST_STAGES.map((stage) => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                  <input
                    value={documentForm.tipo}
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, tipo: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                    placeholder="Tipo"
                  />
                  <input
                    value={documentForm.nombre}
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, nombre: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                    placeholder="Nombre documento"
                  />
                  <input
                    value={documentForm.editUrl}
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, editUrl: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                    placeholder="Link editable (Drive/Figma/Canva)"
                  />
                  <input
                    type="file"
                    onChange={(e) => setDocumentForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <textarea
                  value={documentForm.comentarios}
                  onChange={(e) => setDocumentForm((prev) => ({ ...prev, comentarios: e.target.value }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] mb-3"
                  rows="2"
                  placeholder="Comentarios del documento"
                />
                <button
                  type="button"
                  onClick={handleAddDocument}
                  className="px-5 py-3 rounded-xl text-white font-semibold shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                >
                  Agregar documento
                </button>

                <div className="mt-6 space-y-3">
                  {selectedForecast.documentos.length === 0 ? (
                    <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">No hay documentos cargados.</div>
                  ) : selectedForecast.documentos.map((documento) => (
                    <div key={documento.id} className="border border-gray-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{documento.nombre}</span>
                          <span className="px-2 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{documento.etapa}</span>
                          <span className="text-xs text-gray-500">{documento.tipo}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{formatDateTime(documento.createdAt)}</p>
                        {documento.comentarios ? <p className="text-sm text-gray-600 mt-2">{documento.comentarios}</p> : null}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {documento.archivoUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewDocumento(documento)}
                            className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-700"
                          >
                            Ver archivo
                          </button>
                        ) : null}
                        {documento.editUrl ? (
                          <a
                            href={documento.editUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-700"
                          >
                            Editar link
                          </a>
                        ) : null}
                        {documento.archivoUrl ? (
                          <a
                            href={documento.archivoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold text-gray-700"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(documento)}
                          className="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-sm font-semibold text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-[#235250]" />
                  <h4 className="text-lg font-bold text-gray-800">Hitos y fechas clave</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-3">
                  <input
                    value={milestoneForm.titulo}
                    onChange={(e) => setMilestoneForm((prev) => ({ ...prev, titulo: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                    placeholder="Título del hito"
                  />
                  <select
                    value={milestoneForm.tipo}
                    onChange={(e) => setMilestoneForm((prev) => ({ ...prev, tipo: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                  >
                    {FORECAST_MILESTONE_TYPES.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={milestoneForm.fecha}
                    onChange={(e) => setMilestoneForm((prev) => ({ ...prev, fecha: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    type="date"
                    value={milestoneForm.fechaFin}
                    onChange={(e) => setMilestoneForm((prev) => ({ ...prev, fechaFin: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    value={milestoneForm.responsable}
                    onChange={(e) => setMilestoneForm((prev) => ({ ...prev, responsable: e.target.value }))}
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                    placeholder="Responsable"
                  />
                </div>
                <textarea
                  value={milestoneForm.notas}
                  onChange={(e) => setMilestoneForm((prev) => ({ ...prev, notas: e.target.value }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] mb-3"
                  rows="2"
                  placeholder="Notas del hito"
                />
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  className="px-5 py-3 rounded-xl text-white font-semibold shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                >
                  Agregar hito
                </button>

                <div className="mt-6 space-y-3">
                  {selectedForecast.hitos.length === 0 ? (
                    <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">No hay hitos cargados.</div>
                  ) : selectedForecast.hitos.map((hito) => (
                    <div key={hito.id} className="border border-gray-200 rounded-2xl p-4">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800">{hito.titulo}</span>
                            <span className="px-2 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{hito.tipo}</span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {formatDate(hito.fecha)} {hito.fechaFin ? `→ ${formatDate(hito.fechaFin)}` : ''}
                            {hito.responsable ? ` · ${hito.responsable}` : ''}
                          </p>
                          {hito.notas ? <p className="text-sm text-gray-600 mt-2">{hito.notas}</p> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={hito.estado}
                            onChange={(e) => handleMilestoneStatusChange(hito, e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#45ad98] bg-white"
                          >
                            <option value="Pendiente">Pendiente</option>
                            <option value="En Proceso">En Proceso</option>
                            <option value="Listo">Listo</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleDeleteMilestone(hito)}
                            className="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-sm font-semibold text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showNewModal && (
        <ForecastFormModal
          onClose={() => setShowNewModal(false)}
          onSave={handleCreateForecast}
          clients={clientes}
        />
      )}

      {previewDocumento && (
        <DocumentoPreviewModal
          documento={previewDocumento}
          onClose={() => setPreviewDocumento(null)}
        />
      )}
    </div>
  )
}

export default ForecastModule
