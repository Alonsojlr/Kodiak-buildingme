import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ClipboardCheck, Wrench, ListTodo, FileText, Camera, MapPin, AlertTriangle, Plus, Clock, Eye, Loader2, Trash2, ZoomIn, ZoomOut, Edit2, Save } from 'lucide-react';
import { getImplementacionesByTienda } from '../../api/audit-implementaciones';
import { deleteAuditoria, getAuditoriasByTienda, getRespuestasByAuditoria } from '../../api/audit-auditorias';
import { deleteTarea, getTareasByTienda } from '../../api/audit-tareas';
import { getAjustesByTienda } from '../../api/audit-tareas';
import { deleteTiendaFoto, getTiendaFotos, updateTiendaFoto, uploadTiendaFotosBatch } from '../../api/audit-mapa';
import EjecutarAuditoria from './EjecutarAuditoria';

const PHOTO_TYPE_LABELS = {
  visita_inicial: 'Visita Inicial',
  render: 'Renders',
  implementacion: 'Implementación',
  seguimiento: 'Revisión',
  otra: 'Otra'
};

const PHOTO_TYPE_ORDER = ['visita_inicial', 'render', 'implementacion', 'seguimiento', 'otra'];
const PHOTO_TYPES = ['visita_inicial', 'render', 'implementacion', 'seguimiento', 'otra'];

const DetalleTienda = ({ tienda, auditorias: initialAuditorias, implementaciones: initialImpl, tareas: initialTareas, plantillas, formatCurrency, user, hideFinancialInfo = false, onVolver, onReload }) => {
  const [activeSubTab, setActiveSubTab] = useState('resumen');
  const [showAuditoria, setShowAuditoria] = useState(false);
  const [ajustes, setAjustes] = useState([]);
  const [fotosTienda, setFotosTienda] = useState([]);
  const [loadingFotosTienda, setLoadingFotosTienda] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [savingPhotoEdit, setSavingPhotoEdit] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editingPhotoForm, setEditingPhotoForm] = useState({
    tipo: 'otra',
    fecha_evento: new Date().toISOString().split('T')[0],
    titulo: '',
    descripcion: ''
  });
  const [photoForm, setPhotoForm] = useState({
    tipo: 'visita_inicial',
    fecha_evento: new Date().toISOString().split('T')[0],
    titulo: '',
    descripcion: '',
    files: []
  });
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const photoInputRef = useRef(null);
  const [photoCardMinWidth, setPhotoCardMinWidth] = useState(170);
  const [auditoriaDetalle, setAuditoriaDetalle] = useState(null);
  const [respuestasDetalle, setRespuestasDetalle] = useState([]);
  const [loadingAuditoriaDetalleId, setLoadingAuditoriaDetalleId] = useState(null);
  const [deletingAuditoriaId, setDeletingAuditoriaId] = useState(null);
  const [deletingTareaId, setDeletingTareaId] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const loadAjustes = async () => {
      try {
        const data = await getAjustesByTienda(tienda.id);
        setAjustes(data || []);
      } catch (e) {
        console.error('Error cargando ajustes:', e);
      }
    };
    loadAjustes();
  }, [tienda.id]);

  useEffect(() => {
    let cancelled = false;

    const loadFotos = async () => {
      if (activeSubTab !== 'fotos') return;
      setLoadingFotosTienda(true);
      try {
        const data = await getTiendaFotos(tienda.id);
        if (!cancelled) {
          setFotosTienda(data || []);
        }
      } catch (error) {
        console.error('Error cargando fotos de tienda:', error);
      } finally {
        if (!cancelled) setLoadingFotosTienda(false);
      }
    };

    loadFotos();
    return () => {
      cancelled = true;
    };
  }, [activeSubTab, tienda.id]);

  const diasSinAuditoria = tienda.last_audit_at
    ? Math.floor((new Date() - new Date(tienda.last_audit_at)) / (1000 * 60 * 60 * 24))
    : null;
  const vencida = diasSinAuditoria === null || diasSinAuditoria > 30;

  const implActivas = initialImpl.filter(i => i.estado === 'activa');
  const inversionTotal = implActivas.reduce((sum, i) => sum + (parseFloat(i.costo_total) || 0), 0);
  const tareasAbiertas = initialTareas.filter(t => t.estado !== 'cerrada');

  const scoreColor = tienda.last_score >= 80 ? '#16a34a' : tienda.last_score >= 60 ? '#f59e0b' : '#dc2626';

  const subTabs = [
    { id: 'resumen', name: 'Resumen' },
    ...(!hideFinancialInfo ? [{ id: 'implementacion', name: 'Implementación' }] : []),
    { id: 'auditorias', name: 'Auditorías' },
    { id: 'fotos', name: 'Fotos' },
    { id: 'ajustes', name: 'Ajustes' },
    { id: 'tareas', name: 'Tareas' }
  ];

  useEffect(() => {
    if (hideFinancialInfo && activeSubTab === 'implementacion') {
      setActiveSubTab('resumen');
    }
  }, [hideFinancialInfo, activeSubTab]);

  const refreshFotosTienda = async () => {
    const data = await getTiendaFotos(tienda.id);
    setFotosTienda(data || []);
  };

  const handleUploadPhotos = async () => {
    if (!photoForm.files || photoForm.files.length === 0) {
      alert('Selecciona al menos una foto');
      return;
    }

    try {
      setUploadingPhotos(true);
      await uploadTiendaFotosBatch(tienda.id, photoForm.files, {
        tipo: photoForm.tipo,
        fecha_evento: photoForm.fecha_evento,
        titulo: photoForm.titulo,
        descripcion: photoForm.descripcion,
        created_by: user?.id || null,
        created_by_name: user?.name || null
      });
      await refreshFotosTienda();
      setPhotoForm((prev) => ({ ...prev, titulo: '', descripcion: '', files: [] }));
      setIsDraggingPhotos(false);
      alert('Fotos registradas correctamente');
    } catch (error) {
      console.error('Error subiendo fotos de tienda:', error);
      alert('No se pudieron subir las fotos');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const addFilesToPhotoForm = (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;
    setPhotoForm((prev) => {
      const current = prev.files || [];
      const dedup = [...current];
      incoming.forEach((file) => {
        const exists = dedup.some(
          (f) =>
            f.name === file.name &&
            f.size === file.size &&
            f.lastModified === file.lastModified
        );
        if (!exists) dedup.push(file);
      });
      return { ...prev, files: dedup };
    });
  };

  const handlePhotoDragOver = (event) => {
    event.preventDefault();
    setIsDraggingPhotos(true);
  };

  const handlePhotoDragLeave = (event) => {
    event.preventDefault();
    setIsDraggingPhotos(false);
  };

  const handlePhotoDrop = (event) => {
    event.preventDefault();
    setIsDraggingPhotos(false);
    addFilesToPhotoForm(event.dataTransfer?.files);
  };

  const handleRemoveSelectedFile = (index) => {
    setPhotoForm((prev) => ({
      ...prev,
      files: (prev.files || []).filter((_, idx) => idx !== index)
    }));
  };

  const handleStartEditPhoto = (foto) => {
    setEditingPhotoId(foto.id);
    setEditingPhotoForm({
      tipo: foto.tipo || 'otra',
      fecha_evento: foto.fecha_evento || new Date().toISOString().split('T')[0],
      titulo: foto.titulo || '',
      descripcion: foto.descripcion || ''
    });
  };

  const handleCancelEditPhoto = () => {
    setEditingPhotoId(null);
    setEditingPhotoForm({
      tipo: 'otra',
      fecha_evento: new Date().toISOString().split('T')[0],
      titulo: '',
      descripcion: ''
    });
  };

  const handleSaveEditPhoto = async () => {
    if (!editingPhotoId) return;
    try {
      setSavingPhotoEdit(true);
      await updateTiendaFoto(editingPhotoId, editingPhotoForm);
      await refreshFotosTienda();
      handleCancelEditPhoto();
      alert('Foto actualizada correctamente');
    } catch (error) {
      console.error('Error actualizando foto:', error);
      alert('No se pudo actualizar la foto');
    } finally {
      setSavingPhotoEdit(false);
    }
  };

  const handleDeletePhoto = async (foto) => {
    if (!window.confirm('¿Eliminar esta foto? Esta acción no se puede deshacer.')) return;
    try {
      setDeletingPhotoId(foto.id);
      await deleteTiendaFoto(foto);
      await refreshFotosTienda();
      if (editingPhotoId === foto.id) handleCancelEditPhoto();
      alert('Foto eliminada');
    } catch (error) {
      console.error('Error eliminando foto:', error);
      alert('No se pudo eliminar la foto');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const fotosAgrupadasPorTipo = useMemo(() => {
    const groupedByType = PHOTO_TYPE_ORDER.reduce((acc, type) => {
      acc[type] = {};
      return acc;
    }, {});

    (fotosTienda || []).forEach((foto) => {
      const type = PHOTO_TYPE_ORDER.includes(foto.tipo) ? foto.tipo : 'otra';
      const dateKey = foto.fecha_evento || 'sin_fecha';
      if (!groupedByType[type][dateKey]) groupedByType[type][dateKey] = [];
      groupedByType[type][dateKey].push(foto);
    });

    return PHOTO_TYPE_ORDER.map((type) => {
      const byDate = groupedByType[type];
      const fechas = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));
      return {
        type,
        label: PHOTO_TYPE_LABELS[type],
        groups: fechas.map((fecha) => ({
          fecha,
          fotos: byDate[fecha]
        })),
        total: fechas.reduce((acc, fecha) => acc + byDate[fecha].length, 0)
      };
    });
  }, [fotosTienda]);

  if (showAuditoria) {
    return (
      <EjecutarAuditoria
        tienda={tienda}
        plantillas={plantillas}
        user={user}
        onVolver={() => setShowAuditoria(false)}
          onComplete={async () => {
            setShowAuditoria(false);
            setLightboxImage(null);
            await onReload();
          }}
        />
      );
  }

  const handleVerDetalleAuditoria = async (auditoria) => {
    setLoadingAuditoriaDetalleId(auditoria.id);
    try {
      const respuestas = await getRespuestasByAuditoria(auditoria.id);
      setRespuestasDetalle(respuestas || []);
      setAuditoriaDetalle(auditoria);
    } catch (error) {
      console.error('Error cargando detalle de auditoria:', error);
      alert('No se pudo cargar el detalle de la auditoría');
    } finally {
      setLoadingAuditoriaDetalleId(null);
    }
  };

  const handleEliminarAuditoria = async (auditoria) => {
    const fecha = auditoria.fecha_auditoria ? new Date(auditoria.fecha_auditoria).toLocaleDateString('es-CL') : 'sin fecha';
    if (!confirm(`¿Eliminar auditoría del ${fecha}? Esta acción también elimina respuestas y hallazgos asociados.`)) return;
    setDeletingAuditoriaId(auditoria.id);
    try {
      await deleteAuditoria(auditoria.id);
      if (auditoriaDetalle?.id === auditoria.id) {
        setAuditoriaDetalle(null);
        setRespuestasDetalle([]);
      }
      await onReload?.();
    } catch (error) {
      console.error('Error eliminando auditoría:', error);
      alert('No se pudo eliminar la auditoría');
    } finally {
      setDeletingAuditoriaId(null);
    }
  };

  const handleEliminarTarea = async (tarea) => {
    if (!confirm(`¿Eliminar tarea "${tarea.titulo}"?`)) return;
    setDeletingTareaId(tarea.id);
    try {
      await deleteTarea(tarea.id);
      await onReload?.();
    } catch (error) {
      console.error('Error eliminando tarea:', error);
      alert('No se pudo eliminar la tarea');
    } finally {
      setDeletingTareaId(null);
    }
  };

  if (auditoriaDetalle) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            setAuditoriaDetalle(null);
            setRespuestasDetalle([]);
            setLightboxImage(null);
          }}
          className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Volver a auditorías</span>
        </button>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
            <h3 className="text-xl font-bold text-white">Detalle Auditoría</h3>
            <p className="text-white/80">
              {tienda?.nombre} · {new Date(auditoriaDetalle.fecha_auditoria).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="p-6">
            <div className="text-center mb-6">
              <div
                className="text-5xl font-bold"
                style={{
                  color: auditoriaDetalle.score_final >= 80 ? '#16a34a' : auditoriaDetalle.score_final >= 60 ? '#f59e0b' : '#dc2626'
                }}
              >
                {auditoriaDetalle.score_final}%
              </div>
              <span
                className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-bold uppercase ${
                  auditoriaDetalle.estado === 'ok'
                    ? 'bg-green-100 text-green-800'
                    : auditoriaDetalle.estado === 'observada'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {auditoriaDetalle.estado}
              </span>
              <p className="text-sm text-gray-500 mt-2">Auditor: {auditoriaDetalle.auditor_nombre || '-'}</p>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-green-700">{auditoriaDetalle.items_ok || 0}</p>
                <p className="text-xs text-green-600">OK</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-red-700">{auditoriaDetalle.items_no || 0}</p>
                <p className="text-xs text-red-600">NO</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-500">{auditoriaDetalle.items_na || 0}</p>
                <p className="text-xs text-gray-500">N/A</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-orange-700">{auditoriaDetalle.hallazgos_count || 0}</p>
                <p className="text-xs text-orange-600">Hallazgos</p>
              </div>
            </div>

            {auditoriaDetalle.observacion_general && (
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-gray-600 mb-1">Observación general</p>
                <p className="text-sm text-gray-700">{auditoriaDetalle.observacion_general}</p>
              </div>
            )}

            <h4 className="font-semibold text-gray-800 mb-3">Respuestas del Checklist</h4>
            <div className="space-y-2">
              {respuestasDetalle.map((resp, idx) => (
                <div
                  key={resp.id || idx}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    resp.resultado === 'OK' ? 'bg-green-50' : resp.resultado === 'NO' ? 'bg-red-50' : 'bg-gray-50'
                  }`}
                >
                  {resp.foto_url && (
                    <button
                      type="button"
                      onClick={() => setLightboxImage(resp.foto_url)}
                      className="flex-shrink-0 focus:outline-none"
                      title="Ver foto"
                    >
                      <img
                        src={resp.foto_url}
                        alt="Foto auditoría"
                        className="w-12 h-12 object-cover rounded-lg border border-white/40 hover:opacity-90 transition-opacity"
                      />
                    </button>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-semibold text-gray-400">{resp.zona?.replace('_', ' ')}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          resp.resultado === 'OK'
                            ? 'bg-green-200 text-green-800'
                            : resp.resultado === 'NO'
                            ? 'bg-red-200 text-red-800'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {resp.resultado}
                      </span>
                      {resp.severidad && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            resp.severidad === 3
                              ? 'bg-red-200 text-red-800'
                              : resp.severidad === 2
                              ? 'bg-orange-200 text-orange-800'
                              : 'bg-yellow-200 text-yellow-800'
                          }`}
                        >
                          {resp.severidad === 3 ? 'Grave' : resp.severidad === 2 ? 'Moderado' : 'Leve'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1">{resp.label}</p>
                    {resp.comentario && <p className="text-xs text-gray-500 mt-1">{resp.comentario}</p>}
                  </div>
                </div>
              ))}
              {respuestasDetalle.length === 0 && <p className="text-sm text-gray-500">No hay respuestas guardadas para esta auditoría.</p>}
            </div>
          </div>
        </div>

        {lightboxImage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <div
              className="relative max-w-5xl max-h-[90vh] w-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="absolute top-2 right-2 z-10 px-3 py-1 rounded-lg bg-white/90 text-gray-800 text-sm font-semibold hover:bg-white"
              >
                Cerrar
              </button>
              <img src={lightboxImage} alt="Foto ampliada" className="max-w-full max-h-[88vh] object-contain rounded-lg shadow-2xl" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <button
            onClick={onVolver}
            className="flex items-center space-x-1 text-white/80 hover:text-white mb-4 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Volver a tiendas</span>
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">{tienda.nombre}</h2>
              <p className="text-white/80 flex items-center mt-1">
                <MapPin className="w-4 h-4 mr-1" />
                {tienda.direccion || tienda.ciudad}{tienda.region ? `, ${tienda.region}` : ''}
              </p>
              {tienda.kam && <p className="text-white/60 text-sm mt-1">KAM: {tienda.kam}</p>}
            </div>

            <div className="text-right">
              {tienda.last_score != null ? (
                <div className="text-4xl font-bold text-white">{tienda.last_score}%</div>
              ) : (
                <div className="text-lg text-white/60">Sin score</div>
              )}
              <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-semibold ${
                tienda.last_state === 'ok' ? 'bg-green-400/20 text-green-100' :
                tienda.last_state === 'observada' ? 'bg-yellow-400/20 text-yellow-100' :
                tienda.last_state === 'critica' ? 'bg-red-400/20 text-red-100' :
                'bg-white/20 text-white/80'
              }`}>
                {tienda.last_state?.replace('_', ' ')?.toUpperCase() || 'SIN AUDITORÍA'}
              </span>
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="flex flex-wrap gap-3 mt-5">
            <button
              onClick={onVolver}
              className="flex items-center space-x-2 px-4 py-2 bg-white/25 hover:bg-white/35 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Volver al listado</span>
            </button>
            <button
              onClick={() => setShowAuditoria(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-white text-sm font-medium transition-colors"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Nueva Auditoría</span>
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="px-6 py-3 bg-gray-50 flex flex-wrap items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500">Última auditoría:</span>{' '}
            <span className={`font-semibold ${vencida ? 'text-red-600' : 'text-gray-700'}`}>
              {tienda.last_audit_at ? new Date(tienda.last_audit_at).toLocaleDateString('es-CL') : 'Nunca'}
              {vencida && <AlertTriangle className="w-3.5 h-3.5 inline ml-1 text-red-500" />}
            </span>
          </div>
          {!hideFinancialInfo && (
            <div>
              <span className="text-gray-500">Implementaciones:</span>{' '}
              <span className="font-semibold text-gray-700">{implActivas.length}</span>
            </div>
          )}
          {!hideFinancialInfo && (
            <div>
              <span className="text-gray-500">Inversión activa:</span>{' '}
              <span className="font-semibold text-gray-700">{formatCurrency(inversionTotal)}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Tareas abiertas:</span>{' '}
            <span className="font-semibold text-gray-700">{tareasAbiertas.length}</span>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex space-x-1 bg-white rounded-xl shadow-sm p-1">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSubTab === tab.id
                ? 'bg-[#235250] text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Contenido del sub-tab */}
      {activeSubTab === 'resumen' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h4 className="font-semibold text-gray-700 mb-3">Score Actual</h4>
            <div className="text-center">
              <div className="text-5xl font-bold" style={{ color: scoreColor }}>
                {tienda.last_score != null ? `${tienda.last_score}%` : '-'}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {tienda.last_state === 'ok' ? 'Estado saludable' :
                 tienda.last_state === 'observada' ? 'Requiere atención' :
                 tienda.last_state === 'critica' ? 'Estado crítico' :
                 'Sin evaluar'}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h4 className="font-semibold text-gray-700 mb-3">Resumen</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Auditorías realizadas</span><span className="font-semibold">{initialAuditorias.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Ajustes realizados</span><span className="font-semibold">{ajustes.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tareas abiertas</span><span className="font-semibold">{tareasAbiertas.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tipo tienda</span><span className="font-semibold capitalize">{tienda.tipo_tienda || '-'}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h4 className="font-semibold text-gray-700 mb-3">Contacto</h4>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Nombre:</span> <span className="font-semibold">{tienda.contacto_nombre || '-'}</span></p>
              <p><span className="text-gray-500">Teléfono:</span> <span className="font-semibold">{tienda.contacto_telefono || '-'}</span></p>
              <p><span className="text-gray-500">Email:</span> <span className="font-semibold">{tienda.contacto_email || '-'}</span></p>
            </div>
          </div>
        </div>
      )}

      {!hideFinancialInfo && activeSubTab === 'implementacion' && (
        <div className="space-y-4">
          {implActivas.length > 0 ? implActivas.map(impl => (
            <div key={impl.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-bold text-gray-800">{impl.nombre}</h4>
                  <p className="text-sm text-gray-500">
                    Instalada: {impl.fecha_instalacion ? new Date(impl.fecha_instalacion).toLocaleDateString('es-CL') : '-'}
                  </p>
                </div>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold capitalize">{impl.estado}</span>
              </div>

              {/* Costos */}
              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-gray-500 text-xs">Valor Implementación</p>
                  <p className="font-semibold">{formatCurrency((parseFloat(impl.costo_total) || parseFloat(impl.costo_fabricacion) || 0))}</p>
                </div>
                <div className="rounded-lg p-2 text-center" style={{ backgroundColor: '#23525010' }}>
                  <p className="text-xs" style={{ color: '#235250' }}>Total</p>
                  <p className="font-bold" style={{ color: '#235250' }}>{formatCurrency((parseFloat(impl.costo_total) || parseFloat(impl.costo_fabricacion) || 0))}</p>
                </div>
              </div>

              {/* Activos */}
              {impl.audit_activos && impl.audit_activos.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-2">Activos instalados</p>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Tipo</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Descripción</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Cant.</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">Costo</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {impl.audit_activos.map(activo => (
                        <tr key={activo.id}>
                          <td className="px-3 py-2 capitalize">{activo.tipo?.replace('_', ' ')}</td>
                          <td className="px-3 py-2">{activo.descripcion || '-'}</td>
                          <td className="px-3 py-2 text-center">{activo.cantidad}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(activo.costo_total)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              activo.estado === 'bueno' ? 'bg-green-100 text-green-700' :
                              activo.estado === 'regular' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {activo.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )) : (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay implementaciones registradas en esta tienda</p>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'auditorias' && (
        <div className="space-y-3">
          {initialAuditorias.length > 0 ? initialAuditorias.map(aud => {
            const estadoColor = aud.estado === 'ok' ? 'bg-green-100 text-green-800'
              : aud.estado === 'observada' ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800';
            return (
              <div key={aud.id} className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">
                      {new Date(aud.fecha_auditoria).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-gray-500">
                      Auditor: {aud.auditor_nombre || '-'} · Tipo: {aud.tipo_auditoria}
                    </p>
                    {aud.observacion_general && (
                      <p className="text-sm text-gray-600 mt-1 italic">"{aud.observacion_general}"</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{
                      color: aud.score_final >= 80 ? '#16a34a' : aud.score_final >= 60 ? '#f59e0b' : '#dc2626'
                    }}>
                      {aud.score_final != null ? `${aud.score_final}%` : '-'}
                    </p>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${estadoColor}`}>
                      {aud.estado}
                    </span>
                  </div>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-500">
                  <span>OK: {aud.items_ok || 0}</span>
                  <span>NO: {aud.items_no || 0}</span>
                  <span>NA: {aud.items_na || 0}</span>
                  <span>Hallazgos: {aud.hallazgos_count || 0}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => handleVerDetalleAuditoria(aud)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    {loadingAuditoriaDetalleId === aud.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Ver detalle
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleEliminarAuditoria(aud)}
                    disabled={deletingAuditoriaId === aud.id}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border ${
                      deletingAuditoriaId === aud.id
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-red-200 text-red-700 hover:bg-red-50'
                    }`}
                  >
                    {deletingAuditoriaId === aud.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Eliminar
                  </button>
                </div>
              </div>
            );
          }) : (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay auditorías registradas</p>
              <button
                onClick={() => setShowAuditoria(true)}
                className="mt-3 px-4 py-2 rounded-xl text-white text-sm font-medium"
                style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
              >
                Realizar primera auditoría
              </button>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'fotos' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <ZoomOut className="w-4 h-4 text-gray-500" />
                <span>Tamaño de fotos</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>{photoCardMinWidth < 150 ? 'Chicas' : photoCardMinWidth > 210 ? 'Grandes' : 'Medianas'}</span>
                <ZoomIn className="w-4 h-4 text-gray-500" />
              </div>
            </div>
            <input
              type="range"
              min="120"
              max="260"
              step="10"
              value={photoCardMinWidth}
              onChange={(e) => setPhotoCardMinWidth(Number(e.target.value))}
              className="w-full accent-[#45ad98]"
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <h4 className="font-semibold text-gray-800">Agregar fotos</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                  <select
                    value={photoForm.tipo}
                    onChange={(e) => setPhotoForm((prev) => ({ ...prev, tipo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {PHOTO_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {PHOTO_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={photoForm.fecha_evento}
                    onChange={(e) => setPhotoForm((prev) => ({ ...prev, fecha_evento: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Título (opcional)</label>
                  <input
                    type="text"
                    value={photoForm.titulo}
                    onChange={(e) => setPhotoForm((prev) => ({ ...prev, titulo: e.target.value }))}
                    placeholder="Ej: Render fachada principal"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                  <textarea
                    rows={3}
                    value={photoForm.descripcion}
                    onChange={(e) => setPhotoForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                    placeholder="Descripción opcional"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => addFilesToPhotoForm(e.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  onDragEnter={handlePhotoDragOver}
                  onDragOver={handlePhotoDragOver}
                  onDragLeave={handlePhotoDragLeave}
                  onDrop={handlePhotoDrop}
                  className={`w-full h-44 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center text-center px-4 ${
                    isDraggingPhotos
                      ? 'border-[#45ad98] bg-[#45ad98]/10'
                      : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <Camera className="w-8 h-8 text-gray-500 mb-2" />
                  <p className="text-sm font-semibold text-gray-700">Arrastra fotos aquí</p>
                  <p className="text-xs text-gray-500 mt-1">o haz click para seleccionar archivos</p>
                </button>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 min-h-[84px] max-h-[120px] overflow-y-auto">
                  {(photoForm.files || []).length === 0 ? (
                    <p className="text-xs text-gray-500">Sin archivos seleccionados</p>
                  ) : (
                    <div className="space-y-1.5">
                      {photoForm.files.map((file, idx) => (
                        <div key={`${file.name}-${file.size}-${idx}`} className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-700 truncate">{file.name}</p>
                          <button
                            type="button"
                            onClick={() => handleRemoveSelectedFile(idx)}
                            className="text-[11px] text-red-700 hover:text-red-900"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleUploadPhotos}
              disabled={uploadingPhotos}
              className={`w-full py-2 rounded-lg text-sm font-semibold ${
                uploadingPhotos ? 'bg-gray-200 text-gray-600' : 'bg-[#235250] text-white hover:bg-[#1f4442]'
              }`}
            >
              {uploadingPhotos ? 'Subiendo...' : 'Subir fotos'}
            </button>
          </div>

          {loadingFotosTienda && (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-3 animate-spin" />
              <p className="text-gray-500">Cargando fotos...</p>
            </div>
          )}

          {!loadingFotosTienda && fotosTienda.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <Camera className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay fotos registradas para esta tienda.</p>
              <p className="text-xs text-gray-400 mt-1">Puedes subirlas desde el módulo Mapa en el detalle de tienda.</p>
            </div>
          )}

          {!loadingFotosTienda && fotosTienda.length > 0 && fotosAgrupadasPorTipo.map((section) => (
            <div key={section.type} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-gray-800">{section.label}</h4>
                <span className="text-xs text-gray-500">{section.total} foto(s)</span>
              </div>

              {section.groups.length === 0 ? (
                <p className="text-sm text-gray-400">Sin fotos en esta categoría.</p>
              ) : (
                <div className="space-y-4">
                  {section.groups.map((group) => (
                    <div key={`${section.type}-${group.fecha}`} className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-700">
                          {group.fecha === 'sin_fecha'
                            ? 'Fecha no registrada'
                            : new Date(group.fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <span className="text-xs text-gray-500">{group.fotos.length} foto(s)</span>
                      </div>

                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${photoCardMinWidth}px, 1fr))` }}
                      >
                        {group.fotos.map((foto) => (
                          <div
                            key={foto.id}
                            className="rounded-lg overflow-hidden border border-gray-200 bg-white"
                          >
                            <button
                              type="button"
                              onClick={() => setLightboxImage(foto.foto_url)}
                              className="relative w-full focus:outline-none"
                              title="Ver foto"
                            >
                              <img
                                src={foto.foto_url}
                                alt={section.label}
                                className="w-full object-cover hover:opacity-90 transition-opacity"
                                style={{ aspectRatio: '1 / 1' }}
                              />
                            </button>
                            <div className="px-2 py-1 border-t flex items-center justify-between gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEditPhoto(foto)}
                                className="text-[11px] text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                              >
                                <Edit2 className="w-3 h-3" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(foto)}
                                disabled={deletingPhotoId === foto.id}
                                className={`text-[11px] inline-flex items-center gap-1 ${
                                  deletingPhotoId === foto.id ? 'text-gray-400 cursor-not-allowed' : 'text-red-700 hover:text-red-900'
                                }`}
                              >
                                {deletingPhotoId === foto.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                Eliminar
                              </button>
                            </div>

                            {editingPhotoId === foto.id && (
                              <div className="px-2 py-2 border-t bg-gray-50 space-y-2">
                                <select
                                  value={editingPhotoForm.tipo}
                                  onChange={(e) => setEditingPhotoForm((prev) => ({ ...prev, tipo: e.target.value }))}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                                >
                                  {PHOTO_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {PHOTO_TYPE_LABELS[type]}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="date"
                                  value={editingPhotoForm.fecha_evento}
                                  onChange={(e) => setEditingPhotoForm((prev) => ({ ...prev, fecha_evento: e.target.value }))}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                                />
                                <input
                                  type="text"
                                  value={editingPhotoForm.titulo}
                                  onChange={(e) => setEditingPhotoForm((prev) => ({ ...prev, titulo: e.target.value }))}
                                  placeholder="Título"
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                                />
                                <textarea
                                  rows={2}
                                  value={editingPhotoForm.descripcion}
                                  onChange={(e) => setEditingPhotoForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                                  placeholder="Descripción"
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={handleSaveEditPhoto}
                                    disabled={savingPhotoEdit}
                                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 ${
                                      savingPhotoEdit ? 'bg-gray-200 text-gray-600' : 'bg-[#235250] text-white'
                                    }`}
                                  >
                                    {savingPhotoEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                    Guardar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditPhoto}
                                    className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 text-gray-700"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeSubTab === 'ajustes' && (
        <div className="space-y-3">
          {ajustes.length > 0 ? ajustes.map(aj => (
            <div key={aj.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                    aj.tipo === 'correccion' ? 'bg-blue-100 text-blue-800' :
                    aj.tipo === 'ampliacion' ? 'bg-green-100 text-green-800' :
                    'bg-orange-100 text-orange-800'
                  }`}>
                    {aj.tipo}
                  </span>
                  <p className="font-semibold text-gray-800 mt-2">{aj.descripcion || aj.motivo}</p>
                  <p className="text-sm text-gray-500">{new Date(aj.created_at).toLocaleDateString('es-CL')}</p>
                </div>
                {!hideFinancialInfo && (
                  <div className="text-right">
                    {aj.costo > 0 && <p className="font-bold text-gray-800">{formatCurrency(aj.costo)}</p>}
                  </div>
                )}
              </div>
            </div>
          )) : (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay ajustes registrados</p>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'tareas' && (
        <div className="space-y-3">
          {initialTareas.length > 0 ? initialTareas.map(tarea => {
            const prioColor = tarea.prioridad === 'urgente' ? 'bg-red-100 text-red-800' :
              tarea.prioridad === 'alta' ? 'bg-orange-100 text-orange-800' :
              tarea.prioridad === 'media' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-600';
            const estadoColor = tarea.estado === 'cerrada' ? 'bg-green-100 text-green-800' :
              tarea.estado === 'en_progreso' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-600';
            return (
              <div key={tarea.id} className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{tarea.titulo}</p>
                    {tarea.descripcion && <p className="text-sm text-gray-500 mt-1">{tarea.descripcion}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${prioColor}`}>{tarea.prioridad}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${estadoColor}`}>{tarea.estado?.replace('_', ' ')}</span>
                      {tarea.responsable && <span className="text-xs text-gray-400">→ {tarea.responsable}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tarea.fecha_limite && (
                      <p className="text-xs text-gray-400">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(tarea.fecha_limite).toLocaleDateString('es-CL')}
                      </p>
                    )}
                    <button
                      onClick={() => handleEliminarTarea(tarea)}
                      disabled={deletingTareaId === tarea.id}
                      className={`p-1.5 rounded-lg ${
                        deletingTareaId === tarea.id ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-600'
                      }`}
                      title="Eliminar tarea"
                    >
                      {deletingTareaId === tarea.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <ListTodo className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay tareas registradas</p>
            </div>
          )}
        </div>
      )}

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute top-2 right-2 z-10 px-3 py-1 rounded-lg bg-white/90 text-gray-800 text-sm font-semibold hover:bg-white"
            >
              Cerrar
            </button>
            <img src={lightboxImage} alt="Foto ampliada" className="max-w-full max-h-[88vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DetalleTienda;
