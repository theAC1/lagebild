import { describe, expect, it } from 'vitest';
import type { Marker, Position, ProtokollEintrag } from '../../../../shared/protocol.ts';
import { dauer, Falter, lvFenster, posBei, versatzAus, zeitAus } from './logik.ts';

const mk = (id: string, bezeichnung = ''): Marker => ({ id, sidc: '10031000001211000000', lat: 47, lon: 8, bezeichnung, notiz: '', von: 'a', erstelltAm: 0, geaendertAm: 0 });
const e = (t: number, d: ProtokollEintrag['d'], von = 'a'): ProtokollEintrag => ({ t, von, d });
const p = (t: number): Position => ({ lat: 47, lon: 8 + t / 1e6, alt: null, ce: null, kurs: null, tempo: null, t });

describe('LV-Fenster und Zeitleiste', () => {
  // AP 0–100, LV 100–200, AP 200–500, LV 500–600, AN ab 600
  const phasen = [{ phase: 'ap' as const, t: 0 }, { phase: 'lv' as const, t: 100 }, { phase: 'ap' as const, t: 200 }, { phase: 'lv' as const, t: 500 }, { phase: 'an' as const, t: 600 }];
  const f = lvFenster(phasen, 1000);

  it('nur LV-Zeiträume, offenes LV endet jetzt; Versatz ↔ Zeit überspringt AP-Abschnitte', () => {
    expect(f).toEqual([{ von: 100, bis: 200 }, { von: 500, bis: 600 }]);
    expect(lvFenster([{ phase: 'lv', t: 10 }], 50)).toEqual([{ von: 10, bis: 50 }]);
    expect(dauer(f)).toBe(200);
    // Versatz ↔ Zeit überspringt AP-Abschnitte
    expect(zeitAus(f, 0)).toBe(100);
    expect(zeitAus(f, 100)).toBe(200);
    expect(zeitAus(f, 101)).toBe(501);
    expect(zeitAus(f, 999)).toBe(600);
    expect(versatzAus(f, 150)).toBe(50);
    expect(versatzAus(f, 300)).toBe(100); // in der AP-Lücke: Naht
    expect(versatzAus(f, 550)).toBe(150);
    expect(versatzAus(f, 5)).toBe(0);
  });
});

describe('Falter', () => {
  const ereignisse = [
    e(10, { typ: 'marker', marker: mk('m1', 'Brücke') }),
    e(20, { typ: 'marker', marker: mk('m1', 'Brücke Nord') }),
    e(30, { typ: 'marker.geloescht', id: 'm1' }),
    e(40, { typ: 'chat', chat: { id: 'c1', von: 'a', an: { art: 'alle' }, text: 'x', t: 40 } }),
  ];

  it('Stand zum Zeitpunkt, vor und zurück; Version ändert sich nur mit neuen Ereignissen', () => {
    const fa = new Falter(ereignisse, []);
    expect(fa.stand(5).marker.size).toBe(0);
    expect(fa.stand(25).marker.get('m1')?.bezeichnung).toBe('Brücke Nord');
    expect(fa.stand(35).marker.size).toBe(0);
    expect(fa.stand(45).chat).toHaveLength(1);
    expect(fa.stand(15).marker.get('m1')?.bezeichnung).toBe('Brücke'); // zurückspulen
    expect(fa.stand(15).chat).toHaveLength(0);
    const v = fa.stand(11).version;
    expect(fa.stand(12).version).toBe(v);
    expect(fa.stand(21).version).not.toBe(v);
  });
});

describe('posBei', () => {
  it('letzte Position bis zum Zeitpunkt', () => {
    const s = [p(10), p(20), p(30)];
    expect(posBei(s, 5)).toBeNull();
    expect(posBei(s, 20)?.t).toBe(20);
    expect(posBei(s, 29)?.t).toBe(20);
    expect(posBei(s, 99)?.t).toBe(30);
    expect(posBei(undefined, 99)).toBeNull();
  });
});
