import { describe, expect, it } from 'vitest';
import type { Lv95 } from '../../../../shared/raster.ts';
import { koepfe } from './beschriftung.ts';

const R = { art: 'grande' as const, e: 2_600_000, n: 1_200_000, zeilen: 15, spalten: 21, zellM: 80 };
const M = { h: 24, wSpalte: 30, wZeile: 24 };
const B = { links: 0, oben: 0, rechts: 1200, unten: 900 };
/** Lineare Projektion: `mpp` Meter je Pixel, Rasterecke bei (x0, y0). */
const proj = (mpp: number, x0: number, y0: number) => (p: Lv95) => ({ x: x0 + (p.e - R.e) / mpp, y: y0 + (R.n - p.n) / mpp });
const seite = (k: ReturnType<typeof koepfe>, s: string) => k.filter((x) => x.seite === s);

describe('Köpfe rundum', () => {
  it('Raster ganz im Bild: alle Köpfe aussen am Rahmen, Name über der Ecke; ausserhalb: keine Köpfe', () => {
    // 2 m/px → Raster 840 × 600 px ab (100, 100), Bereich 1200 × 900
    const k = koepfe(R, proj(2, 100, 100), B, M);
    expect(seite(k, 'oben').map((x) => x.text)).toEqual(Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, '0')));
    expect(seite(k, 'unten')).toHaveLength(21);
    expect(seite(k, 'links').map((x) => x.text).join('')).toBe('ABCDEFGHIJKLMNO');
    expect(seite(k, 'rechts')).toHaveLength(15);
    expect(seite(k, 'oben')[0]).toMatchObject({ y: 100 - 24, x: 100 + 20 - 36 / 2, w: 36 });
    expect(seite(k, 'unten')[0].y).toBe(700);
    expect(seite(k, 'links')[0]).toMatchObject({ x: 76, y: 100 + 20 - 12 });
    expect(seite(k, 'rechts')[0].x).toBe(940);
    expect(seite(k, 'name')[0]).toMatchObject({ text: 'Grande', x: 76 });
    expect(koepfe(R, proj(2, 2000, 100), B, M).filter((x) => x.seite !== 'name')).toHaveLength(0);
  });

  it('herangezoomt: Köpfe am Rand angeheftet, nur sichtbare Zellen; weit weg: nur jede k-te, ganz klein keine', () => {
    // 0.5 m/px → Zelle 160 px; Ecke weit oben links ausserhalb, Bereich zeigt Zellen um H 09
    const k = koepfe(R, proj(0.5, -1200, -1000), { links: 0, oben: 50, rechts: 800, unten: 650 }, M);
    const oben = seite(k, 'oben');
    expect(oben.every((x) => x.y === 50)).toBe(true);
    expect(seite(k, 'unten').every((x) => x.y === 650 - 24)).toBe(true);
    expect(seite(k, 'links').every((x) => x.x === 0)).toBe(true);
    expect(seite(k, 'rechts').every((x) => x.x === 800 - 24)).toBe(true);
    // sichtbar sind Spalten 08–12 (x 1120…1920 px ab Ecke) und Zeilen G–J
    expect(oben.map((x) => x.text)).toEqual(['09', '10', '11', '12']);
    expect(seite(k, 'links').map((x) => x.text)).toEqual(['H', 'I', 'J']);
    expect(seite(k, 'name')).toMatchObject([{ text: 'Grande', x: 24, y: 50 + 24 }]); // in die freie Ecke geschoben

    const weit = koepfe(R, proj(8, 100, 100), B, M); // Zelle 10 px
    expect(seite(weit, 'oben').map((x) => x.text).slice(0, 3)).toEqual(['01', '05', '09']);
    expect(seite(weit, 'links').map((x) => x.text).slice(0, 3)).toEqual(['A', 'D', 'G']);
    expect(koepfe(R, proj(100, 100, 100), B, M)).toEqual([]);
  });
});
