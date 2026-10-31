// Migration der Bestandslagen auf Phasen (Spec v6): offen → LV, beendet → LV bis zum Beenden, danach AN; neue Lagen unverändert.
import { expect, it } from 'vitest';
import { STANDARD_STATUS, type Lage } from '../../shared/protocol.ts';
import { mitPhasen } from '../src/db.ts';

const alt = (beendetAm: number | null) => ({ id: 'L', name: 'Alt', statusSet: STANDARD_STATUS, erstelltAm: 100, beendetAm }) as unknown as Lage;

it('mitPhasen: offen → LV seit Erstellung, beendet → LV bis zum Beenden, dann AN; Lage mit Phasen bleibt', () => {
  expect(mitPhasen(alt(null))).toEqual({ id: 'L', name: 'Alt', statusSet: STANDARD_STATUS, erstelltAm: 100, phasen: [{ phase: 'lv', t: 100 }] });
  expect(mitPhasen(alt(900)).phasen).toEqual([{ phase: 'lv', t: 100 }, { phase: 'an', t: 900 }]);
  const l = { ...alt(null), phasen: [{ phase: 'ap' as const, t: 5 }] };
  expect(mitPhasen(l)).toBe(l);
});
