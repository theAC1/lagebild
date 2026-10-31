import { describe, expect, it } from 'vitest';
import type { Alarm } from '../../../../shared/protocol.ts';
import { aktive, alarmOrt, offeneFuer } from './logik.ts';

const alarm = (x: Partial<Alarm>): Alarm => ({ id: 'a', art: 'notfall', von: 'p1', lat: 46.9, lon: 7.4, t: 1, quittiertVon: [], aufgehobenAm: null, ...x });

describe('Alarm-Logik', () => {
  it('aktive: ohne aufgehobene, neueste zuerst; offen für mich: ohne eigene und ohne quittierte', () => {
    const liste = [
      alarm({ id: 'alt', t: 1 }),
      alarm({ id: 'neu', t: 5, von: 'p2' }),
      alarm({ id: 'weg', t: 9, aufgehobenAm: 10 }),
      alarm({ id: 'mein', t: 3, von: 'ich' }),
      alarm({ id: 'quitt', t: 4, quittiertVon: ['ich'] }),
    ];
    expect(aktive(liste).map((a) => a.id)).toEqual(['neu', 'quitt', 'mein', 'alt']);
    expect(offeneFuer(liste, 'ich').map((a) => a.id)).toEqual(['neu', 'alt']);
  });
  it('Ort: aktuelle Position, sonst Alarmort, sonst null', () => {
    expect(alarmOrt(alarm({}), { lat: 47, lon: 8 })).toEqual({ lat: 47, lon: 8 });
    expect(alarmOrt(alarm({}), null)).toEqual({ lat: 46.9, lon: 7.4 });
    expect(alarmOrt(alarm({ lat: null, lon: null }), undefined)).toBeNull();
  });
});
