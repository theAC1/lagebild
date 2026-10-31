import { describe, expect, it } from 'vitest';
import { STANDARD_STATUS, StatusDef } from '../../../../shared/protocol.ts';
import { dateiname, leseCodes, pruefeStatusSet, slug, statusSetAus } from './logik.ts';

describe('Status-Set bearbeiten', () => {
  it('slug passt auf StatusDef.key; statusSetAus behält Keys und macht neue eindeutig', () => {
    expect(slug('Auftrag erfüllt!')).toBe('auftrag-erfuellt');
    expect(slug('  Übergabe / Größe  ')).toBe('uebergabe-groesse');
    expect(slug('!!!')).toBe('status');
    const lang = slug('a'.repeat(20) + ' ' + 'b'.repeat(20));
    expect(lang.length).toBeLessThanOrEqual(32);
    expect(lang.endsWith('-')).toBe(false);
    for (const l of ['Auftrag erfüllt!', 'x'.repeat(50), '---']) expect(StatusDef.shape.key.safeParse(slug(l)).success, l).toBe(true);
    const set = statusSetAus([
      { key: 'bereit', label: ' Bereit (neu) ', farbe: '#AABBCC' },
      { key: null, label: 'Bereit', farbe: '#000000' },
      { key: null, label: 'Bereit', farbe: '#000000' },
      { key: null, label: 'Halt', farbe: '#000000' },
    ]);
    expect(set.map((s) => s.key)).toEqual(['bereit', 'bereit-2', 'bereit-3', 'halt']);
    expect(set[0]).toEqual({ key: 'bereit', label: 'Bereit (neu)', farbe: '#aabbcc' });
  });
  it('pruefeStatusSet: Standard ok, leer/ohne Bezeichnung/über 20 abgelehnt', () => {
    expect(pruefeStatusSet(STANDARD_STATUS)).toBeNull();
    expect(pruefeStatusSet([])).toMatch(/Mindestens/);
    expect(pruefeStatusSet([{ key: 'a', label: '', farbe: '#000000' }])).toMatch(/Bezeichnung/);
    const viele = Array.from({ length: 21 }, (_, i) => ({ key: `s${i}`, label: `S${i}`, farbe: '#000000' }));
    expect(pruefeStatusSet(viele)).toMatch(/20/);
    expect(pruefeStatusSet(viele.slice(0, 20))).toBeNull();
  });
});

describe('Speicher und Download', () => {
  it('leseCodes fehlertolerant; dateiname aus Content-Disposition ohne Pfadanteile, sonst Rückfall', () => {
    expect(leseCodes('{"teilnehmerCode":"ABC23456","beobachterCode":"x"}')).toEqual({ teilnehmerCode: 'ABC23456', gruppenfuehrerCode: undefined, beobachterCode: undefined });
    expect(leseCodes('{"leitungCode":"ABCDE23456"}').gruppenfuehrerCode).toBe('ABCDE23456'); // vor Spec v7 gemerkt
    expect(leseCodes('kaputt')).toEqual({});
    expect(dateiname('attachment; filename="lage-123.gpx"', 'x.gpx')).toBe('lage-123.gpx');
    expect(dateiname(null, 'x.gpx')).toBe('x.gpx');
    expect(dateiname('attachment; filename="../a/b.gpx"', 'x')).toBe('.._a_b.gpx');
  });
});
