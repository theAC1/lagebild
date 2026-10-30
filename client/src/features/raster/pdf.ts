// Minimales PDF: je Seite ein JPEG, seitenfüllend (DCTDecode, keine Schriften). Reicht für den Rasterausdruck,
// weil Raster, Köpfe und Titel schon ins Bild gezeichnet sind. Tests: druck.test.ts.

export type PdfSeite = { jpeg: Uint8Array; pxW: number; pxH: number };

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
/** Text als PDF-String in UTF-16BE (Umlaute im Titel). */
const pdfText = (s: string): string => `<FEFF${s.split('').map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}>`;

/** PDF mit einer Seite je Bild, Seitengrösse w × h Punkt. */
export function pdfAusJpegs(seiten: PdfSeite[], w: number, h: number, titel: string): Uint8Array {
  const teile: Uint8Array[] = [];
  const offsets: number[] = [];
  let laenge = 0;
  const schreibe = (t: Uint8Array | string) => {
    const b = typeof t === 'string' ? ascii(t) : t;
    teile.push(b);
    laenge += b.length;
  };
  const objekt = (nr: number, ...inhalt: (Uint8Array | string)[]) => {
    offsets[nr] = laenge;
    schreibe(`${nr} 0 obj\n`);
    for (const t of inhalt) schreibe(t);
    schreibe('\nendobj\n');
  };

  // 1 Katalog, 2 Seitenbaum, 3 Info, dann je Seite: Seite, Inhalt, Bild
  const seitenNr = seiten.map((_, i) => 4 + 3 * i);
  schreibe('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  objekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objekt(2, `<< /Type /Pages /Kids [${seitenNr.map((n) => `${n} 0 R`).join(' ')}] /Count ${seiten.length} >>`);
  objekt(3, `<< /Title ${pdfText(titel)} /Producer (Lagebild) >>`);
  seiten.forEach((s, i) => {
    const n = seitenNr[i];
    const inhalt = `q ${w} 0 0 ${h} 0 0 cm /Bild Do Q`;
    objekt(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Bild ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    objekt(n + 1, `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`);
    objekt(n + 2, `<< /Type /XObject /Subtype /Image /Width ${s.pxW} /Height ${s.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${s.jpeg.length} >>\nstream\n`, s.jpeg, '\nendstream');
  });

  const xref = laenge;
  const anzahl = offsets.length;
  schreibe(`xref\n0 ${anzahl}\n0000000000 65535 f \n`);
  for (let i = 1; i < anzahl; i++) schreibe(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  schreibe(`trailer\n<< /Size ${anzahl} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const aus = new Uint8Array(laenge);
  let pos = 0;
  for (const t of teile) {
    aus.set(t, pos);
    pos += t.length;
  }
  return aus;
}
