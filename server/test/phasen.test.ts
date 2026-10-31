// Migration der Bestandslagen auf Phasen (Spec v6, Annahme: offen → LV, beendet → AN).
import { describe, expect, it } from 'vitest';
import { STANDARD_STATUS, type Lage } from '../../shared/protocol.ts';
import { mitPhasen } from '../src/db.ts';

const alt = (beendetAm: number | null) => ({ id: 'L', name: 'Alt', statusSet: STANDARD_STATUS, erstelltAm: 100, beendetAm }) as unknown as Lage;

describe('mitPhasen', () => {
  it('offene Lage: LV seit Erstellung', () => expect(mitPhasen(alt(null))).toEqual({ id: 'L', name: 'Alt', statusSet: STANDARD_STATUS, erstelltAm: 100, phasen: [{ phase: 'lv', t: 100 }] }));
  it('beendete Lage: LV bis zum Beenden, danach AN', () => expect(mitPhasen(alt(900)).phasen).toEqual([{ phase: 'lv', t: 100 }, { phase: 'an', t: 900 }]));
  it('neue Lage bleibt', () => {
    const l = { ...alt(null), phasen: [{ phase: 'ap' as const, t: 5 }] };
    expect(mitPhasen(l)).toBe(l);
  });
});
