// Phasen AP/LV/AN (Spec v6) direkt gegen die Regeln.
import { describe, expect, it } from 'vitest';
import { phaseVon, type Lage, type Position } from '../protocol.ts';
import { deltas, grund, LAGE, leereLage, tn, welt } from './testwelt.ts';

const inPhase = (phase: Lage['phasen'][number]['phase']) =>
  welt(leereLage({ ...LAGE, phasen: [{ phase, t: 0 }] }, [tn('ltg', 'leitung'), tn('a'), tn('b', 'teilnehmer', { einheit: 'Zug 2' })]));
const pos: Position = { lat: 47, lon: 8, alt: null, ce: 5, kurs: null, tempo: null, t: 500 };
const marker = { typ: 'marker.setzen', marker: { sidc: '10031000001211000000', lat: 47, lon: 8, bezeichnung: '', notiz: '' } } as const;

describe('Phasen', () => {
  it('AP: planen ja; Position still verworfen; Status, Sichtung, Alarm, Bloodhound abgelehnt', () => {
    const w = inPhase('ap');
    expect(grund(w.tu('a', marker))).toBeUndefined();
    expect(grund(w.tu('a', { typ: 'chat', an: { art: 'alle' }, text: 'Plan' }))).toBeUndefined();
    expect(w.tu('a', { typ: 'pos', pos })).toEqual({ aenderungen: [], deltas: [] });
    expect(w.daten.spuren).toEqual({});
    const nein = 'In der Aktionsplanung nicht möglich';
    expect(grund(w.tu('a', { typ: 'status', status: 'halt', text: '' }))).toBe(nein);
    expect(grund(w.tu('a', { typ: 'alarm.ausloesen', art: 'notfall', pos: null }))).toBe(nein);
    expect(grund(w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'a', ziel: { art: 'punkt', punkt: { lat: 47, lon: 8 } } }))).toBe(nein);
    expect(grund(w.tu('a', { typ: 'notiz.neu', t: 0, text: 'x' }))).toBe(nein);
  });

  it('Wechsel nur durch die Leitung und nur AP↔LV↔AN', () => {
    const w = inPhase('ap');
    expect(grund(w.tu('a', { typ: 'lage.phase', phase: 'lv' }))).toBe('Nur für die Leitung');
    expect(grund(w.tu('ltg', { typ: 'lage.phase', phase: 'an' }))).toBe('Wechsel AP → AN nicht möglich');
    expect(deltas(w.tu('ltg', { typ: 'lage.phase', phase: 'lv' }))).toEqual(['lage', 'meldung']);
    expect(phaseVon(w.daten.lage)).toBe('lv');
    expect(grund(w.tu('ltg', { typ: 'lage.phase', phase: 'ap' }))).toBeUndefined();
    expect(grund(w.tu('ltg', { typ: 'lage.phase', phase: 'lv' }))).toBeUndefined();
    expect(grund(w.tu('ltg', { typ: 'lage.phase', phase: 'an' }))).toBeUndefined();
    expect(grund(w.tu('ltg', { typ: 'lage.phase', phase: 'ap' }))).toBe('Wechsel AN → AP nicht möglich');
    expect(w.daten.lage.phasen.map((p) => p.phase)).toEqual(['ap', 'lv', 'ap', 'lv', 'an']);
    expect(w.daten.eintraege.meldung!.at(-1)?.text).toBe('Phase: Aktionsnachbearbeitung');
  });

  it('LV verlassen hebt offene Alarme auf und beendet offene Aufträge', () => {
    const w = welt();
    w.tu('a', { typ: 'alarm.ausloesen', art: 'notfall', pos: null });
    w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'b', ziel: { art: 'punkt', punkt: { lat: 47, lon: 8 } } });
    expect(deltas(w.tu('ltg', { typ: 'lage.phase', phase: 'an' }))).toEqual(['alarm', 'bloodhound', 'meldung', 'lage', 'meldung']);
    expect(w.daten.eintraege.alarm![0].aufgehobenAm).not.toBeNull();
    expect(w.daten.eintraege.bloodhound![0].ende).toBe('aufgehoben');
  });

  it('AN: nur lesen ausser Notizen der Leitung; zurück nach LV', () => {
    const w = inPhase('an');
    expect(w.tu('a', { typ: 'pos', pos })).toEqual({ aenderungen: [], deltas: [] });
    expect(grund(w.tu('a', marker))).toBe('Nachbearbeitung: nur lesen');
    expect(grund(w.tu('a', { typ: 'chat', an: { art: 'alle' }, text: 'x' }))).toBe('Nachbearbeitung: nur lesen');
    expect(grund(w.tu('a', { typ: 'notiz.neu', t: 100, text: 'x' }))).toBe('Nur für die Leitung');
    expect(grund(w.tu('ltg', { typ: 'notiz.neu', t: 1e12, text: 'x' }))).toBe('Zeitpunkt liegt in der Zukunft');
    expect(deltas(w.tu('ltg', { typ: 'notiz.neu', t: 100, text: 'Hier zu spät abgesetzt' }))).toEqual(['notiz']);
    const id = w.daten.eintraege.notiz![0].id;
    expect(deltas(w.tu('ltg', { typ: 'notiz.loeschen', id }))).toEqual(['notiz.geloescht']);
    expect(grund(w.tu('ltg', { typ: 'lage.phase', phase: 'lv' }))).toBeUndefined();
    expect(grund(w.tu('ltg', { typ: 'notiz.neu', t: 100, text: 'x' }))).toBe('Notizen nur in der Nachbearbeitung');
  });
});
