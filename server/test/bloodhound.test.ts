// Bloodhound über den Server: die Linie geht an alle, Meldungen nur an Leitung und Empfänger (Delta und Snapshot). Regeln prüft shared/regeln.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pause, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

describe('Sichtbarkeit', () => {
  it('Unbeteiligte und Ziel bekommen den Auftrag (Delta, Snapshot), aber keine Meldung; Leitung alles', async () => {
    const l = await s.lage();
    const ltgB = l;
    const aB = await s.beitreten(l.teilnehmerCode, 'Adler', 'Zug 1');
    const bB = await s.beitreten(l.teilnehmerCode, 'Bär', 'Zug 2');
    const cB = await s.beitreten(l.teilnehmerCode, 'Cäsar', 'Zug 2');
    const ltg = await verbinde(s.url, ltgB.token);
    const a = await verbinde(s.url, aB.token);
    const b = await verbinde(s.url, bB.token);
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'teilnehmer', id: bB.teilnehmerId } });
    const auf = (await b.warte('bloodhound')).auftrag;
    expect((await a.warte('meldung')).meldung.text).toBe('Bloodhound-Auftrag an Adler');
    await ltg.warte('meldung');
    a.senden({ typ: 'bloodhound.beendet', id: auf.id });
    await b.warte('bloodhound', (m) => m.auftrag.id === auf.id && m.auftrag.ende === 'beendet');
    await a.warte('meldung', (m) => m.meldung.text === 'Bloodhound beendet');
    await ltg.warte('meldung', (m) => m.meldung.text === 'Bloodhound beendet');
    await pause(100);
    expect(b.empfangen.some((m) => m.typ === 'meldung')).toBe(false);
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'punkt', punkt: { lat: 47, lon: 8 } } });
    const neu = (await b.warte('bloodhound', (m) => m.auftrag.ende === null && m.auftrag.id !== auf.id)).auftrag;
    // Snapshot: nur offene Aufträge, Meldungen nach Sichtbarkeit
    const c = await verbinde(s.url, cB.token);
    expect(c.snapshot.bloodhound.map((x) => x.id)).toEqual([neu.id]);
    expect(c.snapshot.meldungen).toEqual([]);
    expect((await verbinde(s.url, aB.token)).snapshot.meldungen.map((m) => m.text)).toContain('Bloodhound beendet');
    expect((await verbinde(s.url, ltgB.token)).snapshot.meldungen.length).toBeGreaterThan(0);
  });
});
