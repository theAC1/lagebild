import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SIDC, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

async function szenario() {
  const l = await s.lage();
  const ltgB = await s.beitreten(l.leitungCode, 'Leitung', 'Stab');
  const aB = await s.beitreten(l.teilnehmerCode, 'Adler', 'Zug 1');
  const bB = await s.beitreten(l.teilnehmerCode, 'Bär', 'Zug 2');
  return { ltg: await verbinde(s.url, ltgB.token), a: await verbinde(s.url, aB.token), aB, bB };
}

describe('Bloodhound-Aufträge enden mit Empfänger oder Ziel', () => {
  it('Empfänger entfernt: Auftrag aufgehoben und im Meldungslog', async () => {
    const { ltg, aB } = await szenario();
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'punkt', punkt: { lat: 47, lon: 8 } } });
    const auf = (await ltg.warte('bloodhound')).auftrag;
    ltg.senden({ typ: 'teilnehmer.entfernen', id: aB.teilnehmerId });
    expect((await ltg.warte('bloodhound', (m) => m.auftrag.id === auf.id && m.auftrag.ende !== null)).auftrag.ende).toBe('aufgehoben');
    await ltg.warte('meldung', (m) => m.meldung.text.includes('Empfänger entfernt'));
  });

  it('Ziel-Marker gelöscht: Auftrag aufgehoben', async () => {
    const { ltg, a, aB } = await szenario();
    a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung: 'M', notiz: '' } });
    const marker = (await a.warte('marker')).marker;
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'marker', id: marker.id } });
    const auf = (await a.warte('bloodhound')).auftrag;
    a.senden({ typ: 'marker.loeschen', id: marker.id });
    expect((await a.warte('bloodhound', (m) => m.auftrag.id === auf.id && m.auftrag.ende !== null)).auftrag.ende).toBe('aufgehoben');
    await ltg.warte('meldung', (m) => m.meldung.text.includes('Marker gelöscht'));
  });

  it('Ziel-Teilnehmer entfernt: Auftrag aufgehoben', async () => {
    const { ltg, a, aB, bB } = await szenario();
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'teilnehmer', id: bB.teilnehmerId } });
    const auf = (await a.warte('bloodhound')).auftrag;
    ltg.senden({ typ: 'teilnehmer.entfernen', id: bB.teilnehmerId });
    expect((await a.warte('bloodhound', (m) => m.auftrag.id === auf.id && m.auftrag.ende !== null)).auftrag.ende).toBe('aufgehoben');
  });
});
