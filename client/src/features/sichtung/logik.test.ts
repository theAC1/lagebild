import { describe, expect, it } from 'vitest';
import type { Sichtung } from '../../../../shared/protocol.ts';
import { ausDatetimeLocal, formatZeit, neuesteZuerst, vonMir, zielMasse, zuDatetimeLocal } from './logik.ts';

describe('zielMasse', () => {
  it('verkleinert die längere Seite auf 1600 px', () => {
    expect(zielMasse(4032, 3024)).toEqual({ breite: 1600, hoehe: 1200 });
    expect(zielMasse(3024, 4032)).toEqual({ breite: 1200, hoehe: 1600 });
  });
  it('vergrössert nie', () => {
    expect(zielMasse(800, 600)).toEqual({ breite: 800, hoehe: 600 });
  });
  it('bleibt bei extremen Formaten ≥ 1 px', () => {
    expect(zielMasse(100_000, 10)).toEqual({ breite: 1600, hoehe: 1 });
  });
});

describe('datetime-local', () => {
  it('Hin und zurück auf die Minute genau', () => {
    const t = new Date(2026, 9, 28, 14, 5, 33).getTime();
    expect(zuDatetimeLocal(t)).toBe('2026-10-28T14:05');
    expect(ausDatetimeLocal(zuDatetimeLocal(t))).toBe(new Date(2026, 9, 28, 14, 5).getTime());
  });
  it('leer oder ungültig → null', () => {
    expect(ausDatetimeLocal('')).toBeNull();
    expect(ausDatetimeLocal('gestern')).toBeNull();
  });
});

describe('formatZeit', () => {
  const heute = new Date(2026, 9, 28, 18, 0).getTime();
  it('heute nur Uhrzeit, sonst mit Datum', () => {
    expect(formatZeit(new Date(2026, 9, 28, 9, 7).getTime(), heute)).toBe('09:07');
    expect(formatZeit(new Date(2026, 9, 27, 23, 59).getTime(), heute)).toBe('27.10. 23:59');
  });
});

describe('vonMir', () => {
  it('ohne eigene Position null', () => {
    expect(vonMir(null, { lat: 46.9, lon: 7.4 })).toBeNull();
  });
  it('Distanz und Richtung nach Norden', () => {
    expect(vonMir({ lat: 46.9, lon: 7.4 }, { lat: 46.909, lon: 7.4 })).toBe('1.00 km · 000° / 0000 ‰');
  });
});

describe('neuesteZuerst', () => {
  it('sortiert nach erstelltAm absteigend, ohne die Quelle zu ändern', () => {
    const s = (id: string, erstelltAm: number) => ({ id, erstelltAm }) as Sichtung;
    const quelle = [s('a', 1), s('c', 3), s('b', 2)];
    expect(neuesteZuerst(quelle).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(quelle.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
});
