import { describe, expect, it } from 'vitest';
import { distanz, versetze } from '../../lib/coords.ts';
import {
  abstandZuLinie,
  fange,
  flaeche,
  formatFlaeche,
  imLasso,
  imPolygon,
  kreisRing,
  laenge,
  linienMitte,
  lokal,
  meterJePixel,
  pfeilspitze,
  rechteckRing,
  stosspfeil,
  versatz,
  zacken,
  type Xy,
} from './geometrie.ts';

const BERN = { lat: 46.9466, lon: 7.4442 };
const quadrat = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('Punkt in Polygon und Lasso', () => {
  it('innen, aussen, konkav', () => {
    expect(imPolygon({ x: 5, y: 5 }, quadrat)).toBe(true);
    expect(imPolygon({ x: 15, y: 5 }, quadrat)).toBe(false);
    // U-Form: die Kerbe oben in der Mitte liegt ausserhalb
    const u = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }];
    expect(imPolygon({ x: 15, y: 20 }, u)).toBe(false);
    expect(imPolygon({ x: 5, y: 20 }, u)).toBe(true);
  });
  it('Lasso wählt nur, wenn alle Punkte drin liegen', () => {
    expect(imLasso([{ x: 2, y: 2 }, { x: 8, y: 8 }], quadrat)).toBe(true);
    expect(imLasso([{ x: 2, y: 2 }, { x: 12, y: 8 }], quadrat)).toBe(false);
    expect(imLasso([], quadrat)).toBe(false);
    expect(imLasso([{ x: 2, y: 2 }], quadrat.slice(0, 2))).toBe(false); // kein Umriss
  });
});

describe('Fang', () => {
  it('Stützpunkt vor Segment, innerhalb der Toleranz', () => {
    const punkte = [{ x: 100, y: 100 }];
    const strecken: [{ x: number; y: number }, { x: number; y: number }][] = [[{ x: 0, y: 105 }, { x: 200, y: 105 }]];
    // Segment wäre näher (2 px), der Punkt (7 px) gewinnt trotzdem
    expect(fange({ x: 103, y: 106 }, punkte, strecken, 10)).toEqual({ x: 100, y: 100, art: 'punkt' });
    expect(fange({ x: 50, y: 108 }, punkte, strecken, 10)).toEqual({ x: 50, y: 105, art: 'strecke' });
    expect(fange({ x: 50, y: 130 }, punkte, strecken, 10)).toBeNull();
  });
  it('nächster von mehreren Punkten', () => {
    expect(fange({ x: 0, y: 0 }, [{ x: 8, y: 0 }, { x: 3, y: 0 }], [], 10)).toMatchObject({ x: 3 });
  });
  it('Abstand zu Linie, geschlossen inkl. Schlusskante', () => {
    expect(abstandZuLinie({ x: -3, y: 5 }, quadrat, false)).toBeCloseTo(Math.hypot(3, 5)); // offen: linke Kante fehlt
    expect(abstandZuLinie({ x: -3, y: 5 }, quadrat, true)).toBeCloseTo(3);
  });
});

describe('Masse', () => {
  it('Fläche eines 1 km × 1 km Quadrats bei Bern', () => {
    const a = BERN;
    const b = versetze(a, 1000, 90);
    const c = versetze(b, 1000, 0);
    const d = versetze(a, 1000, 0);
    expect(flaeche([a, b, c, d])).toBeGreaterThan(0.995e6);
    expect(flaeche([a, b, c, d])).toBeLessThan(1.005e6);
    expect(flaeche([a, d, c, b])).toBeCloseTo(flaeche([a, b, c, d]), 0); // Umlaufsinn egal
  });
  it('Länge offen und geschlossen', () => {
    const b = versetze(BERN, 300, 90);
    const c = versetze(b, 400, 0);
    expect(laenge([BERN, b, c])).toBeCloseTo(700, 0);
    expect(laenge([BERN, b, c], true)).toBeCloseTo(1200, -1);
  });
  it('Kreisring hat den Radius, Rechteckring vier Ecken', () => {
    for (const p of kreisRing(BERN, 500, 16)) expect(distanz(BERN, p)).toBeCloseTo(500, 3);
    const r = rechteckRing({ lat: 47, lon: 7 }, { lat: 46, lon: 8 });
    expect(r).toEqual([{ lat: 47, lon: 7 }, { lat: 47, lon: 8 }, { lat: 46, lon: 8 }, { lat: 46, lon: 7 }]);
  });
  it('Flächen-Format', () => {
    expect(formatFlaeche(850)).toBe('850 m²');
    expect(formatFlaeche(42_000)).toBe('4.20 ha');
    expect(formatFlaeche(12_500_000)).toBe('12.5 km²');
  });
  it('Linienmitte und Meter je Pixel', () => {
    const b = versetze(BERN, 1000, 90);
    expect(distanz(linienMitte([BERN, b]), BERN)).toBeCloseTo(500, 0);
    expect(meterJePixel(0, 0)).toBeCloseTo(78271.5, 0);
    expect(meterJePixel(46.95, 15)).toBeCloseTo(1.6, 1);
  });
});

describe('Taktische Zeichen (lokale Ebene)', () => {
  it('lokal hin und zurück', () => {
    const e = lokal(BERN);
    const p = versetze(BERN, 2000, 45);
    const [x, y] = e.hin(p);
    expect(Math.hypot(x, y)).toBeCloseTo(2000, -1);
    const q = e.zurueck([x, y]);
    expect(q.lat).toBeCloseTo(p.lat, 9);
    expect(q.lon).toBeCloseTo(p.lon, 9);
  });
  it('Pfeilspitze: symmetrische Schenkel der Länge l an der Spitze', () => {
    const [l1, spitze, l2] = pfeilspitze([0, 0], [100, 0], 10, 30);
    expect(spitze).toEqual([100, 0]);
    expect(Math.hypot(l1[0] - 100, l1[1])).toBeCloseTo(10);
    expect(l1[0]).toBeCloseTo(100 - 10 * Math.cos(Math.PI / 6));
    expect(l1[1]).toBeCloseTo(-l2[1]);
    expect(Math.abs(l1[1])).toBeCloseTo(5);
  });
  it('Zacken: Anzahl aus Länge/Abstand, Spitzen links in Höhe h', () => {
    const z = zacken([[0, 0], [100, 0]], 20, 8);
    expect(z.length).toBe(2 * 5 + 1);
    const spitzen = z.filter((_, i) => i % 2 === 1);
    for (const s of spitzen) expect(s[1]).toBeCloseTo(8);
    expect(spitzen.map((s) => s[0])).toEqual([10, 30, 50, 70, 90]);
    expect(z.at(-1)).toEqual([100, 0]);
    expect(zacken([[0, 0], [5, 0]], 20, 8).length).toBe(3); // mindestens ein Zacken
  });
  it('Versatz: parallel im Abstand d, auch am Knick', () => {
    const v = versatz([[0, 0], [100, 0], [100, 100]], 10);
    expect(v[0]).toEqual([0, 10]);
    expect(v[1][0]).toBeCloseTo(90);
    expect(v[1][1]).toBeCloseTo(10);
    expect(v[2][0]).toBeCloseTo(90);
  });
  it('Stosspfeil: geschlossen, Spitze am Ende, Kopf doppelt so breit wie der Schaft', () => {
    const achse: Xy[] = [[0, 0], [200, 0]];
    const u = stosspfeil(achse, 20);
    expect(u[0]).toEqual(u.at(-1));
    expect(u).toContainEqual([200, 0]);
    const ys = u.map((p) => p[1]);
    expect(Math.max(...ys)).toBeCloseTo(20); // Kopf: ±b
    const schaft = u.filter((p) => p[0] < 150);
    for (const p of schaft) expect(Math.abs(p[1])).toBeCloseTo(10); // Schaft: ±b/2
  });
});
