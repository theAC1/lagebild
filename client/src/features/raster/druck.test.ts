import { describe, expect, it } from 'vitest';
import { vonLv95 } from '../../../../shared/raster.ts';
import { A4_QUER, affin, blatt, blattKoepfe, dateiName, kachelPlan, KOPF, massstabText, mercator, runderMassstab, TILE } from './druck.ts';
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
  it.each([GRANDE, PICCOLO])('Raster $art passt samt Köpfen ins Kartenfeld, mittig, LV95 achsparallel', (r) => {
    const b = blatt(r);
    expect(b.format).toBe(A4_QUER);
    const mitKoepfen = { x: b.rahmen.x - KOPF.wZeile, y: b.rahmen.y - KOPF.h, w: b.rahmen.w + 2 * KOPF.wZeile, h: b.rahmen.h + 2 * KOPF.h };
    expect(innen(mitKoepfen, b.karte)).toBe(true);
    expect(b.rahmen.x + b.rahmen.w / 2).toBeCloseTo(b.karte.x + b.karte.w / 2, 6);
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

  it('Köpfe rundum: 01… oben und unten von links, A… links und rechts von oben, ohne Namensschild', () => {
    const b = blatt(GRANDE);
    const k = blattKoepfe(GRANDE, b);
    const seite = (s: string) => k.filter((x) => x.seite === s);
    expect(seite('oben').map((x) => x.text)).toEqual(Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(seite('unten')).toHaveLength(21);
    expect(seite('links').map((x) => x.text).join('')).toBe('ABCDEFGHIJKLMNO');
    expect(seite('rechts')).toHaveLength(15);
    expect(seite('name')).toHaveLength(0);
    // oben über dem Rahmen, unten darunter, links/rechts daneben; Spalte 01 mittig über der ersten Zelle
    const zelle = b.rahmen.w / 21;
    expect(seite('oben')[0].y + KOPF.h).toBeCloseTo(b.rahmen.y, 6);
    expect(seite('oben')[0].x + seite('oben')[0].w / 2).toBeCloseTo(b.rahmen.x + zelle / 2, 6);
    expect(seite('unten')[0].y).toBeCloseTo(b.rahmen.y + b.rahmen.h, 6);
    expect(seite('links')[0].x + KOPF.wZeile).toBeCloseTo(b.rahmen.x, 6);
    expect(seite('rechts')[14].x).toBeCloseTo(b.rahmen.x + b.rahmen.w, 6);
    expect(seite('links')[0].y + KOPF.h / 2).toBeCloseTo(b.rahmen.y + zelle / 2, 6);
  });

  it('viele schmale Spalten: nur jede k-te beschriftet', () => {
    const r = { ...GRANDE, spalten: 99, zeilen: 26, zellM: 10 };
    const oben = blattKoepfe(r, blatt(r)).filter((x) => x.seite === 'oben');
    expect(oben.length).toBeLessThan(99);
    expect(oben[0].text).toBe('01');
    for (let i = 1; i < oben.length; i++) expect(oben[i].x).toBeGreaterThanOrEqual(oben[i - 1].x + oben[i - 1].w);
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
    // Kachelbereich überdeckt alle vier Ecken des Kartenfelds
    for (const [x, y] of [[b.karte.x, b.karte.y], [b.karte.x + b.karte.w, b.karte.y + b.karte.h]]) {
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
