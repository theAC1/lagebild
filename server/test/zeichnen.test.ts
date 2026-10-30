import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { standardEbeneId, STANDARD_STIL, ZeichnungInput, ClientMsg, type ZeichnungInput as ZInput } from '../../shared/protocol.ts';
import { oeffneDb } from '../src/db.ts';
import { MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE, verarbeiteZeichnen } from '../src/zeichnen.ts';
import { pause, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const P = (lat: number, lon: number) => ({ lat, lon });
const linie = (ebeneId: string, extra: Partial<ZInput> = {}): ZInput => ({
  ebeneId, art: 'linie', punkte: [P(47, 8), P(47.1, 8.1)], text: '', bezeichnung: '', stil: STANDARD_STIL, ...extra,
});

async function szenario() {
  const l = await s.lage();
  const ltgB = await s.beitreten(l.leitungCode, 'Leitung', 'Stab');
  const aB = await s.beitreten(l.teilnehmerCode, 'Adler', 'Zug 1');
  const bB = await s.beitreten(l.teilnehmerCode, 'Bär', 'Zug 2');
  const ltg = await verbinde(s.url, ltgB.token);
  const a = await verbinde(s.url, aB.token);
  const b = await verbinde(s.url, bB.token);
  return { l, ltg, a, b, ltgB, aB, bB, std: standardEbeneId(ltgB.lageId) };
}
const fehlerText = async (c: Awaited<ReturnType<typeof verbinde>>) => (await c.warte('fehler')).meldung;

describe('Vertrag: Zeichnung je Art', () => {
  const ok = (z: Record<string, unknown>) => ZeichnungInput.safeParse({ ebeneId: 'e', text: '', bezeichnung: '', stil: STANDARD_STIL, ...z }).success;
  it('Punktzahlen', () => {
    expect(ok({ art: 'linie', punkte: [P(1, 1)] })).toBe(false);
    expect(ok({ art: 'linie', punkte: [P(1, 1), P(2, 2)] })).toBe(true);
    expect(ok({ art: 'flaeche', punkte: [P(1, 1), P(2, 2)] })).toBe(false);
    expect(ok({ art: 'flaeche', punkte: [P(1, 1), P(2, 2), P(3, 1)] })).toBe(true);
    expect(ok({ art: 'rechteck', punkte: [P(1, 1), P(2, 2)] })).toBe(true);
    expect(ok({ art: 'rechteck', punkte: [P(1, 1), P(2, 2), P(3, 3)] })).toBe(false);
  });
  it('Kreis braucht Mittelpunkt und radiusM > 0, andere Arten kein radiusM', () => {
    expect(ok({ art: 'kreis', punkte: [P(1, 1)], radiusM: 50 })).toBe(true);
    expect(ok({ art: 'kreis', punkte: [P(1, 1)] })).toBe(false);
    expect(ok({ art: 'kreis', punkte: [P(1, 1)], radiusM: 0 })).toBe(false);
    expect(ok({ art: 'kreis', punkte: [P(1, 1), P(2, 2)], radiusM: 5 })).toBe(false);
    expect(ok({ art: 'linie', punkte: [P(1, 1), P(2, 2)], radiusM: 5 })).toBe(false);
  });
  it('Text genau ein Punkt und nicht leer', () => {
    expect(ok({ art: 'text', punkte: [P(1, 1)], text: 'Treffpunkt' })).toBe(true);
    expect(ok({ art: 'text', punkte: [P(1, 1)], text: '' })).toBe(false);
    expect(ok({ art: 'text', punkte: [P(1, 1), P(2, 2)], text: 'x' })).toBe(false);
  });
  it('raumArt genau bei Raum', () => {
    const f = [P(1, 1), P(2, 2), P(3, 1)];
    expect(ok({ art: 'raum', punkte: f, raumArt: 'ziel' })).toBe(true);
    expect(ok({ art: 'raum', punkte: f })).toBe(false);
    expect(ok({ art: 'flaeche', punkte: f, raumArt: 'ziel' })).toBe(false);
  });
  it('Punktgrenzen: Grenze 2000, Linie 500; Stil-Grenzen', () => {
    const viele = (n: number) => Array.from({ length: n }, (_, i) => P(47 + i / 1e5, 8));
    expect(ok({ art: 'grenze', punkte: viele(2000) })).toBe(true);
    expect(ok({ art: 'grenze', punkte: viele(2001) })).toBe(false);
    expect(ok({ art: 'linie', punkte: viele(500) })).toBe(true);
    expect(ok({ art: 'linie', punkte: viele(501) })).toBe(false);
    const l = { art: 'linie', punkte: viele(2) };
    expect(ok({ ...l, stil: { ...STANDARD_STIL, breite: 13 } })).toBe(false);
    expect(ok({ ...l, stil: { ...STANDARD_STIL, breite: 0.5 } })).toBe(false);
    expect(ok({ ...l, stil: { ...STANDARD_STIL, deckkraft: 1.1 } })).toBe(false);
    expect(ok({ ...l, stil: { ...STANDARD_STIL, farbe: 'rot' } })).toBe(false);
    expect(ok({ ...l, stil: { ...STANDARD_STIL, strich: 'strich' } })).toBe(false);
    expect(ok({ ...l, stil: { ...STANDARD_STIL, fuellung: '#00ff00', strich: 'gepunktet' } })).toBe(true);
    expect(ok({ ...l, bezeichnung: 'x'.repeat(201) })).toBe(false);
    expect(ok({ ...l, punkte: [P(91, 0), P(0, 0)] })).toBe(false);
  });
  it('Bloodhound-Ziel passt zur Art', () => {
    const m = (ziel: unknown) => ClientMsg.safeParse({ typ: 'bloodhound.auftrag', an: 'x', ziel }).success;
    expect(m({ art: 'punkt', punkt: P(1, 1) })).toBe(true);
    expect(m({ art: 'punkt' })).toBe(false);
    expect(m({ art: 'marker', id: 'm' })).toBe(true);
    expect(m({ art: 'marker' })).toBe(false);
    expect(m({ art: 'marker', id: 'm', punkt: P(1, 1) })).toBe(false);
  });
});

describe('Zeichnungen', () => {
  it('Snapshot enthält Standard-Ebene «Allgemein»; neue Zeichnung geht an alle und in den Snapshot', async () => {
    const { l, a, b, std, aB } = await szenario();
    expect(a.snapshot.ebenen).toMatchObject([{ id: std, name: 'Allgemein', gesperrt: false, reihenfolge: 0 }]);
    expect(a.snapshot.zeichnungen).toEqual([]);
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { bezeichnung: 'Route' })] });
    const m = await b.warte('zeichnungen');
    expect(m.zeichnungen[0]).toMatchObject({ von: aB.teilnehmerId, ebeneId: std, art: 'linie', bezeichnung: 'Route' });
    await a.warte('zeichnungen'); // Absender sieht sie auch
    const meldung = await b.warte('meldung', (x) => x.meldung.text.startsWith('Zeichnung: Linie'));
    expect(meldung.meldung.von).toBe(aB.teilnehmerId);
    const c = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Neu')).token);
    expect(c.snapshot.zeichnungen).toHaveLength(1);
  });

  it('ungültige Zeichnung und fremde Ebene werden abgelehnt', async () => {
    const { a, std } = await szenario();
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { punkte: [P(1, 1)] })] });
    expect(await fehlerText(a)).toBe('Ungültige Nachricht');
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie('gibts-nicht')] });
    expect(await fehlerText(a)).toBe('Ebene nicht gefunden');
  });

  it('Rechte: ändern/löschen nur Ersteller oder Leitung; Mehrfach ist alles-oder-nichts', async () => {
    const { ltg, a, b, std } = await szenario();
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'z-a1' }), linie(std, { id: 'z-a2' })] });
    await b.warte('zeichnungen');
    b.senden({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(std, { bezeichnung: 'Hack' }), id: 'z-a1' }] });
    expect(await fehlerText(b)).toBe('Keine Berechtigung für diese Zeichnung');
    b.senden({ typ: 'zeichnung.loeschen', ids: ['z-a1'] });
    expect(await fehlerText(b)).toBe('Keine Berechtigung für diese Zeichnung');
    // Ersteller ändert; von/erstelltAm bleiben
    a.senden({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(std, { bezeichnung: 'neu' }), id: 'z-a1' }] });
    const g = (await b.warte('zeichnungen', (m) => m.zeichnungen[0].bezeichnung === 'neu')).zeichnungen[0];
    expect(g.erstelltAm).toBeLessThanOrEqual(g.geaendertAm);
    // Leitung ändert fremde; Ersteller bleibt Ersteller
    ltg.senden({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(std, { bezeichnung: 'ltg' }), id: 'z-a1' }] });
    const l = (await a.warte('zeichnungen', (m) => m.zeichnungen[0].bezeichnung === 'ltg')).zeichnungen[0];
    expect(l.von).toBe(g.von);
    // Mehrfach löschen: b besitzt eine fremde dabei → nichts wird gelöscht
    b.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'z-b1' })] });
    await b.warte('zeichnungen');
    b.senden({ typ: 'zeichnung.loeschen', ids: ['z-b1', 'z-a2'] });
    await fehlerText(b);
    // Lasso durch Leitung: alles weg
    ltg.senden({ typ: 'zeichnung.loeschen', ids: ['z-b1', 'z-a2', 'z-a1'] });
    expect((await a.warte('zeichnungen.geloescht')).ids).toEqual(['z-b1', 'z-a2', 'z-a1']);
    ltg.senden({ typ: 'zeichnung.loeschen', ids: ['z-a1'] });
    expect(await fehlerText(ltg)).toBe('Zeichnung nicht gefunden');
  });

  it('Leitung legt gelöschte fremde Zeichnung mit dem alten Ersteller neu an (Undo); andere können `von` nicht setzen', async () => {
    const { ltg, a, b, std, aB } = await szenario();
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'u-a1' })] });
    await a.warte('zeichnungen');
    ltg.senden({ typ: 'zeichnung.loeschen', ids: ['u-a1'] });
    await a.warte('zeichnungen.geloescht');
    ltg.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'u-a1', von: aB.teilnehmerId })] });
    expect((await a.warte('zeichnungen')).zeichnungen[0].von).toBe(aB.teilnehmerId);
    b.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'u-b1', von: aB.teilnehmerId })] });
    expect((await b.warte('zeichnungen', (m) => m.zeichnungen[0].id === 'u-b1')).zeichnungen[0].von).not.toBe(aB.teilnehmerId);
  });

  it('gesperrte Ebene: nur Leitung zeichnet, ändert, löscht und verschiebt hinein/heraus', async () => {
    const { ltg, a, std } = await szenario();
    ltg.senden({ typ: 'ebene.neu', name: 'Sperren', gesperrt: true });
    const eb = (await a.warte('ebene')).ebene;
    expect(eb).toMatchObject({ name: 'Sperren', gesperrt: true, reihenfolge: 1 });
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(eb.id)] });
    expect(await fehlerText(a)).toBe('Ebene «Sperren» ist gesperrt');
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'zz' })] });
    await a.warte('zeichnungen');
    a.senden({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(eb.id), id: 'zz' }] });
    expect(await fehlerText(a)).toBe('Ebene «Sperren» ist gesperrt');
    ltg.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(eb.id, { id: 'zl' })] });
    await a.warte('zeichnungen');
    ltg.senden({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(eb.id), id: 'zz' }] }); // Leitung darf verschieben
    await a.warte('zeichnungen');
    a.senden({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(std), id: 'zz' }] }); // herausnehmen: auch nicht
    expect(await fehlerText(a)).toBe('Ebene «Sperren» ist gesperrt');
    a.senden({ typ: 'zeichnung.loeschen', ids: ['zz'] });
    expect(await fehlerText(a)).toBe('Ebene «Sperren» ist gesperrt');
    ltg.senden({ typ: 'ebene.aendern', id: eb.id, gesperrt: false });
    await a.warte('ebene', (m) => !m.ebene.gesperrt);
    a.senden({ typ: 'zeichnung.loeschen', ids: ['zz'] });
    await a.warte('zeichnungen.geloescht');
  });

  it('Limit je Lage', async () => {
    // Grenze wird über die Konstante geprüft, ohne 5000 Einträge: Nachricht mit 100 Stück ist erlaubt, 101 nicht
    const { a, std } = await szenario();
    a.senden({ typ: 'zeichnung.neu', zeichnungen: Array.from({ length: 101 }, () => linie(std)) });
    expect(await fehlerText(a)).toBe('Ungültige Nachricht');
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'dup' })] });
    await a.warte('zeichnungen');
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'dup' })] });
    expect(await fehlerText(a)).toBe('Zeichnungs-ID bereits vergeben');
  });

  it('Grössenbudget je Lage: neu und wachsende Änderung werden abgelehnt, schrumpfende nicht', () => {
    const db = oeffneDb(':memory:');
    const lage = { id: 'L', name: 'L', statusSet: [], erstelltAm: 0, beendetAm: null };
    db.lageErstellen(lage, 'tn', 'ltg');
    const std = db.ebenenSicherstellen(lage.id)[0].id;
    const fehler: string[] = [];
    const u = { db, anAlle: () => {}, anLeitungUnd: () => {}, fehler: (t: string) => void fehler.push(t), meldung: () => {} };
    const t = { id: 'T', rolle: 'teilnehmer' } as Parameters<typeof verarbeiteZeichnen>[1];
    const sende = (m: ClientMsg) => verarbeiteZeichnen(u, t, lage, m);
    sende({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { id: 'klein' })] });
    expect(fehler).toEqual([]);
    // Budget bis auf ~1000 Zeichen mit einem Füll-Eintrag ausschöpfen
    db.speichern(lage.id, 'zeichnung', { id: 'polster', polster: 'x'.repeat(MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE - db.groesse(lage.id, 'zeichnung') - 1000) } as never, 0);
    const lang = Array.from({ length: 100 }, (_, i) => P(46 + i / 1000, 7 + i / 1000));
    sende({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { punkte: lang })] });
    sende({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(std, { punkte: lang }), id: 'klein' }] });
    expect(fehler).toEqual(['Zu viele Zeichnungsdaten in dieser Lage', 'Zu viele Zeichnungsdaten in dieser Lage']);
    sende({ typ: 'zeichnung.aendern', zeichnungen: [{ ...linie(std, { bezeichnung: 'kürzer geht immer' }), id: 'klein' }] });
    expect(fehler).toHaveLength(2);
    db.schliessen();
  });

  it('grosse Grenze (2000 Punkte) passt durch den WebSocket', async () => {
    const { a, b, std } = await szenario();
    const punkte = Array.from({ length: 2000 }, (_, i) => P(46 + i / 10000, 7.123456 + i / 10000));
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { art: 'grenze', punkte })] });
    expect((await b.warte('zeichnungen')).zeichnungen[0].punkte).toHaveLength(2000);
  });
});

describe('Ebenen', () => {
  it('nur Leitung verwaltet; Name eindeutig; Standard nicht löschbar; Löschen entfernt Zeichnungen', async () => {
    const { ltg, a, b, std } = await szenario();
    a.senden({ typ: 'ebene.neu', name: 'X' });
    expect(await fehlerText(a)).toBe('Nur für die Leitung');
    a.senden({ typ: 'ebene.aendern', id: std, name: 'Y' });
    expect(await fehlerText(a)).toBe('Nur für die Leitung');
    a.senden({ typ: 'ebene.loeschen', id: std });
    expect(await fehlerText(a)).toBe('Nur für die Leitung');

    ltg.senden({ typ: 'ebene.neu', name: 'Phase 1' });
    const e = (await b.warte('ebene')).ebene;
    ltg.senden({ typ: 'ebene.neu', name: 'Phase 1' });
    expect(await fehlerText(ltg)).toBe('Ebenen-Name bereits vergeben');
    ltg.senden({ typ: 'ebene.aendern', id: e.id, name: 'Phase 2', reihenfolge: 5 });
    expect((await b.warte('ebene', (m) => m.ebene.name === 'Phase 2')).ebene.reihenfolge).toBe(5);
    ltg.senden({ typ: 'ebene.loeschen', id: std });
    expect(await fehlerText(ltg)).toBe('Die Standard-Ebene kann nicht gelöscht werden');

    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(e.id, { id: 'in-e' })] });
    await b.warte('zeichnungen');
    ltg.senden({ typ: 'ebene.loeschen', id: e.id });
    expect(await b.warte('ebene.geloescht')).toMatchObject({ id: e.id, zeichnungIds: ['in-e'] });
    const neu = await verbinde(s.url, (await s.beitreten((await s.lage()).leitungCode, 'L')).token);
    expect(neu.snapshot.ebenen).toHaveLength(1);
  });
});

describe('Bloodhound-Aufträge', () => {
  it('Leitung → Teilnehmer; Verteilung nur an Leitung und Empfänger; Snapshot', async () => {
    const { ltg, a, b, aB, bB, ltgB } = await szenario();
    a.senden({ typ: 'bloodhound.auftrag', an: bB.teilnehmerId, ziel: { art: 'punkt', punkt: P(47, 8) } });
    expect(await fehlerText(a)).toBe('Nur für die Leitung');

    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'teilnehmer', id: bB.teilnehmerId } });
    const auf = (await a.warte('bloodhound')).auftrag;
    expect(auf).toMatchObject({ von: ltgB.teilnehmerId, an: aB.teilnehmerId, ende: null, quittiertAm: null });
    await ltg.warte('bloodhound');
    await pause(100);
    expect(b.empfangen.some((m) => m.typ === 'bloodhound')).toBe(false);
    expect((await a.warte('meldung', (m) => m.meldung.text === 'Bloodhound-Auftrag an Adler')).meldung.von).toBe(ltgB.teilnehmerId);

    // Snapshot: Leitung sieht alle offenen, Empfänger seine, andere nichts
    const nach = async (token: string) => (await verbinde(s.url, token)).snapshot.bloodhound;
    expect(await nach(ltgB.token)).toHaveLength(1);
    expect(await nach(aB.token)).toHaveLength(1);
    expect(await nach(bB.token)).toHaveLength(0);

    // Quittieren: nur Empfänger
    ltg.senden({ typ: 'bloodhound.quittieren', id: auf.id });
    expect(await fehlerText(ltg)).toBe('Nur der Empfänger kann den Auftrag bearbeiten');
    a.senden({ typ: 'bloodhound.quittieren', id: auf.id });
    expect((await ltg.warte('bloodhound', (m) => m.auftrag.quittiertAm !== null)).auftrag.ende).toBeNull();
  });

  it('Ziel wird geprüft; neuer Auftrag ersetzt den alten', async () => {
    const { ltg, a, aB, bB } = await szenario();
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'marker', id: 'gibts-nicht' } });
    expect(await fehlerText(ltg)).toBe('Ziel nicht gefunden');
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'teilnehmer', id: aB.teilnehmerId } });
    expect(await fehlerText(ltg)).toBe('Ziel ist der Empfänger selbst');
    ltg.senden({ typ: 'bloodhound.auftrag', an: 'niemand', ziel: { art: 'punkt', punkt: P(1, 1) } });
    expect(await fehlerText(ltg)).toBe('Empfänger nicht gefunden');

    a.senden({ typ: 'marker.setzen', marker: { sidc: '10031000001211000000', lat: 47, lon: 8, bezeichnung: 'M', notiz: '' } });
    const marker = (await a.warte('marker')).marker;
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'marker', id: marker.id } });
    const erster = (await a.warte('bloodhound')).auftrag;
    ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'teilnehmer', id: bB.teilnehmerId } });
    expect((await a.warte('bloodhound', (m) => m.auftrag.id === erster.id)).auftrag).toMatchObject({ ende: 'aufgehoben' });
    expect((await a.warte('bloodhound', (m) => m.auftrag.id !== erster.id)).auftrag.ende).toBeNull();
  });

  it('aufheben nur Leitung; beendet/erreicht nur Empfänger; danach nicht mehr aktiv', async () => {
    const { ltg, a, b, aB } = await szenario();
    const neuerAuftrag = async () => {
      ltg.senden({ typ: 'bloodhound.auftrag', an: aB.teilnehmerId, ziel: { art: 'punkt', punkt: P(47, 8) } });
      return (await a.warte('bloodhound', (m) => m.auftrag.ende === null)).auftrag;
    };
    let auf = await neuerAuftrag();
    a.senden({ typ: 'bloodhound.aufheben', id: auf.id });
    expect(await fehlerText(a)).toBe('Nur für die Leitung');
    b.senden({ typ: 'bloodhound.beendet', id: auf.id });
    expect(await fehlerText(b)).toBe('Nur der Empfänger kann den Auftrag bearbeiten');
    ltg.senden({ typ: 'bloodhound.erreicht', id: auf.id });
    expect(await fehlerText(ltg)).toBe('Nur der Empfänger kann den Auftrag bearbeiten');

    a.senden({ typ: 'bloodhound.beendet', id: auf.id });
    expect((await ltg.warte('bloodhound', (m) => m.auftrag.ende === 'beendet')).auftrag.endeAm).not.toBeNull();
    expect((await ltg.warte('meldung', (m) => m.meldung.text === 'Bloodhound beendet')).meldung.von).toBe(aB.teilnehmerId);
    a.senden({ typ: 'bloodhound.beendet', id: auf.id });
    expect(await fehlerText(a)).toBe('Auftrag nicht aktiv');

    auf = await neuerAuftrag();
    a.senden({ typ: 'bloodhound.erreicht', id: auf.id });
    await ltg.warte('bloodhound', (m) => m.auftrag.ende === 'erreicht');

    auf = await neuerAuftrag();
    ltg.senden({ typ: 'bloodhound.aufheben', id: auf.id });
    await a.warte('bloodhound', (m) => m.auftrag.ende === 'aufgehoben');
    // beendete Aufträge sind nicht mehr im Snapshot
    expect((await verbinde(s.url, (await s.beitreten((await s.lage()).leitungCode, 'L2')).token)).snapshot.bloodhound).toEqual([]);
  });
});

describe('Lage löschen und Export', () => {
  it('Export enthält Zeichnungen (GeoJSON alle, GPX sinnvoll); Löschen entfernt alles', async () => {
    const { l, ltg, a, ltgB, std } = await szenario();
    ltg.senden({ typ: 'ebene.neu', name: 'Räume' });
    const eb = (await ltg.warte('ebene')).ebene;
    const form = (art: ZInput['art'], punkte: ZInput['punkte'], extra: Partial<ZInput> = {}) => linie(std, { art, punkte, ...extra });
    const dreieck = [P(47, 8), P(47.1, 8), P(47.1, 8.1)];
    a.senden({
      typ: 'zeichnung.neu',
      zeichnungen: [
        form('linie', [P(47, 8), P(47.1, 8.1)], { bezeichnung: 'A & B' }),
        form('freihand', [P(47, 8), P(47.01, 8.01), P(47.02, 8)]),
        form('flaeche', dreieck),
        form('rechteck', [P(47, 8), P(47.1, 8.1)]),
        form('kreis', [P(47, 8)], { radiusM: 500 }),
        form('text', [P(47.5, 8.5)], { text: 'Treffpunkt' }),
        { ...form('raum', dreieck, { raumArt: 'bereitstellung', bezeichnung: 'BR' }), ebeneId: eb.id },
      ],
    });
    await ltg.warte('zeichnungen');

    const gj = await (await s.api('/api/export.geojson', { token: ltgB.token })).json();
    const zf = gj.features.filter((f: { properties: { art: string } }) => f.properties.art === 'zeichnung');
    expect(zf).toHaveLength(7);
    const typ = (form: string) => zf.find((f: { properties: { form: string } }) => f.properties.form === form);
    expect(typ('linie').geometry.type).toBe('LineString');
    expect(typ('freihand').geometry.type).toBe('LineString');
    expect(typ('flaeche').geometry).toMatchObject({ type: 'Polygon' });
    expect(typ('flaeche').geometry.coordinates[0]).toHaveLength(4); // geschlossen
    expect(typ('rechteck').geometry.coordinates[0]).toHaveLength(5);
    expect(typ('text').geometry).toEqual({ type: 'Point', coordinates: [8.5, 47.5] });
    expect(typ('kreis').geometry.type).toBe('Polygon');
    expect(typ('kreis').properties).toMatchObject({ radiusM: 500, mittelpunkt: P(47, 8) });
    expect(typ('raum').properties).toMatchObject({ raumArt: 'bereitstellung', ebene: 'Räume', bezeichnung: 'BR' });
    expect(gj.properties.ebenen).toHaveLength(2);

    const gpx = await (await s.api('/api/export.gpx', { token: ltgB.token })).text();
    expect(gpx).toContain('<rte><name>A &amp; B</name>');
    expect((gpx.match(/<rte>/g) ?? []).length).toBe(4); // linie, flaeche, rechteck, raum
    expect(gpx).toContain('<trk><name>freihand</name>');
    expect(gpx).toContain('<wpt lat="47.5" lon="8.5">');
    expect(gpx).toContain('Radius: 500 m');
    // GPX 1.1: erst alle wpt, dann rte, dann trk (strenge Programme lehnen sonst ab)
    expect(gpx.lastIndexOf('<wpt ')).toBeLessThan(gpx.indexOf('<rte>'));
    expect(gpx.lastIndexOf('<rte>')).toBeLessThan(gpx.indexOf('<trk>'));

    // Löschen der Lage löscht alles mit
    const db = () => new DatabaseSync(join(s.dataDir, 'lagebild.sqlite'));
    const zaehle = () => {
      const d = db();
      const n = Number((d.prepare('SELECT COUNT(*) AS n FROM eintrag WHERE lage_id = ? AND art IN (?, ?, ?)').get(l.lageId, 'zeichnung', 'ebene', 'bloodhound') as { n: number }).n);
      d.close();
      return n;
    };
    expect(zaehle()).toBe(9);
    expect((await s.api('/api/lage', { method: 'DELETE', token: ltgB.token })).status).toBe(204);
    expect(zaehle()).toBe(0);
  });
});
