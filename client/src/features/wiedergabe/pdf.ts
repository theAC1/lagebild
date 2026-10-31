// Minimales Text-PDF für die Ereignisliste: A4 quer, Courier (Standardschrift, nichts einzubetten), WinAnsi-Kodierung,
// Tabelle mit festen Spaltenbreiten in Zeichen; lange Zellen brechen um. Keine Abhängigkeit (wie features/raster/pdf.ts).

const B = 842;
const H = 595;
const RAND = 28;
const GROESSE = 7.5;
const ZEILE = 9.5;
/** Courier: jedes Zeichen 0.6 em breit. */
export const ZEICHEN_JE_ZEILE = Math.floor((B - 2 * RAND) / (GROESSE * 0.6));

const WIN_ANSI: Record<string, number> = { '€': 0x80, '…': 0x85, '‰': 0x89, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97 };
/** Text als PDF-String (WinAnsi, je Zeichen ein Byte als Code-Unit ≤ 255); Unbekanntes wird «?». */
const pdfString = (s: string): string =>
  '(' + [...s].map((c) => {
    const n = c.charCodeAt(0);
    const b = WIN_ANSI[c] ?? (n < 0x80 || (n >= 0xa0 && n <= 0xff) ? n : 0x3f);
    const z = String.fromCharCode(b);
    return z === '(' || z === ')' || z === '\\' ? '\\' + z : z;
  }).join('') + ')';

/** Zeilen höchstens `breite` Zeichen, an Leerzeichen, zu lange Wörter hart geteilt. */
export function umbrechen(text: string, breite: number): string[] {
  const aus: string[] = [];
  let zeile = '';
  for (const wort of text.replace(/\s+/g, ' ').trim().split(' ')) {
    let w = wort;
    while (w.length > breite) {
      if (zeile) aus.push(zeile);
      zeile = '';
      aus.push(w.slice(0, breite));
      w = w.slice(breite);
    }
    if (!zeile) zeile = w;
    else if (zeile.length + 1 + w.length <= breite) zeile += ' ' + w;
    else {
      aus.push(zeile);
      zeile = w;
    }
  }
  aus.push(zeile);
  return aus;
}

/** Tabellenzeile → Textzeilen (Zellen umgebrochen, mit Leerzeichen aufgefüllt). */
function tabellenZeilen(zellen: string[], breiten: number[]): string[] {
  const teile = zellen.map((z, i) => umbrechen(z, breiten[i]));
  const n = Math.max(...teile.map((t) => t.length));
  return Array.from({ length: n }, (_, j) => teile.map((t, i) => (t[j] ?? '').padEnd(breiten[i])).join(' ').trimEnd());
}

export function textPdf(titel: string, kopf: string[], zeilen: string[][], breiten: number[]): Uint8Array {
  const proSeite = Math.floor((H - 2 * RAND) / ZEILE) - 3; // Titel, Leerzeile, Kopf
  const seiten: string[][][] = [[]];
  for (const z of zeilen) {
    const block = tabellenZeilen(z, breiten);
    const aktuell = seiten.at(-1)!;
    if (aktuell.flat().length + block.length > proSeite && aktuell.length) seiten.push([block]);
    else aktuell.push(block);
  }
  const kopfZeile = tabellenZeilen(kopf, breiten)[0];

  const teile: string[] = [];
  const offsets: number[] = [];
  let laenge = 0;
  const schreibe = (t: string) => {
    teile.push(t);
    laenge += t.length; // jede Code-Unit ist ein Byte (≤ 255)
  };
  const objekt = (nr: number, inhalt: string) => {
    offsets[nr] = laenge;
    schreibe(`${nr} 0 obj\n${inhalt}\nendobj\n`);
  };

  // 1 Katalog, 2 Seitenbaum, 3 Info, 4/5 Schriften, dann je Seite: Seite, Inhalt
  const seitenNr = seiten.map((_, i) => 6 + 2 * i);
  schreibe('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  objekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objekt(2, `<< /Type /Pages /Kids [${seitenNr.map((n) => `${n} 0 R`).join(' ')}] /Count ${seiten.length} >>`);
  objekt(3, `<< /Title ${pdfString(titel)} /Producer (Lagebild) >>`);
  objekt(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  objekt(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
  seiten.forEach((bloecke, i) => {
    const n = seitenNr[i];
    const fuss = `Seite ${i + 1}/${seiten.length}`;
    const text = [
      `BT /F2 ${GROESSE} Tf ${ZEILE} TL ${RAND} ${H - RAND} Td`,
      `${pdfString(titel.padEnd(ZEICHEN_JE_ZEILE - fuss.length) + fuss)} Tj T* T*`,
      `${pdfString(kopfZeile)} Tj T* /F1 ${GROESSE} Tf`,
      ...bloecke.flat().map((z) => `${pdfString(z)} Tj T*`),
      'ET',
    ].join('\n');
    objekt(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${B} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents ${n + 1} 0 R >>`);
    objekt(n + 1, `<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  });

  const xref = laenge;
  schreibe(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) schreibe(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  schreibe(`trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Uint8Array.from(teile.join(''), (c) => c.charCodeAt(0));
}
