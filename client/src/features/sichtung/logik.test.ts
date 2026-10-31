import { describe, expect, it } from 'vitest';
import { SichtungInput } from '../../../../shared/protocol.ts';
import { felderAus, STANDARD_WAHL, vonMir, zielMasse } from './logik.ts';

describe('zielMasse', () => {
  it('verkleinert die längere Seite auf 1600 px, vergrössert nie, bleibt ≥ 1 px', () => {
    expect(zielMasse(4032, 3024)).toEqual({ breite: 1600, hoehe: 1200 });
    expect(zielMasse(3024, 4032)).toEqual({ breite: 1200, hoehe: 1600 });
    expect(zielMasse(800, 600)).toEqual({ breite: 800, hoehe: 600 });
    expect(zielMasse(100_000, 10)).toEqual({ breite: 1600, hoehe: 1 });
  });
});

describe('vonMir', () => {
  it('ohne eigene Position null, sonst Distanz und Richtung', () => {
    expect(vonMir(null, { lat: 46.9, lon: 7.4 })).toBeNull();
    expect(vonMir({ lat: 46.9, lon: 7.4 }, { lat: 46.909, lon: 7.4 })).toBe('1.00 km · 000° / 0000 ‰');
  });
});

describe('felderAus (Chips → SichtungInput)', () => {
  const start = Date.UTC(2026, 9, 29, 13, 0);

  it('Vorgaben sofort gültig; Art/Grösse/Seite bilden das Zeichen, Richtung nur bei «bewegt sich», Ausrüstung geordnet, Zeit zurückgerechnet', () => {
    const f = felderAus(STANDARD_WAHL, start);
    expect(f).toEqual({ sidc: '10061000000000000000', groesse: '', taetigkeit: '', ausruestung: '', zeit: start, vertrauen: 'wahrscheinlich' });
    expect(SichtungInput.safeParse({ ...f, lat: 46.9, lon: 7.4, einheit: '', bemerkung: '', fotoId: null }).success).toBe(true);
    // Art, Grösse und Seite bilden das Zeichen; Richtung nur bei «bewegt sich»; Ausrüstung in fester Reihenfolge; Zeit zurückgerechnet
    const g = felderAus(
      { ...STANDARD_WAHL, art: 'spz', seite: 'unbekannt', groesse: 'zug', taetigkeit: 'bewegt sich', richtung: 'NO', ausruestung: ['Panzerabwehr', 'Mg'], vorMin: 15, vertrauen: 'bestaetigt' },
      start,
    );
    expect(g.sidc).toBe('10011000141211020000'); // Unbekannt, Zug, mech. Infanterie
    expect(g.groesse).toBe('Zug (~30)');
    expect(g.taetigkeit).toBe('bewegt sich Richtung NO');
    expect(g.ausruestung).toBe('Mg, Panzerabwehr');
    expect(g.zeit).toBe(start - 15 * 60_000);
    expect(g.vertrauen).toBe('bestaetigt');
    const rad = felderAus({ ...STANDARD_WAHL, art: 'rad', groesse: 'gruppe' }, start);
    expect(rad.sidc).toBe('10061500321401000000'); // Ausrüstungs-Zeichen mit Mobilität Räder; Grösse nur als Text
    expect(rad.groesse).toBe('Gruppe (~10)');
    expect(felderAus({ ...STANDARD_WAHL, taetigkeit: 'in Stellung', richtung: 'S' }, start).taetigkeit).toBe('in Stellung');
    expect(felderAus({ ...STANDARD_WAHL, taetigkeit: 'bewegt sich' }, start).taetigkeit).toBe('bewegt sich');
  });
});

