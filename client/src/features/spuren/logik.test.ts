import { describe, expect, it } from 'vitest';
import type { Position } from '../../../../shared/protocol.ts';
import { anhaengen, spurLinien, zusammenfuehren } from './logik.ts';

const p = (t: number, lon = 7 + t / 1e6): Position => ({ lat: 46.9, lon, alt: null, ce: null, kurs: null, tempo: null, t });

describe('Spuren im Client', () => {
  it('anhaengen: neuere Punkte dazu, Duplikate und ältere ignoriert, Punkte vor dem Zeitfenster abgeschnitten, ohne Mutation', () => {
    const a = [p(1), p(2)];
    const b = anhaengen(a, p(3));
    expect(b.map((x) => x.t)).toEqual([1, 2, 3]);
    expect(a).toHaveLength(2);
    expect(anhaengen(b, p(3))).toBe(b);
    expect(anhaengen(b, p(1))).toBe(b);
    expect(anhaengen(undefined, p(5))).toHaveLength(1);
    expect(anhaengen([p(1), p(2), p(3)], p(4), 3).map((x) => x.t)).toEqual([3, 4]);
    expect(anhaengen([p(1), p(2)], p(9), 5).map((x) => x.t)).toEqual([9]);
  });
  it('zusammenfuehren behält live angekommene Punkte, die neuer als die geladenen sind', () => {
    const neu = zusammenfuehren({ a: [p(1), p(2)] }, { a: [p(2), p(3)], b: [p(9)] });
    expect(neu.a.map((x) => x.t)).toEqual([1, 2, 3]);
    expect(neu.b.map((x) => x.t)).toEqual([9]);
  });
  it('spurLinien: alter und junger Teil mit gemeinsamem Übergangspunkt; Zeitfenster, unsichtbare und zu kurze Spuren weg', () => {
    const farbe = () => '#ff0000';
    const l = spurLinien({ a: [p(1), p(2), p(3), p(4)] }, ['a'], farbe, 0, 3);
    expect(l.map((f) => [f.properties.alt, f.geometry.coordinates.length])).toEqual([[true, 2], [false, 3]]);
    const s = { a: [p(1), p(5), p(6)], b: [p(5), p(6)], c: [p(6)] };
    const g = spurLinien(s, ['a', 'c'], farbe, 5, 0);
    expect(g).toHaveLength(1);
    expect(g[0].properties).toEqual({ id: 'a', farbe: '#ff0000', alt: false });
    expect(g[0].geometry.coordinates).toHaveLength(2);
    const alt = spurLinien({ a: [p(1), p(2)] }, ['a'], farbe, 0, 100);
    expect(alt).toHaveLength(1);
    expect(alt[0].properties.alt).toBe(true);
  });
});
