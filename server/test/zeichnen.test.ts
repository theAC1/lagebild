// Zeichnungen: Vertragsgrenzen (zod-Refinements), Verteilen/Snapshot, Grössenbudget, Export. Rechte und Ebenenregeln prüft shared/regeln.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { standardEbeneId, STANDARD_STIL, ZeichnungInput, ClientMsg, type Teilnehmer, type ZeichnungInput as ZInput } from '../../shared/protocol.ts';
import { oeffneDb } from '../src/db.ts';
import { istAbgelehnt, MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE, wende, type Befehl } from '../../shared/regeln/index.ts';
import { sichtAusDb, speichere } from '../src/regeln.ts';
import { testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const P = (lat: number, lon: number) => ({ lat, lon });
const linie = (ebeneId: string, extra: Partial<ZInput> = {}): ZInput => ({
  ebeneId, art: 'linie', punkte: [P(47, 8), P(47.1, 8.1)], text: '', bezeichnung: '', stil: STANDARD_STIL, ...extra,
});

async function szenario() {
  const l = await s.lage();
  const ltgB = l;
  const aB = await s.beitreten(l.teilnehmerCode, 'Adler', 'Zug 1');
  const bB = await s.beitreten(l.teilnehmerCode, 'Bär', 'Zug 2');
  const ltg = await verbinde(s.url, ltgB.token);
  const a = await verbinde(s.url, aB.token);
  const b = await verbinde(s.url, bB.token);
  return { l, ltg, a, b, ltgB, aB, bB, std: standardEbeneId(ltgB.lageId) };
}
const fehlerText = async (c: Awaited<ReturnType<typeof verbinde>>) => (await c.warte('fehler')).meldung;

describe('Vertrag', () => {
  const ok = (z: Record<string, unknown>) => ZeichnungInput.safeParse({ ebeneId: 'e', text: '', bezeichnung: '', stil: STANDARD_STIL, ...z }).success;
  const f = [P(1, 1), P(2, 2), P(3, 1)];
  it('je Art: Punktzahl, radiusM nur beim Kreis, Text nicht leer, raumArt nur beim Raum', () => {
    const faelle: [boolean, Record<string, unknown>][] = [
      [false, { art: 'linie', punkte: [P(1, 1)] }],
      [true, { art: 'linie', punkte: [P(1, 1), P(2, 2)] }],
      [false, { art: 'flaeche', punkte: [P(1, 1), P(2, 2)] }],
      [true, { art: 'flaeche', punkte: f }],
      [true, { art: 'rechteck', punkte: [P(1, 1), P(2, 2)] }],
      [false, { art: 'rechteck', punkte: f }],
      [true, { art: 'kreis', punkte: [P(1, 1)], radiusM: 50 }],
      [false, { art: 'kreis', punkte: [P(1, 1)] }],
      [false, { art: 'kreis', punkte: [P(1, 1)], radiusM: 0 }],
      [false, { art: 'kreis', punkte: [P(1, 1), P(2, 2)], radiusM: 5 }],
      [false, { art: 'linie', punkte: [P(1, 1), P(2, 2)], radiusM: 5 }],
      [true, { art: 'text', punkte: [P(1, 1)], text: 'Treffpunkt' }],
      [false, { art: 'text', punkte: [P(1, 1)], text: '' }],
      [false, { art: 'text', punkte: [P(1, 1), P(2, 2)], text: 'x' }],
      [true, { art: 'raum', punkte: f, raumArt: 'ziel' }],
      [false, { art: 'raum', punkte: f }],
      [false, { art: 'flaeche', punkte: f, raumArt: 'ziel' }],
    ];
    for (const [erwartet, z] of faelle) expect(ok(z), JSON.stringify(z)).toBe(erwartet);
  });
  it('Grenzen: Grenze 2000 / Linie 500 Punkte, Stil, Bezeichnung, Koordinaten; höchstens 100 je Nachricht; Bloodhound-Ziel passt zur Art', () => {
    const viele = (n: number) => Array.from({ length: n }, (_, i) => P(47 + i / 1e5, 8));
    expect(ok({ art: 'grenze', punkte: viele(2000) })).toBe(true);
    expect(ok({ art: 'grenze', punkte: viele(2001) })).toBe(false);
    expect(ok({ art: 'linie', punkte: viele(500) })).toBe(true);
    expect(ok({ art: 'linie', punkte: viele(501) })).toBe(false);
    const l = { art: 'linie', punkte: viele(2) };
    for (const stil of [{ breite: 13 }, { breite: 0.5 }, { deckkraft: 1.1 }, { farbe: 'rot' }, { strich: 'strich' }]) expect(ok({ ...l, stil: { ...STANDARD_STIL, ...stil } }), JSON.stringify(stil)).toBe(false);
    expect(ok({ ...l, stil: { ...STANDARD_STIL, fuellung: '#00ff00', strich: 'gepunktet' } })).toBe(true);
    expect(ok({ ...l, bezeichnung: 'x'.repeat(201) })).toBe(false);
    expect(ok({ ...l, punkte: [P(91, 0), P(0, 0)] })).toBe(false);
    const n = (k: number) => ClientMsg.safeParse({ typ: 'zeichnung.neu', zeichnungen: Array.from({ length: k }, () => linie('e')) }).success;
    expect([n(100), n(101)]).toEqual([true, false]);
    const m = (ziel: unknown) => ClientMsg.safeParse({ typ: 'bloodhound.auftrag', an: 'x', ziel }).success;
    expect(m({ art: 'punkt', punkt: P(1, 1) })).toBe(true);
    expect(m({ art: 'punkt' })).toBe(false);
    expect(m({ art: 'marker', id: 'm' })).toBe(true);
    expect(m({ art: 'marker' })).toBe(false);
    expect(m({ art: 'marker', id: 'm', punkt: P(1, 1) })).toBe(false);
  });
});

describe('Server', () => {
  it('Snapshot mit Standard-Ebene; neue Zeichnung geht an alle, in Snapshot und Meldungslog; 2000 Punkte passen durch den WebSocket; Ablehnung als fehler', async () => {
    const { l, a, b, std, aB } = await szenario();
    expect(a.snapshot.ebenen).toMatchObject([{ id: std, name: 'Allgemein', gesperrt: false, reihenfolge: 0 }]);
    expect(a.snapshot.zeichnungen).toEqual([]);
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { bezeichnung: 'Route' })] });
    const m = await b.warte('zeichnungen');
    expect(m.zeichnungen[0]).toMatchObject({ von: aB.teilnehmerId, ebeneId: std, art: 'linie', bezeichnung: 'Route' });
    await a.warte('zeichnungen'); // Absender sieht sie auch
    expect((await b.warte('meldung', (x) => x.meldung.text.startsWith('Zeichnung: Linie'))).meldung.von).toBe(aB.teilnehmerId);
    const punkte = Array.from({ length: 2000 }, (_, i) => P(46 + i / 10000, 7.123456 + i / 10000));
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { art: 'grenze', punkte })] });
    expect((await b.warte('zeichnungen')).zeichnungen[0].punkte).toHaveLength(2000);
    const c = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Neu')).token);
    expect(c.snapshot.zeichnungen).toHaveLength(2);
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie(std, { punkte: [P(1, 1)] })] });
    expect(await fehlerText(a)).toBe('Ungültige Nachricht');
    a.senden({ typ: 'zeichnung.neu', zeichnungen: [linie('gibts-nicht')] });
    expect(await fehlerText(a)).toBe('Ebene nicht gefunden');
  });

  it('Grössenbudget je Lage: neu und wachsende Änderung werden abgelehnt, schrumpfende nicht', () => {
    const db = oeffneDb(':memory:');
    const lage = { id: 'L', name: 'L', statusSet: [], erstelltAm: 0, phasen: [{ phase: 'lv' as const, t: 0 }] };
    db.lageErstellen(lage, { teilnehmer: 'tn', gruppenfuehrer: 'gf', beobachter: 'beob' });
    const std = db.ebenenSicherstellen(lage.id)[0].id;
    const fehler: string[] = [];
    const t = { id: 'T', rolle: 'teilnehmer' } as Teilnehmer;
    const sende = (m: Befehl) => {
      const r = wende(sichtAusDb(db, lage), { autor: t, msg: m, jetzt: 1, neueId: randomUUID });
      if (istAbgelehnt(r)) fehler.push(r.abgelehnt);
      else speichere(db, lage.id, r.aenderungen);
    };
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

  it('Export enthält Zeichnungen (GeoJSON alle, GPX sinnvoll geordnet); Löschen der Lage entfernt alles', async () => {
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

    const zaehle = () => {
      const d = new DatabaseSync(join(s.dataDir, 'lagebild.sqlite'));
      const n = Number((d.prepare('SELECT COUNT(*) AS n FROM eintrag WHERE lage_id = ? AND art IN (?, ?, ?)').get(l.lageId, 'zeichnung', 'ebene', 'bloodhound') as { n: number }).n);
      d.close();
      return n;
    };
    expect(zaehle()).toBe(9);
    expect((await s.api('/api/lage', { method: 'DELETE', token: ltgB.token })).status).toBe(204);
    expect(zaehle()).toBe(0);
  });
});
