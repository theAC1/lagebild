import { describe, expect, it } from 'vitest';
import { STANDARD_STATUS, StatusDef } from '../../../../shared/protocol.ts';
import { dateiname, leseCodes, pruefeStatusSet, slug, statusSetAus, verschiebe, zugangsLink } from './logik.ts';

describe('slug', () => {
  it('passt auf StatusDef.key', () => {
    expect(slug('Auftrag erfüllt!')).toBe('auftrag-erfuellt');
    expect(slug('  Übergabe / Größe  ')).toBe('uebergabe-groesse');
    expect(slug('Café')).toBe('cafe');
    expect(slug('!!!')).toBe('status');
    const lang = slug('a'.repeat(20) + ' ' + 'b'.repeat(20));
    expect(lang.length).toBeLessThanOrEqual(32);
    expect(lang.endsWith('-')).toBe(false);
    for (const l of ['Auftrag erfüllt!', 'x'.repeat(50), '---']) expect(StatusDef.shape.key.safeParse(slug(l)).success).toBe(true);
  });
});

describe('statusSetAus', () => {
  it('behält bestehende Keys und macht neue eindeutig', () => {
    const set = statusSetAus([
      { key: 'bereit', label: ' Bereit (neu) ', farbe: '#AABBCC' },
      { key: null, label: 'Bereit', farbe: '#000000' },
      { key: null, label: 'Bereit', farbe: '#000000' },
      { key: null, label: 'Halt', farbe: '#000000' },
    ]);
    expect(set.map((s) => s.key)).toEqual(['bereit', 'bereit-2', 'bereit-3', 'halt']);
    expect(set[0]).toEqual({ key: 'bereit', label: 'Bereit (neu)', farbe: '#aabbcc' });
  });
});

describe('pruefeStatusSet', () => {
  it('akzeptiert den Standard und lehnt leere/zu grosse Sets ab', () => {
    expect(pruefeStatusSet(STANDARD_STATUS)).toBeNull();
    expect(pruefeStatusSet([])).toMatch(/Mindestens/);
    expect(pruefeStatusSet([{ key: 'a', label: '', farbe: '#000000' }])).toMatch(/Bezeichnung/);
    const viele = Array.from({ length: 21 }, (_, i) => ({ key: `s${i}`, label: `S${i}`, farbe: '#000000' }));
    expect(pruefeStatusSet(viele)).toMatch(/20/);
  });
});

describe('Zugang und Codes', () => {
  it('baut den Teilnehmer-Link', () => {
    expect(zugangsLink('https://lage.arvuna.ch', 'ABC23456')).toBe('https://lage.arvuna.ch/?code=ABC23456');
  });
  it('liest gemerkte Codes fehlertolerant', () => {
    expect(leseCodes('{"teilnehmerCode":"ABC23456","leitungCode":"x"}')).toEqual({ teilnehmerCode: 'ABC23456', leitungCode: undefined });
    expect(leseCodes('kaputt')).toEqual({});
    expect(leseCodes(null)).toEqual({ teilnehmerCode: undefined, leitungCode: undefined });
  });
});

describe('dateiname', () => {
  it('liest Content-Disposition, sonst Rückfall', () => {
    expect(dateiname('attachment; filename="lage-123.gpx"', 'x.gpx')).toBe('lage-123.gpx');
    expect(dateiname(null, 'x.gpx')).toBe('x.gpx');
    expect(dateiname('attachment; filename="../a/b.gpx"', 'x')).toBe('.._a_b.gpx');
  });
});

describe('verschiebe', () => {
  it('tauscht Nachbarn ohne Mutation, Ränder bleiben', () => {
    const a = [1, 2, 3];
    expect(verschiebe(a, 0, 1)).toEqual([2, 1, 3]);
    expect(verschiebe(a, 0, -1)).toEqual([1, 2, 3]);
    expect(a).toEqual([1, 2, 3]);
  });
});
