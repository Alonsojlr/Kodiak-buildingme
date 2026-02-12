import React, { useState, useRef } from 'react';
import { ChevronLeft, Camera, CheckCircle, XCircle, MinusCircle, AlertTriangle, Send, Image } from 'lucide-react';
import { createAuditoria, createRespuestas, createHallazgosBatch, uploadFotoAuditoria } from '../../api/audit-auditorias';
import { updateTienda } from '../../api/audit-tiendas';
import { createTarea } from '../../api/audit-tareas';

const EjecutarAuditoria = ({ tienda, plantillas, user, onVolver, onComplete }) => {
  const [paso, setPaso] = useState('seleccionar'); // 'seleccionar', 'checklist', 'resumen'
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [fotos, setFotos] = useState({});
  const [observacionGeneral, setObservacionGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [itemActual, setItemActual] = useState(0);
  const fileInputRefs = useRef({});

  // Seleccionar plantilla
  const handleSeleccionarPlantilla = (plantilla) => {
    setPlantillaSeleccionada(plantilla);
    const items = plantilla.audit_plantilla_items || [];
    const respuestasInit = {};
    items.forEach((item, idx) => {
      respuestasInit[idx] = { resultado: null, severidad: null, comentario: '' };
    });
    setRespuestas(respuestasInit);
    setItemActual(0);
    setPaso('checklist');
  };

  // Responder ítem
  const handleResponder = (idx, resultado) => {
    setRespuestas(prev => ({
      ...prev,
      [idx]: { ...prev[idx], resultado, severidad: resultado === 'NO' ? (prev[idx]?.severidad || 1) : null }
    }));
  };

  const handleSeveridad = (idx, sev) => {
    setRespuestas(prev => ({
      ...prev,
      [idx]: { ...prev[idx], severidad: sev }
    }));
  };

  const handleComentario = (idx, texto) => {
    setRespuestas(prev => ({
      ...prev,
      [idx]: { ...prev[idx], comentario: texto }
    }));
  };

  // Foto
  const handleFoto = async (idx, file) => {
    if (!file) return;
    // Mostrar preview local
    const reader = new FileReader();
    reader.onloadend = () => {
      setFotos(prev => ({ ...prev, [idx]: { file, preview: reader.result, url: null } }));
    };
    reader.readAsDataURL(file);
  };

  // Calcular score
  const calcularScore = () => {
    if (!plantillaSeleccionada) return { score: 0, estado: 'critica' };
    const items = plantillaSeleccionada.audit_plantilla_items || [];
    let puntosObtenidos = 0;
    let puntosMaximos = 0;

    items.forEach((item, idx) => {
      const resp = respuestas[idx];
      if (!resp || resp.resultado === 'NA' || item.max_puntos === 0) return;

      puntosMaximos += parseFloat(item.max_puntos) || 0;
      if (resp.resultado === 'OK') {
        puntosObtenidos += parseFloat(item.max_puntos) || 0;
      } else if (resp.resultado === 'NO') {
        const severidad = resp.severidad || 1;
        const descuento = (parseFloat(item.max_puntos) || 0) * (severidad / 3);
        puntosObtenidos += Math.max(0, (parseFloat(item.max_puntos) || 0) - descuento);
      }
    });

    // Normalizar a 100 si hay ítems NA
    const score = puntosMaximos > 0 ? Math.round((puntosObtenidos / puntosMaximos) * 100) : 0;
    const estado = score >= 80 ? 'ok' : score >= 60 ? 'observada' : 'critica';
    return { score, estado, puntosObtenidos, puntosMaximos };
  };

  const getValidation = () => {
    if (!plantillaSeleccionada) {
      return {
        missingAnswers: [],
        missingRequiredPhotos: []
      };
    }

    const items = plantillaSeleccionada.audit_plantilla_items || [];
    const missingAnswers = [];
    const missingRequiredPhotos = [];

    items.forEach((item, idx) => {
      const resp = respuestas[idx];
      if (!resp?.resultado) {
        missingAnswers.push(idx);
        return;
      }

      const needsPhoto =
        item.requiere_foto_siempre ||
        (resp.resultado === 'NO' && item.requiere_foto_no);

      if (needsPhoto && !fotos[idx]) {
        missingRequiredPhotos.push(idx);
      }
    });

    return {
      missingAnswers,
      missingRequiredPhotos
    };
  };

  // Verificar si puede avanzar al resumen (solo respuestas completas)
  const puedeAvanzar = () => {
    const { missingAnswers } = getValidation();
    return missingAnswers.length === 0;
  };

  // Enviar auditoría
  const handleEnviar = async () => {
    if (enviando) return;

    const { missingAnswers, missingRequiredPhotos } = getValidation();
    if (missingAnswers.length > 0) {
      alert(`Faltan ${missingAnswers.length} ítem(s) por responder antes de enviar.`);
      return;
    }
    if (missingRequiredPhotos.length > 0) {
      alert(`Faltan ${missingRequiredPhotos.length} foto(s) obligatoria(s). Revisa los hallazgos o ítems con foto requerida.`);
      return;
    }

    setEnviando(true);

    try {
      const items = plantillaSeleccionada.audit_plantilla_items || [];
      const { score, estado } = calcularScore();

      // 1. Subir fotos
      const fotosUrls = {};
      for (const [idx, fotoData] of Object.entries(fotos)) {
        if (fotoData.file) {
          const path = `${tienda.id}/${Date.now()}-item${idx}-${fotoData.file.name}`;
          const url = await uploadFotoAuditoria(fotoData.file, path);
          fotosUrls[idx] = url;
        }
      }

      // 2. Crear auditoría
      const itemsOk = Object.values(respuestas).filter(r => r.resultado === 'OK').length;
      const itemsNo = Object.values(respuestas).filter(r => r.resultado === 'NO').length;
      const itemsNa = Object.values(respuestas).filter(r => r.resultado === 'NA').length;

      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + 30);

      const auditoria = await createAuditoria({
        tienda_id: tienda.id,
        plantilla_id: plantillaSeleccionada.id,
        auditor_nombre: user?.name || 'Auditor',
        auditor_id: user?.id,
        tipo_auditoria: plantillaSeleccionada.tipo_auditoria,
        score_final: score,
        estado,
        total_items: items.length,
        items_ok: itemsOk,
        items_no: itemsNo,
        items_na: itemsNa,
        hallazgos_count: itemsNo,
        observacion_general: observacionGeneral,
        next_due_at: nextDue.toISOString()
      });

      // 3. Crear respuestas
      const respuestasData = items.map((item, idx) => ({
        auditoria_id: auditoria.id,
        plantilla_item_id: item.id,
        zona: item.zona,
        label: item.label,
        resultado: respuestas[idx]?.resultado || 'NA',
        severidad: respuestas[idx]?.severidad,
        comentario: respuestas[idx]?.comentario || '',
        foto_url: fotosUrls[idx] || null
      }));
      await createRespuestas(respuestasData);

      // 4. Crear hallazgos por cada NO
      const hallazgos = items
        .map((item, idx) => ({ item, idx, resp: respuestas[idx] }))
        .filter(({ resp }) => resp?.resultado === 'NO')
        .map(({ item, idx, resp }) => ({
          auditoria_id: auditoria.id,
          tienda_id: tienda.id,
          zona: item.zona,
          descripcion: `${item.label} - ${resp.comentario || 'Sin comentario'}`,
          severidad: resp.severidad || 1,
          foto_url: fotosUrls[idx] || null,
          estado: 'abierto'
        }));

      if (hallazgos.length > 0) {
        await createHallazgosBatch(hallazgos);
      }

      // 5. Actualizar tienda
      await updateTienda(tienda.id, {
        last_audit_at: new Date().toISOString(),
        last_score: score,
        last_state: estado
      });

      alert(`Auditoría enviada exitosamente. Score: ${score}% - Estado: ${estado.toUpperCase()}`);
      onComplete();
    } catch (error) {
      console.error('Error enviando auditoría:', error);
      alert('Error al enviar la auditoría: ' + error.message);
    } finally {
      setEnviando(false);
    }
  };

  const items = plantillaSeleccionada?.audit_plantilla_items || [];
  const { score, estado } = calcularScore();
  const { missingRequiredPhotos } = getValidation();

  // PASO 1: Seleccionar plantilla
  if (paso === 'seleccionar') {
    return (
      <div className="space-y-4">
        <button onClick={onVolver} className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 text-sm">
          <ChevronLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-2">Nueva Auditoría - {tienda.nombre}</h3>
          <p className="text-gray-500 mb-6">Selecciona la plantilla de checklist a usar:</p>

          <div className="space-y-3">
            {plantillas.length > 0 ? plantillas.map(p => (
              <button
                key={p.id}
                onClick={() => handleSeleccionarPlantilla(p)}
                className="w-full text-left p-4 border-2 border-gray-200 rounded-xl hover:border-[#45ad98] hover:bg-[#45ad98]/5 transition-all"
              >
                <p className="font-semibold text-gray-800">{p.nombre}</p>
                <p className="text-sm text-gray-500 mt-1">{p.descripcion}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>Tipo: {p.tipo_auditoria}</span>
                  <span>{p.audit_plantilla_items?.length || 0} ítems</span>
                  <span>{p.total_puntos} puntos</span>
                </div>
              </button>
            )) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No hay plantillas de checklist configuradas.</p>
                <p className="text-sm text-gray-400 mt-1">Ve a Config para crear una plantilla.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PASO 2: Checklist
  if (paso === 'checklist') {
    const item = items[itemActual];
    const resp = respuestas[itemActual] || {};
    const fotoData = fotos[itemActual];
    const necesitaFoto = (item?.requiere_foto_siempre) || (resp.resultado === 'NO' && item?.requiere_foto_no);
    const tieneFoto = !!fotoData;

    // Agrupar por zona para la barra de progreso
    const respondidos = Object.values(respuestas).filter(r => r.resultado).length;

    return (
      <div className="space-y-4">
        <button onClick={() => { if (itemActual === 0) setPaso('seleccionar'); else setItemActual(itemActual - 1); }}
          className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{itemActual === 0 ? 'Volver' : 'Anterior'}</span>
        </button>

        {/* Barra de progreso */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">{tienda.nombre}</span>
            <span className="text-sm text-gray-500">{respondidos}/{items.length} ítems</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${(respondidos / items.length) * 100}%`,
                background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)'
              }}
            />
          </div>
          {/* Mini indicators */}
          <div className="flex gap-1 mt-2">
            {items.map((_, idx) => {
              const r = respuestas[idx]?.resultado;
              return (
                <button
                  key={idx}
                  onClick={() => setItemActual(idx)}
                  className={`flex-1 h-1.5 rounded-full transition-all ${
                    idx === itemActual ? 'ring-2 ring-[#235250] ring-offset-1' : ''
                  } ${
                    r === 'OK' ? 'bg-green-400' :
                    r === 'NO' ? 'bg-red-400' :
                    r === 'NA' ? 'bg-gray-300' :
                    'bg-gray-200'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Item actual */}
        {item && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-semibold text-gray-500 uppercase">{item.zona?.replace('_', ' ')}</span>
              <span className="text-xs text-gray-400">Ítem {itemActual + 1} de {items.length}</span>
              {item.max_puntos > 0 && <span className="text-xs text-gray-400">({item.max_puntos} pts)</span>}
            </div>

            <h3 className="text-lg font-bold text-gray-800 mt-2">{item.label}</h3>
            {item.descripcion_ayuda && (
              <p className="text-sm text-gray-500 mt-1">{item.descripcion_ayuda}</p>
            )}

            {/* Botones OK / NO / NA */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleResponder(itemActual, 'OK')}
                className={`flex-1 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
                  resp.resultado === 'OK'
                    ? 'bg-green-500 text-white shadow-lg'
                    : 'border-2 border-gray-200 text-gray-600 hover:border-green-300 hover:bg-green-50'
                }`}
              >
                <CheckCircle className="w-6 h-6" />
                OK
              </button>
              <button
                onClick={() => handleResponder(itemActual, 'NO')}
                className={`flex-1 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
                  resp.resultado === 'NO'
                    ? 'bg-red-500 text-white shadow-lg'
                    : 'border-2 border-gray-200 text-gray-600 hover:border-red-300 hover:bg-red-50'
                }`}
              >
                <XCircle className="w-6 h-6" />
                NO
              </button>
              <button
                onClick={() => handleResponder(itemActual, 'NA')}
                className={`flex-1 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-all ${
                  resp.resultado === 'NA'
                    ? 'bg-gray-500 text-white shadow-lg'
                    : 'border-2 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <MinusCircle className="w-6 h-6" />
                N/A
              </button>
            </div>

            {/* Severidad (solo si NO) */}
            {resp.resultado === 'NO' && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Severidad del hallazgo:</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map(sev => (
                    <button
                      key={sev}
                      onClick={() => handleSeveridad(itemActual, sev)}
                      className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${
                        resp.severidad === sev
                          ? sev === 1 ? 'bg-yellow-400 text-white' : sev === 2 ? 'bg-orange-500 text-white' : 'bg-red-600 text-white'
                          : 'border-2 border-gray-200 text-gray-600'
                      }`}
                    >
                      {sev === 1 ? 'Leve' : sev === 2 ? 'Moderado' : 'Grave'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comentario rápido (solo si NO) */}
            {resp.resultado === 'NO' && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Comentario:</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['Dañado', 'Sucio', 'Faltante', 'Desordenado', 'Mezclado', 'Roto'].map(chip => (
                    <button
                      key={chip}
                      onClick={() => handleComentario(itemActual, resp.comentario ? `${resp.comentario}, ${chip}` : chip)}
                      className="px-3 py-1 border border-gray-300 rounded-full text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={resp.comentario || ''}
                  onChange={(e) => handleComentario(itemActual, e.target.value)}
                  placeholder="Comentario adicional..."
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] text-sm"
                />
              </div>
            )}

            {/* Foto */}
            {(necesitaFoto || item.requiere_foto_siempre) && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Foto {necesitaFoto ? '(obligatoria)' : '(opcional)'}:
                  {necesitaFoto && !tieneFoto && <AlertTriangle className="w-4 h-4 inline ml-1 text-red-500" />}
                </p>
                {tieneFoto ? (
                  <div className="relative">
                    <img src={fotoData.preview} alt="Preview" className="w-full max-h-48 object-cover rounded-xl" />
                    <button
                      onClick={() => setFotos(prev => { const n = { ...prev }; delete n[itemActual]; return n; })}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-[#45ad98] hover:bg-[#45ad98]/5 transition-colors">
                    <Camera className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">Tomar o seleccionar foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFoto(itemActual, e.target.files[0])}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Navegación */}
            <div className="flex justify-between mt-6">
              <button
                onClick={() => setItemActual(Math.max(0, itemActual - 1))}
                disabled={itemActual === 0}
                className="px-4 py-2 text-gray-600 border-2 border-gray-200 rounded-xl disabled:opacity-30"
              >
                Anterior
              </button>

              {itemActual < items.length - 1 ? (
                <button
                  onClick={() => setItemActual(itemActual + 1)}
                  disabled={!resp.resultado}
                  className="px-6 py-2 rounded-xl text-white font-semibold disabled:opacity-30 transition-all"
                  style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                >
                  Siguiente
                </button>
              ) : (
                <button
                  onClick={() => setPaso('resumen')}
                  disabled={!resp.resultado}
                  className="px-6 py-2 rounded-xl text-white font-semibold disabled:opacity-30 transition-all"
                  style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                >
                  Ver Resumen
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // PASO 3: Resumen
  if (paso === 'resumen') {
    const itemsNO = items.map((item, idx) => ({ item, idx, resp: respuestas[idx] })).filter(({ resp }) => resp?.resultado === 'NO');

    return (
      <div className="space-y-4">
        <button onClick={() => setPaso('checklist')} className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 text-sm">
          <ChevronLeft className="w-4 h-4" />
          <span>Volver al checklist</span>
        </button>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
            <h3 className="text-xl font-bold text-white">Resumen Auditoría</h3>
            <p className="text-white/80">{tienda.nombre} · {new Date().toLocaleDateString('es-CL')}</p>
          </div>

          <div className="p-6">
            {/* Score */}
            <div className="text-center mb-6">
              <div className="text-6xl font-bold" style={{
                color: score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626'
              }}>
                {score}%
              </div>
              <span className={`inline-block mt-2 px-4 py-1.5 rounded-full text-sm font-bold uppercase ${
                estado === 'ok' ? 'bg-green-100 text-green-800' :
                estado === 'observada' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {estado}
              </span>
            </div>

            {/* Resumen ítems */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{Object.values(respuestas).filter(r => r.resultado === 'OK').length}</p>
                <p className="text-xs text-green-600">OK</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{Object.values(respuestas).filter(r => r.resultado === 'NO').length}</p>
                <p className="text-xs text-red-600">NO</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-gray-500">{Object.values(respuestas).filter(r => r.resultado === 'NA').length}</p>
                <p className="text-xs text-gray-500">N/A</p>
              </div>
            </div>

            {/* Hallazgos */}
            {itemsNO.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold text-gray-800 mb-3">Hallazgos ({itemsNO.length})</h4>
                <div className="space-y-2">
                  {itemsNO.map(({ item, idx, resp }) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                      {fotos[idx] && (
                        <img src={fotos[idx].preview} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 text-sm">{item.label}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            resp.severidad === 3 ? 'bg-red-200 text-red-800' :
                            resp.severidad === 2 ? 'bg-orange-200 text-orange-800' :
                            'bg-yellow-200 text-yellow-800'
                          }`}>
                            {resp.severidad === 3 ? 'Grave' : resp.severidad === 2 ? 'Moderado' : 'Leve'}
                          </span>
                          {resp.comentario && <span className="text-xs text-gray-500">{resp.comentario}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {missingRequiredPhotos.length > 0 && (
              <div className="mb-6 p-3 rounded-xl border border-amber-200 bg-amber-50">
                <p className="text-sm font-semibold text-amber-800">
                  Faltan {missingRequiredPhotos.length} foto(s) obligatoria(s) antes de enviar.
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Puedes volver al checklist para adjuntarlas y luego enviar la auditoría.
                </p>
              </div>
            )}

            {/* Observación general */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Observación general (opcional)</label>
              <textarea
                value={observacionGeneral}
                onChange={(e) => setObservacionGeneral(e.target.value)}
                rows={3}
                placeholder="Comentarios generales sobre la visita..."
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] text-sm"
              />
            </div>

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={() => setPaso('checklist')}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50"
              >
                Editar Respuestas
              </button>
              <button
                onClick={handleEnviar}
                disabled={enviando}
                className="flex-1 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
              >
                <Send className="w-4 h-4" />
                {enviando ? 'Enviando...' : 'Enviar Auditoría'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default EjecutarAuditoria;
