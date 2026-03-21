import { renderOCPDF } from './pdfTemplates/oc';
import { renderCotizacionPDF } from './pdfTemplates/cotizacion';
import { renderProtocoloPDF } from './pdfTemplates/protocolo';
import { fetchOptimizedImageDataUrl } from './pdfImage';

const loadImageAsDataUrl = async (url) => {
  try {
    return await fetchOptimizedImageDataUrl(url, {
      maxWidth: 520,
      maxHeight: 220,
      quality: 0.72,
      outputType: 'image/jpeg'
    });
  } catch {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};


// Función auxiliar para formatear moneda
const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0
  }).format(value);
};

const openPdfInNewTab = (doc, filename) => {
  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank');
    if (!newWindow) {
      doc.save(filename);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) {
    doc.save(filename);
  }
};

// Función para generar PDF de Cotización directamente
export const generarCotizacionPDF = async (cotizacion, cliente, items) => {
  const doc = await renderCotizacionPDF(cotizacion, cliente, items);
  openPdfInNewTab(doc, `Cotizacion-${cotizacion.numero || 'sin-numero'}.pdf`);
};

// Función para generar PDF de Orden de Compra directamente
export const generarOCPDF = async (ordenCompra, proveedor, protocolo, items) => {
  const doc = await renderOCPDF(ordenCompra, proveedor, protocolo, items);
  if (!doc || typeof doc.save !== 'function') {
    throw new Error('No se pudo generar el PDF de la OC');
  }
  openPdfInNewTab(doc, `OC-${ordenCompra.numero || 'sin-numero'}.pdf`);
};

export const generarProtocoloPDF = async (protocolo, items = [], ordenesCompra = []) => {
  const doc = await renderProtocoloPDF(protocolo, items, ordenesCompra, loadImageAsDataUrl);
  openPdfInNewTab(doc, `Protocolo-${protocolo.folio || 'sin-folio'}.pdf`);
};
