// Foto clientseitig verkleinern und als JPEG neu kodieren (entfernt EXIF inkl. GPS-Daten der Kamera).
import { FOTO_QUALITAET, zielMasse } from './logik.ts';

type Quelle = { bild: CanvasImageSource; breite: number; hoehe: number; frei: () => void };

async function dekodiere(datei: Blob): Promise<Quelle> {
  try {
    // 'from-image': EXIF-Ausrichtung anwenden, sonst stehen Hochkant-Fotos quer
    const b = await createImageBitmap(datei, { imageOrientation: 'from-image' });
    return { bild: b, breite: b.width, hoehe: b.height, frei: () => b.close() };
  } catch {
    // Fallback (z.B. HEIC in Safari): <img> dekodiert, was der Browser anzeigen kann
    const url = URL.createObjectURL(datei);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { bild: img, breite: img.naturalWidth, hoehe: img.naturalHeight, frei: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function verkleinere(datei: Blob): Promise<Blob> {
  const q = await dekodiere(datei);
  try {
    const { breite, hoehe } = zielMasse(q.breite, q.hoehe);
    const canvas = document.createElement('canvas');
    canvas.width = breite;
    canvas.height = hoehe;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar');
    ctx.fillStyle = '#fff'; // transparente PNG nicht schwarz werden lassen
    ctx.fillRect(0, 0, breite, hoehe);
    ctx.drawImage(q.bild, 0, 0, breite, hoehe);
    return await new Promise<Blob>((ok, fehler) =>
      canvas.toBlob((b) => (b ? ok(b) : fehler(new Error('JPEG-Kodierung fehlgeschlagen'))), 'image/jpeg', FOTO_QUALITAET),
    );
  } finally {
    q.frei();
  }
}
