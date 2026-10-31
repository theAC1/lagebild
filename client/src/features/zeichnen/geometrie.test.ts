import { describe, expect, it } from 'vitest';
import { distanz, versetze } from '../../lib/coords.ts';
import { abstandZuLinie, fange, flaeche, formatFlaeche, imLasso, imPolygon, kreisRing, laenge, linienMitte, lokal, meterJePixel, pfeil, rechteckRing, stosspfeil, versatz, zacken, type Xy } from './geometrie.ts';

const BERN = { lat: 46.9466, lon: 7.4442 };
const quadrat = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('Auswahl', () => {
  it('Punkt in Polygon (auch konkav); Lasso nur, wenn alle Punkte drin liegen', () => {
    expect(imPolygon({ x: 5, y: 5 }, quadrat)).toBe(true);
    expect(imPolygon({ x: 15, y: 5 }, quadrat)).toBe(false);
    // U-Form: die Kerbe oben in der Mitte liegt ausserhalb
    const u = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }];
    expect(imPolygon({ x: 15, y: 20 }, u)).toBe(false);
    expect(imPolygon({ x: 5, y: 20 }, u)).toBe(true);
    expect(imLasso([{ x: 2, y: 2 }, { x: 8, y: 8 }], quadrat)).toBe(true);
    expect(imLasso([{ x: 2, y: 2 }, { x: 12, y: 8 }], quadrat)).toBe(false);
    expect(imLasso([], quadrat)).toBe(false);
    expect(imLasso([{ x: 2, y: 2 }], quadrat.slice(0, 2))).toBe(false); // kein Umriss
  });
  it('Fang: Stützpunkt vor Segment innerhalb der Toleranz, nächster von mehreren; Abstand geschlossen inkl. Schlusskante', () => {
    const punkte = [{ x: 100, y: 100 }];
    const strecken: [{ x: number; y: number }, { x: number; y: number }][] = [[{ x: 0, y: 105 }, { x: 200, y: 105 }]];
    // Segment wäre näher (2 px), der Punkt (7 px) gewinnt trotzdem
    expect(fange({ x: 103, y: 106 }, punkte, strecken, 10)).toEqual({ x: 100, y: 100, art: 'punkt' });
    expect(fange({ x: 50, y: 108 }, punkte, strecken, 10)).toEqual({ x: 50, y: 105, art: 'strecke' });
    expect(fange({ x: 50, y: 130 }, punkte, strecken, 10)).toBeNull();
    expect(fange({ x: 0, y: 0 }, [{ x: 8, y: 0 }, { x: 3, y: 0 }], [], 10)).toMatchObject({ x: 3 });
    expect(abstandZuLinie({ x: -3, y: 5 }, quadrat, false)).toBeCloseTo(Math.hypot(3, 5)); // offen: linke Kante fehlt
    expect(abstandZuLinie({ x: -3, y: 5 }, quadrat, true)).toBeCloseTo(3);
  });
});

describe('Masse', () => {
  it('Fläche 1 km² bei Bern (Umlaufsinn egal), Länge offen/geschlossen, Format; Kreisring, Rechteckring, Linienmitte, Meter je Pixel', () => {
    const b = versetze(BERN, 1000, 90);
    const c = versetze(b, 1000, 0);
    const d = versetze(BERN, 1000, 0);
    expect(flaeche([BERN, b, c, d])).toBeGreaterThan(0.995e6);
    expect(flaeche([BERN, b, c, d])).toBeLessThan(1.005e6);
    expect(flaeche([BERN, d, c, b])).toBeCloseTo(flaeche([BERN, b, c, d]), 0);
    const b3 = versetze(BERN, 300, 90);
    const c4 = versetze(b3, 400, 0);
    expect(laenge([BERN, b3, c4])).toBeCloseTo(700, 0);
    expect(laenge([BERN, b3, c4], true)).toBeCloseTo(1200, -1);
    expect(formatFlaeche(850)).toBe('850 m²');
    expect(formatFlaeche(42_000)).toBe('4.20 ha');
    expect(formatFlaeche(12_500_000)).toBe('12.5 km²');
    for (const p of kreisRing(BERN, 500, 16)) expect(distanz(BERN, p)).toBeCloseTo(500, 3);
    expect(rechteckRing({ lat: 47, lon: 7 }, { lat: 46, lon: 8 })).toEqual([{ lat: 47, lon: 7 }, { lat: 47, lon: 8 }, { lat: 46, lon: 8 }, { lat: 46, lon: 7 }]);
    expect(distanz(linienMitte([BERN, versetze(BERN, 1000, 90)]), BERN)).toBeCloseTo(500, 0);
    expect(meterJePixel(0, 0)).toBeCloseTo(78271.5, 0);
    expect(meterJePixel(46.95, 15)).toBeCloseTo(1.6, 1);
  });
});

describe('Taktische Zeichen (lokale Ebene)', () => {
  it('lokal hin und zurück; Pfeil: Dreieck l lang, ±b breit, Spitze am Ende, Richtung über die Kopflänge, kurzer Pfeil gekürzt', () => {
    const e = lokal(BERN);
    const p0 = versetze(BERN, 2000, 45);
    const [x, y] = e.hin(p0);
    expect(Math.hypot(x, y)).toBeCloseTo(2000, -1);
    expect(e.zurueck([x, y]).lat).toBeCloseTo(p0.lat, 9);
    expect(e.zurueck([x, y]).lon).toBeCloseTo(p0.lon, 9);
    const p = pfeil([[0, 0], [100, 0]], 10, 4)!;
    expect(p.kopf).toEqual([[90, 4], [100, 0], [90, -4], [90, 4]]);
    expect(p.schaft).toEqual([[0, 0], [95, 0]]);
    // Knick kurz vor dem Ende: Richtung über die Kopflänge, nicht aus dem 1-m-Stück nach oben
    const k = pfeil([[0, 0], [100, 0], [100, 1]], 10, 4)!.kopf;
    expect(k[1]).toEqual([100, 1]);
    expect(k[0][0]).toBeLessThan(92);
    expect(pfeil([[5, 5], [5, 5]], 10, 4)).toBeNull();
    expect(pfeil([[0, 0], [10, 0]], 10, 4)!.kopf[0]).toEqual([4, 2.4]); // kurzer Pfeil: Kopf auf 60 % gekürzt
  });
  it('Zacken, Versatz am Knick, Stosspfeil geschlossen mit doppelt breitem Kopf', () => {
    const z = zacken([[0, 0], [100, 0]], 20, 8);
    expect(z.length).toBe(2 * 5 + 1);
    const spitzen = z.filter((_, i) => i % 2 === 1);
    for (const s of spitzen) expect(s[1]).toBeCloseTo(8);
    expect(spitzen.map((s) => s[0])).toEqual([10, 30, 50, 70, 90]);
    expect(z.at(-1)).toEqual([100, 0]);
    expect(zacken([[0, 0], [5, 0]], 20, 8).length).toBe(3); // mindestens ein Zacken
    const v = versatz([[0, 0], [100, 0], [100, 100]], 10);
    expect(v[0]).toEqual([0, 10]);
    expect(v[1][0]).toBeCloseTo(90);
    expect(v[1][1]).toBeCloseTo(10);
    expect(v[2][0]).toBeCloseTo(90);
    const achse: Xy[] = [[0, 0], [200, 0]];
    const u = stosspfeil(achse, 20);
    expect(u[0]).toEqual(u.at(-1));
    expect(u).toContainEqual([200, 0]);
    expect(Math.max(...u.map((p) => p[1]))).toBeCloseTo(20); // Kopf: ±b
    for (const p of u.filter((p) => p[0] < 150)) expect(Math.abs(p[1])).toBeCloseTo(10); // Schaft: ±b/2
  });
});
