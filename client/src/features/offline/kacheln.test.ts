import { describe, expect, it } from 'vitest';
import {
  ABLAUF_MS,
  abgelaufen,
  alleKacheln,
  anzahl,
  bereiche,
  enthaelt,
  kachelBei,
  kachelVon,
  schaetzeBytes,
  UMGEBUNG_Z,
  urlVon,
  zuLoeschen,
  type Bbox,
  type Gebiet,
} from './kacheln.ts';

// ~10 × 10 km um Thun
const THUN: Bbox = [7.565, 46.713, 7.696, 46.803];
const gebiet = (id: string, bbox: Bbox, karten: Gebiet['karten'] = ['farbe']): Gebiet => ({
  id,
  name: id,
  bbox,
  karten,
  erstellt: 0,
  zuletztGenutzt: 0,
  status: 'fertig',
  erledigt: 0,
  gesamt: 0,
  bytes: 0,
});

describe('Kachel-Aufzählung', () => {
  it('z0-Kachel der Schweiz und Zoom-Grenzen je Karte', () => {
    const bs = bereiche({ bbox: THUN, karten: ['farbe', 'luftbild', 'taufe'] });
    const max = (k: string) => Math.max(...bs.filter((b) => b.karte === k).map((b) => b.z));
    expect(max('farbe')).toBe(19);
    expect(max('luftbild')).toBe(20);
    expect(max('taufe')).toBe(14);
    expect(Math.min(...bs.map((b) => b.z))).toBe(5);
    const z14 = bs.find((b) => b.karte === 'farbe' && b.z === 14)!;
    // Thun (7.628, 46.758) liegt bei z14 auf x 8539, y 5778
    expect(z14.x0).toBeLessThanOrEqual(8539);
    expect(z14.x1).toBeGreaterThanOrEqual(8539);
    expect(z14.y0).toBeLessThanOrEqual(5778);
    expect(z14.y1).toBeGreaterThanOrEqual(5778);
  });

  it('Anzahl wächst pro Zoomstufe etwa um Faktor 4, die Umgebung nur grob', () => {
    const bs = bereiche({ bbox: THUN, karten: ['farbe'] });
    const n = (z: number) => anzahl(bs.filter((b) => b.z === z));
    expect(n(19) / n(18)).toBeGreaterThan(3.5);
    expect(n(19) / n(18)).toBeLessThan(4.5);
    expect(n(19)).toBeGreaterThan(30_000); // ~191 × 191
    expect(n(19)).toBeLessThan(40_000);
    expect(n(UMGEBUNG_Z)).toBeLessThanOrEqual(9); // ±20 km bei z10 (Kachel ≈ 27 km)
  });

  it('MB-Schätzung 10 × 10 km', () => {
    const mb = (k: Gebiet['karten']) => schaetzeBytes(bereiche({ bbox: THUN, karten: k })) / 1024 ** 2;
    expect(mb(['farbe'])).toBeGreaterThan(500);
    expect(mb(['farbe'])).toBeLessThan(1000);
    expect(mb(['taufe'])).toBeGreaterThan(5);
    expect(mb(['taufe'])).toBeLessThan(25); // inkl. Umgebung z5–z10
    expect(mb(['farbe', 'luftbild'])).toBeCloseTo(mb(['farbe']) + mb(['luftbild']));
  });

  it('kachelBei folgt der Reihenfolge von alleKacheln', () => {
    const bs = bereiche({ bbox: [7.6, 46.75, 7.61, 46.76], karten: ['farbe', 'taufe'] });
    const alle = [...alleKacheln(bs)];
    expect(alle).toHaveLength(anzahl(bs));
    for (const i of [0, 1, 7, alle.length - 1]) expect(kachelBei(bs, i)).toEqual(alle[i]);
    expect(() => kachelBei(bs, alle.length)).toThrow(RangeError);
  });

  it('URL hin und zurück, fremde Layer sind keine Offline-Kacheln', () => {
    const k = { karte: 'luftbild' as const, z: 17, x: 68291, y: 46459 };
    expect(urlVon(k)).toBe('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/17/68291/46459.jpeg');
    expect(kachelVon(urlVon(k))).toEqual(k);
    const t = { karte: 'taufe' as const, z: 14, x: 8536, y: 5807 };
    expect(kachelVon(urlVon(t))).toEqual(t);
    expect(kachelVon('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/14/1/2.jpeg')).toBeNull();
  });

  it('enthaelt: innen nur oberhalb der Umgebungsstufen', () => {
    const g = gebiet('a', THUN);
    const z16 = bereiche(g).find((b) => b.z === 16)!;
    expect(enthaelt(g, { karte: 'farbe', z: 16, x: z16.x0, y: z16.y0 }, true)).toBe(true);
    expect(enthaelt(g, { karte: 'farbe', z: 16, x: z16.x1 + 1, y: z16.y0 })).toBe(false);
    expect(enthaelt(g, { karte: 'luftbild', z: 16, x: z16.x0, y: z16.y0 })).toBe(false);
    const z8 = bereiche(g).find((b) => b.z === 8)!;
    expect(enthaelt(g, { karte: 'farbe', z: 8, x: z8.x0, y: z8.y0 })).toBe(true);
    expect(enthaelt(g, { karte: 'farbe', z: 8, x: z8.x0, y: z8.y0 }, true)).toBe(false);
  });
});

describe('Referenzzählung beim Löschen', () => {
  const klein: Bbox = [7.6, 46.75, 7.61, 46.76];
  it('ohne andere Gebiete fliegt alles raus', () => {
    const a = gebiet('a', klein);
    expect([...zuLoeschen(a, [a])]).toHaveLength(anzahl(bereiche(a)));
  });

  it('überlappende Gebiete behalten gemeinsame Kacheln', () => {
    const a = gebiet('a', klein);
    const b = gebiet('b', [7.605, 46.755, 7.615, 46.765]);
    const weg = new Set(zuLoeschen(a, [a, b]));
    const bUrls = new Set([...alleKacheln(bereiche(b))].map(urlVon));
    expect(weg.size).toBeGreaterThan(0);
    for (const u of weg) expect(bUrls.has(u)).toBe(false);
    // jede Kachel von a ist entweder weg oder gehört b
    for (const k of alleKacheln(bereiche(a))) expect(weg.has(urlVon(k)) || bUrls.has(urlVon(k))).toBe(true);
  });

  it('gleiche Fläche, andere Karte: nichts geteilt', () => {
    const a = gebiet('a', klein, ['farbe']);
    const b = gebiet('b', klein, ['luftbild']);
    expect([...zuLoeschen(a, [b])]).toHaveLength(anzahl(bereiche(a)));
  });

  it('identisches Gebiet doppelt: nichts löschen', () => {
    const a = gebiet('a', klein);
    expect([...zuLoeschen(a, [{ ...a, id: 'b' }])]).toHaveLength(0);
  });
});

describe('60-Tage-Ablauf', () => {
  it('nur Gebiete, die länger als 60 Tage nicht genutzt wurden', () => {
    const jetzt = 100 * 86_400_000;
    const alt = { ...gebiet('alt', THUN), zuletztGenutzt: jetzt - ABLAUF_MS - 1 };
    const grenze = { ...gebiet('grenze', THUN), zuletztGenutzt: jetzt - ABLAUF_MS };
    const neu = { ...gebiet('neu', THUN), zuletztGenutzt: jetzt - 86_400_000 };
    expect(abgelaufen([alt, grenze, neu], jetzt).map((g) => g.id)).toEqual(['alt']);
  });
});
