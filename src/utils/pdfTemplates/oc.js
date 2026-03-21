import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchOptimizedImageDataUrl } from "../pdfImage";

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const safe = (v) => (v === null || v === undefined ? "" : String(v));
const clean = (v) => safe(v).replace(/[{}]/g, "").trim();

const hexToRgb = (hex) => {
  const h = hex.replace("#", "").trim();
  const bigint = parseInt(h, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

/**
 * OC A4 - 1 página - look idéntico a tu plantilla
 */
export const renderOCPDF = async (ordenCompra, proveedor, protocolo, items) => {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;

  // 🎨 Colores (tu verde exacto)
  const GREEN = hexToRgb("#3FA997");
  const GRAY_TEXT = [155, 155, 155];
  const BORDER_GRAY = [190, 190, 190];
  const RED = [220, 60, 60];
  const DARK = [90, 90, 90];

  // Datos (mantengo tu lógica)
  const razonSocial = clean(proveedor?.razon_social || ordenCompra?.proveedor || "Sin proveedor");
  const rut = clean(proveedor?.rut || ordenCompra?.rutProveedor || "");
  const direccion = clean(proveedor?.direccion || ordenCompra?.direccionProveedor || "");
  const contacto = clean(proveedor?.contacto || ordenCompra?.contactoProveedor || "");
  const codigoProtocolo = clean(protocolo?.folio || ordenCompra?.codigo_protocolo || "");
  const formaPago = clean(ordenCompra?.forma_pago || ordenCompra?.formaPago || "");
  const responsable = clean(ordenCompra?.responsable_compra || ordenCompra?.responsableCompra || "");
  const fecha = clean(ordenCompra?.fecha || "");

  // =========================
  // Logo + datos empresa (izq)
  // =========================
  try {
    const logoDataUrl = await fetchOptimizedImageDataUrl("/logo-building-me.png", {
      maxWidth: 520,
      maxHeight: 220,
      quality: 0.72,
      outputType: "image/jpeg"
    });
    doc.addImage(logoDataUrl, "JPEG", M, 12, 56, 18);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(...GREEN);
    doc.text("Building Me", M, 24);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_TEXT);

  const leftInfoY = 35;
  doc.text("76.226.767-5", M, leftInfoY);
  doc.text("Marketing Maria Paula Ross EIRL", M, leftInfoY + 4);
  doc.text("La Capitania 80, Las Condes", M, leftInfoY + 8);
  doc.text("Santiago, Chile", M, leftInfoY + 12);
  doc.text("info@buildingme.cl", M, leftInfoY + 16);

  // =========================
  // Caja roja (der) “ORDEN DE COMPRA {NUMERO}”
  // =========================
  const boxW = 86;
  const boxH = 28;
  const boxX = W - M - boxW;
  const boxY = 12;

  doc.setDrawColor(...RED);
  doc.setLineWidth(1.2);
  doc.rect(boxX, boxY, boxW, boxH);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RED);
  doc.setFontSize(18);
  doc.text("ORDEN DE COMPRA", boxX + boxW / 2, boxY + 12, { align: "center" });

  doc.setFontSize(18);
  doc.text(clean(ordenCompra?.numero || "NUMERO"), boxX + boxW / 2, boxY + 22, {
    align: "center",
  });

  // =========================
  // Caja gris “Facturar a”
  // =========================
  const factW = boxW;
  const factH = 14;
  const factX = boxX;
  const factY = boxY + boxH + 6;

  doc.setDrawColor(...BORDER_GRAY);
  doc.setLineWidth(0.6);
  doc.rect(factX, factY, factW, factH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  doc.text("Facturar a:", factX + 8, factY + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  doc.text("Marketing Maria Paula Ross EIRL", factX + 34, factY + 7);
  doc.text("76.226.767-5", factX + 34, factY + 11);

  // =========================
  // Info 2 columnas (igual maqueta)
  // =========================
  const colL = M;
  const colR = W / 2 + 10;
  let y = 75;

  const drawKV = (x, y, label, value) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK);
    doc.text(label, x, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text(value, x + 32, y);
  };

  // Izq
  drawKV(colL, y, "Razón Social:", razonSocial); y += 6;
  drawKV(colL, y, "Rut:", rut); y += 6;
  drawKV(colL, y, "Dirección:", direccion); y += 6;
  drawKV(colL, y, "Contacto:", contacto);

  // Der
  let yR = 75;
  drawKV(colR, yR, "Código PT:", codigoProtocolo); yR += 6;
  drawKV(colR, yR, "Forma de Pago:", formaPago); yR += 6;
  drawKV(colR, yR, "Comprador:", responsable); yR += 6;
  drawKV(colR, yR, "Fecha OC:", fecha);

  // =========================
  // Párrafo gris itálico
  // =========================
  const paragraphY = 103;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_TEXT);

  const paragraph =
    "Señor proveedor, remitimos a usted este documento, correspondiente a la adquisición de los productos y/o servicios detallados en el presente documento, conforme a las condiciones previamente acordadas entre ambas partes, solo se aceptarán facturas que contengan el Código PT indicado en la sección de información para la recepción de Factura.";

  doc.text(doc.splitTextToSize(paragraph, W - 2 * M), M, paragraphY);

  // =========================
  // Tabla (header con #3FA997, igual maqueta)
  // =========================
  const tableData = (items || []).length
    ? (items || []).map((item) => {
        const cantidad = parseFloat(item.cantidad) || 0;
        const valorUnitario = parseFloat(item.valor_unitario || item.valorUnitario) || 0;
        const descuento = parseFloat(item.descuento) || 0;
        const totalItem = cantidad * valorUnitario * (1 - descuento / 100);
        return [
          cantidad,
          safe(item.descripcion || ""),
          formatCurrency(valorUnitario),
          `${descuento}%`,
          formatCurrency(totalItem),
        ];
      })
    : [["", "", "", "", ""]];

  autoTable(doc, {
    startY: 118,
    head: [["Cant.", "Descripción", "Valor Unit", "Descuento", "Subtotal"]],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2.2 },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 80 },
      2: { cellWidth: 26, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  // =========================
  // Totales + Observaciones
  // =========================
  const subtotal = (items || []).reduce((sum, item) => {
    const cantidad = parseFloat(item.cantidad) || 0;
    const valorUnitario = parseFloat(item.valor_unitario || item.valorUnitario) || 0;
    const descuento = parseFloat(item.descuento) || 0;
    return sum + cantidad * valorUnitario * (1 - descuento / 100);
  }, 0);
  const iva = subtotal * 0.19;
  const total = subtotal + iva;

  let afterTableY = doc.lastAutoTable.finalY + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(120, 120, 120);
  doc.text("Observaciones:", M, afterTableY);

  const totalsX = W - M - 70;
  const totalsY = afterTableY - 4;

  autoTable(doc, {
    startY: totalsY,
    margin: { left: totalsX },
    tableWidth: 70,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    body: [
      ["Neto", formatCurrency(subtotal)],
      ["IVA", formatCurrency(iva)],
      ["Total", formatCurrency(total)],
    ],
    columnStyles: {
      0: { cellWidth: 25, fontStyle: "bold", textColor: GREEN },
      1: { cellWidth: 45, halign: "right" },
    },
  });

  // =========================
  // Términos y Condiciones (forzado abajo)
  // =========================
  // Como será 1 página, los “términos” los dejamos anclados cerca del final.
  // Ajusta 250–258 si quieres más aire.
  const termsTitleY = 258;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text("Terminos y Condiciones", M, termsTitleY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...GRAY_TEXT);

  const terms = [
    "1.- Al recibir la orden de compra (OC), el proveedor acepta todos sus términos, entre otros el respetar los precios, fechas y forma de pago indicadas en ella. Esta OC solo es válida si el proveedor cumple con la entrega en forma oportuna, en el lugar indicado y con la especificación solicitada. La(s) Guías de Despacho deberán ser entregadas con sus respectivas copias al momento de la recepción conforme por parte de Marketing Maria Paula Ross EIRL.",
    "2.- Las facturas electrónicas deben ser emitidas con referencia explícita al N° de OC, N° Código PT y Guía de despacho respectiva.",
  ];

  doc.text(doc.splitTextToSize(terms.join("\n"), W - 2 * M), M, termsTitleY + 8);

  return doc;
};
