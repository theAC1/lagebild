import { describe, expect, it } from 'vitest';
import { ansprache, funkAnsprache, imRaster, linien, parseAnsprache, rahmen, rasterMitteLv95, rasterUm, vonLv95, zelleLv95, zelleVon, zellMitte, zellMitteLv95, zuLv95, type RasterGeo } from './raster.ts';

// Ecke oben links bei 2'600'000 / 1'200'000, 21 × 15 Zellen à 80 m (Juans Vorlage, Grande)
const R: RasterGeo = { e: 2_600_000, n: 1_200_000, zeilen: 15, spalten: 21, zellM: 80 };
const lv = (e: number, n: number) => ({ e: R.e + e, n: R.n - n }); // e nach rechts, n nach unten ab Ecke

describe('Führungsraster: Punkt → Zelle', () => {
  it('Ecke oben links ist A 01 A, Zeilen von oben, Spalten von links', () => {
    expect(ansprache(zelleLv95(R, lv(1, 1))!)).toBe('A 01 A');
    expect(ansprache(zelleLv95(R, lv(8 * 80 + 1, 7 * 80 + 1))!)).toBe('H 09 A');
    expect(ansprache(zelleLv95(R, lv(21 * 80 - 1, 15 * 80 - 1))!)).toBe('O 21 D');
  });
  it('Quadranten: A oben links, B oben rechts, C unten links, D unten rechts', () => {
    const z = (dx: number, dy: number) => zelleLv95(R, lv(8 * 80 + dx, 7 * 80 + dy))!.quadrant;
    expect([z(10, 10), z(70, 10), z(10, 70), z(70, 70)]).toEqual(['A', 'B', 'C', 'D']);
    expect(z(40, 40)).toBe('D'); // genau auf der Mitte: rechts unten
  });
  it('Ränder: links/oben gehört dazu, rechts/unten nicht mehr', () => {
    expect(zelleLv95(R, lv(0, 0))).toEqual({ zeile: 0, spalte: 0, quadrant: 'A' });
    expect(zelleLv95(R, lv(21 * 80, 10))).toBeNull();
    expect(zelleLv95(R, lv(10, 15 * 80))).toBeNull();
    expect(zelleLv95(R, lv(-0.01, 10))).toBeNull();
    expect(zelleLv95(R, lv(10, -0.01))).toBeNull();
  });
  it('mehr als 21 Zeilen bis Z, Spalten zweistellig', () => {
    const gross = { ...R, zeilen: 26, spalten: 30 };
    expect(ansprache(zelleLv95(gross, lv(29 * 80 + 1, 25 * 80 + 1))!)).toBe('Z 30 A');
    expect(zelleLv95(R, lv(1, 22 * 80))).toBeNull();
  });
  it('Zellgrösse 10 m (Piccolo)', () => {
    const p = { ...R, zellM: 10 };
    expect(ansprache(zelleLv95(p, lv(83, 77))!)).toBe('H 09 C');
  });
  it('über WGS84: Zellmitte trifft wieder dieselbe Zelle', () => {
    for (const z of [{ zeile: 7, spalte: 8, quadrant: 'C' as const }, { zeile: 0, spalte: 20, quadrant: 'B' as const }, { zeile: 14, spalte: 0, quadrant: null }]) {
      const back = zelleVon(R, zellMitte(R, z))!;
      expect(back.zeile).toBe(z.zeile);
      expect(back.spalte).toBe(z.spalte);
      if (z.quadrant) expect(back.quadrant).toBe(z.quadrant);
    }
  });
});

describe('Führungsraster: Zelle → Punkt und Ansprache', () => {
  it('Mitte der Zelle bzw. des Viertels', () => {
    expect(zellMitteLv95(R, { zeile: 7, spalte: 8, quadrant: null })).toEqual(lv(8.5 * 80, 7.5 * 80));
    expect(zellMitteLv95(R, { zeile: 7, spalte: 8, quadrant: 'A' })).toEqual(lv(8.25 * 80, 7.25 * 80));
    expect(zellMitteLv95(R, { zeile: 7, spalte: 8, quadrant: 'D' })).toEqual(lv(8.75 * 80, 7.75 * 80));
    expect(zellMitteLv95(R, { zeile: 7, spalte: 8, quadrant: 'B' })).toEqual(lv(8.75 * 80, 7.25 * 80));
  });
  it('Funk: Hotel 09 Charlie', () => {
    expect(funkAnsprache({ zeile: 7, spalte: 8, quadrant: 'C' })).toBe('Hotel 09 Charlie');
    expect(funkAnsprache({ zeile: 0, spalte: 11, quadrant: null })).toBe('Alfa 12');
  });
  it('Ansprache lesen', () => {
    expect(parseAnsprache('H 09 C')).toEqual({ zeile: 7, spalte: 8, quadrant: 'C' });
    expect(parseAnsprache('h9')).toEqual({ zeile: 7, spalte: 8, quadrant: null });
    expect(parseAnsprache('Z30d')).toEqual({ zeile: 25, spalte: 29, quadrant: 'D' });
    expect(parseAnsprache('H 00')).toBeNull();
    expect(parseAnsprache('HH 09')).toBeNull();
    expect(imRaster(R, parseAnsprache('P 01')!)).toBe(false);
    expect(imRaster(R, parseAnsprache('O 21')!)).toBe(true);
  });
});

describe('Führungsraster: Geometrie', () => {
  it('rasterUm zentriert auf ganze Meter', () => {
    const r = rasterUm({ e: 2_600_000.4, n: 1_200_000.6 }, { zeilen: 15, spalten: 21, zellM: 80 });
    expect(r).toEqual({ zeilen: 15, spalten: 21, zellM: 80, e: 2_599_160, n: 1_200_601 });
    expect(rasterMitteLv95(r)).toEqual({ e: 2_600_000, n: 1_200_001 });
  });
  it('Rahmen geschlossen, nordausgerichtet in LV95; Linienzahl', () => {
    const ring = rahmen(R).map(zuLv95);
    expect(ring).toHaveLength(5);
    expect(ring[0].e).toBeCloseTo(R.e, 2);
    expect(ring[2].e).toBeCloseTo(R.e + 21 * 80, 2);
    expect(ring[2].n).toBeCloseTo(R.n - 15 * 80, 2);
    expect(linien(R, 1)).toHaveLength(20 + 14);
    expect(linien(R, 2)).toHaveLength(21 + 15);
  });
  it('LV95 hin und zurück', () => {
    const p = vonLv95({ e: 2_600_000, n: 1_200_000 });
    expect(p.lat).toBeCloseTo(46.95108, 4);
    expect(p.lon).toBeCloseTo(7.43864, 4);
  });
});
