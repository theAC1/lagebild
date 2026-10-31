import { describe, expect, it } from 'vitest';
import { alsEndpunkt, aufloesen, ausSchluessel, gleich, ICH, ladeMessungen, messe, rbLabel, schluessel, type Quellen } from './logik.ts';

const bern = { lat: 46.94664, lon: 7.44434 };
const nord = { lat: 46.95664, lon: 7.44434 }; // ~1.11 km nördlich

describe('rbLabel', () => {
  it('formatiert Distanz, Grad (3-stellig) und Promille; Rückazimut ~180° gegenüber', () => {
    expect(rbLabel({ m: 1240, grad: 47 })).toBe('1.24 km · 047° · 0836 ‰');
    expect(rbLabel({ m: 850, grad: 359.7 })).toBe('850 m · 000° · 6395 ‰');
    const r = messe(bern, nord);
    expect(r.grad).toBeCloseTo(0, 3);
    expect(r.rueck).toBeCloseTo(180, 3);
    expect(r.m).toBeGreaterThan(1100);
    expect(r.m).toBeLessThan(1120);
  });
});

describe('Endpunkte', () => {
  const q: Quellen = {
    ich: bern,
    teilnehmer: (id) => (id === 't1' ? nord : null),
    marker: () => null,
    sichtung: () => null,
  };
  it('löst ich, Teilnehmer, Punkt auf, Unbekanntes → null; Schlüssel ist umkehrbar', () => {
    expect(aufloesen(ICH, q)).toEqual(bern);
    expect(aufloesen({ art: 'teilnehmer', id: 't1' }, q)).toEqual(nord);
    expect(aufloesen({ art: 'marker', id: 'x' }, q)).toBeNull();
    expect(aufloesen({ art: 'punkt', punkt: nord }, q)).toEqual(nord);
    for (const e of [ICH, { art: 'marker', id: 'a:b' } as const, { art: 'punkt', punkt: bern } as const]) expect(ausSchluessel(schluessel(e))).toEqual(e);
    expect(gleich(ICH, { art: 'ich' })).toBe(true);
  });
  it('verwirft ungültige Eingaben', () => {
    expect(alsEndpunkt({ art: 'punkt', punkt: { lat: 95, lon: 7 } })).toBeNull();
    expect(alsEndpunkt({ art: 'teilnehmer' })).toBeNull();
    expect(alsEndpunkt('ich')).toBeNull();
    expect(ladeMessungen('kaputt')).toEqual([]);
    expect(ladeMessungen(JSON.stringify([{ id: '1', a: ICH, b: { art: 'x' } }, { id: '2', a: ICH, b: { art: 'marker', id: 'm' } }]))).toEqual([
      { id: '2', a: ICH, b: { art: 'marker', id: 'm' } },
    ]);
  });
});
