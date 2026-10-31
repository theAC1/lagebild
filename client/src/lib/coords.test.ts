import { describe, expect, it } from 'vitest';
import { azimut, distanz, formatDistanz, formatLv95, formatMgrs, formatRichtung, formatWgs84, kreis, promille, versetze, zuLv95 } from './coords.ts';
import { frischeAus, sollSenden } from './senden.ts';
import { OFFLINE_MS, STALE_MS, staleNachFuer } from '../../../shared/protocol.ts';
import { TEAM_FARBEN, teamFarbe, teamIndex } from './team.ts';

const bundeshaus = { lat: 46.94664, lon: 7.44434 };

describe('Koordinaten', () => {
  it('LV95 Bundeshaus = swisstopo REFRAME auf < 1 m, Format mit Hochkomma; MGRS 1 m/100 m, Polargebiet als Strich; WGS84 mit Hemisphären', () => {
    const { e, n } = zuLv95(bundeshaus);
    expect(Math.abs(e - 2600434.52)).toBeLessThan(1);
    expect(Math.abs(n - 1199506.09)).toBeLessThan(1);
    expect(formatLv95(bundeshaus)).toBe("2'600'435 / 1'199'506");
    expect(formatMgrs(bundeshaus)).toBe('32T LT 81613 00408');
    expect(formatMgrs(bundeshaus, 3)).toBe('32T LT 816 004');
    expect(formatMgrs({ lat: 89, lon: 0 })).toBe('–');
    expect(formatWgs84(bundeshaus)).toBe('N 46.94664° E 7.44434°');
    expect(formatWgs84({ lat: -1.5, lon: -2.25 })).toBe('S 1.50000° W 2.25000°');
  });
});

describe('Distanz, Azimut, Promille', () => {
  const nord = versetze(bundeshaus, 1000, 0);
  const ost = versetze(bundeshaus, 1000, 90);
  it('Nord 0°, Ost 90° = 1600 ‰, Westen 270° (nie negativ); Distanz passt zu versetze, Bern–Zürich ≈ 95 km; Kreis geschlossen mit Radius', () => {
    expect(azimut(bundeshaus, nord)).toBeCloseTo(0, 3);
    expect(azimut(bundeshaus, ost)).toBeCloseTo(90, 1);
    expect(azimut(nord, bundeshaus)).toBeCloseTo(180, 3);
    expect(azimut(bundeshaus, versetze(bundeshaus, 500, 270))).toBeCloseTo(270, 1);
    expect(promille(azimut(bundeshaus, ost))).toBeCloseTo(1600, 0);
    expect([promille(0), promille(360), promille(180), promille(-90)]).toEqual([0, 0, 3200, 4800]);
    expect(distanz(bundeshaus, nord)).toBeCloseTo(1000, 3);
    expect(distanz(bundeshaus, bundeshaus)).toBe(0);
    const d = distanz(bundeshaus, { lat: 47.378177, lon: 8.540192 });
    expect(d).toBeGreaterThan(94_000);
    expect(d).toBeLessThan(96_000);
    const ring = kreis(bundeshaus, 50, 12).geometry.coordinates[0]; // Kreis geschlossen, mit Radius
    expect(ring).toHaveLength(13);
    expect(ring[0]).toEqual(ring[12].map((x: number) => expect.closeTo(x, 9)));
    expect(distanz(bundeshaus, { lon: ring[3][0], lat: ring[3][1] })).toBeCloseTo(50, 3);
  });
  it('Formatierung: m unter 1 km, km mit Stellen nach Grösse; Grad dreistellig, 359.8° → 000° aber Promille feiner', () => {
    expect([849.6, 999.7, 1250, 9_996, 12_440].map(formatDistanz)).toEqual(['850 m', '1.00 km', '1.25 km', '10.0 km', '12.4 km']);
    expect(formatRichtung(45)).toBe('045° / 0800 ‰');
    expect(formatRichtung(359.8)).toBe('000° / 6396 ‰');
  });
});

describe('Senden und Frische', () => {
  const p = bundeshaus;
  const weit = versetze(p, 30, 0);
  it('sollSenden: erste sofort; nie öfter als 1/s; > 25 m Bewegung vor Intervallende; ruhig erst nach Intervall; erzwungen nach 1 s', () => {
    expect(sollSenden(0, p, null, 10_000)).toBe(true);
    expect(sollSenden(900, weit, { t: 0, pos: p }, 5000)).toBe(false);
    expect(sollSenden(1500, weit, { t: 0, pos: p }, 30_000)).toBe(true);
    expect(sollSenden(9000, p, { t: 0, pos: p }, 10_000)).toBe(false);
    expect(sollSenden(10_000, p, { t: 0, pos: p }, 10_000)).toBe(true);
    expect(sollSenden(1000, p, { t: 0, pos: p }, 30_000, true)).toBe(true);
    expect(sollSenden(500, p, { t: 0, pos: p }, 30_000, true)).toBe(false);
  });
  it('staleNach: 5-s-Sender graut nach 25 s aus, nie über 5 min; ohne staleNach gilt STALE_MS; offline sofort grau, Geist nach OFFLINE_MS', () => {
    const s = staleNachFuer(5000);
    expect(s).toBe(25_000);
    expect(staleNachFuer(600_000)).toBe(300_000);
    expect(frischeAus(24_000, true, s)).toBe('aktiv');
    expect(frischeAus(26_000, true, s)).toBe('stale');
    expect(frischeAus(STALE_MS - 1, true, undefined)).toBe('aktiv');
    expect(frischeAus(STALE_MS + 1, true, undefined)).toBe('stale');
    expect(frischeAus(0, false, 25_000)).toBe('stale');
    expect(frischeAus(OFFLINE_MS + 1, true, 25_000)).toBe('geist');
  });
});

describe('teamFarbe', () => {
  it('deterministisch ohne Gross/Klein und Leerraum, aus der Palette, typische Einheiten auf mehrere Farben verteilt', () => {
    expect(teamFarbe('Zug 2')).toBe(teamFarbe(' zug 2 '));
    expect(TEAM_FARBEN.map((t) => t.farbe)).toContain(teamFarbe('Zug 2'));
    const namen = ['Zug 1', 'Zug 2', 'Zug 3', 'KP', 'San', 'Aufkl', 'Gr 1', 'Gr 2', 'Gr 3', 'Leitung'];
    expect(new Set(namen.map(teamIndex)).size).toBeGreaterThanOrEqual(6);
  });
});
