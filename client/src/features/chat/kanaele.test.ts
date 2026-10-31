import { describe, expect, it } from 'vitest';
import type { Chat, Teilnehmer } from '../../../../shared/protocol.ts';
import { kanaele, kanalVon, parseGelesen, startGelesen, uebersicht, zielAus } from './kanaele.ts';

const tn = (id: string, rufname: string, einheit: string): Teilnehmer => ({
  id, rufname, einheit, funktion: '', sidc: '10031000001211000000', rolle: 'teilnehmer', status: 'bereit', statusText: '', pos: null, sendetPos: true, online: true, zuletzt: 0,
});
let n = 0;
const msg = (von: string, an: Chat['an'], t: number): Chat => ({ id: String(++n), von, an, text: 'x', t });

const ich = 'a';
const teilnehmer = [tn('a', 'Adler', 'Zug 2'), tn('b', 'Bär', 'Zug 1'), tn('c', 'Chamäleon', 'Zug 2')];

describe('Kanäle', () => {
  it('kanalVon: Direktnachricht landet beim Gegenüber (egal wer schreibt), Einheit, Alle', () => {
    expect(kanalVon(msg('a', { art: 'person', id: 'b' }, 1), ich)).toBe('person:b');
    expect(kanalVon(msg('b', { art: 'person', id: 'a' }, 1), ich)).toBe('person:b');
    expect(kanalVon(msg('b', { art: 'einheit', einheit: 'Zug 2' }, 1), ich)).toBe('einheit:Zug 2');
    expect(kanalVon(msg('b', { art: 'alle' }, 1), ich)).toBe('alle');
  });
  it('Reihenfolge: Alle, eigene Einheit zuerst, Personen ohne mich alphabetisch; Verlaufskanäle bleiben, entfernte Person als weg markiert', () => {
    expect(kanaele(teilnehmer, [], ich).map((k) => k.key)).toEqual(['alle', 'einheit:Zug 2', 'einheit:Zug 1', 'person:b', 'person:c']);
    const chat = [msg('a', { art: 'einheit', einheit: 'KP' }, 1), msg('x', { art: 'person', id: 'a' }, 2)];
    const k = kanaele(teilnehmer, chat, ich);
    expect(k.map((x) => x.key)).toContain('einheit:KP');
    expect(k.at(-1)?.key).toBe('person:x');
    expect(k.find((x) => x.key === 'person:x')?.weg).toBe(true);
    expect(k.filter((x) => x.key !== 'person:x').every((x) => !x.weg)).toBe(true);
  });
  it('Ungelesen: zählt fremde Nachrichten nach dem Lesestand (Fallback «*», Kanal-Eintrag hat Vorrang); Verlauf vor dem Beitritt gilt als gelesen', () => {
    const chat = [
      msg('b', { art: 'alle' }, 10),
      msg('a', { art: 'alle' }, 20), // eigene zählt nie
      msg('b', { art: 'alle' }, 30),
      msg('c', { art: 'person', id: 'a' }, 40),
    ];
    const s = uebersicht(chat, ich, { '*': 15 });
    expect(s.get('alle')?.ungelesen).toBe(1);
    expect(s.get('person:c')?.ungelesen).toBe(1);
    expect(s.get('alle')?.letzte?.t).toBe(30);
    expect(uebersicht(chat, ich, { '*': 0, alle: 30 }).get('alle')?.ungelesen).toBe(0);
    expect([...uebersicht(chat, ich, startGelesen(chat)).values()].every((x) => x.ungelesen === 0)).toBe(true);
  });
  it('Eingaben aus Speicher/URL prüfen: parseGelesen und zielAus verwerfen Unsinn', () => {
    expect(parseGelesen(null)).toBeNull();
    expect(parseGelesen('{kaputt')).toBeNull();
    expect(parseGelesen('[1]')).toBeNull();
    expect(parseGelesen('{"alle":5,"x":"y"}')).toEqual({ alle: 5 });
    expect(zielAus({ art: 'person', id: 'b' })).toEqual({ art: 'person', id: 'b' });
    expect(zielAus({ art: 'einheit' })).toBeNull();
    expect(zielAus(undefined)).toBeNull();
  });
});
