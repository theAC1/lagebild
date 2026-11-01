// Zustandsübergänge und Eigenschaften der Regeln: deterministisch, Eingaben unverändert, Reihenfolge der Deltas.
import { describe, expect, it } from 'vitest';
import type { Chat, Position, ServerMsg } from '../protocol.ts';
import { anwenden, empfaengt, speicher, wende, type Ereignis } from './index.ts';
import { deltas, grund, LAGE, leereLage, tn, welt } from './testwelt.ts';

const pos = (t: number): Position => ({ lat: 47, lon: 8, alt: null, ce: 5, kurs: null, tempo: null, t });
/** Friert rekursiv ein: jede Mutation wirft (ES-Module laufen strikt). */
const einfrieren = <T>(x: T): T => {
  if (x && typeof x === 'object') Object.values(Object.freeze(x)).forEach(einfrieren);
  return x;
};

describe('reine Funktion', () => {
  it('gleiche Eingabe → gleiches Ergebnis; Zustand und Ereignis bleiben unverändert', () => {
    const daten = einfrieren(leereLage(LAGE, [tn('ltg', 'leitung'), tn('a')]));
    const e = (): Ereignis => {
      let n = 0;
      return { autor: daten.teilnehmer[1], msg: { typ: 'alarm.ausloesen', art: 'kontakt', pos: pos(5) }, jetzt: 7000, neueId: () => `x${++n}` };
    };
    const r1 = wende(speicher(daten), e());
    expect(r1).toEqual(wende(speicher(daten), e()));
    if ('abgelehnt' in r1) throw new Error(r1.abgelehnt);
    const neu = anwenden(daten, r1.aenderungen);
    expect(neu).not.toBe(daten);
    expect(daten.eintraege.alarm).toBeUndefined();
    expect(neu.eintraege.alarm).toEqual([{ id: 'x1', art: 'kontakt', von: 'a', lat: 47, lon: 8, t: 7000, quittiertVon: [], aufgehobenAm: null }]);
    expect(neu.spuren).toEqual({ a: [pos(5)] });
  });
});

describe('Position und Alarm', () => {
  it('Emission Control: still ignoriert, ausser bei eigenem aktivem Alarm; Spur nur bei neuerem Fix', () => {
    const w = welt();
    w.tu('a', { typ: 'sendetPos', an: false });
    expect(w.tu('a', { typ: 'pos', pos: pos(1) })).toEqual({ aenderungen: [], deltas: [] });
    w.tu('a', { typ: 'alarm.ausloesen', art: 'notfall', pos: null });
    expect(deltas(w.tu('a', { typ: 'pos', pos: pos(2) }))).toEqual(['pos']);
    expect(deltas(w.tu('a', { typ: 'pos', pos: pos(2) }))).toEqual(['pos']); // Stillstand: verteilt, aber keine doppelte Spur
    expect(w.daten.spuren.a).toEqual([pos(2)]);
  });

  it('Positionsrate: schneller als 1 s je Teilnehmer still ignoriert; Ignoriertes zählt nicht', () => {
    let d = leereLage(LAGE, [tn('a'), tn('b', 'teilnehmer', { sendetPos: false })]);
    const sende = (id: string, jetzt: number) => {
      const r = wende(speicher(d), { autor: d.teilnehmer.find((t) => t.id === id)!, msg: { typ: 'pos', pos: pos(jetzt) }, jetzt, neueId: () => 'x' });
      if ('abgelehnt' in r) throw new Error(r.abgelehnt);
      d = anwenden(d, r.aenderungen);
      return r.deltas.length;
    };
    expect([sende('a', 5000), sende('a', 5999), sende('a', 6000), sende('b', 6000)]).toEqual([1, 0, 1, 0]);
    expect(d.posAm).toEqual({ a: 6000 }); // b sendet nicht (Emission Control) → keine Sperrzeit
  });

  it('ein neuer Alarm ersetzt den eigenen alten, in dieser Reihenfolge', () => {
    const w = welt();
    w.tu('a', { typ: 'alarm.ausloesen', art: 'notfall', pos: null });
    const r = w.tu('a', { typ: 'alarm.ausloesen', art: 'kontakt', pos: pos(3) });
    expect(deltas(r)).toEqual(['alarm', 'pos', 'alarm', 'meldung']);
    expect(w.daten.eintraege.alarm!.map((a) => [a.art, a.aufgehobenAm === null])).toEqual([['notfall', false], ['kontakt', true]]);
  });

  it('Status nur aus dem Set; der eigene entfernte bleibt gültig', () => {
    const w = welt();
    expect(grund(w.tu('a', { typ: 'status', status: 'gibtsnicht', text: '' }))).toBe('Unbekannter Status');
    expect(deltas(w.tu('a', { typ: 'status', status: 'halt', text: 'Alles gut' }))).toEqual(['teilnehmer', 'meldung']);
    expect(w.daten.eintraege.meldung!.at(-1)).toMatchObject({ von: 'a', status: 'halt', text: 'Alles gut' });
    w.tu('ltg', { typ: 'lage.statusSet', statusSet: [{ key: 'ok', label: 'OK', farbe: '#00ff00' }] });
    expect(grund(w.tu('a', { typ: 'status', status: 'halt', text: 'Brücke gesperrt' }))).toBeUndefined(); // eigener entfernter Status
    expect(grund(w.tu('b', { typ: 'status', status: 'halt', text: '' }))).toBe('Unbekannter Status'); // fremder entfernter nicht
  });
});

describe('Folgen über Module hinweg', () => {
  it('Bloodhound-Meldungen sehen Leitung, Empfänger und Auftraggeber (Gruppenführer), sonst niemand', () => {
    const w = welt(leereLage(LAGE, [tn('ltg', 'leitung'), tn('gf', 'gruppenfuehrer'), tn('a'), tn('b', 'teilnehmer', { einheit: 'Zug 2' })]));
    w.tu('gf', { typ: 'bloodhound.auftrag', an: 'a', ziel: { art: 'teilnehmer', id: 'b' } });
    const id = w.daten.eintraege.bloodhound![0].id;
    w.tu('a', { typ: 'bloodhound.beendet', id });
    const log = w.daten.eintraege.meldung!;
    expect(log.map((m) => m.nur)).toEqual([['a', 'gf'], ['a', 'gf']]);
    const sieht = log.map((meldung) => w.daten.teilnehmer.map((e) => empfaengt({ typ: 'meldung', meldung }, e)));
    expect(sieht).toEqual([[true, true, true, false], [true, true, true, false]]); // ltg, gf, a, b
  });

  it('Teilnehmer entfernen beendet Aufträge an ihn und auf ihn; teilnehmer.weg zuletzt', () => {
    const w = welt({ ...leereLage(LAGE, [tn('ltg', 'leitung'), tn('a'), tn('b'), tn('c')]) });
    w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'b', ziel: { art: 'punkt', punkt: { lat: 47, lon: 8 } } });
    w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'c', ziel: { art: 'teilnehmer', id: 'b' } });
    w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'a', ziel: { art: 'teilnehmer', id: 'c' } });
    const r = w.tu('ltg', { typ: 'teilnehmer.entfernen', id: 'b' });
    expect(deltas(r)).toEqual(['bloodhound', 'meldung', 'bloodhound', 'meldung', 'teilnehmer.weg']);
    expect(w.daten.eintraege.bloodhound!.map((a) => [a.an, a.ende])).toEqual([['b', 'aufgehoben'], ['c', 'aufgehoben'], ['a', null]]);
    expect(speicher(w.daten).teilnehmerAktiv('b')).toBe(false);
    expect(grund(w.tu('a', { typ: 'chat', an: { art: 'person', id: 'b' }, text: 'hallo' }))).toBe('Empfänger nicht gefunden');
  });

  it('Marker löschen hebt Aufträge mit diesem Ziel auf', () => {
    const w = welt();
    w.tu('a', { typ: 'marker.setzen', marker: { id: 'm1', sidc: '10031000001211000000', lat: 47, lon: 8, bezeichnung: '', notiz: '' } });
    w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'b', ziel: { art: 'marker', id: 'm1' } });
    expect(deltas(w.tu('a', { typ: 'marker.loeschen', id: 'm1' }))).toEqual(['bloodhound', 'meldung', 'marker.geloescht']);
    expect(w.daten.eintraege.bloodhound![0].ende).toBe('aufgehoben');
  });
});

describe('Sichtbarkeit beim Verteilen', () => {
  const ltg = tn('ltg', 'leitung', { einheit: 'Stab' });
  const a = tn('a');
  const b = tn('b', 'teilnehmer', { einheit: 'Zug 2' });
  const chat = (an: Chat['an']): ServerMsg => ({ typ: 'chat', chat: { id: 'c', von: 'a', an, text: 'x', t: 0 } });
  it('Chat nach Empfänger, Bloodhound-Linie an alle, Bloodhound-Meldung nur Leitung und Empfänger, Rest an alle', () => {
    expect([ltg, a, b].map((e) => empfaengt(chat({ art: 'einheit', einheit: 'Zug 2' }), e))).toEqual([false, true, true]);
    expect([ltg, a, b].map((e) => empfaengt(chat({ art: 'person', id: 'ltg' }), e))).toEqual([true, true, false]);
    const auftrag: ServerMsg = { typ: 'bloodhound', auftrag: { id: 'h', von: 'ltg', an: 'b', ziel: { art: 'punkt', punkt: { lat: 0, lon: 0 } }, erstelltAm: 0, quittiertAm: null, ende: null, endeAm: null } };
    expect([ltg, a, b].map((e) => empfaengt(auftrag, e))).toEqual([true, true, true]);
    const meldung = (nur?: string[]): ServerMsg => ({ typ: 'meldung', meldung: { id: 'm', von: 'ltg', status: null, text: 'x', t: 0, nur } });
    expect([ltg, a, b].map((e) => empfaengt(meldung(['b']), e))).toEqual([true, false, true]);
    expect([ltg, a, b].map((e) => empfaengt(meldung(), e))).toEqual([true, true, true]);
    expect(empfaengt({ typ: 'marker.geloescht', id: 'm' }, b)).toBe(true);
  });
});
