import { describe, expect, it } from 'vitest';
import { ClientMsg, type Marker } from '../../../../shared/protocol.ts';
import { versetze } from '../../lib/coords.ts';
import { zerlegeSidc } from '../../lib/symbol.ts';
import { darfAendern, filtereMarker, formatZeit, MARKER_STANDARD_SIDC, markerName, setzenNachricht, zaehle } from './logik.ts';

const bern = { lat: 46.94664, lon: 7.44434 };
const FEIND = '10061000001211000000';
const FREUND = '10031000001211000000';
const mk = (id: string, sidc: string, p: { lat: number; lon: number }, geaendertAm = 0): Marker => ({
  id, sidc, ...p, bezeichnung: '', notiz: '', von: 'a', erstelltAm: 0, geaendertAm,
});

describe('Marker-Logik', () => {
  it('Standard-SIDC ist Unbekannt, Land, gültig nach Vertrag', () => {
    expect(MARKER_STANDARD_SIDC).toMatch(/^\d{20}$/);
    expect(zerlegeSidc(MARKER_STANDARD_SIDC)).toMatchObject({ zugehoerigkeit: 'unbekannt', set: '10' });
  });

  it('Rechte: Ersteller oder Leitung', () => {
    expect(darfAendern({ von: 'a' }, 'a', false)).toBe(true);
    expect(darfAendern({ von: 'a' }, 'b', false)).toBe(false);
    expect(darfAendern({ von: 'a' }, 'b', true)).toBe(true);
    expect(darfAendern({ von: 'a' }, null, false)).toBe(false);
  });

  it('Name fällt auf die Funktion zurück', () => {
    expect(markerName({ bezeichnung: '  MG-Nest ', sidc: FEIND })).toBe('MG-Nest');
    expect(markerName({ bezeichnung: ' ', sidc: FEIND })).toBe('Infanterie');
  });

  it('filtert nach Zugehörigkeit und sortiert nach Distanz bzw. Änderung', () => {
    const nah = mk('nah', FEIND, versetze(bern, 100, 0), 1);
    const weit = mk('weit', FEIND, versetze(bern, 900, 0), 2);
    const freund = mk('fr', FREUND, bern, 3);
    const alle = [weit, freund, nah];
    expect(filtereMarker(alle, 'feind', bern).map((m) => m.id)).toEqual(['nah', 'weit']);
    expect(filtereMarker(alle, 'alle', null).map((m) => m.id)).toEqual(['fr', 'weit', 'nah']);
    expect(filtereMarker(alle, 'neutral', bern)).toEqual([]);
    expect(zaehle(alle)).toEqual({ alle: 3, feind: 2, freund: 1, neutral: 0, unbekannt: 0 });
  });

  it('setzenNachricht trimmt, kürzt und erfüllt den Vertrag', () => {
    const neu = setzenNachricht({ sidc: FEIND, ...bern, bezeichnung: '  Sperre  ', notiz: 'x'.repeat(600) });
    expect(ClientMsg.safeParse(neu).success).toBe(true);
    expect(neu).toMatchObject({ typ: 'marker.setzen', marker: { bezeichnung: 'Sperre' } });
    if (neu.typ !== 'marker.setzen') throw new Error();
    expect(neu.marker.notiz).toHaveLength(500);
    expect('id' in neu.marker).toBe(false);
    const alt = setzenNachricht({ id: 'm1', sidc: FEIND, ...bern, bezeichnung: '', notiz: '' });
    expect(ClientMsg.safeParse(alt).success).toBe(true);
    expect(alt).toMatchObject({ marker: { id: 'm1' } });
  });

  it('Zeit: heute nur Uhrzeit, sonst mit Datum', () => {
    const jetzt = new Date(2026, 9, 28, 15, 0).getTime();
    expect(formatZeit(new Date(2026, 9, 28, 14, 5).getTime(), jetzt)).toBe('14:05');
    expect(formatZeit(new Date(2026, 9, 27, 9, 7).getTime(), jetzt)).toBe('27.10. 09:07');
  });
});
