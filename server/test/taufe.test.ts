import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClientMsg, MAX_TAUF_PUNKTE, STANDARD_TAUFNAMEN, TAUF_FAMILIEN, taufSchluessel, type TaufeInput, type Teilnehmer } from '../../shared/protocol.ts';
import { oeffneDb } from '../src/db.ts';
import { doppelterListenName, istAbgelehnt, MAX_TAUFEN_ZEICHEN_JE_LAGE, nameFrei, wende, type Befehl } from '../../shared/regeln/index.ts';
import { sichtAusDb, speichere } from '../src/regeln.ts';
import { testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const ring: [number, number][] = [[7.44, 46.94], [7.441, 46.94], [7.441, 46.941], [7.44, 46.941], [7.44, 46.94]];
const gebaeude = (name: string, extra: Partial<TaufeInput> = {}): TaufeInput => ({
  familie: 'gebaeude', name, geometrie: { type: 'Polygon', coordinates: [ring] }, quelle: 'vt', objektart: 'building/', stoss: null, fassaden: [], ziel: false, ...extra,
});

async function szenario() {
  const l = await s.lage();
  const ltgToken = (await s.beitreten(l.leitungCode, 'Leitung', 'Stab')).token;
  const ltg = await verbinde(s.url, ltgToken);
  const a = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Adler')).token);
  const b = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Bär')).token);
  return { ltg, a, b, ltgToken };
}

describe('Namen', () => {
  it('Eindeutigkeit ohne Gross-/Kleinschreibung und Leerzeichen, eigene Taufe ausgenommen', () => {
    const taufen = [{ id: '1', name: 'Gold' }, { id: '2', name: 'Queck Silver' }];
    expect(nameFrei(taufen, 'gold')).toBe(false);
    expect(nameFrei(taufen, ' queck  silver ')).toBe(false);
    expect(nameFrei(taufen, 'Gold', '1')).toBe(true);
    expect(nameFrei(taufen, 'Copper')).toBe(true);
    expect(taufSchluessel('  Queck   Silver ')).toBe('queck silver');
  });
  it('Vorgabelisten: je Familie ~30 Namen, keine Doppelten über alle Familien, keine NATO-Wörter', () => {
    for (const f of TAUF_FAMILIEN) expect(STANDARD_TAUFNAMEN[f].length).toBeGreaterThanOrEqual(30);
    expect(doppelterListenName(STANDARD_TAUFNAMEN)).toBeUndefined();
    const nato = ['alfa', 'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliett', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'x-ray', 'yankee', 'zulu'];
    for (const n of Object.values(STANDARD_TAUFNAMEN).flat()) expect(nato).not.toContain(taufSchluessel(n));
  });
  it('doppelter Listenname wird gefunden, auch familienübergreifend', () => {
    expect(doppelterListenName({ gebaeude: ['Gold', 'Iron'], strasse: ['Bear', 'gold'] })).toBe('gold');
  });
});

describe('Vertrag: Taufe', () => {
  const ok = (t: unknown) => ClientMsg.safeParse({ typ: 'taufe.neu', taufe: t }).success;
  it('Geometrien und Grenzen', () => {
    expect(ok(gebaeude('Gold'))).toBe(true);
    expect(ok(gebaeude('Gold', { geometrie: { type: 'Polygon', coordinates: [ring.slice(0, 3)] } }))).toBe(false); // Ring < 4
    expect(ok(gebaeude('Gold', { geometrie: { type: 'MultiLineString', coordinates: [[[7, 46], [7.1, 46.1]], [[7.1, 46.1], [7.2, 46]]] } }))).toBe(true);
    expect(ok(gebaeude('Gold', { geometrie: { type: 'LineString', coordinates: [[7, 46]] } }))).toBe(false);
    expect(ok(gebaeude('Gold', { geometrie: { type: 'Point', coordinates: [7, 46] } as never }))).toBe(false);
    const viele = Array.from({ length: MAX_TAUF_PUNKTE + 1 }, (_, i): [number, number] => [7 + i / 1e5, 46]);
    expect(ok(gebaeude('Gold', { geometrie: { type: 'LineString', coordinates: viele } }))).toBe(false);
    expect(ok(gebaeude('Gold', { geometrie: { type: 'LineString', coordinates: viele.slice(1) } }))).toBe(true);
    expect(ok(gebaeude('', {}))).toBe(false);
    expect(ok(gebaeude('Gold', { stoss: 360 }))).toBe(false);
    expect(ok(gebaeude('Gold', { stoss: 359.5, fassaden: [[0, 'rot']] }))).toBe(true);
    expect(ok(gebaeude('Gold', { fassaden: [[0, 'blau']] as never }))).toBe(false);
  });
});

describe('Server: Taufen', () => {
  it('taufen → alle sehen es, doppelter Name (auch andere Schreibweise) wird abgelehnt', async () => {
    const { a, b } = await szenario();
    a.senden({ typ: 'taufe.neu', taufe: gebaeude('Gold') });
    const x = (await b.warte('taufe')).taufe;
    expect(x).toMatchObject({ name: 'Gold', familie: 'gebaeude', von: a.snapshot.ich });
    expect((await b.warte('meldung')).meldung.text).toBe('Taufe: Gold (Gebäude)');
    b.senden({ typ: 'taufe.neu', taufe: gebaeude('GOLD', { familie: 'strasse' }) });
    expect((await b.warte('fehler')).meldung).toBe('Name «GOLD» ist in dieser Lage schon vergeben');
  });

  it('alle dürfen umbenennen, Stossrichtung/Fassaden/Zielobjekt ändern und löschen; Snapshot enthält Taufen', async () => {
    const { a, b, ltg, ltgToken } = await szenario();
    a.senden({ typ: 'taufe.neu', taufe: gebaeude('Gold') });
    a.senden({ typ: 'taufe.neu', taufe: gebaeude('Copper') });
    const gold = (await b.warte('taufe', (m) => m.taufe.name === 'Gold')).taufe;
    await b.warte('taufe', (m) => m.taufe.name === 'Copper');
    b.senden({ typ: 'taufe.aendern', taufe: { id: gold.id, name: 'copper' } });
    expect((await b.warte('fehler')).meldung).toContain('schon vergeben');
    b.senden({ typ: 'taufe.aendern', taufe: { id: gold.id, name: 'Helium', stoss: 90, fassaden: [[1, 'schwarz']], ziel: true } });
    const neu = (await a.warte('taufe', (m) => m.taufe.name === 'Helium')).taufe;
    expect(neu).toMatchObject({ id: gold.id, von: gold.von, stoss: 90, fassaden: [[1, 'schwarz']], ziel: true, erstelltAm: gold.erstelltAm });
    expect((await a.warte('meldung', (m) => m.meldung.text.includes('umbenannt'))).meldung.text).toBe('Taufe umbenannt: Gold → Helium');
    // neue Geometrie (Strasse verlängern) setzt Fassaden zurück
    b.senden({ typ: 'taufe.aendern', taufe: { id: gold.id, geometrie: { type: 'Polygon', coordinates: [[...ring].reverse()] } } });
    expect((await a.warte('taufe', (m) => m.taufe.id === gold.id && m.taufe.geaendertAm > neu.geaendertAm - 1 && m.taufe.geometrie.type === 'Polygon' && m.taufe.geometrie.coordinates[0][1][0] === ring[3][0])).taufe).toMatchObject({ stoss: 90, fassaden: [] });
    // Name einer gelöschten Taufe wird wieder frei
    ltg.senden({ typ: 'taufe.loeschen', id: gold.id });
    expect((await a.warte('taufe.geloescht')).id).toBe(gold.id);
    b.senden({ typ: 'taufe.neu', taufe: gebaeude('Helium') });
    await a.warte('taufe', (m) => m.taufe.name === 'Helium' && m.taufe.id !== gold.id);
    const fremd = await verbinde(s.url, (await s.beitreten((await s.lage()).teilnehmerCode, 'X')).token);
    expect(fremd.snapshot.taufen).toEqual([]); // andere Lage sieht nichts
    const e = await verbinde(s.url, ltgToken);
    expect(e.snapshot.taufen.map((t) => t.name).sort()).toEqual(['Copper', 'Helium']);
  });

  it('Namenslisten: nur Leitung, keine Doppelten, gehen mit der Lage an alle', async () => {
    const { a, ltg } = await szenario();
    a.senden({ typ: 'lage.taufListen', taufListen: { gebaeude: ['Gold'] } });
    expect((await a.warte('fehler')).meldung).toBe('Nur für die Leitung');
    ltg.senden({ typ: 'lage.taufListen', taufListen: { gebaeude: ['Gold', 'Iron'], strasse: ['iron'] } });
    expect((await ltg.warte('fehler')).meldung).toBe('Name «iron» steht doppelt in den Listen');
    ltg.senden({ typ: 'lage.taufListen', taufListen: { gebaeude: ['Gold', 'Kryptonit'] } });
    expect((await a.warte('lage')).lage.taufListen).toEqual({ gebaeude: ['Gold', 'Kryptonit'] });
    // Status-Set ändern behält die Listen
    ltg.senden({ typ: 'lage.statusSet', statusSet: a.snapshot.lage.statusSet });
    expect((await a.warte('lage')).lage.taufListen?.gebaeude).toEqual(['Gold', 'Kryptonit']);
  });

  it('Grössenbudget je Lage', () => {
    const db = oeffneDb(':memory:');
    const lage = { id: 'L', name: 'L', statusSet: [], erstelltAm: 0, beendetAm: null };
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
