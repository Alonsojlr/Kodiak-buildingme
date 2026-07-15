import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from './src/lib/supabaseClient';
import { getCotizaciones, createCotizacion, updateCotizacion, deleteCotizacion } from './src/api/cotizaciones';
import {
  getProtocolos,
  createProtocolo,
  updateProtocolo,
  deleteProtocolo,
  getProtocolosFacturas,
  createProtocoloFactura,
  updateProtocoloFactura,
  deleteProtocoloFactura
} from './src/api/protocolos';
import { getOrdenesCompra, getOrdenCompraById, createOrdenCompra, updateOrdenCompra, replaceOrdenCompraItems, deleteOrdenCompra, getOrdenCompraFacturas, createOrdenCompraFactura, deleteOrdenCompraFactura, updateOrdenCompraFactura } from './src/api/ordenes-compra';
import { getClientes, createCliente, updateCliente, deleteCliente, getContactosByCliente, createContacto, updateContacto, deleteContacto, getAllContactos } from './src/api/clientes';
import { getProveedores, createProveedor, updateProveedor, deleteProveedor } from './src/api/proveedores';
import { autenticarUsuario, cerrarSesion, obtenerSesionActual, getUsuarios, createUsuario, updateUsuario, deleteUsuario } from './src/api/usuarios';
import { getInventarioItems, getInventarioReservas, createInventarioItem, updateInventarioItem, deleteInventarioItem, createInventarioReserva, updateInventarioReserva, deleteInventarioReserva, deleteInventarioReservasByItem } from './src/api/inventario';
import { getGastosAdministracion, createGastoAdministracion, updateGastoAdministracion, deleteGastoAdministracion } from './src/api/administracion';
import { BarChart3, FileText, ShoppingCart, Package, Users, Building2, Settings, LogOut, TrendingUp, Clock, DollarSign, CheckCircle, XCircle, Pause, Download, Calendar, ChevronLeft, ChevronRight, Plus, Trash2, Edit2, Edit3, Star, ClipboardCheck, MessageCircle, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { generarCotizacionPDF, generarOCPDF, generarProtocoloPDF } from './src/utils/documentGenerator';
import AuditoriasModule from './src/components/auditorias/AuditoriasModule';
import { ReportesModule as InformesModule } from './src/components/reportes/ReportesModule';
import ForecastModule from './src/components/forecast/ForecastModule';
import { getForecasts as getForecastRecords } from './src/api/forecast';

const TOAST_EVENT = 'app-toast';

const notifyToast = (message, type = 'success') => {
  if (!message) return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }));
};

// Replace browser alerts with toast notifications.
const alert = (message) => {
  const normalized = String(message || '').toLowerCase();
  const type = normalized.includes('error') ? 'error' : 'success';
  notifyToast(message, type);
};

const PROTOCOLO_DOCS_BUCKET = 'audit-fotos';

const sanitizeStorageFileName = (name) =>
  String(name || 'documento.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');

const normalizePlainText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const formatRutInput = (value) => {
  const clean = String(value || '')
    .replace(/[^0-9kK]/g, '')
    .toUpperCase()
    .slice(0, 9);

  if (!clean) return '';
  if (clean.length === 1) return clean;

  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
};

const INVENTARIO_FAMILIAS = ['Televisores', 'Sillas', 'Mesas', 'Electricos', 'Varios'];
const CHAT_READ_STATE_VERSION = 2;
const FORECAST_CHAT_READ_STATE_VERSION = 1;

const getInventarioFamilia = (item) => {
  const searchable = normalizePlainText([
    item?.categoria,
    item?.nombre,
    item?.descripcion
  ].filter(Boolean).join(' '));

  if (searchable.includes('televisor') || searchable.includes(' tv ' ) || searchable.startsWith('tv ') || searchable.includes('pantalla')) {
    return 'Televisores';
  }
  if (searchable.includes('silla') || searchable.includes('sitial') || searchable.includes('taburete') || searchable.includes('banqueta')) {
    return 'Sillas';
  }
  if (searchable.includes('mesa') || searchable.includes('meson') || searchable.includes('meson')) {
    return 'Mesas';
  }
  if (
    searchable.includes('electric') ||
    searchable.includes('cable') ||
    searchable.includes('alargador') ||
    searchable.includes('extension') ||
    searchable.includes('enchufe') ||
    searchable.includes('foco') ||
    searchable.includes('luminaria')
  ) {
    return 'Electricos';
  }
  if (searchable.includes('vario')) {
    return 'Varios';
  }
  return '';
};

const uploadProtocoloDocumentoPDF = async ({ protocoloId, tipo, file }) => {
  if (!protocoloId) throw new Error('Falta el ID del protocolo');
  if (!file) throw new Error('No se seleccionó archivo');

  const safeName = sanitizeStorageFileName(file.name || 'documento.pdf');
  const path = `protocolos/${protocoloId}/${tipo}/${Date.now()}-${safeName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(PROTOCOLO_DOCS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf'
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from(PROTOCOLO_DOCS_BUCKET)
    .getPublicUrl(uploadData.path);

  return publicData.publicUrl;
};

const getProtocoloDocStoragePathFromPublicUrl = (url) => {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PROTOCOLO_DOCS_BUCKET}/`;
  const idx = String(url).indexOf(marker);
  if (idx === -1) return null;
  const rawPath = String(url).slice(idx + marker.length).split('?')[0];
  return decodeURIComponent(rawPath);
};

const playNotificationSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.26);
  } catch (error) {
    console.error('No se pudo reproducir sonido de notificación:', error);
  }
};


const BUSINESS_UNITS = [
  'Vía Pública',
  'Stand y Ferias',
  'TradeMarketing',
  'Inmobiliarias',
  'Imprenta',
  'Varios',
  'Financiamiento'
];

const CENTROS_COSTO = [
  {
    label: 'Administración',
    options: ['CC-ADM-01 | Administración General']
  },
  {
    label: 'Operativos Transversales',
    options: [
      'CC-OP-01 | Taller de Fabricación',
      'CC-OP-02 | Imprenta Offset',
      'CC-OP-03 | Imprenta PVC / Telas',
      'CC-OP-04 | Instalación / Montaje',
      'CC-OP-05 | Transporte & Logística',
      'CC-OP-06 | Audiovisual / Drone',
      'CC-OP-07 | Servicios Profesionales'
    ]
  },
  {
    label: 'Unidades de Negocio (costos propios)',
    options: [
      'CC-VP-01 | Vía Pública',
      'CC-ST-01 | Stands',
      'CC-INM-01 | Inmobiliarias',
      'CC-TM-01 | Trade Marketing',
      'CC-VAR-01 | Varios',
      'CC-PAP-01 | Papelería'
    ]
  },
  {
    label: 'Especial',
    options: ['CC-FIN-01 | Financiamiento / Comisión']
  }
];

const TIPOS_COSTO = [
  'Materiales',
  'Producción Externa',
  'Mano de Obra',
  'Transporte',
  'Arriendo',
  'Servicios Profesionales',
  'Imprenta / Impresión',
  'Mobiliario',
  'Equipamiento',
  'Materiales POP',
  'Terminaciones',
  'RRHH / Promotoras',
  'Software / Licencias',
  'Administración',
  'Costos Financieros',
  'Varios'
];

const ACTIVIDADES_USO = [
  'Fabricación',
  'Producción',
  'Montaje',
  'Desmontaje',
  'Despacho',
  'Distribución',
  'Visto Bueno / Aprobación',
  'Verificación',
  'Registro Audiovisual',
  'Instalación',
  'Mantención',
  'Compra Proyecto',
  'Compra Cliente',
  'Financiamiento Cliente'
];

const ADMIN_CENTRO_COSTO = 'CC-ADM-01 | Administración General';
const ADMIN_TIPOS_COSTO = [
  'Software / Licencias',
  'Equipamiento (Computadores, pantallas)',
  'Mobiliario Oficina',
  'Telefonía / Comunicaciones',
  'Servicios Profesionales (contador, asesorías)',
  'Marketing / Branding',
  'Papelería Oficina',
  'Arriendo / Gastos Oficina',
  'Mantención / Soporte',
  'Créditos / Intereses',
  'RRHH / Sueldos',
  'Varios Administración'
];
const ADMIN_ACTIVIDADES_USO = [
  'Operación General',
  'Gestión Administrativa',
  'Soporte Operativo',
  'Ventas / Comercial',
  'Marketing',
  'RRHH',
  'Sistemas',
  'Oficina',
  'Dirección'
];
const MEDIOS_PAGO = [
  'Contado Efectivo',
  '30 días',
  '60 días',
  'Transferencia Bancaria',
  'Caja Chica',
  'Tarjeta de Crédito'
];

const normalizeRole = (role) => {
  const normalized = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (normalized === 'trademarketing' || normalized === 'trade-marketing') {
    return 'trade_marketing';
  }
  return normalized;
};

const getRoleLabel = (role) => {
  const normalized = normalizeRole(role);
  const labels = {
    admin: 'Admin',
    comercial: 'Comercial',
    compras: 'Compras',
    diseno: 'Diseño',
    finanzas: 'Finanzas',
    auditor: 'Auditor',
    trade_marketing: 'TradeMarketing'
  };
  return labels[normalized] || role;
};

const LOGIN_PORTALS = [
  {
    id: 'buildingme',
    title: 'Building Me',
    subtitle: 'Acceso General',
    allowedRoles: ['admin', 'comercial', 'compras', 'diseno', 'finanzas'],
    buttonLabel: 'Entrar a Building Me'
  },
  {
    id: 'auditor',
    title: 'Auditor',
    subtitle: 'Acceso solo a Tiendas en Auditorías',
    allowedRoles: ['auditor'],
    buttonLabel: 'Entrar como Auditor'
  },
  {
    id: 'trade_marketing',
    title: 'TradeMarketing',
    subtitle: 'Acceso completo al módulo de Auditorías',
    allowedRoles: ['trade_marketing'],
    buttonLabel: 'Entrar como TradeMarketing'
  }
];

const normalizarNumero = (value) => String(value || '').replace(/\D/g, '');

const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (event) => {
      const { message, type } = event.detail || {};
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const toast = { id, message, type: type || 'success' };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  const colorMap = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900'
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2">
      <style>{`
        @keyframes toast-in-right {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`min-w-[320px] max-w-md rounded-2xl border px-5 py-4 shadow-lg ${colorMap[toast.type] || colorMap.info}`}
          style={{ animation: 'toast-in-right 0.25s ease-out' }}
        >
          <p className="text-base font-semibold">{toast.message}</p>
        </div>
      ))}
    </div>
  );
};

// Componente de Login
const LoginPage = ({ onLogin }) => {
  const [selectedPortalId, setSelectedPortalId] = useState('buildingme');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPortal = LOGIN_PORTALS.find((portal) => portal.id === selectedPortalId) || LOGIN_PORTALS[0];

  const handleSubmitPortal = async (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    setError('');
    setIsSubmitting(true);

    try {
      const usuario = await autenticarUsuario(normalizedEmail, password);
      const normalizedRole = normalizeRole(usuario.rol);

      if (!selectedPortal.allowedRoles.includes(normalizedRole)) {
        await cerrarSesion();
        throw new Error('Este usuario no pertenece a este tipo de acceso');
      }

      onLogin({
        id: usuario.id,
        email: usuario.email,
        username: usuario.email,
        name: usuario.nombre,
        role: normalizedRole
      });
    } catch (error) {
      console.error('Error login:', error);
      const errorMessage = error?.message?.includes('tipo de acceso')
        ? error.message
        : 'Usuario o contraseña incorrectos';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: 'url(/bg-login3.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay oscuro */}
      <div className="absolute inset-0 bg-black/20"></div>

      {/* Contenedor del login */}
      <div className="relative z-10 w-full max-w-xl px-6">
        {/* Logo Building Me centrado */}
        <div className="text-center mb-12">
          <img 
            src="/logo-building-me.png" 
            alt="Building Me" 
            className="h-20 mx-auto"
            style={{ filter: 'brightness(0) invert(1) drop-shadow(0 2px 10px rgba(0, 0, 0, 0.3))' }}
          />
        </div>

        <div
          className="backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 p-8"
          style={{ boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)' }}
        >
          <h2 className="text-3xl font-bold text-white text-center">Ingreso</h2>
          <p className="text-white/75 text-sm text-center mt-2 mb-8">{selectedPortal.subtitle}</p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl backdrop-blur-sm">
              <p className="text-white text-sm text-center font-semibold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmitPortal} className="space-y-4">
            <div>
              <label className="block text-white/85 text-sm font-semibold mb-2">Tipo de acceso</label>
              <select
                value={selectedPortalId}
                onChange={(e) => {
                  setSelectedPortalId(e.target.value);
                  setError('');
                }}
                className="w-full px-5 py-3 bg-white/10 border-2 border-white/30 rounded-2xl text-white focus:outline-none focus:border-white/60 backdrop-blur-sm transition-all"
              >
                {LOGIN_PORTALS.map((portal) => (
                  <option key={portal.id} value={portal.id} className="text-gray-900">
                    {portal.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="Email"
                className="w-full px-5 py-3 bg-white/10 border-2 border-white/30 rounded-2xl text-white placeholder-white/60 focus:outline-none focus:border-white/60 backdrop-blur-sm transition-all"
                required
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Contraseña"
                className="w-full px-5 py-3 bg-white/10 border-2 border-white/30 rounded-2xl text-white placeholder-white/60 focus:outline-none focus:border-white/60 backdrop-blur-sm transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2"
              >
                {showPassword ? (
                  <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                )}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-2xl font-bold shadow-xl transition-all transform hover:scale-105 hover:shadow-2xl disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
                color: '#235250'
              }}
            >
              {isSubmitting ? 'Validando...' : selectedPortal.buttonLabel}
            </button>
          </form>
        </div>

        {/* Footer con logo KODIAK */}
        <div className="text-center mt-10">
          <p className="text-white/70 text-sm mb-4">
            Kodiak Software © 2025 - Todos los derechos reservados
          </p>
          <img 
            src="/logo-kodiak.png" 
            alt="KODIAK" 
            className="h-20 mx-auto opacity-90"
          />
        </div>
      </div>
    </div>
  );
};

// Componente de Módulo de Inventario/Bodega
const InventarioModule = ({ activeModule, sharedProtocolos = [] }) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFichaModal, setShowFichaModal] = useState(false);
  const [itemSeleccionado, setItemSeleccionado] = useState(null);
  const [itemEnEdicion, setItemEnEdicion] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('todas');
  const [filterFamilia, setFilterFamilia] = useState('todas');
  const [cardMinWidth, setCardMinWidth] = useState(280);

  const loadItems = async (selectedId = null) => {
    try {
      setLoadingItems(true);
      setItemsError('');
      const [itemsData, reservasData] = await Promise.all([
        getInventarioItems(),
        getInventarioReservas()
      ]);

      const reservasPorItem = reservasData.reduce((acc, reserva) => {
        const key = reserva.item_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(reserva);
        return acc;
      }, {});

      const transformados = itemsData.map(item => ({
        id: item.id,
        codigo: item.codigo,
        nombre: item.nombre,
        descripcion: item.descripcion,
        categoria: item.categoria,
        especificaciones: item.especificaciones,
        unidadMedida: item.unidad_medida,
        stockTotal: parseInt(item.stock_total, 10) || 0,
        stockMinimo: parseInt(item.stock_minimo, 10) || 0,
        ubicacion: item.ubicacion,
        proveedorPrincipal: item.proveedor_principal,
        precioCosto: parseFloat(item.precio_costo) || 0,
        precioVenta: parseFloat(item.precio_venta) || 0,
        foto: item.foto_url || null,
        reservas: (reservasPorItem[item.id] || []).map(reserva => ({
          id: reserva.id,
          protocolo: reserva.protocolo,
          cantidad: reserva.cantidad,
          fechaDesde: reserva.fecha_desde,
          fechaHasta: reserva.fecha_hasta,
          devuelto: reserva.devuelto
        }))
      }));

      setItems(transformados);
      if (selectedId) {
        const actualizado = transformados.find(i => i.id === selectedId) || null;
        setItemSeleccionado(actualizado);
      }
    } catch (error) {
      console.error('Error cargando inventario:', error);
      setItemsError('No se pudo cargar el inventario');
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    if (activeModule === 'inventario') {
      loadItems();
    }
  }, [activeModule]);

  useEffect(() => {
    if (activeModule !== 'inventario') return;
    const channel = supabase
      .channel('inventario-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_items' }, () => {
        loadItems();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_reservas' }, () => {
        loadItems();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeModule]);

  if (activeModule !== 'inventario') return null;

  const calcularStockDisponible = (item, fecha = null) => {
    const checkDate = fecha || new Date().toISOString().split('T')[0];
    const reservasActivas = (item.reservas || []).filter(r =>
      !r.devuelto &&
      r.fechaDesde && r.fechaHasta &&
      r.fechaDesde <= checkDate && r.fechaHasta >= checkDate
    );
    const stockReservado = reservasActivas.reduce((sum, r) => sum + r.cantidad, 0);
    return item.stockTotal - stockReservado;
  };

  const itemsFiltrados = items.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = (item.codigo || '').toLowerCase().includes(searchLower) ||
                       (item.nombre || '').toLowerCase().includes(searchLower) ||
                       (item.descripcion || '').toLowerCase().includes(searchLower);
    const matchCategoria = filterCategoria === 'todas' || item.categoria === filterCategoria;
    const matchFamilia = filterFamilia === 'todas' || getInventarioFamilia(item) === filterFamilia;
    return matchSearch && matchCategoria && matchFamilia;
  });

  const categorias = [...new Set(items.map(i => i.categoria).filter(Boolean))];

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const hoyISO = new Date().toISOString().split('T')[0];
  const isReservaVencida = (reserva) =>
    !reserva.devuelto && reserva.fechaHasta && reserva.fechaHasta < hoyISO;

  const getNextCodigo = () => {
    const numeros = items
      .map(i => parseInt(String(i.codigo || '').replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
    const maxNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
    return `INV-${String(maxNumero + 1).padStart(3, '0')}`;
  };

  const stats = {
    totalItems: items.length,
    totalmenteReservados: items.filter(i => calcularStockDisponible(i) === 0).length,
    valorTotal: items.reduce((sum, i) => sum + (i.stockTotal * i.precioCosto), 0),
    reservasActivas: items.reduce((sum, i) => sum + i.reservas.filter(r =>
      !r.devuelto && r.fechaDesde && r.fechaHasta &&
      r.fechaDesde <= hoyISO && r.fechaHasta >= hoyISO
    ).length, 0),
    reservasVencidas: items.reduce((sum, i) => sum + i.reservas.filter(isReservaVencida).length, 0)
  };
  const cardImageHeight = Math.max(220, Math.min(340, Math.round(cardMinWidth * 0.78)));

  const handleEditarItem = (item) => {
    setItemEnEdicion(item);
    setShowEditModal(true);
  };

  const handleEliminarItem = async (item) => {
    const reservasActivas = (item.reservas || []).filter((r) => !r.devuelto);
    const reservasDevueltas = (item.reservas || []).filter((r) => r.devuelto);

    if (reservasActivas.length > 0) {
      alert(`No puedes eliminar este item porque tiene ${reservasActivas.length} reserva(s) activa(s). Marca devolución o elimina esas reservas primero.`);
      return;
    }

    const advertenciaDevueltas = reservasDevueltas.length > 0
      ? `\n\nSe eliminarán también ${reservasDevueltas.length} reserva(s) en estado devuelto.`
      : '';

    const confirmar = window.confirm(
      `¿Eliminar el item "${item.nombre}" (${item.codigo})?${advertenciaDevueltas}`
    );
    if (!confirmar) return;

    try {
      if (reservasDevueltas.length > 0) {
        await deleteInventarioReservasByItem(item.id, { onlyReturned: true });
      }
      await deleteInventarioItem(item.id);
      if (itemSeleccionado?.id === item.id) {
        setShowFichaModal(false);
        setItemSeleccionado(null);
      }
      await loadItems();
      notifyToast('Item eliminado correctamente', 'success');
    } catch (error) {
      console.error('Error eliminando item:', error);
      alert('No se pudo eliminar el item. Verifica si tiene reservas relacionadas.');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Bodega / Inventario</h2>
          <p className="text-gray-600">Control de equipos y productos con sistema de reservas</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center space-x-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
        >
          <Package className="w-5 h-5" />
          <span>Nuevo Item</span>
        </button>
      </div>

      {itemsError && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg text-red-700">
          {itemsError}
        </div>
      )}

      {loadingItems && (
        <div className="mb-6 p-4 bg-white rounded-lg shadow text-gray-600">
          Cargando inventario...
        </div>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow">
          <p className="text-sm text-gray-500 mb-1">Total Items</p>
          <p className="text-2xl font-bold text-gray-800">{stats.totalItems}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 shadow">
          <p className="text-sm text-red-600 mb-1">Sin Disponibilidad</p>
          <p className="text-2xl font-bold text-red-800">{stats.totalmenteReservados}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow">
          <p className="text-sm text-blue-600 mb-1">Reservas Activas</p>
          <p className="text-2xl font-bold text-blue-800">{stats.reservasActivas}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 shadow">
          <p className="text-sm text-purple-600 mb-1">Valor Total</p>
          <p className="text-lg font-bold text-purple-800">{formatCurrency(stats.valorTotal)}</p>
        </div>
      </div>

      {/* Alertas */}
      {(stats.totalmenteReservados > 0 || stats.reservasVencidas > 0) && (
        <div className="mb-6 space-y-3">
          {stats.reservasVencidas > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <div className="flex items-center">
                <Clock className="w-5 h-5 text-red-600 mr-3" />
                <div>
                  <p className="font-semibold text-red-800">
                    {stats.reservasVencidas} reservas vencidas sin devolución
                  </p>
                  <p className="text-sm text-red-600">Revisa y marca devolución si corresponde</p>
                </div>
              </div>
            </div>
          )}
          {stats.totalmenteReservados > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <div className="flex items-center">
                <Package className="w-5 h-5 text-red-600 mr-3" />
                <div>
                  <p className="font-semibold text-red-800">
                    {stats.totalmenteReservados} items sin stock disponible
                  </p>
                  <p className="text-sm text-red-600">Todos los items están reservados para proyectos</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Búsqueda y Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por código, nombre o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <select
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
          >
            <option value="todas">Todas las categorías</option>
            {categorias.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <ZoomOut className="w-4 h-4 text-gray-500" />
              <span>Tamaño de cards</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>{cardMinWidth < 270 ? 'Chicas' : cardMinWidth > 320 ? 'Grandes' : 'Medianas'}</span>
              <ZoomIn className="w-4 h-4 text-gray-500" />
            </div>
          </div>
          <input
            type="range"
            min="220"
            max="360"
            step="10"
            value={cardMinWidth}
            onChange={(e) => setCardMinWidth(Number(e.target.value))}
            className="w-full accent-[#45ad98]"
          />
        </div>
        <div className="mt-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Familia</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterFamilia('todas')}
              className={`px-4 py-2 rounded-xl font-semibold shadow-sm transition-all ${
                filterFamilia === 'todas'
                  ? 'text-white shadow-md'
                  : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-[#45ad98] hover:text-[#235250]'
              }`}
              style={filterFamilia === 'todas'
                ? { background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }
                : {}}
            >
              Todas
            </button>
            {INVENTARIO_FAMILIAS.map((familia) => (
              <button
                key={familia}
                type="button"
                onClick={() => setFilterFamilia(familia)}
                className={`px-4 py-2 rounded-xl font-semibold shadow-sm transition-all ${
                  filterFamilia === familia
                    ? 'text-white shadow-md'
                    : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-[#45ad98] hover:text-[#235250]'
                }`}
                style={filterFamilia === familia
                  ? { background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }
                  : {}}
              >
                {familia}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Listado de Items - Vista de Cards */}
      {loadingItems ? (
        <div className="text-center py-12 bg-white rounded-xl">
          <p className="text-gray-500">Cargando inventario...</p>
        </div>
      ) : (
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}px, 1fr))` }}
        >
          {itemsFiltrados.map((item) => {
            const disponible = calcularStockDisponible(item);
            const porcentajeDisponible = (disponible / item.stockTotal) * 100;
            
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all">
                {/* Imagen */}
                <div
                  className="bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center"
                  style={{ height: `${cardImageHeight}px` }}
                >
                  {item.foto ? (
                    <img src={item.foto} alt={item.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-20 h-20 text-gray-400" />
                  )}
                </div>

                {/* Contenido */}
                <div className="p-6">
                  <div className="mb-3">
                    <span className="text-xs font-mono text-gray-500">{item.codigo}</span>
                    <h3 className="text-lg font-bold text-gray-800 mt-1">{item.nombre}</h3>
                    <p className="text-sm text-gray-600 mt-1">{item.descripcion}</p>
                  </div>

                  <div className="mb-4">
                    <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                      {item.categoria}
                    </span>
                  </div>

                  {/* Stock */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-gray-700">Stock Total:</span>
                      <span className="text-lg font-bold text-gray-800">{item.stockTotal} {item.unidadMedida}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-gray-700">Disponible:</span>
                      <span className={`text-lg font-bold ${disponible === 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {disponible} {item.unidadMedida}
                      </span>
                    </div>

                    {/* Barra de disponibilidad */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          porcentajeDisponible === 0 ? 'bg-red-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${porcentajeDisponible}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Reservas */}
                  {(() => {
                    const enUso = item.reservas.filter(r => !r.devuelto && r.fechaDesde <= hoyISO && r.fechaHasta >= hoyISO);
                    const proximas = item.reservas.filter(r => !r.devuelto && r.fechaDesde > hoyISO);
                    return (
                      <>
                        {enUso.length > 0 && (
                          <div className="mb-2 p-3 bg-orange-50 rounded-lg">
                            <p className="text-xs font-semibold text-orange-800 mb-1">
                              🔴 {enUso.length} En uso hoy
                            </p>
                            {enUso.slice(0, 2).map(r => {
                              const prot = sharedProtocolos.find(p => String(p.folio) === String(r.protocolo));
                              return (
                                <div key={r.id} className="mb-1">
                                  <p className="text-xs text-orange-700">
                                    Prot. {r.protocolo}: {r.cantidad} und ({r.fechaDesde} - {r.fechaHasta})
                                  </p>
                                  {prot?.nombreProyecto && (
                                    <p className="text-xs text-orange-600 font-medium pl-2">{prot.nombreProyecto}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {proximas.length > 0 && (
                          <div className="mb-2 p-3 bg-blue-50 rounded-lg">
                            <p className="text-xs font-semibold text-blue-800 mb-1">
                              📅 {proximas.length} Próxima{proximas.length > 1 ? 's' : ''} reserva{proximas.length > 1 ? 's' : ''}
                            </p>
                            {proximas.slice(0, 2).map(r => {
                              const prot = sharedProtocolos.find(p => String(p.folio) === String(r.protocolo));
                              return (
                                <div key={r.id} className="mb-1">
                                  <p className="text-xs text-blue-700">
                                    Prot. {r.protocolo}: {r.cantidad} und ({r.fechaDesde} - {r.fechaHasta})
                                  </p>
                                  {prot?.nombreProyecto && (
                                    <p className="text-xs text-blue-600 font-medium pl-2">{prot.nombreProyecto}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Ubicación */}
                  <div className="mb-4 text-sm text-gray-600">
                    <p>📍 {item.ubicacion}</p>
                  </div>

                  {/* Botón */}
                  <button
                    onClick={() => {
                      setItemSeleccionado(item);
                      setShowFichaModal(true);
                    }}
                    className="w-full py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
                    style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                  >
                    Ver Ficha Completa
                  </button>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => handleEditarItem(item)}
                      className="w-full py-2 rounded-xl border-2 border-[#45ad98] text-[#235250] font-semibold hover:bg-[#45ad98]/10 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleEliminarItem(item)}
                      className="w-full py-2 rounded-xl border-2 border-red-300 text-red-700 font-semibold hover:bg-red-50 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loadingItems && itemsFiltrados.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No se encontraron items en el inventario</p>
        </div>
      )}

      {/* Modales */}
      {showNewModal && (
        <NuevoItemModal 
          mode="create"
          onClose={() => setShowNewModal(false)}
          onSave={async (nuevoItem) => {
            try {
              const itemData = {
                codigo: getNextCodigo(),
                nombre: nuevoItem.nombre,
                descripcion: nuevoItem.descripcion,
                categoria: nuevoItem.categoria,
                especificaciones: nuevoItem.especificaciones,
                unidad_medida: nuevoItem.unidadMedida,
                stock_total: nuevoItem.stockTotal,
                stock_minimo: 0,
                ubicacion: nuevoItem.ubicacion,
                proveedor_principal: nuevoItem.proveedorPrincipal,
                precio_costo: nuevoItem.precioCosto,
                precio_venta: 0,
                foto_url: nuevoItem.foto || null
              };

              await createInventarioItem(itemData);
              await loadItems();
              setShowNewModal(false);
            } catch (error) {
              console.error('Error creando item:', error);
              alert('Error al crear item en inventario');
            }
          }}
        />
      )}

      {showEditModal && itemEnEdicion && (
        <NuevoItemModal
          mode="edit"
          initialData={itemEnEdicion}
          onClose={() => {
            setShowEditModal(false);
            setItemEnEdicion(null);
          }}
          onSave={async (itemEditado) => {
            try {
              const updates = {
                nombre: itemEditado.nombre,
                descripcion: itemEditado.descripcion,
                categoria: itemEditado.categoria,
                especificaciones: itemEditado.especificaciones,
                unidad_medida: itemEditado.unidadMedida,
                stock_total: itemEditado.stockTotal,
                ubicacion: itemEditado.ubicacion,
                proveedor_principal: itemEditado.proveedorPrincipal,
                precio_costo: itemEditado.precioCosto,
                foto_url: itemEditado.foto || null
              };

              await updateInventarioItem(itemEnEdicion.id, updates);
              await loadItems(itemEnEdicion.id);
              setShowEditModal(false);
              setItemEnEdicion(null);
              notifyToast('Item actualizado correctamente', 'success');
            } catch (error) {
              console.error('Error actualizando item:', error);
              alert('Error al actualizar item del inventario');
            }
          }}
        />
      )}

      {showFichaModal && itemSeleccionado && (
        <FichaItemModal
          item={itemSeleccionado}
          sharedProtocolos={sharedProtocolos}
          onClose={() => {
            setShowFichaModal(false);
            setItemSeleccionado(null);
          }}
          onCrearReserva={async (reserva) => {
            try {
              const reservaData = {
                item_id: itemSeleccionado.id,
                protocolo: reserva.protocolo,
                cantidad: reserva.cantidad,
                fecha_desde: reserva.fechaDesde,
                fecha_hasta: reserva.fechaHasta,
                devuelto: false
              };
              await createInventarioReserva(reservaData);
              await loadItems(itemSeleccionado.id);
            } catch (error) {
              console.error('Error creando reserva:', error);
              alert('Error al crear reserva');
            }
          }}
          onMarcarDevuelto={async (reservaId) => {
            try {
              await updateInventarioReserva(reservaId, { devuelto: true });
              await loadItems(itemSeleccionado.id);
            } catch (error) {
              console.error('Error actualizando reserva:', error);
              alert('Error al actualizar reserva');
            }
          }}
          onEliminarReserva={async (reservaId) => {
            try {
              await deleteInventarioReserva(reservaId);
              await loadItems(itemSeleccionado.id);
              notifyToast('Reserva eliminada correctamente', 'success');
            } catch (error) {
              console.error('Error eliminando reserva:', error);
              alert('Error al eliminar reserva');
            }
          }}
        />
      )}
    </div>
  );
};

// Modal Nuevo/Editar Item
const NuevoItemModal = ({ onClose, onSave, mode = 'create', initialData = null }) => {
  const getInitialFormData = () => ({
    nombre: initialData?.nombre || '',
    descripcion: initialData?.descripcion || '',
    categoria: initialData?.categoria || '',
    especificaciones: initialData?.especificaciones || '',
    unidadMedida: initialData?.unidadMedida || 'Unidad',
    stockTotal: Number.isFinite(Number(initialData?.stockTotal)) ? Number(initialData.stockTotal) : 1,
    ubicacion: initialData?.ubicacion || '',
    proveedorPrincipal: initialData?.proveedorPrincipal || '',
    precioCosto: Number.isFinite(Number(initialData?.precioCosto)) ? Number(initialData.precioCosto) : 0,
    foto: initialData?.foto || null
  });
  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
    setFormData(getInitialFormData());
  }, [initialData, mode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">
              {mode === 'edit' ? 'Editar Item de Inventario' : 'Nuevo Item de Inventario'}
            </h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre *</label>
              <input
                type="text"
                required
                value={formData.nombre}
                onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: TV Samsung 50 pulgadas"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción *</label>
              <textarea
                required
                value={formData.descripcion}
                onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                rows="2"
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Descripción detallada del item"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría *</label>
              <input
                type="text"
                required
                value={formData.categoria}
                onChange={(e) => setFormData({...formData, categoria: e.target.value})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: Electrónica, Mobiliario"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Especificaciones</label>
              <input
                type="text"
                value={formData.especificaciones}
                onChange={(e) => setFormData({...formData, especificaciones: e.target.value})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: 50 pulgadas, 4K, Smart TV"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Unidad de Medida *</label>
              <select
                required
                value={formData.unidadMedida}
                onChange={(e) => setFormData({...formData, unidadMedida: e.target.value})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
              >
                <option value="Unidad">Unidad</option>
                <option value="Metro">Metro</option>
                <option value="Metro Cuadrado">Metro Cuadrado</option>
                <option value="Kilogramo">Kilogramo</option>
                <option value="Caja">Caja</option>
                <option value="Paquete">Paquete</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Stock Total *</label>
              <input
                type="number"
                required
                min="0"
                value={formData.stockTotal}
                onChange={(e) => setFormData({...formData, stockTotal: parseInt(e.target.value) || 0})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>


            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ubicación en Bodega *</label>
              <input
                type="text"
                required
                value={formData.ubicacion}
                onChange={(e) => setFormData({...formData, ubicacion: e.target.value})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: Bodega A - Estante 3"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Proveedor Principal</label>
              <input
                type="text"
                value={formData.proveedorPrincipal}
                onChange={(e) => setFormData({...formData, proveedorPrincipal: e.target.value})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Precio Costo</label>
              <input
                type="number"
                min="0"
                value={formData.precioCosto}
                onChange={(e) => setFormData({...formData, precioCosto: parseFloat(e.target.value) || 0})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>


            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Foto del Producto</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files[0]) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFormData({...formData, foto: reader.result});
                    };
                    reader.readAsDataURL(e.target.files[0]);
                  }
                }}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
              <p className="text-xs text-gray-500 mt-1">Sube una imagen del producto (opcional)</p>
            </div>
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              {mode === 'edit' ? 'Guardar Cambios' : 'Crear Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal Ficha Completa del Item
const FichaItemModal = ({ item: itemInicial, onClose, onCrearReserva, onMarcarDevuelto, onEliminarReserva, sharedProtocolos = [] }) => {
  const [item, setItem] = useState({ ...itemInicial, reservas: itemInicial.reservas || [] });
  const [showReservaModal, setShowReservaModal] = useState(false);

  useEffect(() => {
    setItem({ ...itemInicial, reservas: itemInicial.reservas || [] });
  }, [itemInicial]);

  const calcularStockDisponible = () => {
    const checkDate = new Date().toISOString().split('T')[0];
    const reservasActivas = (item.reservas || []).filter(r =>
      !r.devuelto &&
      r.fechaDesde && r.fechaHasta &&
      r.fechaDesde <= checkDate && r.fechaHasta >= checkDate
    );
    const stockReservado = reservasActivas.reduce((sum, r) => sum + r.cantidad, 0);
    return item.stockTotal - stockReservado;
  };

  const marcarDevuelto = (reservaId) => {
    const actualizado = {
      ...item,
      reservas: item.reservas.map(r => r.id === reservaId ? {...r, devuelto: true} : r)
    };
    setItem(actualizado);
    if (onMarcarDevuelto) {
      onMarcarDevuelto(reservaId);
    }
  };

  const eliminarReserva = (reservaId) => {
    const confirmar = window.confirm('¿Eliminar esta reserva del historial?');
    if (!confirmar) return;

    const actualizado = {
      ...item,
      reservas: item.reservas.filter((r) => r.id !== reservaId)
    };
    setItem(actualizado);
    if (onEliminarReserva) {
      onEliminarReserva(reservaId);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const disponible = calcularStockDisponible();
  const reservas = item.reservas || [];
  const hoyISO = new Date().toISOString().split('T')[0];
  const isReservaVencida = (reserva) =>
    !reserva.devuelto && reserva.fechaHasta && reserva.fechaHasta < hoyISO;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-3xl font-bold text-white mb-2">{item.nombre}</h3>
              <p className="text-white/80 text-sm">Código: {item.codigo}</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-8 h-8" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Columna 1: Foto e Info Básica */}
            <div>
              <div className="h-64 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center mb-4">
                {item.foto ? (
                  <img src={item.foto} alt={item.nombre} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <Package className="w-24 h-24 text-gray-400" />
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Categoría</p>
                  <p className="font-semibold text-gray-800">{item.categoria}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Especificaciones</p>
                  <p className="font-semibold text-gray-800">{item.especificaciones || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ubicación</p>
                  <p className="font-semibold text-gray-800">📍 {item.ubicacion}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Proveedor Principal</p>
                  <p className="font-semibold text-gray-800">{item.proveedorPrincipal || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Precio Costo</p>
                  <p className="font-semibold text-gray-800">{formatCurrency(item.precioCosto)}</p>
                </div>
              </div>
            </div>

            {/* Columna 2 y 3: Stock y Reservas */}
            <div className="md:col-span-2">
              {/* Stock */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <h4 className="font-bold text-gray-800 mb-4">Estado de Stock</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Stock Total</p>
                    <p className="text-2xl font-bold text-gray-800">{item.stockTotal}</p>
                    <p className="text-xs text-gray-500">{item.unidadMedida}</p>
                  </div>
                  <div className={`bg-white p-4 rounded-lg border-2 ${
                    disponible === 0 ? 'border-red-500' : 'border-green-500'
                  }`}>
                    <p className="text-xs text-gray-500 mb-1">Disponible</p>
                    <p className={`text-2xl font-bold ${
                      disponible === 0 ? 'text-red-600' : 'text-green-600'
                    }`}>{disponible}</p>
                    <p className="text-xs text-gray-500">{item.unidadMedida}</p>
                  </div>
                </div>
              </div>

              {/* Reservas */}
              <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-gray-800">Calendario de Reservas</h4>
                  <button
                    onClick={() => setShowReservaModal(true)}
                    className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold hover:bg-[#235250] transition-colors text-sm"
                  >
                    + Nueva Reserva
                  </button>
                </div>

                {reservas.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left">Protocolo</th>
                          <th className="px-3 py-2 text-left">Cantidad</th>
                          <th className="px-3 py-2 text-left">Desde</th>
                          <th className="px-3 py-2 text-left">Hasta</th>
                          <th className="px-3 py-2 text-left">Estado</th>
                          <th className="px-3 py-2 text-left">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {reservas.map((reserva) => {
                          const prot = sharedProtocolos.find(p => String(p.folio) === String(reserva.protocolo));
                          return (
                          <tr key={reserva.id} className={reserva.devuelto ? 'opacity-50' : ''}>
                            <td className="px-3 py-3">
                              <span className="font-mono font-semibold">{reserva.protocolo}</span>
                              {prot?.nombreProyecto && (
                                <p className="text-xs text-gray-500 mt-0.5">{prot.nombreProyecto}</p>
                              )}
                            </td>
                            <td className="px-3 py-3 font-semibold">{reserva.cantidad}</td>
                            <td className="px-3 py-3">{reserva.fechaDesde}</td>
                            <td className="px-3 py-3">{reserva.fechaHasta}</td>
                            <td className="px-3 py-3">
                              {reserva.devuelto ? (
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                  Devuelto
                                </span>
                              ) : isReservaVencida(reserva) ? (
                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                                  Vencida
                                </span>
                              ) : reserva.fechaDesde > hoyISO ? (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                                  Próxima
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-semibold">
                                  En uso
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                {!reserva.devuelto && (
                                  <button
                                    onClick={() => marcarDevuelto(reserva.id)}
                                    className="px-3 py-1 bg-green-500 text-white rounded text-xs font-semibold hover:bg-green-600"
                                  >
                                    Devolver
                                  </button>
                                )}
                                <button
                                  onClick={() => eliminarReserva(reserva.id)}
                                  className="px-3 py-1 bg-red-500 text-white rounded text-xs font-semibold hover:bg-red-600"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ); })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Sin reservas activas</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
          >
            Cerrar Ficha
          </button>
        </div>

        {showReservaModal && (
          <ReservaModal 
            item={item}
            onClose={() => setShowReservaModal(false)}
            onSave={(reserva) => {
              const actualizado = {
                ...item,
                reservas: [...item.reservas, {...reserva, id: item.reservas.length + 1, devuelto: false}]
              };
              setItem(actualizado);
              if (onCrearReserva) {
                onCrearReserva(reserva);
              }
              setShowReservaModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

// Modal Nueva Reserva
const ReservaModal = ({ item, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    protocolo: '',
    cantidad: 1,
    fechaDesde: '',
    fechaHasta: ''
  });

  const calcularDisponible = () => {
    const checkDesde = formData.fechaDesde || new Date().toISOString().split('T')[0];
    const checkHasta = formData.fechaHasta || checkDesde;
    const reservasActivas = (item.reservas || []).filter(r =>
      !r.devuelto &&
      r.fechaDesde && r.fechaHasta &&
      r.fechaDesde <= checkHasta && r.fechaHasta >= checkDesde
    );
    const stockReservado = reservasActivas.reduce((sum, r) => sum + r.cantidad, 0);
    return item.stockTotal - stockReservado;
  };

  const disponible = calcularDisponible();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h4 className="text-xl font-bold text-gray-800">Nueva Reserva</h4>
          <p className="text-sm text-gray-600 mt-1">Stock disponible: {disponible} {item.unidadMedida}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Protocolo *</label>
            <input
              type="text"
              value={formData.protocolo}
              onChange={(e) => setFormData({...formData, protocolo: e.target.value})}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              placeholder="Ej: 30650"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Cantidad *</label>
            <input
              type="number"
              min="1"
              max={disponible}
              value={formData.cantidad}
              onChange={(e) => setFormData({...formData, cantidad: parseInt(e.target.value) || 1})}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha Desde *</label>
            <input
              type="date"
              value={formData.fechaDesde}
              onChange={(e) => setFormData({...formData, fechaDesde: e.target.value})}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha Hasta *</label>
            <input
              type="date"
              value={formData.fechaHasta}
              onChange={(e) => setFormData({...formData, fechaHasta: e.target.value})}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
        </div>
        <div className="p-6 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold"
            disabled={!formData.protocolo || !formData.fechaDesde || !formData.fechaHasta || formData.cantidad > disponible}
          >
            Crear Reserva
          </button>
        </div>
      </div>
    </div>
  );
};

const BodegaItemsModal = ({ codigoProtocolo, onClose, onAgregarItems }) => {
  const [items, setItems] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reservar, setReservar] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => {
    const loadInventario = async () => {
      try {
        setLoading(true);
        setError('');
        const [itemsData, reservasData] = await Promise.all([
          getInventarioItems(),
          getInventarioReservas()
        ]);
        setItems(itemsData);
        setReservas(reservasData);
      } catch (error) {
        console.error('Error cargando bodega:', error);
        setError('No se pudo cargar la bodega');
      } finally {
        setLoading(false);
      }
    };
    loadInventario();
  }, []);

  const disponiblePorItem = (itemId, stockTotal) => {
    const checkDesde = fechaDesde || new Date().toISOString().split('T')[0];
    const checkHasta = fechaHasta || checkDesde;
    const reservadas = reservas
      .filter(r =>
        r.item_id === itemId &&
        !r.devuelto &&
        r.fecha_desde && r.fecha_hasta &&
        r.fecha_desde <= checkHasta && r.fecha_hasta >= checkDesde
      )
      .reduce((sum, r) => sum + (r.cantidad || 0), 0);
    return Math.max(0, (stockTotal || 0) - reservadas);
  };

  const toggleSeleccion = (item) => {
    setSeleccionados(prev => {
      const existe = prev.find(s => s.item_id === item.id);
      if (existe) {
        return prev.filter(s => s.item_id !== item.id);
      }
      return [
        ...prev,
        {
          item_id: item.id,
          item: item.nombre,
          descripcion: item.descripcion,
          cantidad: 0,
          valorUnitario: 0,
          precioCostoRef: parseFloat(item.precio_costo) || 0,
          descuento: 0
        }
      ];
    });
  };

  const actualizarSeleccion = (itemId, campo, valor) => {
    setSeleccionados(prev =>
      prev.map(s => (s.item_id === itemId ? { ...s, [campo]: valor } : s))
    );
  };

  const agregarYReservar = async () => {
    if (seleccionados.length === 0) return;

    if (reservar) {
      if (!codigoProtocolo) {
        alert('Ingresa un código de protocolo para reservar en bodega.');
        return;
      }
      if (!fechaDesde || !fechaHasta) {
        alert('Selecciona fechas de reserva.');
        return;
      }

      try {
        await Promise.all(
          seleccionados.map(s =>
            createInventarioReserva({
              item_id: s.item_id,
              protocolo: codigoProtocolo,
              cantidad: s.cantidad,
              fecha_desde: fechaDesde,
              fecha_hasta: fechaHasta,
              devuelto: false
            })
          )
        );
      } catch (error) {
        console.error('Error reservando inventario:', error);
        alert('Error al reservar en bodega');
        return;
      }
    }

    onAgregarItems(
      seleccionados.map(s => ({
        item: s.item,
        descripcion: s.descripcion,
        cantidad: s.cantidad,
        valorUnitario: s.valorUnitario,
        descuento: s.descuento
      }))
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h4 className="text-xl font-bold text-gray-800">Bodega - Seleccionar Items</h4>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-gray-600">Cargando bodega...</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-gray-600">No hay items en bodega</p>
          ) : (
            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
              {items.map(item => {
                const disponible = disponiblePorItem(item.id, parseInt(item.stock_total, 10) || 0);
                const seleccionado = seleccionados.find(s => s.item_id === item.id);
                return (
                  <div key={item.id} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">{item.nombre}</p>
                        <p className="text-sm text-gray-500">{item.descripcion}</p>
                        <p className="text-xs text-gray-400">Disponible: {disponible}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSeleccion(item)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                          seleccionado ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {seleccionado ? 'Quitar' : 'Agregar'}
                      </button>
                    </div>

                    {seleccionado && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                          <input
                            type="number"
                            min="1"
                            max={disponible}
                            value={seleccionado.cantidad}
                            onChange={(e) => actualizarSeleccion(item.id, 'cantidad', parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">
                            V. Unitario OC
                            {seleccionado.precioCostoRef > 0 && (
                              <span className="ml-1 text-gray-400 font-normal">(costo: ${seleccionado.precioCostoRef.toLocaleString('es-CL')})</span>
                            )}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={seleccionado.valorUnitario === 0 ? '' : seleccionado.valorUnitario}
                            onChange={(e) =>
                              actualizarSeleccion(
                                item.id,
                                'valorUnitario',
                                e.target.value === '' ? '' : Number(e.target.value)
                              )
                            }
                            onBlur={(e) => {
                              if (e.target.value === '') actualizarSeleccion(item.id, 'valorUnitario', 0);
                            }}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Descuento %</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={seleccionado.descuento}
                            onChange={(e) => actualizarSeleccion(item.id, 'descuento', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
                          <input
                            type="text"
                            value={seleccionado.descripcion}
                            onChange={(e) => actualizarSeleccion(item.id, 'descripcion', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={reservar}
              onChange={(e) => setReservar(e.target.checked)}
            />
            <span className="text-sm text-gray-700">Reservar en bodega al agregar</span>
          </div>

          {reservar && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Desde</label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Hasta</label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={agregarYReservar}
            className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold"
            disabled={seleccionados.length === 0}
          >
            Agregar a OC
          </button>
        </div>
      </div>
    </div>
  );
};

// Módulo de Administración (Registro de Gastos)
const AdministracionModule = ({ activeModule }) => {
  if (activeModule !== 'administracion') return null;

  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGasto, setEditingGasto] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    nombreGasto: '',
    proveedor: '',
    numeroDocumento: '',
    medioPago: '',
    montoNeto: '',
    iva: '',
    total: '',
    observaciones: '',
    centroCosto: ADMIN_CENTRO_COSTO,
    tipoCosto: '',
    actividadUso: ''
  });

  const months = [
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' }
  ];

  const loadGastos = async () => {
    try {
      setLoading(true);
      const data = await getGastosAdministracion();
      const transformados = data.map((g) => ({
        id: g.id,
        fecha: g.fecha,
        proveedor: g.proveedor || '',
        nombreGasto: g.nombre_gasto || '',
        numeroDocumento: g.numero_documento || '',
        medioPago: g.medio_pago || '',
        montoNeto: parseFloat(g.monto_neto) || 0,
        iva: parseFloat(g.iva) || 0,
        total: parseFloat(g.total) || 0,
        observaciones: g.observaciones || '',
        centroCosto: g.centro_costo || ADMIN_CENTRO_COSTO,
        tipoCosto: g.tipo_costo || '',
        actividadUso: g.actividad_uso || '',
        pagado: Boolean(g.pagado)
      }));
      setGastos(transformados);
    } catch (error) {
      console.error('Error cargando gastos de administración:', error);
      setGastos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGastos();
  }, []);

  useEffect(() => {
    const neto = Number(formData.montoNeto);
    if (Number.isFinite(neto)) {
      const iva = Math.round(neto * 0.19);
      setFormData((prev) => ({
        ...prev,
        iva,
        total: neto + iva
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        iva: '',
        total: ''
      }));
    }
  }, [formData.montoNeto]);

  const yearsDisponibles = Array.from(
    new Set(gastos.map(g => (g.fecha ? new Date(g.fecha).getFullYear() : null)).filter(Boolean))
  ).sort((a, b) => b - a);

  const cumpleFiltroFecha = (fecha) => {
    if (!fecha) return false;
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return false;
    const month = String(date.getMonth() + 1);
    const year = String(date.getFullYear());
    if (selectedYear !== 'all' && year !== selectedYear) return false;
    if (selectedMonth !== 'all' && month !== selectedMonth) return false;
    return true;
  };

  const gastosFiltrados = gastos.filter(g =>
    (selectedMonth === 'all' && selectedYear === 'all') ? true : cumpleFiltroFecha(g.fecha)
  );

  const totalNeto = gastosFiltrados.reduce((sum, g) => sum + (g.montoNeto || 0), 0);
  const totalIva = gastosFiltrados.reduce((sum, g) => sum + (g.iva || 0), 0);
  const totalFinal = gastosFiltrados.reduce((sum, g) => sum + (g.total || 0), 0);

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);

  const resetForm = () => {
    setFormData({
      fecha: new Date().toISOString().split('T')[0],
      nombreGasto: '',
      proveedor: '',
      numeroDocumento: '',
      medioPago: '',
      montoNeto: '',
      iva: '',
      total: '',
      observaciones: '',
      centroCosto: ADMIN_CENTRO_COSTO,
      tipoCosto: '',
      actividadUso: ''
    });
  };

  const openNew = () => {
    setEditingGasto(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (gasto) => {
    setEditingGasto(gasto);
    setFormData({
      fecha: gasto.fecha || new Date().toISOString().split('T')[0],
      proveedor: gasto.proveedor || '',
      nombreGasto: gasto.nombreGasto || '',
      numeroDocumento: gasto.numeroDocumento || '',
      medioPago: gasto.medioPago || '',
      montoNeto: gasto.montoNeto || '',
      iva: gasto.iva || '',
      total: gasto.total || '',
      observaciones: gasto.observaciones || '',
      centroCosto: gasto.centroCosto || ADMIN_CENTRO_COSTO,
      tipoCosto: gasto.tipoCosto || '',
      actividadUso: gasto.actividadUso || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      fecha: formData.fecha,
      nombre_gasto: formData.nombreGasto,
      proveedor: formData.proveedor,
      numero_documento: formData.numeroDocumento,
      medio_pago: formData.medioPago,
      monto_neto: Number(formData.montoNeto) || 0,
      iva: Number(formData.iva) || 0,
      total: Number(formData.total) || 0,
      observaciones: formData.observaciones,
      centro_costo: ADMIN_CENTRO_COSTO,
      tipo_costo: formData.tipoCosto,
      actividad_uso: formData.actividadUso
    };

    try {
      if (editingGasto) {
        await updateGastoAdministracion(editingGasto.id, payload);
      } else {
        await createGastoAdministracion(payload);
      }
      await loadGastos();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Error guardando gasto administrativo:', error);
      alert('Error al guardar el gasto');
    }
  };

  const handleDelete = async (gastoId) => {
    if (!window.confirm('¿Eliminar este gasto administrativo?')) return;
    try {
      await deleteGastoAdministracion(gastoId);
      await loadGastos();
    } catch (error) {
      console.error('Error eliminando gasto administrativo:', error);
      alert('Error al eliminar el gasto');
    }
  };

  const togglePagoVisual = async (gasto) => {
    try {
      const updated = await updateGastoAdministracion(gasto.id, { pagado: !gasto.pagado });
      setGastos(prev => prev.map(item => (item.id === gasto.id ? { ...item, pagado: !!updated.pagado } : item)));
    } catch (error) {
      console.error('Error actualizando estado de pago:', error);
      alert('No se pudo actualizar el estado de pago');
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Administración</h2>
          <p className="text-gray-600">Registro de gastos administrativos (fuera de proyectos)</p>
        </div>
        <button
          onClick={openNew}
          className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
        >
          + Registrar gasto
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              <option value="all">Todos</option>
              {months.map((mes) => (
                <option key={mes.value} value={mes.value}>{mes.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              <option value="all">Todos</option>
              {yearsDisponibles.map((year) => (
                <option key={year} value={String(year)}>{year}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setSelectedMonth('all');
                setSelectedYear('all');
              }}
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-100"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <p className="text-sm text-gray-500 mb-2">Total Neto</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalNeto)}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <p className="text-sm text-gray-500 mb-2">IVA</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalIva)}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <p className="text-sm text-gray-500 mb-2">Total</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalFinal)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#45ad98' }}>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Fecha</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Gasto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Proveedor</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Documento</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Medio Pago</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Tipo Costo</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Actividad</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Neto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">IVA</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Total</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-500">Cargando...</td>
                </tr>
              ) : gastosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-500">Sin gastos registrados</td>
                </tr>
              ) : (
                gastosFiltrados.map((gasto) => (
                  <tr key={gasto.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-600">{gasto.fecha}</td>
                    <td className="px-6 py-4 text-gray-700">{gasto.nombreGasto}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-800">{gasto.proveedor}</p>
                      <p className="text-xs text-gray-500">{gasto.centroCosto}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{gasto.numeroDocumento}</td>
                    <td className="px-6 py-4 text-gray-600">{gasto.medioPago}</td>
                    <td className="px-6 py-4 text-gray-600">{gasto.tipoCosto}</td>
                    <td className="px-6 py-4 text-gray-600">{gasto.actividadUso}</td>
                    <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(gasto.montoNeto)}</td>
                    <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(gasto.iva)}</td>
                    <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(gasto.total)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => togglePagoVisual(gasto)}
                          className={`p-2 rounded-lg transition-colors border ${
                            gasto.pagado
                              ? 'bg-green-100 border-green-200 text-green-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                          title={gasto.pagado ? 'Pagado' : 'Marcar pagado'}
                        >
                          {gasto.pagado ? (
                            <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">P</span>
                          ) : (
                            <DollarSign className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => openEdit(gasto)}
                          className="p-2 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Settings className="w-4 h-4 text-orange-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(gasto.id)}
                          className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <XCircle className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
            <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    {editingGasto ? 'Editar Gasto' : 'Registrar Gasto'}
                  </h3>
                  <p className="text-white/80 text-sm mt-1">Centro de costos fijo: Administración General</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={formData.fecha}
                    onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre del Gasto *</label>
                  <input
                    type="text"
                    required
                    value={formData.nombreGasto}
                    onChange={(e) => setFormData({ ...formData, nombreGasto: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Proveedor *</label>
                  <input
                    type="text"
                    required
                    value={formData.proveedor}
                    onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">N° Documento *</label>
                  <input
                    type="text"
                    required
                    value={formData.numeroDocumento}
                    onChange={(e) => setFormData({ ...formData, numeroDocumento: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                    placeholder="Factura / Boleta / Contrato"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Medio de Pago *</label>
                  <select
                    required
                    value={formData.medioPago}
                    onChange={(e) => setFormData({ ...formData, medioPago: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                  >
                    <option value="">Seleccione...</option>
                    {MEDIOS_PAGO.map((medio) => (
                      <option key={medio} value={medio}>{medio}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Monto Neto *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.montoNeto}
                    onChange={(e) => setFormData({ ...formData, montoNeto: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">IVA</label>
                  <input
                    type="number"
                    value={formData.iva}
                    disabled
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Monto Total</label>
                  <input
                    type="number"
                    value={formData.total}
                    disabled
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Centro de Costos</label>
                  <input
                    type="text"
                    value={ADMIN_CENTRO_COSTO}
                    disabled
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Costo *</label>
                  <select
                    required
                    value={formData.tipoCosto}
                    onChange={(e) => setFormData({ ...formData, tipoCosto: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white font-semibold"
                  >
                    <option value="">Seleccione tipo...</option>
                    {ADMIN_TIPOS_COSTO.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Actividad / Uso *</label>
                  <select
                    required
                    value={formData.actividadUso}
                    onChange={(e) => setFormData({ ...formData, actividadUso: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white font-semibold"
                  >
                    <option value="">Seleccione actividad...</option>
                    {ADMIN_ACTIVIDADES_USO.map((actividad) => (
                      <option key={actividad} value={actividad}>{actividad}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
                <textarea
                  rows={3}
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold"
                >
                  {editingGasto ? 'Guardar cambios' : 'Registrar gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


// Modal Buscar Protocolo
const ModalBuscarProtocolo = ({ onClose, onSeleccionar, sharedProtocolos }) => {
  const [codigoProtocolo, setCodigoProtocolo] = useState('');
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Buscar Protocolo</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        <div className="p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Código del Protocolo
          </label>
          <input
            type="text"
            value={codigoProtocolo}
            onChange={(e) => setCodigoProtocolo(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] font-mono text-lg"
            placeholder="Ej: 30650"
            autoFocus
          />
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const codigoNormalizado = codigoProtocolo.trim();
                const protocolo = sharedProtocolos.find(p => String(p.folio) === codigoNormalizado);
                if (protocolo) {
                  onSeleccionar(protocolo);
                } else {
                  alert('Protocolo no encontrado. Verifica el código.');
                }
              }}
              disabled={!codigoProtocolo}
              className="px-6 py-3 rounded-xl text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Buscar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente de Módulo de Órdenes de Compra
const OrdenesCompraModule = ({ 
  user,
  sharedOrdenesCompra = [],
  setSharedOrdenesCompra = () => {},
  sharedProtocolos = [],
  datosPreOC,
  onOCCreada,
  onCancelarPreOC
}) => {
  const hideFinancials = false;
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetalleModal, setShowDetalleModal] = useState(false);
  const [detalleEditMode, setDetalleEditMode] = useState(false);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);
  const [showBuscarProtocolo, setShowBuscarProtocolo] = useState(false);
  const [datosOCDesdeProtocolo, setDatosOCDesdeProtocolo] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  
  // Abrir modal automáticamente si hay datosPreOC
  useEffect(() => {
    if (datosPreOC) {
      setDatosOCDesdeProtocolo(datosPreOC);
    }
  }, [datosPreOC]);
  
  // Cargar órdenes desde Supabase
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrdenes();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('ordenes-compra-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra' }, () => {
        loadOrdenes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra_items' }, () => {
        loadOrdenes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra_facturas' }, () => {
        loadOrdenes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    setOrdenes(sharedOrdenesCompra);
    if (ordenSeleccionada) {
      const updated = sharedOrdenesCompra.find(o => o.id === ordenSeleccionada.id);
      if (updated) setOrdenSeleccionada(updated);
    }
  }, [sharedOrdenesCompra]);

  const loadOrdenes = async () => {
    try {
      setLoading(true);
      const [data, proveedoresData] = await Promise.all([
        getOrdenesCompra(),
        getProveedores()
      ]);
      const ordenIds = (data || []).map(o => o.id).filter(Boolean);
      let facturasData = [];
      try { facturasData = ordenIds.length > 0 ? await getOrdenCompraFacturas(ordenIds) : []; } catch (_) {}
      const facturasByOrden = facturasData.reduce((acc, f) => {
        if (!acc[f.orden_id]) acc[f.orden_id] = [];
        acc[f.orden_id].push(f);
        return acc;
      }, {});
      const proveedoresById = new Map(
        (proveedoresData || []).map((p) => [String(p.id), p])
      );

      const limpiarItemsOrden = (items = []) => {
        const mapa = new Map();
        items.forEach((item) => {
          const nombre = String(item.item || '').trim();
          const descripcion = String(item.descripcion || '').trim();
          const valorUnitario = Number(item.valor_unitario ?? item.valorUnitario ?? 0);
          const cantidad = Number(item.cantidad ?? 0);
          const hasContenido = nombre.length > 0 || descripcion.length > 0 || valorUnitario > 0 || cantidad > 0;
          if (!hasContenido) return;
          const key = `${nombre.toLowerCase()}|${descripcion.toLowerCase()}`;
          mapa.set(key, item);
        });
        return Array.from(mapa.values());
      };

      const transformados = data.map(o => ({
        id: o.id,
        numero: o.numero,
        codigoProtocolo: o.codigo_protocolo,
        fecha: o.fecha,
        proveedorId: o.proveedor_id || null,
        proveedor:
          o.proveedores?.razon_social ||
          proveedoresById.get(String(o.proveedor_id))?.razon_social ||
          'Sin proveedor',
        rutProveedor:
          o.proveedores?.rut ||
          proveedoresById.get(String(o.proveedor_id))?.rut ||
          '',
        direccionProveedor:
          o.proveedores?.direccion ||
          proveedoresById.get(String(o.proveedor_id))?.direccion ||
          '',
        contactoProveedor:
          o.proveedores?.contacto ||
          proveedoresById.get(String(o.proveedor_id))?.contacto ||
          '',
        tipoCosto: o.tipo_costo,
        centroCosto: o.centro_costo || '',
        actividadUso: o.actividad_uso || '',
        formaPago: o.forma_pago,
        subtotal: parseFloat(o.subtotal) || 0,
        iva: parseFloat(o.iva) || 0,
        total: parseFloat(o.total) || 0,
        estado: o.estado,
        numeroFactura: o.numero_factura || '',
        fechaFactura: o.fecha_factura || '',
        estadoPago: o.estado_pago || 'Pendiente',
        fechaPago: o.fecha_pago || '',
        responsableCompra: o.responsable_compra || '',
        items: limpiarItemsOrden(o.ordenes_compra_items || []).map(item => ({
          id: item.id,
          item: item.item || '',
          cantidad: item.cantidad,
          descripcion: item.descripcion,
          valorUnitario: parseFloat(item.valor_unitario) || 0,
          valor_unitario: parseFloat(item.valor_unitario) || 0,
          descuento: parseFloat(item.descuento || 0)
        })),
        facturas: (facturasByOrden[o.id] || []).map(f => ({
          id: f.id,
          tipoDocumento: f.tipo_documento || 'Factura',
          numero: f.numero || '',
          fecha: f.fecha || '',
          monto: parseFloat(f.monto) || 0,
          estadoPago: f.estado_pago || 'Pendiente'
        }))
      }));

      setOrdenes(transformados);
      setSharedOrdenesCompra(transformados);
    } catch (error) {
      console.error('Error:', error);
      setOrdenes([]);
    } finally {
      setLoading(false);
    }
  };
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');

  const ordenesFiltradas = ordenes.filter(orden => {
    const matchSearch = orden.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       orden.proveedor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       orden.codigoProtocolo.includes(searchTerm);
    const matchEstado = filterEstado === 'todos' || orden.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const calcularSubtotalDesdeItems = (items = []) => {
    return (items || []).reduce((sum, item) => {
      const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
      const cantidad = item.cantidad || 0;
      const descuento = item.descuento || 0;
      const subtotal = cantidad * valorUnitario;
      return sum + (subtotal - subtotal * (descuento / 100));
    }, 0);
  };

  const obtenerTipoDocumentoOC = (orden) => {
    if (orden.tipoDocumento) return orden.tipoDocumento;
    const raw = String(orden.numeroFactura || '').toLowerCase();
    if (!raw) return 'Factura';
    if (raw.includes('factura internacional')) return 'Factura Internacional';
    if (raw.includes('factura exenta')) return 'Factura Exenta';
    if (raw.includes('boleta honorarios')) return 'Boleta Honorarios';
    if (raw.includes('boleta comercio')) return 'Boleta Comercio';
    if (raw.includes('factura')) return 'Factura';
    if (raw.includes('boleta')) return 'Boleta Comercio';
    return 'Factura';
  };

  const getEstadoColor = (estado) => {
    switch(estado) {
      case 'Emitida': return 'bg-yellow-100 text-yellow-800';
      case 'Recibida': return 'bg-blue-100 text-blue-800';
      case 'Facturada': return 'bg-green-100 text-green-800';
      case 'Pagada': return 'bg-green-500 text-white';
      case 'Anulada': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const stats = {
    total: ordenes.length,
    emitidas: ordenes.filter(o => o.estado === 'Emitida').length,
    recibidas: ordenes.filter(o => o.estado === 'Recibida').length,
    pagadas: ordenes.filter(o => o.estado === 'Pagada').length,
    montoTotal: ordenes.reduce((sum, o) => sum + o.total, 0),
    sinFactura: ordenes.filter(o => (!o.facturas || o.facturas.length === 0) && !o.numeroFactura && o.estado !== 'Anulada').length,
    pendientesPago: ordenes.filter(o => o.estadoPago === 'Pendiente' && o.estado !== 'Anulada').length
  };

  const cambiarEstado = (id, nuevoEstado) => {
    setOrdenes(prev => prev.map(o => 
      o.id === id ? { ...o, estado: nuevoEstado } : o
    ));
  };

  const marcarComoPagada = (id) => {
    setOrdenes(prev => prev.map(o => 
      o.id === id ? { ...o, estadoPago: 'Pagada', estado: 'Pagada' } : o
    ));
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Órdenes de Compra</h2>
          <p className="text-gray-600">Gestión de órdenes de compra a proveedores</p>
        </div>
        <div className="flex space-x-3">
          {['admin', 'comercial'].includes(user.role) && (
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center space-x-2 px-6 py-3 rounded-xl border-2 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              style={{ borderColor: '#45ad98', color: '#45ad98' }}
            >
              <ShoppingCart className="w-5 h-5" />
              <span>OC Manual</span>
            </button>
          )}
          <button
            onClick={() => setShowBuscarProtocolo(true)}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
          >
            <Package className="w-5 h-5" />
            <span>Desde Protocolo</span>
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow">
          <p className="text-sm text-gray-500 mb-1">Total OC</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 shadow">
          <p className="text-sm text-yellow-600 mb-1">Emitidas</p>
          <p className="text-2xl font-bold text-yellow-800">{stats.emitidas}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow">
          <p className="text-sm text-blue-600 mb-1">Recibidas</p>
          <p className="text-2xl font-bold text-blue-800">{stats.recibidas}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow">
          <p className="text-sm text-green-600 mb-1">Pagadas</p>
          <p className="text-2xl font-bold text-green-800">{stats.pagadas}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 shadow">
          <p className="text-sm text-purple-600 mb-1">Monto Total</p>
          <p className="text-lg font-bold text-purple-800">{formatCurrency(stats.montoTotal)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 shadow">
          <p className="text-sm text-red-600 mb-1">Sin Factura</p>
          <p className="text-2xl font-bold text-red-800">{stats.sinFactura}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 shadow">
          <p className="text-sm text-orange-600 mb-1">Pend. Pago</p>
          <p className="text-2xl font-bold text-orange-800">{stats.pendientesPago}</p>
        </div>
      </div>

      {/* Alertas */}
      {(stats.sinFactura > 0 || stats.pendientesPago > 0) && (
        <div className="mb-6 space-y-3">
          {stats.sinFactura > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <div className="flex items-center">
                <FileText className="w-5 h-5 text-red-600 mr-3" />
                <div>
                  <p className="font-semibold text-red-800">
                    {stats.sinFactura} OC sin número de factura asignado
                  </p>
                  <p className="text-sm text-red-600">Revisa y actualiza cuando recibas las facturas</p>
                </div>
              </div>
            </div>
          )}
          {stats.pendientesPago > 0 && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-lg">
              <div className="flex items-center">
                <DollarSign className="w-5 h-5 text-orange-600 mr-3" />
                <div>
                  <p className="font-semibold text-orange-800">
                    {stats.pendientesPago} OC con pago pendiente
                  </p>
                  <p className="text-sm text-orange-600">Coordina con finanzas para realizar los pagos</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Búsqueda y Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por número OC, proveedor o protocolo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
          >
            <option value="todos">Todos los estados</option>
            <option value="Emitida">Emitida</option>
            <option value="Recibida">Recibida</option>
            <option value="Facturada">Facturada</option>
            <option value="Pagada">Pagada</option>
            <option value="Anulada">Anulada</option>
          </select>
        </div>
      </div>

      {/* Listado de OC */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#45ad98' }}>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">N° OC</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Protocolo</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Fecha</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Item</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Proveedor</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Tipo Costo</th>
                {!hideFinancials && (
                  <>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">Neto</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">IVA</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">Total</th>
                  </>
                )}
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Factura</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Forma de Pago</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Estado</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Factura Building Me</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={14} className="px-6 py-8 text-center text-gray-500">
                    Cargando órdenes de compra...
                  </td>
                </tr>
              ) : ordenesFiltradas.map((orden) => {
                const tipoDoc = obtenerTipoDocumentoOC(orden);
                const subtotalItems = calcularSubtotalDesdeItems(orden.items || []);
                const neto = orden.subtotal || subtotalItems || (() => {
                  if (!orden.total) return 0;
                  if (tipoDoc === 'Boleta Comercio') return orden.total / 1.19;
                  if (tipoDoc === 'Boleta Honorarios') return orden.total / 1.1525;
                  if (tipoDoc === 'Factura Exenta' || tipoDoc === 'Factura Internacional') return orden.total;
                  return orden.total / 1.19;
                })();
                const iva = orden.iva || (orden.total ? orden.total - neto : neto * 0.19);
                const total = orden.total || neto + iva;

                return (
                <tr key={orden.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-lg" style={{ color: '#235250' }}>{orden.numero}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-gray-600">{orden.codigoProtocolo}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{orden.fecha}</td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-700 truncate max-w-xs" title={orden.items && orden.items.length > 0 ? (orden.items[0].item || orden.items[0].descripcion) : 'Sin items'}>
                      {orden.items && orden.items.length > 0 ? (orden.items[0].item || orden.items[0].descripcion) : 'Sin items'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-gray-800">{orden.proveedor}</p>
                      <p className="text-sm text-gray-500">Cód: {orden.codigoProveedor}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold">
                      {orden.tipoCosto || 'Sin asignar'}
                    </span>
                  </td>
                  {!hideFinancials && (
                    <>
                      <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(neto)}</td>
                      <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(iva)}</td>
                      <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(total)}</td>
                    </>
                  )}
                  <td className="px-6 py-4">
                    {(orden.facturas && orden.facturas.length > 0) ? (
                      <div className="space-y-1">
                        {orden.facturas.map(f => (
                          <div key={f.id}>
                            <p className="font-medium text-green-600 text-xs">{f.tipoDocumento} {f.numero}</p>
                            <p className="text-xs text-gray-500">{f.fecha}</p>
                          </div>
                        ))}
                      </div>
                    ) : orden.numeroFactura ? (
                      <div>
                        <p className="font-medium text-green-600">{orden.numeroFactura}</p>
                        <p className="text-xs text-gray-500">{orden.fechaFactura}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Sin factura</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {orden.formaPago ? (
                      <div>
                        <p className="font-medium text-gray-800">{orden.formaPago}</p>
                        {(orden.estadoPago === 'Pagada' || orden.estado === 'Pagada') && (
                          <p className="text-xs text-gray-500">{orden.fechaPago || orden.fechaFactura || ''}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Sin forma de pago</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getEstadoColor(orden.estado)}`}>
                      {orden.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={async () => {
                          try {
                            // Recargar la OC desde la BD antes de abrir el modal
                            const ocActualizada = await getOrdenCompraById(orden.id);
                            const ocTransformada = {
                              id: ocActualizada.id,
                              numero: ocActualizada.numero,
                              codigoProtocolo: ocActualizada.codigo_protocolo,
                              fecha: ocActualizada.fecha,
                              proveedorId: ocActualizada.proveedor_id || null,
                              proveedor: ocActualizada.proveedores?.razon_social || 'Sin proveedor',
                              rutProveedor: ocActualizada.proveedores?.rut || '',
                              direccionProveedor: ocActualizada.proveedores?.direccion || '',
                              contactoProveedor: ocActualizada.proveedores?.contacto || '',
                              tipoCosto: ocActualizada.tipo_costo,
                              centroCosto: ocActualizada.centro_costo || '',
                              actividadUso: ocActualizada.actividad_uso || '',
                              formaPago: ocActualizada.forma_pago,
                              subtotal: parseFloat(ocActualizada.subtotal) || 0,
                              iva: parseFloat(ocActualizada.iva) || 0,
                              total: parseFloat(ocActualizada.total) || 0,
                              estado: ocActualizada.estado,
                              numeroFactura: ocActualizada.numero_factura || '',
                              fechaFactura: ocActualizada.fecha_factura || '',
                              estadoPago: ocActualizada.estado_pago || 'Pendiente',
                              fechaPago: ocActualizada.fecha_pago || '',
                              responsableCompra: ocActualizada.responsable_compra || '',
                              items: (ocActualizada.ordenes_compra_items || []).map(item => ({
                                id: item.id,
                                item: item.item || '',
                                cantidad: item.cantidad,
                                descripcion: item.descripcion,
                                valorUnitario: parseFloat(item.valor_unitario) || 0,
                                valor_unitario: parseFloat(item.valor_unitario) || 0,
                                descuento: parseFloat(item.descuento || 0)
                              }))
                            };
                            setOrdenSeleccionada(ocTransformada);
                            setDetalleEditMode(false);
                            setShowDetalleModal(true);
                          } catch (error) {
                            console.error('Error cargando OC:', error);
                            alert('Error al cargar la orden de compra');
                          }
                        }}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Ver Detalle"
                      >
                        <FileText className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            // Recargar la OC desde la BD antes de abrir el modal
                            const ocActualizada = await getOrdenCompraById(orden.id);
                            const ocTransformada = {
                              id: ocActualizada.id,
                              numero: ocActualizada.numero,
                              codigoProtocolo: ocActualizada.codigo_protocolo,
                              fecha: ocActualizada.fecha,
                              proveedorId: ocActualizada.proveedor_id || null,
                              proveedor: ocActualizada.proveedores?.razon_social || 'Sin proveedor',
                              rutProveedor: ocActualizada.proveedores?.rut || '',
                              direccionProveedor: ocActualizada.proveedores?.direccion || '',
                              contactoProveedor: ocActualizada.proveedores?.contacto || '',
                              tipoCosto: ocActualizada.tipo_costo,
                              centroCosto: ocActualizada.centro_costo || '',
                              actividadUso: ocActualizada.actividad_uso || '',
                              formaPago: ocActualizada.forma_pago,
                              subtotal: parseFloat(ocActualizada.subtotal) || 0,
                              iva: parseFloat(ocActualizada.iva) || 0,
                              total: parseFloat(ocActualizada.total) || 0,
                              estado: ocActualizada.estado,
                              numeroFactura: ocActualizada.numero_factura || '',
                              fechaFactura: ocActualizada.fecha_factura || '',
                              estadoPago: ocActualizada.estado_pago || 'Pendiente',
                              fechaPago: ocActualizada.fecha_pago || '',
                              responsableCompra: ocActualizada.responsable_compra || '',
                              items: (ocActualizada.ordenes_compra_items || []).map(item => ({
                                id: item.id,
                                item: item.item || '',
                                cantidad: item.cantidad,
                                descripcion: item.descripcion,
                                valorUnitario: parseFloat(item.valor_unitario) || 0,
                                valor_unitario: parseFloat(item.valor_unitario) || 0,
                                descuento: parseFloat(item.descuento || 0)
                              }))
                            };
                            setOrdenSeleccionada(ocTransformada);
                            setDetalleEditMode(true);
                            setShowDetalleModal(true);
                          } catch (error) {
                            console.error('Error cargando OC:', error);
                            alert('Error al cargar la orden de compra');
                          }
                        }}
                        className="p-2 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Settings className="w-4 h-4 text-orange-600" />
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const proveedor = {
                              razon_social: orden.proveedor,
                              rut: orden.rutProveedor || '',
                              direccion: orden.direccionProveedor || '',
                              contacto: orden.contactoProveedor || ''
                            };
                            const protocolo = sharedProtocolos.find(p => p.folio === orden.codigoProtocolo) || { folio: orden.codigoProtocolo || '' };
                            const dedupeItemsPDF = (items = []) => {
                              const mapa = new Map();
                              items.forEach((item) => {
                                const nombre = String(item.item || '').trim();
                                const descripcion = String(item.descripcion || '').trim();
                                const valorUnitario = Number(item.valorUnitario ?? item.valor_unitario ?? 0);
                                const cantidad = Number(item.cantidad ?? 0);
                                const hasContenido = nombre.length > 0 || descripcion.length > 0 || valorUnitario > 0 || cantidad > 0;
                                if (!hasContenido) return;
                                const key = `${nombre.toLowerCase()}|${descripcion.toLowerCase()}`;
                                mapa.set(key, { ...item, item: nombre, descripcion });
                              });
                              return Array.from(mapa.values());
                            };
                            let itemsPDF = dedupeItemsPDF(orden.items || []);
                            try {
                              const ordenesActuales = await getOrdenesCompra();
                              const encontrada = ordenesActuales.find(o => o.id === orden.id);
                              if (encontrada?.ordenes_compra_items?.length) {
                                itemsPDF = dedupeItemsPDF(encontrada.ordenes_compra_items.map(item => ({
                                  id: item.id,
                                  item: item.item || '',
                                  cantidad: item.cantidad,
                                  descripcion: item.descripcion,
                                  valorUnitario: parseFloat(item.valor_unitario) || 0,
                                  descuento: parseFloat(item.descuento || 0)
                                })));
                              }
                            } catch (error) {
                              console.error('Error cargando items actualizados para PDF:', error);
                            }
                            await generarOCPDF(orden, proveedor, protocolo, itemsPDF);
                          } catch (error) {
                            console.error('Error al generar PDF:', error);
                            alert('Error al generar el PDF');
                          }
                        }}
                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                        title="Descargar PDF"
                      >
                        <Download className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(orden)}
                        className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && ordenesFiltradas.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500">No se encontraron órdenes de compra</p>
          </div>
        )}
      </div>

      {/* Modales */}
      {showNewModal && (
        <NuevaOCModal 
          currentUserName={user?.name}
          onClose={() => setShowNewModal(false)}
          onSave={async (nuevaOC) => {
            try {
              const ocData = {
                codigo_protocolo: nuevaOC.codigoProtocolo || '',
                fecha: new Date().toISOString().split('T')[0],
                proveedor_id: nuevaOC.proveedorId || null,
                tipo_costo: nuevaOC.tipoCosto,
                centro_costo: nuevaOC.centroCosto || '',
                actividad_uso: nuevaOC.actividadUso || '',
                forma_pago: nuevaOC.formaPago,
                responsable_compra: nuevaOC.responsableCompra || '',
                subtotal: parseFloat(nuevaOC.subtotal) || 0,
                iva: parseFloat(nuevaOC.iva) || 0,
                total: parseFloat(nuevaOC.total) || 0,
                estado: 'Emitida',
                numero_factura: '',
                fecha_factura: null,
                estado_pago: 'Pendiente'
              };

              await createOrdenCompra(ocData, nuevaOC.items || []);
              await loadOrdenes();
              setShowNewModal(false);
              alert('Orden de Compra creada exitosamente');
            } catch (error) {
              console.error('Error al crear OC:', error);
              alert(`Error al crear OC: ${error.message || 'Error desconocido'}`);
            }
          }}
        />
      )}

      {showDetalleModal && ordenSeleccionada && (
        <DetalleOCModal 
          orden={ordenSeleccionada}
          startInEdit={detalleEditMode}
          onClose={() => {
            setShowDetalleModal(false);
            setOrdenSeleccionada(null);
          }}
          onUpdate={(ordenActualizada) => {
            setOrdenes(prev => prev.map(o => 
              o.id === ordenActualizada.id ? ordenActualizada : o
            ));
          }}
          onSaveFactura={async (ordenActualizada) => {
            try {
              await updateOrdenCompra(ordenActualizada.id, {
                estado: ordenActualizada.estado || 'Facturada',
                estado_pago: ordenActualizada.estadoPago || 'Pendiente'
              });
              await loadOrdenes();
            } catch (error) {
              console.error('Error actualizando estado OC:', error);
            }
          }}
          onSavePago={async (ordenActualizada) => {
            try {
              await updateOrdenCompra(ordenActualizada.id, {
                estado: 'Pagada',
                estado_pago: 'Pagada',
                fecha_pago: ordenActualizada.fechaPago || new Date().toISOString().split('T')[0]
              });
              await loadOrdenes();
              setOrdenSeleccionada(ordenActualizada);
            } catch (error) {
              console.error('Error actualizando pago:', error);
              alert('Error al marcar como pagada');
            }
          }}
          onSave={async (ordenActualizada) => {
            try {
              const itemsLimpios = (() => {
                const mapa = new Map();
                (ordenActualizada.items || []).forEach((item) => {
                  const hasNombre = String(item.item || '').trim().length > 0;
                  const hasDescripcion = String(item.descripcion || '').trim().length > 0;
                  const valorUnitario = Number(item.valorUnitario ?? item.valor_unitario ?? 0);
                  const hasValor = valorUnitario > 0;
                  if (!hasNombre && !hasDescripcion && !hasValor) return;
                  const key = [
                    String(item.item || '').trim().toLowerCase(),
                    String(item.descripcion || '').trim().toLowerCase()
                  ].join('|');
                  mapa.set(key, item);
                });
                return Array.from(mapa.values());
              })();

              const subtotal = itemsLimpios.reduce((sum, item) => {
                const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
                const itemSubtotal = (item.cantidad || 0) * valorUnitario;
                const itemDescuento = itemSubtotal * (item.descuento / 100);
                return sum + (itemSubtotal - itemDescuento);
              }, 0);
              const iva = subtotal * 0.19;
              const total = subtotal + iva;

              await updateOrdenCompra(ordenActualizada.id, {
                proveedor_id: ordenActualizada.proveedorId || null,
                codigo_protocolo: ordenActualizada.codigoProtocolo || '',
                tipo_costo: ordenActualizada.tipoCosto || '',
                centro_costo: ordenActualizada.centroCosto || '',
                actividad_uso: ordenActualizada.actividadUso || '',
                forma_pago: ordenActualizada.formaPago || '',
                responsable_compra: ordenActualizada.responsableCompra || '',
                subtotal,
                iva,
                total,
                estado: ordenActualizada.estado,
                numero_factura: ordenActualizada.numeroFactura || '',
                fecha_factura: ordenActualizada.fechaFactura || null,
                estado_pago: ordenActualizada.estadoPago || 'Pendiente',
                fecha_pago: ordenActualizada.fechaPago || null
              });

              await replaceOrdenCompraItems(ordenActualizada.id, itemsLimpios);
              await loadOrdenes();

              setShowDetalleModal(false);
              setOrdenSeleccionada(null);
              alert('OC actualizada exitosamente');
            } catch (error) {
              console.error('Error actualizando OC:', error);
              alert('Error al actualizar OC');
            }
          }}
        />
      )}
      
      {/* Modal Buscar Protocolo */}
      {showBuscarProtocolo && (
        <ModalBuscarProtocolo
          sharedProtocolos={sharedProtocolos}
          onClose={() => setShowBuscarProtocolo(false)}
          onSeleccionar={(protocolo) => {
            setDatosOCDesdeProtocolo({
              codigoProtocolo: protocolo.folio,
              fechaProtocolo: protocolo.fechaCreacion || new Date().toISOString().split('T')[0],
              unidadNegocio: protocolo.unidadNegocio,
              items: protocolo.items || []
            });
            setShowBuscarProtocolo(false);
          }}
        />
      )}

      {datosOCDesdeProtocolo && (
        <FormularioOCDesdeProtocolo
          datosProtocolo={datosOCDesdeProtocolo}
          currentUserName={user?.name}
          onClose={() => {
            setDatosOCDesdeProtocolo(null);
            if (onCancelarPreOC) {
              onCancelarPreOC();
            }
          }}
          onGuardar={async (nuevaOC) => {
            try {
              const ordenesExistentes = await getOrdenesCompra();
              const ultimoNumero = ordenesExistentes.length > 0
                ? Math.max(...ordenesExistentes.map(o => {
                    const num = parseInt(o.numero.replace('OC-', ''));
                    return isNaN(num) ? 17403 : num;
                  }))
                : 17402;

              const ocData = {
                numero: `OC-${ultimoNumero + 1}`,
                codigo_protocolo: datosOCDesdeProtocolo.codigoProtocolo,
                fecha: new Date().toISOString().split('T')[0],
                proveedor_id: nuevaOC.proveedorId || null,
                tipo_costo: nuevaOC.tipoCosto,
                centro_costo: nuevaOC.centroCosto || '',
                actividad_uso: nuevaOC.actividadUso || '',
                forma_pago: nuevaOC.formaPago,
                responsable_compra: nuevaOC.responsableCompra || '',
                total: parseFloat(nuevaOC.total),
                estado: 'Emitida',
                numero_factura: '',
                fecha_factura: null,
                estado_pago: 'Pendiente'
              };

              await createOrdenCompra(ocData, nuevaOC.items || []);
              await loadOrdenes();

              setDatosOCDesdeProtocolo(null);
              if (onCancelarPreOC) {
                onCancelarPreOC();
              }
              alert('Orden de Compra creada exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al crear OC');
            }
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`¿Está seguro de eliminar la OC ${confirmDelete.numero}? Esta acción no se puede deshacer.`}
          onConfirm={async () => {
            const orden = confirmDelete;
            setConfirmDelete(null);
            try {
              await deleteOrdenCompra(orden.id);
              setSharedOrdenesCompra(prev => prev.filter(o => o.id !== orden.id));
              setOrdenes(prev => prev.filter(o => o.id !== orden.id));
            } catch (error) {
              console.error('Error eliminando OC:', error);
              alert('Error al eliminar la OC');
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};

// Diálogo de confirmación reutilizable para OC
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-800">Confirmar acción</h3>
      </div>
      <p className="text-gray-600 mb-6">{message || '¿Está seguro de realizar este cambio?'}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-5 py-2 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          className="px-5 py-2 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
          style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
        >
          OK
        </button>
      </div>
    </div>
  </div>
);

// Modal Nueva OC Manual
const NuevaOCModal = ({ onClose, onSave, currentUserName }) => {
  const [formData, setFormData] = useState({
    codigoProtocolo: '',
    fechaProtocolo: '',
    codigoProveedor: '',
    proveedorId: null,
    proveedor: '',
    rutProveedor: '',
    direccionProveedor: '',
    contactoProveedor: '',
    telefonoProveedor: '',
    cotizacionProveedor: '',
    formaPago: '',
    tipoDocumento: 'Factura',
    responsableCompra: currentUserName || '',
    tipoCosto: '',
    centroCosto: '',
    actividadUso: '',
    items: [
      { id: 1, item: '', cantidad: 0, descripcion: '', valorUnitario: 0, descuento: 0 }
    ],
    observaciones: ''
  });
  const [showBodegaModal, setShowBodegaModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const [proveedores, setProveedores] = useState([]);
  const [proveedoresError, setProveedoresError] = useState('');
  const [showProveedorAutocomplete, setShowProveedorAutocomplete] = useState(false);

  useEffect(() => {
    const loadProveedores = async () => {
      try {
        setProveedoresError('');
        const data = await getProveedores();
        const transformados = data.map(p => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.razon_social,
          rut: p.rut,
          direccion: p.direccion,
          contacto: p.contacto,
          telefono: p.telefono
        }));
        setProveedores(transformados);
      } catch (error) {
        console.error('Error cargando proveedores:', error);
        setProveedoresError('No se pudieron cargar los proveedores');
      }
    };

    loadProveedores();
  }, []);

  useEffect(() => {
    if (!currentUserName) return;
    setFormData(prev => (
      prev.responsableCompra ? prev : { ...prev, responsableCompra: currentUserName }
    ));
  }, [currentUserName]);

  const buscarProveedor = (codigo) => {
    const codigoNormalizado = codigo.trim();
    if (!codigoNormalizado) return;
    const prov = proveedores.find(p => String(p.codigo) === codigoNormalizado);
    if (prov) {
      setFormData(prev => ({
        ...prev,
        codigoProveedor: codigo,
        proveedorId: prov.id,
        proveedor: prov.nombre,
        rutProveedor: prov.rut,
        direccionProveedor: prov.direccion,
        contactoProveedor: prov.contacto,
        telefonoProveedor: prov.telefono
      }));
    }
  };

  const seleccionarProveedor = (prov) => {
    setFormData(prev => ({
      ...prev,
      codigoProveedor: prov.codigo,
      proveedorId: prov.id,
      proveedor: prov.nombre,
      rutProveedor: prov.rut,
      direccionProveedor: prov.direccion,
      contactoProveedor: prov.contacto,
      telefonoProveedor: prov.telefono
    }));
    setShowProveedorAutocomplete(false);
  };

  const agregarItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        id: prev.items.length + 1,
        item: '',
        cantidad: 0,
        descripcion: '',
        valorUnitario: 0,
        descuento: 0
      }]
    }));
  };

  const agregarItemsDesdeBodega = (itemsBodega) => {
    setFormData(prev => {
      const itemsExistentes = prev.items.filter(item =>
        String(item.item || '').trim().length > 0 ||
        String(item.descripcion || '').trim().length > 0 ||
        Number(item.valorUnitario || 0) > 0 ||
        Number(item.cantidad || 0) > 0
      );
      const baseId = Math.max(0, ...prev.items.map(i => i.id)) + 1;
      return {
        ...prev,
        items: [
          ...itemsExistentes,
          ...itemsBodega.map((item, index) => ({
            id: baseId + index,
            item: item.item || '',
            cantidad: item.cantidad || 0,
            descripcion: item.descripcion || '',
            valorUnitario: item.valorUnitario || 0,
            descuento: item.descuento || 0
          }))
        ]
      };
    });
  };

  const eliminarItem = (id) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const actualizarItem = (id, campo, valor) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === id ? { ...item, [campo]: valor } : item
      )
    }));
  };

  const calcularSubtotalItem = (item) => {
    const valorUnitario = Number(item.valorUnitario ?? item.valor_unitario ?? 0) || 0;
    const cantidad = parseFloat(String(item.cantidad || 0).replace(',', '.')) || 0;
    const subtotal = cantidad * valorUnitario;
    const descuento = subtotal * ((Number(item.descuento) || 0) / 100);
    return subtotal - descuento;
  };

  const calcularTotalesPorDocumento = (subtotalBase, tipoDocumento) => {
    const base = Number(subtotalBase) || 0;
    if (tipoDocumento === 'Boleta Comercio') {
      const subtotal = base / 1.19;
      const iva = base - subtotal;
      return { subtotal, iva, total: base };
    }
    if (tipoDocumento === 'Boleta Honorarios') {
      const iva = base * 0.1525;
      return { subtotal: base, iva, total: base + iva };
    }
    if (tipoDocumento === 'Factura Exenta' || tipoDocumento === 'Factura Internacional') {
      return { subtotal: base, iva: 0, total: base };
    }
    const iva = base * 0.19;
    return { subtotal: base, iva, total: base + iva };
  };

  const calcularTotales = () => {
    const subtotalBase = formData.items.reduce((sum, item) => sum + calcularSubtotalItem(item), 0);
    return calcularTotalesPorDocumento(subtotalBase, formData.tipoDocumento);
  };

  const resolverProveedorId = () => {
    if (formData.proveedorId) return formData.proveedorId;
    const codigo = String(formData.codigoProveedor || '').trim();
    if (codigo) {
      const byCodigo = proveedores.find(p => String(p.codigo) === codigo);
      if (byCodigo) return byCodigo.id;
    }
    const nombre = String(formData.proveedor || '').trim().toLowerCase();
    if (!nombre) return null;
    const exact = proveedores.find(p => p.nombre.toLowerCase() === nombre);
    if (exact) return exact.id;
    const starts = proveedores.filter(p => p.nombre.toLowerCase().startsWith(nombre));
    if (starts.length === 1) return starts[0].id;
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSaving) return;
    const proveedorId = resolverProveedorId();
    if (!proveedorId) {
      alert('Selecciona un proveedor de la lista o búscalo por código.');
      return;
    }
    const { subtotal, iva, total } = calcularTotales();
    const itemsNormalizados = formData.items.map(item => ({
      ...item,
      cantidad: parseFloat(String(item.cantidad || 0).replace(',', '.')) || 0
    }));
    setPendingData({ ...formData, items: itemsNormalizados, proveedorId, subtotal, iva, total });
    setShowConfirm(true);
  };

  const handleConfirmCreate = async () => {
    setShowConfirm(false);
    if (!pendingData || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(pendingData);
    } finally {
      setIsSaving(false);
      setPendingData(null);
    }
  };

  const totales = calcularTotales();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Nueva Orden de Compra (Manual)</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          {/* Datos del Proveedor */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Datos del Proveedor</h4>
            
            <div className="mb-4 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
              <label className="block text-sm font-semibold text-blue-800 mb-2">
                🔍 Código Proveedor (Autocompletar)
              </label>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={formData.codigoProveedor}
                  onChange={(e) => setFormData({...formData, codigoProveedor: e.target.value})}
                  onBlur={(e) => buscarProveedor(e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-lg font-bold"
                  placeholder="Ej: 1000"
                />
                <button
                  type="button"
                  onClick={() => buscarProveedor(formData.codigoProveedor)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  Buscar
                </button>
              </div>
              {proveedoresError && (
                <p className="text-xs text-red-600 mt-2">{proveedoresError}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Proveedor *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formData.proveedor}
                    onChange={(e) => {
                      setFormData({...formData, proveedor: e.target.value});
                      setShowProveedorAutocomplete(true);
                    }}
                    onFocus={() => setShowProveedorAutocomplete(true)}
                    onBlur={() => setTimeout(() => setShowProveedorAutocomplete(false), 150)}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                  {showProveedorAutocomplete && formData.proveedor && (
                    <div className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {proveedores
                        .filter(p =>
                          p.nombre.toLowerCase().includes(formData.proveedor.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => seleccionarProveedor(p)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50"
                          >
                            <span className="font-semibold">{p.nombre}</span>
                            <span className="text-xs text-gray-500 ml-2">Cód: {p.codigo}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT *</label>
                <input
                  type="text"
                  required
                  value={formData.rutProveedor}
                  onChange={(e) => setFormData({...formData, rutProveedor: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Contacto</label>
                <input
                  type="text"
                  value={formData.contactoProveedor}
                  onChange={(e) => setFormData({...formData, contactoProveedor: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
                <input
                  type="text"
                  value={formData.telefonoProveedor}
                  onChange={(e) => setFormData({...formData, telefonoProveedor: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Datos de la OC */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Datos de la Orden de Compra</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Código PR (Protocolo)</label>
                <input
                  type="text"
                  value={formData.codigoProtocolo}
                  onChange={(e) => setFormData({...formData, codigoProtocolo: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="Ej: 30650 (Opcional)"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha PR</label>
                <input
                  type="date"
                  value={formData.fechaProtocolo}
                  onChange={(e) => setFormData({...formData, fechaProtocolo: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">N° Cotización Proveedor</label>
                <input
                  type="text"
                  value={formData.cotizacionProveedor}
                  onChange={(e) => setFormData({...formData, cotizacionProveedor: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="Ref. del proveedor"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Centro de Costos * 
                  <span className="text-xs text-gray-500 ml-2">📌 Obligatorio</span>
                </label>
                <select
                  required
                  value={formData.centroCosto}
                  onChange={(e) => setFormData({...formData, centroCosto: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white font-semibold"
                >
                  <option value="">Seleccione centro...</option>
                  {CENTROS_COSTO.map((grupo) => (
                    <optgroup key={grupo.label} label={grupo.label}>
                      {grupo.options.map((opcion) => (
                        <option key={opcion} value={opcion}>{opcion}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tipo de Costo * 
                  <span className="text-xs text-gray-500 ml-2">📊 Para análisis de costos</span>
                </label>
                <select
                  required
                  value={formData.tipoCosto}
                  onChange={(e) => setFormData({...formData, tipoCosto: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white font-semibold"
                >
                  <option value="">Seleccione tipo...</option>
                  {TIPOS_COSTO.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Actividad / Uso 
                  <span className="text-xs text-gray-500 ml-2">Opcional</span>
                </label>
                <select
                  value={formData.actividadUso}
                  onChange={(e) => setFormData({...formData, actividadUso: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option value="">Seleccione actividad...</option>
                  {ACTIVIDADES_USO.map((actividad) => (
                    <option key={actividad} value={actividad}>{actividad}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Forma de Pago *</label>
                <select
                  required
                  value={formData.formaPago}
                  onChange={(e) => setFormData({...formData, formaPago: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option value="">Seleccione...</option>
                  <option value="Contado Efectivo">Contado Efectivo</option>
                  <option value="30 días">30 días</option>
                  <option value="60 días">60 días</option>
                  <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                  <option value="Caja Chica">Caja Chica</option>
                  <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Documento *</label>
                <select
                  required
                  value={formData.tipoDocumento}
                  onChange={(e) => setFormData({...formData, tipoDocumento: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option value="Factura">Factura</option>
                  <option value="Factura Exenta">Factura Exenta</option>
                  <option value="Factura Internacional">Factura Internacional</option>
                  <option value="Boleta Comercio">Boleta Comercio</option>
                  <option value="Boleta Honorarios">Boleta Honorarios</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Responsable Compra *</label>
                <input
                  type="text"
                  required
                  value={formData.responsableCompra}
                  onChange={(e) => setFormData({...formData, responsableCompra: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800">Items</h4>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBodegaModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Bodega
                </button>
                <button
                  type="button"
                  onClick={agregarItem}
                  className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold hover:bg-[#235250] transition-colors"
                >
                  + Agregar Item
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {formData.items.map((item) => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Item</label>
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => actualizarItem(item.id, 'item', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Cantidad</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.cantidad === 0 ? '' : item.cantidad}
                        onChange={(e) => actualizarItem(item.id, 'cantidad', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">V. Unitario</label>
                      <input
                        type="number"
                        min="0"
                        value={item.valorUnitario === 0 ? '' : item.valorUnitario}
                        onChange={(e) =>
                          actualizarItem(
                            item.id,
                            'valorUnitario',
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') actualizarItem(item.id, 'valorUnitario', 0);
                        }}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Descuento %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.descuento}
                        onChange={(e) => actualizarItem(item.id, 'descuento', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => eliminarItem(item.id)}
                        className="w-full px-3 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
                      <textarea
                        value={item.descripcion}
                        onChange={(e) => actualizarItem(item.id, 'descripcion', e.target.value)}
                        rows="3"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {formData.items.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  No hay items. Agrega uno para continuar.
                </div>
              )}
            </div>
          </div>

          {/* Totales */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">Subtotal:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">IVA:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.iva)}
              </span>
            </div>
            <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
              <span className="text-gray-800 font-bold text-lg">TOTAL:</span>
              <span className="text-2xl font-bold" style={{ color: '#235250' }}>
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.total)}
              </span>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-300">
              <p className="text-sm font-semibold text-gray-700">Facturar a:</p>
              <p className="text-gray-800 font-medium">Maria Paula Ross EIRL</p>
              <p className="text-gray-600">76.226.767-5</p>
            </div>
          </div>

          {/* Observaciones */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
              rows="3"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              {isSaving ? 'Creando...' : 'Crear Orden de Compra'}
            </button>
          </div>
        </form>
        {showConfirm && (
          <ConfirmDialog
            message="¿Está seguro de crear esta Orden de Compra?"
            onConfirm={handleConfirmCreate}
            onCancel={() => { setShowConfirm(false); setPendingData(null); }}
          />
        )}
      </div>
      {showBodegaModal && (
        <BodegaItemsModal
          codigoProtocolo={formData.codigoProtocolo}
          onClose={() => setShowBodegaModal(false)}
          onAgregarItems={agregarItemsDesdeBodega}
        />
      )}
    </div>
  );
};

// Modal Detalle OC
const DetalleOCModal = ({ orden: ordenInicial, onClose, onUpdate, onSave, onSaveFactura, onSavePago, startInEdit = false }) => {
  const [orden, setOrden] = useState(ordenInicial);
  const [facturas, setFacturas] = useState(ordenInicial?.facturas || []);
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [isEditing, setIsEditing] = useState(startInEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const prevOrdenIdRef = useRef(ordenInicial?.id);

  const limpiarItems = (items = []) => {
    const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const normalizeNumber = (value) => {
      const num = Number(value ?? 0);
      return Number.isFinite(num) ? num : 0;
    };
    const mapa = new Map();
    (items || []).forEach((item) => {
      const nombre = normalizeText(item.item);
      const descripcion = normalizeText(item.descripcion);
      const valorUnitario = normalizeNumber(item.valorUnitario ?? item.valor_unitario);
      const cantidad = normalizeNumber(item.cantidad);
      const hasContenido = nombre.length > 0 || descripcion.length > 0 || valorUnitario > 0 || cantidad > 0;
      if (!hasContenido) return;
      const key = `${nombre.toLowerCase()}|${descripcion.toLowerCase()}|${cantidad}|${valorUnitario.toFixed(2)}`;
      mapa.set(key, { ...item, item: nombre, descripcion, cantidad, valorUnitario });
    });
    return Array.from(mapa.values());
  };

  useEffect(() => {
    if (isEditing) return;
    setOrden({
      ...ordenInicial,
      items: limpiarItems(ordenInicial.items || [])
    });
    setFacturas(ordenInicial?.facturas || []);
    if (ordenInicial?.id !== prevOrdenIdRef.current) {
      setIsEditing(startInEdit);
      prevOrdenIdRef.current = ordenInicial?.id;
    }
  }, [ordenInicial, isEditing, startInEdit]);

  useEffect(() => {
    if (startInEdit) setIsEditing(true);
  }, [startInEdit]);

  useEffect(() => {
    const loadProveedores = async () => {
      try {
        const data = await getProveedores();
        const transformados = data.map(p => ({
          id: p.id,
          razonSocial: p.razon_social,
          rut: p.rut
        }));
        setProveedores(transformados);
      } catch (error) {
        console.error('Error cargando proveedores:', error);
      }
    };
    loadProveedores();
  }, []);

  const cambiarEstado = (nuevoEstado) => {
    const estadoPago = nuevoEstado === 'Pagada' ? 'Pagada' : orden.estadoPago;
    const fechaPago = nuevoEstado === 'Pagada' ? (orden.fechaPago || new Date().toISOString().split('T')[0]) : orden.fechaPago;
    const actualizada = { ...orden, estado: nuevoEstado, estadoPago, fechaPago };
    setOrden(actualizada);
    onUpdate(actualizada);
  };

  const agregarFactura = async ({ tipoDocumento, numero, fecha, monto }) => {
    try {
      const nueva = await createOrdenCompraFactura({
        orden_id: orden.id,
        tipo_documento: tipoDocumento,
        numero,
        fecha: fecha || null,
        monto: monto || 0,
        estado_pago: 'Pendiente'
      });
      const nuevaFactura = {
        id: nueva.id,
        tipoDocumento: nueva.tipo_documento,
        numero: nueva.numero,
        fecha: nueva.fecha || '',
        monto: parseFloat(nueva.monto) || 0,
        estadoPago: nueva.estado_pago || 'Pendiente'
      };
      setFacturas(prev => [...prev, nuevaFactura]);
      if (orden.estado === 'Emitida' || orden.estado === 'Recibida') {
        const actualizada = { ...orden, estado: 'Facturada' };
        setOrden(actualizada);
        onUpdate(actualizada);
        if (onSaveFactura) onSaveFactura(actualizada);
      }
    } catch (error) {
      console.error('Error guardando factura:', error);
      alert('No se pudo guardar el documento');
    }
  };

  const eliminarFactura = async (facturaId) => {
    if (!window.confirm('¿Eliminar este documento?')) return;
    try {
      await deleteOrdenCompraFactura(facturaId);
      setFacturas(prev => prev.filter(f => f.id !== facturaId));
    } catch (error) {
      console.error('Error eliminando factura:', error);
      alert('No se pudo eliminar el documento');
    }
  };

  const toggleFacturaPagada = async (factura) => {
    const nuevoEstado = factura.estadoPago === 'Pagada' ? 'Pendiente' : 'Pagada';
    try {
      await updateOrdenCompraFactura(factura.id, { estado_pago: nuevoEstado });
      setFacturas(prev => prev.map(f => f.id === factura.id ? { ...f, estadoPago: nuevoEstado } : f));
    } catch (error) {
      console.error('Error actualizando factura:', error);
    }
  };

  const marcarPagada = () => {
    const actualizada = {
      ...orden,
      estadoPago: 'Pagada',
      estado: 'Pagada',
      fechaPago: orden.fechaPago || new Date().toISOString().split('T')[0]
    };
    setOrden(actualizada);
    onUpdate(actualizada);
    if (onSavePago) {
      onSavePago(actualizada);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const calcularSubtotalItem = (item) => {
    const cantidad = Number(item.cantidad) || 0;
    const valorUnitario = Number(item.valorUnitario) || 0;
    const subtotal = cantidad * valorUnitario;
    const descuento = subtotal * ((Number(item.descuento) || 0) / 100);
    return subtotal - descuento;
  };

  const itemsFiltrados = limpiarItems(orden.items || []);

  const totalesItems = itemsFiltrados.reduce((acc, item) => {
    const subtotalItem = calcularSubtotalItem(item);
    return {
      subtotal: acc.subtotal + subtotalItem,
      iva: acc.iva + subtotalItem * 0.19
    };
  }, { subtotal: 0, iva: 0 });
  const totalItems = totalesItems.subtotal + totalesItems.iva;
  const totales = { subtotal: totalesItems.subtotal, iva: totalesItems.iva, total: totalItems };

  const agregarItem = () => {
    const nuevo = {
      id: Date.now(),
      item: '',
      cantidad: 0,
      descripcion: '',
      valorUnitario: 0,
      descuento: 0
    };
    const actualizada = { ...orden, items: [...orden.items, nuevo] };
    setOrden(actualizada);
    // No llamar onUpdate aquí - solo actualizar estado local
  };

  const eliminarItem = (id) => {
    const actualizada = { ...orden, items: orden.items.filter(i => i.id !== id) };
    setOrden(actualizada);
    // No llamar onUpdate aquí - solo actualizar estado local
  };

  const actualizarItem = (id, campo, valor) => {
    const actualizada = {
      ...orden,
      items: orden.items.map(item =>
        item.id === id ? { ...item, [campo]: valor } : item
      )
    };
    setOrden(actualizada);
    // No llamar onUpdate aquí - solo actualizar estado local
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-3xl font-bold text-white mb-2">Orden de Compra {orden.numero}</h3>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-white text-sm">
                <div>
                  <p className="text-white/70">Proveedor:</p>
                  {isEditing ? (
                    <select
                      value={orden.proveedorId || ''}
                      onChange={(e) => {
                        const proveedorId = e.target.value || null;
                        const proveedor = proveedores.find(p => String(p.id) === String(proveedorId));
                        const actualizada = {
                          ...orden,
                          proveedorId,
                          proveedor: proveedor ? proveedor.razonSocial : orden.proveedor
                        };
                        setOrden(actualizada);
                        onUpdate(actualizada);
                      }}
                      className="w-full px-2 py-1 rounded bg-white text-gray-800"
                    >
                      <option value="">Sin proveedor</option>
                      {proveedores.map(p => (
                        <option key={p.id} value={p.id}>{p.razonSocial}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="font-semibold">{orden.proveedor}</p>
                  )}
                </div>
                <div>
                  <p className="text-white/70">Protocolo:</p>
                  {isEditing ? (
                    <input
                      type="text"
                      value={orden.codigoProtocolo || ''}
                      onChange={(e) => {
                        const actualizada = { ...orden, codigoProtocolo: e.target.value };
                        setOrden(actualizada);
                        onUpdate(actualizada);
                      }}
                      className="w-full px-2 py-1 rounded bg-white text-gray-800"
                    />
                  ) : (
                    <p className="font-semibold">{orden.codigoProtocolo || 'Sin protocolo'}</p>
                  )}
                </div>
                <div>
                  <p className="text-white/70">Tipo de Costo:</p>
                  {isEditing ? (
                    <select
                      value={orden.tipoCosto || ''}
                      onChange={(e) => {
                        const actualizada = { ...orden, tipoCosto: e.target.value };
                        setOrden(actualizada);
                        onUpdate(actualizada);
                      }}
                      className="w-full px-2 py-1 rounded bg-white text-gray-800"
                    >
                      <option value="">Seleccione tipo...</option>
                      {TIPOS_COSTO.map((tipo, index) =>
                        tipo === '---' ? (
                          <option key={`sep-${index}`} disabled>──────────────</option>
                        ) : (
                          <option key={tipo} value={tipo}>{tipo}</option>
                        )
                      )}
                    </select>
                  ) : (
                    <p className="font-semibold">{orden.tipoCosto || 'Sin asignar'}</p>
                  )}
                </div>
                <div>
                  <p className="text-white/70">Centro de Costos:</p>
                  {isEditing ? (
                    <select
                      value={orden.centroCosto || ''}
                      onChange={(e) => {
                        const actualizada = { ...orden, centroCosto: e.target.value };
                        setOrden(actualizada);
                        onUpdate(actualizada);
                      }}
                      className="w-full px-2 py-1 rounded bg-white text-gray-800"
                    >
                      <option value="">Seleccione...</option>
                      {CENTROS_COSTO.map((grupo) => (
                        <optgroup key={grupo.label} label={grupo.label}>
                          {grupo.options.map((opcion) => (
                            <option key={opcion} value={opcion}>{opcion}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <p className="font-semibold">{orden.centroCosto || 'Sin asignar'}</p>
                  )}
                </div>
                <div>
                  <p className="text-white/70">Actividad / Uso:</p>
                  {isEditing ? (
                    <select
                      value={orden.actividadUso || ''}
                      onChange={(e) => {
                        const actualizada = { ...orden, actividadUso: e.target.value };
                        setOrden(actualizada);
                        onUpdate(actualizada);
                      }}
                      className="w-full px-2 py-1 rounded bg-white text-gray-800"
                    >
                      <option value="">Seleccione...</option>
                      {ACTIVIDADES_USO.map((actividad) => (
                        <option key={actividad} value={actividad}>{actividad}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="font-semibold">{orden.actividadUso || 'Sin asignar'}</p>
                  )}
                </div>
                <div>
                  <p className="text-white/70">Fecha:</p>
                  <p className="font-semibold">{orden.fecha}</p>
                </div>
                <div>
                  <p className="text-white/70">Responsable:</p>
                  {isEditing ? (
                    <input
                      type="text"
                      value={orden.responsableCompra || ''}
                      onChange={(e) => {
                        const actualizada = { ...orden, responsableCompra: e.target.value };
                        setOrden(actualizada);
                        onUpdate(actualizada);
                      }}
                      className="w-full px-2 py-1 rounded bg-white text-gray-800"
                    />
                  ) : (
                    <p className="font-semibold">{orden.responsableCompra}</p>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-8 h-8" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setIsEditing(prev => !prev)}
              className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              {isEditing ? 'Cancelar Edición' : 'Editar'}
            </button>
            <button
              onClick={() => setShowFacturaModal(true)}
              className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              + Agregar Documento
            </button>
            <select
              value={orden.estado}
              onChange={(e) => cambiarEstado(e.target.value)}
              className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100"
              disabled={!isEditing}
            >
              <option value="Emitida">Emitida</option>
              <option value="Recibida">Recibida</option>
              <option value="Facturada">Facturada</option>
              <option value="Pagada">Pagada</option>
              <option value="Anulada">Anulada</option>
            </select>
            <button
              onClick={async () => {
                const proveedor = {
                  razon_social: orden.proveedor,
                  rut: orden.rutProveedor || '',
                  direccion: orden.direccionProveedor || '',
                  contacto: orden.contactoProveedor || ''
                };
                const protocolo = {
                  folio: orden.codigoProtocolo || ''
                };
                await generarOCPDF(orden, proveedor, protocolo, orden.items || []);
              }}
              className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100"
            >
              Generar PDF
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Items */}
          <h4 className="text-lg font-bold text-gray-800 mb-4">Detalle de Items</h4>
          <div className="mb-6">
            {isEditing && (
              <div className="flex justify-end mb-3">
                <p className="text-sm text-gray-500">En edición solo puedes ajustar: Item, Descripción y Valor Unitario.</p>
              </div>
            )}
            <div className="space-y-4">
              {orden.items.map((item, index) => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Item</label>
                      <input
                        type="text"
                        value={item.item || ''}
                        onChange={(e) => actualizarItem(item.id, 'item', e.target.value)}
                        disabled={!isEditing}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Cantidad</label>
                      <input
                        type="number"
                        min="0"
                        value={item.cantidad === 0 ? '' : item.cantidad}
                        onChange={(e) => actualizarItem(item.id, 'cantidad', e.target.value)}
                        disabled
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">V. Unitario</label>
                      <input
                        type="number"
                        min="0"
                        value={item.valorUnitario === 0 ? '' : item.valorUnitario}
                        onChange={(e) =>
                          actualizarItem(
                            item.id,
                            'valorUnitario',
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') actualizarItem(item.id, 'valorUnitario', 0);
                        }}
                        disabled={!isEditing}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Descuento %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.descuento}
                        onChange={(e) => actualizarItem(item.id, 'descuento', parseFloat(e.target.value) || 0)}
                        disabled
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] disabled:bg-gray-100"
                      />
                    </div>
                    {isEditing && (
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => eliminarItem(item.id)}
                          className="w-full px-3 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                    <div className="md:col-span-6">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
                      <input
                        type="text"
                        value={item.descripcion}
                        onChange={(e) => actualizarItem(item.id, 'descripcion', e.target.value)}
                        disabled={!isEditing}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-sm font-semibold text-gray-700">
                      Subtotal: {formatCurrency(calcularSubtotalItem(item))}
                    </span>
                  </div>
                </div>
              ))}

              {orden.items.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  No hay items. Agrega uno para continuar.
                </div>
              )}
            </div>
          </div>

          {/* Totales y Facturar a */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-xl p-6">
              <h5 className="font-semibold text-gray-800 mb-4">Totales</h5>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-bold">{formatCurrency(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA:</span>
                  <span className="font-bold">{formatCurrency(totales.iva)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-gray-300">
                  <span className="font-bold">TOTAL:</span>
                  <span className="font-bold text-xl" style={{ color: '#235250' }}>{formatCurrency(totales.total)}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-6">
              <h5 className="font-semibold text-gray-800 mb-4">Facturar a:</h5>
              <p className="font-bold text-gray-800">Maria Paula Ross EIRL</p>
              <p className="text-gray-600">RUT: 76.226.767-5</p>
              <p className="text-gray-600 mt-2">La Capitanía 80, Las Condes</p>
              <p className="text-gray-600">Santiago - Chile</p>
            </div>
          </div>

          {/* Documentos / Facturas */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-bold text-gray-800">Documentos recibidos</h4>
              <button
                onClick={() => setShowFacturaModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
              >
                + Agregar
              </button>
            </div>
            {facturas.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500 text-sm">
                Sin documentos registrados
              </div>
            ) : (
              <div className="space-y-2">
                {facturas.map(f => (
                  <div key={f.id} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{f.tipoDocumento} N° {f.numero}</p>
                      <p className="text-sm text-gray-500">{f.fecha} · {f.monto > 0 ? formatCurrency(f.monto) : 'Sin monto'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${f.estadoPago === 'Pagada' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {f.estadoPago}
                      </span>
                      <button
                        onClick={() => toggleFacturaPagada(f)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold ${f.estadoPago === 'Pagada' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-green-500 text-white hover:bg-green-600'}`}
                      >
                        {f.estadoPago === 'Pagada' ? 'Pendiente' : 'Marcar Pagada'}
                      </button>
                      <button
                        onClick={() => eliminarFactura(f.id)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
          {isEditing && (
            <button
              onClick={() => {
                if (isSaving) return;
                setShowSaveConfirm(true);
              }}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
              disabled={isSaving}
            >
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
          >
            Cerrar
          </button>
        </div>

        {showFacturaModal && (
          <FacturaModal
            totalOC={totales.total}
            onClose={() => setShowFacturaModal(false)}
            onSave={async (payload) => {
              await agregarFactura(payload);
              setShowFacturaModal(false);
            }}
          />
        )}
        {showSaveConfirm && (
          <ConfirmDialog
            message="¿Está seguro de guardar los cambios en esta Orden de Compra?"
            onConfirm={async () => {
              setShowSaveConfirm(false);
              setIsSaving(true);
              try {
                const itemsLimpios = limpiarItems(orden.items || []);
                await onSave?.({ ...orden, items: itemsLimpios, subtotal: totales.subtotal, iva: totales.iva, total: totales.total });
              } finally {
                setIsSaving(false);
              }
            }}
            onCancel={() => setShowSaveConfirm(false)}
          />
        )}
      </div>
    </div>
  );
};

// Modal Factura OC (soporta múltiples)
const FacturaModal = ({ onClose, onSave, totalOC = 0 }) => {
  const [tipoDocumento, setTipoDocumento] = useState('Factura');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState('');
  const [monto, setMonto] = useState(totalOC || '');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h4 className="text-xl font-bold text-gray-800">Agregar Documento</h4>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Documento *</label>
            <select
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              <option value="Factura">Factura</option>
              <option value="Factura Exenta">Factura Exenta</option>
              <option value="Factura Internacional">Factura Internacional</option>
              <option value="Boleta Comercio">Boleta Comercio</option>
              <option value="Boleta Honorarios">Boleta Honorarios</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">N° de Documento *</label>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              placeholder="Ej: 12345"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha de Documento *</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Monto del Documento</label>
            <input
              type="number"
              min="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              placeholder="Ej: 500000"
            />
          </div>
        </div>
        <div className="p-6 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave({ tipoDocumento, numero, fecha, monto: parseFloat(monto) || 0 })}
            className="px-4 py-2 text-white rounded-lg font-semibold"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            disabled={!numero || !fecha}
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente de Módulo de Proveedores
const ProveedoresModule = () => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [showEstadoCuentaModal, setShowEstadoCuentaModal] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar proveedores desde Supabase
  useEffect(() => {
    loadProveedores();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('proveedores-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proveedores' }, () => {
        loadProveedores();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadProveedores = async () => {
    try {
      setLoading(true);
      const [data, ordenes] = await Promise.all([
        getProveedores(),
        getOrdenesCompra()
      ]);

      const ocStatsByProveedor = new Map();
      (ordenes || []).forEach((oc) => {
        const proveedorId = oc.proveedor_id || oc.proveedorId;
        if (!proveedorId) return;
        const total = parseFloat(oc.total) || 0;
        const subtotal = parseFloat(oc.subtotal) || 0;
        const iva = parseFloat(oc.iva) || 0;
        // Usar subtotal (neto) preferentemente
        const monto = subtotal || (total / 1.19) || 0;
        const estado = oc.estado || '';
        const estadoPago = oc.estado_pago || oc.estadoPago || 'Pendiente';
        const pendiente = estado !== 'Anulada' && estadoPago !== 'Pagada';

        const current = ocStatsByProveedor.get(proveedorId) || {
          totalOC: 0,
          montoTotal: 0,
          facturasPendientes: 0,
          montoPendiente: 0
        };

        current.totalOC += 1;
        current.montoTotal += monto;
        if (pendiente) {
          current.facturasPendientes += 1;
          current.montoPendiente += monto;
        }
        ocStatsByProveedor.set(proveedorId, current);
      });
      
      const transformados = data.map(p => ({
        id: p.id,
        codigo: p.codigo,
        razonSocial: p.razon_social,
        rut: p.rut,
        giro: p.giro,
        direccion: p.direccion,
        ciudad: p.ciudad,
        comuna: p.comuna,
        pais: p.pais,
        email: p.email,
        contacto: p.contacto,
        telefono: p.telefono,
        condicionesPago: p.condiciones_pago,
        banco: p.banco,
        numeroCuenta: p.numero_cuenta,
        observaciones: p.observaciones,
        fechaCreacion: p.created_at,
        totalOC: ocStatsByProveedor.get(p.id)?.totalOC || 0,
        montoTotal: ocStatsByProveedor.get(p.id)?.montoTotal || 0,
        facturasPendientes: ocStatsByProveedor.get(p.id)?.facturasPendientes || 0,
        montoPendiente: ocStatsByProveedor.get(p.id)?.montoPendiente || 0
      }));
      
      setProveedores(transformados);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPendientes, setFilterPendientes] = useState('todos');

  const proveedoresFiltrados = proveedores.filter(proveedor => {
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = proveedor.codigo.includes(searchTerm) ||
                       proveedor.razonSocial.toLowerCase().includes(searchLower) ||
                       proveedor.rut.includes(searchTerm);
    const matchPendientes = filterPendientes === 'todos' || 
                           (filterPendientes === 'pendientes' && proveedor.facturasPendientes > 0);
    return matchSearch && matchPendientes;
  });

  const eliminarProveedor = async (id) => {
  if (confirm('¿Estás seguro de eliminar este proveedor? Esta acción no se puede deshacer.')) {
    try {
      await deleteProveedor(id);
      await loadProveedores();
      alert('Proveedor eliminado exitosamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al eliminar proveedor');
    }
  }
};

  const exportarExcel = () => {
    const headers = ['Código', 'Razón Social', 'RUT', 'Giro', 'Contacto', 'Teléfono', 'Email', 'Ciudad', 'Condiciones Pago', 'Banco', 'Cuenta', 'Total OC', 'Monto Total', 'Facturas Pendientes', 'Monto Pendiente'];
    const rows = proveedores.map(p => [
      p.codigo,
      p.razonSocial,
      p.rut,
      p.giro,
      p.contacto,
      p.telefono,
      p.email,
      `${p.ciudad}, ${p.comuna}`,
      p.condicionesPago,
      p.banco,
      p.numeroCuenta,
      p.totalOC,
      p.montoTotal,
      p.facturasPendientes,
      p.montoPendiente
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
      csvContent += row.map(cell => `"${cell || ''}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Proveedores_BuildingMe_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const stats = {
    total: proveedores.length,
    activos: proveedores.filter(p => p.totalOC > 0).length,
    conPendientes: proveedores.filter(p => p.facturasPendientes > 0).length,
    montoTotalDeuda: proveedores.reduce((sum, p) => sum + p.montoPendiente, 0),
    ultimoCodigo: proveedores.length > 0 ? Math.max(...proveedores.map(p => parseInt(p.codigo))) : 1000
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Proveedores</h2>
          <p className="text-gray-600">Gestión completa de proveedores y estado de cuenta</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={exportarExcel}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl border-2 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            style={{ borderColor: '#45ad98', color: '#45ad98' }}
          >
            <Download className="w-5 h-5" />
            <span>Exportar Excel</span>
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
          >
            <Building2 className="w-5 h-5" />
            <span>Nuevo Proveedor</span>
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow">
          <p className="text-sm text-gray-500 mb-1">Total Proveedores</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow">
          <p className="text-sm text-green-600 mb-1">Activos (con OC)</p>
          <p className="text-2xl font-bold text-green-800">{stats.activos}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 shadow">
          <p className="text-sm text-red-600 mb-1">Con Pagos Pendientes</p>
          <p className="text-2xl font-bold text-red-800">{stats.conPendientes}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 shadow">
          <p className="text-sm text-purple-600 mb-1">Deuda Total</p>
          <p className="text-lg font-bold text-purple-800">{formatCurrency(stats.montoTotalDeuda)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow">
          <p className="text-sm text-blue-600 mb-1">Último Código</p>
          <p className="text-2xl font-bold text-blue-800">{stats.ultimoCodigo}</p>
        </div>
      </div>

      {/* Búsqueda y Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por código, razón social o RUT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <select
            value={filterPendientes}
            onChange={(e) => setFilterPendientes(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
          >
            <option value="todos">Todos los proveedores</option>
            <option value="pendientes">Solo con pagos pendientes</option>
          </select>
        </div>
      </div>

      {/* Listado de Proveedores */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#45ad98' }}>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Código</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Razón Social</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">RUT</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Contacto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Total OC</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Monto Total</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Pendiente</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : proveedoresFiltrados.map((proveedor) => (
                <tr key={proveedor.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-lg" style={{ color: '#235250' }}>{proveedor.codigo}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-gray-800">{proveedor.razonSocial}</p>
                      <p className="text-sm text-gray-500">{proveedor.giro}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{proveedor.rut}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-800">{proveedor.contacto}</p>
                      <p className="text-sm text-gray-500">{proveedor.telefono}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-semibold">
                      {proveedor.totalOC}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(proveedor.montoTotal)}</td>
                  <td className="px-6 py-4">
                    {proveedor.facturasPendientes > 0 ? (
                      <div>
                        <p className="font-bold text-red-600">{formatCurrency(proveedor.montoPendiente)}</p>
                        <p className="text-xs text-red-500">{proveedor.facturasPendientes} facturas</p>
                      </div>
                    ) : (
                      <span className="text-green-600 font-semibold">✓ Al día</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setProveedorSeleccionado(proveedor);
                          setShowHistorialModal(true);
                        }}
                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                        title="Ver Historial OC"
                      >
                        <FileText className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => {
                          setProveedorSeleccionado(proveedor);
                          setShowEstadoCuentaModal(true);
                        }}
                        className="p-2 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                        title="Estado de Cuenta"
                      >
                        <DollarSign className="w-4 h-4 text-purple-600" />
                      </button>
                      <button
                        onClick={() => {
                          setProveedorSeleccionado(proveedor);
                          setShowEditModal(true);
                        }}
                        className="p-2 bg-yellow-100 hover:bg-yellow-200 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Building2 className="w-4 h-4 text-yellow-600" />
                      </button>
                      <button
                        onClick={() => eliminarProveedor(proveedor.id)}
                        className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && proveedoresFiltrados.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500">No se encontraron proveedores</p>
          </div>
        )}
      </div>

      {/* Modales */}
      {showNewModal && (
        <NuevoProveedorModal 
          onClose={() => setShowNewModal(false)}
          onSave={async (nuevoProveedor) => {
            try {
              const proveedoresExistentes = await getProveedores();
              const ultimoCodigo = proveedoresExistentes.length > 0
                ? Math.max(...proveedoresExistentes.map(p => parseInt(p.codigo) || 1000))
                : 999;

              const proveedorData = {
                codigo: `${ultimoCodigo + 1}`,
                razon_social: nuevoProveedor.razonSocial,
                rut: nuevoProveedor.rut,
                giro: nuevoProveedor.giro,
                direccion: nuevoProveedor.direccion,
                ciudad: nuevoProveedor.ciudad,
                comuna: nuevoProveedor.comuna,
                pais: nuevoProveedor.pais,
                email: nuevoProveedor.email,
                contacto: nuevoProveedor.contacto,
                telefono: nuevoProveedor.telefono,
                condiciones_pago: nuevoProveedor.condicionesPago,
                banco: nuevoProveedor.banco,
                numero_cuenta: nuevoProveedor.numeroCuenta,
                observaciones: nuevoProveedor.observaciones || ''
              };

              await createProveedor(proveedorData);
              await loadProveedores();

              setShowNewModal(false);
              alert('Proveedor creado exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al crear proveedor');
            }
          }}
        />
      )}

      {showEditModal && proveedorSeleccionado && (
        <EditarProveedorModal 
          proveedor={proveedorSeleccionado}
          onClose={() => {
            setShowEditModal(false);
            setProveedorSeleccionado(null);
          }}
          onSave={async (proveedorActualizado) => {
            try {
              const proveedorData = {
                razon_social: proveedorActualizado.razonSocial,
                rut: proveedorActualizado.rut,
                giro: proveedorActualizado.giro,
                direccion: proveedorActualizado.direccion,
                ciudad: proveedorActualizado.ciudad,
                comuna: proveedorActualizado.comuna,
                pais: proveedorActualizado.pais,
                email: proveedorActualizado.email,
                contacto: proveedorActualizado.contacto,
                telefono: proveedorActualizado.telefono,
                condiciones_pago: proveedorActualizado.condicionesPago,
                banco: proveedorActualizado.banco,
                numero_cuenta: proveedorActualizado.numeroCuenta,
                observaciones: proveedorActualizado.observaciones || ''
              };

              await updateProveedor(proveedorActualizado.id, proveedorData);
              await loadProveedores();

              setShowEditModal(false);
              setProveedorSeleccionado(null);
              alert('Proveedor actualizado exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al actualizar proveedor');
            }
          }}
        />
      )}

      {showHistorialModal && proveedorSeleccionado && (
        <HistorialProveedorModal 
          proveedor={proveedorSeleccionado}
          onClose={() => {
            setShowHistorialModal(false);
            setProveedorSeleccionado(null);
          }}
        />
      )}

      {showEstadoCuentaModal && proveedorSeleccionado && (
        <EstadoCuentaModal 
          proveedor={proveedorSeleccionado}
          onClose={() => {
            setShowEstadoCuentaModal(false);
            setProveedorSeleccionado(null);
          }}
        />
      )}
    </div>
  );
};

// Modal Nuevo Proveedor
const NuevoProveedorModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    razonSocial: '',
    rut: '',
    giro: '',
    direccion: '',
    ciudad: '',
    comuna: '',
    pais: 'Chile',
    email: '',
    contacto: '',
    telefono: '',
    condicionesPago: '',
    banco: '',
    numeroCuenta: '',
    observaciones: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Nuevo Proveedor</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Información Básica */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Información Básica</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={formData.razonSocial}
                  onChange={(e) => setFormData({...formData, razonSocial: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT *</label>
                <input
                  type="text"
                  required
                  value={formData.rut}
                  onChange={(e) => setFormData({...formData, rut: formatRutInput(e.target.value)})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="12.345.678-9"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Giro/Rubro *</label>
                <input
                  type="text"
                  required
                  value={formData.giro}
                  onChange={(e) => setFormData({...formData, giro: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Ubicación */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Ubicación</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({...formData, direccion: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ciudad *</label>
                <input
                  type="text"
                  required
                  value={formData.ciudad}
                  onChange={(e) => setFormData({...formData, ciudad: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Comuna *</label>
                <input
                  type="text"
                  required
                  value={formData.comuna}
                  onChange={(e) => setFormData({...formData, comuna: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">País *</label>
                <input
                  type="text"
                  required
                  value={formData.pais}
                  onChange={(e) => setFormData({...formData, pais: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Contacto</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Persona de Contacto *</label>
                <input
                  type="text"
                  required
                  value={formData.contacto}
                  onChange={(e) => setFormData({...formData, contacto: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="+56 2 1234 5678"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="contacto@proveedor.cl"
                />
              </div>
            </div>
          </div>

          {/* Datos Financieros */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Datos Financieros</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Condiciones de Pago</label>
                <input
                  type="text"
                  value={formData.condicionesPago}
                  onChange={(e) => setFormData({...formData, condicionesPago: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="Ej: 30 días, 60 días, contado"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Banco</label>
                <input
                  type="text"
                  value={formData.banco}
                  onChange={(e) => setFormData({...formData, banco: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Número de Cuenta</label>
                <input
                  type="text"
                  value={formData.numeroCuenta}
                  onChange={(e) => setFormData({...formData, numeroCuenta: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
              rows="3"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              placeholder="Notas adicionales sobre el proveedor..."
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Crear Proveedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal Editar Proveedor (similar estructura a crear)
const EditarProveedorModal = ({ proveedor, onClose, onSave }) => {
  const [formData, setFormData] = useState(proveedor);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">Editar Proveedor</h3>
              <p className="text-white/80 text-sm">Código: {proveedor.codigo}</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Formulario similar a NuevoProveedorModal */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Información Básica</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={formData.razonSocial}
                  onChange={(e) => setFormData({...formData, razonSocial: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT *</label>
                <input
                  type="text"
                  required
                  value={formData.rut}
                  onChange={(e) => setFormData({...formData, rut: formatRutInput(e.target.value)})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Giro *</label>
                <input
                  type="text"
                  required
                  value={formData.giro}
                  onChange={(e) => setFormData({...formData, giro: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal Historial Proveedor
const HistorialProveedorModal = ({ proveedor, onClose }) => {
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistorial = async () => {
      try {
        setLoading(true);
        const [data, protocolos] = await Promise.all([
          getOrdenesCompra(),
          getProtocolos()
        ]);
        const protocolosByFolio = new Map(
          (protocolos || []).map(p => [String(p.folio), p])
        );
        const filtradas = data
          .filter(oc => String(oc.proveedor_id) === String(proveedor.id))
          .map(oc => ({
            id: oc.id,
            numero: oc.numero,
            protocolo: oc.codigo_protocolo || '',
            nombreProyecto: protocolosByFolio.get(String(oc.codigo_protocolo || ''))?.nombre_proyecto || '',
            fecha: oc.fecha,
            monto: parseFloat(oc.total) || 0,
            factura: oc.numero_factura || '',
            estado: oc.estado || 'Pendiente',
            estadoPago: oc.estado_pago || 'Pendiente',
            fechaPago: oc.fecha_pago || ''
          }));
        setOrdenesCompra(filtradas);
      } catch (error) {
        console.error('Error cargando historial de OC:', error);
        setOrdenesCompra([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistorial();
  }, [proveedor.id]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">Historial de Órdenes de Compra</h3>
              <p className="text-white/80">{proveedor.razonSocial} - Código: {proveedor.codigo}</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Cargando historial...</p>
            </div>
          ) : ordenesCompra.length > 0 ? (
            <div className="space-y-4">
              {ordenesCompra.map((oc) => (
                <div key={oc.numero} className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-lg" style={{ color: '#235250' }}>
                        OC #{oc.numero}
                      </p>
                      <p className="text-sm text-gray-600">
                        Protocolo: {oc.protocolo || 'Sin protocolo'} | {oc.fecha}
                      </p>
                      <p className="text-sm text-gray-500">
                        Proyecto: {oc.nombreProyecto || 'Sin nombre de proyecto'}
                      </p>
                      {oc.factura && (
                        <p className="text-sm text-green-600 mt-1">
                          Factura: {oc.factura}
                        </p>
                      )}
                      {oc.fechaPago && (
                        <p className="text-xs text-gray-500 mt-1">
                          Pagada: {oc.fechaPago}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl text-gray-800">{formatCurrency(oc.monto)}</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-1 ${
                        oc.estadoPago === 'Pagada' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {oc.estadoPago}
                      </span>
                      {oc.estadoPago !== 'Pagada' && oc.estado !== 'Anulada' && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const fechaPago = new Date().toISOString().split('T')[0];
                              await updateOrdenCompra(oc.id, {
                                estado: 'Pagada',
                                estado_pago: 'Pagada',
                                fecha_pago: fechaPago
                              });
                              setOrdenesCompra(prev =>
                                prev.map(item =>
                                  item.id === oc.id
                                    ? { ...item, estado: 'Pagada', estadoPago: 'Pagada', fechaPago }
                                    : item
                                )
                              );
                              alert('OC marcada como pagada.');
                            } catch (error) {
                              console.error('Error marcando OC como pagada:', error);
                              alert('No se pudo marcar la OC como pagada.');
                            }
                          }}
                          className="mt-3 px-3 py-1 rounded-lg text-xs font-semibold text-white"
                          style={{ background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)' }}
                        >
                          Marcar como Pagada
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Este proveedor aún no tiene órdenes de compra</p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Modal Estado de Cuenta
const EstadoCuentaModal = ({ proveedor, onClose }) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">Estado de Cuenta</h3>
              <p className="text-white/80">{proveedor.razonSocial}</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-xl">
              <p className="text-sm text-blue-600 mb-1">Total Órdenes de Compra</p>
              <p className="text-2xl font-bold text-blue-800">{proveedor.totalOC}</p>
            </div>

            <div className="bg-green-50 p-4 rounded-xl">
              <p className="text-sm text-green-600 mb-1">Monto Total Histórico</p>
              <p className="text-2xl font-bold text-green-800">{formatCurrency(proveedor.montoTotal)}</p>
            </div>

            <div className="bg-red-50 p-4 rounded-xl">
              <p className="text-sm text-red-600 mb-1">Facturas Pendientes</p>
              <p className="text-2xl font-bold text-red-800">{proveedor.facturasPendientes}</p>
            </div>

            <div className="bg-purple-50 p-4 rounded-xl">
              <p className="text-sm text-purple-600 mb-1">Monto Pendiente de Pago</p>
              <p className="text-3xl font-bold text-purple-800">{formatCurrency(proveedor.montoPendiente)}</p>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-800 mb-2">Información de Pago</h4>
              <div className="space-y-2 text-sm">
                <p className="text-gray-600">
                  <span className="font-semibold">Condiciones:</span> {proveedor.condicionesPago || 'No especificado'}
                </p>
                <p className="text-gray-600">
                  <span className="font-semibold">Banco:</span> {proveedor.banco || 'No especificado'}
                </p>
                <p className="text-gray-600">
                  <span className="font-semibold">Cuenta:</span> {proveedor.numeroCuenta || 'No especificado'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Modal Seleccionar Cotización Ganada
const ModalSeleccionarCotizacion = ({ cotizaciones, onClose, onSeleccionar }) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Seleccionar Cotización Ganada</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {cotizaciones.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg font-semibold">No hay cotizaciones ganadas disponibles</p>
              <p className="text-gray-400 text-sm mt-2">Las cotizaciones ya adjudicadas no aparecen aquí</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cotizaciones.map(cotizacion => (
                <div 
                  key={cotizacion.id}
                  className="border-2 border-gray-200 rounded-xl p-6 hover:border-[#45ad98] hover:shadow-lg transition-all cursor-pointer"
                  onClick={() => onSeleccionar(cotizacion)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className="font-mono font-bold text-2xl" style={{ color: '#235250' }}>
                          #{cotizacion.numero}
                        </span>
                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                          ✓ Ganada
                        </span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                          {cotizacion.unidadNegocio}
                        </span>
                      </div>
                      <p className="font-bold text-gray-800 text-xl mb-1">{cotizacion.nombreProyecto || 'Sin nombre de proyecto'}</p>
                      <p className="text-gray-600 mb-1">{cotizacion.cliente}</p>
                      <p className="text-gray-500 text-sm mb-3">{cotizacion.rutCliente}</p>
                      <div className="flex items-center space-x-6 text-sm text-gray-600">
                        <span>📅 {cotizacion.fecha}</span>
                        <span>👤 {cotizacion.contacto}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500 mb-1">Monto Total</p>
                      <p className="text-3xl font-bold" style={{ color: '#235250' }}>
                        {formatCurrency(cotizacion.total)}
                      </p>
                      <div className="mt-3 px-6 py-2 bg-[#45ad98] text-white rounded-lg font-semibold text-center">
                        Seleccionar →
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DropdownMensajesNoLeidos = ({
  visible,
  items = [],
  loading = false,
  title = 'Mensajes sin leer',
  subtitle = 'Selecciona el elemento que quieres responder',
  prefix = 'PT-',
  entitySingular = 'protocolo',
  onClose,
  onSeleccionar
}) => {
  if (!visible) return null;

  const formatFechaHora = (value) => {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return date.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="absolute top-full left-0 mt-3 w-[430px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden z-[80]">
      <div className="p-4 border-b" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-xs text-white/80 mt-1">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-3 overflow-y-auto max-h-[420px] space-y-3 bg-gray-50/60">
        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#45ad98] mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Cargando mensajes pendientes...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay mensajes sin leer.</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSeleccionar(item)}
              className="w-full text-left border border-gray-200 rounded-2xl p-4 hover:border-[#45ad98] hover:shadow-md transition-all bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-mono font-bold text-base text-[#235250]">{prefix}{item.numero ?? item.folio ?? ''}</span>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800">
                      {item.unreadCount} sin leer
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.nombreProyecto || 'Sin nombre de proyecto'}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.cliente || item.clienteNombre || `Sin ${entitySingular}`}</p>
                  <div className="mt-2 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-600 mb-1">
                      {item.lastMessageUser || 'Usuario'} · {formatFechaHora(item.lastMessageAt)}
                    </p>
                    <p className="text-xs text-gray-700 line-clamp-2">
                      {item.lastMessageText || 'Sin vista previa del mensaje'}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pt-1">
                  <span className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold text-white shadow-md"
                    style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
                    Abrir
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

// Componente de Módulo de Protocolos de Compra
// ========================================
// MÓDULO DE PROTOCOLOS - VERSIÓN COMPLETA
// Reemplaza el ProtocolosModule existente
// ========================================

const ProtocolosModule = ({
  sharedProtocolos = [],
  setSharedProtocolos = () => {},
  sharedOrdenesCompra = [],
  setSharedOrdenesCompra = () => {},
  sharedCotizaciones = [],
  chatReadState = {},
  setChatReadState = () => {},
  protocoloParaAbrir,
  onAdjudicarCompra,
  onAdjudicarVentaDesdeCotizacion,
  onLimpiarProtocoloParaAbrir,
  currentUserName,
  user
}) => {
  const [vistaActual, setVistaActual] = useState('listado'); // 'listado' o 'detalle'
  const [protocoloSeleccionado, setProtocoloSeleccionado] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [mostrarFormularioOC, setMostrarFormularioOC] = useState(false);
  const [datosPreOC, setDatosPreOC] = useState(null);
  const [showDetalleOC, setShowDetalleOC] = useState(false);
  const [ordenDetalle, setOrdenDetalle] = useState(null);
  const [detalleEditMode, setDetalleEditMode] = useState(false);
  const [confirmDeleteProt, setConfirmDeleteProt] = useState(null);
  const protocolosRef = useRef([]);
  const vistaActualRef = useRef('listado');
  const protocoloSeleccionadoRef = useRef(null);

  const userEmail = String(user?.email || '').toLowerCase();
  const canEditDeleteProtocolos = !['comercial', 'diseno'].includes(user?.role);
  const canManageProtocoloCore = ['admin', 'comercial', 'compras'].includes(
    String(user?.role || '').toLowerCase()
  );
  const hideFinancials =
    user?.role === 'diseno' || (
      user?.role === 'compras' &&
      (userEmail.includes('eyzaguirre') || userEmail.includes('jeyzaguirre') || userEmail.includes('jyzaguirre'))
    );
  
  // Cargar protocolos desde Supabase
  const [protocolos, setProtocolos] = useState([]);
  const [loading, setLoading] = useState(true);
  const processedChatMessageIdsRef = useRef(new Set());
  const chatLastSyncAtRef = useRef(null);

  useEffect(() => {
    protocolosRef.current = protocolos;
  }, [protocolos]);

  useEffect(() => {
    vistaActualRef.current = vistaActual;
  }, [vistaActual]);

  useEffect(() => {
    protocoloSeleccionadoRef.current = protocoloSeleccionado;
  }, [protocoloSeleccionado]);

  const markProtocoloChatAsRead = (protocoloId, totalCount = 0) => {
    if (!protocoloId) return;
    setChatReadState((prev) => ({
      ...prev,
      [protocoloId]: {
        readCount: Math.max(0, Number(totalCount) || 0),
        readAt: new Date().toISOString()
      }
    }));
  };

  const registerProcessedChatMessage = (messageId) => {
    if (!messageId) return false;
    const ids = processedChatMessageIdsRef.current;
    if (ids.has(messageId)) return true;
    ids.add(messageId);
    if (ids.size > 1500) {
      const keep = Array.from(ids).slice(-800);
      processedChatMessageIdsRef.current = new Set(keep);
    }
    return false;
  };

  const updateChatSyncTimestamp = (isoDate) => {
    if (!isoDate) return;
    const next = new Date(isoDate).getTime();
    if (Number.isNaN(next)) return;
    const prev = chatLastSyncAtRef.current ? new Date(chatLastSyncAtRef.current).getTime() : null;
    if (!prev || next > prev) {
      chatLastSyncAtRef.current = isoDate;
    }
  };

  const handleIncomingChatMessage = (mensaje, { notify = false } = {}) => {
    if (!mensaje) return;
    const protocoloId = mensaje.protocolo_id;
    if (!protocoloId) return;
    if (registerProcessedChatMessage(mensaje.id)) return;

    const lastMessageAt = mensaje.created_at || new Date().toISOString();
    updateChatSyncTimestamp(lastMessageAt);

    const protocoloActual = protocolosRef.current.find((p) => p.id === protocoloId);
    const totalPrevio = protocoloActual?.chatMessagesCount || 0;
    const totalSiguiente = totalPrevio + 1;

    setProtocolos((prev) =>
      prev.map((p) =>
        p.id === protocoloId
          ? { ...p, chatMessagesCount: (p.chatMessagesCount || 0) + 1, chatLastMessageAt: lastMessageAt }
          : p
      )
    );

    setProtocoloSeleccionado((prev) =>
      prev && prev.id === protocoloId
        ? { ...prev, chatMessagesCount: (prev.chatMessagesCount || 0) + 1, chatLastMessageAt: lastMessageAt }
        : prev
    );

    const isOwnMessage = (
      (user?.id && mensaje.user_id && String(user.id) === String(mensaje.user_id)) ||
      (user?.email && mensaje.user_email && String(user.email).toLowerCase() === String(mensaje.user_email).toLowerCase())
    );
    const isViewingThisProtocol =
      vistaActualRef.current === 'detalle' &&
      protocoloSeleccionadoRef.current?.id === protocoloId;

    if (isOwnMessage || isViewingThisProtocol) {
      markProtocoloChatAsRead(protocoloId, totalSiguiente);
    }

    if (isOwnMessage || !notify) return;

    const protocoloNotificado = protocolosRef.current.find((p) => p.id === protocoloId);
    const nombreProyecto = protocoloNotificado?.nombreProyecto || `PT-${protocoloNotificado?.folio || ''}`;
    notifyToast(`Nuevo mensaje en ${nombreProyecto || 'proyecto'}`, 'success');
    playNotificationSound();
  };

  const normalizarFacturaProtocolo = (factura) => ({
    id: factura.id,
    protocoloId: factura.protocolo_id,
    numero: factura.numero || '',
    fecha: factura.fecha || '',
    montoNeto: parseFloat(factura.monto_neto) || 0,
    iva: parseFloat(factura.iva) || 0,
    total: parseFloat(factura.total) || 0,
    tipoDoc: factura.tipo_doc || 'Factura',
    estado: factura.estado || 'Emitida',
    docUrl: factura.doc_url || '',
    createdAt: factura.created_at || ''
  });

  useEffect(() => {
    loadProtocolos();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('protocolos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'protocolos' }, () => {
        loadProtocolos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'protocolos_facturas' }, () => {
        loadProtocolos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'protocolos_items' }, () => {
        loadProtocolos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra_facturas' }, () => {
        refrescarOrdenesCompra();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('protocolos-chat-notify')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'protocolos_chat_mensajes'
        },
        (payload) => {
          handleIncomingChatMessage(payload.new || {}, { notify: false });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime de chat con problemas, activando fallback por polling.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    let cancelled = false;

    const pollChatMessages = async () => {
      if (cancelled) return;
      const since = chatLastSyncAtRef.current;
      if (!since) return;

      const { data, error } = await supabase
        .from('protocolos_chat_mensajes')
        .select('id, protocolo_id, user_id, user_name, user_email, created_at')
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        if (error.code !== '42P01') {
          console.error('Error en fallback polling de chat:', error);
        }
        return;
      }

      if (!Array.isArray(data) || data.length === 0) return;

      data.forEach((mensaje) => {
        handleIncomingChatMessage(mensaje, { notify: false });
      });
    };

    const intervalId = setInterval(pollChatMessages, 5000);
    pollChatMessages();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [user?.id, user?.email]);

  const calcularNetoCotizacion = (cot) => {
    // Si ya tiene neto, usarlo directamente
    if (cot?.neto !== undefined && cot?.neto !== null) {
      return parseFloat(cot.neto);
    }
    // Si tiene items, calcular desde items
    const items = cot?.items || [];
    if (items.length > 0) {
      return items.reduce((sum, item) => {
        const cantidad = item.cantidad || 0;
        const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
        const descuento = item.descuento || 0;
        const subtotal = cantidad * valorUnitario;
        return sum + (subtotal - (subtotal * (descuento / 100)));
      }, 0);
    }
    // Fallback: asumir que monto es neto (datos antiguos)
    if (!cot?.monto) return 0;
    return parseFloat(cot.monto);
  };

  useEffect(() => {
    if (sharedCotizaciones.length === 0) return;
    const cotizacionesByNumero = new Map(
      sharedCotizaciones.map(c => [normalizarNumero(c.numero), c])
    );
    const cotizacionesByFolio = new Map(
      sharedCotizaciones
        .filter(c => c.adjudicada_a_protocolo)
        .map(c => [String(c.adjudicada_a_protocolo), c])
    );
    setProtocolos(prev =>
      prev.map(p => {
        const cotizacion =
          cotizacionesByFolio.get(String(p.folio)) ??
          cotizacionesByNumero.get(normalizarNumero(p.numeroCotizacion));
        const netoCotizacion = cotizacion ? calcularNetoCotizacion(cotizacion) : undefined;
        const netoPreferente =
          Number.isFinite(p.montoNeto) ? p.montoNeto : (netoCotizacion ?? p.montoNetoCotizacion);
        return ({
          ...p,
          items: p.items && p.items.length ? p.items : (cotizacion?.items || []),
          montoNetoCotizacion: netoPreferente
        });
      })
    );
  }, [sharedCotizaciones]);

  useEffect(() => {
    if (vistaActual !== 'detalle') return;
    setProtocoloSeleccionado(prev => {
      if (!prev) return prev;
      const nextItems = obtenerItemsProtocolo(prev);
      const prevItems = prev.items || [];
      const sameItems = prevItems.length === nextItems.length && prevItems.every((item, index) => {
        const next = nextItems[index] || {};
        const prevValor = item.valorUnitario ?? item.valor_unitario ?? 0;
        const nextValor = next.valorUnitario ?? next.valor_unitario ?? 0;
        return (item.item || '') === (next.item || '') &&
          (item.descripcion || '') === (next.descripcion || '') &&
          (item.cantidad || 0) === (next.cantidad || 0) &&
          (item.descuento || 0) === (next.descuento || 0) &&
          prevValor === nextValor;
      });
      if (sameItems) return prev;
      return { ...prev, items: nextItems };
    });
  }, [sharedCotizaciones, vistaActual]);

  const loadProtocolos = async () => {
    try {
      setLoading(true);
      const [data, cotizacionesData] = await Promise.all([
        getProtocolos(),
        getCotizaciones()
      ]);
      const protocolosIds = data.map(p => p.id).filter(Boolean);
      const facturasData = protocolosIds.length > 0
        ? await getProtocolosFacturas(protocolosIds)
        : [];
      const facturasByProtocolo = facturasData.reduce((acc, factura) => {
        const key = factura.protocolo_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(normalizarFacturaProtocolo(factura));
        return acc;
      }, {});
      const chatStatsByProtocolo = {};
      if (protocolosIds.length > 0) {
        const { data: chatData, error: chatError } = await supabase
          .from('protocolos_chat_mensajes')
          .select('protocolo_id, created_at')
          .in('protocolo_id', protocolosIds);

        if (!chatError && Array.isArray(chatData)) {
          chatData.forEach((row) => {
            if (!row?.protocolo_id) return;
            const prev = chatStatsByProtocolo[row.protocolo_id] || { count: 0, lastMessageAt: null };
            const nextLast =
              !prev.lastMessageAt || (row.created_at && new Date(row.created_at) > new Date(prev.lastMessageAt))
                ? row.created_at
                : prev.lastMessageAt;
            chatStatsByProtocolo[row.protocolo_id] = {
              count: prev.count + 1,
              lastMessageAt: nextLast
            };
          });
        } else if (chatError && chatError.code !== '42P01') {
          console.error('Error cargando conteo de chat de protocolos:', chatError);
        }
      }
      
      const cotizacionesByNumero = new Map(
        (cotizacionesData || []).map((cot) => [normalizarNumero(cot.numero), cot])
      );
      const cotizacionesByFolio = new Map(
        (cotizacionesData || [])
          .filter((cot) => cot.adjudicada_a_protocolo)
          .map((cot) => [String(cot.adjudicada_a_protocolo), cot])
      );

      const transformados = data.map((p) => {
        const cotizacion =
          cotizacionesByFolio.get(String(p.folio)) ??
          cotizacionesByNumero.get(normalizarNumero(p.numero_cotizacion));
        const netoCotizacion = cotizacion ? calcularNetoCotizacion(cotizacion) : undefined;
        const netoProtocoloGuardado = parseFloat(p.monto_neto);
        const netoEfectivo = Number.isFinite(netoProtocoloGuardado)
          ? netoProtocoloGuardado
          : netoCotizacion;
        return {
          id: p.id,
          folio: p.folio,
          numeroCotizacion: p.numero_cotizacion,
          cliente: p.clientes?.razon_social || 'Sin cliente',
          nombreProyecto: p.nombre_proyecto,
          rutCliente: p.clientes?.rut || '',
          tipo: p.tipo,
          ocCliente: p.oc_cliente,
          ocClienteDocUrl: p.oc_cliente_doc_url || null,
          facturaBmDocUrl: p.factura_bm_doc_url || null,
          estado: p.estado,
          unidadNegocio: p.unidad_negocio,
          fechaCreacion: p.fecha_creacion,
          fechaInicioProduccion: p.fecha_inicio_produccion || null,
          fechaEntrega: p.fecha_entrega || null,
          montoTotal: parseFloat(p.monto_total),
          montoNeto: Number.isFinite(netoProtocoloGuardado) ? netoProtocoloGuardado : undefined,
          montoNetoCotizacion: netoEfectivo,
          items: Array.isArray(p.items) ? p.items : [],
          chatMessagesCount: chatStatsByProtocolo[p.id]?.count || 0,
          chatLastMessageAt: chatStatsByProtocolo[p.id]?.lastMessageAt || null,
          facturas: (() => {
            const facturas = facturasByProtocolo[p.id] || [];
            if (!facturas.length && (p.factura_bm || p.fecha_factura_bm)) {
              return [{
                id: `legacy-${p.id}`,
                protocoloId: p.id,
                numero: p.factura_bm || '',
                fecha: p.fecha_factura_bm || '',
                montoNeto: 0,
                iva: 0,
                total: 0,
                tipoDoc: 'Factura',
                estado: 'Emitida',
                docUrl: p.factura_bm_doc_url || '',
                createdAt: ''
              }];
            }
            return facturas;
          })()
        };
      });

      const latestChatAt = transformados.reduce((latest, protocolo) => {
        if (!protocolo.chatLastMessageAt) return latest;
        if (!latest) return protocolo.chatLastMessageAt;
        return new Date(protocolo.chatLastMessageAt) > new Date(latest) ? protocolo.chatLastMessageAt : latest;
      }, null);
      chatLastSyncAtRef.current = latestChatAt || new Date().toISOString();

      setProtocolos(transformados);
    } catch (error) {
      console.error('Error:', error);
      setProtocolos([]);
    } finally {
      setLoading(false);
    }
  };

  const obtenerItemsProtocolo = (protocolo) =>
    Array.isArray(protocolo.items) ? protocolo.items : [];

  const ordenesCompra = sharedOrdenesCompra;
  const mapOrdenCompra = (o, proveedoresById = new Map()) => ({
    id: o.id,
    numero: o.numero,
    codigoProtocolo: o.codigo_protocolo,
    fecha: o.fecha,
    proveedorId: o.proveedor_id || null,
    proveedor:
      o.proveedores?.razon_social ||
      proveedoresById.get(String(o.proveedor_id))?.razon_social ||
      'Sin proveedor',
    rutProveedor:
      o.proveedores?.rut ||
      proveedoresById.get(String(o.proveedor_id))?.rut ||
      '',
    direccionProveedor:
      o.proveedores?.direccion ||
      proveedoresById.get(String(o.proveedor_id))?.direccion ||
      '',
    contactoProveedor:
      o.proveedores?.contacto ||
      proveedoresById.get(String(o.proveedor_id))?.contacto ||
      '',
    tipoCosto: o.tipo_costo,
    centroCosto: o.centro_costo || '',
    actividadUso: o.actividad_uso || '',
    formaPago: o.forma_pago,
    subtotal: parseFloat(o.subtotal) || 0,
    iva: parseFloat(o.iva) || 0,
    total: parseFloat(o.total) || 0,
    estado: o.estado,
    numeroFactura: o.numero_factura || '',
    fechaFactura: o.fecha_factura || '',
    estadoPago: o.estado_pago || 'Pendiente',
    fechaPago: o.fecha_pago || '',
    responsableCompra: o.responsable_compra || '',
    items: (o.ordenes_compra_items || []).map(item => ({
      id: item.id,
      item: item.item || '',
      cantidad: item.cantidad,
      descripcion: item.descripcion,
      valorUnitario: parseFloat(item.valor_unitario) || 0,
      valor_unitario: parseFloat(item.valor_unitario) || 0,
      descuento: parseFloat(item.descuento || 0)
    }))
  });
  const refrescarOrdenesCompra = async () => {
    const [ordenesActualizadas, proveedoresData] = await Promise.all([
      getOrdenesCompra(),
      getProveedores()
    ]);
    const proveedoresById = new Map(
      (proveedoresData || []).map((p) => [String(p.id), p])
    );
    const ordenIds = ordenesActualizadas.map(o => o.id).filter(Boolean);
    let facturasOC = [];
    try { facturasOC = ordenIds.length > 0 ? await getOrdenCompraFacturas(ordenIds) : []; } catch (_) {}
    const facturasByOrden = facturasOC.reduce((acc, f) => {
      if (!acc[f.orden_id]) acc[f.orden_id] = [];
      acc[f.orden_id].push({ id: f.id, tipoDocumento: f.tipo_documento || 'Factura', numero: f.numero || '', fecha: f.fecha || '', monto: parseFloat(f.monto) || 0, estadoPago: f.estado_pago || 'Pendiente' });
      return acc;
    }, {});
    setSharedOrdenesCompra(ordenesActualizadas.map((o) => ({ ...mapOrdenCompra(o, proveedoresById), facturas: facturasByOrden[o.id] || [] })));
  };

  useEffect(() => {
    refrescarOrdenesCompra();
  }, []);

  useEffect(() => {
    if (!protocoloParaAbrir) return;
    const protocoloObjetivo = protocolos.find((protocolo) => {
      if (protocoloParaAbrir?.id && protocolo.id === protocoloParaAbrir.id) return true;
      if (protocoloParaAbrir?.folio && String(protocolo.folio) === String(protocoloParaAbrir.folio)) return true;
      return false;
    });
    if (!protocoloObjetivo) return;

    markProtocoloChatAsRead(protocoloObjetivo.id, protocoloObjetivo.chatMessagesCount || 0);
    setProtocoloSeleccionado({ ...protocoloObjetivo, items: obtenerItemsProtocolo(protocoloObjetivo) });
    setVistaActual('detalle');
    onLimpiarProtocoloParaAbrir?.();
  }, [protocoloParaAbrir, protocolos]);

  const handleAdjudicarCompraLocal = (protocolo) => {
    if (onAdjudicarCompra) {
      onAdjudicarCompra(protocolo);
      return;
    }

    setDatosPreOC({
      codigoProtocolo: protocolo.folio,
      fechaProtocolo: protocolo.fechaCreacion || new Date().toISOString().split('T')[0],
      unidadNegocio: protocolo.unidadNegocio,
      items: protocolo.items || []
    });
    setMostrarFormularioOC(true);
  };


  // Si está en vista detalle, mostrar protocolo completo
  if (vistaActual === 'detalle' && protocoloSeleccionado) {
    return (
      <>
        <VistaDetalleProtocolo
          protocolo={protocoloSeleccionado}
          ordenesCompra={ordenesCompra}
          currentUserName={currentUserName}
          currentUser={user}
          hideFinancials={hideFinancials}
          onVerDetalleOC={(orden, editar = false) => {
            setOrdenDetalle(orden);
            setDetalleEditMode(editar);
            setShowDetalleOC(true);
          }}
          onVolver={() => {
            setVistaActual('listado');
            setProtocoloSeleccionado(null);
          }}
          onAdjudicarCompra={() => {
            handleAdjudicarCompraLocal(protocoloSeleccionado);
          }}
          onActualizar={(protocoloActualizado) => {
            setProtocolos(prev => prev.map(p => 
              p.id === protocoloActualizado.id ? protocoloActualizado : p
            ));
            setProtocoloSeleccionado(protocoloActualizado);
            setSharedProtocolos(prev =>
              prev.map(p => (p.id === protocoloActualizado.id ? protocoloActualizado : p))
            );
          }}
          canEdit={canEditDeleteProtocolos}
          canManageCore={canManageProtocoloCore}
        />
        {showDetalleOC && ordenDetalle && (
          <DetalleOCModal
            orden={ordenDetalle}
            startInEdit={detalleEditMode}
            onClose={() => {
              setShowDetalleOC(false);
              setOrdenDetalle(null);
            }}
            onUpdate={(ordenActualizada) => {
              setSharedOrdenesCompra(prev =>
                prev.map(o => (o.id === ordenActualizada.id ? ordenActualizada : o))
              );
              setOrdenDetalle(ordenActualizada);
            }}
            onSaveFactura={async (ordenActualizada) => {
              try {
                await updateOrdenCompra(ordenActualizada.id, {
                  numero_factura: ordenActualizada.numeroFactura || '',
                  fecha_factura: ordenActualizada.fechaFactura || null,
                  estado: ordenActualizada.estado || 'Facturada',
                  estado_pago: ordenActualizada.estadoPago || 'Pendiente',
                  fecha_pago: ordenActualizada.fechaPago || null
                });
                await refrescarOrdenesCompra();
                setOrdenDetalle(ordenActualizada);
              } catch (error) {
                console.error('Error actualizando factura:', error);
                alert('Error al guardar la factura');
              }
            }}
            onSavePago={async (ordenActualizada) => {
              try {
                await updateOrdenCompra(ordenActualizada.id, {
                  estado: 'Pagada',
                  estado_pago: 'Pagada',
                  fecha_pago: ordenActualizada.fechaPago || new Date().toISOString().split('T')[0]
                });
                await refrescarOrdenesCompra();
                setOrdenDetalle(ordenActualizada);
              } catch (error) {
                console.error('Error actualizando pago:', error);
                alert('Error al marcar como pagada');
              }
            }}
              onSave={async (ordenActualizada) => {
                try {
                  const itemsLimpios = (() => {
                    const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
                    const normalizeNumber = (value) => {
                      const num = Number(value ?? 0);
                      return Number.isFinite(num) ? num : 0;
                    };
                    const mapa = new Map();
                    (ordenActualizada.items || []).forEach((item) => {
                      const nombre = normalizeText(item.item);
                      const descripcion = normalizeText(item.descripcion);
                      const valorUnitario = normalizeNumber(item.valorUnitario ?? item.valor_unitario);
                      const cantidad = normalizeNumber(item.cantidad);
                      const hasContenido = nombre.length > 0 || descripcion.length > 0 || valorUnitario > 0 || cantidad > 0;
                      if (!hasContenido) return;
                      const key = `${nombre.toLowerCase()}|${descripcion.toLowerCase()}|${cantidad}|${valorUnitario.toFixed(2)}`;
                      mapa.set(key, {
                        ...item,
                        item: nombre,
                        descripcion,
                        cantidad,
                        valorUnitario
                      });
                    });
                    return Array.from(mapa.values());
                  })();

                  const subtotal = itemsLimpios.reduce((sum, item) => {
                    const itemSubtotal = item.cantidad * item.valorUnitario;
                  const itemDescuento = itemSubtotal * (item.descuento / 100);
                  return sum + (itemSubtotal - itemDescuento);
                }, 0);
                const iva = subtotal * 0.19;
                const total = subtotal + iva;

                await updateOrdenCompra(ordenActualizada.id, {
                  proveedor_id: ordenActualizada.proveedorId || null,
                  codigo_protocolo: ordenActualizada.codigoProtocolo || '',
                  tipo_costo: ordenActualizada.tipoCosto || '',
                  centro_costo: ordenActualizada.centroCosto || '',
                  actividad_uso: ordenActualizada.actividadUso || '',
                  forma_pago: ordenActualizada.formaPago || '',
                  responsable_compra: ordenActualizada.responsableCompra || '',
                  subtotal,
                  iva,
                  total,
                  estado: ordenActualizada.estado,
                  numero_factura: ordenActualizada.numeroFactura || '',
                  fecha_factura: ordenActualizada.fechaFactura || null,
                  estado_pago: ordenActualizada.estadoPago || 'Pendiente',
                  fecha_pago: ordenActualizada.fechaPago || null
                });

                await replaceOrdenCompraItems(ordenActualizada.id, itemsLimpios);
                await refrescarOrdenesCompra();

                setShowDetalleOC(false);
                setOrdenDetalle(null);
                alert('OC actualizada exitosamente');
              } catch (error) {
                console.error('Error actualizando OC:', error);
                alert('Error al actualizar OC');
              }
            }}
          />
        )}
        {mostrarFormularioOC && datosPreOC && (
          <FormularioOCDesdeProtocolo
            datosProtocolo={datosPreOC}
            currentUserName={currentUserName}
            onClose={() => {
              setMostrarFormularioOC(false);
              setDatosPreOC(null);
            }}
            onGuardar={async (nuevaOC) => {
              try {
                const ocData = {
                  codigo_protocolo: datosPreOC.codigoProtocolo,
                  fecha: new Date().toISOString().split('T')[0],
                  proveedor_id: nuevaOC.proveedorId || null,
                  tipo_costo: nuevaOC.tipoCosto,
                  centro_costo: nuevaOC.centroCosto || '',
                  actividad_uso: nuevaOC.actividadUso || '',
                  forma_pago: nuevaOC.formaPago,
                  responsable_compra: nuevaOC.responsableCompra || '',
                  total: parseFloat(nuevaOC.total),
                  estado: 'Emitida',
                  numero_factura: '',
                  fecha_factura: null,
                  estado_pago: 'Pendiente'
                };

                await createOrdenCompra(ocData, nuevaOC.items || []);
                await refrescarOrdenesCompra();

                setMostrarFormularioOC(false);
                setDatosPreOC(null);
                alert('Orden de Compra creada exitosamente');
              } catch (error) {
                console.error('Error:', error);
                alert('Error al crear OC');
              }
            }}
          />
        )}
      </>
    );
  }

  // Vista de listado
  return (
    <>
          <VistaListadoProtocolos 
            protocolos={protocolos}
            chatReadState={chatReadState}
            hideFinancials={hideFinancials}
            loading={loading}
            canDelete={canEditDeleteProtocolos}
            onVerDetalle={(protocolo) => {
              markProtocoloChatAsRead(protocolo.id, protocolo.chatMessagesCount || 0);
              setProtocoloSeleccionado({ ...protocolo, items: obtenerItemsProtocolo(protocolo) });
              setVistaActual('detalle');
            }} 
            onNuevoProtocolo={() => setShowNewModal(true)}
            onEliminar={(protocolo) => {
              if (!canEditDeleteProtocolos) {
                alert('Este rol no puede eliminar protocolos.');
                return;
              }
              setConfirmDeleteProt(protocolo);
            }}
          />

      {/* Modal Nueva OC desde Protocolo */}
      {mostrarFormularioOC && datosPreOC && (
        <FormularioOCDesdeProtocolo
          datosProtocolo={datosPreOC}
          currentUserName={currentUserName}
          onClose={() => {
            setMostrarFormularioOC(false);
            setDatosPreOC(null);
          }}
          onGuardar={async (nuevaOC) => {
            try {
              const ocData = {
                codigo_protocolo: datosPreOC.codigoProtocolo,
                fecha: new Date().toISOString().split('T')[0],
                proveedor_id: nuevaOC.proveedorId || null,
                tipo_costo: nuevaOC.tipoCosto,
                centro_costo: nuevaOC.centroCosto || '',
                actividad_uso: nuevaOC.actividadUso || '',
                forma_pago: nuevaOC.formaPago,
                responsable_compra: nuevaOC.responsableCompra || '',
                total: parseFloat(nuevaOC.total),
                estado: 'Emitida',
                numero_factura: '',
                fecha_factura: null,
                estado_pago: 'Pendiente'
              };

              await createOrdenCompra(ocData, nuevaOC.items || []);
              await loadOrdenes();

              setMostrarFormularioOC(false);
              setDatosPreOC(null);
              alert('Orden de Compra creada exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al crear OC');
            }
          }}
        />
      )}

      {/* Modal Nuevo Protocolo */}
      {showNewModal && (
        <NuevoProtocoloModal
          onClose={() => setShowNewModal(false)}
          sharedCotizaciones={sharedCotizaciones}
          sharedProtocolos={protocolos}
          onSave={async (nuevoProtocolo) => {
            try {
              // Obtener folios existentes
              const protocolosExistentes = await getProtocolos();
              const ultimoFolio = protocolosExistentes.length > 0
                ? Math.max(...protocolosExistentes.map(p => {
                    const num = parseInt(p.folio);
                    return isNaN(num) ? 30650 : num;
                  }))
                : 30649;

              const protocoloData = {
                folio: `${ultimoFolio + 1}`,
                numero_cotizacion: nuevoProtocolo.numeroCotizacion || '',
                cliente_id: nuevoProtocolo.clienteId || null,
                nombre_proyecto: nuevoProtocolo.nombreProyecto,
                tipo: nuevoProtocolo.tipo,
                oc_cliente: '',
                estado: 'Abierto',
                unidad_negocio: nuevoProtocolo.unidadNegocio,
                fecha_creacion: new Date().toISOString().split('T')[0],
                monto_total: nuevoProtocolo.montoTotal || 0,
                items: []
              };

              await createProtocolo(protocoloData);
              await loadProtocolos();
              
              setShowNewModal(false);
              alert('Protocolo creado exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al crear protocolo');
            }
          }}
        />
      )}
      {confirmDeleteProt && (
        <ConfirmDialog
          message={`¿Está seguro de eliminar el Protocolo ${confirmDeleteProt.folio}? Esta acción no se puede deshacer.`}
          onConfirm={async () => {
            const protocolo = confirmDeleteProt;
            setConfirmDeleteProt(null);
            try {
              await deleteProtocolo(protocolo.id);
              setProtocolos(prev => prev.filter(p => p.id !== protocolo.id));
              setSharedProtocolos(prev => prev.filter(p => p.id !== protocolo.id));
            } catch (error) {
              console.error('Error:', error);
              alert('Error al eliminar protocolo');
            }
          }}
          onCancel={() => setConfirmDeleteProt(null)}
        />
      )}
    </>
  );
};

// ========================================
// VISTA LISTADO DE PROTOCOLOS
// ========================================
const VistaListadoProtocolos = ({ protocolos, chatReadState = {}, onVerDetalle, onNuevoProtocolo, onEliminar, hideFinancials = false, loading = false, canDelete = true }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [documentoModal, setDocumentoModal] = useState({
    abierto: false,
    titulo: '',
    url: ''
  });

  const abrirDocumentoModal = (titulo, url) => {
    if (!url) {
      alert('No hay documento asociado.');
      return;
    }
    setDocumentoModal({
      abierto: true,
      titulo,
      url
    });
  };

  const protocolosFiltrados = protocolos.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = p.folio.includes(searchTerm) || 
                       p.cliente.toLowerCase().includes(searchLower) ||
                       p.numeroCotizacion.includes(searchTerm) ||
                       String(p.nombreProyecto || '').toLowerCase().includes(searchLower);
    const matchEstado = filterEstado === 'todos' || p.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const getEstadoColor = (estado) => {
    switch(estado) {
      case 'Abierto': return 'bg-green-100 text-green-800';
      case 'En Proceso': return 'bg-yellow-100 text-yellow-800';
      case 'Cerrado': return 'bg-blue-100 text-blue-800';
      case 'Anulado': return 'bg-red-100 text-red-800';
      case 'Despachado Parcial': return 'bg-purple-100 text-purple-800';
      case 'Facturado': return 'bg-emerald-100 text-emerald-800';
      case 'No Facturado': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const obtenerNetoProtocolo = (protocolo) => {
    if (protocolo.montoNetoCotizacion !== undefined && protocolo.montoNetoCotizacion !== null) {
      return protocolo.montoNetoCotizacion;
    }
    const items = protocolo.items || [];
    if (items.length > 0) {
      return items.reduce((sum, item) => {
        const cantidad = item.cantidad || 0;
        const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
        const descuento = item.descuento || 0;
        const subtotal = cantidad * valorUnitario;
        return sum + (subtotal - (subtotal * (descuento / 100)));
      }, 0);
    }
    if (!protocolo.montoTotal) return 0;
    return protocolo.montoTotal;
  };

  const obtenerResumenFacturas = (facturas = []) => {
    const lista = Array.isArray(facturas) ? facturas : [];
    if (!lista.length) return null;
    const ordenadas = [...lista].sort((a, b) => {
      const fechaA = new Date(a.fecha || a.createdAt || 0).getTime();
      const fechaB = new Date(b.fecha || b.createdAt || 0).getTime();
      return fechaB - fechaA;
    });
    const ultima = ordenadas[0];
    const totalFacturado = lista.reduce((sum, fac) => sum + (fac.total || 0), 0);
    return { ultima, totalFacturado, count: lista.length };
  };

  const stats = {
    total: protocolos.length,
    abiertos: protocolos.filter(p => p.estado === 'Abierto').length,
    enProceso: protocolos.filter(p => p.estado === 'En Proceso').length,
    cerrados: protocolos.filter(p => p.estado === 'Cerrado').length,
    montoTotal: protocolos.reduce((sum, p) => sum + obtenerNetoProtocolo(p), 0)
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Protocolos de Compra</h2>
          <p className="text-gray-600">Gestión completa de proyectos y órdenes de compra</p>
        </div>
        <button
          onClick={onNuevoProtocolo}
          className="flex items-center space-x-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
        >
          <Package className="w-5 h-5" />
          <span>Adjudicar Venta</span>
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow">
          <p className="text-sm text-gray-500 mb-1">Total Protocolos</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow">
          <p className="text-sm text-green-600 mb-1">Abiertos</p>
          <p className="text-2xl font-bold text-green-800">{stats.abiertos}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 shadow">
          <p className="text-sm text-yellow-600 mb-1">En Proceso</p>
          <p className="text-2xl font-bold text-yellow-800">{stats.enProceso}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow">
          <p className="text-sm text-blue-600 mb-1">Cerrados</p>
          <p className="text-2xl font-bold text-blue-800">{stats.cerrados}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 shadow">
          <p className="text-sm text-purple-600 mb-1">Monto Total</p>
          <p className="text-lg font-bold text-purple-800">{formatCurrency(stats.montoTotal)}</p>
        </div>
      </div>

      {/* Búsqueda y Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por folio, cliente o cotización..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
          >
            <option value="todos">Todos los estados</option>
            <option value="Abierto">Abierto</option>
            <option value="En Proceso">En Proceso</option>
            <option value="Cerrado">Cerrado</option>
          </select>
        </div>
      </div>

      {/* Listado de Protocolos */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#45ad98' }}>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Folio</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">N° Cotización</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Cliente</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Nombre Proyecto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Tipo</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">OC Cliente</th>
                {!hideFinancials && (
                  <>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">Neto</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">IVA</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-white">Total</th>
                  </>
                )}
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Estado</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Facturas BM</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">No leídos</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={hideFinancials ? 9 : 12} className="px-6 py-8 text-center text-gray-500">
                    Cargando protocolos...
                  </td>
                </tr>
              ) : protocolosFiltrados.map((protocolo) => {
                const neto = obtenerNetoProtocolo(protocolo);
                const iva = neto * 0.19;
                const total = neto + iva;
                const resumenFacturas = obtenerResumenFacturas(protocolo.facturas);
                const facturaDocUrl = resumenFacturas?.ultima?.docUrl || protocolo.facturaBmDocUrl || '';
                const facturasConNumero = (protocolo.facturas || []).filter((factura) => String(factura?.numero || '').trim());
                const ocDocUrl = protocolo.ocClienteDocUrl || '';
                const readCount = chatReadState?.[protocolo.id]?.readCount || 0;
                const unreadCount = Math.max(0, (protocolo.chatMessagesCount || 0) - readCount);
                const hasUnreadMessages = unreadCount > 0;

                return (
                <tr key={protocolo.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-xl" style={{ color: '#235250' }}>{protocolo.folio}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-gray-600">#{protocolo.numeroCotizacion}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-gray-800">{protocolo.cliente}</p>
                      <p className="text-sm text-gray-500">{protocolo.rutCliente}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-700">{protocolo.nombreProyecto || 'Sin nombre'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                      {protocolo.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {protocolo.ocCliente ? (
                      ocDocUrl ? (
                        <button
                          type="button"
                          onClick={() => abrirDocumentoModal(`OC Cliente ${protocolo.ocCliente}`, ocDocUrl)}
                          className="text-[#235250] font-medium underline underline-offset-2 hover:text-[#45ad98] transition-colors"
                        >
                          {protocolo.ocCliente}
                        </button>
                      ) : (
                        <span className="text-gray-700 font-medium">{protocolo.ocCliente}</span>
                      )
                    ) : (
                      <span className="text-gray-400 text-sm">Sin OC</span>
                    )}
                  </td>
                  {!hideFinancials && (
                    <>
                      <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(neto)}</td>
                      <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(iva)}</td>
                      <td className="px-6 py-4 font-semibold text-gray-800">{formatCurrency(total)}</td>
                    </>
                  )}
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getEstadoColor(protocolo.estado)}`}>
                      {protocolo.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {resumenFacturas ? (
                      <div className="flex flex-wrap gap-1">
                        {facturasConNumero.map((factura) => (
                          factura.docUrl ? (
                            <button
                              key={factura.id}
                              type="button"
                              onClick={() => abrirDocumentoModal(`Factura BM ${factura.numero || ''}`.trim(), factura.docUrl)}
                              className="font-medium text-green-600 underline underline-offset-2 hover:text-green-700 transition-colors"
                            >
                              {factura.numero || 'Sin número'}
                            </button>
                          ) : (
                            <span key={factura.id} className="font-medium text-green-600">
                              {factura.numero || 'Sin número'}
                            </span>
                          )
                        ))}
                        {!facturasConNumero.length && (
                          facturaDocUrl ? (
                            <button
                              type="button"
                              onClick={() => abrirDocumentoModal(`Factura BM ${resumenFacturas.ultima?.numero || ''}`.trim(), facturaDocUrl)}
                              className="font-medium text-green-600 underline underline-offset-2 hover:text-green-700 transition-colors"
                            >
                              {resumenFacturas.ultima?.numero || 'Sin número'}
                            </button>
                          ) : (
                            <span className="font-medium text-green-600">{resumenFacturas.ultima?.numero || 'Sin número'}</span>
                          )
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Sin facturas</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <MessageCircle className={`w-5 h-5 ${hasUnreadMessages ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className={`text-xs font-semibold ${hasUnreadMessages ? 'text-green-700' : 'text-gray-400'}`}>
                        {unreadCount}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <button
                        onClick={() => onVerDetalle(protocolo)}
                        className="px-4 py-2 bg-[#45ad98] text-white rounded-lg hover:bg-[#235250] transition-colors font-semibold"
                      >
                        Abrir Tablero
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => onEliminar?.(protocolo)}
                          className="p-3 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                          title="Eliminar Protocolo"
                        >
                          <XCircle className="w-4 h-4 text-red-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && protocolosFiltrados.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500">No se encontraron protocolos</p>
          </div>
        )}
      </div>

      {documentoModal.abierto && (
        <DocumentoPDFModal
          titulo={documentoModal.titulo}
          url={documentoModal.url}
          onClose={() => setDocumentoModal({ abierto: false, titulo: '', url: '' })}
        />
      )}
    </div>
  );
};

// ========================================
// VISTA DETALLE DEL PROTOCOLO (PÁGINA COMPLETA)
// ========================================
const ProtocoloChatPanel = ({ protocolo, currentUserName, currentUser }) => {
  const [mensajes, setMensajes] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [loadingMensajes, setLoadingMensajes] = useState(true);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [errorChat, setErrorChat] = useState('');
  const listEndRef = useRef(null);
  const lastMessageAtRef = useRef(null);

  const protocoloId = protocolo?.id;
  const senderName = currentUserName || currentUser?.name || currentUser?.email || 'Usuario';
  const senderEmail = currentUser?.email || null;
  const senderId = currentUser?.id || null;

  const mapMensaje = (raw) => ({
    id: raw.id,
    protocoloId: raw.protocolo_id,
    texto: raw.mensaje || '',
    userId: raw.user_id || null,
    userName: raw.user_name || 'Usuario',
    userEmail: raw.user_email || null,
    createdAt: raw.created_at || null
  });

  const isOwnMessage = (mensaje) => {
    const currentName = String(senderName || '').trim().toLowerCase();
    const messageName = String(mensaje.userName || '').trim().toLowerCase();

    if (senderId && mensaje.userId) return String(senderId) === String(mensaje.userId);

    if (senderEmail && mensaje.userEmail) {
      const sameEmail = String(senderEmail).toLowerCase() === String(mensaje.userEmail).toLowerCase();
      if (!sameEmail) return false;
      if (currentName && messageName) return currentName === messageName;
      return true;
    }

    if (currentName && messageName) return currentName === messageName;
    return false;
  };

  const formatHora = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const hashString = (value) => {
    const str = String(value || '');
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const getBubbleStyle = (mensaje, own) => {
    if (own) {
      return {
        backgroundColor: 'rgba(16, 185, 129, 0.20)',
        borderColor: 'rgba(5, 150, 105, 0.45)',
        textColor: '#065f46'
      };
    }

    const palette = [
      { backgroundColor: 'rgba(251, 146, 60, 0.22)', borderColor: 'rgba(251, 146, 60, 0.40)', textColor: '#9a3412' }, // naranjo
      { backgroundColor: 'rgba(248, 113, 113, 0.22)', borderColor: 'rgba(239, 68, 68, 0.40)', textColor: '#991b1b' }, // rojo
      { backgroundColor: 'rgba(125, 211, 252, 0.28)', borderColor: 'rgba(56, 189, 248, 0.45)', textColor: '#1e3a8a' }, // celeste
      { backgroundColor: 'rgba(196, 181, 253, 0.22)', borderColor: 'rgba(139, 92, 246, 0.40)', textColor: '#5b21b6' }, // violeta
      { backgroundColor: 'rgba(244, 114, 182, 0.20)', borderColor: 'rgba(236, 72, 153, 0.40)', textColor: '#9d174d' }  // rosado
    ];

    const key = mensaje.userEmail || mensaje.userName || mensaje.userId || 'otro';
    return palette[hashString(key) % palette.length];
  };

  useEffect(() => {
    let isMounted = true;

    const loadMensajes = async () => {
      if (!protocoloId) return;
      setLoadingMensajes(true);
      setErrorChat('');
      const { data, error } = await supabase
        .from('protocolos_chat_mensajes')
        .select('*')
        .eq('protocolo_id', protocoloId)
        .order('created_at', { ascending: true });

      if (!isMounted) return;

      if (error) {
        console.error('Error cargando chat de protocolo:', error);
        setMensajes([]);
        setErrorChat('No se pudo cargar el chat. Verifica que la tabla de chat esté creada.');
      } else {
        setMensajes((data || []).map(mapMensaje));
      }
      setLoadingMensajes(false);
    };

    loadMensajes();

    return () => {
      isMounted = false;
    };
  }, [protocoloId]);

  useEffect(() => {
    if (!protocoloId) return undefined;

    const channel = supabase
      .channel(`protocolo-chat-${protocoloId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'protocolos_chat_mensajes',
          filter: `protocolo_id=eq.${protocoloId}`
        },
        (payload) => {
          const nuevo = mapMensaje(payload.new || {});
          setMensajes((prev) => {
            if (prev.some((m) => m.id === nuevo.id)) return prev;
            return [...prev, nuevo];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [protocoloId]);

  useEffect(() => {
    const lastMessage = mensajes[mensajes.length - 1];
    lastMessageAtRef.current = lastMessage?.createdAt || null;
  }, [mensajes]);

  useEffect(() => {
    if (!protocoloId) return undefined;

    let cancelled = false;

    const pollNewMessages = async () => {
      if (cancelled) return;

      let query = supabase
        .from('protocolos_chat_mensajes')
        .select('*')
        .eq('protocolo_id', protocoloId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (lastMessageAtRef.current) {
        query = query.gt('created_at', lastMessageAtRef.current);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code !== '42P01') {
          console.error('Error en polling de chat de protocolo:', error);
        }
        return;
      }

      if (!Array.isArray(data) || data.length === 0) return;

      const nuevos = data.map(mapMensaje);
      setMensajes((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const toAdd = nuevos.filter((m) => !existingIds.has(m.id));
        if (!toAdd.length) return prev;
        return [...prev, ...toAdd];
      });
    };

    const intervalId = setInterval(pollNewMessages, 4000);
    pollNewMessages();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [protocoloId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  const enviarMensaje = async () => {
    const texto = String(nuevoMensaje || '').trim();
    if (!texto || !protocoloId || enviandoMensaje) return;

    setEnviandoMensaje(true);
    setErrorChat('');

    const payload = {
      protocolo_id: protocoloId,
      mensaje: texto,
      user_id: senderId,
      user_name: senderName,
      user_email: senderEmail
    };

    const { data, error } = await supabase
      .from('protocolos_chat_mensajes')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      console.error('Error enviando mensaje de chat:', error);
      setErrorChat('No se pudo enviar el mensaje.');
    } else if (data) {
      const normalized = mapMensaje(data);
      setMensajes((prev) => {
        if (prev.some((m) => m.id === normalized.id)) return prev;
        return [...prev, normalized];
      });
      setNuevoMensaje('');
    }

    setEnviandoMensaje(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col h-[520px] xl:h-[calc(100vh-220px)]">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-800">Chat del Proyecto</h3>
        <p className="text-xs text-gray-500 mt-1 truncate">{protocolo?.nombreProyecto || `PT-${protocolo?.folio || ''}`}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/60">
        {loadingMensajes ? (
          <p className="text-sm text-gray-500">Cargando mensajes...</p>
        ) : mensajes.length === 0 ? (
          <p className="text-sm text-gray-500">No hay mensajes aún. Inicia la conversación del proyecto.</p>
        ) : (
          mensajes.map((mensaje) => {
            const own = isOwnMessage(mensaje);
            const bubbleStyle = getBubbleStyle(mensaje, own);
            return (
              <div key={mensaje.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[92%] rounded-2xl px-3 py-2 shadow-sm border"
                  style={{ backgroundColor: bubbleStyle.backgroundColor, borderColor: bubbleStyle.borderColor }}
                >
                  <p className="text-xs text-gray-500 mb-1">
                    <span className="font-semibold text-gray-700">{mensaje.userName}</span>
                    {mensaje.userEmail ? ` · ${mensaje.userEmail}` : ''}
                    {mensaje.createdAt ? ` · ${formatHora(mensaje.createdAt)}` : ''}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words" style={{ color: bubbleStyle.textColor }}>
                    {mensaje.texto}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      <div className="p-3 border-t border-gray-100 bg-white">
        <textarea
          value={nuevoMensaje}
          onChange={(e) => setNuevoMensaje(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              enviarMensaje();
            }
          }}
          rows={3}
          placeholder="Escribe un mensaje para el equipo..."
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#45ad98]"
        />
        {errorChat && <p className="text-xs text-red-600 mt-2">{errorChat}</p>}
        <button
          onClick={enviarMensaje}
          disabled={!String(nuevoMensaje || '').trim() || enviandoMensaje}
          className="mt-2 w-full px-4 py-2 rounded-xl text-white font-semibold disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
        >
          {enviandoMensaje ? 'Enviando...' : 'Enviar mensaje'}
        </button>
      </div>
    </div>
  );
};

const VistaDetalleProtocolo = ({
  protocolo,
  ordenesCompra,
  onVolver,
  onAdjudicarCompra,
  onActualizar,
  onVerDetalleOC,
  currentUserName,
  currentUser,
  hideFinancials = false,
  canEdit = true,
  canManageCore = false
}) => {
  const canEditProtocolo = !!canEdit;
  const canManageCoreActions = !!canManageCore;
  const canManageProtocoloDocs = ['admin', 'comercial', 'compras'].includes(
    String(currentUser?.role || '').toLowerCase()
  );
  const bloquearEdicionComercial = () => {
    if (!canEditProtocolo) {
      alert('Este rol no puede editar protocolos.');
      return true;
    }
    return false;
  };
  const bloquearGestionCore = () => {
    if (!canManageCoreActions) {
      alert('No tienes permisos para esta acción en protocolos.');
      return true;
    }
    return false;
  };
  const bloquearGestionDocumentos = () => {
    if (!canManageProtocoloDocs) {
      alert('No tienes permisos para gestionar documentos del protocolo.');
      return true;
    }
    return false;
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const itemsProtocolo = Array.isArray(protocolo.items) ? protocolo.items : [];
  const facturasProtocolo = Array.isArray(protocolo.facturas) ? protocolo.facturas : [];
  const ocVinculadas = ordenesCompra.filter(oc => oc.codigoProtocolo === protocolo.folio);
  const calcularNetoProtocolo = () => {
    // Prioridad 1: usar montoNetoCotizacion si está disponible
    if (protocolo.montoNetoCotizacion !== undefined && protocolo.montoNetoCotizacion !== null) {
      return protocolo.montoNetoCotizacion;
    }
    // Prioridad 2: calcular desde items si tienen valores
    const items = protocolo.items || [];
    if (items.length > 0) {
      const tieneValores = items.some(item => {
        const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
        return Number(valorUnitario) > 0;
      });
      if (tieneValores) {
        return items.reduce((sum, item) => {
          const cantidad = item.cantidad || 0;
          const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
          const descuento = item.descuento || 0;
          const subtotal = cantidad * valorUnitario;
          return sum + (subtotal - (subtotal * (descuento / 100)));
        }, 0);
      }
    }
    // Prioridad 3: usar montoTotal / 1.19 como estimación (NETO)
    return protocolo.montoTotal ? protocolo.montoTotal / 1.19 : 0;
  };
  const montoNeto = calcularNetoProtocolo();
  const costoRealNeto = ocVinculadas.reduce(
    (total, oc) => total + (oc.subtotal || (oc.total ? oc.total / 1.19 : 0)),
    0
  );
  const margenMontoNeto = montoNeto - costoRealNeto;
  const margenPctNeto = montoNeto ? (margenMontoNeto / montoNeto) * 100 : 0;

  const [showCerrarModal, setShowCerrarModal] = useState(false);
  const [showFacturaModal, setShowFacturaModal] = useState(false);
  const [facturaEnEdicion, setFacturaEnEdicion] = useState(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [itemEnEdicion, setItemEnEdicion] = useState(null);
  const [itemsComprados, setItemsComprados] = useState({});
  const [editingFechas, setEditingFechas] = useState(false);
  const [tempFechaInicio, setTempFechaInicio] = useState(protocolo.fechaInicioProduccion || '');
  const [tempFechaEntrega, setTempFechaEntrega] = useState(protocolo.fechaEntrega || '');
  const [uploadingDocType, setUploadingDocType] = useState('');
  const [showUploadFacturaDocModal, setShowUploadFacturaDocModal] = useState(false);
  const [documentoModal, setDocumentoModal] = useState({
    abierto: false,
    titulo: '',
    url: ''
  });
  const itemsCompradosKey = `protocolos.itemsComprados.${protocolo.id ?? protocolo.folio ?? 'default'}`;
  const itemsCompradosHydratingRef = useRef(true);
  const ocFileInputRef = useRef(null);

  const resumenFacturas = (() => {
    if (!facturasProtocolo.length) return null;
    const ordenadas = [...facturasProtocolo].sort((a, b) => {
      const fechaA = new Date(a.fecha || a.createdAt || 0).getTime();
      const fechaB = new Date(b.fecha || b.createdAt || 0).getTime();
      return fechaB - fechaA;
    });
    const ultima = ordenadas[0];
    const totalFacturado = facturasProtocolo.reduce((sum, fac) => sum + (fac.total || 0), 0);
    return { ultima, totalFacturado, count: facturasProtocolo.length };
  })();
  const estadosBase = ['Abierto', 'En Proceso', 'Cerrado'];
  const estadosSelect = estadosBase.includes(protocolo.estado)
    ? estadosBase
    : [...estadosBase, protocolo.estado];
  const facturasConNumero = facturasProtocolo.filter((factura) => String(factura?.numero || '').trim());

  const abrirDocumentoModal = (titulo, url) => {
    if (!url) {
      alert('No hay documento asociado.');
      return;
    }
    setDocumentoModal({
      abierto: true,
      titulo,
      url
    });
  };

  const subirDocumentoProtocolo = async (tipoDocumento, file, facturaObjetivo = null) => {
    if (bloquearGestionDocumentos()) return false;
    if (!file) return false;

    const isPdfByType = String(file.type || '').toLowerCase() === 'application/pdf';
    const isPdfByName = /\.pdf$/i.test(file.name || '');
    if (!isPdfByType && !isPdfByName) {
      alert('Solo se permiten archivos PDF');
      return false;
    }

    try {
      setUploadingDocType(tipoDocumento);
      const publicUrl = await uploadProtocoloDocumentoPDF({
        protocoloId: protocolo.id,
        tipo: tipoDocumento,
        file
      });

      if (tipoDocumento === 'factura') {
        const isLegacyFactura = facturaObjetivo && String(facturaObjetivo.id).startsWith('legacy-');
        if (facturaObjetivo && !isLegacyFactura) {
          await updateProtocoloFactura(facturaObjetivo.id, { doc_url: publicUrl });
          const facturasActualizadas = facturasProtocolo.map((factura) =>
            factura.id === facturaObjetivo.id ? { ...factura, docUrl: publicUrl } : factura
          );
          onActualizar({
            ...protocolo,
            facturaBmDocUrl: publicUrl,
            facturas: facturasActualizadas
          });
          alert(`Factura PDF asociada a ${facturaObjetivo.numero}`);
        } else {
          await updateProtocolo(protocolo.id, { factura_bm_doc_url: publicUrl });
          onActualizar({ ...protocolo, facturaBmDocUrl: publicUrl });
          alert('Factura PDF subida correctamente');
        }
      } else {
        await updateProtocolo(protocolo.id, { oc_cliente_doc_url: publicUrl });
        onActualizar({ ...protocolo, ocClienteDocUrl: publicUrl });
        alert('OC PDF subida correctamente');
      }
      return true;
    } catch (error) {
      console.error('Error subiendo documento de protocolo:', error);
      alert('Error al subir el documento PDF');
      return false;
    } finally {
      setUploadingDocType('');
    }
  };

  const onSubirFacturaClick = () => {
    if (bloquearGestionDocumentos()) return;
    if (!facturasConNumero.length) {
      alert('Primero agrega al menos una Factura BM con número para poder asociar el PDF.');
      return;
    }
    setShowUploadFacturaDocModal(true);
  };

  const onConfirmUploadFacturaDoc = async ({ facturaId, file }) => {
    if (bloquearGestionDocumentos()) return;
    const facturaObjetivo = facturasConNumero.find((factura) => String(factura.id) === String(facturaId));
    if (!facturaObjetivo) {
      alert('Selecciona una factura válida.');
      return;
    }
    const ok = await subirDocumentoProtocolo('factura', file, facturaObjetivo);
    if (ok) {
      setShowUploadFacturaDocModal(false);
    }
  };

  const onOcFileChange = async (event) => {
    if (bloquearGestionDocumentos()) return;
    const file = event.target?.files?.[0];
    event.target.value = '';
    await subirDocumentoProtocolo('oc', file);
  };

  const quitarDocumentoFactura = async (factura) => {
    if (bloquearEdicionComercial()) return;
    const urlDocumento = factura?.docUrl || '';
    if (!urlDocumento) {
      alert('Esta factura no tiene PDF asociado.');
      return;
    }
    if (!window.confirm('¿Quitar el PDF asociado a esta factura?')) return;

    try {
      const isLegacyFactura = String(factura.id).startsWith('legacy-');
      let facturasActualizadas = [...facturasProtocolo];
      let nuevoDocResumen = protocolo.facturaBmDocUrl || null;

      if (isLegacyFactura) {
        await updateProtocolo(protocolo.id, { factura_bm_doc_url: null });
        facturasActualizadas = facturasActualizadas.map((f) =>
          f.id === factura.id ? { ...f, docUrl: '' } : f
        );
        nuevoDocResumen = null;
      } else {
        await updateProtocoloFactura(factura.id, { doc_url: null });
        facturasActualizadas = facturasActualizadas.map((f) =>
          f.id === factura.id ? { ...f, docUrl: '' } : f
        );
        nuevoDocResumen = facturasActualizadas.find((f) => String(f.docUrl || '').trim())?.docUrl || null;
        await updateProtocolo(protocolo.id, { factura_bm_doc_url: nuevoDocResumen });
      }

      const storagePath = getProtocoloDocStoragePathFromPublicUrl(urlDocumento);
      if (storagePath) {
        const { error: removeError } = await supabase.storage
          .from(PROTOCOLO_DOCS_BUCKET)
          .remove([storagePath]);
        if (removeError) {
          console.warn('No se pudo borrar archivo de storage, se quitó solo la referencia:', removeError);
        }
      }

      onActualizar({
        ...protocolo,
        facturaBmDocUrl: nuevoDocResumen,
        facturas: facturasActualizadas
      });
      alert('PDF de factura eliminado');
    } catch (error) {
      console.error('Error quitando PDF de factura:', error);
      alert('Error al eliminar el PDF de la factura');
    }
  };

  useEffect(() => {
    try {
      itemsCompradosHydratingRef.current = true;
      const raw = localStorage.getItem(itemsCompradosKey);
      if (raw) {
        setItemsComprados(JSON.parse(raw));
      } else {
        setItemsComprados({});
      }
    } catch (error) {
      console.error('Error leyendo estado de items comprados:', error);
    }
  }, [itemsCompradosKey]);

  useEffect(() => {
    if (itemsCompradosHydratingRef.current) {
      itemsCompradosHydratingRef.current = false;
      return;
    }
    try {
      localStorage.setItem(itemsCompradosKey, JSON.stringify(itemsComprados));
    } catch (error) {
      console.error('Error guardando estado de items comprados:', error);
    }
  }, [itemsComprados, itemsCompradosKey]);

  const cambiarEstado = async (nuevoEstado) => {
    if (bloquearEdicionComercial()) return;
    if (nuevoEstado === 'Cerrado') {
      setShowCerrarModal(true);
      return;
    }
    try {
      await updateProtocolo(protocolo.id, { estado: nuevoEstado });
      onActualizar({ ...protocolo, estado: nuevoEstado });
    } catch (error) {
      console.error('Error actualizando estado de protocolo:', error);
      alert('Error al actualizar el estado');
    }
  };

  const guardarFacturaProtocolo = async (facturaData) => {
    if (bloquearGestionCore()) return;
    const neto = Number(facturaData.montoNeto) || 0;
    const iva = facturaData.iva !== '' && facturaData.iva !== null
      ? Number(facturaData.iva) || 0
      : Math.round(neto * 0.19);
    const total = facturaData.total !== '' && facturaData.total !== null
      ? Number(facturaData.total) || 0
      : neto + iva;

    const payload = {
      protocolo_id: protocolo.id,
      numero: facturaData.numero,
      fecha: facturaData.fecha || null,
      monto_neto: neto,
      iva,
      total,
      tipo_doc: facturaData.tipoDoc || 'Factura',
      estado: facturaData.estado || 'Emitida'
    };

    try {
      let facturasActualizadas = [...facturasProtocolo];
      if (facturaData.id && !String(facturaData.id).startsWith('legacy-')) {
        const actualizada = await updateProtocoloFactura(facturaData.id, payload);
        facturasActualizadas = facturasActualizadas.map(f =>
          f.id === facturaData.id
            ? {
                id: actualizada.id,
                protocoloId: actualizada.protocolo_id,
                numero: actualizada.numero,
                fecha: actualizada.fecha || '',
                montoNeto: parseFloat(actualizada.monto_neto) || 0,
                iva: parseFloat(actualizada.iva) || 0,
                total: parseFloat(actualizada.total) || 0,
                tipoDoc: actualizada.tipo_doc || 'Factura',
                estado: actualizada.estado || 'Emitida',
                docUrl: actualizada.doc_url || '',
                createdAt: actualizada.created_at || ''
              }
            : f
        );
      } else {
        const creada = await createProtocoloFactura(payload);
        facturasActualizadas = [
          {
            id: creada.id,
            protocoloId: creada.protocolo_id,
            numero: creada.numero,
            fecha: creada.fecha || '',
            montoNeto: parseFloat(creada.monto_neto) || 0,
            iva: parseFloat(creada.iva) || 0,
            total: parseFloat(creada.total) || 0,
            tipoDoc: creada.tipo_doc || 'Factura',
            estado: creada.estado || 'Emitida',
            docUrl: creada.doc_url || '',
            createdAt: creada.created_at || ''
          },
          ...facturasActualizadas
        ];
      }
      onActualizar({ ...protocolo, facturas: facturasActualizadas });
      setFacturaEnEdicion(null);
      setShowFacturaModal(false);
    } catch (error) {
      console.error('Error guardando factura del protocolo:', error);
      alert('Error al guardar la factura');
    }
  };

  const eliminarFacturaProtocolo = async (factura) => {
    if (bloquearEdicionComercial()) return;
    if (String(factura.id).startsWith('legacy-')) {
      alert('Esta factura viene del histórico. Migra los datos para poder eliminarla.');
      return;
    }
    if (!window.confirm('¿Eliminar esta factura del protocolo?')) return;
    try {
      await deleteProtocoloFactura(factura.id);
      const facturasActualizadas = facturasProtocolo.filter(f => f.id !== factura.id);
      onActualizar({ ...protocolo, facturas: facturasActualizadas });
    } catch (error) {
      console.error('Error eliminando factura del protocolo:', error);
      alert('Error al eliminar la factura');
    }
  };

  const guardarItemProtocolo = async (item) => {
    if (bloquearEdicionComercial()) return;
    const baseItems = Array.isArray(protocolo.items) ? protocolo.items : [];
    const nuevoItem = {
      id: Date.now(),
      item: item.item || '',
      descripcion: item.descripcion || '',
      cantidad: item.cantidad || 0,
      valorUnitario: item.valorUnitario || 0
    };
    const itemsActualizados = [...baseItems, nuevoItem];
    try {
      await updateProtocolo(protocolo.id, { items: itemsActualizados });
      onActualizar({ ...protocolo, items: itemsActualizados });
      setShowAddItemModal(false);
    } catch (error) {
      console.error('Error guardando item del protocolo:', error);
      alert('Error al guardar el item');
    }
  };

  const editarItemProtocolo = async (itemActualizado, itemIndex) => {
    if (bloquearEdicionComercial()) return;
    const baseItems = Array.isArray(protocolo.items) ? protocolo.items : [];
    const itemsActualizados = baseItems.map((item, index) => {
      if (itemActualizado.id != null) {
        return item.id === itemActualizado.id ? itemActualizado : item;
      }
      return index === itemIndex ? itemActualizado : item;
    });
    try {
      await updateProtocolo(protocolo.id, { items: itemsActualizados });
      onActualizar({ ...protocolo, items: itemsActualizados });
      setItemEnEdicion(null);
    } catch (error) {
      console.error('Error actualizando item del protocolo:', error);
      alert('Error al actualizar el item');
    }
  };

  const eliminarItemProtocolo = async (itemId, itemIndex) => {
    if (bloquearEdicionComercial()) return;
    if (!window.confirm('¿Eliminar este item del protocolo?')) return;
    const baseItems = Array.isArray(protocolo.items) ? protocolo.items : [];
    const itemsActualizados = baseItems.filter((item, index) => {
      if (itemId != null) {
        return item.id !== itemId;
      }
      return index !== itemIndex;
    });
    try {
      await updateProtocolo(protocolo.id, { items: itemsActualizados });
      onActualizar({ ...protocolo, items: itemsActualizados });
      setItemsComprados((prev) => {
        const next = { ...prev };
        delete next[itemId ?? itemIndex];
        return next;
      });
    } catch (error) {
      console.error('Error eliminando item del protocolo:', error);
      alert('Error al eliminar el item');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
      <div className="order-2 xl:order-2 xl:mt-14">
        <ProtocoloChatPanel
          protocolo={protocolo}
          currentUserName={currentUserName}
          currentUser={currentUser}
        />
      </div>
      <div className="order-1 xl:order-1">
      {/* Header con botón volver */}
      <div className="mb-6">
        <button
          onClick={onVolver}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-semibold">Volver al listado</span>
        </button>

        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="grid grid-cols-3 items-center mb-4">
                <h2 className="text-3xl font-bold text-gray-800">
                  Protocolo {protocolo.folio}
                </h2>
                <h3 className="text-3xl font-bold text-gray-800 text-center">
                  {protocolo.nombreProyecto || 'Sin nombre de proyecto'}
                </h3>
                <div className="flex justify-end">
                  <select
                    value={protocolo.estado}
                    onChange={(e) => cambiarEstado(e.target.value)}
                    className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] bg-white font-semibold"
                    disabled={!canEditProtocolo}
                  >
                    {estadosSelect.map((estado) => (
                      <option key={estado} value={estado}>
                        {estado === 'Abierto' && '🟢 '}
                        {estado === 'En Proceso' && '🟡 '}
                        {estado === 'Cerrado' && '✅ '}
                        {estado}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Cliente:</p>
                  <p className="font-semibold text-gray-800">{protocolo.cliente}</p>
                </div>
                <div>
                  <p className="text-gray-500">N° Cotización:</p>
                  <p className="font-semibold text-gray-800">#{protocolo.numeroCotizacion}</p>
                </div>
                <div>
                  <p className="text-gray-500">Unidad de Negocio:</p>
                  <p className="font-semibold text-gray-800">{protocolo.unidadNegocio}</p>
                </div>
                {!hideFinancials && (
                  <>
                    <div>
                      <p className="text-gray-500">Monto Neto:</p>
                      <p className="font-semibold text-gray-800">{formatCurrency(montoNeto)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Costo Neto (OC):</p>
                      <p className="font-semibold text-blue-600">{formatCurrency(costoRealNeto)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Margen Neto:</p>
                      <p className="font-semibold text-emerald-700">
                        {formatCurrency(margenMontoNeto)} ({margenPctNeto.toFixed(1)}%)
                      </p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-gray-500">OC Cliente:</p>
                  <p className="font-semibold text-gray-800">
                    {protocolo.ocCliente ? (
                      protocolo.ocClienteDocUrl ? (
                        <button
                          type="button"
                          onClick={() => abrirDocumentoModal(`OC Cliente ${protocolo.ocCliente}`, protocolo.ocClienteDocUrl)}
                          className="text-[#235250] underline underline-offset-2 hover:text-[#45ad98] transition-colors"
                        >
                          {protocolo.ocCliente}
                        </button>
                      ) : (
                        protocolo.ocCliente
                      )
                    ) : (
                      <span className="text-gray-400">Sin OC</span>
                    )}
                  </p>
                  {protocolo.ocClienteDocUrl && !protocolo.ocCliente && (
                    <button
                      type="button"
                      onClick={() => abrirDocumentoModal('OC Cliente', protocolo.ocClienteDocUrl)}
                      className="text-xs text-[#235250] underline underline-offset-2 mt-1"
                    >
                      Ver OC PDF
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-gray-500">Facturas BM:</p>
                  <div className="font-semibold text-gray-800 flex flex-wrap gap-2">
                    {facturasConNumero.length > 0 ? (
                      facturasConNumero.map((factura) => (
                        <span
                          key={factura.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 border border-gray-200"
                        >
                          {factura.docUrl ? (
                            <button
                              type="button"
                              onClick={() => abrirDocumentoModal(`Factura BM ${factura.numero || ''}`.trim(), factura.docUrl)}
                              className="text-green-700 underline underline-offset-2 hover:text-green-800 transition-colors"
                            >
                              {factura.numero || 'Sin número'}
                            </button>
                          ) : (
                            <span className="text-green-700">{factura.numero || 'Sin número'}</span>
                          )}
                          {factura.fecha && <span className="text-gray-500">{factura.fecha}</span>}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400">Sin facturas</span>
                    )}
                  </div>
                  {resumenFacturas && (
                    <p className="text-xs text-gray-500 mt-1">
                      {resumenFacturas.count} factura{resumenFacturas.count === 1 ? '' : 's'}
                    </p>
                  )}
                  {!resumenFacturas && protocolo.facturaBmDocUrl && (
                    <button
                      type="button"
                      onClick={() => abrirDocumentoModal('Factura BM', protocolo.facturaBmDocUrl)}
                      className="text-xs text-[#235250] underline underline-offset-2 mt-1"
                    >
                      Ver factura PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Botón Adjudicar Compra */}
          <div className="flex space-x-3">
            <button
              onClick={onAdjudicarCompra}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              <ShoppingCart className="w-5 h-5 inline mr-2" />
              Adjudicar Compra (Crear OC)
            </button>
            {canManageCoreActions && (
              <button
                onClick={() => {
                  setFacturaEnEdicion(null);
                  setShowFacturaModal(true);
                }}
                className="px-6 py-3 bg-white border-2 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                style={{ borderColor: '#45ad98', color: '#235250' }}
              >
                <FileText className="w-5 h-5 inline mr-2" />
                Agregar Factura
              </button>
            )}
            {canManageCoreActions && (
              <button
                onClick={async () => {
                  if (bloquearGestionCore()) return;
                  const ocCliente = prompt('Ingrese el número de OC del cliente:');
                  if (ocCliente) {
                    try {
                      await updateProtocolo(protocolo.id, { oc_cliente: ocCliente });
                      onActualizar({ ...protocolo, ocCliente });
                    } catch (error) {
                      console.error('Error actualizando OC cliente:', error);
                      alert('Error al guardar la OC del cliente');
                    }
                  }
                }}
                className="px-6 py-3 bg-white border-2 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                style={{ borderColor: '#45ad98', color: '#235250' }}
              >
                📄 Ingresar OC Cliente
              </button>
            )}
            {canManageCoreActions && (
              <button
                onClick={() => setEditingFechas(!editingFechas)}
                className="px-6 py-3 bg-white border-2 rounded-xl font-semibold hover:bg-gray-50 transition-all"
                style={{ borderColor: '#45ad98', color: '#235250' }}
              >
                <Calendar className="w-5 h-5 inline mr-2" />
                Fechas Produccion
              </button>
            )}
            {canManageProtocoloDocs && (
              <button
                onClick={onSubirFacturaClick}
                className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                disabled={uploadingDocType === 'factura'}
              >
                <FileText className="w-5 h-5 inline mr-2" />
                {uploadingDocType === 'factura' ? 'Subiendo Factura...' : 'Subir Factura'}
              </button>
            )}
            {canManageProtocoloDocs && (
              <button
                onClick={() => ocFileInputRef.current?.click()}
                className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
                disabled={uploadingDocType === 'oc'}
              >
                <FileText className="w-5 h-5 inline mr-2" />
                {uploadingDocType === 'oc' ? 'Subiendo OC...' : 'Subir OC'}
              </button>
            )}
            <button
              onClick={async () => {
                try {
                  await generarProtocoloPDF(protocolo, protocolo.items || [], ocVinculadas);
                } catch (error) {
                  console.error('Error al generar PDF de protocolo:', error);
                  alert('Error al generar PDF del protocolo');
                }
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg"
            >
              <Download className="w-5 h-5 inline mr-2" />
              Generar PDF
            </button>
          </div>
          <input
            ref={ocFileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onOcFileChange}
            className="hidden"
          />

          {/* Editor de fechas de producción */}
          {canManageCoreActions && editingFechas && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border-2 border-[#45ad98]/30">
              <div className="flex items-end space-x-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Inicio Produccion</label>
                  <input
                    type="date"
                    value={tempFechaInicio}
                    onChange={(e) => setTempFechaInicio(e.target.value)}
                    className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha Entrega</label>
                  <input
                    type="date"
                    value={tempFechaEntrega}
                    onChange={(e) => setTempFechaEntrega(e.target.value)}
                    className="px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <button
                  onClick={async () => {
                    try {
                      await updateProtocolo(protocolo.id, {
                        fecha_inicio_produccion: tempFechaInicio || null,
                        fecha_entrega: tempFechaEntrega || null
                      });
                      onActualizar({
                        ...protocolo,
                        fechaInicioProduccion: tempFechaInicio || null,
                        fechaEntrega: tempFechaEntrega || null
                      });
                      setEditingFechas(false);
                      alert('Fechas de produccion actualizadas');
                    } catch (error) {
                      console.error('Error guardando fechas:', error);
                      alert('Error al guardar las fechas');
                    }
                  }}
                  className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold hover:bg-[#235250] transition-colors"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditingFechas(false)}
                  className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
                >
                  Cancelar
                </button>
              </div>
              {protocolo.fechaInicioProduccion && protocolo.fechaEntrega && (
                <p className="mt-2 text-sm text-gray-500">
                  Actual: {protocolo.fechaInicioProduccion} a {protocolo.fechaEntrega}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Items del Protocolo */}
      <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">Items del Proyecto</h3>
          {canEditProtocolo && (
            <button
              onClick={() => setShowAddItemModal(true)}
              className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold hover:bg-[#235250] transition-colors"
            >
              Agregar Item
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">N°</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Item</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Cantidad</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Descripción</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Comprado</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemsProtocolo.map((item, index) => {
                  const itemKey = item.id ?? index;
                  return (
                    <tr key={itemKey}>
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="px-4 py-3 font-semibold">{item.item || '-'}</td>
                      <td className="px-4 py-3 font-semibold">{item.cantidad}</td>
                      <td className={`px-4 py-3 ${itemsComprados[itemKey] ? 'line-through text-gray-400' : ''}`}>
                        {item.descripcion}
                      </td>
                    <td className="px-4 py-3">
	                      <input
	                        type="checkbox"
	                        checked={!!itemsComprados[itemKey]}
	                        onChange={() =>
	                          setItemsComprados(prev => ({
	                            ...prev,
	                            [itemKey]: !prev[itemKey]
	                          }))
	                        }
	                        className="h-4 w-4"
	                        disabled={!canEditProtocolo}
	                      />
	                    </td>
	                    <td className="px-4 py-3">
	                      {canEditProtocolo ? (
	                        <div className="flex gap-2">
	                          <button
	                            onClick={() => setItemEnEdicion({ item, index })}
	                            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold"
	                          >
	                            Editar
	                          </button>
	                          <button
	                            onClick={() => eliminarItemProtocolo(item.id, index)}
	                            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold"
	                          >
	                            Eliminar
	                          </button>
	                        </div>
	                      ) : (
	                        <span className="text-xs text-gray-400">Solo lectura</span>
	                      )}
	                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </div>

      {/* Órdenes de Compra Vinculadas */}
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Órdenes de Compra Vinculadas ({ocVinculadas.length})
        </h3>
        
        {ocVinculadas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">N° OC</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Proveedor</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Tipo Costo</th>
                {!hideFinancials && (
                  <>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Neto</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">IVA</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Total</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-sm font-semibold">Factura</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Forma de Pago</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Estado</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {ocVinculadas.map((oc) => {
                  const subtotalItems = (oc.items || []).reduce((sum, item) => {
                    const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
                    const cantidad = item.cantidad || 0;
                    const descuento = item.descuento || 0;
                    const s = cantidad * valorUnitario;
                    return sum + (s - s * (descuento / 100));
                  }, 0);
                  const neto = subtotalItems > 0 ? subtotalItems : (oc.subtotal || (oc.total ? oc.total / 1.19 : 0));
                  const iva = Math.round(neto * 0.19);
                  const total = neto + iva;
                  const estadoOC = oc.numeroFactura && !['Facturada', 'Pagada', 'Anulada'].includes(oc.estado)
                    ? 'Facturada'
                    : oc.estado;

                  return (
                  <tr key={oc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold">{oc.numero}</td>
                    <td className="px-4 py-3">{oc.fecha}</td>
                    <td className="px-4 py-3">{oc.proveedor}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-semibold">
                        {oc.tipoCosto}
                      </span>
                    </td>
                    {!hideFinancials && (
                      <>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(neto)}</td>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(iva)}</td>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(total)}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      {(oc.facturas && oc.facturas.length > 0) ? (
                        <div className="space-y-1">
                          {oc.facturas.map(f => (
                            <div key={f.id}>
                              <p className="font-medium text-green-600 text-xs">{f.tipoDocumento} {f.numero}</p>
                              <p className="text-xs text-gray-500">{f.fecha}</p>
                            </div>
                          ))}
                        </div>
                      ) : oc.numeroFactura ? (
                        <div>
                          <p className="font-medium text-green-600">{oc.numeroFactura}</p>
                          <p className="text-xs text-gray-500">{oc.fechaFactura || ''}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">Sin factura</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {oc.formaPago ? (
                        <div>
                          <p className="font-medium text-gray-800">{oc.formaPago}</p>
                          {(oc.estadoPago === 'Pagada' || estadoOC === 'Pagada') && (
                            <p className="text-xs text-gray-500">{oc.fechaPago || oc.fechaFactura || ''}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">Sin forma de pago</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          estadoOC === 'Facturada' || estadoOC === 'Pagada'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {estadoOC}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
	                        <button
	                          onClick={() => onVerDetalleOC && onVerDetalleOC(oc, false)}
	                          className="px-3 py-1 bg-[#45ad98] text-white rounded-lg hover:bg-[#235250] transition-colors text-xs font-semibold"
	                        >
	                          Ver
	                        </button>
	                        {canEditProtocolo && (
	                          <button
	                            onClick={() => onVerDetalleOC && onVerDetalleOC(oc, true)}
	                            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold"
	                          >
	                            Editar
	                          </button>
	                        )}
	                      </div>
	                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No hay órdenes de compra vinculadas a este protocolo</p>
            <p className="text-sm text-gray-400 mt-2">Usa el botón "Adjudicar Compra" para crear una OC</p>
          </div>
        )}
      </div>

      {/* Facturas del Protocolo */}
      <div className="bg-white rounded-2xl p-6 shadow-lg mt-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Facturas Building Me ({facturasProtocolo.length})
        </h3>
        {facturasProtocolo.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Tipo Doc</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">N°</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Fecha</th>
                  {!hideFinancials && (
                    <>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Neto</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">IVA</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Total</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-left text-sm font-semibold">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {facturasProtocolo.map((factura) => {
                  const isLegacy = String(factura.id).startsWith('legacy-');
                  const estadoColor = factura.estado === 'Pagada'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-yellow-100 text-yellow-800';
                  return (
                    <tr key={factura.id}>
                      <td className="px-4 py-3 font-semibold">{factura.tipoDoc || 'Factura'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {factura.docUrl ? (
                          <button
                            type="button"
                            onClick={() => abrirDocumentoModal(`Factura BM ${factura.numero || ''}`.trim(), factura.docUrl)}
                            className="text-[#235250] underline underline-offset-2 hover:text-[#45ad98] transition-colors"
                          >
                            {factura.numero || 'Sin número'}
                          </button>
                        ) : (
                          factura.numero || 'Sin número'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{factura.fecha || 'Sin fecha'}</td>
                      {!hideFinancials && (
                        <>
                          <td className="px-4 py-3">{formatCurrency(factura.montoNeto || 0)}</td>
                          <td className="px-4 py-3">{formatCurrency(factura.iva || 0)}</td>
                          <td className="px-4 py-3 font-semibold">{formatCurrency(factura.total || 0)}</td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${estadoColor}`}>
                          {factura.estado || 'Emitida'}
                        </span>
                      </td>
	                      <td className="px-4 py-3 space-x-2">
	                        {canEditProtocolo ? (
	                          <>
	                            {factura.docUrl && (
	                              <button
	                                onClick={() => quitarDocumentoFactura(factura)}
	                                className="px-3 py-2 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold hover:bg-amber-200"
	                              >
	                                Quitar PDF
	                              </button>
	                            )}
	                            <button
	                              onClick={() => {
	                                setFacturaEnEdicion(factura);
	                                setShowFacturaModal(true);
	                              }}
	                              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
	                              disabled={isLegacy}
	                            >
	                              Editar
	                            </button>
	                            <button
	                              onClick={() => eliminarFacturaProtocolo(factura)}
	                              className="px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
	                              disabled={isLegacy}
	                            >
	                              Eliminar
	                            </button>
	                          </>
	                        ) : (
	                          <span className="text-xs text-gray-400">Solo lectura</span>
	                        )}
	                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">No hay facturas registradas.</div>
        )}
      </div>

      {documentoModal.abierto && (
        <DocumentoPDFModal
          titulo={documentoModal.titulo}
          url={documentoModal.url}
          onClose={() => setDocumentoModal({ abierto: false, titulo: '', url: '' })}
        />
      )}

	      {canManageProtocoloDocs && showUploadFacturaDocModal && (
	        <UploadFacturaDocumentoModal
          facturas={facturasConNumero}
          isUploading={uploadingDocType === 'factura'}
          onClose={() => setShowUploadFacturaDocModal(false)}
          onConfirm={onConfirmUploadFacturaDoc}
        />
      )}

		      {canManageCoreActions && showFacturaModal && (
		        <FacturaProtocoloModal
          factura={facturaEnEdicion}
          onClose={() => {
            setShowFacturaModal(false);
            setFacturaEnEdicion(null);
          }}
          onSave={guardarFacturaProtocolo}
        />
      )}

	      {canEditProtocolo && showAddItemModal && (
	        <AddItemModal
          onClose={() => setShowAddItemModal(false)}
          onSave={guardarItemProtocolo}
          showProveedorFields={false}
        />
      )}

	      {canEditProtocolo && itemEnEdicion && (
	        <AddItemModal
          onClose={() => setItemEnEdicion(null)}
          onSave={(item) => {
            editarItemProtocolo({
              ...itemEnEdicion.item,
              item: item.item,
              cantidad: item.cantidad,
              descripcion: item.descripcion
            }, itemEnEdicion.index);
          }}
          showProveedorFields={false}
          initialData={{
            item: itemEnEdicion.item?.item || '',
            cantidad: itemEnEdicion.item?.cantidad || 1,
            descripcion: itemEnEdicion.item?.descripcion || ''
          }}
          title="Editar Item del Protocolo"
          submitLabel="Guardar Cambios"
        />
      )}

      {/* Modal Cerrar Protocolo */}
		      {canEditProtocolo && showCerrarModal && (
		        <ModalCerrarProtocolo
	          protocolo={protocolo}
	          costoReal={costoRealNeto}
          onClose={() => setShowCerrarModal(false)}
          onConfirmar={async () => {
            try {
              await updateProtocolo(protocolo.id, { estado: 'Cerrado' });
              onActualizar({ ...protocolo, estado: 'Cerrado' });
              setShowCerrarModal(false);
              alert('Protocolo cerrado exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al cerrar protocolo: ' + error.message);
            }
          }}
	        />
	      )}

      </div>
    </div>
  );
};

// Modal para Cerrar Protocolo
const ModalCerrarProtocolo = ({ protocolo, costoReal, onClose, onConfirmar }) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 className="text-2xl font-bold text-gray-800 mb-4">Cerrar Protocolo</h3>

        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-600 mb-2">Protocolo #{protocolo.folio}</p>
          <p className="text-sm text-gray-600 mb-4">Cotizacion #{protocolo.numeroCotizacion}</p>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Costo Real (OC):</span>
              <span className="font-bold text-blue-600">{formatCurrency(costoReal)}</span>
            </div>
          </div>
        </div>

        <p className="text-gray-600 mb-6">Estas seguro de que deseas cerrar este protocolo?</p>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className="flex-1 px-4 py-3 rounded-xl font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
          >
            Cerrar Protocolo
          </button>
        </div>
      </div>
    </div>
  );
};

const DocumentoPDFModal = ({ titulo, url, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h4 className="text-lg font-bold text-gray-800">{titulo || 'Documento PDF'}</h4>
          <div className="flex items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm font-semibold text-[#235250] border border-[#45ad98] rounded-lg hover:bg-[#45ad98]/10 transition-colors"
            >
              Abrir en pestaña
            </a>
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm font-semibold text-white rounded-lg"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
        <div className="flex-1 bg-gray-100">
          <iframe
            title={titulo || 'Documento PDF'}
            src={`${url}#toolbar=1&navpanes=0&scrollbar=1`}
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
};

const UploadFacturaDocumentoModal = ({ facturas = [], isUploading = false, onClose, onConfirm }) => {
  const [facturaId, setFacturaId] = useState(facturas[0]?.id || '');
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!facturas.length) {
      setFacturaId('');
      return;
    }
    if (!facturas.some((factura) => String(factura.id) === String(facturaId))) {
      setFacturaId(facturas[0].id);
    }
  }, [facturas, facturaId]);

  const handleConfirm = () => {
    if (!facturaId) {
      alert('Selecciona una factura.');
      return;
    }
    if (!file) {
      alert('Selecciona un PDF.');
      return;
    }
    onConfirm({ facturaId, file });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[75] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h4 className="text-xl font-bold text-gray-800">Subir PDF de Factura</h4>
          <p className="text-sm text-gray-500 mt-1">Selecciona la factura BM a la que quieres asociar el documento.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Factura BM</label>
            <select
              value={facturaId}
              onChange={(e) => setFacturaId(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              {facturas.map((factura) => (
                <option key={factura.id} value={factura.id}>
                  {factura.numero || 'Sin número'}{factura.fecha ? ` - ${factura.fecha}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Archivo PDF</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl"
            />
            {file && (
              <p className="text-xs text-gray-500 mt-2 truncate">{file.name}</p>
            )}
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
            disabled={isUploading}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold disabled:opacity-60"
            disabled={isUploading || !facturaId || !file}
          >
            {isUploading ? 'Subiendo...' : 'Subir PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal Factura Protocolo
const FacturaProtocoloModal = ({ onClose, onSave, factura }) => {
  const [tipoDoc, setTipoDoc] = useState(factura?.tipoDoc || 'Factura');
  const [numero, setNumero] = useState(factura?.numero || '');
  const [fecha, setFecha] = useState(
    factura?.fecha || new Date().toISOString().split('T')[0]
  );
  const [estado, setEstado] = useState(factura?.estado || 'Emitida');
  const [montoNeto, setMontoNeto] = useState(
    factura?.montoNeto !== undefined && factura?.montoNeto !== null && Number(factura?.montoNeto) > 0
      ? String(Math.round(Number(factura.montoNeto)))
      : ''
  );

  const montoNetoNum = Number(montoNeto) || 0;
  const ivaCalculado = Math.round(montoNetoNum * 0.19);
  const totalCalculado = montoNetoNum + ivaCalculado;
  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(Number(value) || 0);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h4 className="text-xl font-bold text-gray-800">
            {factura ? 'Editar Documento' : 'Agregar Documento'}
          </h4>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Documento *</label>
            <select
              value={tipoDoc}
              onChange={(e) => setTipoDoc(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              <option value="Factura">Factura</option>
              <option value="Boleta">Boleta</option>
              <option value="Boleta Honorarios">Boleta Honorarios</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">N° Documento *</label>
              <input
                type="text"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: 12345"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha *</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              <option value="Emitida">Emitida</option>
              <option value="Pagada">Pagada</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Monto Neto *</label>
            <input
              type="number"
              min="0"
              step="1"
              value={montoNeto}
              onChange={(e) => setMontoNeto(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              placeholder="Ej: 1500000"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">IVA (19%)</p>
              <p className="font-semibold text-gray-800">{formatCurrency(ivaCalculado)}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Total</p>
              <p className="font-semibold text-gray-800">{formatCurrency(totalCalculado)}</p>
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onSave({
                id: factura?.id,
                tipoDoc,
                numero: numero.trim(),
                fecha,
                estado,
                montoNeto: montoNetoNum,
                iva: ivaCalculado,
                total: totalCalculado
              })
            }
            className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold"
            disabled={!numero || !fecha || montoNetoNum <= 0}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

   

// ========================================
// FORMULARIO OC DESDE PROTOCOLO
// ========================================
const FormularioOCDesdeProtocolo = ({ datosProtocolo, onClose, onGuardar, currentUserName }) => {
  const [formData, setFormData] = useState({
    codigoProtocolo: datosProtocolo.codigoProtocolo,
    fechaProtocolo: datosProtocolo.fechaProtocolo,
    codigoProveedor: '',
    proveedorId: null,
    proveedor: '',
    rutProveedor: '',
    direccionProveedor: '',
    contactoProveedor: '',
    telefonoProveedor: '',
    cotizacionProveedor: '',
    formaPago: '',
    tipoDocumento: 'Factura',
    responsableCompra: currentUserName || '',
    tipoCosto: '',
    centroCosto: '',
    actividadUso: '',
    items: datosProtocolo.items.map(item => ({
      id: item.id,
      item: item.descripcion.substring(0, 20),
      cantidad: item.cantidad,
      descripcion: item.descripcion,
      valorUnitario: item.valorUnitario || 0,
      descuento: 0
    })),
    observaciones: ''
  });
  const [showBodegaModal, setShowBodegaModal] = useState(false);

  const [proveedores, setProveedores] = useState([]);
  const [proveedoresError, setProveedoresError] = useState('');
  const [showProveedorAutocomplete, setShowProveedorAutocomplete] = useState(false);

  useEffect(() => {
    const loadProveedores = async () => {
      try {
        setProveedoresError('');
        const data = await getProveedores();
        const transformados = data.map(p => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.razon_social,
          rut: p.rut,
          direccion: p.direccion,
          contacto: p.contacto,
          telefono: p.telefono
        }));
        setProveedores(transformados);
      } catch (error) {
        console.error('Error cargando proveedores:', error);
        setProveedoresError('No se pudieron cargar los proveedores');
      }
    };

    loadProveedores();
  }, []);

  useEffect(() => {
    if (!currentUserName) return;
    setFormData(prev => (
      prev.responsableCompra ? prev : { ...prev, responsableCompra: currentUserName }
    ));
  }, [currentUserName]);

  const buscarProveedor = (codigo) => {
    const codigoNormalizado = codigo.trim();
    if (!codigoNormalizado) return;
    const prov = proveedores.find(p => String(p.codigo) === codigoNormalizado);
    if (prov) {
      setFormData(prev => ({
        ...prev,
        codigoProveedor: codigo,
        proveedorId: prov.id,
        proveedor: prov.nombre,
        rutProveedor: prov.rut,
        direccionProveedor: prov.direccion,
        contactoProveedor: prov.contacto,
        telefonoProveedor: prov.telefono
      }));
    }
  };

  const seleccionarProveedor = (prov) => {
    setFormData(prev => ({
      ...prev,
      codigoProveedor: prov.codigo,
      proveedorId: prov.id,
      proveedor: prov.nombre,
      rutProveedor: prov.rut,
      direccionProveedor: prov.direccion,
      contactoProveedor: prov.contacto,
      telefonoProveedor: prov.telefono
    }));
    setShowProveedorAutocomplete(false);
  };

  const agregarItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        id: prev.items.length + 1,
        item: '',
        cantidad: 0,
        descripcion: '',
        valorUnitario: 0,
        descuento: 0
      }]
    }));
  };

  const agregarItemsDesdeBodega = (itemsBodega) => {
    setFormData(prev => {
      const itemsExistentes = prev.items.filter(item =>
        String(item.item || '').trim().length > 0 ||
        String(item.descripcion || '').trim().length > 0 ||
        Number(item.valorUnitario || 0) > 0 ||
        Number(item.cantidad || 0) > 0
      );
      const baseId = Math.max(0, ...prev.items.map(i => i.id)) + 1;
      return {
        ...prev,
        items: [
          ...itemsExistentes,
          ...itemsBodega.map((item, index) => ({
            id: baseId + index,
            item: item.item || '',
            cantidad: item.cantidad || 0,
            descripcion: item.descripcion || '',
            valorUnitario: item.valorUnitario || 0,
            descuento: item.descuento || 0
          }))
        ]
      };
    });
  };

  const eliminarItem = (id) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const actualizarItem = (id, campo, valor) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === id ? { ...item, [campo]: valor } : item
      )
    }));
  };

  const calcularSubtotalItem = (item) => {
    const cantidad = Number(item.cantidad) || 0;
    const valorUnitario = Number(item.valorUnitario) || 0;
    const subtotal = cantidad * valorUnitario;
    const descuento = subtotal * ((Number(item.descuento) || 0) / 100);
    return subtotal - descuento;
  };

  const calcularTotalesPorDocumento = (subtotalBase, tipoDocumento) => {
    const base = Number(subtotalBase) || 0;
    if (tipoDocumento === 'Boleta Comercio') {
      const subtotal = base / 1.19;
      const iva = base - subtotal;
      return { subtotal, iva, total: base };
    }
    if (tipoDocumento === 'Boleta Honorarios') {
      const iva = base * 0.1525;
      return { subtotal: base, iva, total: base + iva };
    }
    if (tipoDocumento === 'Factura Exenta' || tipoDocumento === 'Factura Internacional') {
      return { subtotal: base, iva: 0, total: base };
    }
    const iva = base * 0.19;
    return { subtotal: base, iva, total: base + iva };
  };

  const calcularTotales = () => {
    const subtotalBase = formData.items.reduce((sum, item) => sum + calcularSubtotalItem(item), 0);
    return calcularTotalesPorDocumento(subtotalBase, formData.tipoDocumento);
  };

  const resolverProveedorId = () => {
    if (formData.proveedorId) return formData.proveedorId;
    const codigo = String(formData.codigoProveedor || '').trim();
    if (codigo) {
      const byCodigo = proveedores.find(p => String(p.codigo) === codigo);
      if (byCodigo) return byCodigo.id;
    }
    const nombre = String(formData.proveedor || '').trim().toLowerCase();
    if (!nombre) return null;
    const exact = proveedores.find(p => p.nombre.toLowerCase() === nombre);
    if (exact) return exact.id;
    const starts = proveedores.filter(p => p.nombre.toLowerCase().startsWith(nombre));
    if (starts.length === 1) return starts[0].id;
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const proveedorId = resolverProveedorId();
    if (!proveedorId) {
      alert('Selecciona un proveedor de la lista o búscalo por código.');
      return;
    }
    const { subtotal, iva, total } = calcularTotales();
    onGuardar({ 
      ...formData,
      proveedorId,
      subtotal, 
      iva, 
      total,
      unidadNegocio: datosProtocolo.unidadNegocio 
    });
  };

  const totales = calcularTotales();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">Nueva Orden de Compra</h3>
              <p className="text-white/80 text-sm mt-1">Desde Protocolo {datosProtocolo.codigoProtocolo}</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          {/* Info del Protocolo (solo lectura) */}
          <div className="mb-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
            <h4 className="font-semibold text-blue-800 mb-2">📋 Datos del Protocolo</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-blue-600">Código PR:</p>
                <p className="font-bold text-blue-900">{datosProtocolo.codigoProtocolo}</p>
              </div>
              <div>
                <p className="text-blue-600">Fecha PR:</p>
                <p className="font-bold text-blue-900">{datosProtocolo.fechaProtocolo}</p>
              </div>
              <div>
                <p className="text-blue-600">Unidad de Negocio:</p>
                <p className="font-bold text-blue-900">{datosProtocolo.unidadNegocio}</p>
              </div>
            </div>
          </div>

          {/* Datos del Proveedor */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Datos del Proveedor</h4>
            
            <div className="mb-4 p-4 bg-green-50 rounded-xl border-2 border-green-200">
              <label className="block text-sm font-semibold text-green-800 mb-2">
                🔍 Código Proveedor
              </label>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={formData.codigoProveedor}
                  onChange={(e) => setFormData({...formData, codigoProveedor: e.target.value})}
                  onBlur={(e) => buscarProveedor(e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-green-300 rounded-xl focus:outline-none focus:border-green-500 font-mono text-lg font-bold"
                  placeholder="Ej: 1000"
                />
                <button
                  type="button"
                  onClick={() => buscarProveedor(formData.codigoProveedor)}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
                >
                  Buscar
                </button>
              </div>
              {proveedoresError && (
                <p className="text-xs text-red-600 mt-2">{proveedoresError}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Proveedor *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formData.proveedor}
                    onChange={(e) => {
                      setFormData({...formData, proveedor: e.target.value});
                      setShowProveedorAutocomplete(true);
                    }}
                    onFocus={() => setShowProveedorAutocomplete(true)}
                    onBlur={() => setTimeout(() => setShowProveedorAutocomplete(false), 150)}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                  {showProveedorAutocomplete && formData.proveedor && (
                    <div className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {proveedores
                        .filter(p =>
                          p.nombre.toLowerCase().includes(formData.proveedor.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => seleccionarProveedor(p)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50"
                          >
                            <span className="font-semibold">{p.nombre}</span>
                            <span className="text-xs text-gray-500 ml-2">Cód: {p.codigo}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT *</label>
                <input
                  type="text"
                  required
                  value={formData.rutProveedor}
                  onChange={(e) => setFormData({...formData, rutProveedor: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Datos de la OC */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Datos de la Orden de Compra</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">N° Cotización Proveedor</label>
                <input
                  type="text"
                  value={formData.cotizacionProveedor}
                  onChange={(e) => setFormData({...formData, cotizacionProveedor: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="Ref. del proveedor"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Centro de Costos * 
                  <span className="text-xs text-gray-500 ml-2">📌 Obligatorio</span>
                </label>
                <select
                  required
                  value={formData.centroCosto}
                  onChange={(e) => setFormData({...formData, centroCosto: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white font-semibold"
                >
                  <option value="">Seleccione centro...</option>
                  {CENTROS_COSTO.map((grupo) => (
                    <optgroup key={grupo.label} label={grupo.label}>
                      {grupo.options.map((opcion) => (
                        <option key={opcion} value={opcion}>{opcion}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tipo de Costo * 
                  <span className="text-xs text-gray-500 ml-2">📊 Para análisis</span>
                </label>
                <select
                  required
                  value={formData.tipoCosto}
                  onChange={(e) => setFormData({...formData, tipoCosto: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white font-semibold"
                >
                  <option value="">Seleccione tipo...</option>
                  {TIPOS_COSTO.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Actividad / Uso 
                  <span className="text-xs text-gray-500 ml-2">Opcional</span>
                </label>
                <select
                  value={formData.actividadUso}
                  onChange={(e) => setFormData({...formData, actividadUso: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option value="">Seleccione actividad...</option>
                  {ACTIVIDADES_USO.map((actividad) => (
                    <option key={actividad} value={actividad}>{actividad}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Forma de Pago *</label>
                <select
                  required
                  value={formData.formaPago}
                  onChange={(e) => setFormData({...formData, formaPago: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option value="">Seleccione...</option>
                  <option value="Contado Efectivo">Contado Efectivo</option>
                  <option value="30 días">30 días</option>
                  <option value="60 días">60 días</option>
                  <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                  <option value="Caja Chica">Caja Chica</option>
                  <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de Documento *</label>
                <select
                  required
                  value={formData.tipoDocumento}
                  onChange={(e) => setFormData({...formData, tipoDocumento: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option value="Factura">Factura</option>
                  <option value="Factura Exenta">Factura Exenta</option>
                  <option value="Factura Internacional">Factura Internacional</option>
                  <option value="Boleta Comercio">Boleta Comercio</option>
                  <option value="Boleta Honorarios">Boleta Honorarios</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Responsable Compra *</label>
                <input
                  type="text"
                  required
                  value={formData.responsableCompra}
                  onChange={(e) => setFormData({...formData, responsableCompra: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Items de la OC */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800">Items (Pre-cargados del Protocolo - Edita valores)</h4>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBodegaModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Bodega
                </button>
                <button
                  type="button"
                  onClick={agregarItem}
                  className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold hover:bg-[#235250] transition-colors"
                >
                  + Agregar Item
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {formData.items.map((item) => (
                <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Item</label>
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => actualizarItem(item.id, 'item', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Cantidad</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.cantidad === 0 ? '' : item.cantidad}
                        onChange={(e) => actualizarItem(item.id, 'cantidad', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">V. Unitario</label>
                      <input
                        type="number"
                        min="0"
                        value={item.valorUnitario === 0 ? '' : item.valorUnitario}
                        onChange={(e) =>
                          actualizarItem(
                            item.id,
                            'valorUnitario',
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') actualizarItem(item.id, 'valorUnitario', 0);
                        }}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Descuento %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.descuento}
                        onChange={(e) => actualizarItem(item.id, 'descuento', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98]"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => eliminarItem(item.id)}
                        className="w-full px-3 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
                      <textarea
                        value={item.descripcion}
                        onChange={(e) => actualizarItem(item.id, 'descripcion', e.target.value)}
                        rows="3"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[#45ad98] resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {formData.items.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  No hay items pre-cargados. Agrega uno para continuar.
                </div>
              )}
            </div>
          </div>

          {/* Totales */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">Subtotal:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">IVA:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.iva)}
              </span>
            </div>
            <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
              <span className="text-gray-800 font-bold text-lg">TOTAL:</span>
              <span className="text-2xl font-bold" style={{ color: '#235250' }}>
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.total)}
              </span>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-300">
              <p className="text-sm font-semibold text-gray-700">Facturar a:</p>
              <p className="text-gray-800 font-medium">Maria Paula Ross EIRL</p>
              <p className="text-gray-600">76.226.767-5</p>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Crear Orden de Compra
            </button>
          </div>
        </form>
      </div>
      {showBodegaModal && (
        <BodegaItemsModal
          codigoProtocolo={formData.codigoProtocolo}
          onClose={() => setShowBodegaModal(false)}
          onAgregarItems={agregarItemsDesdeBodega}
        />
      )}
    </div>
  );
};

// Modal Nuevo Protocolo (mantener el existente o simplificado)
// Modal Nuevo Protocolo (Adjudicar Venta)
const NuevoProtocoloModal = ({ onClose, onSave, sharedCotizaciones, sharedProtocolos = [] }) => {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCotizacion, setSelectedCotizacion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  useEffect(() => {
    const cargarCotizaciones = async () => {
      try {
        setLoading(true);
        const data = await getCotizaciones();
        const transformadas = data.map(cot => ({
          id: cot.id,
          numero: cot.numero,
          clienteId: cot.cliente_id || null,
          items: cot.items || [],
          cliente: cot.clientes?.razon_social || cot.razon_social || 'Sin cliente',
          nombreProyecto: cot.nombre_proyecto || '',
          unidadNegocio: cot.unidad_negocio || '',
          monto: parseFloat(cot.monto),
          estado: cot.estado,
          adjudicada_a_protocolo: cot.adjudicada_a_protocolo
        }));
        setCotizaciones(transformadas);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };
    cargarCotizaciones();
  }, []);

  const cotizacionesGanadas = cotizaciones.filter(c =>
    c.estado === 'ganada' &&
    !c.adjudicada_a_protocolo &&
    !sharedProtocolos.some(p => String(p.numeroCotizacion) === String(c.numero))
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!selectedCotizacion) {
      alert('Por favor selecciona una cotización');
      return;
    }
    const cotizacion = cotizacionesGanadas.find(c => c.numero === selectedCotizacion);
    if (!cotizacion) {
      alert('Cotización no encontrada');
      return;
    }
    setPendingData({
      numeroCotizacion: cotizacion.numero,
      clienteId: cotizacion.clienteId,
      nombreProyecto: cotizacion.nombreProyecto,
      unidadNegocio: cotizacion.unidadNegocio,
      montoTotal: cotizacion.monto,
      tipo: 'Venta'
    });
    setShowConfirm(true);
  };

  const handleConfirmCreate = async () => {
    setShowConfirm(false);
    if (!pendingData || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(pendingData);
    } finally {
      setIsSaving(false);
      setPendingData(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Adjudicar Venta - Crear Protocolo</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Seleccionar Cotización Ganada *
            </label>
            <select
              required
              value={selectedCotizacion}
              onChange={(e) => setSelectedCotizacion(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
            >
              <option value="">Seleccione una cotización...</option>
              {cotizacionesGanadas.map((cot) => (
                <option key={cot.numero} value={cot.numero}>
                  #{cot.numero} - {cot.nombreProyecto || cot.cliente} - {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(cot.monto)}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-500 mt-2">
              💡 Solo aparecen cotizaciones con estado "Ganada" que no tienen protocolo asignado
            </p>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              {isSaving ? 'Creando...' : 'Crear Protocolo'}
            </button>
          </div>
        </form>
        {showConfirm && (
          <ConfirmDialog
            message="¿Está seguro de crear este Protocolo?"
            onConfirm={handleConfirmCreate}
            onCancel={() => { setShowConfirm(false); setPendingData(null); }}
          />
        )}
      </div>
    </div>
  );
};

// Modal Detalle Protocolo (Tablero Completo)
const DetalleProtocoloModal = ({ protocolo: protocoloInicial, onClose, onUpdate }) => {
  const [protocolo, setProtocolo] = useState(protocoloInicial);
  const [showOCClienteModal, setShowOCClienteModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showOCModal, setShowOCModal] = useState(false);
  const [itemSeleccionado, setItemSeleccionado] = useState(null);

  const agregarOCCliente = (numeroOC) => {
    const actualizado = { ...protocolo, ocCliente: numeroOC };
    setProtocolo(actualizado);
    onUpdate(actualizado);
  };

  const cambiarEstado = (nuevoEstado) => {
    const actualizado = { ...protocolo, estado: nuevoEstado };
    setProtocolo(actualizado);
    onUpdate(actualizado);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl my-8">
        {/* Header del Protocolo */}
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-3xl font-bold text-white mb-2">Protocolo {protocolo.folio}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-white text-sm">
                <div>
                  <p className="text-white/70">Cliente:</p>
                  <p className="font-semibold">{protocolo.cliente}</p>
                </div>
                <div>
                  <p className="text-white/70">RUT:</p>
                  <p className="font-semibold">{protocolo.rutCliente}</p>
                </div>
                <div>
                  <p className="text-white/70">N° Cotización:</p>
                  <p className="font-semibold">#{protocolo.numeroCotizacion}</p>
                </div>
                <div>
                  <p className="text-white/70">Código Cliente:</p>
                  <p className="font-semibold">{protocolo.numeroCliente}</p>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-8 h-8" />
            </button>
          </div>

          {/* Botones de Acción */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowOCClienteModal(true)}
              className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100 transition-colors flex items-center space-x-2"
            >
              <FileText className="w-4 h-4" />
              <span>OC Cliente</span>
              {protocolo.ocCliente && <span className="ml-2 text-xs bg-green-500 text-white px-2 py-1 rounded">✓</span>}
            </button>
            <button
              onClick={() => setShowAddItemModal(true)}
              className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100 transition-colors flex items-center space-x-2"
            >
              <Package className="w-4 h-4" />
              <span>Adjudicar Compra</span>
            </button>
            <button className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              PDF
            </button>
            <select
              value={protocolo.estado}
              onChange={(e) => cambiarEstado(e.target.value)}
              className="px-4 py-2 bg-white text-[#235250] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              <option value="Abierto">Abierto</option>
              <option value="En Proceso">En Proceso</option>
              <option value="Despachado Parcial">Despachado Parcial</option>
              <option value="Cerrado">Cerrado</option>
              <option value="Anulado">Anulado</option>
            </select>
          </div>
        </div>

        {/* Tabla de Items */}
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-lg font-bold text-gray-800">Items del Protocolo</h4>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Tipo: <span className="font-semibold">{protocolo.tipo}</span>
              </span>
              <span className="text-sm text-gray-600">
                OC Cliente: <span className="font-semibold">{protocolo.ocCliente || 'Sin asignar'}</span>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">N°</th>
                  <th className="px-3 py-2 text-left font-semibold">Cant</th>
                  <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                  <th className="px-3 py-2 text-left font-semibold">Proveedor 1</th>
                  <th className="px-3 py-2 text-left font-semibold">Cant</th>
                  <th className="px-3 py-2 text-left font-semibold">OC</th>
                  <th className="px-3 py-2 text-left font-semibold">Factura</th>
                  <th className="px-3 py-2 text-left font-semibold">Estado Pago</th>
                  <th className="px-3 py-2 text-left font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {protocolo.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-mono">{item.id}</td>
                    <td className="px-3 py-3">{item.cantidad}</td>
                    <td className="px-3 py-3 font-medium">{item.descripcion}</td>
                    <td className="px-3 py-3">{item.proveedor1?.nombre || '-'}</td>
                    <td className="px-3 py-3">{item.proveedor1?.cantidad || '-'}</td>
                    <td className="px-3 py-3 font-mono text-xs">{item.proveedor1?.oc || '-'}</td>
                    <td className="px-3 py-3">
                      {item.proveedor1?.factura ? (
                        <span className="text-green-600 font-medium">{item.proveedor1.factura}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        item.proveedor1?.estadoPago === 'Pagada' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.proveedor1?.estadoPago || 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-bold text-[#45ad98]">{item.porcentaje}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {protocolo.items.length === 0 && (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No hay items en este protocolo</p>
              <button
                onClick={() => setShowAddItemModal(true)}
                className="px-6 py-3 bg-[#45ad98] text-white rounded-xl font-semibold hover:bg-[#235250] transition-colors"
              >
                Agregar Primer Item
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">
              Última actualización: {new Date().toLocaleDateString('es-CL')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
          >
            Cerrar Tablero
          </button>
        </div>

        {/* Sub-modales */}
        {showOCClienteModal && (
          <OCClienteModal 
            onClose={() => setShowOCClienteModal(false)}
            onSave={(oc) => {
              agregarOCCliente(oc);
              setShowOCClienteModal(false);
            }}
          />
        )}

        {showAddItemModal && (
          <AddItemModal 
            onClose={() => setShowAddItemModal(false)}
            onSave={(item) => {
              const actualizado = {
                ...protocolo,
                items: [...protocolo.items, { ...item, id: protocolo.items.length + 1 }]
              };
              setProtocolo(actualizado);
              onUpdate(actualizado);
              setShowAddItemModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
};

// Modal OC Cliente
const OCClienteModal = ({ onClose, onSave }) => {
  const [numeroOC, setNumeroOC] = useState('');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b">
          <h4 className="text-xl font-bold text-gray-800">Ingresar OC del Cliente</h4>
        </div>
        <div className="p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Número de OC</label>
          <input
            type="text"
            value={numeroOC}
            onChange={(e) => setNumeroOC(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            placeholder="Ej: OC-2025-001"
          />
        </div>
        <div className="p-6 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(numeroOC)}
            className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal Agregar Item
const AddItemModal = ({
  onClose,
  onSave,
  showProveedorFields = true,
  initialData = null,
  title = 'Adjudicar Compra - Nuevo Item',
  submitLabel = 'Agregar Item'
}) => {
  const baseData = {
    item: '',
    cantidad: 0,
    descripcion: '',
    proveedor1: { nombre: '', cantidad: 0, oc: '', factura: '', estadoPago: 'Pendiente' },
    porcentaje: 0
  };
  const [formData, setFormData] = useState({ ...baseData, ...(initialData || {}) });

  useEffect(() => {
    setFormData({ ...baseData, ...(initialData || {}) });
  }, [initialData]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
        <div className="p-6 border-b">
          <h4 className="text-xl font-bold text-gray-800">{title}</h4>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Item *</label>
              <input
                type="text"
                value={formData.item}
                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: Letrero, Instalación, Transporte"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cantidad *</label>
              <input
                type="number"
                value={Number.isFinite(formData.cantidad) ? formData.cantidad : ''}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setFormData({ ...formData, cantidad: Number.isFinite(next) ? next : 0 });
                }}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción *</label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
          </div>
          
          {showProveedorFields && (
            <div className="border-t pt-4">
              <h5 className="font-semibold text-gray-700 mb-3">Proveedor 1</h5>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Proveedor</label>
                  <input
                    type="text"
                    value={formData.proveedor1.nombre}
                    onChange={(e) => setFormData({...formData, proveedor1: {...formData.proveedor1, nombre: e.target.value}})}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Cantidad</label>
                  <input
                    type="number"
                    value={Number.isFinite(formData.proveedor1.cantidad) ? formData.proveedor1.cantidad : ''}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setFormData({
                        ...formData,
                        proveedor1: {
                          ...formData.proveedor1,
                          cantidad: Number.isFinite(next) ? next : 0
                        }
                      });
                    }}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">N° OC</label>
                  <input
                    type="text"
                    value={formData.proveedor1.oc}
                    onChange={(e) => setFormData({...formData, proveedor1: {...formData.proveedor1, oc: e.target.value}})}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-4 py-2 bg-[#45ad98] text-white rounded-lg font-semibold"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente de Módulo de Clientes
const ClientesModule = () => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
 const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar clientes desde Supabase
  useEffect(() => {
    loadClientes();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('clientes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        loadClientes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes_contactos' }, () => {
        loadClientes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadClientes = async () => {
    try {
      setLoading(true);
      const data = await getClientes();
      
      const transformados = data.map(c => ({
        id: c.id,
        codigo: c.codigo,
        razonSocial: c.razon_social,
        rut: c.rut,
        giro: c.giro,
        direccion: c.direccion,
        ciudad: c.ciudad,
        comuna: c.comuna,
        pais: c.pais,
        email: c.email,
        personaEncargada: c.persona_encargada,
        telefono: c.telefono,
        observaciones: c.observaciones,
        fechaCreacion: c.created_at
      }));
      
      setClientes(transformados);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrar clientes
  const clientesFiltrados = clientes.filter(cliente => {
    const searchLower = searchTerm.toLowerCase();
    return (
      cliente.codigo.includes(searchTerm) ||
      cliente.razonSocial.toLowerCase().includes(searchLower) ||
      cliente.rut.includes(searchTerm) ||
      cliente.email.toLowerCase().includes(searchLower)
    );
  });

  const eliminarCliente = async (id) => {
    if (confirm('¿Estás seguro de eliminar este cliente? Esta acción no se puede deshacer.')) {
      try {
        await deleteCliente(id);
        await loadClientes();
        alert('Cliente eliminado exitosamente');
      } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar cliente');
      }
    }
  };

  const exportarExcel = () => {
    // Preparar datos para CSV (compatible con Excel)
    const headers = ['Código', 'Razón Social', 'RUT', 'Giro', 'Dirección', 'Ciudad', 'Comuna', 'País', 'Email', 'Persona Encargada', 'Teléfono', 'Observaciones'];
    const rows = clientes.map(c => [
      c.codigo,
      c.razonSocial,
      c.rut,
      c.giro,
      c.direccion,
      c.ciudad,
      c.comuna,
      c.pais,
      c.email,
      c.personaEncargada,
      c.telefono,
      c.observaciones
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
      csvContent += row.map(cell => `"${cell || ''}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Clientes_BuildingMe_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Clientes</h2>
          <p className="text-gray-600">Base de datos de clientes de Building Me</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={exportarExcel}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl border-2 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            style={{ borderColor: '#45ad98', color: '#45ad98' }}
          >
            <Download className="w-5 h-5" />
            <span>Exportar Excel</span>
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
          >
            <Users className="w-5 h-5" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow">
          <p className="text-sm text-gray-500 mb-1">Total Clientes</p>
          <p className="text-2xl font-bold text-gray-800">{clientes.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow">
          <p className="text-sm text-green-600 mb-1">Activos</p>
          <p className="text-2xl font-bold text-green-800">{clientes.length}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow">
          <p className="text-sm text-blue-600 mb-1">Nuevos (Este Mes)</p>
          <p className="text-2xl font-bold text-blue-800">2</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 shadow">
          <p className="text-sm text-purple-600 mb-1">Último Código</p>
          <p className="text-2xl font-bold text-purple-800">
            {clientes.length > 0 ? Math.max(...clientes.map(c => parseInt(c.codigo))) : '1000'}
          </p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
        <input
          type="text"
          placeholder="Buscar por código, razón social, RUT o email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
        />
      </div>

      {/* Listado de Clientes */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#45ad98' }}>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Código</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Razón Social</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">RUT</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Contacto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Ciudad</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Email</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Cargando clientes...
                  </td>
                </tr>
              ) : clientesFiltrados.map((cliente) => (
                <tr key={cliente.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-lg" style={{ color: '#235250' }}>{cliente.codigo}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-gray-800">{cliente.razonSocial}</p>
                      <p className="text-sm text-gray-500">{cliente.giro}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{cliente.rut}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-800">{cliente.personaEncargada}</p>
                      <p className="text-sm text-gray-500">{cliente.telefono}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{cliente.ciudad}, {cliente.comuna}</td>
                  <td className="px-6 py-4 text-gray-600">{cliente.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setClienteSeleccionado(cliente);
                          setShowHistorialModal(true);
                        }}
                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                        title="Ver Historial"
                      >
                        <FileText className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => {
                          setClienteSeleccionado(cliente);
                          setShowEditModal(true);
                        }}
                        className="p-2 bg-yellow-100 hover:bg-yellow-200 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Building2 className="w-4 h-4 text-yellow-600" />
                      </button>
                      <button
                        onClick={() => eliminarCliente(cliente.id)}
                        className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <XCircle className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && clientesFiltrados.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500">No se encontraron clientes</p>
          </div>
        )}
      </div>

      {/* Modales */}
      {showNewModal && (
        <NuevoClienteModal 
          onClose={() => setShowNewModal(false)}
          onSave={async (nuevoCliente) => {
            try {
              // Generar código único
              const clientesExistentes = await getClientes();
              const ultimoCodigo = clientesExistentes.length > 0
                ? Math.max(...clientesExistentes.map(c => parseInt(c.codigo) || 1000))
                : 999;

              const contactosNormalizados = (nuevoCliente.contactos || [])
                .filter((c) => String(c?.nombre || '').trim())
                .map((c) => ({
                  nombre: String(c.nombre || '').trim(),
                  cargo: String(c.cargo || '').trim() || null,
                  email: String(c.email || '').trim() || null,
                  telefono: String(c.telefono || '').trim() || null,
                  es_principal: !!c.es_principal
                }));
              const contactoPrincipal =
                contactosNormalizados.find((c) => c.es_principal) ||
                contactosNormalizados[0] ||
                null;

              const clienteData = {
                codigo: `${ultimoCodigo + 1}`,
                razon_social: nuevoCliente.razonSocial,
                rut: nuevoCliente.rut,
                giro: nuevoCliente.giro,
                direccion: nuevoCliente.direccion,
                ciudad: nuevoCliente.ciudad,
                comuna: nuevoCliente.comuna,
                pais: nuevoCliente.pais,
                email: contactoPrincipal?.email || '',
                persona_encargada: contactoPrincipal?.nombre || '',
                telefono: contactoPrincipal?.telefono || '',
                observaciones: nuevoCliente.observaciones || ''
              };

              const clienteCreado = await createCliente(clienteData);

              if (clienteCreado?.id && contactosNormalizados.length > 0) {
                const contactosConPrincipal = contactosNormalizados.map((contacto, index) => ({
                  ...contacto,
                  es_principal: contacto.es_principal || (index === 0 && !contactosNormalizados.some(c => c.es_principal))
                }));
                for (const contacto of contactosConPrincipal) {
                  await createContacto({
                    cliente_id: clienteCreado.id,
                    nombre: contacto.nombre,
                    cargo: contacto.cargo,
                    email: contacto.email,
                    telefono: contacto.telefono,
                    es_principal: contacto.es_principal
                  });
                }
              }
              await loadClientes();

              setShowNewModal(false);
              alert('Cliente creado exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al crear cliente');
            }
          }}
        />
      )}

      {showEditModal && clienteSeleccionado && (
        <EditarClienteModal 
          cliente={clienteSeleccionado}
          onClose={() => {
            setShowEditModal(false);
            setClienteSeleccionado(null);
          }}
          onSave={async (clienteActualizado) => {
            try {
              const clienteData = {
                razon_social: clienteActualizado.razonSocial,
                rut: clienteActualizado.rut,
                giro: clienteActualizado.giro,
                direccion: clienteActualizado.direccion,
                ciudad: clienteActualizado.ciudad,
                comuna: clienteActualizado.comuna,
                pais: clienteActualizado.pais,
                email: clienteActualizado.email,
                persona_encargada: clienteActualizado.personaEncargada,
                telefono: clienteActualizado.telefono,
                observaciones: clienteActualizado.observaciones || ''
              };

              await updateCliente(clienteActualizado.id, clienteData);
              await loadClientes();

              setShowEditModal(false);
              setClienteSeleccionado(null);
              alert('Cliente actualizado exitosamente');
            } catch (error) {
              console.error('Error:', error);
              alert('Error al actualizar cliente');
            }
          }}
        />
      )}

      {showHistorialModal && clienteSeleccionado && (
        <HistorialClienteModal 
          cliente={clienteSeleccionado}
          onClose={() => {
            setShowHistorialModal(false);
            setClienteSeleccionado(null);
          }}
        />
      )}
    </div>
  );
};

// Modal Nuevo Cliente
const NuevoClienteModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    razonSocial: '',
    rut: '',
    giro: '',
    direccion: '',
    ciudad: '',
    comuna: '',
    pais: 'Chile',
    observaciones: ''
  });
  const [contactos, setContactos] = useState([]);
  const [nuevoContacto, setNuevoContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '' });
  const [showNuevoContacto, setShowNuevoContacto] = useState(false);
  const [editandoContacto, setEditandoContacto] = useState(null);

  const handleAgregarContacto = () => {
    if (!nuevoContacto.nombre.trim()) {
      alert('El nombre del contacto es requerido');
      return;
    }
    const contactoCreado = {
      id: `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      nombre: nuevoContacto.nombre.trim(),
      cargo: nuevoContacto.cargo || '',
      email: nuevoContacto.email || '',
      telefono: nuevoContacto.telefono || '',
      es_principal: contactos.length === 0
    };
    setContactos([...contactos, contactoCreado]);
    setNuevoContacto({ nombre: '', cargo: '', email: '', telefono: '' });
    setShowNuevoContacto(false);
  };

  const handleEliminarContacto = (contactoId) => {
    if (!confirm('¿Eliminar este contacto?')) return;
    const contactosActualizados = contactos.filter((c) => c.id !== contactoId);
    if (contactosActualizados.length > 0 && !contactosActualizados.some((c) => c.es_principal)) {
      contactosActualizados[0] = { ...contactosActualizados[0], es_principal: true };
    }
    setContactos(contactosActualizados);
  };

  const handleGuardarEdicion = () => {
    if (!editandoContacto?.nombre?.trim()) {
      alert('El nombre del contacto es requerido');
      return;
    }
    setContactos(
      contactos.map((contacto) =>
        contacto.id === editandoContacto.id
          ? {
              ...contacto,
              nombre: editandoContacto.nombre.trim(),
              cargo: editandoContacto.cargo || '',
              email: editandoContacto.email || '',
              telefono: editandoContacto.telefono || ''
            }
          : contacto
      )
    );
    setEditandoContacto(null);
  };

  const handleMarcarPrincipal = (contactoId) => {
    setContactos(contactos.map((c) => ({ ...c, es_principal: c.id === contactoId })));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      contactos
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Nuevo Cliente</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Información Básica */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Información Básica</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={formData.razonSocial}
                  onChange={(e) => setFormData({...formData, razonSocial: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT *</label>
                <input
                  type="text"
                  required
                  value={formData.rut}
                  onChange={(e) => setFormData({...formData, rut: formatRutInput(e.target.value)})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="12.345.678-9"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Giro/Rubro *</label>
                <input
                  type="text"
                  required
                  value={formData.giro}
                  onChange={(e) => setFormData({...formData, giro: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Ubicación */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Ubicación</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({...formData, direccion: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ciudad *</label>
                <input
                  type="text"
                  required
                  value={formData.ciudad}
                  onChange={(e) => setFormData({...formData, ciudad: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Comuna *</label>
                <input
                  type="text"
                  required
                  value={formData.comuna}
                  onChange={(e) => setFormData({...formData, comuna: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">País *</label>
                <input
                  type="text"
                  required
                  value={formData.pais}
                  onChange={(e) => setFormData({...formData, pais: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Contactos */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800">Contactos</h4>
              <button
                type="button"
                onClick={() => setShowNuevoContacto(!showNuevoContacto)}
                className="flex items-center space-x-1 px-3 py-1.5 bg-[#45ad98] text-white rounded-lg text-sm hover:bg-[#3a9482] transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Contacto</span>
              </button>
            </div>

            {showNuevoContacto && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border-2 border-dashed border-gray-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Nombre *"
                    value={nuevoContacto.nombre}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, nombre: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    type="text"
                    placeholder="Cargo"
                    value={nuevoContacto.cargo}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, cargo: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={nuevoContacto.email}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, email: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    type="text"
                    placeholder="Teléfono"
                    value={nuevoContacto.telefono}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, telefono: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => { setShowNuevoContacto(false); setNuevoContacto({ nombre: '', cargo: '', email: '', telefono: '' }); }}
                    className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAgregarContacto}
                    className="px-3 py-1.5 bg-[#45ad98] text-white rounded-lg text-sm hover:bg-[#3a9482]"
                  >
                    Guardar Contacto
                  </button>
                </div>
              </div>
            )}

            {contactos.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay contactos registrados</p>
            ) : (
              <div className="space-y-2">
                {contactos.map((contacto) => (
                  <div key={contacto.id} className="bg-white border border-gray-200 rounded-xl p-3">
                    {editandoContacto?.id === contacto.id ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={editandoContacto.nombre}
                          onChange={(e) => setEditandoContacto({...editandoContacto, nombre: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Nombre"
                        />
                        <input
                          type="text"
                          value={editandoContacto.cargo || ''}
                          onChange={(e) => setEditandoContacto({...editandoContacto, cargo: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Cargo"
                        />
                        <input
                          type="email"
                          value={editandoContacto.email || ''}
                          onChange={(e) => setEditandoContacto({...editandoContacto, email: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Email"
                        />
                        <input
                          type="text"
                          value={editandoContacto.telefono || ''}
                          onChange={(e) => setEditandoContacto({...editandoContacto, telefono: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Teléfono"
                        />
                        <div className="md:col-span-2 flex justify-end space-x-2">
                          <button type="button" onClick={() => setEditandoContacto(null)} className="px-2 py-1 text-gray-600 text-sm">Cancelar</button>
                          <button type="button" onClick={handleGuardarEdicion} className="px-2 py-1 bg-[#45ad98] text-white rounded text-sm">Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-800">{contacto.nombre}</span>
                            {contacto.es_principal && (
                              <span className="px-2 py-0.5 bg-[#45ad98] text-white text-xs rounded-full">Principal</span>
                            )}
                            {contacto.cargo && <span className="text-gray-500 text-sm">• {contacto.cargo}</span>}
                          </div>
                          <div className="text-sm text-gray-600">
                            {contacto.email && <span className="mr-3">{contacto.email}</span>}
                            {contacto.telefono && <span>{contacto.telefono}</span>}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          {!contacto.es_principal && (
                            <button
                              type="button"
                              onClick={() => handleMarcarPrincipal(contacto.id)}
                              className="p-1.5 text-gray-400 hover:text-[#45ad98] hover:bg-gray-100 rounded"
                              title="Marcar como principal"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditandoContacto(contacto)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminarContacto(contacto.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
              rows="3"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              placeholder="Notas adicionales sobre el cliente..."
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Crear Cliente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal Editar Cliente (con gestión de contactos)
const EditarClienteModal = ({ cliente, onClose, onSave }) => {
  const [formData, setFormData] = useState(cliente);
  const [contactos, setContactos] = useState([]);
  const [loadingContactos, setLoadingContactos] = useState(true);
  const [nuevoContacto, setNuevoContacto] = useState({ nombre: '', cargo: '', email: '', telefono: '' });
  const [showNuevoContacto, setShowNuevoContacto] = useState(false);
  const [editandoContacto, setEditandoContacto] = useState(null);

  useEffect(() => {
    const loadContactos = async () => {
      try {
        setLoadingContactos(true);
        const data = await getContactosByCliente(cliente.id);
        setContactos(data || []);
      } catch (error) {
        console.error('Error cargando contactos:', error);
        setContactos([]);
      } finally {
        setLoadingContactos(false);
      }
    };
    loadContactos();
  }, [cliente.id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleAgregarContacto = async () => {
    if (!nuevoContacto.nombre.trim()) {
      alert('El nombre del contacto es requerido');
      return;
    }
    try {
      const contactoCreado = await createContacto({
        cliente_id: cliente.id,
        nombre: nuevoContacto.nombre,
        cargo: nuevoContacto.cargo || null,
        email: nuevoContacto.email || null,
        telefono: nuevoContacto.telefono || null,
        es_principal: contactos.length === 0
      });
      setContactos([...contactos, contactoCreado]);
      setNuevoContacto({ nombre: '', cargo: '', email: '', telefono: '' });
      setShowNuevoContacto(false);
    } catch (error) {
      console.error('Error creando contacto:', error);
      alert('Error al crear contacto');
    }
  };

  const handleEliminarContacto = async (contactoId) => {
    if (!confirm('¿Eliminar este contacto?')) return;
    try {
      await deleteContacto(contactoId);
      setContactos(contactos.filter(c => c.id !== contactoId));
    } catch (error) {
      console.error('Error eliminando contacto:', error);
      alert('Error al eliminar contacto');
    }
  };

  const handleGuardarEdicion = async () => {
    if (!editandoContacto.nombre.trim()) {
      alert('El nombre del contacto es requerido');
      return;
    }
    try {
      await updateContacto(editandoContacto.id, {
        nombre: editandoContacto.nombre,
        cargo: editandoContacto.cargo || null,
        email: editandoContacto.email || null,
        telefono: editandoContacto.telefono || null
      });
      setContactos(contactos.map(c => c.id === editandoContacto.id ? editandoContacto : c));
      setEditandoContacto(null);
    } catch (error) {
      console.error('Error actualizando contacto:', error);
      alert('Error al actualizar contacto');
    }
  };

  const handleMarcarPrincipal = async (contactoId) => {
    try {
      // Primero quitar principal de todos
      for (const c of contactos) {
        if (c.es_principal) {
          await updateContacto(c.id, { es_principal: false });
        }
      }
      // Marcar el nuevo como principal
      await updateContacto(contactoId, { es_principal: true });
      setContactos(contactos.map(c => ({ ...c, es_principal: c.id === contactoId })));
    } catch (error) {
      console.error('Error marcando contacto principal:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">Editar Cliente</h3>
              <p className="text-white/80 text-sm">Código: {cliente.codigo}</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Información Básica */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Información Básica</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={formData.razonSocial}
                  onChange={(e) => setFormData({...formData, razonSocial: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT *</label>
                <input
                  type="text"
                  required
                  value={formData.rut}
                  onChange={(e) => setFormData({...formData, rut: formatRutInput(e.target.value)})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Giro/Rubro *</label>
                <input
                  type="text"
                  required
                  value={formData.giro}
                  onChange={(e) => setFormData({...formData, giro: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Ubicación */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">Ubicación</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({...formData, direccion: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ciudad *</label>
                <input
                  type="text"
                  required
                  value={formData.ciudad}
                  onChange={(e) => setFormData({...formData, ciudad: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Comuna *</label>
                <input
                  type="text"
                  required
                  value={formData.comuna}
                  onChange={(e) => setFormData({...formData, comuna: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">País *</label>
                <input
                  type="text"
                  required
                  value={formData.pais}
                  onChange={(e) => setFormData({...formData, pais: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
            </div>
          </div>

          {/* Contactos */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800">Contactos</h4>
              <button
                type="button"
                onClick={() => setShowNuevoContacto(!showNuevoContacto)}
                className="flex items-center space-x-1 px-3 py-1.5 bg-[#45ad98] text-white rounded-lg text-sm hover:bg-[#3a9482] transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Contacto</span>
              </button>
            </div>

            {/* Formulario nuevo contacto */}
            {showNuevoContacto && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border-2 border-dashed border-gray-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Nombre *"
                    value={nuevoContacto.nombre}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, nombre: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    type="text"
                    placeholder="Cargo"
                    value={nuevoContacto.cargo}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, cargo: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={nuevoContacto.email}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, email: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                  <input
                    type="text"
                    placeholder="Teléfono"
                    value={nuevoContacto.telefono}
                    onChange={(e) => setNuevoContacto({...nuevoContacto, telefono: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98]"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => { setShowNuevoContacto(false); setNuevoContacto({ nombre: '', cargo: '', email: '', telefono: '' }); }}
                    className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAgregarContacto}
                    className="px-3 py-1.5 bg-[#45ad98] text-white rounded-lg text-sm hover:bg-[#3a9482]"
                  >
                    Guardar Contacto
                  </button>
                </div>
              </div>
            )}

            {/* Lista de contactos */}
            {loadingContactos ? (
              <p className="text-gray-500 text-sm">Cargando contactos...</p>
            ) : contactos.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay contactos registrados</p>
            ) : (
              <div className="space-y-2">
                {contactos.map((contacto) => (
                  <div key={contacto.id} className="bg-white border border-gray-200 rounded-xl p-3">
                    {editandoContacto?.id === contacto.id ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={editandoContacto.nombre}
                          onChange={(e) => setEditandoContacto({...editandoContacto, nombre: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Nombre"
                        />
                        <input
                          type="text"
                          value={editandoContacto.cargo || ''}
                          onChange={(e) => setEditandoContacto({...editandoContacto, cargo: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Cargo"
                        />
                        <input
                          type="email"
                          value={editandoContacto.email || ''}
                          onChange={(e) => setEditandoContacto({...editandoContacto, email: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Email"
                        />
                        <input
                          type="text"
                          value={editandoContacto.telefono || ''}
                          onChange={(e) => setEditandoContacto({...editandoContacto, telefono: e.target.value})}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Teléfono"
                        />
                        <div className="md:col-span-2 flex justify-end space-x-2">
                          <button type="button" onClick={() => setEditandoContacto(null)} className="px-2 py-1 text-gray-600 text-sm">Cancelar</button>
                          <button type="button" onClick={handleGuardarEdicion} className="px-2 py-1 bg-[#45ad98] text-white rounded text-sm">Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-800">{contacto.nombre}</span>
                            {contacto.es_principal && (
                              <span className="px-2 py-0.5 bg-[#45ad98] text-white text-xs rounded-full">Principal</span>
                            )}
                            {contacto.cargo && <span className="text-gray-500 text-sm">• {contacto.cargo}</span>}
                          </div>
                          <div className="text-sm text-gray-600">
                            {contacto.email && <span className="mr-3">{contacto.email}</span>}
                            {contacto.telefono && <span>{contacto.telefono}</span>}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          {!contacto.es_principal && (
                            <button
                              type="button"
                              onClick={() => handleMarcarPrincipal(contacto.id)}
                              className="p-1.5 text-gray-400 hover:text-[#45ad98] hover:bg-gray-100 rounded"
                              title="Marcar como principal"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditandoContacto(contacto)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminarContacto(contacto.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
              rows="3"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal Historial Cliente
const HistorialClienteModal = ({ cliente, onClose }) => {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistorial = async () => {
      try {
        setLoading(true);
        const data = await getCotizaciones();
        const filtradas = data
          .filter(cot => String(cot.cliente_id) === String(cliente.id))
          .map(cot => ({
            numero: cot.numero,
            fecha: cot.fecha,
            monto: parseFloat(cot.monto) || 0,
            estado: cot.estado
          }));
        setCotizaciones(filtradas);
      } catch (error) {
        console.error('Error cargando historial de cotizaciones:', error);
        setCotizaciones([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistorial();
  }, [cliente.id]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const getEstadoColor = (estado) => {
    switch(estado) {
      case 'emitida': return 'bg-blue-100 text-blue-800';
      case 'ganada': return 'bg-green-100 text-green-800';
      case 'perdida': return 'bg-red-100 text-red-800';
      case 'standby': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">Historial de Cotizaciones</h3>
              <p className="text-white/80">{cliente.razonSocial} - Código: {cliente.codigo}</p>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Cargando historial...</p>
            </div>
          ) : cotizaciones.length > 0 ? (
            <div className="space-y-4">
              {cotizaciones.map((cot) => (
                <div key={cot.numero} className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-lg" style={{ color: '#235250' }}>
                        Cotización #{cot.numero}
                      </p>
                      <p className="text-sm text-gray-600">{cot.fecha}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl text-gray-800">
                     {cot.monto < 1000 ? (
                       <span className="text-orange-600">Por Definir</span>
                       ) : (
                      formatCurrency(cot.monto)
                       )}
                      </p>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-1 ${getEstadoColor(cot.estado)}`}>
                        {cot.estado.charAt(0).toUpperCase() + cot.estado.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Este cliente aún no tiene cotizaciones</p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente de Módulo de Cotizaciones
const CotizacionesModule = ({
  onAdjudicarVenta,
  setSharedCotizaciones = () => {},
  sharedProtocolos = [],
  sharedOrdenesCompra = [],
  cotizacionParaAbrir = null,
  onLimpiarCotizacionParaAbrir = () => {},
  currentUserName,
  user
}) => {
const [showNewModal, setShowNewModal] = useState(false);
  const [showDetalleModal, setShowDetalleModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGanadaModal, setShowGanadaModal] = useState(false);
  const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState(null);
  const [cotizacionGanada, setCotizacionGanada] = useState(null);
  const [ganadaSeleccion, setGanadaSeleccion] = useState({});
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todas');
  const [confirmDeleteCot, setConfirmDeleteCot] = useState(null);
  const [documentoModal, setDocumentoModal] = useState({
    abierto: false,
    titulo: '',
    url: ''
  });
  const canEditDeleteCotizaciones = user?.role !== 'comercial';

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

// Cargar cotizaciones desde Supabase
  useEffect(() => {
    loadCotizaciones();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('cotizaciones-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => {
        loadCotizaciones();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!cotizacionParaAbrir || cotizaciones.length === 0) return;
    const cotizacionObjetivo = cotizaciones.find((cotizacion) => {
      if (cotizacionParaAbrir?.id && cotizacion.id === cotizacionParaAbrir.id) return true;
      if (cotizacionParaAbrir?.numero && String(cotizacion.numero) === String(cotizacionParaAbrir.numero)) return true;
      return false;
    });
    if (!cotizacionObjetivo) return;
    setCotizacionSeleccionada(cotizacionObjetivo);
    setShowDetalleModal(true);
    onLimpiarCotizacionParaAbrir?.();
  }, [cotizacionParaAbrir, cotizaciones, onLimpiarCotizacionParaAbrir]);

  const loadCotizaciones = async () => {
    try {
      setLoading(true);
      const data = await getCotizaciones();
      
      // Transformar datos de Supabase al formato del frontend
      const cotizacionesTransformadas = data.map(cot => ({
        id: cot.id,
        numero: cot.numero,
        fecha: cot.fecha,
        clienteId: cot.cliente_id || null,
        cliente: cot.clientes?.razon_social || 'Sin cliente',
        nombreProyecto: cot.nombre_proyecto,
        rut: cot.clientes?.rut || '',
        direccionCliente: cot.clientes?.direccion || cot.direccion || '',
        contactoCliente: cot.clientes?.persona_encargada || cot.contacto || '',
        unidadNegocio: cot.unidad_negocio,
        monto: parseFloat(cot.neto || cot.monto) || 0,
        neto: cot.neto !== undefined && cot.neto !== null ? parseFloat(cot.neto) : null,
        estado: cot.estado,
        cotizadoPor: cot.cotizado_por,
        condicionesPago: cot.condiciones_pago,
        items: cot.items || [],
        adjudicada_a_protocolo: cot.adjudicada_a_protocolo
      }));
      
      setCotizaciones(cotizacionesTransformadas);
      setSharedCotizaciones(cotizacionesTransformadas);
    } catch (error) {
      console.error('Error cargando cotizaciones:', error);
      alert('Error al cargar cotizaciones desde la base de datos');
    } finally {
      setLoading(false);
    }
  };

  const generarPDFCotizacion = async (cotizacion) => {
    try {
      await generarCotizacionPDF(cotizacion, null, cotizacion.items || []);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al generar PDF');
    }
  };

  // Estadísticas
  const stats = {
    total: cotizaciones.length,
    emitidas: cotizaciones.filter(c => c.estado === 'emitida').length,
    ganadas: cotizaciones.filter(c => c.estado === 'ganada').length,
    perdidas: cotizaciones.filter(c => c.estado === 'perdida').length,
    standby: cotizaciones.filter(c => c.estado === 'standby').length,
    montoTotal: cotizaciones.reduce((sum, c) => sum + c.monto, 0)
  };

  const cotizacionTieneOrdenCompra = (cot) => {
    const numeroCotizacion = normalizarNumero(cot?.numero);
    const folioProtocolo = cot?.adjudicada_a_protocolo ? String(cot.adjudicada_a_protocolo) : '';
    const protocoloRelacionado = folioProtocolo
      ? sharedProtocolos.find((p) => String(p.folio) === folioProtocolo)
      : null;
    const tieneOCCliente = Boolean(String(protocoloRelacionado?.ocCliente || '').trim());

    if (tieneOCCliente) {
      return true;
    }

    return sharedOrdenesCompra.some((oc) => {
      const numeroCotizacionOC = normalizarNumero(oc?.numeroCotizacion || oc?.numero_cotizacion);
      const codigoProtocoloOC = String(oc?.codigoProtocolo || oc?.codigo_protocolo || '');
      return (
        (numeroCotizacion && numeroCotizacionOC === numeroCotizacion) ||
        (folioProtocolo && codigoProtocoloOC === folioProtocolo)
      );
    });
  };

  // Filtrar cotizaciones
  const cotizacionesFiltradas = cotizaciones.filter(cot => {
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = cot.numero.includes(searchTerm) || 
                       cot.cliente.toLowerCase().includes(searchLower) ||
                       String(cot.nombreProyecto || '').toLowerCase().includes(searchLower);
    const matchEstado =
      filterEstado === 'todas' ||
      (filterEstado === 'sin_oc' ? !cotizacionTieneOrdenCompra(cot) : cot.estado === filterEstado);
    return matchSearch && matchEstado;
  });

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await updateCotizacion(id, { estado: nuevoEstado });
      await loadCotizaciones();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      alert('Error al cambiar estado');
    }
  };

  const getEstadoColor = (estado) => {
    switch(estado) {
      case 'emitida': return 'bg-blue-100 text-blue-800';
      case 'ganada': return 'bg-green-100 text-green-800';
      case 'perdida': return 'bg-red-100 text-red-800';
      case 'standby': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatMonto = (monto) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(monto);
  };

  const calcularSubtotalItems = (items = []) => {
    return items.reduce((sum, item) => {
      const cantidad = item.cantidad || 0;
      const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
      const descuento = item.descuento || 0;
      const subtotal = cantidad * valorUnitario;
      return sum + (subtotal - (subtotal * (descuento / 100)));
    }, 0);
  };

  const obtenerNetoCotizacion = (cot) => {
    if (cot.items && cot.items.length) return calcularSubtotalItems(cot.items);
    if (!cot.monto) return 0;
    return cot.monto;
  };

  const montoNetoFiltrado = cotizacionesFiltradas.reduce(
    (sum, cot) => sum + obtenerNetoCotizacion(cot),
    0
  );

  const calcularTotalesItems = (items = []) => {
    const subtotal = calcularSubtotalItems(items);
    const iva = subtotal * 0.19;
    const total = subtotal + iva;
    return { subtotal, iva, total };
  };

  const getOCClienteDeCotizacion = (cot) => {
    if (!cot.adjudicada_a_protocolo) return null;
    const protocolo = sharedProtocolos.find(
      (p) => String(p.folio) === String(cot.adjudicada_a_protocolo)
    );
    return protocolo?.ocCliente || null;
  };

  const getProtocoloDeCotizacion = (cot) => {
    if (!cot?.adjudicada_a_protocolo) return null;
    return sharedProtocolos.find(
      (p) => String(p.folio) === String(cot.adjudicada_a_protocolo)
    ) || null;
  };

  const abrirDocumentoModal = (titulo, url) => {
    if (!url) {
      alert('No hay documento asociado.');
      return;
    }
    setDocumentoModal({
      abierto: true,
      titulo,
      url
    });
  };

  const abrirModalGanada = (cotizacion) => {
    const seleccionInicial = {};
    (cotizacion.items || []).forEach((_, index) => {
      seleccionInicial[index] = true;
    });
    setGanadaSeleccion(seleccionInicial);
    setCotizacionGanada(cotizacion);
    setShowGanadaModal(true);
  };

  const confirmarGanada = async () => {
    if (!cotizacionGanada) return;
    const itemsOriginales = cotizacionGanada.items || [];
    const itemsSeleccionados = itemsOriginales.filter((_, index) => ganadaSeleccion[index]);
    if (itemsSeleccionados.length === 0) {
      alert('Selecciona al menos un item ganado.');
      return;
    }
    try {
      const { subtotal } = calcularTotalesItems(itemsSeleccionados);
      await updateCotizacion(cotizacionGanada.id, {
        estado: 'ganada',
        items: itemsSeleccionados,
        neto: subtotal,
        monto: subtotal
      });
      await loadCotizaciones();
      setShowGanadaModal(false);
      setCotizacionGanada(null);
    } catch (error) {
      console.error('Error actualizando cotización:', error);
      alert('Error al marcar como ganada');
    }
  };

  const toggleItemGanado = (index) => {
    setGanadaSeleccion(prev => ({ ...prev, [index]: !prev[index] }));
  };
  
// Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#45ad98] mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando cotizaciones...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Cotizaciones</h2>
          <p className="text-gray-600">Gestión de cotizaciones y propuestas comerciales</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center space-x-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
        >
          <FileText className="w-5 h-5" />
          <span>Nueva Cotización</span>
        </button>
      </div>

      {/* Mini Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow">
          <p className="text-sm text-gray-500 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow">
          <p className="text-sm text-gray-500 mb-1">Total Neto</p>
          <p className="text-lg font-bold text-gray-800">{formatMonto(montoNetoFiltrado)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow">
          <p className="text-sm text-blue-600 mb-1">Emitidas</p>
          <p className="text-2xl font-bold text-blue-800">{stats.emitidas}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow">
          <p className="text-sm text-green-600 mb-1">Ganadas</p>
          <p className="text-2xl font-bold text-green-800">{stats.ganadas}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 shadow">
          <p className="text-sm text-red-600 mb-1">Perdidas</p>
          <p className="text-2xl font-bold text-red-800">{stats.perdidas}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 shadow">
          <p className="text-sm text-yellow-600 mb-1">Standby</p>
          <p className="text-2xl font-bold text-yellow-800">{stats.standby}</p>
        </div>
      </div>

      {/* Búsqueda y Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
          >
            <option value="todas">Todos los estados</option>
            <option value="emitida">Emitidas</option>
            <option value="ganada">Ganadas</option>
            <option value="perdida">Perdidas</option>
            <option value="standby">Standby</option>
            <option value="sin_oc">Sin OC</option>
          </select>
        </div>
      </div>

      {/* Listado de Cotizaciones */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead style={{ backgroundColor: '#45ad98' }}>
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">N° Cotización</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Fecha</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Cliente</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Nombre Proyecto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Unidad Negocio</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Neto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">IVA</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Total</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">OC Cliente</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Responsable</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Estado</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-6 py-8 text-center text-gray-500">
                    Cargando cotizaciones...
                  </td>
                </tr>
              ) : cotizacionesFiltradas.map((cot) => (
                <tr key={cot.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono font-semibold text-gray-800">#{cot.numero}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{cot.fecha}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-gray-800">{cot.cliente}</p>
                      <p className="text-sm text-gray-500">{cot.rut}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-800">{cot.nombreProyecto || 'Sin nombre'}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{cot.unidadNegocio}</td>
                  {(() => {
                    const neto = obtenerNetoCotizacion(cot);
                    const iva = neto * 0.19;
                    const total = neto + iva;
                    return (
                      <>
                        <td className="px-6 py-4 font-semibold text-gray-800">{formatMonto(neto)}</td>
                        <td className="px-6 py-4 font-semibold text-gray-800">{formatMonto(iva)}</td>
                        <td className="px-6 py-4 font-semibold text-gray-800">{formatMonto(total)}</td>
                      </>
                    );
                  })()}
                  <td className="px-6 py-4">
                    {(() => {
                      const protocolo = getProtocoloDeCotizacion(cot);
                      const ocCliente = getOCClienteDeCotizacion(cot);
                      const ocDocUrl = protocolo?.ocClienteDocUrl || '';
                      return ocCliente ? (
                        ocDocUrl ? (
                          <button
                            type="button"
                            onClick={() => abrirDocumentoModal(`OC Cliente ${ocCliente}`, ocDocUrl)}
                            className="font-medium text-[#235250] underline underline-offset-2 hover:text-[#45ad98] transition-colors"
                          >
                            {ocCliente}
                          </button>
                        ) : (
                          <span className="font-medium text-gray-700">{ocCliente}</span>
                        )
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    {cot.cotizadoPor || '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getEstadoColor(cot.estado)}`}>
                      {cot.estado.charAt(0).toUpperCase() + cot.estado.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      {cot.estado === 'emitida' && (
                        <>
                          <button
                            onClick={() => abrirModalGanada(cot)}
                            className="p-2 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                            title="Marcar como Ganada"
                          >
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </button>
                          <button
                            onClick={() => cambiarEstado(cot.id, 'perdida')}
                            className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                            title="Marcar como Perdida"
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                          </button>
                          <button
                            onClick={() => cambiarEstado(cot.id, 'standby')}
                            className="p-2 bg-yellow-100 hover:bg-yellow-200 rounded-lg transition-colors"
                            title="Marcar como Standby"
                          >
                            <Pause className="w-4 h-4 text-yellow-600" />
                          </button>
                        </>
                      )}
                      {/* Crear Protocolo (solo si está ganada) */}
                      {cot.estado === 'ganada' && (
                        <button
                          onClick={() => onAdjudicarVenta(cot)}
                          className="p-2 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                          title="Crear Protocolo"
                        >
                          <Package className="w-4 h-4 text-purple-600" />
                        </button>
                      )}
                      {/* Ver Detalle */}
                      <button
                        onClick={() => {
                          setCotizacionSeleccionada(cot);
                          setShowDetalleModal(true);
                        }}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Ver Detalle"
                      >
                        <FileText className="w-4 h-4 text-gray-600" />
                      </button>
                      {canEditDeleteCotizaciones && (
                        <button
                          onClick={() => {
                            setCotizacionSeleccionada(cot);
                            setShowEditModal(true);
                          }}
                          className="p-2 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
                          title="Editar Cotización"
                        >
                          <Settings className="w-4 h-4 text-orange-600" />
                        </button>
                      )}
                      {/* Descargar PDF */}
                      <button
                        onClick={() => generarPDFCotizacion(cot)}
                        className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                        title="Descargar PDF"
                      >
                        <Download className="w-4 h-4 text-blue-600" />
                      </button>
                      {canEditDeleteCotizaciones && (
                        <button
                          onClick={() => setConfirmDeleteCot(cot)}
                          className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                          title="Eliminar Cotización"
                        >
                          <XCircle className="w-4 h-4 text-red-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && cotizacionesFiltradas.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500">No se encontraron cotizaciones</p>
          </div>
        )}
      </div>

      {documentoModal.abierto && (
        <DocumentoPDFModal
          titulo={documentoModal.titulo}
          url={documentoModal.url}
          onClose={() => setDocumentoModal({ abierto: false, titulo: '', url: '' })}
        />
      )}

      {/* Modal Nueva Cotización */}
      {showNewModal && (
        <NuevaCotizacionModal 
          onClose={() => setShowNewModal(false)}
          currentUserName={currentUserName}
          onSave={async (nuevaCotizacion) => {
            try {
              // Preparar datos para Supabase
              const cotizacionData = {
                numero: nuevaCotizacion.numero,
                fecha: nuevaCotizacion.fecha,
                cliente_id: nuevaCotizacion.clienteId || null,
                nombre_proyecto: nuevaCotizacion.nombreProyecto,
                unidad_negocio: nuevaCotizacion.unidadNegocio,
                condiciones_pago: nuevaCotizacion.condicionesPago,
                monto: nuevaCotizacion.monto,
                estado: 'emitida',
                cotizado_por: nuevaCotizacion.cotizadoPor,
                items: nuevaCotizacion.items || []
              };

              // Guardar en Supabase
              await createCotizacion(cotizacionData);
              
              // Recargar cotizaciones
              await loadCotizaciones();
              
              setShowNewModal(false);
              alert('Cotización guardada exitosamente');
            } catch (error) {
              console.error('Error guardando cotización:', error);
              alert('Error al guardar la cotización');
            }
          }}
        />
      )}
      
      {/* Modal Ver Detalle */}
      {showDetalleModal && cotizacionSeleccionada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white">Detalle Cotización #{cotizacionSeleccionada.numero}</h3>
                <button onClick={() => setShowDetalleModal(false)} className="text-white hover:bg-white/20 p-2 rounded-lg">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Cliente</p>
                  <p className="font-bold text-lg">{cotizacionSeleccionada.cliente}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Nombre Proyecto</p>
                  <p className="font-bold text-lg">{cotizacionSeleccionada.nombreProyecto}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">RUT</p>
                  <p className="font-semibold">{cotizacionSeleccionada.rut}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Unidad de Negocio</p>
                  <p className="font-semibold">{cotizacionSeleccionada.unidadNegocio}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fecha</p>
                  <p className="font-semibold">{cotizacionSeleccionada.fecha}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Monto</p>
                  <p className="font-bold text-2xl" style={{color: '#235250'}}>{formatCurrency(cotizacionSeleccionada.monto)}</p>
                </div>
              </div>

              <div className="mt-8">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Items</h4>
                {cotizacionSeleccionada.items && cotizacionSeleccionada.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Item</th>
                          <th className="px-3 py-2 text-left font-semibold">Cantidad</th>
                          <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                          <th className="px-3 py-2 text-left font-semibold">V. Unitario</th>
                          <th className="px-3 py-2 text-left font-semibold">Descuento %</th>
                          <th className="px-3 py-2 text-left font-semibold">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {cotizacionSeleccionada.items.map((item, index) => {
                          const cantidad = item.cantidad || 0;
                          const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
                          const descuento = item.descuento || 0;
                          const subtotal = (cantidad * valorUnitario) * (1 - descuento / 100);
                          return (
                            <tr key={item.id || index} className="hover:bg-gray-50">
                              <td className="px-3 py-2">{item.item || `Item ${index + 1}`}</td>
                              <td className="px-3 py-2">{cantidad}</td>
                              <td className="px-3 py-2">{item.descripcion || '-'}</td>
                              <td className="px-3 py-2">{formatCurrency(valorUnitario)}</td>
                              <td className="px-3 py-2">{descuento}%</td>
                              <td className="px-3 py-2 font-semibold">{formatCurrency(subtotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
                    No hay items registrados en esta cotización.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Editar */}
      {showEditModal && cotizacionSeleccionada && canEditDeleteCotizaciones && (
        <EditarCotizacionModal
          cotizacion={cotizacionSeleccionada}
          onClose={() => {
            setShowEditModal(false);
            setCotizacionSeleccionada(null);
          }}
          onSave={async (updates) => {
            if (!canEditDeleteCotizaciones) {
              alert('El rol Comercial no puede editar cotizaciones.');
              return;
            }
            try {
              await updateCotizacion(cotizacionSeleccionada.id, updates);
              const protocolosActuales = await getProtocolos();
              const protocoloRelacionado = protocolosActuales.find(p =>
                (cotizacionSeleccionada.adjudicada_a_protocolo && String(p.folio) === String(cotizacionSeleccionada.adjudicada_a_protocolo)) ||
                String(p.numero_cotizacion) === String(cotizacionSeleccionada.numero)
              );
              if (protocoloRelacionado) {
                const protocoloUpdates = {};
                if (updates.nombre_proyecto) protocoloUpdates.nombre_proyecto = updates.nombre_proyecto;
                if (updates.unidad_negocio) protocoloUpdates.unidad_negocio = updates.unidad_negocio;
                const netoActualizado = Number(updates.neto ?? updates.monto) || 0;
                protocoloUpdates.monto_neto = netoActualizado;
                protocoloUpdates.monto_total = netoActualizado * 1.19;
                await updateProtocolo(protocoloRelacionado.id, protocoloUpdates);
              }
              await loadCotizaciones();
              setShowEditModal(false);
              setCotizacionSeleccionada(null);
              alert('Cotización actualizada');
            } catch (error) {
              console.error('Error actualizando cotización:', error);
              alert('Error al actualizar la cotización');
            }
          }}
        />
      )}

      {showGanadaModal && cotizacionGanada && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b flex-shrink-0" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white">
                  Items ganados - Cotización #{cotizacionGanada.numero}
                </h3>
                <button
                  onClick={() => {
                    setShowGanadaModal(false);
                    setCotizacionGanada(null);
                  }}
                  className="text-white hover:bg-white/20 p-2 rounded-lg"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {cotizacionGanada.items && cotizacionGanada.items.length > 0 ? (
                <div className="space-y-3">
                  {cotizacionGanada.items.map((item, index) => {
                    const cantidad = item.cantidad || 0;
                    const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
                    const descuento = item.descuento || 0;
                    const subtotal = (cantidad * valorUnitario) * (1 - descuento / 100);
                    return (
                      <label
                        key={item.id || index}
                        className="flex items-start justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-start space-x-3">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={!!ganadaSeleccion[index]}
                            onChange={() => toggleItemGanado(index)}
                          />
                          <div>
                            <p className="font-semibold text-gray-800">{item.item || `Item ${index + 1}`}</p>
                            <p className="text-sm text-gray-600">{item.descripcion || '-'}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Cantidad: {cantidad} · V. Unitario: {formatMonto(valorUnitario)} · Desc: {descuento}%
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold text-gray-700">
                          {formatMonto(subtotal)}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                  Esta cotización no tiene items registrados.
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end space-x-3 flex-shrink-0">
              <button
                onClick={() => {
                  setShowGanadaModal(false);
                  setCotizacionGanada(null);
                }}
                className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarGanada}
                className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all"
                style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
              >
                Confirmar Ganada
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteCot && (
        <ConfirmDialog
          message={`¿Está seguro de eliminar la Cotización #${confirmDeleteCot.numero}? Esta acción no se puede deshacer.`}
          onConfirm={async () => {
            const cot = confirmDeleteCot;
            setConfirmDeleteCot(null);
            try {
              await deleteCotizacion(cot.id);
              await loadCotizaciones();
            } catch (error) {
              console.error('Error:', error);
              alert('Error al eliminar');
            }
          }}
          onCancel={() => setConfirmDeleteCot(null)}
        />
      )}
    </div>
  );
};

const EditarCotizacionModal = ({ cotizacion, onClose, onSave }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState({
    fecha: cotizacion.fecha || new Date().toISOString().split('T')[0],
    nombreProyecto: cotizacion.nombreProyecto || '',
    unidadNegocio: cotizacion.unidadNegocio || '',
    condicionesPago: cotizacion.condicionesPago || '',
    cotizadoPor: cotizacion.cotizadoPor || '',
    monto: cotizacion.monto || 0,
    estado: cotizacion.estado || 'emitida',
    items: (cotizacion.items || []).map((item, index) => ({
      id: item.id || index + 1,
      item: item.item || '',
      cantidad: item.cantidad || 1,
      descripcion: item.descripcion || '',
      valorUnitario: item.valorUnitario ?? item.valor_unitario ?? 0,
      descuento: item.descuento || 0
    }))
  });

  useEffect(() => {
    setFormData({
      fecha: cotizacion.fecha || new Date().toISOString().split('T')[0],
      nombreProyecto: cotizacion.nombreProyecto || '',
      unidadNegocio: cotizacion.unidadNegocio || '',
      condicionesPago: cotizacion.condicionesPago || '',
      cotizadoPor: cotizacion.cotizadoPor || '',
      monto: cotizacion.monto || 0,
      estado: cotizacion.estado || 'emitida',
      items: (cotizacion.items || []).map((item, index) => ({
        id: item.id || index + 1,
        item: item.item || '',
        cantidad: item.cantidad || 1,
        descripcion: item.descripcion || '',
        valorUnitario: item.valorUnitario ?? item.valor_unitario ?? 0,
        descuento: item.descuento || 0
      }))
    });
  }, [cotizacion]);

  const agregarItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        id: prev.items.length + 1,
        item: '',
        cantidad: 0,
        descripcion: '',
        valorUnitario: 0,
        descuento: 0
      }]
    }));
  };

  const eliminarItem = (id) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const actualizarItem = (id, campo, valor) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === id ? { ...item, [campo]: valor } : item
      )
    }));
  };

  const calcularSubtotalItem = (item) => {
    const cantidad = parseFloat(String(item.cantidad || 0).replace(',', '.')) || 0;
    const subtotal = cantidad * item.valorUnitario;
    const descuento = subtotal * (item.descuento / 100);
    return subtotal - descuento;
  };

  const calcularTotales = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + calcularSubtotalItem(item), 0);
    const iva = subtotal * 0.19;
    const total = subtotal + iva;
    return { subtotal, iva, total };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSaving) return;
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    setShowConfirm(false);
    setIsSaving(true);
    try {
      const { subtotal } = calcularTotales();
      await onSave({
        fecha: formData.fecha,
        nombre_proyecto: formData.nombreProyecto,
        unidad_negocio: formData.unidadNegocio,
        condiciones_pago: formData.condicionesPago,
        cotizado_por: formData.cotizadoPor,
        neto: subtotal,
        monto: subtotal,
        estado: formData.estado,
        items: (formData.items || []).map(item => ({
          ...item,
          cantidad: parseFloat(String(item.cantidad || 0).replace(',', '.')) || 0,
          valorUnitario: Number(item.valorUnitario) || 0,
          descuento: Number(item.descuento) || 0
        }))
      });
    } finally {
      setIsSaving(false);
    }
  };

  const totales = calcularTotales();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="p-6 border-b" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Editar Cotización #{cotizacion.numero}</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(90vh-140px)] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha</label>
              <input
                type="date"
                value={formData.fecha}
                onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Estado</label>
              <select
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
              >
                <option value="emitida">Emitida</option>
                <option value="ganada">Ganada</option>
                <option value="perdida">Perdida</option>
                <option value="standby">Standby</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre Proyecto</label>
            <input
              type="text"
              value={formData.nombreProyecto}
              onChange={(e) => setFormData({ ...formData, nombreProyecto: e.target.value })}
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Unidad de Negocio</label>
              <select
                value={formData.unidadNegocio}
                onChange={(e) => setFormData({ ...formData, unidadNegocio: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
              >
                <option value="">Seleccione...</option>
                {BUSINESS_UNITS.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Monto Total</label>
              <input
                type="number"
                min="0"
                value={totales.total}
                readOnly
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Condiciones de Pago</label>
              <input
                type="text"
                value={formData.condicionesPago}
                onChange={(e) => setFormData({ ...formData, condicionesPago: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cotizado Por</label>
              <input
                type="text"
                value={formData.cotizadoPor}
                onChange={(e) => setFormData({ ...formData, cotizadoPor: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              />
            </div>
          </div>

          {/* Items */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                <Package className="w-5 h-5 mr-2 text-[#45ad98]" />
                Items
              </h4>
              <button
                type="button"
                onClick={agregarItem}
                className="px-4 py-2 bg-[#45ad98] text-white rounded-lg hover:bg-[#235250] transition-colors text-sm font-semibold"
              >
                + Agregar Item
              </button>
            </div>

            <div className="space-y-4">
              {formData.items.map((item, index) => (
                <div key={item.id} className="bg-gray-50 p-4 rounded-xl">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Item #{index + 1}</span>
                    {formData.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => eliminarItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Item</label>
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => actualizarItem(item.id, 'item', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.cantidad === 0 ? '' : item.cantidad}
                        onChange={(e) => actualizarItem(item.id, 'cantidad', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
                      <textarea
                        value={item.descripcion}
                        onChange={(e) => actualizarItem(item.id, 'descripcion', e.target.value)}
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">V. Unitario</label>
                      <input
                        type="number"
                        min="0"
                        value={item.valorUnitario === 0 ? '' : item.valorUnitario}
                        onChange={(e) =>
                          actualizarItem(
                            item.id,
                            'valorUnitario',
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') actualizarItem(item.id, 'valorUnitario', 0);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Descuento %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.descuento}
                        onChange={(e) => actualizarItem(item.id, 'descuento', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-sm font-semibold text-gray-700">
                      Subtotal: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(calcularSubtotalItem(item))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="bg-gray-50 rounded-xl p-6 mb-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">Subtotal:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">IVA 19%:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.iva)}
              </span>
            </div>
            <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
              <span className="text-gray-800 font-bold text-lg">TOTAL:</span>
              <span className="text-2xl font-bold" style={{ color: '#235250' }}>
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.total)}
              </span>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
        {showConfirm && (
          <ConfirmDialog
            message="¿Está seguro de guardar los cambios en esta Cotización?"
            onConfirm={handleConfirmSave}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </div>
    </div>
  );
};

// Componente Modal para Nueva Cotización
const NuevaCotizacionModal = ({ onClose, onSave, currentUserName }) => {
  const [formData, setFormData] = useState({
    codigoCliente: '',
    clienteId: null,
    cliente: '',
    nombreProyecto: '',
    razonSocial: '',
    rut: '',
    direccion: '',
    contacto: '',
    contactoId: null,
    telefono: '',
    fecha: new Date().toISOString().split('T')[0],
    condicionesPago: '',
    cotizadoPor: currentUserName || '',
    unidadNegocio: '',
    observaciones: '',
    items: [
      { id: 1, item: '', cantidad: 0, descripcion: '', valorUnitario: 0, descuento: 0 }
    ]
  });

  useEffect(() => {
    if (!currentUserName) return;
    setFormData(prev => (prev.cotizadoPor ? prev : { ...prev, cotizadoPor: currentUserName }));
  }, [currentUserName]);

  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [clientesError, setClientesError] = useState('');
  const [showClienteAutocomplete, setShowClienteAutocomplete] = useState(false);
  const [contactosCliente, setContactosCliente] = useState([]);
  const [loadingContactos, setLoadingContactos] = useState(false);

  useEffect(() => {
    const loadClientes = async () => {
      try {
        setClientesError('');
        const data = await getClientes();
        const transformados = data.map(c => ({
          id: c.id,
          codigo: c.codigo,
          razonSocial: c.razon_social,
          rut: c.rut,
          direccion: c.direccion,
          contacto: c.persona_encargada,
          telefono: c.telefono
        }));
        setClientes(transformados);
      } catch (error) {
        console.error('Error cargando clientes:', error);
        setClientesError('No se pudieron cargar los clientes');
      }
    };

    loadClientes();
  }, []);

  const cargarContactosCliente = async (clienteId) => {
    if (!clienteId) {
      setContactosCliente([]);
      return;
    }
    try {
      setLoadingContactos(true);
      const contactos = await getContactosByCliente(clienteId);
      setContactosCliente(contactos || []);
      // Si hay un contacto principal, seleccionarlo automáticamente
      const principal = contactos?.find(c => c.es_principal);
      if (principal) {
        setFormData(prev => ({
          ...prev,
          contacto: principal.nombre,
          contactoId: principal.id,
          telefono: principal.telefono || prev.telefono
        }));
      }
    } catch (error) {
      console.error('Error cargando contactos:', error);
      setContactosCliente([]);
    } finally {
      setLoadingContactos(false);
    }
  };

  const buscarCliente = (codigo) => {
    const codigoNormalizado = codigo.trim();
    if (!codigoNormalizado) return;
    const cliente = clientes.find(c => String(c.codigo) === codigoNormalizado);
    if (cliente) {
      setFormData(prev => ({
        ...prev,
        codigoCliente: codigo,
        clienteId: cliente.id,
        cliente: cliente.razonSocial,
        razonSocial: cliente.razonSocial,
        rut: cliente.rut,
        direccion: cliente.direccion,
        contacto: cliente.contacto,
        contactoId: null,
        telefono: cliente.telefono
      }));
      cargarContactosCliente(cliente.id);
    }
  };

  const seleccionarCliente = (cliente) => {
    setFormData(prev => ({
      ...prev,
      codigoCliente: cliente.codigo,
      clienteId: cliente.id,
      cliente: cliente.razonSocial,
      razonSocial: cliente.razonSocial,
      rut: cliente.rut,
      direccion: cliente.direccion,
      contacto: cliente.contacto,
      contactoId: null,
      telefono: cliente.telefono
    }));
    setShowClienteAutocomplete(false);
    cargarContactosCliente(cliente.id);
  };

  const seleccionarContacto = (contactoId) => {
    if (!contactoId) {
      setFormData(prev => ({ ...prev, contacto: '', contactoId: null, telefono: '' }));
      return;
    }
    const contacto = contactosCliente.find(c => c.id === contactoId);
    if (contacto) {
      setFormData(prev => ({
        ...prev,
        contacto: contacto.nombre,
        contactoId: contacto.id,
        telefono: contacto.telefono || prev.telefono
      }));
    }
  };

  const agregarItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        id: prev.items.length + 1,
        item: '',
        cantidad: 0,
        descripcion: '',
        valorUnitario: 0,
        descuento: 0
      }]
    }));
  };

  const eliminarItem = (id) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const actualizarItem = (id, campo, valor) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === id ? { ...item, [campo]: valor } : item
      )
    }));
  };

  const calcularSubtotalItem = (item) => {
    const cantidad = parseFloat(String(item.cantidad || 0).replace(',', '.')) || 0;
    const subtotal = cantidad * item.valorUnitario;
    const descuento = subtotal * (item.descuento / 100);
    return subtotal - descuento;
  };

  const calcularTotales = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + calcularSubtotalItem(item), 0);
    const iva = subtotal * 0.19;
    const total = subtotal + iva;
    return { subtotal, iva, total };
  };

  const resolverClienteId = () => {
    if (formData.clienteId) return formData.clienteId;
    const codigo = String(formData.codigoCliente || '').trim();
    if (codigo) {
      const byCodigo = clientes.find(c => String(c.codigo) === codigo);
      if (byCodigo) return byCodigo.id;
    }
    const nombre = String(formData.razonSocial || formData.cliente || '').trim().toLowerCase();
    if (!nombre) return null;
    const exact = clientes.find(c => c.razonSocial.toLowerCase() === nombre);
    if (exact) return exact.id;
    const starts = clientes.filter(c => c.razonSocial.toLowerCase().startsWith(nombre));
    if (starts.length === 1) return starts[0].id;
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    try {
      const clienteId = resolverClienteId();
      if (!clienteId) {
        alert('Selecciona un cliente de la lista o búscalo por código.');
        return;
      }
      const cotizaciones = await getCotizaciones();
      const ultimoNumero = cotizaciones.length > 0
        ? Math.max(...cotizaciones.map(c => parseInt(c.numero) || 5540))
        : 5540;
      const { subtotal } = calcularTotales();
      const nuevaCotizacion = {
        numero: `${ultimoNumero + 1}`,
        ...formData,
        clienteId,
        neto: subtotal,
        monto: subtotal,
        estado: 'emitida',
        items: (formData.items || []).map(item => ({
          ...item,
          cantidad: parseFloat(String(item.cantidad || 0).replace(',', '.')) || 0,
          valorUnitario: Number(item.valorUnitario) || 0,
          descuento: Number(item.descuento) || 0
        }))
      };
      setPendingData(nuevaCotizacion);
      setShowConfirm(true);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al preparar cotización');
    }
  };

  const handleConfirmCreate = async () => {
    setShowConfirm(false);
    if (!pendingData || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(pendingData);
    } finally {
      setIsSaving(false);
      setPendingData(null);
    }
  };

  const totales = calcularTotales();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8">
        <div className="p-6 border-b border-gray-200" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Nueva Cotización</h3>
            <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Datos del Cliente */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2 text-[#45ad98]" />
              Datos del Cliente
            </h4>
            
            {/* Campo de Código de Cliente */}
            <div className="mb-4 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
              <label className="block text-sm font-semibold text-blue-800 mb-2">
                🔍 Código de Cliente (Ingresa el código para autocompletar)
              </label>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={formData.codigoCliente}
                  onChange={(e) => setFormData({...formData, codigoCliente: e.target.value, clienteId: null})}
                  onBlur={(e) => buscarCliente(e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-blue-300 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-lg font-bold"
                  placeholder="Ej: 1000"
                />
                <button
                  type="button"
                  onClick={() => buscarCliente(formData.codigoCliente)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  Buscar
                </button>
              </div>
              {clientesError && (
                <p className="text-xs text-red-600 mt-2">{clientesError}</p>
              )}
              <p className="text-xs text-blue-600 mt-2">
                💡 Tip: Ingresa el código de 4 dígitos del cliente para llenar automáticamente sus datos
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Razón Social *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formData.razonSocial}
                    onChange={(e) => {
                      setFormData({...formData, razonSocial: e.target.value, cliente: e.target.value, clienteId: null});
                      setShowClienteAutocomplete(true);
                    }}
                    onFocus={() => setShowClienteAutocomplete(true)}
                    onBlur={() => setTimeout(() => setShowClienteAutocomplete(false), 150)}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  />
                  {showClienteAutocomplete && formData.razonSocial && (
                    <div className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {clientes
                        .filter(c =>
                          c.razonSocial.toLowerCase().includes(formData.razonSocial.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => seleccionarCliente(c)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-50"
                          >
                            <span className="font-semibold">{c.razonSocial}</span>
                            <span className="text-xs text-gray-500 ml-2">Cód: {c.codigo}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">RUT *</label>
                <input
                  type="text"
                  required
                  value={formData.rut}
                  onChange={(e) => setFormData({...formData, rut: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="12.345.678-9"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nombre del Proyecto * 
                <span className="text-xs text-gray-500 ml-2">Para identificar rápidamente</span>
              </label>
              <input
                type="text"
                required
                value={formData.nombreProyecto}
                onChange={(e) => setFormData({...formData, nombreProyecto: e.target.value})}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                placeholder="Ej: Stand Feria Inmobiliaria 2025"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección</label>
                <input
                  type="text"
                  value={formData.direccion}
                  onChange={(e) => setFormData({...formData, direccion: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Contacto</label>
                {loadingContactos ? (
                  <div className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm">
                    Cargando contactos...
                  </div>
                ) : contactosCliente.length > 0 ? (
                  <select
                    value={formData.contactoId || ''}
                    onChange={(e) => seleccionarContacto(e.target.value)}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                  >
                    <option value="">Seleccionar contacto...</option>
                    {contactosCliente.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}{c.cargo ? ` - ${c.cargo}` : ''}{c.es_principal ? ' (Principal)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.contacto}
                    onChange={(e) => setFormData({...formData, contacto: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                    placeholder="Nombre del contacto"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">N° Contacto</label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                  placeholder="+56 9 1234 5678"
                  readOnly={formData.contactoId && contactosCliente.length > 0}
                />
              </div>
            </div>
          </div>

          {/* Datos de la Cotización */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-[#45ad98]" />
              Datos de la Cotización
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Unidad de Negocio *</label>
                <select
                  required
                  value={formData.unidadNegocio}
                  onChange={(e) => setFormData({...formData, unidadNegocio: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                  style={{ fontWeight: '600' }}
                >
                  <option value="">Seleccione...</option>
                  {BUSINESS_UNITS.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">📊 Para análisis interno (no sale en PDF)</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha *</label>
                <input
                  type="date"
                  required
                  value={formData.fecha}
                  onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Cotizado por *</label>
                <input
                  type="text"
                  required
                  value={formData.cotizadoPor}
                  onChange={(e) => setFormData({...formData, cotizadoPor: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Condiciones de Pago *</label>
                <select
                  required
                  value={formData.condicionesPago}
                  onChange={(e) => setFormData({...formData, condicionesPago: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option value="">Seleccione...</option>
                  <option value="Contado">Contado</option>
                  <option value="50% Adelanto">50% Adelanto</option>
                  <option value="Crédito 30 días">Crédito 30 días</option>
                  <option value="Crédito 60 días">Crédito 60 días</option>
                  <option value="Crédito 90 días">Crédito 90 días</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                <Package className="w-5 h-5 mr-2 text-[#45ad98]" />
                Items
              </h4>
              <button
                type="button"
                onClick={agregarItem}
                className="px-4 py-2 bg-[#45ad98] text-white rounded-lg hover:bg-[#235250] transition-colors text-sm font-semibold"
              >
                + Agregar Item
              </button>
            </div>

            <div className="space-y-4">
              {formData.items.map((item, index) => (
                <div key={item.id} className="bg-gray-50 p-4 rounded-xl">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">Item #{index + 1}</span>
                    {formData.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => eliminarItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Item</label>
                      <input
                        type="text"
                        value={item.item}
                        onChange={(e) => actualizarItem(item.id, 'item', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Cantidad</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.cantidad === 0 ? '' : item.cantidad}
                        onChange={(e) => actualizarItem(item.id, 'cantidad', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
                      <textarea
                        value={item.descripcion}
                        onChange={(e) => actualizarItem(item.id, 'descripcion', e.target.value)}
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">V. Unitario</label>
                      <input
                        type="number"
                        min="0"
                        value={item.valorUnitario === 0 ? '' : item.valorUnitario}
                        onChange={(e) =>
                          actualizarItem(
                            item.id,
                            'valorUnitario',
                            e.target.value === '' ? '' : Number(e.target.value)
                          )
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') actualizarItem(item.id, 'valorUnitario', 0);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Descuento %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.descuento}
                        onChange={(e) => actualizarItem(item.id, 'descuento', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#45ad98] text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-sm font-semibold text-gray-700">
                      Subtotal: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(calcularSubtotalItem(item))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Observaciones */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Observaciones</label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({...formData, observaciones: e.target.value})}
              rows="3"
              className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98]"
              placeholder="Información adicional..."
            />
          </div>

          {/* Totales */}
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">Subtotal:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.subtotal)}
              </span>
            </div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-700 font-semibold">IVA 19%:</span>
              <span className="text-xl font-bold text-gray-800">
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.iva)}
              </span>
            </div>
            <div className="border-t-2 border-gray-300 pt-3 flex justify-between items-center">
              <span className="text-gray-800 font-bold text-lg">TOTAL:</span>
              <span className="text-2xl font-bold" style={{ color: '#235250' }}>
                {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(totales.total)}
              </span>
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const { total } = calcularTotales();
                const cotizacion = {
                  numero: (Math.floor(Math.random() * 900000) + 100000).toString(),
                  ...formData,
                  monto: total
                };
                generarPDFCotizacion(cotizacion);
              }}
              className="px-6 py-3 border-2 rounded-xl font-semibold hover:shadow-lg transition-all flex items-center space-x-2"
              style={{ borderColor: '#45ad98', color: '#45ad98' }}
            >
              <Download className="w-5 h-5" />
              <span>Vista Previa PDF</span>
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-3 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}
            >
              {isSaving ? 'Creando...' : 'Crear Cotización'}
            </button>
          </div>
        </form>
        {showConfirm && (
          <ConfirmDialog
            message="¿Está seguro de crear esta Cotización?"
            onConfirm={handleConfirmCreate}
            onCancel={() => { setShowConfirm(false); setPendingData(null); }}
          />
        )}
      </div>
    </div>
  );
};

// Componente Carta Gantt
const CartaGanttModule = ({ activeModule, sharedProtocolos }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterEstado, setFilterEstado] = useState('todos');

  if (activeModule !== 'gantt') return null;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Calcular semanas del mes
  const getWeeksOfMonth = () => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const weeks = [];
    // Empezar desde el lunes de la semana del primer día
    let start = new Date(firstDay);
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - ((dayOfWeek + 6) % 7));

    while (start <= lastDay || weeks.length === 0) {
      const weekStart = new Date(start);
      const weekEnd = new Date(start);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weeks.push({ start: weekStart, end: weekEnd });
      start.setDate(start.getDate() + 7);
    }
    return weeks;
  };

  const weeks = getWeeksOfMonth();
  const totalDays = weeks.length * 7;
  const firstDate = weeks[0].start;
  const lastDate = new Date(weeks[weeks.length - 1].end);

  const getWeekDays = (week) => {
    const days = [];
    const letras = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(week.start);
      d.setDate(d.getDate() + i);
      days.push({ letra: letras[i], num: d.getDate(), date: d, isCurrentMonth: d.getMonth() === month });
    }
    return days;
  };

  const getEstadoDotColor = (estado) => {
    switch (estado) {
      case 'Abierto': return 'bg-blue-300';
      case 'En Proceso': return 'bg-blue-500';
      case 'Despachado Parcial': return 'bg-yellow-400';
      case 'Cerrado': return 'bg-green-500';
      case 'Anulado': return 'bg-gray-400';
      default: return 'bg-gray-300';
    }
  };

  const getEstadoBarStyle = (estado) => {
    switch (estado) {
      case 'Abierto':
        return { backgroundColor: '#8dc0d7', color: '#2f4ea3' };
      case 'En Proceso':
        return { backgroundColor: '#3f79b8', color: '#98d9e7' };
      case 'Despachado Parcial':
        return { backgroundColor: '#f6d267', color: '#6d4b00' };
      case 'Cerrado':
        return { backgroundColor: '#9bc798', color: '#008b3d' };
      case 'Anulado':
        return { backgroundColor: '#c7ced7', color: '#425466' };
      default:
        return { backgroundColor: '#d5dbe3', color: '#425466' };
    }
  };

  // Filtrar protocolos con fechas y que se solapen con el mes visible
  const protocolosConFechas = sharedProtocolos.filter(p => {
    if (!p.fechaInicioProduccion || !p.fechaEntrega) return false;
    if (filterEstado !== 'todos' && p.estado !== filterEstado) return false;
    const inicio = new Date(p.fechaInicioProduccion);
    const fin = new Date(p.fechaEntrega);
    return inicio <= lastDate && fin >= firstDate;
  });

  // Calcular posición de la barra
  const calculateBarPosition = (protocolo) => {
    const inicio = new Date(protocolo.fechaInicioProduccion);
    const fin = new Date(protocolo.fechaEntrega);
    const clampedStart = inicio < firstDate ? firstDate : inicio;
    const clampedEnd = fin > lastDate ? lastDate : fin;
    const totalMs = lastDate.getTime() - firstDate.getTime();
    if (totalMs <= 0) return { left: 0, width: 0 };
    const left = ((clampedStart.getTime() - firstDate.getTime()) / totalMs) * 100;
    const width = ((clampedEnd.getTime() - clampedStart.getTime()) / totalMs) * 100;
    return { left: Math.max(0, left), width: Math.max(1, Math.min(width, 100 - left)) };
  };

  // Posición de "hoy"
  const today = new Date();
  const todayPosition = (() => {
    if (today < firstDate || today > lastDate) return null;
    const totalMs = lastDate.getTime() - firstDate.getTime();
    if (totalMs <= 0) return null;
    return ((today.getTime() - firstDate.getTime()) / totalMs) * 100;
  })();

  const estados = ['todos', 'Abierto', 'En Proceso', 'Despachado Parcial', 'Cerrado', 'Anulado'];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Carta Gantt</h2>
            <p className="text-gray-500">Timeline de produccion por protocolo</p>
          </div>
          <div className="flex items-center space-x-3">
            {/* Filtro estado */}
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#45ad98]"
            >
              {estados.map(e => (
                <option key={e} value={e}>{e === 'todos' ? 'Todos los estados' : e}</option>
              ))}
            </select>
            {/* Navegación */}
            <button onClick={goToPrevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={goToToday} className="px-3 py-2 bg-[#45ad98] text-white rounded-lg text-sm font-semibold hover:bg-[#235250] transition-colors">
              Hoy
            </button>
            <button onClick={goToNextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
            <span className="text-lg font-bold text-gray-800 capitalize min-w-[180px] text-center">{monthName}</span>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center space-x-4 mb-4 px-2">
        {['Abierto', 'En Proceso', 'Despachado Parcial', 'Cerrado', 'Anulado'].map(e => (
          <div key={e} className="flex items-center space-x-1">
            <div className={`w-3 h-3 rounded-full ${getEstadoDotColor(e)}`}></div>
            <span className="text-xs text-gray-600">{e}</span>
          </div>
        ))}
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-xs text-gray-600">Hoy</span>
        </div>
      </div>

      {protocolosConFechas.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-lg text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-400 mb-2">Sin protocolos con fechas</h3>
          <p className="text-gray-400">Asigna fechas de produccion desde el detalle del protocolo</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header de semanas */}
          <div className="flex border-b-2 border-gray-200">
            {/* Columna fija izquierda */}
            <div className="w-[260px] min-w-[260px] p-3 border-r-2 border-gray-200 bg-gray-50">
              <span className="text-sm font-bold text-gray-600">Protocolo</span>
            </div>
            {/* Semanas */}
            <div className="flex-1">
              <div className="flex">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex-1 border-r border-gray-100">
                    <div className="text-center text-xs font-bold text-gray-500 py-1 bg-gray-50 border-b border-gray-100">
                      Sem {wi + 1}
                    </div>
                    <div className="flex">
                      {getWeekDays(week).map((day, di) => (
                        <div
                          key={di}
                          className={`flex-1 text-center py-1 border-r border-gray-50 ${!day.isCurrentMonth ? 'opacity-30' : ''} ${day.date.toDateString() === today.toDateString() ? 'bg-red-50' : ''}`}
                        >
                          <div className="text-[10px] text-gray-400">{day.letra}</div>
                          <div className={`text-[10px] font-semibold ${day.date.toDateString() === today.toDateString() ? 'text-red-500' : 'text-gray-600'}`}>
                            {day.num}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filas de protocolos */}
          {protocolosConFechas.map((protocolo, idx) => {
            const bar = calculateBarPosition(protocolo);
            const barStyle = getEstadoBarStyle(protocolo.estado);
            const nombreProyecto = protocolo.nombreProyecto || protocolo.nombre || `Protocolo ${protocolo.folio}`;
            const mostrarNombreGrande = bar.width >= 10;
            return (
              <div key={protocolo.id || idx} className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors">
                {/* Info del protocolo */}
                <div className="w-[260px] min-w-[260px] p-3 border-r-2 border-gray-200">
                  <p className="text-sm font-bold text-gray-800">PT-{protocolo.folio}</p>
                  <p className="text-xs text-gray-500 truncate">{protocolo.nombreProyecto || protocolo.nombre || ''}</p>
                  <p className="text-xs text-gray-400 truncate">{protocolo.cliente}</p>
                </div>
                {/* Barra del Gantt */}
                <div className="flex-1 relative" style={{ minHeight: '56px' }}>
                  {/* Línea de hoy */}
                  {todayPosition !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10"
                      style={{ left: `${todayPosition}%` }}
                    />
                  )}
                  {/* Barra del protocolo */}
                  <div
                    className="absolute top-2 bottom-2 rounded-md cursor-pointer shadow-sm opacity-90 hover:opacity-100 transition-opacity"
                    style={{ left: `${bar.left}%`, width: `${bar.width}%`, minWidth: '4px', ...barStyle }}
                    title={`${nombreProyecto} (PT-${protocolo.folio}): ${protocolo.fechaInicioProduccion} a ${protocolo.fechaEntrega} (${protocolo.estado})`}
                  >
                    <div className="h-full w-full px-2 flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] font-semibold whitespace-nowrap opacity-90">
                        PT-{protocolo.folio}
                      </span>
                      {mostrarNombreGrande && (
                        <span className="text-base font-bold truncate tracking-wide">
                          {nombreProyecto}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Componente de Dashboard
const Dashboard = ({ user, onLogout }) => {
  const getDefaultModuleByRole = (role) => {
    if (['auditor', 'trade_marketing'].includes(role)) return 'auditorias';
    if (role === 'diseno') return 'forecast';
    if (role === 'compras') return 'protocolos';
    return 'dashboard';
  };

  const [activeModule, setActiveModule] = useState(() => getDefaultModuleByRole(user?.role));
  const [selectedUnit, setSelectedUnit] = useState('Todas');

  // ===== ESTADOS COMPARTIDOS ENTRE MÓDULOS =====
  const [sharedCotizaciones, setSharedCotizaciones] = useState([]);
  const [sharedForecasts, setSharedForecasts] = useState([]);
  const [sharedProtocolos, setSharedProtocolos] = useState([]);
  const [sharedOrdenesCompra, setSharedOrdenesCompra] = useState([]);
  const chatReadStorageKey = `protocolos.chatReadState.${String(user?.id || user?.email || 'anon').toLowerCase()}`;
  const forecastChatReadStorageKey = `forecasts.chatReadState.${String(user?.id || user?.email || 'anon').toLowerCase()}`;
  const [sharedChatReadState, setSharedChatReadState] = useState({});
  const [sharedForecastChatReadState, setSharedForecastChatReadState] = useState({});
  const [showUnreadChatDropdown, setShowUnreadChatDropdown] = useState(false);
  const [showUnreadForecastChatDropdown, setShowUnreadForecastChatDropdown] = useState(false);
  const [loadingUnreadChatSummaries, setLoadingUnreadChatSummaries] = useState(false);
  const [loadingUnreadForecastChatSummaries, setLoadingUnreadForecastChatSummaries] = useState(false);
  const [unreadChatSummaries, setUnreadChatSummaries] = useState({});
  const [unreadForecastChatSummaries, setUnreadForecastChatSummaries] = useState({});
  const [cotizacionParaAbrir, setCotizacionParaAbrir] = useState(null);
  const [datosPreOC, setDatosPreOC] = useState(null);
  const [protocoloParaAbrir, setProtocoloParaAbrir] = useState(null);
  const [forecastParaAbrir, setForecastParaAbrir] = useState(null);
  const [selectedForecastContext, setSelectedForecastContext] = useState(null);
  const chatNotifyProcessedIdsRef = useRef(new Set());
  const chatNotifyLastSyncRef = useRef(new Date().toISOString());
  const forecastChatNotifyProcessedIdsRef = useRef(new Set());
  const forecastChatNotifyLastSyncRef = useRef(new Date().toISOString());
  const protocolosByIdRef = useRef(new Map());
  const forecastsByIdRef = useRef(new Map());

  useEffect(() => {
    const byId = new Map();
    sharedProtocolos.forEach((protocolo) => {
      if (protocolo?.id) byId.set(protocolo.id, protocolo);
    });
    protocolosByIdRef.current = byId;
  }, [sharedProtocolos]);

  useEffect(() => {
    const byId = new Map();
    sharedForecasts.forEach((forecast) => {
      if (forecast?.id) byId.set(forecast.id, forecast);
    });
    forecastsByIdRef.current = byId;
  }, [sharedForecasts]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(chatReadStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSharedChatReadState(parsed && typeof parsed === 'object' ? parsed : {});
      } else {
        setSharedChatReadState({});
      }
    } catch (error) {
      console.error('Error cargando estado global de lectura de chat:', error);
      setSharedChatReadState({});
    }
  }, [chatReadStorageKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(forecastChatReadStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSharedForecastChatReadState(parsed && typeof parsed === 'object' ? parsed : {});
      } else {
        setSharedForecastChatReadState({});
      }
    } catch (error) {
      console.error('Error cargando estado global de lectura de chat de forecast:', error);
      setSharedForecastChatReadState({});
    }
  }, [forecastChatReadStorageKey]);

  useEffect(() => {
    if (sharedProtocolos.length === 0) return;
    const currentVersion = sharedChatReadState?.__version;
    if (currentVersion === CHAT_READ_STATE_VERSION) return;

    setSharedChatReadState((prev) => {
      const migrated = { __version: CHAT_READ_STATE_VERSION };
      sharedProtocolos.forEach((protocolo) => {
        migrated[protocolo.id] = {
          readCount: Math.max(0, Number(protocolo.chatMessagesCount) || 0),
          readAt: new Date().toISOString()
        };
      });
      return migrated;
    });
  }, [sharedProtocolos, sharedChatReadState?.__version]);

  useEffect(() => {
    if (sharedForecasts.length === 0) return;
    const currentVersion = sharedForecastChatReadState?.__version;
    if (currentVersion === FORECAST_CHAT_READ_STATE_VERSION) return;

    setSharedForecastChatReadState(() => {
      const migrated = { __version: FORECAST_CHAT_READ_STATE_VERSION };
      sharedForecasts.forEach((forecast) => {
        migrated[forecast.id] = {
          readCount: Math.max(0, Number(forecast.chatMessagesCount) || 0),
          readAt: new Date().toISOString()
        };
      });
      return migrated;
    });
  }, [sharedForecasts, sharedForecastChatReadState?.__version]);

  useEffect(() => {
    try {
      localStorage.setItem(chatReadStorageKey, JSON.stringify(sharedChatReadState));
    } catch (error) {
      console.error('Error guardando estado global de lectura de chat:', error);
    }
  }, [chatReadStorageKey, sharedChatReadState]);

  useEffect(() => {
    try {
      localStorage.setItem(forecastChatReadStorageKey, JSON.stringify(sharedForecastChatReadState));
    } catch (error) {
      console.error('Error guardando estado global de lectura de chat de forecast:', error);
    }
  }, [forecastChatReadStorageKey, sharedForecastChatReadState]);

  const registerProcessedChatNotify = (messageId) => {
    if (!messageId) return false;
    const ids = chatNotifyProcessedIdsRef.current;
    if (ids.has(messageId)) return true;
    ids.add(messageId);
    if (ids.size > 2000) {
      const keep = Array.from(ids).slice(-1200);
      chatNotifyProcessedIdsRef.current = new Set(keep);
    }
    return false;
  };

  const updateChatNotifySync = (isoDate) => {
    if (!isoDate) return;
    const next = new Date(isoDate).getTime();
    if (Number.isNaN(next)) return;
    const prev = chatNotifyLastSyncRef.current ? new Date(chatNotifyLastSyncRef.current).getTime() : null;
    if (!prev || next > prev) {
      chatNotifyLastSyncRef.current = isoDate;
    }
  };

  const registerProcessedForecastChatNotify = (messageId) => {
    if (!messageId) return false;
    const ids = forecastChatNotifyProcessedIdsRef.current;
    if (ids.has(messageId)) return true;
    ids.add(messageId);
    if (ids.size > 2000) {
      const keep = Array.from(ids).slice(-1200);
      forecastChatNotifyProcessedIdsRef.current = new Set(keep);
    }
    return false;
  };

  const updateForecastChatNotifySync = (isoDate) => {
    if (!isoDate) return;
    const next = new Date(isoDate).getTime();
    if (Number.isNaN(next)) return;
    const prev = forecastChatNotifyLastSyncRef.current ? new Date(forecastChatNotifyLastSyncRef.current).getTime() : null;
    if (!prev || next > prev) {
      forecastChatNotifyLastSyncRef.current = isoDate;
    }
  };

  const markForecastChatAsRead = (forecastId, totalCount = 0) => {
    if (!forecastId) return;
    setSharedForecastChatReadState((prev) => ({
      ...prev,
      [forecastId]: {
        readCount: Math.max(0, Number(totalCount) || 0),
        readAt: new Date().toISOString()
      }
    }));
  };

  const notifyIncomingChatMessage = (mensaje) => {
    if (!mensaje?.id || !mensaje?.protocolo_id) return;
    if (registerProcessedChatNotify(mensaje.id)) return;

    updateChatNotifySync(mensaje.created_at || new Date().toISOString());

    setSharedProtocolos((prev) =>
      prev.map((protocolo) =>
        protocolo.id === mensaje.protocolo_id
          ? {
              ...protocolo,
              chatMessagesCount: (protocolo.chatMessagesCount || 0) + 1,
              chatLastMessageAt: mensaje.created_at || new Date().toISOString()
            }
          : protocolo
      )
    );

    const isOwnMessage = (
      (user?.id && mensaje.user_id && String(user.id) === String(mensaje.user_id)) ||
      (user?.email && mensaje.user_email && String(user.email).toLowerCase() === String(mensaje.user_email).toLowerCase())
    );

    if (isOwnMessage) return;

    const protocolo = protocolosByIdRef.current.get(mensaje.protocolo_id);
    const nombreProyecto = protocolo?.nombreProyecto || `PT-${protocolo?.folio || ''}`;
    const remitente = String(mensaje.user_name || mensaje.user_email || 'Usuario');

    notifyToast(`Mensaje de ${remitente} en ${nombreProyecto || 'proyecto'}`, 'info');
    playNotificationSound();
  };

  const notifyIncomingForecastChatMessage = (mensaje) => {
    if (!mensaje?.id || !mensaje?.forecast_id) return;
    if (registerProcessedForecastChatNotify(mensaje.id)) return;

    updateForecastChatNotifySync(mensaje.created_at || new Date().toISOString());

    const forecastActual = forecastsByIdRef.current.get(mensaje.forecast_id);
    const totalPrevio = forecastActual?.chatMessagesCount || 0;
    const totalSiguiente = totalPrevio + 1;

    setSharedForecasts((prev) =>
      prev.map((forecast) =>
        forecast.id === mensaje.forecast_id
          ? {
              ...forecast,
              chatMessagesCount: (forecast.chatMessagesCount || 0) + 1,
              chatLastMessageAt: mensaje.created_at || new Date().toISOString()
            }
          : forecast
      )
    );

    const isOwnMessage = (
      (user?.id && mensaje.user_id && String(user.id) === String(mensaje.user_id)) ||
      (user?.email && mensaje.user_email && String(user.email).toLowerCase() === String(mensaje.user_email).toLowerCase())
    );
    const isViewingThisForecast =
      activeModule === 'forecast' &&
      selectedForecastContext?.id &&
      String(selectedForecastContext.id) === String(mensaje.forecast_id);

    if (isOwnMessage || isViewingThisForecast) {
      markForecastChatAsRead(mensaje.forecast_id, totalSiguiente);
    }

    if (isOwnMessage) return;

    const forecast = forecastsByIdRef.current.get(mensaje.forecast_id);
    const nombreProyecto = forecast?.nombreProyecto || `FW-${forecast?.numero || ''}`;
    const remitente = String(mensaje.user_name || mensaje.user_email || 'Usuario');

    notifyToast(`Mensaje de ${remitente} en Forecast ${nombreProyecto || ''}`.trim(), 'info');
    playNotificationSound();
  };

  useEffect(() => {
    const channel = supabase
      .channel('global-chat-notify')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'protocolos_chat_mensajes'
        },
        (payload) => {
          notifyIncomingChatMessage(payload.new || {});
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime global de chat con problemas, activando fallback por polling.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    let cancelled = false;

    const pollChatNotifications = async () => {
      if (cancelled) return;
      const since = chatNotifyLastSyncRef.current;
      if (!since) return;

      const { data, error } = await supabase
        .from('protocolos_chat_mensajes')
        .select('id, protocolo_id, user_id, user_name, user_email, created_at')
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        if (error.code !== '42P01') {
          console.error('Error en polling global de notificaciones de chat:', error);
        }
        return;
      }

      if (!Array.isArray(data) || data.length === 0) return;

      data.forEach((mensaje) => notifyIncomingChatMessage(mensaje));
    };

    const intervalId = setInterval(pollChatNotifications, 5000);
    pollChatNotifications();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    const channel = supabase
      .channel('global-forecast-chat-notify')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'forecast_chat_mensajes'
        },
        (payload) => {
          notifyIncomingForecastChatMessage(payload.new || {});
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime global de chat de forecast con problemas, activando fallback por polling.');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.email, activeModule, selectedForecastContext?.id]);

  useEffect(() => {
    const mapForecastSummary = (forecastRows = [], chatStatsByForecast = {}) => (
      forecastRows.map((forecast) => ({
        id: forecast.id,
        numero: forecast.numero,
        clienteNombre: forecast.clientes?.razon_social || forecast.nombre_cliente || 'Sin cliente',
        cliente: forecast.clientes?.razon_social || forecast.nombre_cliente || 'Sin cliente',
        nombreProyecto: forecast.nombre_proyecto || '',
        etapaActual: forecast.etapa_actual || 'Brief',
        estado: forecast.estado || 'Activo',
        chatMessagesCount: chatStatsByForecast[forecast.id]?.count || 0,
        chatLastMessageAt: chatStatsByForecast[forecast.id]?.lastMessageAt || null
      }))
    );

    const loadSharedForecasts = async () => {
      try {
        const forecastData = await getForecastRecords();
        const forecastIds = (forecastData || []).map((forecast) => forecast.id).filter(Boolean);
        const chatStatsByForecast = {};

        if (forecastIds.length > 0) {
          const { data: chatData, error: chatError } = await supabase
            .from('forecast_chat_mensajes')
            .select('forecast_id, created_at')
            .in('forecast_id', forecastIds);

          if (!chatError && Array.isArray(chatData)) {
            chatData.forEach((row) => {
              if (!row?.forecast_id) return;
              const prev = chatStatsByForecast[row.forecast_id] || { count: 0, lastMessageAt: null };
              const nextLast =
                !prev.lastMessageAt || (row.created_at && new Date(row.created_at) > new Date(prev.lastMessageAt))
                  ? row.created_at
                  : prev.lastMessageAt;
              chatStatsByForecast[row.forecast_id] = {
                count: prev.count + 1,
                lastMessageAt: nextLast
              };
            });
          } else if (chatError && chatError.code !== '42P01') {
            console.error('Error cargando conteo global de chat de forecast:', chatError);
          }
        }

        const mapped = mapForecastSummary(forecastData || [], chatStatsByForecast);
        const latestChatAt = mapped.reduce((latest, forecast) => {
          if (!forecast.chatLastMessageAt) return latest;
          if (!latest) return forecast.chatLastMessageAt;
          return new Date(forecast.chatLastMessageAt) > new Date(latest) ? forecast.chatLastMessageAt : latest;
        }, null);
        forecastChatNotifyLastSyncRef.current = latestChatAt || new Date().toISOString();
        setSharedForecasts(mapped);
      } catch (error) {
        console.error('Error cargando forecast compartidos:', error);
      }
    };

    loadSharedForecasts();

    const channel = supabase
      .channel('forecasts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forecasts' }, () => {
        loadSharedForecasts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollForecastChatNotifications = async () => {
      if (cancelled) return;
      const since = forecastChatNotifyLastSyncRef.current;
      if (!since) return;

      const { data, error } = await supabase
        .from('forecast_chat_mensajes')
        .select('id, forecast_id, user_id, user_name, user_email, created_at')
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) {
        if (error.code !== '42P01') {
          console.error('Error en polling global de notificaciones de chat de forecast:', error);
        }
        return;
      }

      if (!Array.isArray(data) || data.length === 0) return;

      data.forEach((mensaje) => notifyIncomingForecastChatMessage(mensaje));
    };

    const intervalId = setInterval(pollForecastChatNotifications, 5000);
    pollForecastChatNotifications();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [user?.id, user?.email, activeModule, selectedForecastContext?.id]);

  const calcularNetoCotizacion = (cot) => {
    // Si ya tiene neto, usarlo directamente
    if (cot?.neto !== undefined && cot?.neto !== null) {
      return parseFloat(cot.neto);
    }
    // Si tiene items, calcular desde items
    const items = cot?.items || [];
    if (items.length > 0) {
      return items.reduce((sum, item) => {
        const cantidad = item.cantidad || 0;
        const valorUnitario = item.valorUnitario ?? item.valor_unitario ?? 0;
        const descuento = item.descuento || 0;
        const subtotal = cantidad * valorUnitario;
        return sum + (subtotal - (subtotal * (descuento / 100)));
      }, 0);
    }
    // Fallback: asumir que monto es neto (datos antiguos)
    if (!cot?.monto) return 0;
    return parseFloat(cot.monto);
  };

  useEffect(() => {
    let facturasByProtocolo = {};
    let chatStatsByProtocolo = {};
    const mapCotizacion = (cot) => ({
      id: cot.id,
      numero: cot.numero,
      fecha: cot.fecha,
      clienteId: cot.cliente_id || null,
      cliente: cot.clientes?.razon_social || 'Sin cliente',
      nombreProyecto: cot.nombre_proyecto,
      rut: cot.clientes?.rut || '',
      direccionCliente: cot.clientes?.direccion || cot.direccion || '',
      contactoCliente: cot.clientes?.persona_encargada || cot.contacto || '',
      unidadNegocio: cot.unidad_negocio,
      monto: parseFloat(cot.neto || cot.monto) || 0,
      estado: cot.estado,
      cotizadoPor: cot.cotizado_por,
      condicionesPago: cot.condiciones_pago,
      items: cot.items || [],
      adjudicada_a_protocolo: cot.adjudicada_a_protocolo
    });

    const mapProtocolo = (p, cotizacionesByNumero, cotizacionesByFolio) => ({
      ...(() => {
        const netoCotizacion =
          cotizacionesByFolio.get(String(p.folio)) ??
          cotizacionesByNumero.get(normalizarNumero(p.numero_cotizacion));
        const netoProtocoloGuardado = parseFloat(p.monto_neto);
        const netoEfectivo = Number.isFinite(netoProtocoloGuardado)
          ? netoProtocoloGuardado
          : netoCotizacion;
        return {
          montoNeto: Number.isFinite(netoProtocoloGuardado) ? netoProtocoloGuardado : undefined,
          montoNetoCotizacion: netoEfectivo
        };
      })(),
      id: p.id,
      folio: p.folio,
      numeroCotizacion: p.numero_cotizacion || '',
      cliente: p.clientes?.razon_social || 'Sin cliente',
      nombreProyecto: p.nombre_proyecto,
      rutCliente: p.clientes?.rut || '',
      tipo: p.tipo,
      ocCliente: p.oc_cliente,
      ocClienteDocUrl: p.oc_cliente_doc_url || null,
      facturaBmDocUrl: p.factura_bm_doc_url || null,
      estado: p.estado,
      unidadNegocio: p.unidad_negocio,
      fechaCreacion: p.fecha_creacion,
      fechaInicioProduccion: p.fecha_inicio_produccion || null,
      fechaEntrega: p.fecha_entrega || null,
      montoTotal: parseFloat(p.monto_total) || 0,
      items: p.items || [],
      chatMessagesCount: chatStatsByProtocolo[p.id]?.count || 0,
      chatLastMessageAt: chatStatsByProtocolo[p.id]?.lastMessageAt || null,
      facturas: (() => {
        const facturas = facturasByProtocolo[p.id] || [];
        if (!facturas.length && (p.factura_bm || p.fecha_factura_bm)) {
          return [{
            id: `legacy-${p.id}`,
            protocoloId: p.id,
            numero: p.factura_bm || '',
            fecha: p.fecha_factura_bm || '',
            montoNeto: 0,
            iva: 0,
            total: 0,
            tipoDoc: 'Factura',
            estado: 'Emitida',
            docUrl: p.factura_bm_doc_url || '',
            createdAt: ''
          }];
        }
        return facturas;
      })()
    });

    const mapOrdenCompra = (o, proveedoresById = new Map()) => ({
      id: o.id,
      numero: o.numero,
      numeroCotizacion: o.numero_cotizacion || '',
      codigoProtocolo: o.codigo_protocolo,
      fecha: o.fecha,
      proveedor:
        o.proveedores?.razon_social ||
        proveedoresById.get(String(o.proveedor_id))?.razon_social ||
        'Sin proveedor',
      rutProveedor:
        o.proveedores?.rut ||
        proveedoresById.get(String(o.proveedor_id))?.rut ||
        '',
      direccionProveedor:
        o.proveedores?.direccion ||
        proveedoresById.get(String(o.proveedor_id))?.direccion ||
        '',
      contactoProveedor:
        o.proveedores?.contacto ||
        proveedoresById.get(String(o.proveedor_id))?.contacto ||
        '',
      tipoCosto: o.tipo_costo,
      centroCosto: o.centro_costo || '',
      actividadUso: o.actividad_uso || '',
      formaPago: o.forma_pago,
      subtotal: parseFloat(o.subtotal) || 0,
      iva: parseFloat(o.iva) || 0,
      total: parseFloat(o.total) || 0,
      estado: o.estado,
      numeroFactura: o.numero_factura || '',
      fechaFactura: o.fecha_factura || '',
      estadoPago: o.estado_pago || 'Pendiente',
      fechaPago: o.fecha_pago || '',
      responsableCompra: o.responsable_compra || '',
      items: (o.ordenes_compra_items || []).map(item => ({
        id: item.id,
        item: item.item || '',
        cantidad: item.cantidad,
        descripcion: item.descripcion,
        valorUnitario: parseFloat(item.valor_unitario) || 0,
        valor_unitario: parseFloat(item.valor_unitario) || 0,
        descuento: parseFloat(item.descuento || 0)
      })),
      facturas: []
    });

    const loadSharedData = async () => {
      try {
        const [cotData, protData, ocData, proveedoresData, facturasData] = await Promise.all([
          getCotizaciones(),
          getProtocolos(),
          getOrdenesCompra(),
          getProveedores(),
          getProtocolosFacturas()
        ]);
        facturasByProtocolo = facturasData.reduce((acc, factura) => {
          const key = factura.protocolo_id;
          if (!acc[key]) acc[key] = [];
          acc[key].push({
            id: factura.id,
            protocoloId: factura.protocolo_id,
            numero: factura.numero || '',
            fecha: factura.fecha || '',
            montoNeto: parseFloat(factura.monto_neto) || 0,
            iva: parseFloat(factura.iva) || 0,
            total: parseFloat(factura.total) || 0,
            tipoDoc: factura.tipo_doc || 'Factura',
            estado: factura.estado || 'Emitida',
            docUrl: factura.doc_url || '',
            createdAt: factura.created_at || ''
          });
          return acc;
        }, {});
        const proveedoresById = new Map(
          (proveedoresData || []).map((p) => [String(p.id), p])
        );
        const cotizacionesByNumero = new Map(
          (cotData || []).map((cot) => [normalizarNumero(cot.numero), calcularNetoCotizacion({
            neto: cot.neto !== undefined && cot.neto !== null ? parseFloat(cot.neto) : undefined,
            items: cot.items || [],
            monto: parseFloat(cot.monto) || 0
          })])
        );
        const cotizacionesByFolio = new Map(
          (cotData || [])
            .filter((cot) => cot.adjudicada_a_protocolo)
            .map((cot) => [String(cot.adjudicada_a_protocolo), calcularNetoCotizacion({
              neto: cot.neto !== undefined && cot.neto !== null ? parseFloat(cot.neto) : undefined,
              items: cot.items || [],
              monto: parseFloat(cot.monto) || 0
            })])
        );
        const protocolosIds = protData.map((p) => p.id).filter(Boolean);
        if (protocolosIds.length > 0) {
          const { data: chatData, error: chatError } = await supabase
            .from('protocolos_chat_mensajes')
            .select('protocolo_id, created_at')
            .in('protocolo_id', protocolosIds);

          if (!chatError && Array.isArray(chatData)) {
            chatData.forEach((row) => {
              if (!row?.protocolo_id) return;
              const prev = chatStatsByProtocolo[row.protocolo_id] || { count: 0, lastMessageAt: null };
              const nextLast =
                !prev.lastMessageAt || (row.created_at && new Date(row.created_at) > new Date(prev.lastMessageAt))
                  ? row.created_at
                  : prev.lastMessageAt;
              chatStatsByProtocolo[row.protocolo_id] = {
                count: prev.count + 1,
                lastMessageAt: nextLast
              };
            });
          } else if (chatError && chatError.code !== '42P01') {
            console.error('Error cargando conteo global de chat de protocolos:', chatError);
          }
        }

        const ordenIds = ocData.map(o => o.id).filter(Boolean);
        let facturasOC = [];
        try { facturasOC = ordenIds.length > 0 ? await getOrdenCompraFacturas(ordenIds) : []; } catch (_) {}
        const facturasByOrdenOC = facturasOC.reduce((acc, f) => {
          if (!acc[f.orden_id]) acc[f.orden_id] = [];
          acc[f.orden_id].push({ id: f.id, tipoDocumento: f.tipo_documento || 'Factura', numero: f.numero || '', fecha: f.fecha || '', monto: parseFloat(f.monto) || 0, estadoPago: f.estado_pago || 'Pendiente' });
          return acc;
        }, {});

        setSharedCotizaciones(cotData.map(mapCotizacion));
        setSharedProtocolos(protData.map((p) => mapProtocolo(p, cotizacionesByNumero, cotizacionesByFolio)));
        setSharedOrdenesCompra(ocData.map((o) => ({ ...mapOrdenCompra(o, proveedoresById), facturas: facturasByOrdenOC[o.id] || [] })));
      } catch (error) {
        console.error('Error cargando datos del dashboard:', error);
      }
    };

    loadSharedData();
  }, []);

 // Handlers para comunicación entre módulos
  const handleAdjudicarVentaDesdeCotizacion = async (cotizacion) => {
    try {
      const nombreProyecto = String(
        cotizacion.nombreProyecto || cotizacion.nombre_proyecto || ''
      ).trim();
      if (!nombreProyecto) {
        alert('Agrega un Nombre del Proyecto en la cotización antes de adjudicar.');
        return;
      }

      // Verificar si la cotización ya tiene protocolo
      if (cotizacion.adjudicada_a_protocolo) {
        const folioExistente = String(cotizacion.adjudicada_a_protocolo);
        const protocoloExistente =
          sharedProtocolos.find((p) => String(p.folio) === folioExistente) ||
          { folio: folioExistente };
        setProtocoloParaAbrir(protocoloExistente);
        setActiveModule('protocolos');
        alert(`Abriendo protocolo ${folioExistente}`);
        return;
      }

      // Obtener todos los protocolos para calcular el siguiente folio
      const protocolosExistentes = await getProtocolos();
      const ultimoFolio = protocolosExistentes.length > 0
        ? Math.max(...protocolosExistentes.map(p => {
            const num = parseInt(p.folio);
            return isNaN(num) ? 30650 : num;
          }))
        : 30649;

      // Calcular neto real desde la cotización (prioriza campo neto, luego items, luego monto)
      const netoCalculado = Number(calcularNetoCotizacion(cotizacion)) || 0;
      const totalCalculado = netoCalculado * 1.19; // Total con IVA

      const nuevoProtocolo = {
        folio: `${ultimoFolio + 1}`,
        numero_cotizacion: cotizacion.numero,
        cliente_id: cotizacion.clienteId || null,
        nombre_proyecto: nombreProyecto,
        tipo: 'Venta',
        oc_cliente: '',
        estado: 'Abierto',
        unidad_negocio: cotizacion.unidadNegocio,
        fecha_creacion: new Date().toISOString().split('T')[0],
        monto_neto: netoCalculado,
        monto_total: totalCalculado,
        items: []
      };

      const protocoloCreado = await createProtocolo(nuevoProtocolo);

      await updateCotizacion(cotizacion.id, {
        adjudicada_a_protocolo: protocoloCreado.folio
      });

      const [cotizacionesActualizadas, protocolosActualizados, facturasData] = await Promise.all([
        getCotizaciones(),
        getProtocolos(),
        getProtocolosFacturas()
      ]);
      const facturasByProtocolo = facturasData.reduce((acc, factura) => {
        const key = factura.protocolo_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push({
          id: factura.id,
          protocoloId: factura.protocolo_id,
          numero: factura.numero || '',
          fecha: factura.fecha || '',
          montoNeto: parseFloat(factura.monto_neto) || 0,
          iva: parseFloat(factura.iva) || 0,
          total: parseFloat(factura.total) || 0,
          tipoDoc: factura.tipo_doc || 'Factura',
          estado: factura.estado || 'Emitida',
          docUrl: factura.doc_url || '',
          createdAt: factura.created_at || ''
        });
        return acc;
      }, {});

      setSharedCotizaciones(cotizacionesActualizadas.map(cot => ({
        id: cot.id,
        numero: cot.numero,
        fecha: cot.fecha,
        clienteId: cot.cliente_id || null,
        cliente: cot.clientes?.razon_social || 'Sin cliente',
        nombreProyecto: cot.nombre_proyecto,
        rut: cot.clientes?.rut || '',
        unidadNegocio: cot.unidad_negocio,
        monto: parseFloat(cot.neto || cot.monto) || 0,
        estado: cot.estado,
        cotizadoPor: cot.cotizado_por,
        condicionesPago: cot.condiciones_pago,
        items: cot.items || [],
        adjudicada_a_protocolo: cot.adjudicada_a_protocolo
      })));
      setSharedProtocolos(protocolosActualizados.map(p => ({
        id: p.id,
        folio: p.folio,
        numeroCotizacion: p.numero_cotizacion || '',
        cliente: p.clientes?.razon_social || 'Sin cliente',
        nombreProyecto: p.nombre_proyecto,
        rutCliente: p.clientes?.rut || '',
        tipo: p.tipo,
        ocCliente: p.oc_cliente,
        ocClienteDocUrl: p.oc_cliente_doc_url || null,
        facturaBmDocUrl: p.factura_bm_doc_url || null,
        estado: p.estado,
        unidadNegocio: p.unidad_negocio,
        fechaCreacion: p.fecha_creacion,
        fechaInicioProduccion: p.fecha_inicio_produccion || null,
        fechaEntrega: p.fecha_entrega || null,
        montoTotal: parseFloat(p.monto_total) || 0,
        montoNeto: Number.isFinite(parseFloat(p.monto_neto)) ? parseFloat(p.monto_neto) : undefined,
        montoNetoCotizacion: Number.isFinite(parseFloat(p.monto_neto)) ? parseFloat(p.monto_neto) : undefined,
        items: p.items || [],
        facturas: (() => {
          const facturas = facturasByProtocolo[p.id] || [];
          if (!facturas.length && (p.factura_bm || p.fecha_factura_bm)) {
            return [{
              id: `legacy-${p.id}`,
              protocoloId: p.id,
              numero: p.factura_bm || '',
              fecha: p.fecha_factura_bm || '',
              montoNeto: 0,
              iva: 0,
              total: 0,
              tipoDoc: 'Factura',
              estado: 'Emitida',
              docUrl: p.factura_bm_doc_url || '',
              createdAt: ''
            }];
          }
          return facturas;
        })()
      })));

      setProtocoloParaAbrir(protocoloCreado);
      setActiveModule('protocolos');
      
      alert('Protocolo creado exitosamente');
    } catch (error) {
      console.error('Error creando protocolo:', error);
      alert('Error al crear protocolo: ' + error.message);
    }
  };
  // ===== FIN ESTADOS COMPARTIDOS =====

  // Calcular estadísticas del dashboard desde datos reales
  const [stats, setStats] = useState({
    cotizacionesEmitidas: 0,
    cotizacionesGanadas: 0,
    cotizacionesPerdidas: 0,
    cotizacionesStandby: 0,
    montoVentas: 0,
    proyectosEnCurso: 0,
    proyectosTerminados: 0,
    protocolosAbiertos: 0,
    protocolosEnProceso: 0,
    protocolosSinOcCliente: 0,
    ocSinFactura: 0,
    pagosPendientes: 0
  });

  // Actualizar estadísticas cuando cambien los datos
  useEffect(() => {
    const calcularStats = () => {
      // Filtrar cotizaciones por unidad de negocio si está seleccionada
      const cotizacionesFiltradas = selectedUnit === 'Todas'
        ? sharedCotizaciones
        : sharedCotizaciones.filter(c => c.unidadNegocio === selectedUnit);

      const protocolosFiltrados = selectedUnit === 'Todas'
        ? sharedProtocolos
        : sharedProtocolos.filter(p => p.unidadNegocio === selectedUnit);

      // Estadísticas de cotizaciones
      const cotizacionesEmitidas = cotizacionesFiltradas.filter(c => c.estado === 'emitida').length;
      const cotizacionesGanadas = cotizacionesFiltradas.filter(c => c.estado === 'ganada').length;
      const cotizacionesPerdidas = cotizacionesFiltradas.filter(c => c.estado === 'perdida').length;
      const cotizacionesStandby = cotizacionesFiltradas.filter(c => c.estado === 'standby').length;

      // Monto total de ventas (cotizaciones ganadas)
      const montoVentas = cotizacionesFiltradas
        .filter(c => c.estado === 'ganada')
        .reduce((sum, c) => sum + (c.monto || 0), 0);

      // Estadísticas de protocolos
      const protocolosAbiertos = protocolosFiltrados.filter(p => p.estado === 'Abierto').length;
      const protocolosEnProceso = protocolosFiltrados.filter(p => p.estado === 'En Proceso').length;
      const proyectosEnCurso = protocolosAbiertos + protocolosEnProceso;
      const proyectosTerminados = protocolosFiltrados.filter(p => p.estado === 'Cerrado').length;
      const protocolosSinOcCliente = protocolosFiltrados.filter(p => {
        if (p.estado === 'Cerrado') return false;
        return !String(p.ocCliente || '').trim();
      }).length;

      // Estadísticas de órdenes de compra
      const ocSinFactura = sharedOrdenesCompra.filter(o => !o.numeroFactura && o.estado !== 'Anulada').length;
      const pagosPendientes = sharedOrdenesCompra.filter(o => o.estadoPago === 'Pendiente' && o.estado !== 'Anulada').length;

      setStats({
        cotizacionesEmitidas,
        cotizacionesGanadas,
        cotizacionesPerdidas,
        cotizacionesStandby,
        montoVentas,
        proyectosEnCurso,
        proyectosTerminados,
        protocolosAbiertos,
        protocolosEnProceso,
        protocolosSinOcCliente,
        ocSinFactura,
        pagosPendientes
      });
    };

    calcularStats();
  }, [sharedCotizaciones, sharedProtocolos, sharedOrdenesCompra, selectedUnit]);

  const isAdminLike = ['admin', 'comercial'].includes(user.role);
  const dashboardUserName = normalizePlainText(user?.name);
  const dashboardUserEmail = normalizePlainText(user?.email);
  const canAccessAdministracion = isAdminLike || (
    user.role === 'compras' &&
    (dashboardUserName.includes('joaquin') || dashboardUserEmail.includes('joaquin'))
  );
  const protocolosNoLeidos = useMemo(() => (
    sharedProtocolos
      .map((protocolo) => {
        const readCount = sharedChatReadState?.[protocolo.id]?.readCount || 0;
        const unreadCount = Math.max(0, (protocolo.chatMessagesCount || 0) - readCount);
        return unreadCount > 0 ? { ...protocolo, unreadCount } : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.chatLastMessageAt || 0) - new Date(a.chatLastMessageAt || 0))
  ), [sharedProtocolos, sharedChatReadState]);
  const protocolosConMensajesSinLeer = useMemo(
    () => protocolosNoLeidos.length,
    [protocolosNoLeidos]
  );
  const totalMensajesSinLeer = useMemo(
    () => protocolosNoLeidos.reduce((count, protocolo) => count + (protocolo.unreadCount || 0), 0),
    [protocolosNoLeidos]
  );
  const forecastsNoLeidos = useMemo(() => (
    sharedForecasts
      .map((forecast) => {
        const readCount = sharedForecastChatReadState?.[forecast.id]?.readCount || 0;
        const unreadCount = Math.max(0, (forecast.chatMessagesCount || 0) - readCount);
        return unreadCount > 0 ? { ...forecast, unreadCount } : null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.chatLastMessageAt || 0) - new Date(a.chatLastMessageAt || 0))
  ), [sharedForecasts, sharedForecastChatReadState]);
  const forecastsConMensajesSinLeer = useMemo(
    () => forecastsNoLeidos.length,
    [forecastsNoLeidos]
  );
  const totalMensajesForecastSinLeer = useMemo(
    () => forecastsNoLeidos.reduce((count, forecast) => count + (forecast.unreadCount || 0), 0),
    [forecastsNoLeidos]
  );

  const abrirProtocoloDesdeMensajes = (protocolo) => {
    if (!protocolo) return;
    setShowUnreadChatDropdown(false);
    setProtocoloParaAbrir({ ...protocolo });
    setActiveModule('protocolos');
  };

  const abrirForecastDesdeMensajes = (forecast) => {
    if (!forecast) return;
    setShowUnreadForecastChatDropdown(false);
    markForecastChatAsRead(forecast.id, forecast.chatMessagesCount || 0);
    setForecastParaAbrir({ id: forecast.id, numero: forecast.numero });
    setActiveModule('forecast');
  };

  const abrirCotizacionDesdeForecast = (cotizacionId) => {
    if (!cotizacionId) return;
    const cotizacion = sharedCotizaciones.find((item) => String(item.id) === String(cotizacionId));
    if (!cotizacion) {
      setActiveModule('cotizaciones');
      return;
    }
    setCotizacionParaAbrir({ id: cotizacion.id, numero: cotizacion.numero });
    setActiveModule('cotizaciones');
  };

  const abrirProtocoloDesdeForecast = (protocoloId) => {
    if (!protocoloId) return;
    const protocolo = sharedProtocolos.find((item) => String(item.id) === String(protocoloId));
    if (!protocolo) {
      setActiveModule('protocolos');
      return;
    }
    setProtocoloParaAbrir({ id: protocolo.id, folio: protocolo.folio });
    setActiveModule('protocolos');
  };

  const handleHeaderForecastChatAlertClick = () => {
    if (forecastsNoLeidos.length === 0) return;
    if (forecastsNoLeidos.length === 1) {
      abrirForecastDesdeMensajes(forecastsNoLeidos[0]);
      return;
    }
    setShowUnreadForecastChatDropdown((prev) => !prev);
  };

  const handleHeaderChatAlertClick = () => {
    if (protocolosNoLeidos.length === 0) return;
    if (protocolosNoLeidos.length === 1) {
      abrirProtocoloDesdeMensajes(protocolosNoLeidos[0]);
      return;
    }
    setShowUnreadChatDropdown((prev) => !prev);
  };

  useEffect(() => {
    if (!showUnreadChatDropdown) return;

    const protocoloIds = protocolosNoLeidos.map((protocolo) => protocolo.id).filter(Boolean);
    if (!protocoloIds.length) {
      setUnreadChatSummaries({});
      return;
    }

    let cancelled = false;

    const loadUnreadChatSummaries = async () => {
      try {
        setLoadingUnreadChatSummaries(true);
        const { data, error } = await supabase
          .from('protocolos_chat_mensajes')
          .select('id, protocolo_id, mensaje, user_name, user_email, created_at')
          .in('protocolo_id', protocoloIds)
          .order('created_at', { ascending: false });

        if (cancelled) return;

        if (error) {
          if (error.code !== '42P01') {
            console.error('Error cargando resumen de mensajes no leidos:', error);
          }
          setUnreadChatSummaries({});
          return;
        }

        const latestByProtocolo = {};
        (data || []).forEach((mensaje) => {
          if (!mensaje?.protocolo_id || latestByProtocolo[mensaje.protocolo_id]) return;
          latestByProtocolo[mensaje.protocolo_id] = {
            lastMessageText: String(mensaje.mensaje || ''),
            lastMessageUser: String(mensaje.user_name || mensaje.user_email || 'Usuario'),
            lastMessageAt: mensaje.created_at || null
          };
        });
        setUnreadChatSummaries(latestByProtocolo);
      } finally {
        if (!cancelled) {
          setLoadingUnreadChatSummaries(false);
        }
      }
    };

    loadUnreadChatSummaries();

    return () => {
      cancelled = true;
    };
  }, [showUnreadChatDropdown, protocolosNoLeidos]);

  useEffect(() => {
    if (!showUnreadForecastChatDropdown) return;

    const forecastIds = forecastsNoLeidos.map((forecast) => forecast.id).filter(Boolean);
    if (!forecastIds.length) {
      setUnreadForecastChatSummaries({});
      return;
    }

    let cancelled = false;

    const loadUnreadForecastChatSummaries = async () => {
      try {
        setLoadingUnreadForecastChatSummaries(true);
        const { data, error } = await supabase
          .from('forecast_chat_mensajes')
          .select('id, forecast_id, mensaje, user_name, user_email, created_at')
          .in('forecast_id', forecastIds)
          .order('created_at', { ascending: false });

        if (cancelled) return;

        if (error) {
          if (error.code !== '42P01') {
            console.error('Error cargando resumen de mensajes no leidos de forecast:', error);
          }
          setUnreadForecastChatSummaries({});
          return;
        }

        const latestByForecast = {};
        (data || []).forEach((mensaje) => {
          if (!mensaje?.forecast_id || latestByForecast[mensaje.forecast_id]) return;
          latestByForecast[mensaje.forecast_id] = {
            lastMessageText: String(mensaje.mensaje || ''),
            lastMessageUser: String(mensaje.user_name || mensaje.user_email || 'Usuario'),
            lastMessageAt: mensaje.created_at || null
          };
        });
        setUnreadForecastChatSummaries(latestByForecast);
      } finally {
        if (!cancelled) {
          setLoadingUnreadForecastChatSummaries(false);
        }
      }
    };

    loadUnreadForecastChatSummaries();

    return () => {
      cancelled = true;
    };
  }, [showUnreadForecastChatDropdown, forecastsNoLeidos]);

  useEffect(() => {
    setShowUnreadChatDropdown(false);
    setShowUnreadForecastChatDropdown(false);
    if (activeModule !== 'forecast') {
      setSelectedForecastContext(null);
    }
  }, [activeModule]);

  useEffect(() => {
    if (!selectedForecastContext?.id) return;
    markForecastChatAsRead(selectedForecastContext.id, selectedForecastContext.chatMessagesCount || 0);
  }, [selectedForecastContext?.id, selectedForecastContext?.chatMessagesCount]);

  // Permisos por rol
  const hasAccess = (module) => {
    if (isAdminLike) return true;
    if (module === 'administracion' && canAccessAdministracion) return true;
    if (user.role === 'compras' && ['forecast', 'protocolos', 'gantt', 'ordenes', 'proveedores', 'inventario', 'auditorias'].includes(module)) return true;
    if (user.role === 'diseno' && ['forecast', 'gantt', 'proveedores', 'inventario', 'clientes'].includes(module)) return true;
    if (user.role === 'finanzas' && ['cotizaciones', 'clientes', 'facturacion'].includes(module)) return true;
    if (['auditor', 'trade_marketing'].includes(user.role) && module === 'auditorias') return true;
    return false;
  };

  useEffect(() => {
    if (!hasAccess(activeModule)) {
      setActiveModule(getDefaultModuleByRole(user?.role));
    }
  }, [activeModule, user?.role]);

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: BarChart3, roles: ['admin', 'comercial', 'finanzas'] },
    { id: 'forecast', name: 'Forecast', icon: Clock, roles: ['admin', 'comercial', 'compras', 'diseno'] },
    { id: 'cotizaciones', name: 'Cotizaciones', icon: FileText, roles: ['admin', 'comercial', 'finanzas'] },
    { id: 'protocolos', name: 'Protocolos de Compra', icon: Package, roles: ['admin', 'comercial', 'compras'] },
    { id: 'gantt', name: 'Carta Gantt', icon: Calendar, roles: ['admin', 'comercial', 'compras', 'diseno'] },
    { id: 'ordenes', name: 'Órdenes de Compra', icon: ShoppingCart, roles: ['admin', 'comercial', 'compras'] },
    { id: 'inventario', name: 'Bodega/Inventario', icon: Package, roles: ['admin', 'comercial', 'compras', 'diseno'] },
    { id: 'proveedores', name: 'Proveedores', icon: Building2, roles: ['admin', 'comercial', 'compras', 'diseno'] },
    { id: 'clientes', name: 'Clientes', icon: Users, roles: ['admin', 'comercial', 'finanzas', 'diseno'] },
    { id: 'informes', name: 'Informes', icon: TrendingUp, roles: ['admin', 'comercial', 'finanzas'] },
    { id: 'auditorias', name: 'Auditorías', icon: ClipboardCheck, roles: ['admin', 'comercial', 'auditor', 'trade_marketing', 'compras'] },
    { id: 'administracion', name: 'Administración', icon: Settings, roles: ['admin', 'comercial'] }
  ];

  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all transform hover:scale-105">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl`} style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-sm font-medium">{title}</p>
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-gray-800">{value}</p>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="shadow-md sticky top-0 z-50" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between relative">
            {/* Logo KODIAK a la izquierda */}
            <div className="flex items-center space-x-3">
              <img 
                src="/logo-kodiak.png" 
                alt="KODIAK" 
                className="h-12 w-auto"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
              {hasAccess('protocolos') && totalMensajesSinLeer > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleHeaderChatAlertClick}
                    className="group flex items-center gap-3 rounded-2xl border border-white/20 bg-white/12 px-4 py-2 shadow-lg backdrop-blur-md transition-all hover:bg-white/18 hover:shadow-xl"
                    title="Ver mensajes pendientes"
                  >
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                      <MessageCircle className="h-5 w-5 text-white" />
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#f97316] px-1 text-[11px] font-bold text-white">
                        {totalMensajesSinLeer}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold leading-tight text-white">
                        Tienes {totalMensajesSinLeer} mensaje{totalMensajesSinLeer === 1 ? '' : 's'} en Protocolos
                      </p>
                      <p className="text-xs text-white/75">
                        {protocolosConMensajesSinLeer} protocolo{protocolosConMensajesSinLeer === 1 ? '' : 's'} con chat pendiente
                      </p>
                    </div>
                  </button>

                  <DropdownMensajesNoLeidos
                    visible={showUnreadChatDropdown && protocolosNoLeidos.length > 1}
                    loading={loadingUnreadChatSummaries}
                    title="Mensajes sin leer en Protocolos"
                    subtitle="Selecciona el protocolo que quieres responder"
                    prefix="PT-"
                    entitySingular="protocolo"
                    items={protocolosNoLeidos.map((protocolo) => ({
                      ...protocolo,
                      ...unreadChatSummaries[protocolo.id]
                    }))}
                    onClose={() => setShowUnreadChatDropdown(false)}
                    onSeleccionar={abrirProtocoloDesdeMensajes}
                  />
                </div>
              )}
              {hasAccess('forecast') && totalMensajesForecastSinLeer > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleHeaderForecastChatAlertClick}
                    className="group flex items-center gap-3 rounded-2xl border border-white/20 bg-white/12 px-4 py-2 shadow-lg backdrop-blur-md transition-all hover:bg-white/18 hover:shadow-xl"
                    title="Ver mensajes pendientes de Forecast"
                  >
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                      <MessageCircle className="h-5 w-5 text-white" />
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#f97316] px-1 text-[11px] font-bold text-white">
                        {totalMensajesForecastSinLeer}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold leading-tight text-white">
                        Tienes {totalMensajesForecastSinLeer} mensaje{totalMensajesForecastSinLeer === 1 ? '' : 's'} en Forecast
                      </p>
                      <p className="text-xs text-white/75">
                        {forecastsConMensajesSinLeer} forecast{forecastsConMensajesSinLeer === 1 ? '' : 's'} con chat pendiente
                      </p>
                    </div>
                  </button>

                  <DropdownMensajesNoLeidos
                    visible={showUnreadForecastChatDropdown && forecastsNoLeidos.length > 1}
                    loading={loadingUnreadForecastChatSummaries}
                    title="Mensajes sin leer en Forecast"
                    subtitle="Selecciona el forecast que quieres responder"
                    prefix="FW-"
                    entitySingular="forecast"
                    items={forecastsNoLeidos.map((forecast) => ({
                      ...forecast,
                      ...unreadForecastChatSummaries[forecast.id]
                    }))}
                    onClose={() => setShowUnreadForecastChatDropdown(false)}
                    onSeleccionar={abrirForecastDesdeMensajes}
                  />
                </div>
              )}
            </div>
            
            {/* Logo Building Me centrado */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <img 
                src="/logo-building-me.png" 
                alt="Building Me" 
                className="h-10 w-auto"
              />
            </div>
            
            {/* Usuario a la derecha */}
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-white font-semibold">{user.name}</p>
                <p className="text-sm text-white/70">{getRoleLabel(user.role)}</p>
              </div>
              <button
                onClick={onLogout}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navegación horizontal de módulos */}
      <nav className="bg-white shadow-md border-b border-gray-200 sticky top-[72px] z-40">
        <div className="px-8 py-3">
          <div className="flex items-center justify-center space-x-2 overflow-x-auto">
            {menuItems.map((item) => {
              const canShowItem = item.roles.includes('all')
                || item.roles.includes(user.role)
                || (item.id === 'administracion' && canAccessAdministracion);

              if (canShowItem) {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveModule(item.id)}
                    className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg transition-all whitespace-nowrap ${
                      activeModule === item.id
                        ? 'text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    style={activeModule === item.id ? {
                      background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)'
                    } : {}}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="p-8">
          {activeModule === 'dashboard' && (
            <div>
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-800 mb-2">Dashboard</h2>
                <p className="text-gray-600">Vista general de proyectos y ventas</p>
              </div>

              {/* Filtro por Unidad de Negocio */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Filtrar por Unidad de Negocio</label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="px-4 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#45ad98] bg-white"
                >
                  <option>Todas</option>
                  {BUSINESS_UNITS.map(unit => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard
                  title="Cotizaciones Emitidas"
                  value={stats.cotizacionesEmitidas}
                  icon={FileText}
                  color="#33b4e9"
                />
                <StatCard
                  title="Cotizaciones Ganadas"
                  value={stats.cotizacionesGanadas}
                  icon={CheckCircle}
                  color="#45ad98"
                  subtitle={stats.cotizacionesEmitidas > 0 ? `${Math.round((stats.cotizacionesGanadas / stats.cotizacionesEmitidas) * 100)}% tasa de éxito` : '0% tasa de éxito'}
                />
                <StatCard
                  title="Cotizaciones Perdidas"
                  value={stats.cotizacionesPerdidas}
                  icon={XCircle}
                  color="#ef4444"
                />
                <StatCard
                  title="Cotizaciones Standby"
                  value={stats.cotizacionesStandby}
                  icon={Pause}
                  color="#f59e0b"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(() => {
                  const normalizarUnidad = (unidadNegocio) => {
                    const value = String(unidadNegocio || '').toLowerCase();
                    if (value.includes('inmobiliaria')) return 'Inmobiliarias';
                    if (value.includes('stand')) return 'Stand y Ferias';
                    if (value.includes('trade')) return 'TradeMarketing';
                    if (value.includes('imprenta')) return 'Imprenta';
                    if (value.includes('vario')) return 'Varios';
                    return unidadNegocio || 'Sin asignar';
                  };

                  const netoPorUnidad = sharedProtocolos.reduce((acc, protocolo) => {
                    const unidad = normalizarUnidad(protocolo.unidadNegocio);
                    const neto = protocolo.montoNetoCotizacion ?? protocolo.montoTotal ?? 0;
                    acc[unidad] = (acc[unidad] || 0) + neto;
                    return acc;
                  }, {});

                  const cotizacionesGanadas = sharedCotizaciones.filter(
                    (c) => c.estado === 'ganada' && !c.adjudicada_a_protocolo
                  );
                  cotizacionesGanadas.forEach((cotizacion) => {
                    const unidad = normalizarUnidad(cotizacion.unidadNegocio);
                    const neto = cotizacion.montoNeto ?? cotizacion.neto ?? cotizacion.monto ?? 0;
                    netoPorUnidad[unidad] = (netoPorUnidad[unidad] || 0) + neto;
                  });

                  const resumen = [
                    { label: 'Trade Marketing', key: 'TradeMarketing' },
                    { label: 'Inmobiliaria', key: 'Inmobiliarias' },
                    { label: 'Stand y Ferias', key: 'Stand y Ferias' },
                    { label: 'Imprenta', key: 'Imprenta' },
                    { label: 'Varios', key: 'Varios' }
                  ];

                  const formatMonto = (monto) =>
                    new Intl.NumberFormat('es-CL', {
                      style: 'currency',
                      currency: 'CLP',
                      minimumFractionDigits: 0
                    }).format(monto || 0);

                  return resumen.map((item, index) => (
                    <StatCard
                      key={item.key}
                      title={`Monto Neto ${item.label}`}
                      value={formatMonto(netoPorUnidad[item.key] || 0)}
                      icon={DollarSign}
                      color={index % 2 === 0 ? '#235250' : '#45ad98'}
                      subtitle="CLP"
                    />
                  ));
                })()}
              </div>

              {/* Sección de Protocolos */}
              <div className="mt-8">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Estado de Protocolos</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    title="Protocolos Abiertos"
                    value={stats.protocolosAbiertos}
                    icon={Package}
                    color="#45ad98"
                  />
                  <StatCard
                    title="Protocolos En Proceso"
                    value={stats.protocolosEnProceso}
                    icon={Clock}
                    color="#f59e0b"
                  />
                  <StatCard
                    title="OC Sin Factura"
                    value={stats.ocSinFactura}
                    icon={FileText}
                    color="#ef4444"
                    subtitle="Requieren atención"
                  />
                  <StatCard
                    title="Pagos Pendientes"
                    value={stats.pagosPendientes}
                    icon={DollarSign}
                    color="#8b5cf6"
                    subtitle="Por pagar"
                  />
                </div>
              </div>

              {/* Alertas */}
              {(stats.ocSinFactura > 0 || stats.pagosPendientes > 0 || stats.protocolosSinOcCliente > 0) && (
                <div className="mt-8">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">🔔 Alertas</h3>
                  <div className="space-y-3">
                    {stats.protocolosSinOcCliente > 0 && (
                      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
                        <div className="flex items-center">
                          <FileText className="w-5 h-5 text-blue-600 mr-3" />
                          <div>
                            <p className="font-semibold text-blue-800">
                              {stats.protocolosSinOcCliente} Protocolos sin OC Cliente asignada
                            </p>
                            <p className="text-sm text-blue-600">Revisa protocolos abiertos/en proceso</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {stats.ocSinFactura > 0 && (
                      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                        <div className="flex items-center">
                          <FileText className="w-5 h-5 text-red-600 mr-3" />
                          <div>
                            <p className="font-semibold text-red-800">
                              {stats.ocSinFactura} Órdenes de Compra sin factura asignada
                            </p>
                            <p className="text-sm text-red-600">Revisa los protocolos activos para actualizar</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {stats.pagosPendientes > 0 && (
                      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg">
                        <div className="flex items-center">
                          <DollarSign className="w-5 h-5 text-yellow-600 mr-3" />
                          <div>
                            <p className="font-semibold text-yellow-800">
                              {stats.pagosPendientes} Facturas pendientes de pago
                            </p>
                            <p className="text-sm text-yellow-600">Coordina con el área de finanzas</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeModule === 'cotizaciones' && (
            <CotizacionesModule
              sharedCotizaciones={sharedCotizaciones}
              setSharedCotizaciones={setSharedCotizaciones}
              sharedProtocolos={sharedProtocolos}
              sharedOrdenesCompra={sharedOrdenesCompra}
              cotizacionParaAbrir={cotizacionParaAbrir}
              onLimpiarCotizacionParaAbrir={() => setCotizacionParaAbrir(null)}
              onAdjudicarVenta={handleAdjudicarVentaDesdeCotizacion}
              currentUserName={user?.name}
              user={user}
            />
          )}

          {activeModule === 'forecast' && hasAccess('forecast') && (
            <ForecastModule
              activeModule={activeModule}
              sharedForecasts={sharedForecasts}
              sharedCotizaciones={sharedCotizaciones}
              sharedProtocolos={sharedProtocolos}
              currentUserName={user?.name}
              currentUser={user}
              forecastParaAbrir={forecastParaAbrir}
              onLimpiarForecastParaAbrir={() => setForecastParaAbrir(null)}
              onSelectForecast={(forecast) => setSelectedForecastContext(forecast || null)}
              onMarkChatRead={markForecastChatAsRead}
              onOpenCotizacion={abrirCotizacionDesdeForecast}
              onOpenProtocolo={abrirProtocoloDesdeForecast}
            />
          )}

          {activeModule === 'protocolos' && hasAccess('protocolos') && (
            <ProtocolosModule 
              sharedProtocolos={sharedProtocolos}
              setSharedProtocolos={setSharedProtocolos}
              sharedOrdenesCompra={sharedOrdenesCompra}
              setSharedOrdenesCompra={setSharedOrdenesCompra}
              sharedCotizaciones={sharedCotizaciones}
              chatReadState={sharedChatReadState}
              setChatReadState={setSharedChatReadState}
              protocoloParaAbrir={protocoloParaAbrir}
              onAdjudicarVentaDesdeCotizacion={handleAdjudicarVentaDesdeCotizacion}
              onLimpiarProtocoloParaAbrir={() => setProtocoloParaAbrir(null)}
              currentUserName={user?.name}
              user={user}
            />
          )}

          {hasAccess('gantt') && (
            <CartaGanttModule activeModule={activeModule} sharedProtocolos={sharedProtocolos} />
          )}

          {activeModule === 'ordenes' && hasAccess('ordenes') && (
  <OrdenesCompraModule 
    user={user}
    sharedOrdenesCompra={sharedOrdenesCompra}
    setSharedOrdenesCompra={setSharedOrdenesCompra}
    sharedProtocolos={sharedProtocolos}
    datosPreOC={datosPreOC}
    onCancelarPreOC={() => setDatosPreOC(null)}
  />
)}

          {activeModule === 'proveedores' && hasAccess('proveedores') && (
            <ProveedoresModule />
          )}

          {activeModule === 'clientes' && hasAccess('clientes') && (
            <ClientesModule />
          )}

          {activeModule === 'administracion' && canAccessAdministracion && (
            <AdministracionModule activeModule={activeModule} />
          )}

          {/* Módulo de Inventario/Bodega */}
          {hasAccess('inventario') && (
            <InventarioModule activeModule={activeModule} sharedProtocolos={sharedProtocolos} />
          )}

          {/* Módulo de Informes */}
          {hasAccess('informes') && (
            <InformesModule
              activeModule={activeModule}
              sharedProtocolos={sharedProtocolos}
              sharedOrdenesCompra={sharedOrdenesCompra}
              sharedCotizaciones={sharedCotizaciones}
            />
          )}

          {/* Módulo de Auditorías */}
          {activeModule === 'auditorias' && hasAccess('auditorias') && (
            <AuditoriasModule user={user} />
          )}
        </main>
    </div>
  );
};

// App Principal
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar sesión existente con Supabase Auth
    const initSession = async () => {
      try {
        const profile = await obtenerSesionActual();
        if (profile) {
          setUser({
            id: profile.id,
            email: profile.email,
            username: profile.email,
            name: profile.nombre,
            role: normalizeRole(profile.rol)
          });
        }
      } catch (e) {
        console.error('Error verificando sesión:', e);
      } finally {
        setLoading(false);
      }
    };
    initSession();

    // Escuchar cambios de estado de auth (logout, expiración de token, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (userData) => {
    setUser({
      ...userData,
      role: normalizeRole(userData.role)
    });
  };

  const handleLogout = async () => {
    try {
      await cerrarSesion();
    } catch (e) {
      console.error('Error cerrando sesión:', e);
    }
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #235250 0%, #45ad98 100%)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/80 text-lg font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ToastContainer />
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <Dashboard user={user} onLogout={handleLogout} />
    </>
  );
}
