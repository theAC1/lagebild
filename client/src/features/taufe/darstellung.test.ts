import { describe, expect, it } from 'vitest';
import type { Taufe } from '../../../../shared/protocol.ts';
import { innererPunkt, labelAnker, platziere, stossPfeil, taufFeatures } from './darstellung.ts';
import { imRing } from './geo.ts';
import type { Pos } from './fassaden.ts';

const quadrat: Pos[] = [[7.44, 46.94], [7.441, 46.94], [7.441, 46.9407], [7.44, 46.9407], [7.44, 46.94]];
const taufe = (extra: Partial<Taufe> = {}): Taufe => ({
  id: 't', familie: 'gebaeude', name: 'Gold', geometrie: { type: 'Polygon', coordinates: [quadrat] }, quelle: 'vt', objektart: 'building/', stoss: null, fassaden: [], ziel: false, von: 'x', erstelltAm: 0, geaendertAm: 0, ...extra,
});

describe('Anker', () => {
  it('innerer Punkt liegt auch bei einer U-Form im Gebäude', () => {
    const u: Pos[] = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10], [0, 0]];
    const p = innererPunkt(u);
    expect(imRing(p, u)).toBe(true);
  });
  it('Linie: Anker auf halber Länge mit Richtung', () => {
    const a = labelAnker({ type: 'LineString', coordinates: [[7, 46], [7.01, 46], [7.02, 46]] });
    expect(a.punkt[0]).toBeCloseTo(7.01, 6);
    expect(a.richtung).toBeDefined();
  });
});

describe('Stossrichtung', () => {
  it('Pfeil steht auf der Angreiferseite und zeigt aufs Gebäude', () => {
    const p = stossPfeil(taufe({ stoss: 0 }))!; // Angriff nach Norden: Pfeil südlich des Gebäudes
    expect(Math.max(...p.schaft.map((q) => q[1]))).toBeLessThan(46.94);
    expect(p.schaft[1][1]).toBeGreaterThan(p.schaft[0][1]);
    expect(stossPfeil(taufe())).toBeNull();
  });
  it('Features: Fassaden je Farbe als Linien, nur mit Stossrichtung', () => {
    const fassaden = (t: Taufe) => taufFeatures([t]).filter((f) => f.properties!.rolle === 'fassade').map((f) => f.properties!.fassade);
    expect(fassaden(taufe())).toEqual([]);
    expect(fassaden(taufe({ stoss: 0 }))).toEqual(['weiss', 'gruen', 'schwarz', 'rot']);
    // zwei benachbarte Kanten gleicher Farbe → eine Linie
    expect(fassaden(taufe({ stoss: 0, fassaden: [[1, 'weiss']] }))).toEqual(['weiss', 'schwarz', 'rot']);
  });
});

describe('Platzierung der Namenskästchen', () => {
  const w = (id: string, x: number, y: number, extra = {}) => ({ id, x, y, w: 40, h: 16, fuehrung: true, ...extra });
  it('passt ins Gebäude → Mitte, sonst daneben mit Führungslinie', () => {
    const [a, b] = platziere([w('a', 100, 100, { objekt: { w: 80, h: 40 } }), w('b', 300, 100, { objekt: { w: 10, h: 10 } })]);
    expect(a).toEqual({ id: 'a', dx: 0, dy: 0, fuehrung: false });
    expect(b).toMatchObject({ id: 'b', fuehrung: true });
  });
  it('Kollision: zweites weicht aus, ohne Platz entfällt es; Zielobjekt erscheint immer', () => {
    const r = platziere([w('a', 100, 100), w('b', 102, 100), { ...w('c', 101, 100), fuehrung: false }, { ...w('d', 101, 101), fuehrung: false, immer: true }]);
    expect(r[0]).toMatchObject({ dx: 0, dy: 0, fuehrung: false });
    expect(r[1]).toMatchObject({ fuehrung: true });
    expect('weg' in r[1]).toBe(false);
    expect(r[2]).toEqual({ id: 'c', weg: true });
    expect(r[3]).toMatchObject({ id: 'd', dx: 0, dy: 0 });
  });
});
