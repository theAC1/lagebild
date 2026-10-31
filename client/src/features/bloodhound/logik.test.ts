import { describe, expect, it } from 'vitest';
import { ERREICHT_M, ErreichtWaechter, istErsetzt, formatRestzeit, ladeLokal, naechsterTempo, restzeitS, stufe, type TempoZustand } from './logik.ts';

// 1 m Nord ≈ 1/111195 Grad
const lauf = (schritte: number, mProS: number): TempoZustand => {
  let z: TempoZustand | null = null;
  for (let i = 0; i <= schritte; i++) z = naechsterTempo(z, { lat: 47 + (i * mProS * 2) / 111_195, lon: 8, t: 1_000_000 + i * 2000 });
  return z!;
};

describe('Geschwindigkeit glätten', () => {
  it('erste Position unbekannt; gleichmässiges Tempo; Ausreisser geglättet; Stillstand unter der Schwelle; Folgen/Zeitstempel/ungenaue Fixe zählen nicht; Lücke beginnt neu', () => {
    expect(naechsterTempo(null, { lat: 47, lon: 8, t: 0 }).v).toBeNull();
    expect(lauf(5, 1.5).v).toBeCloseTo(1.5, 1);
    const z = lauf(5, 1.5);
    const sprung = naechsterTempo(z, { lat: z.lat + 30 / 111_195, lon: z.lon, t: z.t + 2000 }); // 15 m/s roh
    expect(sprung.v!).toBeGreaterThan(1.5);
    expect(sprung.v!).toBeLessThan(6);
    expect(lauf(5, 0.05).v!).toBeLessThan(0.3);
    // zu schnelle Folgen, gleiche Zeitstempel und ungenaue Fixe zählen nicht; Lücke > 180 s oder Zeitsprung zurück beginnt neu
    expect(naechsterTempo(z, { lat: 48, lon: 8, t: z.t + 200 })).toBe(z);
    expect(naechsterTempo(z, { lat: 48, lon: 8, t: z.t })).toBe(z);
    expect(naechsterTempo(z, { lat: 48, lon: 8, t: z.t + 2000, ce: 500 })).toBe(z);
    expect(naechsterTempo(z, { lat: 47.5, lon: 8, t: z.t + 400_000 }).v).toBeNull();
    expect(naechsterTempo(z, { lat: 47, lon: 8, t: z.t - 5000 }).v).toBeNull();
  });
});

describe('Restzeit und Farbstufen', () => {
  it('Distanz durch Tempo, unter 0.3 m/s unbekannt; Format m:ss bzw. h:mm:ss', () => {
    expect(restzeitS(300, 1.5)).toBe(200);
    expect(restzeitS(300, null)).toBeNull();
    expect(restzeitS(300, 0.29)).toBeNull();
    expect(restzeitS(300, 0.3)).toBe(1000);
    expect(formatRestzeit(null)).toBe('—');
    expect(formatRestzeit(342)).toBe('5:42');
    expect(formatRestzeit(5)).toBe('0:05');
    expect(formatRestzeit(3930)).toBe('1:05:30');
  });
  it('Stufen an den Grenzen 360/180/60 s', () => {
    const faelle = [[null, 'neutral'], [360.5, 'neutral'], [360, 'gruen'], [181, 'gruen'], [180, 'gelb'], [61, 'gelb'], [60, 'rot'], [0, 'rot']] as const;
    for (const [s, erwartet] of faelle) expect(stufe(s), String(s)).toBe(erwartet);
  });
});

describe('Erreicht', () => {
  it('erst ab ≤ 25 m, nur einmal je Auftrag; misslungenes Senden zählt nicht, vergiss erlaubt neuen Start', () => {
    const w = new ErreichtWaechter();
    expect(w.pruefe('a', ERREICHT_M + 0.1)).toBe(false);
    expect(w.pruefe('a', null)).toBe(false);
    expect(w.pruefe('a', ERREICHT_M)).toBe(true);
    expect(w.pruefe('a', 5)).toBe(false);
    expect(w.pruefe('b', 5)).toBe(true);
    expect(w.pruefe('c', 10, false)).toBe(true);
    expect(w.pruefe('c', 10)).toBe(true);
    w.vergiss('c');
    expect(w.pruefe('c', 10)).toBe(true);
  });
});

describe('lokaler Zustand und Ersatz', () => {
  it('ladeLokal liest nur gültige Daten; ersetzt, wenn für dieselbe Person ein anderer offener Auftrag besteht', () => {
    expect(ladeLokal(JSON.stringify({ ziel: { art: 'marker', id: 'm1' }, auftragId: 'x' }))?.auftragId).toBe('x');
    expect(ladeLokal(JSON.stringify({ ziel: { art: 'marker' } }))).toBeNull();
    expect(ladeLokal('kaputt')).toBeNull();
    expect(ladeLokal(null)).toBeNull();
    const a = (id: string, an: string, ende: 'aufgehoben' | null) => ({ id, an, ende }) as never;
    const alt = a('1', 'p', 'aufgehoben');
    expect(istErsetzt([alt, a('2', 'p', null)], alt)).toBe(true);
    expect(istErsetzt([alt, a('2', 'q', null)], alt)).toBe(false);
    expect(istErsetzt([alt], alt)).toBe(false);
  });
});
