import { describe, expect, it } from 'vitest';
import type { Chat, Teilnehmer } from '../../../../shared/protocol.ts';
import { formatZeit, kanaele, kanalVon, parseGelesen, startGelesen, uebersicht, zielAus } from './kanaele.ts';

const tn = (id: string, rufname: string, einheit: string): Teilnehmer => ({
  id,
  rufname,
  einheit,
  funktion: '',
  sidc: '10031000001211000000',
  rolle: 'teilnehmer',
  status: 'bereit',
  statusText: '',
  pos: null,
  sendetPos: true,
  online: true,
  zuletzt: 0,
});
let n = 0;
const msg = (von: string, an: Chat['an'], t: number): Chat => ({ id: String(++n), von, an, text: 'x', t });

const ich = 'a';
const teilnehmer = [tn('a', 'Adler', 'Zug 2'), tn('b', 'Bär', 'Zug 1'), tn('c', 'Chamäleon', 'Zug 2')];

describe('kanalVon', () => {
  it('Direktnachricht landet beim Gegenüber, egal wer schreibt', () => {
    expect(kanalVon(msg('a', { art: 'person', id: 'b' }, 1), ich)).toBe('person:b');
    expect(kanalVon(msg('b', { art: 'person', id: 'a' }, 1), ich)).toBe('person:b');
  });
  it('Einheit und Alle', () => {
    expect(kanalVon(msg('b', { art: 'einheit', einheit: 'Zug 2' }, 1), ich)).toBe('einheit:Zug 2');
    expect(kanalVon(msg('b', { art: 'alle' }, 1), ich)).toBe('alle');
  });
});

describe('kanaele', () => {
  it('Alle, eigene Einheit zuerst, Personen ohne mich alphabetisch', () => {
    expect(kanaele(teilnehmer, [], ich).map((k) => k.key)).toEqual(['alle', 'einheit:Zug 2', 'einheit:Zug 1', 'person:b', 'person:c']);
  });
  it('behält Kanäle aus dem Verlauf, auch wenn niemand mehr dort ist', () => {
    const chat = [msg('a', { art: 'einheit', einheit: 'KP' }, 1), msg('x', { art: 'person', id: 'a' }, 2)];
    const keys = kanaele(teilnehmer, chat, ich).map((k) => k.key);
    expect(keys).toContain('einheit:KP');
    expect(keys.at(-1)).toBe('person:x');
  });
});

describe('uebersicht', () => {
  const chat = [
    msg('b', { art: 'alle' }, 10),
    msg('a', { art: 'alle' }, 20), // eigene zählt nie
    msg('b', { art: 'alle' }, 30),
    msg('c', { art: 'person', id: 'a' }, 40),
  ];
  it('zählt fremde Nachrichten nach dem Lesestand, Fallback «*»', () => {
    const s = uebersicht(chat, ich, { '*': 15 });
    expect(s.get('alle')?.ungelesen).toBe(1);
    expect(s.get('person:c')?.ungelesen).toBe(1);
    expect(s.get('alle')?.letzte?.t).toBe(30);
  });
  it('Eintrag je Kanal hat Vorrang', () => {
    expect(uebersicht(chat, ich, { '*': 0, alle: 30 }).get('alle')?.ungelesen).toBe(0);
  });
  it('Startstand: Verlauf vor dem Beitritt gilt als gelesen', () => {
    expect([...uebersicht(chat, ich, startGelesen(chat)).values()].every((s) => s.ungelesen === 0)).toBe(true);
  });
});

describe('Eingaben prüfen', () => {
  it('parseGelesen verwirft Unsinn', () => {
    expect(parseGelesen(null)).toBeNull();
    expect(parseGelesen('{kaputt')).toBeNull();
    expect(parseGelesen('[1]')).toBeNull();
    expect(parseGelesen('{"alle":5,"x":"y"}')).toEqual({ alle: 5 });
  });
  it('zielAus akzeptiert nur gültige ChatZiele', () => {
    expect(zielAus({ art: 'person', id: 'b' })).toEqual({ art: 'person', id: 'b' });
    expect(zielAus({ art: 'einheit' })).toBeNull();
    expect(zielAus(undefined)).toBeNull();
  });
});

describe('formatZeit', () => {
  const jetzt = new Date(2026, 9, 28, 16, 0).getTime();
  it('heute nur Uhrzeit, sonst mit Datum', () => {
    expect(formatZeit(new Date(2026, 9, 28, 14, 5).getTime(), jetzt)).toBe('14:05');
    expect(formatZeit(new Date(2026, 9, 27, 9, 7).getTime(), jetzt)).toBe('27.10. 09:07');
  });
});
