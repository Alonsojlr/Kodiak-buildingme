import React, { useMemo, useState, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, Package, CheckCircle,
  Clock, FileText, Activity, Users, Building2, Zap
} from 'lucide-react'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return '$' + Math.round(n).toLocaleString('es-CL')
}
const fmtFull = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtPct  = (n) => Number.isFinite(n) ? n.toFixed(1) + '%' : '—'

const ESTADO_COLORS = {
  'En proceso':  '#3b82f6',
  'Completado':  '#22c55e',
  'Facturado':   '#8b5cf6',
  'Entregado':   '#14b8a6',
  'Cancelado':   '#ef4444',
  'Standby':     '#f59e0b',
  'Cerrado':     '#6b7280',
}
const COTIZ_COLORS = {
  emitida: '#3b82f6',
  ganada:  '#22c55e',
  standby: '#f59e0b',
  perdida: '#ef4444',
}

const colorRent = (pct) => {
  if (pct >= 30) return '#15803d'
  if (pct >= 15) return '#16a34a'
  if (pct >= 5)  return '#d97706'
  if (pct >= 0)  return '#ea580c'
  return '#dc2626'
}

// ── SVG: Area + Line Chart (dual series) ─────────────────────────────────────
const AreaLineChart = ({ data }) => {
  if (!data || data.length < 2) return (
    <div className="flex items-center justify-center h-36 text-gray-300 text-sm">Sin suficientes datos</div>
  )
  const maxVal = Math.max(...data.map(d => Math.max(d.ventaNeta, d.costoOC)), 1)
  const W = 500, H = 160
  const padL = 8, padR = 8, padT = 12, padB = 22
  const w = W - padL - padR, h = H - padT - padB

  const xPos = (i) => padL + (i / (data.length - 1)) * w
  const yPos = (v) => padT + h - (v / maxVal) * h

  const linePath = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d[key]).toFixed(1)}`).join(' ')
  const areaPath = (key) => {
    const p = linePath(key)
    return `${p} L ${xPos(data.length-1).toFixed(1)} ${(padT+h).toFixed(1)} L ${xPos(0).toFixed(1)} ${(padT+h).toFixed(1)} Z`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#45ad98" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#45ad98" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={padL} x2={W - padR}
          y1={padT + h * (1 - t)} y2={padT + h * (1 - t)}
          stroke="#f3f4f6" strokeWidth="1" />
      ))}
      <path d={areaPath('costoOC')}  fill="url(#gc)" />
      <path d={areaPath('ventaNeta')} fill="url(#gv)" />
      <path d={linePath('costoOC')}  fill="none" stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 2" />
      <path d={linePath('ventaNeta')} fill="none" stroke="#45ad98" strokeWidth="2.5" />
      {data.map((d, i) => d.ventaNeta > 0 && (
        <circle key={i} cx={xPos(i)} cy={yPos(d.ventaNeta)} r="3.5"
          fill="white" stroke="#45ad98" strokeWidth="2" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={xPos(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="#9ca3af">
          {d.label}
        </text>
      ))}
    </svg>
  )
}

// ── SVG: Donut Chart ──────────────────────────────────────────────────────────
const DonutChart = ({ data, size = 140 }) => {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height: size }}>Sin datos</div>
  )
  const cx = size / 2, cy = size / 2
  const r = size * 0.41, ir = size * 0.26

  const p2c = (radius, angle) => ({
    x: cx + radius * Math.cos(angle - Math.PI / 2),
    y: cy + radius * Math.sin(angle - Math.PI / 2),
  })

  let cum = 0
  const segs = data.map(d => {
    const start = (cum / total) * Math.PI * 2
    cum += d.value
    const end = (cum / total) * Math.PI * 2
    return { ...d, start, end }
  })

  return (
    <svg width={size} height={size}>
      {segs.map((s, i) => {
        const large = s.end - s.start > Math.PI ? 1 : 0
        const os = p2c(r,  s.start), oe = p2c(r,  s.end)
        const is = p2c(ir, s.end),   ie = p2c(ir, s.start)
        const d = `M ${os.x} ${os.y} A ${r} ${r} 0 ${large} 1 ${oe.x} ${oe.y} L ${is.x} ${is.y} A ${ir} ${ir} 0 ${large} 0 ${ie.x} ${ie.y} Z`
        return <path key={i} d={d} fill={s.color} opacity="0.92" />
      })}
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize={size * 0.14} fontWeight="bold" fill="#1f2937">{total}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={size * 0.085} fill="#9ca3af">proyectos</text>
    </svg>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon: Icon, iconColor = 'text-teal-500', trend }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      {Icon && <Icon size={15} className={iconColor} />}
    </div>
    <div className="text-xl font-bold text-gray-800 leading-tight">{value}</div>
    {sub && (
      <div className="flex items-center gap-1 text-xs">
        {trend === 'up'   && <TrendingUp  size={11} className="text-green-500" />}
        {trend === 'down' && <TrendingDown size={11} className="text-red-500" />}
        <span className="text-gray-400">{sub}</span>
      </div>
    )}
  </div>
)

// ── Horizontal bar row ────────────────────────────────────────────────────────
const HBar = ({ label, value, max, color, badge }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 text-gray-600 truncate flex-shrink-0 text-right">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className="h-3 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-20 text-gray-700 font-semibold text-right flex-shrink-0">{fmt(value)}</div>
      {badge && <div className="w-12 text-right flex-shrink-0" style={{ color: colorRent(badge) }}>{fmtPct(badge)}</div>}
    </div>
  )
}

// ── Legend dot ────────────────────────────────────────────────────────────────
const LegendDot = ({ color, label, value }) => (
  <div className="flex items-center gap-1.5 text-xs">
    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    <span className="text-gray-500 truncate">{label}</span>
    {value !== undefined && <span className="font-semibold text-gray-700 ml-auto pl-2">{value}</span>}
  </div>
)

// ── Main Dashboard ────────────────────────────────────────────────────────────
const DashboardTab = ({
  metricas = [],
  kpis = {},
  porUnidad = [],
  porCliente = [],
  sharedCotizaciones = [],
  protocolosFacturas = [],
  sharedProtocolos = [],
  sharedOrdenesCompra = [],
}) => {
  const [lastUpdated, setLastUpdated] = useState(new Date())
  useEffect(() => { setLastUpdated(new Date()) }, [metricas, sharedCotizaciones])

  const rentGlobal = kpis.ventaNeta > 0 ? (kpis.margen / kpis.ventaNeta) * 100 : 0

  // ── Monthly trend (last 12 months, unfiltered) ──
  const monthlyData = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-CL', { month: 'short' }),
        ventaNeta: 0,
        costoOC: 0,
        margen: 0,
      }
    })
    metricas.forEach(m => {
      if (!m.fechaCreacion) return
      const key = m.fechaCreacion.slice(0, 7)
      const slot = months.find(s => s.key === key)
      if (slot) {
        slot.ventaNeta += m.ventaNeta
        slot.costoOC   += m.costoOC
        slot.margen    += m.margen
      }
    })
    return months
  }, [metricas])

  // ── Estado breakdown ──
  const estadoData = useMemo(() => {
    const map = {}
    metricas.forEach(m => {
      const k = m.estado || 'Sin estado'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map)
      .map(([label, value]) => ({ label, value, color: ESTADO_COLORS[label] || '#9ca3af' }))
      .sort((a, b) => b.value - a.value)
  }, [metricas])

  // ── Cotizaciones pipeline ──
  const pipeline = useMemo(() => {
    const map = {}
    sharedCotizaciones.forEach(c => {
      const k = c.estado || 'sin estado'
      if (!map[k]) map[k] = { count: 0, monto: 0 }
      map[k].count++
      map[k].monto += parseFloat(c.monto || c.neto || 0)
    })
    const total = sharedCotizaciones.length
    return Object.entries(map)
      .map(([estado, d]) => ({ estado, ...d, total, color: COTIZ_COLORS[estado] || '#9ca3af' }))
      .sort((a, b) => b.monto - a.monto)
  }, [sharedCotizaciones])

  // ── OCs pendientes de pago ──
  const ocsPendientes = useMemo(() =>
    sharedOrdenesCompra
      .filter(oc => (oc.facturas || []).some(f => f.estadoPago !== 'Pagada'))
      .slice(0, 8)
      .map(oc => {
        const pendiente = (oc.facturas || [])
          .filter(f => f.estadoPago !== 'Pagada')
          .reduce((s, f) => s + (parseFloat(f.monto) || 0), 0)
        return { ...oc, pendiente }
      })
      .sort((a, b) => b.pendiente - a.pendiente),
  [sharedOrdenesCompra])

  // ── Por cobrar (facturas BM no pagadas) ──
  const porCobrarTotal = useMemo(() =>
    protocolosFacturas.filter(f => f.estado_pago !== 'Pagada').reduce((s, f) => s + (parseFloat(f.monto) || 0), 0),
  [protocolosFacturas])

  // ── Proyectos recientes ──
  const proyectosRecientes = useMemo(() =>
    [...metricas].sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || '')).slice(0, 8),
  [metricas])

  const maxClienteVenta = Math.max(...porCliente.slice(0, 7).map(c => c.ventaNeta), 1)
  const maxUnidadVenta  = Math.max(...porUnidad.map(u => u.ventaNeta), 1)

  return (
    <div className="space-y-4">

      {/* Live header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400 font-medium">
            En vivo · Actualizado {lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <span className="text-xs text-gray-400">{metricas.length} proyectos · {sharedCotizaciones.length} cotizaciones</span>
      </div>

      {/* Row 1 — KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Venta Neta" value={fmt(kpis.ventaNeta)} icon={DollarSign} iconColor="text-teal-500" />
        <KpiCard label="Costo OC" value={fmt(kpis.costoOC)} icon={Package} iconColor="text-orange-400" />
        <KpiCard
          label="Margen Bruto"
          value={fmt(kpis.margen)}
          sub={fmtPct(rentGlobal) + ' rentabilidad'}
          icon={rentGlobal >= 0 ? TrendingUp : TrendingDown}
          iconColor={rentGlobal >= 0 ? 'text-green-500' : 'text-red-500'}
          trend={rentGlobal >= 0 ? 'up' : 'down'}
        />
        <KpiCard label="Facturado" value={fmt(kpis.totalFacturado)} sub="a clientes" icon={FileText} iconColor="text-blue-500" />
        <KpiCard label="Cobrado" value={fmt(kpis.totalCobrado)} icon={CheckCircle} iconColor="text-green-500" />
        <KpiCard label="Por Cobrar" value={fmt(porCobrarTotal)} icon={Clock} iconColor="text-amber-500" />
      </div>

      {/* Row 2 — Trend chart + Estado donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Area chart — monthly */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Tendencia mensual — Venta vs Costo OC</h3>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-teal-500 rounded" /> Venta</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-orange-400" /> Costo</span>
            </div>
          </div>
          <AreaLineChart data={monthlyData} />
          <div className="flex justify-between mt-2 text-[10px] text-gray-400">
            <span>Últimos 12 meses</span>
            <span>Total período: {fmt(kpis.ventaNeta)}</span>
          </div>
        </div>

        {/* Donut — estado proyectos */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado de Proyectos</h3>
          <div className="flex items-center justify-center mb-3">
            <DonutChart data={estadoData} size={140} />
          </div>
          <div className="space-y-1.5">
            {estadoData.map(d => (
              <LegendDot key={d.label} color={d.color} label={d.label} value={d.value} />
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 — Top clientes + Pipeline cotizaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top clientes */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-700">Top Clientes por Venta Neta</h3>
          </div>
          <div className="space-y-2.5">
            {porCliente.slice(0, 7).map(c => (
              <HBar
                key={c.cliente}
                label={c.cliente}
                value={c.ventaNeta}
                max={maxClienteVenta}
                color="#3b82f6"
                badge={c.rentabilidad}
              />
            ))}
            {porCliente.length === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
          </div>
        </div>

        {/* Pipeline cotizaciones */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={15} className="text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-700">Pipeline de Cotizaciones</h3>
          </div>
          <div className="space-y-3">
            {pipeline.map(p => (
              <div key={p.estado}>
                <div className="flex justify-between text-xs mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="capitalize text-gray-600 font-medium">{p.estado}</span>
                    <span className="text-gray-400">({p.count})</span>
                  </div>
                  <span className="font-semibold text-gray-700">{fmt(p.monto)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full" style={{ width: `${(p.count / p.total) * 100}%`, backgroundColor: p.color }} />
                </div>
              </div>
            ))}
            {pipeline.length === 0 && <p className="text-sm text-gray-400">Sin cotizaciones</p>}
          </div>

          {/* Tasa de cierre */}
          {(() => {
            const ganadas = sharedCotizaciones.filter(c => c.estado === 'ganada').length
            const total   = sharedCotizaciones.filter(c => ['ganada','perdida'].includes(c.estado)).length
            const tasa    = total > 0 ? ((ganadas / total) * 100).toFixed(1) : null
            return tasa ? (
              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                <span className="text-gray-500">Tasa de cierre</span>
                <span className="font-bold text-green-600 text-base">{tasa}%</span>
              </div>
            ) : null
          })()}
        </div>
      </div>

      {/* Row 4 — Rentabilidad por UdN */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={15} className="text-teal-500" />
          <h3 className="text-sm font-semibold text-gray-700">Rentabilidad por Unidad de Negocio</h3>
        </div>
        <div className="space-y-2.5">
          {porUnidad.map(u => (
            <HBar
              key={u.unidadNegocio}
              label={u.unidadNegocio}
              value={u.ventaNeta}
              max={maxUnidadVenta}
              color="#45ad98"
              badge={u.rentabilidad}
            />
          ))}
          {porUnidad.length === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
          <span>Barra = Venta Neta</span>
          <span>% = Rentabilidad</span>
        </div>
      </div>

      {/* Row 5 — Proyectos recientes + OCs pendientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Proyectos recientes */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <FileText size={14} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Proyectos Recientes</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {proyectosRecientes.map(m => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-700 truncate">{m.nombreProyecto || `F-${m.folio}`}</p>
                  <p className="text-[10px] text-gray-400 truncate">{m.cliente} · {m.unidadNegocio}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ESTADO_COLORS[m.estado] || '#9ca3af' }}
                  />
                  <span className="text-xs font-semibold text-gray-700">{fmt(m.ventaNeta)}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ color: colorRent(m.rentabilidad), backgroundColor: colorRent(m.rentabilidad) + '18' }}>
                    {fmtPct(m.rentabilidad)}
                  </span>
                </div>
              </div>
            ))}
            {proyectosRecientes.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Sin proyectos</div>
            )}
          </div>
        </div>

        {/* OCs pendientes de pago */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-orange-400" />
              <h3 className="text-sm font-semibold text-gray-700">OCs con Facturas Pendientes</h3>
            </div>
            {ocsPendientes.length > 0 && (
              <span className="text-xs text-orange-500 font-semibold bg-orange-50 px-2 py-0.5 rounded-full">
                {ocsPendientes.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {ocsPendientes.map(oc => (
              <div key={oc.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-700 truncate">
                    OC #{oc.numero || oc.id?.slice(0, 8)}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{oc.proveedor || 'Sin proveedor'}</p>
                </div>
                <div className="flex-shrink-0 ml-3 text-right">
                  <p className="text-xs font-bold text-orange-600">{fmt(oc.pendiente)}</p>
                  <p className="text-[10px] text-gray-400">por pagar</p>
                </div>
              </div>
            ))}
            {ocsPendientes.length === 0 && (
              <div className="px-5 py-8 text-center">
                <CheckCircle size={24} className="mx-auto text-green-300 mb-2" />
                <p className="text-sm text-gray-400">Todo al día</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default DashboardTab
