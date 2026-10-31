// WebSocket als I/O-Schicht: Anmeldung, Verteilen an die richtigen Empfänger, Speichern, Limits. Die Fachregeln selbst prüft shared/regeln.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { STALE_MAX_MS, STANDARD_STIL, type Position } from '../../shared/protocol.ts';
import { MAX_PROTOKOLL_ZEICHEN_JE_LAGE } from '../src/ws.ts';
import { pause, SIDC, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const pos = (lat: number, lon: number, t = Date.now()): Position => ({ lat, lon, alt: 500, ce: 5, kurs: 90, tempo: 1, t });
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const roherSocket = () => new WebSocket(s.url.replace('http', 'ws') + '/ws');

/** Lage mit Leitung und zwei Teilnehmenden (A in Zug 1, B in Zug 2), alle verbunden. */
async function szenario() {
  const l = await s.lage();
  const ltgB = await s.beitreten(l.leitungCode, 'Leitung', 'Stab');
  const aB = await s.beitreten(l.teilnehmerCode, 'Adler', 'Zug 1');
  const bB = await s.beitreten(l.teilnehmerCode, 'Bär', 'Zug 2');
  const ltg = await verbinde(s.url, ltgB.token);
  const a = await verbinde(s.url, aB.token);
  const b = await verbinde(s.url, bB.token);
  return { l, ltg, a, b, ltgB, aB, bB };
}

describe('Anmeldung', () => {
  it('hallo liefert Snapshot mit online-Flag; ungültiges Token und fehlendes hallo beenden die Verbindung', async () => {
    const { ltg, a, aB } = await szenario();
    expect(a.snapshot.ich).toBe(aB.teilnehmerId);
    expect(a.snapshot.teilnehmer.find((t) => t.id === aB.teilnehmerId)?.online).toBe(true);
    expect(ltg.snapshot.teilnehmer).toHaveLength(3);

    const falsch = roherSocket();
    const msgs: string[] = [];
    falsch.on('message', (d) => msgs.push(d.toString()));
    const code = new Promise((ok) => falsch.on('close', ok));
    await new Promise((ok) => falsch.once('open', ok));
    falsch.send(JSON.stringify({ typ: 'hallo', token: 'x'.repeat(43) }));
    expect(await code).toBe(4001);
    expect(msgs).toEqual([JSON.stringify({ typ: 'beendet' })]);

    const ohne = roherSocket();
    const code2 = new Promise((ok) => ohne.on('close', ok));
    await new Promise((ok) => ohne.once('open', ok));
    ohne.send(JSON.stringify({ typ: 'pos', pos: pos(47, 8) }));
    expect(await code2).toBe(4003);
  });

  it('ungültige Nachrichten und unrealistische Zeitstempel ergeben fehler, nichts wird verteilt, Verbindung bleibt', async () => {
    const { a, b } = await szenario();
    a.senden({ typ: 'gibtsnicht' });
    expect((await a.warte('fehler')).meldung).toBe('Ungültige Nachricht');
    a.ws.send('kein json');
    await a.warte('fehler');
    a.senden({ typ: 'pos', pos: { ...pos(47, 8), t: 1e300 } });
    await a.warte('fehler');
    a.senden({ typ: 'sichtung', sichtung: { lat: 47, lon: 8, sidc: SIDC, groesse: '', taetigkeit: '', einheit: '', zeit: -1e20, ausruestung: '', bemerkung: '', vertrauen: 'unsicher', fotoId: null } });
    await a.warte('fehler');
    await pause(100);
    expect(b.empfangen.some((m) => m.typ === 'pos' || m.typ === 'sichtung')).toBe(false);
    a.senden({ typ: 'chat', an: { art: 'alle' }, text: 'noch da' });
    await a.warte('chat');
  });

  it('Limits gelten je Teilnehmer, nicht je Verbindung; höchstens 3 Verbindungen je Token; ohne hallo je IP begrenzt', async () => {
    const { a, b, aB } = await szenario();
    const a2 = await verbinde(s.url, aB.token);
    // pos-Drossel über beide Verbindungen
    a.senden({ typ: 'pos', pos: pos(47.1, 8.1, 1000) });
    await b.warte('pos');
    a2.senden({ typ: 'pos', pos: pos(47.2, 8.2, 2000) });
    await pause(150);
    expect(b.empfangen.some((m) => m.typ === 'pos')).toBe(false);
    // Nachrichtenlimit (50 / 10 s) über beide Verbindungen
    for (let i = 0; i < 30; i++) {
      a.senden({ typ: 'gibtsnicht' });
      a2.senden({ typ: 'gibtsnicht' });
    }
    await expect(Promise.race([a.warte('fehler', (m) => m.meldung === 'Zu viele Nachrichten'), a2.warte('fehler', (m) => m.meldung === 'Zu viele Nachrichten')])).resolves.toBeTruthy();
    // vierte Verbindung schliesst die älteste
    const a3 = await verbinde(s.url, aB.token);
    const a4 = await verbinde(s.url, aB.token);
    expect(await a.geschlossen).toBe(4004);
    for (const c of [a2, a3, a4]) c.zu();

    const roh = Array.from({ length: 21 }, roherSocket);
    const codes = await Promise.all(roh.map((ws) => new Promise<number>((ok) => ws.on('close', ok).on('open', () => setTimeout(() => ok(0), 300)))));
    expect(codes.filter((c) => c === 4029)).toHaveLength(1);
    for (const ws of roh) ws.close();
  });
});

describe('Verteilen und Speichern', () => {
  it('pos: verteilt, als Spur gespeichert (inkl. staleNach), auf 1 s gedrosselt; Emission Control; staleNach über Maximum abgelehnt', async () => {
    const { l, a, b, aB } = await szenario();
    a.senden({ typ: 'pos', pos: { ...pos(47.1, 8.1, 1000), staleNach: 25_000 } });
    a.senden({ typ: 'pos', pos: pos(47.2, 8.2, 2000) }); // gedrosselt
    const p = await b.warte('pos');
    expect(p).toMatchObject({ id: aB.teilnehmerId, pos: { lat: 47.1, staleNach: 25_000 } });
    await pause(1050);
    a.senden({ typ: 'pos', pos: pos(47.3, 8.3, 3000) });
    await b.warte('pos', (m) => m.pos.lat === 47.3);
    a.senden({ typ: 'sendetPos', an: false });
    await b.warte('teilnehmer', (m) => m.teilnehmer.sendetPos === false);
    await pause(1050);
    a.senden({ typ: 'pos', pos: pos(47.4, 8.4, 4000) }); // verworfen
    await pause(150);
    expect(b.empfangen.some((m) => m.typ === 'pos')).toBe(false);

    const spuren = await (await s.api('/api/spuren?seit=0', { token: aB.token })).json();
    expect(spuren[aB.teilnehmerId].map((x: Position) => [x.t, x.staleNach])).toEqual([[1000, 25_000], [3000, undefined]]);
    const seit = await (await s.api('/api/spuren?seit=2000', { token: aB.token })).json();
    expect(seit[aB.teilnehmerId]).toHaveLength(1);
    const neu = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Z')).token);
    expect(neu.snapshot.teilnehmer.find((t) => t.id === aB.teilnehmerId)?.pos?.t).toBe(3000);
    neu.zu();
    a.senden({ typ: 'pos', pos: { ...pos(47.2, 8.2), staleNach: STALE_MAX_MS + 1 } });
    await a.warte('fehler');
  });

  it('Chat geht nur an Empfänger (alle, Einheit, Person), auch im Snapshot', async () => {
    const { ltg, a, b, bB, ltgB } = await szenario();
    a.senden({ typ: 'chat', an: { art: 'einheit', einheit: 'Zug 2' }, text: 'an Zug 2' });
    expect((await b.warte('chat')).chat.text).toBe('an Zug 2');
    expect((await a.warte('chat')).chat.text).toBe('an Zug 2'); // Absender sieht eigene
    a.senden({ typ: 'chat', an: { art: 'person', id: bB.teilnehmerId }, text: 'privat' });
    expect((await b.warte('chat')).chat.text).toBe('privat');
    a.senden({ typ: 'chat', an: { art: 'alle' }, text: 'alle' });
    expect((await ltg.warte('chat')).chat.text).toBe('alle');
    await b.warte('chat');
    // Leitung hat weder Einheits- noch Privatnachricht bekommen
    expect(ltg.empfangen.some((m) => m.typ === 'chat')).toBe(false);
    expect((await verbinde(s.url, bB.token)).snapshot.chat.map((c) => c.text)).toEqual(['an Zug 2', 'privat', 'alle']);
    expect((await verbinde(s.url, ltgB.token)).snapshot.chat.map((c) => c.text)).toEqual(['alle']);
    const neu = await verbinde(s.url, (await s.beitreten((await s.lage()).teilnehmerCode, 'X')).token);
    expect(neu.snapshot.chat).toHaveLength(0);
    neu.zu();
  });

  it('Status: Teilnehmer-Delta mit online-Flag und Meldung an alle; Trennen setzt online:false', async () => {
    const { ltg, a, b, aB, bB } = await szenario();
    a.senden({ typ: 'status', status: 'halt', text: 'Pause' });
    const t = (await ltg.warte('teilnehmer', (m) => m.teilnehmer.status === 'halt')).teilnehmer;
    expect(t).toMatchObject({ statusText: 'Pause', online: true });
    expect((await ltg.warte('meldung')).meldung).toMatchObject({ von: aB.teilnehmerId, status: 'halt', text: 'Pause' });
    expect((await b.warte('meldung')).meldung.text).toBe('Pause');
    b.zu();
    const m = await a.warte('teilnehmer', (x) => x.teilnehmer.id === bB.teilnehmerId && !x.teilnehmer.online);
    expect(m.teilnehmer.online).toBe(false);
  });

  it('Teilnehmer entfernen: Verbindung beendet, Token ungültig, teilnehmer.weg an die anderen; Export bleibt der Leitung', async () => {
    const { ltg, a, b, bB, aB, ltgB } = await szenario();
    const set = [{ key: 'ok', label: 'OK', farbe: '#00ff00' }];
    ltg.senden({ typ: 'lage.statusSet', statusSet: set });
    expect((await a.warte('lage')).lage.statusSet).toEqual(set);
    ltg.senden({ typ: 'teilnehmer.entfernen', id: bB.teilnehmerId });
    await b.warte('beendet');
    expect(await b.geschlossen).toBe(4000);
    expect((await a.warte('teilnehmer.weg')).id).toBe(bB.teilnehmerId);
    expect((await s.api('/api/spuren', { token: bB.token })).status).toBe(401);
    ltg.senden({ typ: 'lage.phase', phase: 'an' });
    await a.warte('lage', (m) => m.lage.phasen.at(-1)?.phase === 'an');
    expect((await s.api('/api/export.geojson', { token: aB.token })).status).toBe(403);
    expect((await s.api('/api/export.geojson', { token: ltgB.token })).status).toBe(200);
  });

  it('AN: alle bleiben verbunden, nur lesen; Beitreten und Fotos 410; Wiederverbinden mit Snapshot; zurück nach LV', async () => {
    const { l, ltg, a, aB } = await szenario();
    ltg.senden({ typ: 'lage.phase', phase: 'an' });
    expect((await a.warte('lage')).lage.phasen.map((p) => p.phase)).toEqual(['lv', 'an']);
    a.senden({ typ: 'chat', an: { art: 'alle' }, text: 'x' });
    expect((await a.warte('fehler')).meldung).toBe('Nachbearbeitung: nur lesen');
    const r = await s.api('/api/beitreten', { method: 'POST', body: JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC }) });
    expect(r.status).toBe(410);
    expect((await s.api('/api/foto', { method: 'POST', token: aB.token, body: JPEG })).status).toBe(410);
    a.zu();
    const neu = await verbinde(s.url, aB.token);
    expect(neu.snapshot.lage.phasen.at(-1)?.phase).toBe('an');
    ltg.senden({ typ: 'notiz.neu', t: Date.now() - 1000, text: 'Funkdisziplin' });
    expect((await neu.warte('notiz')).notiz.text).toBe('Funkdisziplin');
    expect((await verbinde(s.url, aB.token)).snapshot.notizen.map((n) => n.text)).toEqual(['Funkdisziplin']);
    ltg.senden({ typ: 'lage.phase', phase: 'lv' });
    await neu.warte('lage', (m) => m.lage.phasen.at(-1)?.phase === 'lv');
    neu.senden({ typ: 'chat', an: { art: 'alle' }, text: 'weiter' });
    await ltg.warte('chat');
  });

  it('Alarm: an alle, aktiv im Snapshot, Rückfall auf letzte Position; höchstens 10 Auslösungen je Minute und Person', async () => {
    const { l, ltg, a, b, bB } = await szenario();
    b.senden({ typ: 'pos', pos: pos(46.9, 7.4) });
    await a.warte('pos');
    b.senden({ typ: 'alarm.ausloesen', art: 'notfall', pos: null }); // Rückfall: letzte bekannte Position
    const { alarm } = await a.warte('alarm');
    expect(alarm).toMatchObject({ art: 'notfall', von: bB.teilnehmerId, lat: 46.9, aufgehobenAm: null });
    a.senden({ typ: 'alarm.quittieren', id: alarm.id });
    expect((await ltg.warte('alarm', (m) => m.alarm.quittiertVon.length === 1)).alarm.quittiertVon).toHaveLength(1);
    const neu = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Y')).token);
    expect(neu.snapshot.alarme.map((x) => x.id)).toEqual([alarm.id]); // aktiv im Snapshot
    neu.zu();
    ltg.senden({ typ: 'alarm.aufheben', id: alarm.id });
    expect((await b.warte('alarm', (m) => m.alarm.aufgehobenAm !== null)).alarm.id).toBe(alarm.id);

    for (let i = 0; i < 10; i++) b.senden({ typ: 'alarm.ausloesen', art: i % 2 ? 'notfall' : 'kontakt', pos: null });
    expect((await b.warte('fehler')).meldung).toMatch(/Zu viele Alarme/);
    await pause(100);
    // 9 weitere kamen durch (jeder ersetzt den vorigen), der 11. je Minute nicht
    expect(a.empfangen.filter((m) => m.typ === 'alarm' && m.alarm.id !== alarm.id && m.alarm.aufgehobenAm === null)).toHaveLength(9);
    expect(b.empfangen.filter((m) => m.typ === 'fehler')).toHaveLength(0);
  });

  it('Foto: nur Bildformate (Magic Bytes), höchstens 2 MB, nur in gleicher Lage lesbar; Sichtung verweist aufs Foto', async () => {
    const { a, b, aB, bB } = await szenario();
    const fremd = await s.beitreten((await s.lage()).teilnehmerCode, 'Fremd');
    const gif = await s.api('/api/foto', { method: 'POST', token: aB.token, body: Buffer.from('GIF89a....'), headers: { 'content-type': 'image/jpeg' } });
    expect(gif.status).toBe(415);
    const gross = await s.api('/api/foto', { method: 'POST', token: aB.token, body: Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]) }).catch(() => undefined);
    expect(gross?.status).toBe(413);
    const r = await s.api('/api/foto', { method: 'POST', token: aB.token, body: JPEG, headers: { 'content-type': 'image/jpeg' } });
    expect(r.status).toBe(201);
    const { fotoId } = await r.json();
    const bild = await s.api(`/api/foto/${fotoId}`, { token: bB.token });
    expect(bild.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await bild.arrayBuffer()).equals(JPEG)).toBe(true);
    expect((await s.api(`/api/foto/${fotoId}`, { token: fremd.token })).status).toBe(404);
    expect((await s.api(`/api/foto/${fotoId}`)).status).toBe(401);

    const sichtung = { lat: 47, lon: 8, sidc: SIDC, groesse: 'Gruppe', taetigkeit: 'Marsch', einheit: 'Rot', zeit: Date.now(), ausruestung: 'Fz', bemerkung: '', vertrauen: 'wahrscheinlich', fotoId };
    a.senden({ typ: 'sichtung', sichtung });
    expect((await b.warte('sichtung')).sichtung).toMatchObject({ fotoId, von: aB.teilnehmerId });
    a.senden({ typ: 'sichtung', sichtung: { ...sichtung, fotoId: '00000000-0000-0000-0000-000000000000' } });
    await a.warte('fehler');
  });

  it('Teilnehmer-Code erneuern: nur Leitung, Klartext nur an sie; alter Code ungültig, bestehende Tokens bleiben', async () => {
    const { l, ltg, a, aB } = await szenario();
    a.senden({ typ: 'lage.codeErneuern' });
    expect((await a.warte('fehler')).meldung).toMatch(/Leitung/);
    ltg.senden({ typ: 'lage.codeErneuern' });
    const { teilnehmerCode } = await ltg.warte('code');
    expect(teilnehmerCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    await pause(100);
    expect(a.empfangen.some((m) => m.typ === 'code')).toBe(false); // Klartext nur an die Leitung
    const alt = await s.api('/api/beitreten', { method: 'POST', body: JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC }) });
    expect(alt.status).toBe(403);
    expect((await s.beitreten(teilnehmerCode, 'Neu')).rolle).toBe('teilnehmer');
    expect((await s.api('/api/spuren', { token: aB.token })).status).toBe(200);
  });
});

describe('Protokoll', () => {
  it('Deltas mit Zeit und Autor, Löschungen bleiben, Chat nach Sichtbarkeit; Bestandslage: Einträge von vor dem Protokoll bleiben', async () => {
    const { l, ltg, a, b, aB, bB, ltgB } = await szenario();
    a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung: 'Brücke', notiz: '' } });
    const { marker } = await b.warte('marker');
    a.senden({ typ: 'marker.loeschen', id: marker.id });
    await b.warte('marker.geloescht');
    a.senden({ typ: 'chat', an: { art: 'person', id: ltgB.teilnehmerId }, text: 'nur Leitung' });
    await ltg.warte('chat');
    a.senden({ typ: 'pos', pos: pos(47, 8) });
    await b.warte('pos');
    const p = await (await s.api('/api/protokoll', { token: bB.token })).json();
    expect(p.ereignisse.map((e: { d: { typ: string } }) => e.d.typ)).toEqual(['marker', 'marker.geloescht']);
    expect(p.ereignisse[1]).toMatchObject({ von: aB.teilnehmerId, t: expect.any(Number) });
    expect(p.spuren).toBeUndefined(); // Spuren über /api/spuren
    expect(p.weiter).toBeNull();
    expect(p.teilnehmer).toHaveLength(3);
    const fuerLtg = await (await s.api('/api/protokoll', { token: ltgB.token })).json();
    expect(fuerLtg.ereignisse.map((e: { d: { typ: string } }) => e.d.typ)).toEqual(['marker', 'marker.geloescht', 'chat']);

    // Lage von vor dem Protokoll: Eintrag da, Protokoll leer → aus dem Bestand ergänzt
    a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung: 'Alt', notiz: '' } });
    await b.warte('marker', (m) => m.marker.bezeichnung === 'Alt');
    const roh = new DatabaseSync(join(s.dataDir, 'lagebild.sqlite'));
    roh.prepare('DELETE FROM protokoll WHERE lage_id = ?').run(l.lageId);
    roh.close();
    await pause(5);
    a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung: 'Neu', notiz: '' } });
    await b.warte('marker', (m) => m.marker.bezeichnung === 'Neu');
    const p2 = await (await s.api('/api/protokoll', { token: bB.token })).json();
    expect(p2.ereignisse.map((e: { d: { typ: string; marker?: { bezeichnung: string } } }) => e.d.marker?.bezeichnung ?? e.d.typ)).toEqual(['Alt', 'Neu']);
  });

  it('seitenweise: max je Seite, weiter-Marke, keine Seite endet mitten in einer Millisekunde; Parameter geprüft; Rate-Limit beim Öffnen', async () => {
    const { ltg, a, b, bB } = await szenario();
    for (const bezeichnung of ['M1', 'M2', 'M3']) {
      a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung, notiz: '' } });
      await b.warte('marker', (m) => m.marker.bezeichnung === bezeichnung);
      await pause(2);
    }
    // zeichnung.neu: Delta und Meldung mit derselben Zeit
    ltg.senden({ typ: 'zeichnung.neu', zeichnungen: [{ ebeneId: b.snapshot.ebenen[0].id, art: 'linie', punkte: [{ lat: 47, lon: 8 }, { lat: 47.1, lon: 8 }], text: '', bezeichnung: '', stil: STANDARD_STIL }] });
    await b.warte('zeichnungen');
    const alle = (await (await s.api('/api/protokoll', { token: bB.token })).json()).ereignisse;
    expect(alle.map((e: { d: { typ: string } }) => e.d.typ)).toEqual(['marker', 'marker', 'marker', 'zeichnungen', 'meldung']);
    const seiten: { typ: string }[][] = [];
    let seit: number | null = -1;
    while (seit !== null) {
      const p = await (await s.api(`/api/protokoll?seit=${seit}&max=4`, { token: bB.token })).json();
      seiten.push(p.ereignisse.map((e: { d: { typ: string } }) => e.d.typ));
      seit = p.weiter;
    }
    expect(seiten).toEqual([['marker', 'marker', 'marker'], ['zeichnungen', 'meldung']]);
    expect((await s.api('/api/protokoll?max=0', { token: bB.token })).status).toBe(400);
    expect((await s.api('/api/protokoll?seit=x', { token: bB.token })).status).toBe(400);
    // 6 Wiedergaben (erste Seite) je Minute: eine ist oben schon verbraucht
    const status: number[] = [];
    for (let i = 0; i < 6; i++) status.push((await s.api('/api/protokoll', { token: bB.token })).status);
    expect(status).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('voll: nichts mehr aufzeichnen, Leitung einmal warnen, live läuft weiter', async () => {
    const { l, ltg, a, b } = await szenario();
    const roh = new DatabaseSync(join(s.dataDir, 'lagebild.sqlite'));
    const zeilen = () => Number(roh.prepare('SELECT COUNT(*) AS n FROM protokoll WHERE lage_id = ?').get(l.lageId)!.n);
    // Lage bis knapp unter die Grenze füllen (ein Eintrag, damit der Test schnell bleibt)
    roh.prepare("INSERT INTO protokoll (lage_id, t, von, daten) VALUES (?, 0, 'x', printf('%.*c', ?, 'x'))").run(l.lageId, MAX_PROTOKOLL_ZEICHEN_JE_LAGE - 10);
    const setze = (bezeichnung: string) => a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung, notiz: '' } });
    setze('Eins');
    await b.warte('marker', (m) => m.marker.bezeichnung === 'Eins');
    const warnung = await ltg.warte('meldung', (m) => m.meldung.text.startsWith('Protokoll voll'));
    expect(warnung.meldung.nur).toEqual([]);
    setze('Zwei');
    await b.warte('marker', (m) => m.marker.bezeichnung === 'Zwei');
    expect(zeilen()).toBe(1);
    await pause(50);
    expect(ltg.empfangen.some((m) => m.typ === 'meldung' && m.meldung.text.startsWith('Protokoll voll'))).toBe(false);
    expect(b.empfangen.some((m) => m.typ === 'meldung' && m.meldung.text.startsWith('Protokoll voll'))).toBe(false);
    roh.close();
  });
});

describe('Export und Löschen', () => {
  it('GPX (wpt vor trk, escaped) und GeoJSON mit Spuren', async () => {
    const { ltg, a, b, ltgB, aB } = await szenario();
    a.senden({ typ: 'pos', pos: pos(47.1, 8.1, Date.UTC(2026, 9, 28, 10)) });
    await b.warte('pos');
    await pause(1050);
    a.senden({ typ: 'pos', pos: pos(47.2, 8.2, Date.UTC(2026, 9, 28, 10, 1)) });
    await b.warte('pos');
    a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung: 'KP <1> & Co', notiz: 'n' } });
    await ltg.warte('marker');

    const g = await s.api('/api/export.gpx', { token: ltgB.token });
    expect(g.headers.get('content-type')).toContain('gpx');
    expect(g.headers.get('content-disposition')).toContain('attachment');
    const text = await g.text();
    expect(text).toContain('<gpx version="1.1"');
    expect(text).toContain('<trk><name>Adler</name>');
    expect(text.match(/<trkpt /g)).toHaveLength(2);
    expect(text).toContain('<name>KP &lt;1&gt; &amp; Co</name>');
    expect(text.indexOf('<wpt')).toBeLessThan(text.indexOf('<trk>'));

    const j = await (await s.api('/api/export.geojson', { token: ltgB.token })).json();
    expect(j.type).toBe('FeatureCollection');
    const spur = j.features.find((f: { properties: { art: string } }) => f.properties.art === 'spur');
    expect(spur).toMatchObject({ geometry: { type: 'LineString', coordinates: [[8.1, 47.1, 500], [8.2, 47.2, 500]] }, properties: { teilnehmerId: aB.teilnehmerId } });
    expect(j.features.some((f: { properties: { art: string } }) => f.properties.art === 'marker')).toBe(true);
  });

  it('Lage löschen entfernt Daten und Fotos, trennt Verbindungen, Codes und Tokens werden ungültig', async () => {
    const { l, a, ltgB, aB } = await szenario();
    const r = await s.api('/api/foto', { method: 'POST', token: aB.token, body: JPEG });
    expect(r.status).toBe(201);
    const fotoDir = join(s.dataDir, 'fotos', l.lageId);
    expect(readdirSync(fotoDir)).toHaveLength(1);
    expect((await s.api('/api/lage', { method: 'DELETE', token: ltgB.token })).status).toBe(204);
    await a.warte('beendet');
    expect(existsSync(fotoDir)).toBe(false);
    expect((await s.api('/api/spuren', { token: aB.token })).status).toBe(401);
    expect((await s.api('/api/beitreten', { method: 'POST', body: JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC }) })).status).toBe(403);
  });
});
