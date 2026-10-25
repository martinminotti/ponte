function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('img'));
    img.src = src;
  });
}

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('read'));
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(file);
  });
}

/** Logo → data URL PNG (o JPEG se troppo pesante), lato lungo max 320px. */
export async function readLogo(file: File): Promise<string> {
  const img = await loadImage(await readAsDataURL(file));
  if (!img.width || !img.height) throw new Error('size');
  let out = '';
  for (const size of [320, 200, 120]) {
    const sc = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * sc));
    const h = Math.max(1, Math.round(img.height * sc));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    out = c.toDataURL('image/png');
    if (out.length > 160_000) {
      const x = c.getContext('2d')!;
      x.globalCompositeOperation = 'destination-over';
      x.fillStyle = '#fff';
      x.fillRect(0, 0, w, h);
      out = c.toDataURL('image/jpeg', 0.88);
    }
    if (out.length <= 160_000) break;
  }
  if (out.length > 260_000) throw new Error('big');
  return out;
}

/** Foto dal telefono → JPEG ridimensionato (lato lungo 1600px). */
export async function compressPhoto(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc);
    const h = Math.round(img.naturalHeight * sc);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', 0.82));
    return { blob, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageSize(src: string): Promise<{ w: number; h: number }> {
  return loadImage(src).then((i) => ({ w: i.width, h: i.height }));
}
