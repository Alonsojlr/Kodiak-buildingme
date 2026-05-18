import React, { useState, useEffect, useMemo } from 'react'
import { getProtocolosFacturas } from '../../api/protocolos'
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, FileText, Users, Building2,
  Download, Filter, ChevronDown, ChevronUp, Package, ArrowUpDown,
  CheckCircle, Clock, RefreshCw, AlertCircle, LayoutDashboard
} from 'lucide-react'
import DashboardTab from './DashboardTab'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => {
  if (!n && n !== 0) return '$0'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

const fmtPct = (n) => (Number.isFinite(n) ? n.toFixed(1) + '%' : '0%')

const colorRent = (pct) => {
  if (pct >= 30) return 'text-green-700 bg-green-100'
  if (pct >= 15) return 'text-green-600 bg-green-50'
  if (pct >= 5)  return 'text-amber-600 bg-amber-50'
  if (pct >= 0)  return 'text-orange-600 bg-orange-50'
  return 'text-red-600 bg-red-50'
}

const exportCSV = (rows, filename) => {
  if (!rows.length) return
  const headers = Object.keys(rows[0]).join(',')
  const lines = rows.map(r =>
    Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const blob = new Blob(['﻿' + [headers, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const calcularCostoOCItems = (oc) =>
  (oc.items || []).reduce((s, item) => {
    const val  = item.valorUnitario ?? item.valor_unitario ?? 0
    const cant = item.cantidad || 0
    const desc = item.descuento || 0
    const sub  = cant * val
    return s + sub - sub * (desc / 100)
  }, 0)

// ── Sub-components ────────────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, icon: Icon, iconColor = 'text-teal-500' }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs text-gray-500 leading-tight">{label}</span>
      {Icon && <Icon size={16} className={iconColor} />}
    </div>
    <div className="text-lg font-bold text-gray-800 leading-tight">{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
  </div>
)

const SortTh = ({ field, label, sortField, sortDir, onSort, right = true }) => (
  <th className={`px-3 py-3 ${right ? 'text-right' : 'text-left'}`}>
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 hover:text-teal-600 transition-colors whitespace-nowrap mx-auto"
      style={right ? { marginLeft: 'auto', marginRight: 0 } : {}}
    >
      {label}
      <ArrowUpDown size={11} className={sortField === field ? 'text-teal-500' : 'text-gray-300'} />
    </button>
  </th>
)

const MiniBar = ({ value, max, color = '#45ad98' }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
      <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

// ── Tab: Resumen ──────────────────────────────────────────────────────────────

const TabResumen = ({ kpis, rentabilidadGlobal, porUnidad, metricas }) => {
  const top5 = useMemo(() =>
    [...metricas].sort((a, b) => b.margen - a.margen).slice(0, 5), [metricas])
  const bot5 = useMemo(() =>
    [...metricas].filter(m => m.ventaNeta > 0).sort((a, b) => a.rentabilidad - b.rentabilidad).slice(0, 5), [metricas])
  const maxVenta = Math.max(...porUnidad.map(u => u.ventaNeta), 1)
  const porCobrar = kpis.totalFacturado - kpis.totalCobrado

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Proyectos" value={kpis.proyectos} icon={FileText} />
        <KpiCard label="Venta Neta Total" value={fmt(kpis.ventaNeta)} icon={DollarSign} iconColor="text-teal-500" />
        <KpiCard label="Costo OC Total" value={fmt(kpis.costoOC)} icon={Package} iconColor="text-orange-500" />
        <KpiCard
          label="Margen Bruto"
          value={fmt(kpis.margen)}
          sub={fmtPct(rentabilidadGlobal) + ' rentabilidad'}
          icon={rentabilidadGlobal >= 0 ? TrendingUp : TrendingDown}
          iconColor={rentabilidadGlobal >= 0 ? 'text-green-500' : 'text-red-500'}
        />
        <KpiCard label="Total Facturado" value={fmt(kpis.totalFacturado)} sub="a clientes" icon={FileText} iconColor="text-blue-500" />
        <KpiCard label="Total Cobrado" value={fmt(kpis.totalCobrado)} icon={CheckCircle} iconColor="text-green-500" />
        <KpiCard label="Por Cobrar" value={fmt(porCobrar)} icon={Clock} iconColor="text-amber-500" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Venta por UdN */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Venta Neta por Unidad de Negocio</h3>
          {porUnidad.length === 0
            ? <p className="text-sm text-gray-400">Sin datos</p>
            : <div className="space-y-3">
                {porUnidad.map(u => (
                  <div key={u.unidadNegocio} className="space-y-1">
                    <MiniBar value={u.ventaNeta} max={maxVenta} />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-700 font-medium">{u.unidadNegocio}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-gray-400 text-[10px]">{u.proyectos} proy.</span>
                        <span className="font-semibold text-gray-700">{fmt(u.ventaNeta)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorRent(u.rentabilidad)}`}>
                          {fmtPct(u.rentabilidad)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Top / bottom proyectos */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Mejor Margen</h3>
              <div className="space-y-2">
                {top5.map((m, i) => (
                  <div key={m.id} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-gray-700 truncate">{m.nombreProyecto || `F-${m.folio}`}</p>
                      <p className="text-[10px] text-gray-400 truncate">{m.cliente}</p>
                      <p className="text-[11px] font-semibold text-green-600">{fmt(m.margen)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Menor Rentabilidad</h3>
              <div className="space-y-2">
                {bot5.map((m, i) => (
                  <div key={m.id} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-gray-700 truncate">{m.nombreProyecto || `F-${m.folio}`}</p>
                      <p className="text-[10px] text-gray-400 truncate">{m.cliente}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colorRent(m.rentabilidad)}`}>{fmtPct(m.rentabilidad)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ingreso vs Cobrado vs Costo */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Flujo Financiero Global</h3>
        <div className="space-y-4">
          {[
            { label: 'Venta Neta (presupuesto)', value: kpis.ventaNeta, color: '#45ad98', max: kpis.ventaNeta },
            { label: 'Facturado a clientes', value: kpis.totalFacturado, color: '#3b82f6', max: kpis.ventaNeta },
            { label: 'Cobrado de clientes', value: kpis.totalCobrado, color: '#22c55e', max: kpis.ventaNeta },
            { label: 'Costo OC (presupuesto)', value: kpis.costoOC, color: '#f97316', max: kpis.ventaNeta },
            { label: 'Costo OC facturado (real)', value: kpis.costoFacturadoOC, color: '#ef4444', max: kpis.ventaNeta },
          ].map(row => (
            <div key={row.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600">{row.label}</span>
                <span className="font-semibold text-gray-700">{fmt(row.value)}</span>
              </div>
              <MiniBar value={row.value} max={row.max || 1} color={row.color} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Por Proyecto ─────────────────────────────────────────────────────────

const TabProyectos = ({ metricas, sortField, sortDir, onSort, onExport }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <span className="text-sm font-semibold text-gray-700">{metricas.length} proyectos</span>
      <button
        onClick={onExport}
        className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors"
      >
        <Download size={13} /> Exportar CSV
      </button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wide">
          <tr>
            <th className="px-3 py-3 text-left">Folio</th>
            <th className="px-3 py-3 text-left">Proyecto / Cliente</th>
            <th className="px-3 py-3 text-left">UdN</th>
            <th className="px-3 py-3 text-left">Estado</th>
            <SortTh field="ventaNeta"       label="Venta Neta"   sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <SortTh field="costoOC"         label="Costo OC"     sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <SortTh field="margen"          label="Margen"       sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <SortTh field="rentabilidad"    label="Rent.%"       sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <SortTh field="totalFacturado"  label="Facturado"    sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <SortTh field="totalCobrado"    label="Cobrado"      sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <SortTh field="porCobrar"       label="Por Cobrar"   sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <th className="px-3 py-3 text-center">OCs</th>
            <th className="px-3 py-3 text-center">Facts.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {metricas.map(m => (
            <tr key={m.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-3 py-2.5 font-mono text-gray-400 text-[11px]">{m.folio}</td>
              <td className="px-3 py-2.5">
                <p className="font-medium text-gray-700 truncate max-w-[180px]">{m.nombreProyecto || '—'}</p>
                <p className="text-gray-400 truncate max-w-[180px] text-[10px]">{m.cliente}</p>
              </td>
              <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{m.unidadNegocio}</td>
              <td className="px-3 py-2.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">{m.estado}</span>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-gray-700">{fmt(m.ventaNeta)}</td>
              <td className="px-3 py-2.5 text-right text-orange-600">{m.costoOC > 0 ? fmt(m.costoOC) : <span className="text-gray-300">—</span>}</td>
              <td className={`px-3 py-2.5 text-right font-semibold ${m.margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(m.margen)}
              </td>
              <td className="px-3 py-2.5 text-right">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorRent(m.rentabilidad)}`}>
                  {fmtPct(m.rentabilidad)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-blue-600">{m.totalFacturado > 0 ? fmt(m.totalFacturado) : <span className="text-gray-300">—</span>}</td>
              <td className="px-3 py-2.5 text-right text-green-600">{m.totalCobrado > 0 ? fmt(m.totalCobrado) : <span className="text-gray-300">—</span>}</td>
              <td className="px-3 py-2.5 text-right text-amber-600">{m.porCobrar > 0 ? fmt(m.porCobrar) : <span className="text-gray-300">—</span>}</td>
              <td className="px-3 py-2.5 text-center text-gray-500">{m.numOCs || '—'}</td>
              <td className="px-3 py-2.5 text-center text-gray-500">{m.numFacturasBM || '—'}</td>
            </tr>
          ))}
          {metricas.length === 0 && (
            <tr><td colSpan={13} className="px-3 py-10 text-center text-gray-400">Sin proyectos en el período seleccionado</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
)

// ── Tab: Agrupado (UdN / Cliente) ─────────────────────────────────────────────

const TabAgrupado = ({ rows, groupKey, title, onExport }) => {
  const maxVenta = Math.max(...rows.map(r => r.ventaNeta), 1)
  const totals = rows.reduce((acc, r) => ({
    proyectos:      acc.proyectos      + r.proyectos,
    ventaNeta:      acc.ventaNeta      + r.ventaNeta,
    costoOC:        acc.costoOC        + r.costoOC,
    margen:         acc.margen         + r.margen,
    totalFacturado: acc.totalFacturado + r.totalFacturado,
    totalCobrado:   acc.totalCobrado   + r.totalCobrado,
  }), { proyectos: 0, ventaNeta: 0, costoOC: 0, margen: 0, totalFacturado: 0, totalCobrado: 0 })
  const totalRent = totals.ventaNeta > 0 ? (totals.margen / totals.ventaNeta) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Bar chart visual */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Venta Neta por {title}</h3>
        {rows.length === 0
          ? <p className="text-sm text-gray-400">Sin datos</p>
          : <div className="space-y-4">
              {rows.map(r => (
                <div key={r[groupKey]}>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-gray-700 font-medium truncate max-w-[40%]">{r[groupKey]}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-gray-400 text-[10px]">{r.proyectos} proy.</span>
                      <span className="font-semibold text-gray-700">{fmt(r.ventaNeta)}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colorRent(r.rentabilidad)}`}>{fmtPct(r.rentabilidad)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {/* venta */}
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="h-3" style={{ width: `${(r.ventaNeta / maxVenta) * 100}%`, backgroundColor: '#45ad98' }} />
                    </div>
                    {/* costo */}
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="h-3" style={{ width: `${(r.costoOC / maxVenta) * 100}%`, backgroundColor: '#f97316' }} />
                    </div>
                  </div>
                  <div className="flex gap-4 text-[10px] text-gray-400 mt-0.5">
                    <span>Venta</span><span>Costo OC</span>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex justify-end px-4 py-3 border-b border-gray-100">
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors"
          >
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">{title}</th>
                <th className="px-3 py-3 text-center">Proy.</th>
                <th className="px-3 py-3 text-right">Venta Neta</th>
                <th className="px-3 py-3 text-right">Costo OC</th>
                <th className="px-3 py-3 text-right">Margen</th>
                <th className="px-3 py-3 text-right">Rent.%</th>
                <th className="px-3 py-3 text-right">Facturado</th>
                <th className="px-3 py-3 text-right">Cobrado</th>
                <th className="px-3 py-3 text-right">Por Cobrar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r[groupKey]} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-700">{r[groupKey]}</td>
                  <td className="px-3 py-3 text-center text-gray-500">{r.proyectos}</td>
                  <td className="px-3 py-3 text-right font-semibold text-gray-700">{fmt(r.ventaNeta)}</td>
                  <td className="px-3 py-3 text-right text-orange-600">{r.costoOC > 0 ? fmt(r.costoOC) : '—'}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${r.margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(r.margen)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colorRent(r.rentabilidad)}`}>{fmtPct(r.rentabilidad)}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-blue-600">{r.totalFacturado > 0 ? fmt(r.totalFacturado) : '—'}</td>
                  <td className="px-3 py-3 text-right text-green-600">{r.totalCobrado > 0 ? fmt(r.totalCobrado) : '—'}</td>
                  <td className="px-3 py-3 text-right text-amber-600">{(r.totalFacturado - r.totalCobrado) > 0 ? fmt(r.totalFacturado - r.totalCobrado) : '—'}</td>
                </tr>
              ))}
              {rows.length > 1 && (
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200 text-xs">
                  <td className="px-4 py-3 text-gray-700 uppercase text-[10px] tracking-wide">Total</td>
                  <td className="px-3 py-3 text-center text-gray-700">{totals.proyectos}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{fmt(totals.ventaNeta)}</td>
                  <td className="px-3 py-3 text-right text-orange-700">{fmt(totals.costoOC)}</td>
                  <td className={`px-3 py-3 text-right ${totals.margen >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(totals.margen)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${colorRent(totalRent)}`}>{fmtPct(totalRent)}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-blue-700">{fmt(totals.totalFacturado)}</td>
                  <td className="px-3 py-3 text-right text-green-700">{fmt(totals.totalCobrado)}</td>
                  <td className="px-3 py-3 text-right text-amber-700">{fmt(totals.totalFacturado - totals.totalCobrado)}</td>
                </tr>
              )}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-gray-400">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main Module ───────────────────────────────────────────────────────────────

export const ReportesModule = ({
  activeModule,
  sharedProtocolos   = [],
  sharedOrdenesCompra = [],
  sharedCotizaciones  = [],
  sharedClientes      = [],
}) => {
  if (activeModule !== 'informes') return null

  const [activeTab,          setActiveTab]          = useState('dashboard')
  const [protocolosFacturas, setProtocolosFacturas] = useState([])
  const [loading,            setLoading]            = useState(true)
  const [showFilters,        setShowFilters]        = useState(true)
  const [sortField,          setSortField]          = useState('ventaNeta')
  const [sortDir,            setSortDir]            = useState('desc')

  // ── Filters ──
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroUnidad,     setFiltroUnidad]     = useState('todas')
  const [filtroCliente,    setFiltroCliente]    = useState('todos')
  const [filtroEstado,     setFiltroEstado]     = useState('todos')

  // Load all protocolos_facturas once
  useEffect(() => {
    const load = async () => {
      try {
        const ids = sharedProtocolos.map(p => p.id).filter(Boolean)
        const data = ids.length > 0 ? await getProtocolosFacturas(ids) : []
        setProtocolosFacturas(data || [])
      } catch (e) {
        console.error('Error cargando facturas:', e)
      } finally {
        setLoading(false)
      }
    }
    if (sharedProtocolos.length > 0) load()
    else setLoading(false)
  }, [sharedProtocolos])

  // ── Filter options ──
  const unidades = useMemo(() => {
    const s = new Set(sharedProtocolos.map(p => p.unidadNegocio).filter(Boolean))
    return ['todas', ...Array.from(s).sort()]
  }, [sharedProtocolos])

  const clientesOpts = useMemo(() => {
    const nombres = Array.from(new Set(sharedProtocolos.map(p => p.cliente).filter(c => c && c !== 'Sin cliente'))).sort((a, b) => a.localeCompare(b))
    return [
      { id: 'todos', nombre: 'Todos los clientes' },
      ...nombres.map(nombre => ({ id: nombre, nombre }))
    ]
  }, [sharedProtocolos])

  const estadosOpts = useMemo(() => {
    const s = new Set(sharedProtocolos.map(p => p.estado).filter(Boolean))
    return ['todos', ...Array.from(s).sort()]
  }, [sharedProtocolos])

  // ── Filtered protocolos ──
  const protocolosFiltrados = useMemo(() =>
    sharedProtocolos.filter(p => {
      if (filtroUnidad  !== 'todas' && p.unidadNegocio !== filtroUnidad) return false
      if (filtroCliente !== 'todos' && p.cliente !== filtroCliente) return false
      if (filtroEstado  !== 'todos' && p.estado !== filtroEstado) return false
      if (filtroFechaDesde && p.fechaCreacion && p.fechaCreacion < filtroFechaDesde) return false
      if (filtroFechaHasta && p.fechaCreacion && p.fechaCreacion > filtroFechaHasta) return false
      return true
    }),
  [sharedProtocolos, filtroUnidad, filtroCliente, filtroEstado, filtroFechaDesde, filtroFechaHasta])

  // ── Per-project metrics ──
  const metricas = useMemo(() =>
    protocolosFiltrados.map(p => {
      const ocVinculadas      = sharedOrdenesCompra.filter(oc => String(oc.codigoProtocolo) === String(p.folio))
      const costoOC           = ocVinculadas.reduce((s, oc) => s + calcularCostoOCItems(oc), 0)
      const costoFacturadoOC  = ocVinculadas.reduce((s, oc) => s + (oc.facturas || []).reduce((a, f) => a + (parseFloat(f.monto) || 0), 0), 0)
      const costoPagadoOC     = ocVinculadas.reduce((s, oc) => s + (oc.facturas || []).filter(f => f.estadoPago === 'Pagada').reduce((a, f) => a + (parseFloat(f.monto) || 0), 0), 0)

      const facturasBM   = protocolosFacturas.filter(f => f.protocolo_id === p.id)
      const totalFacturado = facturasBM.reduce((s, f) => s + (parseFloat(f.monto) || 0), 0)
      const totalCobrado   = facturasBM.filter(f => f.estado_pago === 'Pagada').reduce((s, f) => s + (parseFloat(f.monto) || 0), 0)

      const ventaNeta    = p.montoNeto || 0
      const margen       = ventaNeta - costoOC
      const rentabilidad = ventaNeta > 0 ? (margen / ventaNeta) * 100 : 0

      return {
        id:              p.id,
        folio:           p.folio,
        nombreProyecto:  p.nombreProyecto || '',
        cliente:         p.cliente || 'Sin cliente',
        clienteId:       p.clienteId,
        unidadNegocio:   p.unidadNegocio || 'Sin clasificar',
        estado:          p.estado || '',
        fechaCreacion:   p.fechaCreacion || '',
        ventaNeta,
        costoOC,
        costoFacturadoOC,
        costoPagadoOC,
        totalFacturado,
        totalCobrado,
        porCobrar:       totalFacturado - totalCobrado,
        margen,
        rentabilidad,
        numOCs:          ocVinculadas.length,
        numFacturasBM:   facturasBM.length,
      }
    }),
  [protocolosFiltrados, sharedOrdenesCompra, protocolosFacturas])

  // ── Aggregations ──
  const kpis = useMemo(() =>
    metricas.reduce((acc, m) => ({
      proyectos:       acc.proyectos       + 1,
      ventaNeta:       acc.ventaNeta       + m.ventaNeta,
      costoOC:         acc.costoOC         + m.costoOC,
      costoFacturadoOC:acc.costoFacturadoOC + m.costoFacturadoOC,
      margen:          acc.margen          + m.margen,
      totalFacturado:  acc.totalFacturado  + m.totalFacturado,
      totalCobrado:    acc.totalCobrado    + m.totalCobrado,
    }), { proyectos: 0, ventaNeta: 0, costoOC: 0, costoFacturadoOC: 0, margen: 0, totalFacturado: 0, totalCobrado: 0 }),
  [metricas])

  const rentabilidadGlobal = kpis.ventaNeta > 0 ? (kpis.margen / kpis.ventaNeta) * 100 : 0

  const agrupar = (key) =>
    Object.values(
      metricas.reduce((map, m) => {
        const k = m[key] || 'Sin clasificar'
        if (!map[k]) map[k] = { [key]: k, proyectos: 0, ventaNeta: 0, costoOC: 0, margen: 0, totalFacturado: 0, totalCobrado: 0 }
        map[k].proyectos      += 1
        map[k].ventaNeta      += m.ventaNeta
        map[k].costoOC        += m.costoOC
        map[k].margen         += m.margen
        map[k].totalFacturado += m.totalFacturado
        map[k].totalCobrado   += m.totalCobrado
        return map
      }, {})
    )
    .map(r => ({ ...r, rentabilidad: r.ventaNeta > 0 ? (r.margen / r.ventaNeta) * 100 : 0 }))
    .sort((a, b) => b.ventaNeta - a.ventaNeta)

  const porUnidad  = useMemo(() => agrupar('unidadNegocio'), [metricas])
  const porCliente = useMemo(() => agrupar('cliente'),       [metricas])

  // ── Sorted table ──
  const metricasSorted = useMemo(() =>
    [...metricas].sort((a, b) => {
      const va = a[sortField] ?? 0
      const vb = b[sortField] ?? 0
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    }),
  [metricas, sortField, sortDir])

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const hayFiltros = filtroFechaDesde || filtroFechaHasta || filtroUnidad !== 'todas' || filtroCliente !== 'todos' || filtroEstado !== 'todos'

  const resetFiltros = () => {
    setFiltroFechaDesde(''); setFiltroFechaHasta('')
    setFiltroUnidad('todas'); setFiltroCliente('todos'); setFiltroEstado('todos')
  }

  // ── CSV exports ──
  const exportProyectos = () => exportCSV(
    metricasSorted.map(m => ({
      Folio: m.folio, Proyecto: m.nombreProyecto, Cliente: m.cliente,
      'Unidad de Negocio': m.unidadNegocio, Estado: m.estado, 'Fecha Creación': m.fechaCreacion,
      'Venta Neta': Math.round(m.ventaNeta), 'Costo OC': Math.round(m.costoOC),
      'Margen': Math.round(m.margen), 'Rentabilidad %': m.rentabilidad.toFixed(1),
      'Facturado': Math.round(m.totalFacturado), 'Cobrado': Math.round(m.totalCobrado),
      'Por Cobrar': Math.round(m.porCobrar), '# OCs': m.numOCs,
    })),
    `proyectos-${new Date().toISOString().slice(0,10)}.csv`
  )

  const exportAgrupado = (rows, key, nombre) => exportCSV(
    rows.map(r => ({
      [nombre]: r[key], Proyectos: r.proyectos,
      'Venta Neta': Math.round(r.ventaNeta), 'Costo OC': Math.round(r.costoOC),
      'Margen': Math.round(r.margen), 'Rentabilidad %': r.rentabilidad.toFixed(1),
      'Facturado': Math.round(r.totalFacturado), 'Cobrado': Math.round(r.totalCobrado),
      'Por Cobrar': Math.round(r.totalFacturado - r.totalCobrado),
    })),
    `por-${nombre.toLowerCase().replace(/\s/g, '-')}-${new Date().toISOString().slice(0,10)}.csv`
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="animate-spin text-teal-600 mr-2" size={20} />
      <span className="text-gray-500">Cargando reportes…</span>
    </div>
  )

  const tabs = [
    { id: 'dashboard', label: 'Dashboard',        icon: LayoutDashboard },
    { id: 'resumen',   label: 'Resumen',         icon: BarChart3  },
    { id: 'proyectos', label: 'Por Proyecto',     icon: FileText   },
    { id: 'unidad',    label: 'Por Unidad',       icon: Building2  },
    { id: 'clientes',  label: 'Por Cliente',      icon: Users      },
  ]

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Reportes y Análisis</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {metricas.length} proyectos en el período seleccionado
          {hayFiltros && <span className="ml-2 text-teal-600">· Filtros activos</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          onClick={() => setShowFilters(f => !f)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter size={15} />
            Filtros
            {hayFiltros && <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full">Activos</span>}
          </div>
          {showFilters ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </button>
        {showFilters && (
          <div className="px-4 pb-4 border-t border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha desde</label>
                <input type="date" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fecha hasta</label>
                <input type="date" value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unidad de negocio</label>
                <select value={filtroUnidad} onChange={e => setFiltroUnidad(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {unidades.map(u => <option key={u} value={u}>{u === 'todas' ? 'Todas' : u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cliente</label>
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {clientesOpts.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Estado protocolo</label>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                  {estadosOpts.map(e => <option key={e} value={e}>{e === 'todos' ? 'Todos' : e}</option>)}
                </select>
              </div>
            </div>
            {hayFiltros && (
              <button onClick={resetFiltros} className="mt-3 text-xs text-teal-600 hover:text-teal-700 underline">
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'dashboard' && (
        <DashboardTab
          metricas={metricas}
          kpis={kpis}
          porUnidad={porUnidad}
          porCliente={porCliente}
          sharedCotizaciones={sharedCotizaciones}
          sharedOrdenesCompra={sharedOrdenesCompra}
          sharedProtocolos={sharedProtocolos}
          protocolosFacturas={protocolosFacturas}
        />
      )}
      {activeTab === 'resumen'   && <TabResumen kpis={kpis} rentabilidadGlobal={rentabilidadGlobal} porUnidad={porUnidad} metricas={metricas} />}
      {activeTab === 'proyectos' && <TabProyectos metricas={metricasSorted} sortField={sortField} sortDir={sortDir} onSort={toggleSort} onExport={exportProyectos} />}
      {activeTab === 'unidad'    && <TabAgrupado rows={porUnidad}  groupKey="unidadNegocio" title="Unidad de Negocio" onExport={() => exportAgrupado(porUnidad,  'unidadNegocio', 'Unidad de Negocio')} />}
      {activeTab === 'clientes'  && <TabAgrupado rows={porCliente} groupKey="cliente"       title="Cliente"          onExport={() => exportAgrupado(porCliente, 'cliente',       'Cliente')}          />}
    </div>
  )
}
