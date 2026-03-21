const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

export const fetchOptimizedImageDataUrl = async (
  url,
  {
    maxWidth = 520,
    maxHeight = 220,
    quality = 0.72,
    outputType = 'image/jpeg'
  } = {}
) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo cargar imagen: ${url}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await loadImage(objectUrl);

    const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return blobToDataUrl(blob);
    }

    // Fondo blanco para evitar artefactos con transparencia al convertir a JPEG.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL(outputType, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
