import { describe, expect, it } from 'vitest';
import { vonLv95 } from '../../../../shared/raster.ts';
import { A3_QUER, A4_QUER, affin, BAND, blatt, blattFelder, dateiName, kachelPlan, massstabText, mercator, RAND, runderMassstab, TILE, ZEILE_W, type Rechteck } from './druck.ts';
import { pdfAusJpegs } from './pdf.ts';

const GRANDE = { art: 'grande' as const, e: 2_600_000, n: 1_200_600, zeilen: 15, spalten: 21, zellM: 80 };
const PICCOLO = { ...GRANDE, art: 'piccolo' as const, zellM: 10 };
const innen = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe('Massstab', () => {
  it('rundet die Mantisse auf 0,5 auf', () => {
    expect(runderMassstab(808)).toBe(850);
    expect(runderMassstab(6461)).toBe(6500);
    expect(runderMassstab(1000)).toBe(1000);
    expect(runderMassstab(1001)).toBe(1500);
    expect(massstabText(6500)).toBe("1:6'500");
    expect(massstabText(25000)).toBe("1:25'000");
  });
});

describe('Blatt A4 quer', () => {
  it.each([GRANDE, PICCOLO])('Raster $art samt Tabelle mittig innerhalb der Ränder, LV95 achsparallel', (r) => {
    const b = blatt(r);
    expect(b.format).toBe(A4_QUER);
    expect(innen(b.tabelle, { x: RAND, y: RAND, w: A4_QUER.w - 2 * RAND, h: A4_QUER.h - 2 * RAND })).toBe(true);
    expect(b.tabelle).toEqual({ x: b.rahmen.x - ZEILE_W, y: b.rahmen.y - 2 * BAND, w: b.rahmen.w + 2 * ZEILE_W, h: b.rahmen.h + 4 * BAND });
    expect(b.tabelle.x + b.tabelle.w / 2).toBeCloseTo(A4_QUER.w / 2, 6);
    expect(b.tabelle.y + b.tabelle.h / 2).toBeCloseTo(A4_QUER.h / 2, 6);
    expect(b.rahmen.w / b.rahmen.h).toBeCloseTo(21 / 15, 9);
    // Ecke unten rechts des Rasters landet genau auf der Rahmenecke; von() kehrt zu() um
    const ur = b.zu({ e: r.e + 21 * r.zellM, n: r.n - 15 * r.zellM });
    expect(ur.x).toBeCloseTo(b.rahmen.x + b.rahmen.w, 6);
    expect(ur.y).toBeCloseTo(b.rahmen.y + b.rahmen.h, 6);
    expect(b.von(ur).e).toBeCloseTo(r.e + 21 * r.zellM, 6);
  });

  it('Massstab: Grande 1:7000, Piccolo 1:900 (rund, so gross wie möglich; die Höhe begrenzt)', () => {
    expect(blatt(GRANDE).massstab).toBe(7000);
    expect(blatt(PICCOLO).massstab).toBe(900);
    // 1 m im Gelände bei 1:900 = 1000/900 mm
    expect(blatt(PICCOLO).ptJeM).toBeCloseTo(72 / 0.0254 / 900, 6);
  });
});

describe('Blatt A3 quer', () => {
  it('kleinerer runder Massstab, gleiche Schriften/Köpfe (Layout in A4-Punkten), Tabelle mittig im Blatt', () => {
    expect(blatt(GRANDE, A3_QUER).massstab).toBe(5000);
    expect(blatt(PICCOLO, A3_QUER).massstab).toBe(650);
    const b = blatt(GRANDE, A3_QUER);
    const lw = A3_QUER.w / A3_QUER.k;
    expect(lw).toBeCloseTo(A4_QUER.w, 6);
    expect(b.tabelle.x + b.tabelle.w / 2).toBeCloseTo(lw / 2, 6);
    expect(b.tabelle.h).toBe(b.rahmen.h + 4 * BAND);
    // 1 m im Gelände = 1000/5000 mm auf dem A3-Blatt = ptJeM · k Blattpunkte
    expect(b.ptJeM * A3_QUER.k).toBeCloseTo(72 / 0.0254 / 5000, 6);
  });
  it('Kachelplan: A3 nutzt 200 dpi auf dem Papier, Stufe mindestens wie A4', () => {
    const px = 200 / 72;
    expect(kachelPlan(blatt(GRANDE, A3_QUER), px * A3_QUER.k).z).toBeGreaterThanOrEqual(kachelPlan(blatt(GRANDE), px).z);
  });
});

describe('Tabellenfelder (Vorlage)', () => {
  const b = blatt(GRANDE);
  const felder = blattFelder(GRANDE, b, 'spotmap');
  const { x, y, w, h } = b.rahmen;
  const zelle = w / 21;
  const zeile = (yy: number) => felder.filter((f) => Math.abs(f.y - yy) < 1e-6 && f.x >= x - 1e-6 && f.x < x + w);

  it('Spaltenköpfe oben hell, unten grau, je eine Zelle breit; Zeilenköpfe links und rechts grau', () => {
    const oben = zeile(y - BAND);
    expect(oben.map((f) => f.text)).toEqual(Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(oben.every((f) => f.stil === 'hell' && Math.abs(f.w - zelle) < 1e-6)).toBe(true);
    expect(oben[0].x).toBeCloseTo(x, 6);
    const unten = zeile(y + h);
    expect(unten.map((f) => f.text)).toEqual(oben.map((f) => f.text));
    expect(unten.every((f) => f.stil === 'grau')).toBe(true);
    const links = felder.filter((f) => f.x === x - ZEILE_W && f.y >= y && f.y < y + h);
    const rechts = felder.filter((f) => f.x === x + w && f.y >= y && f.y < y + h);
    expect(links.map((f) => f.text).join('')).toBe('ABCDEFGHIJKLMNO');
    expect(rechts.map((f) => f.text).join('')).toBe('ABCDEFGHIJKLMNO');
    expect([...links, ...rechts].every((f) => f.stil === 'grau' && Math.abs(f.h - zelle) < 1e-6)).toBe(true);
  });

  it('Titelzeile: Massstabsbalken über 5 von 7 Spalten, Seitenart, Rastername; ohne Einstufung', () => {
    const titel = zeile(y - 2 * BAND);
    expect(titel.map((f) => [f.art, f.text])).toEqual([
      ['massstab', "1:7'000"],
      ['text', 'SPOTMAP'],
      ['text', 'GRANDE'],
    ]);
    expect(titel[0]).toMatchObject({ n: 5, meter: 400 });
    expect(titel.map((f) => Math.round(f.w / zelle))).toEqual([7, 7, 7]);
    expect(blattFelder(PICCOLO, blatt(PICCOLO), 'landeskarte').find((f) => f.art === 'massstab')).toMatchObject({ meter: 50 });
    expect(blattFelder(PICCOLO, blatt(PICCOLO), 'landeskarte').map((f) => f.text)).toContain('LANDESKARTE');
  });

  it('Ecken: Quadranten-Legende A B / C D oben links, Nordpfeil oben rechts, Lagezeile unten', () => {
    const q = felder.filter((f) => f.x < x && f.y < y);
    expect(q.map((f) => f.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(q[1].x).toBeGreaterThan(q[0].x);
    expect(q[2].y).toBeGreaterThan(q[0].y);
    expect(felder.find((f) => f.art === 'nord')).toMatchObject({ x: x + w, y: y - 2 * BAND, w: ZEILE_W, h: 2 * BAND });
    expect(felder.find((f) => f.art === 'lage')).toMatchObject({ x, y: y + h + BAND, w, h: BAND });
  });

  it('alle Felder innerhalb der Tabelle, ohne Überlappung', () => {
    for (const f of felder) expect(innen(f, { x: b.tabelle.x - 1e-6, y: b.tabelle.y - 1e-6, w: b.tabelle.w + 2e-6, h: b.tabelle.h + 2e-6 })).toBe(true);
    const ueber = (a: Rechteck, c: Rechteck) => a.x + a.w > c.x + 1e-6 && c.x + c.w > a.x + 1e-6 && a.y + a.h > c.y + 1e-6 && c.y + c.h > a.y + 1e-6;
    felder.forEach((f, i) => felder.slice(i + 1).forEach((g) => expect(ueber(f, g)).toBe(false)));
    // und keines im Kartenfeld
    for (const f of felder) expect(ueber(f, b.rahmen)).toBe(false);
  });

  it('viele schmale Spalten: nur jede k-te beschriftet, das Feld deckt die k Zellen', () => {
    const r = { ...GRANDE, spalten: 99, zeilen: 26, zellM: 10 };
    const bb = blatt(r);
    const oben = blattFelder(r, bb, 'luftbild').filter((f) => Math.abs(f.y - (bb.rahmen.y - BAND)) < 1e-6 && f.x >= bb.rahmen.x - 1e-6 && f.x < bb.rahmen.x + bb.rahmen.w);
    expect(oben.length).toBeLessThan(99);
    expect(oben[0].text).toBe('01');
    expect(oben.reduce((s, f) => s + f.w, 0)).toBeCloseTo(bb.rahmen.w, 6);
    for (const f of oben) expect(f.w).toBeGreaterThanOrEqual(16 - 1e-6);
  });
});

describe('Kacheln', () => {
  it('affin legt drei Punkte genau aufeinander', () => {
    const s = [{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: -1, y: 8 }] as const;
    const d = [{ x: 5, y: 5 }, { x: 25, y: 7 }, { x: 4, y: 21 }] as const;
    const [a, b, c, dd, e, f] = affin([...s] as never, [...d] as never);
    s.forEach((p, i) => {
      expect(a * p.x + c * p.y + e).toBeCloseTo(d[i].x, 9);
      expect(b * p.x + dd * p.y + f).toBeCloseTo(d[i].y, 9);
    });
  });

  it('Plan: Stufe passend zur Auflösung, deckt das Kartenfeld ab, Rasterecke liegt auf der Rahmenecke', () => {
    const b = blatt(PICCOLO);
    const pxJePt = 200 / 72;
    const plan = kachelPlan(b, pxJePt);
    expect(plan.z).toBe(19); // 1:900 bei 200 dpi ≈ 0,11 m/px → z20 wäre näher, aber Offline-Gebiete haben z19
    expect(kachelPlan(blatt(GRANDE), pxJePt).z).toBe(17);
    // die Rasterecke oben links, über Mercator abgebildet, landet (bis auf Bruchteile eines Punkts) auf dem Rahmen
    const g = vonLv95({ e: PICCOLO.e, n: PICCOLO.n });
    const m = mercator(g.lon, g.lat, plan.z);
    const [a, bb, c, d, e, f] = plan.matrix;
    const rx = m.x - plan.x0 * TILE;
    const ry = m.y - plan.y0 * TILE;
    expect(a * rx + c * ry + e).toBeCloseTo(b.rahmen.x, 1);
    expect(bb * rx + d * ry + f).toBeCloseTo(b.rahmen.y, 1);
    // Kachelbereich überdeckt die Ecken des Kartenfelds (= Rahmen)
    for (const [x, y] of [[b.rahmen.x, b.rahmen.y], [b.rahmen.x + b.rahmen.w, b.rahmen.y + b.rahmen.h]]) {
      const q = vonLv95(b.von({ x, y }));
      const mm = mercator(q.lon, q.lat, plan.z);
      expect(Math.floor(mm.x / TILE)).toBeGreaterThanOrEqual(plan.x0);
      expect(Math.floor(mm.x / TILE)).toBeLessThanOrEqual(plan.x1);
      expect(Math.floor(mm.y / TILE)).toBeGreaterThanOrEqual(plan.y0);
      expect(Math.floor(mm.y / TILE)).toBeLessThanOrEqual(plan.y1);
    }
    expect((plan.x1 - plan.x0 + 1) * (plan.y1 - plan.y0 + 1)).toBeLessThan(200);
  });
});

describe('Dateiname', () => {
  it('ohne Umlaute und Sonderzeichen', () => {
    expect(dateiName('Übung «Aare» 3', 'grande', new Date(2026, 9, 30))).toBe('ubung-aare-3-grande-2026-10-30.pdf');
    expect(dateiName('««', 'piccolo', new Date(2026, 0, 5))).toBe('lage-piccolo-2026-01-05.pdf');
  });
});

describe('PDF', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = pdfAusJpegs([{ jpeg, pxW: 4, pxH: 3 }, { jpeg, pxW: 4, pxH: 3 }], 842, 595, 'Übung · Grande');
  const text = new TextDecoder('latin1').decode(pdf);

  it('Kopf, zwei Seiten A4 quer, je ein JPEG, Schluss', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Pages /Kids [4 0 R 7 0 R] /Count 2');
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(text.match(/\/MediaBox \[0 0 842 595\]/g)).toHaveLength(2);
    expect(text.match(/\/Filter \/DCTDecode \/Length 9 >>/g)).toHaveLength(2);
    expect(text).toContain('/Title <FEFF00dc');
  });

  it('xref zeigt auf die Objekte, startxref auf die xref', () => {
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const eintraege = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(eintraege).toHaveLength(9);
    eintraege.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(text).toContain('/Size 10 ');
  });

  it('JPEG-Bytes unverändert eingebettet', () => {
    const i = text.indexOf('stream\n\xff\xd8');
    expect(i).toBeGreaterThan(0);
    expect([...pdf.slice(i + 7, i + 7 + jpeg.length)]).toEqual([...jpeg]);
  });
});
