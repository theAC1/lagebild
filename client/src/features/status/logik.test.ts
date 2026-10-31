import { describe, expect, it } from 'vitest';
import { meldungText, textFarbeAuf } from './logik.ts';

describe('Status-Anzeige', () => {
  it('Schriftfarbe nach Kontrast: dunkel auf Gelb/Weiss, hell auf Grün/Rot/Grau', () => {
    expect(textFarbeAuf('#f9a825')).toBe('#161b1f');
    expect(textFarbeAuf('#FFFFFF')).toBe('#161b1f');
    expect(textFarbeAuf('#2e7d32')).toBe('#ffffff');
    expect(textFarbeAuf('#c62828')).toBe('#ffffff');
    expect(textFarbeAuf('#424242')).toBe('#ffffff');
  });
  it('meldungText setzt Rufname, Status und Text zusammen, ohne beides «Meldung»', () => {
    expect(meldungText('Alpha', 'Halt', 'Brücke gesperrt')).toBe('Alpha: Halt – Brücke gesperrt');
    expect(meldungText('Alpha', null, 'Funkcheck')).toBe('Alpha: Funkcheck');
    expect(meldungText('Alpha', 'Bereit', '')).toBe('Alpha: Bereit');
    expect(meldungText('Alpha', null, '')).toBe('Alpha: Meldung');
  });
});
