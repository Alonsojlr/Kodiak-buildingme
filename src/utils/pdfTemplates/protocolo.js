import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
  }).format(Number.isFinite(value) ? value : 0);
};

const safe = (v) => (v === null || v === undefined ? '' : String(v));
const clean = (v) =>
  safe(v)
    .replace(/[{}]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();

const getImageFormat = (dataUrl) => {
  if (typeof dataUrl !== 'string') return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  if (dataUrl.startsWith('data:image/jpeg')) return 'JPEG';
  return 'PNG';
};

const drawCell = (doc, x, y, w, h) => {
  doc.rect(x, y, w, h);
};

const drawLabelValue = (doc, label, value, x, y) => {
  doc.setFont('helvetica', 'bold');
  doc.text(label, x, y);
  const labelWidth = doc.getTextWidth(label);
  doc.setFont('helvetica', 'normal');
  doc.text(value, x + labelWidth + 1.5, y);
};

export const renderProtocoloPDF = async (protocolo, items = [], ordenesCompra = [], loadImageAsDataUrl) => {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'landscape',
    compress: true,
    putOnlyUsedFonts: true
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const TOTAL_W = W - M * 2;

  const GREEN_DARK = [63, 169, 151];
  const BORDER = [200, 200, 200];
  const TEXT_DARK = [40, 40, 40];

  const cliente = clean(protocolo.cliente || '');
  const rut = clean(protocolo.rutCliente || '');
  const ocCliente = clean(protocolo.ocCliente || 'Sin OC');
  const estado = clean(protocolo.estado || '');
  const fecha = clean(protocolo.fechaCreacion || protocolo.fecha || '');
  const numeroCot = clean(protocolo.numeroCotizacion || '');
  const tipo = clean(protocolo.tipo || '');
  const nombreProyecto = clean(protocolo.nombreProyecto || '');

  // =========================
  // Header grid
  // =========================
  const topX = M;
  const topY = 14;
  const topH = 30;
  const logoW = 55;
  const rightW = TOTAL_W - logoW;
  const colW = rightW / 3;
  const rowH = topH / 3;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  drawCell(doc, topX, topY, TOTAL_W, topH);
  drawCell(doc, topX, topY, logoW, topH);

  for (let i = 1; i < 3; i += 1) {
    const x = topX + logoW + colW * i;
    doc.line(x, topY, x, topY + topH);
  }
  for (let i = 1; i < 3; i += 1) {
    const y = topY + rowH * i;
    doc.line(topX + logoW, y, topX + TOTAL_W, y);
  }

  if (loadImageAsDataUrl) {
    try {
      const logoDataUrl = await loadImageAsDataUrl('/logo-building-me.png');
      doc.addImage(logoDataUrl, getImageFormat(logoDataUrl), topX + 6, topY + 7, 43, 16);
    } catch (error) {
      console.warn('No se pudo cargar el logo para el PDF:', error);
    }
  }

  doc.setFontSize(9);
  doc.setTextColor(...TEXT_DARK);

  const gridX = topX + logoW;
  const row1Y = topY + 8;
  const row2Y = topY + rowH + 8;
  const row3Y = topY + rowH * 2 + 8;

  drawLabelValue(doc, 'Cliente:', cliente, gridX + 4, row1Y);
  drawLabelValue(doc, 'OC Cliente:', ocCliente, gridX + colW + 4, row1Y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`PROTOCOLO  N° ${clean(protocolo.folio || '')}`, gridX + colW * 2 + colW / 2, row1Y, { align: 'center' });

  doc.setFontSize(9);
  drawLabelValue(doc, 'RUT:', rut, gridX + 4, row2Y);
  drawLabelValue(doc, 'Estado:', estado, gridX + colW + 4, row2Y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${fecha}`, gridX + colW * 2 + colW / 2, row2Y, { align: 'center' });

  drawLabelValue(doc, 'N° Cotización:', numeroCot, gridX + 4, row3Y);
  drawLabelValue(doc, 'Tipo:', tipo, gridX + colW + 4, row3Y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(nombreProyecto, gridX + colW * 2 + colW / 2, row3Y, { align: 'center' });
  doc.setFontSize(9);

  let y = topY + topH + 12;

  // =========================
  // Items table
  // =========================
  const itemsData = (items || []).map((item) => ([
    clean(item.item || ''),
    clean(item.descripcion || ''),
    `${item.cantidad || 0}`,
    ''
  ]));

  // =========================
  // OC vinculadas data
  // =========================
  const ocData = (ordenesCompra || []).map((oc) => {
    const neto = oc.subtotal || (oc.total ? oc.total / 1.19 : 0);
    const iva = oc.iva || (oc.total ? oc.total - neto : neto * 0.19);
    const total = oc.total || neto + iva;
    return [
      clean(oc.numero || ''),
      clean(oc.proveedor || ''),
      clean(oc.tipoCosto || ''),
      formatCurrency(neto),
      formatCurrency(iva),
      formatCurrency(total),
      clean(oc.numeroFactura || ''),
      clean(oc.estado || ''),
      ''
    ];
  });

  const calcRowHeight = (fontSize, padding) => {
    const textHeight = fontSize * 0.3528;
    return textHeight + padding * 2;
  };

  const itemsRowCount = itemsData.length ? itemsData.length : 1;
  const ocRowCount = ocData.length ? ocData.length : 1;
  const baseFont = 9;
  const basePadding = 2;
  const headerGap = 12;
  const headerHeight = calcRowHeight(baseFont, basePadding);
  const itemsHeight = headerHeight + itemsRowCount * calcRowHeight(baseFont, basePadding);
  const ocHeight = headerHeight + ocRowCount * calcRowHeight(baseFont, basePadding);
  const availableHeight = H - y - headerGap - 12;
  const neededHeight = itemsHeight + headerGap + ocHeight;
  const scale = neededHeight > 0 ? Math.min(1, (availableHeight / neededHeight) * 0.9) : 1;
  const tableFont = Math.max(1, baseFont * scale);
  const tablePadding = Math.max(0.1, basePadding * scale);
  const tableGap = Math.max(2, headerGap * scale);

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Descripción', 'Cantidad', 'Notas']],
    body: itemsData.length ? itemsData : [['', '', '', '']],
    theme: 'grid',
    margin: { left: M, right: M },
    tableWidth: TOTAL_W,
    headStyles: { fillColor: GREEN_DARK, textColor: [255, 255, 255] },
    styles: { fontSize: tableFont, cellPadding: tablePadding, overflow: 'ellipsize' },
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: TOTAL_W * 0.18 },
      1: { cellWidth: TOTAL_W * 0.44 },
      2: { cellWidth: TOTAL_W * 0.12 },
      3: { cellWidth: TOTAL_W * 0.26 }
    }
  });

  y = doc.lastAutoTable.finalY + tableGap;

  // =========================
  // OC vinculadas table
  // =========================
  autoTable(doc, {
    startY: y,
    head: [['N° OC', 'Proveedor', 'Tipo Costo', 'Neto', 'IVA', 'Total', 'Factura', 'Estado', 'Notas']],
    body: ocData.length ? ocData : [['', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    margin: { left: M, right: M },
    tableWidth: TOTAL_W,
    headStyles: { fillColor: GREEN_DARK, textColor: [255, 255, 255] },
    styles: { fontSize: tableFont, cellPadding: tablePadding, overflow: 'ellipsize' },
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: TOTAL_W * 0.1 },
      1: { cellWidth: TOTAL_W * 0.2 },
      2: { cellWidth: TOTAL_W * 0.14 },
      3: { cellWidth: TOTAL_W * 0.1 },
      4: { cellWidth: TOTAL_W * 0.1 },
      5: { cellWidth: TOTAL_W * 0.1 },
      6: { cellWidth: TOTAL_W * 0.08 },
      7: { cellWidth: TOTAL_W * 0.08 },
      8: { cellWidth: TOTAL_W * 0.1 }
    }
  });

  return doc;
};
