import { describe, expect, it } from 'vitest';
import type { Sichtung } from '../../../../shared/protocol.ts';
import { SichtungInput } from '../../../../shared/protocol.ts';
import { felderAus, formatZeit, neuesteZuerst, STANDARD_WAHL, vonMir, zielMasse } from './logik.ts';

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

describe('felderAus (Chips → SichtungInput)', () => {
  const start = Date.UTC(2026, 9, 29, 13, 0);

  it('Vorgaben: Feind, unbekannt, jetzt, wahrscheinlich – sofort gültig', () => {
    const f = felderAus(STANDARD_WAHL, start);
    expect(f).toEqual({ sidc: '10061000000000000000', groesse: '', taetigkeit: '', ausruestung: '', zeit: start, vertrauen: 'wahrscheinlich' });
    const ok = SichtungInput.safeParse({ ...f, lat: 46.9, lon: 7.4, einheit: '', bemerkung: '', fotoId: null });
    expect(ok.success).toBe(true);
  });

  it('Art, Grösse und Seite bilden das Zeichen; Tätigkeit mit Richtung; Ausrüstung in fester Reihenfolge', () => {
    const f = felderAus(
      { ...STANDARD_WAHL, art: 'spz', seite: 'unbekannt', groesse: 'zug', taetigkeit: 'bewegt sich', richtung: 'NO', ausruestung: ['Panzerabwehr', 'Mg'], vorMin: 15, vertrauen: 'bestaetigt' },
      start,
    );
    expect(f.sidc).toBe('10011000141211020000'); // Unbekannt, Zug, mech. Infanterie
    expect(f.groesse).toBe('Zug (~30)');
    expect(f.taetigkeit).toBe('bewegt sich Richtung NO');
    expect(f.ausruestung).toBe('Mg, Panzerabwehr');
    expect(f.zeit).toBe(start - 15 * 60_000);
    expect(f.vertrauen).toBe('bestaetigt');
  });

  it('Rad-Fahrzeug: Ausrüstungs-Zeichen mit Mobilität Räder; Grösse nur als Text', () => {
    const f = felderAus({ ...STANDARD_WAHL, art: 'rad', groesse: 'gruppe' }, start);
    expect(f.sidc).toBe('10061500321401000000');
    expect(f.groesse).toBe('Gruppe (~10)');
  });

  it('Richtung zählt nur bei «bewegt sich»', () => {
    expect(felderAus({ ...STANDARD_WAHL, taetigkeit: 'in Stellung', richtung: 'S' }, start).taetigkeit).toBe('in Stellung');
    expect(felderAus({ ...STANDARD_WAHL, taetigkeit: 'bewegt sich' }, start).taetigkeit).toBe('bewegt sich');
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
