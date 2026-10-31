// Geländetaufe: Vorgabelisten, Vertragsgrenzen, Verteilen/Snapshot, Grössenbudget. Namensregeln und Rechte prüft shared/regeln.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClientMsg, MAX_TAUF_PUNKTE, STANDARD_TAUFNAMEN, TAUF_FAMILIEN, taufSchluessel, type TaufeInput, type Teilnehmer } from '../../shared/protocol.ts';
import { oeffneDb } from '../src/db.ts';
import { doppelterListenName, istAbgelehnt, MAX_TAUFEN_ZEICHEN_JE_LAGE, wende, type Befehl } from '../../shared/regeln/index.ts';
import { sichtAusDb, speichere } from '../src/regeln.ts';
import { testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const ring: [number, number][] = [[7.44, 46.94], [7.441, 46.94], [7.441, 46.941], [7.44, 46.941], [7.44, 46.94]];
const gebaeude = (name: string, extra: Partial<TaufeInput> = {}): TaufeInput => ({
  familie: 'gebaeude', name, geometrie: { type: 'Polygon', coordinates: [ring] }, quelle: 'vt', objektart: 'building/', stoss: null, fassaden: [], ziel: false, ...extra,
});

describe('Vorgaben und Vertrag', () => {
  it('Vorgabelisten: je Familie ≥ 30 Namen, keine Doppelten über alle Familien, keine NATO-Buchstabierwörter', () => {
    for (const f of TAUF_FAMILIEN) expect(STANDARD_TAUFNAMEN[f].length, f).toBeGreaterThanOrEqual(30);
    expect(doppelterListenName(STANDARD_TAUFNAMEN)).toBeUndefined();
    const nato = ['alfa', 'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliett', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'x-ray', 'yankee', 'zulu'];
    for (const n of Object.values(STANDARD_TAUFNAMEN).flat()) expect(nato).not.toContain(taufSchluessel(n));
  });
  it('Geometrien und Grenzen', () => {
    const ok = (t: unknown) => ClientMsg.safeParse({ typ: 'taufe.neu', taufe: t }).success;
    const viele = Array.from({ length: MAX_TAUF_PUNKTE + 1 }, (_, i): [number, number] => [7 + i / 1e5, 46]);
    const faelle: [boolean, TaufeInput][] = [
      [true, gebaeude('Gold')],
      [false, gebaeude('Gold', { geometrie: { type: 'Polygon', coordinates: [ring.slice(0, 3)] } })], // Ring < 4
      [true, gebaeude('Gold', { geometrie: { type: 'MultiLineString', coordinates: [[[7, 46], [7.1, 46.1]], [[7.1, 46.1], [7.2, 46]]] } })],
      [false, gebaeude('Gold', { geometrie: { type: 'LineString', coordinates: [[7, 46]] } })],
      [false, gebaeude('Gold', { geometrie: { type: 'Point', coordinates: [7, 46] } as never })],
      [false, gebaeude('Gold', { geometrie: { type: 'LineString', coordinates: viele } })],
      [true, gebaeude('Gold', { geometrie: { type: 'LineString', coordinates: viele.slice(1) } })],
      [false, gebaeude('')],
      [false, gebaeude('Gold', { stoss: 360 })],
      [true, gebaeude('Gold', { stoss: 359.5, fassaden: [[0, 'rot']] })],
      [false, gebaeude('Gold', { fassaden: [[0, 'blau']] as never })],
    ];
    faelle.forEach(([erwartet, t], i) => expect(ok(t), `Fall ${i}`).toBe(erwartet));
  });
});

describe('Server', () => {
  it('Taufe geht an alle mit Meldung, Änderung behält Ersteller, Ablehnung als fehler; Snapshot nur der eigenen Lage', async () => {
    const l = await s.lage();
    const ltgToken = (await s.beitreten(l.leitungCode, 'Leitung', 'Stab')).token;
    const a = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Adler')).token);
    const b = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Bär')).token);
    a.senden({ typ: 'taufe.neu', taufe: gebaeude('Gold') });
    const gold = (await b.warte('taufe')).taufe;
    expect(gold).toMatchObject({ name: 'Gold', familie: 'gebaeude', von: a.snapshot.ich });
    expect((await b.warte('meldung')).meldung.text).toBe('Taufe: Gold (Gebäude)');
    b.senden({ typ: 'taufe.neu', taufe: gebaeude('GOLD', { familie: 'strasse' }) });
    expect((await b.warte('fehler')).meldung).toBe('Name «GOLD» ist in dieser Lage schon vergeben');
    b.senden({ typ: 'taufe.aendern', taufe: { id: gold.id, name: 'Helium', stoss: 90, fassaden: [[1, 'schwarz']], ziel: true } });
    const neu = (await a.warte('taufe', (m) => m.taufe.name === 'Helium')).taufe;
    expect(neu).toMatchObject({ id: gold.id, von: gold.von, stoss: 90, fassaden: [[1, 'schwarz']], ziel: true, erstelltAm: gold.erstelltAm });
    expect((await a.warte('meldung', (m) => m.meldung.text.includes('umbenannt'))).meldung.text).toBe('Taufe umbenannt: Gold → Helium');
    const fremd = await verbinde(s.url, (await s.beitreten((await s.lage()).teilnehmerCode, 'X')).token);
    expect(fremd.snapshot.taufen).toEqual([]);
    expect((await verbinde(s.url, ltgToken)).snapshot.taufen.map((t) => t.name)).toEqual(['Helium']);
  });

  it('Grössenbudget je Lage', () => {
    const db = oeffneDb(':memory:');
    const lage = { id: 'L', name: 'L', statusSet: [], erstelltAm: 0, phasen: [{ phase: 'lv' as const, t: 0 }] };
    db.lageErstellen(lage, 'tn', 'ltg');
    const fehler: string[] = [];
    const t = { id: 'T', rolle: 'teilnehmer' } as Teilnehmer;
    const sende = (m: Befehl) => {
      const r = wende(sichtAusDb(db, lage), { autor: t, msg: m, jetzt: 1, neueId: randomUUID });
      if (istAbgelehnt(r)) fehler.push(r.abgelehnt);
      else speichere(db, lage.id, r.aenderungen);
    };
    sende({ typ: 'taufe.neu', taufe: gebaeude('Gold') });
    expect(fehler).toEqual([]);
    db.speichern(lage.id, 'taufe', { id: 'polster', name: 'x', polster: 'x'.repeat(MAX_TAUFEN_ZEICHEN_JE_LAGE - db.groesse(lage.id, 'taufe') - 500) } as never, 0);
    const lang = Array.from({ length: 100 }, (_, i): [number, number] => [7 + i / 1000, 46 + i / 1000]);
    sende({ typ: 'taufe.neu', taufe: gebaeude('Iron', { familie: 'strasse', geometrie: { type: 'LineString', coordinates: lang } }) });
    expect(fehler).toEqual(['Zu viele Taufdaten in dieser Lage']);
    db.schliessen();
  });
});
