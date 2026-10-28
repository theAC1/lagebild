import { describe, expect, it } from 'vitest';
import { STANDARD_STATUS, type Meldung } from '../../../../shared/protocol.ts';
import { formatZeit, meldungText, neuesteZuerst, textFarbeAuf } from './logik.ts';

describe('textFarbeAuf', () => {
  it('dunkle Schrift auf Gelb, helle auf Grün/Rot/Grau', () => {
    expect(textFarbeAuf('#f9a825')).toBe('#161b1f');
    expect(textFarbeAuf('#2e7d32')).toBe('#ffffff');
    expect(textFarbeAuf('#c62828')).toBe('#ffffff');
    expect(textFarbeAuf('#424242')).toBe('#ffffff');
    expect(textFarbeAuf('#FFFFFF')).toBe('#161b1f');
  });
  it('liefert für jeden Standardstatus eine gültige Farbe', () => {
    for (const s of STANDARD_STATUS) expect(textFarbeAuf(s.farbe)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('neuesteZuerst', () => {
  it('sortiert absteigend nach Zeit, ohne das Original zu ändern', () => {
    const m = (id: string, t: number): Meldung => ({ id, von: 'x', status: null, text: '', t });
    const alt = [m('a', 1), m('c', 3), m('b', 2)];
    expect(neuesteZuerst(alt).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(alt.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('formatZeit / meldungText', () => {
  it('Stunden:Minuten', () => {
    expect(formatZeit(new Date(2026, 9, 28, 9, 5).getTime())).toBe('09:05');
  });
  it('setzt Status und Text zusammen', () => {
    expect(meldungText('Alpha', 'Halt', 'Brücke gesperrt')).toBe('Alpha: Halt – Brücke gesperrt');
    expect(meldungText('Alpha', null, 'Funkcheck')).toBe('Alpha: Funkcheck');
    expect(meldungText('Alpha', 'Bereit', '')).toBe('Alpha: Bereit');
    expect(meldungText('Alpha', null, '')).toBe('Alpha: Meldung');
  });
});
