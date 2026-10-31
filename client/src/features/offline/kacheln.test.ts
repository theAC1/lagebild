import { describe, expect, it } from 'vitest';
import { ABLAUF_MS, abgelaufen, alleKacheln, anzahl, bereiche, bboxUm, enthaelt, kachelBei, kachelVon, karteDef, LUFTBILD_STANDARD_Z, UMGEBUNG_Z, urlVon, zuLoeschen, type Bbox, type Gebiet } from './kacheln.ts';

// ~10 × 10 km um Thun
const THUN: Bbox = [7.565, 46.713, 7.696, 46.803];
const gebiet = (id: string, bbox: Bbox, karten: Gebiet['karten'] = ['farbe']): Gebiet => ({
  id, name: id, bbox, karten, erstellt: 0, zuletztGenutzt: 0, status: 'fertig', erledigt: 0, gesamt: 0, bytes: 0,
});

describe('Kachel-Aufzählung', () => {
  it('Zoom-Grenzen je Karte (Taufe 14, Luftbild ohne «Volles Detail» begrenzt, mit bis Max-Zoom), Umgebung ab z5; Thun liegt drin', () => {
    const bs = bereiche({ bbox: THUN, karten: ['farbe', 'luftbild', 'taufe'] });
    const max = (k: string, b = bs) => Math.max(...b.filter((x) => x.karte === k).map((x) => x.z));
    expect(max('farbe')).toBe(19);
    expect(max('luftbild')).toBe(LUFTBILD_STANDARD_Z);
    expect(max('taufe')).toBe(14);
    expect(Math.min(...bs.map((b) => b.z))).toBe(5);
    const voll = bereiche({ bbox: THUN, karten: ['farbe', 'luftbild'], voll: true });
    expect(max('luftbild', voll)).toBe(karteDef('luftbild').maxzoom);
    expect(karteDef('luftbild').maxzoom).toBeGreaterThan(LUFTBILD_STANDARD_Z);
    expect(max('farbe', voll)).toBe(19); // Landeskarte bleibt unberührt
    const z14 = bs.find((b) => b.karte === 'farbe' && b.z === 14)!;
    // Thun (7.628, 46.758) liegt bei z14 auf x 8539, y 5778
    expect(z14.x0).toBeLessThanOrEqual(8539);
    expect(z14.x1).toBeGreaterThanOrEqual(8539);
    expect(z14.y0).toBeLessThanOrEqual(5778);
    expect(z14.y1).toBeGreaterThanOrEqual(5778);
  });

  it('Anzahl wächst je Zoomstufe etwa um Faktor 4, die Umgebung nur grob; kachelBei folgt alleKacheln; URL hin und zurück, fremde Layer keine Offline-Kacheln', () => {
    const bs = bereiche({ bbox: THUN, karten: ['farbe'] });
    const n = (z: number) => anzahl(bs.filter((b) => b.z === z));
    expect(n(19) / n(18)).toBeGreaterThan(3.5);
    expect(n(19) / n(18)).toBeLessThan(4.5);
    expect(n(19)).toBeGreaterThan(30_000); // ~191 × 191
    expect(n(19)).toBeLessThan(40_000);
    expect(n(UMGEBUNG_Z)).toBeLessThanOrEqual(9); // ±20 km bei z10 (Kachel ≈ 27 km)
    const klein = bereiche({ bbox: [7.6, 46.75, 7.61, 46.76], karten: ['farbe', 'taufe'] });
    const alle = [...alleKacheln(klein)];
    expect(alle).toHaveLength(anzahl(klein));
    for (const i of [0, 1, 7, alle.length - 1]) expect(kachelBei(klein, i)).toEqual(alle[i]);
    expect(() => kachelBei(klein, alle.length)).toThrow(RangeError);
    // URL hin und zurück, fremde Layer sind keine Offline-Kacheln
    const k = { karte: 'luftbild' as const, z: 17, x: 68291, y: 46459 };
    expect(urlVon(k)).toBe('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/17/68291/46459.jpeg');
    expect(kachelVon(urlVon(k))).toEqual(k);
    const t = { karte: 'taufe' as const, z: 14, x: 8536, y: 5807 };
    expect(kachelVon(urlVon(t))).toEqual(t);
    expect(kachelVon('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/14/1/2.jpeg')).toBeNull();
  });

  it('enthaelt: Rand und Karte zählen, innen nur oberhalb der Umgebungsstufen', () => {
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

describe('Löschen und Ablauf', () => {
  const klein: Bbox = [7.6, 46.75, 7.61, 46.76];
  it('Referenzzählung: allein alles weg; überlappend bleiben gemeinsame Kacheln; andere Karte teilt nichts; identisches Gebiet doppelt → nichts', () => {
    const a = gebiet('a', klein);
    expect([...zuLoeschen(a, [a])]).toHaveLength(anzahl(bereiche(a)));
    const b = gebiet('b', [7.605, 46.755, 7.615, 46.765]);
    const weg = new Set(zuLoeschen(a, [a, b]));
    const bUrls = new Set([...alleKacheln(bereiche(b))].map(urlVon));
    expect(weg.size).toBeGreaterThan(0);
    for (const u of weg) expect(bUrls.has(u)).toBe(false);
    for (const k of alleKacheln(bereiche(a))) expect(weg.has(urlVon(k)) || bUrls.has(urlVon(k))).toBe(true); // weg oder gehört b
    expect([...zuLoeschen(a, [gebiet('b', klein, ['luftbild'])])]).toHaveLength(anzahl(bereiche(a)));
    expect([...zuLoeschen(a, [{ ...a, id: 'b' }])]).toHaveLength(0);
  });

  it('60-Tage-Ablauf: nur Gebiete, die länger als ABLAUF_MS nicht genutzt wurden (Grenze bleibt)', () => {
    const jetzt = 100 * 86_400_000;
    const alt = { ...gebiet('alt', THUN), zuletztGenutzt: jetzt - ABLAUF_MS - 1 };
    const grenze = { ...gebiet('grenze', THUN), zuletztGenutzt: jetzt - ABLAUF_MS };
    const neu = { ...gebiet('neu', THUN), zuletztGenutzt: jetzt - 86_400_000 };
    expect(abgelaufen([alt, grenze, neu], jetzt).map((g) => g.id)).toEqual(['alt']);
  });
});

describe('bboxUm: Offline-Gebiet aus einem Rahmen', () => {
  it('umschliesst den Rahmen mit Rand (10 % der längeren Seite) auf allen Seiten', () => {
    const ring = [{ lat: 47.0, lon: 7.4 }, { lat: 47.0, lon: 7.5 }, { lat: 46.95, lon: 7.5 }, { lat: 46.95, lon: 7.4 }, { lat: 47.0, lon: 7.4 }];
    const [w, s, e, n] = bboxUm(ring);
    expect(w).toBeLessThan(7.4);
    expect(e).toBeGreaterThan(7.5);
    expect(s).toBeLessThan(46.95);
    expect(n).toBeGreaterThan(47.0);
    const rand = 0.1 * 7.6; // längere Seite ≈ 7.6 km breit
    expect((7.4 - w) * 111.32 * Math.cos((46.975 * Math.PI) / 180)).toBeCloseTo(rand, 1);
  });
});
