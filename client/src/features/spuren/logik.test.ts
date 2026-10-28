import { describe, expect, it } from 'vitest';
import type { Position } from '../../../../shared/protocol.ts';
import { anhaengen, seitFuer, spurLinien, zusammenfuehren } from './logik.ts';

const p = (t: number, lon = 7 + t / 1e6): Position => ({ lat: 46.9, lon, alt: null, ce: null, kurs: null, tempo: null, t });

describe('seitFuer', () => {
  it('rechnet das Zeitfenster zurück, «alles» = 0', () => {
    expect(seitFuer('15m', 1_000_000)).toBe(1_000_000 - 900_000);
    expect(seitFuer('1h', 10_000_000)).toBe(10_000_000 - 3_600_000);
    expect(seitFuer('alle', 10_000_000)).toBe(0);
  });
});

describe('anhaengen', () => {
  it('hängt neuere Punkte an, ignoriert Duplikate und ältere, ohne zu mutieren', () => {
    const a = [p(1), p(2)];
    const b = anhaengen(a, p(3));
    expect(b.map((x) => x.t)).toEqual([1, 2, 3]);
    expect(a).toHaveLength(2);
    expect(anhaengen(b, p(3))).toBe(b);
    expect(anhaengen(b, p(1))).toBe(b);
    expect(anhaengen(undefined, p(5))).toHaveLength(1);
  });
  it('schneidet Punkte vor dem Zeitfenster ab (Speicher wächst nicht über die Lage)', () => {
    expect(anhaengen([p(1), p(2), p(3)], p(4), 3).map((x) => x.t)).toEqual([3, 4]);
    expect(anhaengen([p(1), p(2)], p(9), 5).map((x) => x.t)).toEqual([9]);
  });
});

describe('zusammenfuehren', () => {
  it('behält live angekommene Punkte, die neuer als die geladenen sind', () => {
    const neu = zusammenfuehren({ a: [p(1), p(2)] }, { a: [p(2), p(3)], b: [p(9)] });
    expect(neu.a.map((x) => x.t)).toEqual([1, 2, 3]);
    expect(neu.b.map((x) => x.t)).toEqual([9]);
  });
});

describe('spurLinien', () => {
  const farbe = () => '#ff0000';
  it('teilt in alten und jungen Teil mit gemeinsamem Übergangspunkt', () => {
    const l = spurLinien({ a: [p(1), p(2), p(3), p(4)] }, ['a'], farbe, 0, 3);
    expect(l.map((f) => [f.properties.alt, f.geometry.coordinates.length])).toEqual([
      [true, 2],
      [false, 3],
    ]);
  });
  it('filtert nach Zeitfenster und lässt unsichtbare und zu kurze Spuren weg', () => {
    const s = { a: [p(1), p(5), p(6)], b: [p(5), p(6)], c: [p(6)] };
    const l = spurLinien(s, ['a', 'c'], farbe, 5, 0);
    expect(l).toHaveLength(1);
    expect(l[0].properties).toEqual({ id: 'a', farbe: '#ff0000', alt: false });
    expect(l[0].geometry.coordinates).toHaveLength(2);
  });
  it('alles alt, wenn kein Punkt jünger als altVor', () => {
    const l = spurLinien({ a: [p(1), p(2)] }, ['a'], farbe, 0, 100);
    expect(l).toHaveLength(1);
    expect(l[0].properties.alt).toBe(true);
  });
});
