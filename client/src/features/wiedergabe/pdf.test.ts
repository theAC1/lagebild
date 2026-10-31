import { describe, expect, it } from 'vitest';
import { textPdf, umbrechen } from './pdf.ts';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('umbrechen', () => {
  it('an Wortgrenzen, zu lange Wörter hart', () => {
    expect(umbrechen('Brücke Nord gesperrt', 8)).toEqual(['Brücke', 'Nord', 'gesperrt']);
    expect(umbrechen('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(umbrechen('', 4)).toEqual(['']);
  });
});

describe('textPdf', () => {
  it('gültiges Gerüst, WinAnsi-Umlaute, Klammern escaped, Seitenumbruch', () => {
    const zeilen = Array.from({ length: 120 }, (_, i) => [`${i}`, 'Bär (Zug 1) – ok']);
    const pdf = latin1(textPdf('Ereignisse «Übung»', ['Nr', 'Text'], zeilen, [5, 30]));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/BaseFont /Courier');
    expect(pdf).toContain('B\xe4r \\(Zug 1\\) \x96 ok');
    expect(pdf).toContain('\xab\xdcbung'); // « und Ü als WinAnsi-Byte
    const seiten = Number(/\/Count (\d+)/.exec(pdf)![1]);
    expect(seiten).toBeGreaterThan(1);
    // xref-Offsets zeigen auf die Objekte
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const erster = Number(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(pdf)![1]);
    expect(pdf.slice(erster, erster + 7)).toBe('1 0 obj');
  });
});
