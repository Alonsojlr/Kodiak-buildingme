import React, { useMemo, useState, useEffect } from 'react'
import {
  Package, TrendingDown, DollarSign, CheckCircle, Clock,
  AlertCircle, ShoppingCart, Building2, Tag, Layers, Users, FileText
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return '$' + Math.round(n).toLocaleString('es-CL')
}
const fmtFull = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL')

const ESTADO_COLORS = {
  'Emitida':   '#3b82f6',
  'Recibida':  '#8b5cf6',
  'Facturada': '#f97316',
  'Pagada':    '#22c55e',
  'Cancelada': '#ef4444',
}
const PALETTE = ['#45ad98','#3b82f6','#8b5cf6','#f97316','#f59e0b','#ec4899','#14b8a6','#6366f1','#84cc16']

const calcCostoOC = (oc) =>
  (oc.items || []).reduce((s, item) => {
    const val  = item.valorUnitario ?? item.valor_unitario ?? 0
    const cant = item.cantidad || 0
    const desc = item.descuento || 0
    const sub  = cant * val
    return s + sub - sub * (desc / 100)
  }, 0) || oc.subtotal || (oc.total ? oc.total / 1.19 : 0)

// ── Sub-components ────────────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, icon: Icon, iconColor = 'text-teal-500' }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      {Icon && <Icon size={15} className={iconColor} />}
    </div>
    <div className="text-xl font-bold text-gray-800 leading-tight">{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
  </div>
)

const HBar = ({ label, value, max, color, sub }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-32 text-gray-600 truncate flex-shrink-0 text-right">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-20 text-gray-700 font-semibold text-right flex-shrink-0">{fmt(value)}</div>
      {sub !== undefined && <div className="w-8 text-gray-400 text-right flex-shrink-0 text-[10px]">{sub}</div>}
    </div>
  )
}

// SVG: Area chart mono-serie
const MiniAreaChart = ({ data, color = '#45ad98', height = 140 }) => {
  if (!data || data.length < 2) return (
    <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height }}>Sin suficientes datos</div>
  )
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const W = 500, H = height
  const padL = 6, padR = 6, padT = 10, padB = 22
  const w = W - padL - padR, h = H - padT - padB

  const xPos = (i) => padL + (i / (data.length - 1)) * w
  const yPos = (v) => padT + h - (v / maxVal) * h

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(d.value).toFixed(1)}`).join(' ')
  const area = `${line} L ${xPos(data.length - 1).toFixed(1)} ${(padT + h).toFixed(1)} L ${xPos(0).toFixed(1)} ${(padT + h).toFixed(1)} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`cg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={padL} x2={W - padR}
          y1={padT + h * (1 - t)} y2={padT + h * (1 - t)}
          stroke="#f3f4f6" strokeWidth="1" />
      ))}
      <path d={area} fill={`url(#cg-${color.replace('#','')})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => d.value > 0 && (
        <circle key={i} cx={xPos(i)} cy={yPos(d.value)} r="3"
          fill="white" stroke={color} strokeWidth="2" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={xPos(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="#9ca3af">{d.label}</text>
      ))}
    </svg>
  )
}

// SVG: Donut
const DonutChart = ({ data, size = 130 }) => {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return (
    <div className="flex items-center justify-center text-gray-300 text-sm" style={{ height: size }}>Sin datos</div>
  )
  const cx = size / 2, cy = size / 2, r = size * 0.41, ir = size * 0.25
  const p2c = (rad, ang) => ({ x: cx + rad * Math.cos(ang - Math.PI / 2), y: cy + rad * Math.sin(ang - Math.PI / 2) })
  let cum = 0
  const segs = data.map(d => {
    const start = (cum / total) * Math.PI * 2; cum += d.value
    return { ...d, start, end: (cum / total) * Math.PI * 2 }
  })
  return (
    <svg width={size} height={size}>
      {segs.map((s, i) => {
        const large = s.end - s.start > Math.PI ? 1 : 0
        const os = p2c(r, s.start), oe = p2c(r, s.end)
        const is = p2c(ir, s.end),  ie = p2c(ir, s.start)
        const d = `M ${os.x} ${os.y} A ${r} ${r} 0 ${large} 1 ${oe.x} ${oe.y} L ${is.x} ${is.y} A ${ir} ${ir} 0 ${large} 0 ${ie.x} ${ie.y} Z`
        return <path key={i} d={d} fill={s.color} opacity="0.9" />
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={size * 0.14} fontWeight="bold" fill="#1f2937">{total}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize={size * 0.085} fill="#9ca3af">OCs</text>
    </svg>
  )
}

const Dot = ({ color, label, value, pct }) => (
  <div className="flex items-center gap-1.5 text-xs">
    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    <span className="text-gray-500 flex-1 truncate">{label}</span>
    {pct !== undefined && <span className="text-gray-400 text-[10px]">{pct}%</span>}
    {value !== undefined && <span className="font-semibold text-gray-700">{fmt(value)}</span>}
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const CostosTab = ({ sharedOrdenesCompra = [], sharedProtocolos = [] }) => {
  const [lastUpdated, setLastUpdated] = useState(new Date())
  useEffect(() => { setLastUpdated(new Date()) }, [sharedOrdenesCompra])

  // Enriquecer OCs con unidadNegocio del protocolo si no la tienen
  const protocolosByFolio = useMemo(() => {
    const map = {}
    sharedProtocolos.forEach(p => { if (p.folio) map[String(p.folio)] = p })
    return map
  }, [sharedProtocolos])

  const ocs = useMemo(() =>
    sharedOrdenesCompra
      .filter(oc => oc.estado !== 'Cancelada')
      .map(oc => ({
        ...oc,
        costoNeto: calcCostoOC(oc),
        unidadNegocio: oc.unidadNegocio ||
          protocolosByFolio[String(oc.codigoProtocolo)]?.unidadNegocio ||
          'Sin asignar',
        facturadoTotal:  (oc.facturas || []).reduce((s, f) => s + (parseFloat(f.monto) || 0), 0),
        pagadoTotal:     (oc.facturas || []).filter(f => f.estadoPago === 'Pagada').reduce((s, f) => s + (parseFloat(f.monto) || 0), 0),
      })),
  [sharedOrdenesCompra, protocolosByFolio])

  // ── KPIs ──
  const kpis = useMemo(() => ocs.reduce((acc, oc) => ({
    totalOCs:       acc.totalOCs + 1,
    costoTotal:     acc.costoTotal     + oc.costoNeto,
    facturadoTotal: acc.facturadoTotal + oc.facturadoTotal,
    pagadoTotal:    acc.pagadoTotal    + oc.pagadoTotal,
  }), { totalOCs: 0, costoTotal: 0, facturadoTotal: 0, pagadoTotal: 0 }), [ocs])

  const porPagar      = kpis.facturadoTotal - kpis.pagadoTotal
  const sinFactura    = ocs.filter(oc => !oc.facturas?.length && ['Emitida','Recibida'].includes(oc.estado)).length

  // ── Tendencia mensual (últimos 12 meses) ──
  const monthlyData = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-CL', { month: 'short' }),
        value: 0,
      }
    })
    ocs.forEach(oc => {
      if (!oc.fecha) return
      const key = oc.fecha.slice(0, 7)
      const slot = months.find(s => s.key === key)
      if (slot) slot.value += oc.costoNeto
    })
    return months
  }, [ocs])

  // ── Por estado ──
  const porEstado = useMemo(() => {
    const map = {}
    ocs.forEach(oc => {
      const k = oc.estado || 'Sin estado'
      if (!map[k]) map[k] = { label: k, value: 0, monto: 0, color: ESTADO_COLORS[k] || '#9ca3af' }
      map[k].value++
      map[k].monto += oc.costoNeto
    })
    return Object.values(map).sort((a, b) => b.monto - a.monto)
  }, [ocs])

  // ── Por proveedor ──
  const porProveedor = useMemo(() => {
    const map = {}
    ocs.forEach(oc => {
      const k = oc.proveedor || 'Sin proveedor'
      if (!map[k]) map[k] = { label: k, value: 0, count: 0 }
      map[k].value += oc.costoNeto
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [ocs])

  // ── Por tipo de costo ──
  const porTipoCosto = useMemo(() => {
    const map = {}
    ocs.forEach(oc => {
      const k = oc.tipoCosto || 'Sin tipo'
      if (!map[k]) map[k] = { label: k, value: 0, count: 0 }
      map[k].value += oc.costoNeto
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [ocs])

  // ── Por centro de costo ──
  const porCentro = useMemo(() => {
    const map = {}
    ocs.forEach(oc => {
      const k = oc.centroCosto || 'Sin centro'
      if (!map[k]) map[k] = { label: k, value: 0, count: 0 }
      map[k].value += oc.costoNeto
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [ocs])

  // ── Por unidad de negocio (costos) ──
  const porUnidad = useMemo(() => {
    const map = {}
    ocs.forEach(oc => {
      const k = oc.unidadNegocio
      if (!map[k]) map[k] = { label: k, value: 0, count: 0 }
      map[k].value += oc.costoNeto
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [ocs])

  // ── OCs pendientes de pago ──
  const ocsPendientes = useMemo(() =>
    ocs
      .filter(oc => oc.facturadoTotal > 0 && oc.pagadoTotal < oc.facturadoTotal)
      .map(oc => ({ ...oc, pendiente: oc.facturadoTotal - oc.pagadoTotal }))
      .sort((a, b) => b.pendiente - a.pendiente)
      .slice(0, 10),
  [ocs])

  // ── OCs sin factura ──
  const ocsSinFactura = useMemo(() =>
    ocs
      .filter(oc => (!oc.facturas || oc.facturas.length === 0) && oc.estado !== 'Cancelada')
      .sort((a, b) => b.costoNeto - a.costoNeto)
      .slice(0, 10),
  [ocs])

  const maxProveedor = Math.max(...porProveedor.map(p => p.value), 1)
  const maxTipo      = Math.max(...porTipoCosto.map(t => t.value), 1)
  const maxCentro    = Math.max(...porCentro.map(c => c.value), 1)
  const maxUnidad    = Math.max(...porUnidad.map(u => u.value), 1)
  const totalOCsCosto = ocs.reduce((s, o) => s + o.costoNeto, 0)

  return (
    <div className="space-y-4">

      {/* Live */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-pulse" />
          <span className="text-xs text-gray-400 font-medium">
            En vivo · {lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <span className="text-xs text-gray-400">{kpis.totalOCs} OCs activas</span>
      </div>

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Costo Total OCs" value={fmt(kpis.costoTotal)} icon={ShoppingCart} iconColor="text-orange-500"
          sub={`${kpis.totalOCs} órdenes activas`} />
        <KpiCard label="Facturado por Prov." value={fmt(kpis.facturadoTotal)} icon={FileText} iconColor="text-purple-500"
          sub="documentos recibidos" />
        <KpiCard label="Pagado a Proveedores" value={fmt(kpis.pagadoTotal)} icon={CheckCircle} iconColor="text-green-500" />
        <KpiCard label="Por Pagar" value={fmt(porPagar)} icon={Clock} iconColor="text-red-400"
          sub={porPagar > 0 ? 'pendiente a proveedores' : 'todo al día'} />
        <KpiCard label="Sin Factura" value={sinFactura} icon={AlertCircle} iconColor="text-amber-500"
          sub="OCs emitidas/recibidas" />
      </div>

      {/* Row 2 — Trend + Estado donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Monthly trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Tendencia de Costos OC — Últimos 12 meses</h3>
            <span className="text-xs text-orange-500 font-semibold">{fmt(totalOCsCosto)} total</span>
          </div>
          <MiniAreaChart data={monthlyData} color="#f97316" height={150} />
        </div>

        {/* Estado donut */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">OCs por Estado</h3>
          <div className="flex justify-center mb-3">
            <DonutChart data={porEstado} size={130} />
          </div>
          <div className="space-y-1.5">
            {porEstado.map((d, i) => (
              <Dot key={d.label} color={d.color} label={`${d.label} (${d.value})`} value={d.monto} />
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 — Top proveedores + Tipo de costo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top proveedores */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-700">Top Proveedores por Costo</h3>
          </div>
          <div className="space-y-2.5">
            {porProveedor.map((p, i) => (
              <HBar key={p.label} label={p.label} value={p.value} max={maxProveedor}
                color={PALETTE[i % PALETTE.length]} sub={`${p.count} OC`} />
            ))}
            {porProveedor.length === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
          </div>
        </div>

        {/* Tipo de costo */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={15} className="text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-700">Por Tipo de Costo</h3>
          </div>
          <div className="space-y-2.5">
            {porTipoCosto.map((t, i) => (
              <HBar key={t.label} label={t.label} value={t.value} max={maxTipo}
                color={PALETTE[(i + 3) % PALETTE.length]} sub={`${t.count} OC`} />
            ))}
            {porTipoCosto.length === 0 && <p className="text-sm text-gray-400">Sin tipos de costo registrados</p>}
          </div>
        </div>
      </div>

      {/* Row 4 — Centro de costo + Por UdN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Centro de costo */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={15} className="text-teal-500" />
            <h3 className="text-sm font-semibold text-gray-700">Por Centro de Costo</h3>
          </div>
          <div className="space-y-2.5">
            {porCentro.map((c, i) => (
              <HBar key={c.label} label={c.label} value={c.value} max={maxCentro}
                color={PALETTE[(i + 5) % PALETTE.length]} sub={`${c.count} OC`} />
            ))}
            {porCentro.length === 0 && <p className="text-sm text-gray-400">Sin centros de costo</p>}
          </div>
        </div>

        {/* Costos por UdN */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={15} className="text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-700">Costos por Unidad de Negocio</h3>
          </div>
          <div className="space-y-2.5">
            {porUnidad.map((u, i) => (
              <HBar key={u.label} label={u.label} value={u.value} max={maxUnidad}
                color="#f97316" sub={`${u.count} OC`} />
            ))}
            {porUnidad.length === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
          </div>
        </div>
      </div>

      {/* Row 5 — Tablas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* OCs pendientes de pago */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-red-400" />
              <h3 className="text-sm font-semibold text-gray-700">Por Pagar a Proveedores</h3>
            </div>
            {ocsPendientes.length > 0 && (
              <span className="text-xs bg-red-50 text-red-500 font-semibold px-2 py-0.5 rounded-full">
                {fmt(porPagar)}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {ocsPendientes.map(oc => (
              <div key={oc.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-700">OC #{oc.numero}</p>
                  <p className="text-[10px] text-gray-400 truncate">{oc.proveedor}</p>
                  <p className="text-[10px] text-gray-300">{oc.codigoProtocolo ? `Prot. ${oc.codigoProtocolo}` : 'Sin protocolo'}</p>
                </div>
                <div className="flex-shrink-0 ml-3 text-right">
                  <p className="text-xs font-bold text-red-500">{fmtFull(oc.pendiente)}</p>
                  <p className="text-[10px] text-gray-400">{fmtFull(oc.facturadoTotal)} facturado</p>
                </div>
              </div>
            ))}
            {ocsPendientes.length === 0 && (
              <div className="px-5 py-8 text-center">
                <CheckCircle size={24} className="mx-auto text-green-300 mb-2" />
                <p className="text-sm text-gray-400">Todo pagado</p>
              </div>
            )}
          </div>
        </div>

        {/* OCs sin factura */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-gray-700">OCs Sin Factura Recibida</h3>
            </div>
            {ocsSinFactura.length > 0 && (
              <span className="text-xs bg-amber-50 text-amber-500 font-semibold px-2 py-0.5 rounded-full">
                {ocsSinFactura.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {ocsSinFactura.map(oc => (
              <div key={oc.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-700">OC #{oc.numero}</p>
                  <p className="text-[10px] text-gray-400 truncate">{oc.proveedor}</p>
                  <p className="text-[10px] text-gray-300">{oc.fecha}</p>
                </div>
                <div className="flex-shrink-0 ml-3 text-right">
                  <p className="text-xs font-bold text-gray-700">{fmtFull(oc.costoNeto)}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ backgroundColor: (ESTADO_COLORS[oc.estado] || '#9ca3af') + '20', color: ESTADO_COLORS[oc.estado] || '#9ca3af' }}>
                    {oc.estado}
                  </span>
                </div>
              </div>
            ))}
            {ocsSinFactura.length === 0 && (
              <div className="px-5 py-8 text-center">
                <CheckCircle size={24} className="mx-auto text-green-300 mb-2" />
                <p className="text-sm text-gray-400">Todas las OCs tienen factura</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default CostosTab
