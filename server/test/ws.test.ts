import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STALE_MAX_MS, type Position } from '../../shared/protocol.ts';
import { pause, SIDC, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const pos = (lat: number, lon: number, t = Date.now()): Position => ({ lat, lon, alt: 500, ce: 5, kurs: 90, tempo: 1, t });
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

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

describe('WebSocket', () => {
  it('hallo liefert Snapshot; ungültiges Token wird beendet', async () => {
    const { ltg, a, aB } = await szenario();
    expect(a.snapshot.ich).toBe(aB.teilnehmerId);
    expect(a.snapshot.lage.statusSet.length).toBeGreaterThan(0);
    expect(a.snapshot.teilnehmer.find((t) => t.id === aB.teilnehmerId)?.online).toBe(true);
    expect(ltg.snapshot.teilnehmer).toHaveLength(3);

    const ws = new WebSocket(s.url.replace('http', 'ws') + '/ws');
    const msgs: string[] = [];
    ws.on('message', (d) => msgs.push(d.toString()));
    const code = new Promise((ok) => ws.on('close', ok));
    await new Promise((ok) => ws.once('open', ok));
    ws.send(JSON.stringify({ typ: 'hallo', token: 'x'.repeat(43) }));
    expect(await code).toBe(4001);
    expect(msgs).toEqual([JSON.stringify({ typ: 'beendet' })]);
  });

  it('erste Nachricht muss hallo sein', async () => {
    const ws = new WebSocket(s.url.replace('http', 'ws') + '/ws');
    const code = new Promise((ok) => ws.on('close', ok));
    await new Promise((ok) => ws.once('open', ok));
    ws.send(JSON.stringify({ typ: 'pos', pos: pos(47, 8) }));
    expect(await code).toBe(4003);
  });

  it('pos wird verteilt, gespeichert und auf 1 s gedrosselt; Emission Control', async () => {
    const { a, b, aB } = await szenario();
    a.senden({ typ: 'pos', pos: pos(47.1, 8.1, 1000) });
    a.senden({ typ: 'pos', pos: pos(47.2, 8.2, 2000) }); // gedrosselt
    const p = await b.warte('pos');
    expect(p).toMatchObject({ id: aB.teilnehmerId, pos: { lat: 47.1 } });
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
    expect(spuren[aB.teilnehmerId].map((x: Position) => x.t)).toEqual([1000, 3000]);
    const seit = await (await s.api('/api/spuren?seit=2000', { token: aB.token })).json();
    expect(seit[aB.teilnehmerId]).toHaveLength(1);
  });

  it('Chat-Filter: alle, Einheit, Person', async () => {
    const { ltg, a, b, bB } = await szenario();
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
    // Snapshot filtert ebenso
    const neu = await verbinde(s.url, (await s.beitreten((await s.lage()).teilnehmerCode, 'X')).token);
    expect(neu.snapshot.chat).toHaveLength(0);
    neu.zu();
  });

  it('Marker: Ersteller oder Leitung dürfen ändern/löschen', async () => {
    const { ltg, a, b } = await szenario();
    a.senden({ typ: 'marker.setzen', marker: { sidc: SIDC, lat: 47, lon: 8, bezeichnung: 'KP', notiz: '' } });
    const { marker } = await b.warte('marker');
    b.senden({ typ: 'marker.loeschen', id: marker.id });
    expect((await b.warte('fehler')).meldung).toMatch(/Berechtigung/);
    b.senden({ typ: 'marker.setzen', marker: { ...marker, bezeichnung: 'gekapert' } });
    await b.warte('fehler');
    a.senden({ typ: 'marker.setzen', marker: { id: marker.id, sidc: SIDC, lat: 47, lon: 8, bezeichnung: 'KP neu', notiz: '' } });
    expect((await ltg.warte('marker', (m) => m.marker.bezeichnung === 'KP neu')).marker.erstelltAm).toBe(marker.erstelltAm);
    ltg.senden({ typ: 'marker.loeschen', id: marker.id });
    expect((await a.warte('marker.geloescht')).id).toBe(marker.id);
  });

  it('Status: nur aus dem Status-Set, landet im Meldungslog', async () => {
    const { ltg, a, aB } = await szenario();
    a.senden({ typ: 'status', status: 'gibtsnicht', text: '' });
    await a.warte('fehler');
    a.senden({ typ: 'status', status: 'halt', text: 'Pause' });
    expect((await ltg.warte('teilnehmer', (m) => m.teilnehmer.status === 'halt')).teilnehmer.statusText).toBe('Pause');
    expect((await ltg.warte('meldung')).meldung).toMatchObject({ von: aB.teilnehmerId, status: 'halt', text: 'Pause' });
  });

  it('Leitung-only Aktionen', async () => {
    const { ltg, a, b, bB, aB, ltgB } = await szenario();
    const set = [{ key: 'ok', label: 'OK', farbe: '#00ff00' }];
    for (const m of [{ typ: 'lage.statusSet', statusSet: set }, { typ: 'lage.beenden' }, { typ: 'teilnehmer.entfernen', id: bB.teilnehmerId }]) {
      a.senden(m);
      expect((await a.warte('fehler')).meldung).toMatch(/Leitung/);
    }
    ltg.senden({ typ: 'lage.statusSet', statusSet: set });
    expect((await a.warte('lage')).lage.statusSet).toEqual(set);

    ltg.senden({ typ: 'teilnehmer.entfernen', id: bB.teilnehmerId });
    await b.warte('beendet');
    expect(await b.geschlossen).toBe(4000);
    expect((await a.warte('teilnehmer.weg')).id).toBe(bB.teilnehmerId);
    expect((await s.api('/api/spuren', { token: bB.token })).status).toBe(401);

    ltg.senden({ typ: 'lage.beenden' });
    await a.warte('beendet');
    await ltg.warte('beendet');
    // Export bleibt für die Leitung nach dem Beenden möglich, Teilnehmende nicht
    expect((await s.api('/api/export.geojson', { token: aB.token })).status).toBe(403);
    expect((await s.api('/api/export.geojson', { token: ltgB.token })).status).toBe(200);
  });

  it('beendete Lage: Beitreten 410, Wiederverbinden beendet', async () => {
    const { l, ltg, a, aB } = await szenario();
    ltg.senden({ typ: 'lage.beenden' });
    await a.warte('beendet');
    const r = await s.api('/api/beitreten', { method: 'POST', body: JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC }) });
    expect(r.status).toBe(410);
    await expect(verbinde(s.url, aB.token)).rejects.toThrow(/Timeout/);
  });

  it('Disconnect broadcastet online:false', async () => {
    const { a, b, bB } = await szenario();
    b.zu();
    const m = await a.warte('teilnehmer', (x) => x.teilnehmer.id === bB.teilnehmerId && !x.teilnehmer.online);
    expect(m.teilnehmer.online).toBe(false);
  });

  it('Alarm: auslösen, quittieren, aufheben nur Auslöser oder Leitung', async () => {
    const { l, ltg, a, b, bB } = await szenario();
    b.senden({ typ: 'pos', pos: pos(46.9, 7.4) });
    await a.warte('pos');
    b.senden({ typ: 'alarm.ausloesen', art: 'notfall', pos: null }); // Rückfall: letzte bekannte Position
    const { alarm } = await a.warte('alarm');
    expect(alarm).toMatchObject({ art: 'notfall', von: bB.teilnehmerId, lat: 46.9, aufgehobenAm: null });
    a.senden({ typ: 'alarm.quittieren', id: alarm.id });
    expect((await ltg.warte('alarm', (m) => m.alarm.quittiertVon.length === 1)).alarm.quittiertVon).toHaveLength(1);
    a.senden({ typ: 'alarm.aufheben', id: alarm.id });
    expect((await a.warte('fehler')).meldung).toMatch(/Auslöser oder Leitung/);
    const neu = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Y')).token);
    expect(neu.snapshot.alarme.map((x) => x.id)).toEqual([alarm.id]); // aktiv im Snapshot
    neu.zu();
    ltg.senden({ typ: 'alarm.aufheben', id: alarm.id });
    expect((await b.warte('alarm', (m) => m.alarm.aufgehobenAm !== null)).alarm.id).toBe(alarm.id);
  });

  it('staleNach wird verteilt und gespeichert, über STALE_MAX_MS abgelehnt', async () => {
    const { l, a, b, aB } = await szenario();
    a.senden({ typ: 'pos', pos: { ...pos(47.1, 8.1, 1000), staleNach: 25_000 } });
    expect((await b.warte('pos')).pos.staleNach).toBe(25_000);
    const spuren = await (await s.api('/api/spuren?seit=0', { token: aB.token })).json();
    expect(spuren[aB.teilnehmerId][0].staleNach).toBe(25_000);
    const neu = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Z')).token);
    expect(neu.snapshot.teilnehmer.find((t) => t.id === aB.teilnehmerId)?.pos?.staleNach).toBe(25_000);
    neu.zu();
    a.senden({ typ: 'pos', pos: { ...pos(47.2, 8.2), staleNach: STALE_MAX_MS + 1 } });
    await a.warte('fehler');
  });

  it('Alarm mit Position trotz Emission Control; pos wird verteilt, solange Alarm aktiv', async () => {
    const { ltg, a, b, bB } = await szenario();
    b.senden({ typ: 'sendetPos', an: false });
    await a.warte('teilnehmer', (m) => m.teilnehmer.sendetPos === false);
    b.senden({ typ: 'alarm.ausloesen', art: 'kontakt', pos: pos(46.5, 7.5, 5000) });
    expect((await a.warte('pos')).pos.lat).toBe(46.5);
    const { alarm } = await a.warte('alarm');
    expect(alarm).toMatchObject({ art: 'kontakt', lat: 46.5, lon: 7.5 });
    await pause(1050);
    b.senden({ typ: 'pos', pos: pos(46.6, 7.6, 6000) });
    expect((await a.warte('pos')).pos.lat).toBe(46.6); // trotz sendetPos=false
    const spuren = await (await s.api('/api/spuren?seit=0', { token: bB.token })).json();
    expect(spuren[bB.teilnehmerId].map((x: Position) => x.t)).toEqual([5000, 6000]);

    ltg.senden({ typ: 'alarm.aufheben', id: alarm.id });
    await b.warte('alarm', (m) => m.alarm.aufgehobenAm !== null);
    await pause(1050);
    b.senden({ typ: 'pos', pos: pos(46.7, 7.7, 7000) }); // wieder Emission Control
    await pause(150);
    expect(a.empfangen.some((m) => m.typ === 'pos')).toBe(false);
  });

  it('neuer Alarm ersetzt den aktiven derselben Person', async () => {
    const { l, a, b, bB } = await szenario();
    b.senden({ typ: 'alarm.ausloesen', art: 'notfall', pos: null });
    const erster = (await a.warte('alarm')).alarm;
    expect(erster.lat).toBeNull(); // keine Position bekannt
    a.senden({ typ: 'alarm.ausloesen', art: 'notfall', pos: null }); // andere Person: bleibt bestehen
    await b.warte('alarm', (m) => m.alarm.von !== bB.teilnehmerId);
    b.senden({ typ: 'alarm.ausloesen', art: 'kontakt', pos: null });
    expect((await a.warte('alarm', (m) => m.alarm.id === erster.id)).alarm.aufgehobenAm).not.toBeNull();
    const zweiter = (await a.warte('alarm', (m) => m.alarm.von === bB.teilnehmerId && m.alarm.aufgehobenAm === null)).alarm;
    expect(zweiter.art).toBe('kontakt');
    const neu = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Y')).token);
    expect(neu.snapshot.alarme.filter((x) => x.von === bB.teilnehmerId).map((x) => x.id)).toEqual([zweiter.id]);
    expect(neu.snapshot.alarme).toHaveLength(2);
    neu.zu();
  });

  it('Foto-Upload (Magic Bytes), Sichtung, Foto nur in gleicher Lage', async () => {
    const { a, b, aB, bB } = await szenario();
    const fremd = await s.beitreten((await s.lage()).teilnehmerCode, 'Fremd');
    const gif = await s.api('/api/foto', { method: 'POST', token: aB.token, body: Buffer.from('GIF89a....'), headers: { 'content-type': 'image/jpeg' } });
    expect(gif.status).toBe(415);
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

  it('Foto über 8 MB wird abgelehnt', async () => {
    const { aB } = await szenario();
    const gross = Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]);
    const r = await s.api('/api/foto', { method: 'POST', token: aB.token, body: gross, headers: { 'content-type': 'image/jpeg' } }).catch(() => undefined);
    expect(r?.status).toBe(413);
  });

  it('Export GPX und GeoJSON', async () => {
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

  it('Lage löschen entfernt Daten und Fotos, trennt Verbindungen', async () => {
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

  it('unrealistische Zeitstempel werden abgelehnt, GPX-Export bleibt heil', async () => {
    const { ltgB, a, b } = await szenario();
    a.senden({ typ: 'pos', pos: { ...pos(47, 8), t: 1e300 } });
    expect((await a.warte('fehler')).meldung).toBe('Ungültige Nachricht');
    a.senden({ typ: 'sichtung', sichtung: { lat: 47, lon: 8, sidc: SIDC, groesse: '', taetigkeit: '', einheit: '', zeit: -1e20, ausruestung: '', bemerkung: '', vertrauen: 'unsicher', fotoId: null } });
    expect((await a.warte('fehler')).meldung).toBe('Ungültige Nachricht');
    await pause(100);
    expect(b.empfangen.some((m) => m.typ === 'pos' || m.typ === 'sichtung')).toBe(false);
    expect((await s.api('/api/export.gpx', { token: ltgB.token })).status).toBe(200);
  });

  it('Spur: erneut gesendeter Fix (gleiches t) wird verteilt, aber nicht doppelt gespeichert', async () => {
    const { a, b, aB } = await szenario();
    a.senden({ typ: 'pos', pos: pos(47.1, 8.1, 1000) });
    await b.warte('pos');
    await pause(1050);
    a.senden({ typ: 'pos', pos: pos(47.1, 8.1, 1000) });
    await b.warte('pos');
    const spuren = await (await s.api('/api/spuren?seit=0', { token: aB.token })).json();
    expect(spuren[aB.teilnehmerId]).toHaveLength(1);
  });

  it('Limits gelten je Teilnehmer, nicht je Verbindung; höchstens 3 Verbindungen je Token', async () => {
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
  });

  it('Verbindungen ohne hallo sind je IP begrenzt', async () => {
    const roh = Array.from({ length: 21 }, () => new WebSocket(s.url.replace('http', 'ws') + '/ws'));
    const codes = await Promise.all(roh.map((ws) => new Promise<number>((ok) => ws.on('close', ok).on('open', () => setTimeout(() => ok(0), 300)))));
    expect(codes.filter((c) => c === 4029)).toHaveLength(1);
    for (const ws of roh) ws.close();
  });

  it('Freitext-Meldung mit eigenem, inzwischen entferntem Status geht durch', async () => {
    const { ltg, a, aB } = await szenario();
    a.senden({ typ: 'status', status: 'halt', text: '' });
    await ltg.warte('meldung');
    ltg.senden({ typ: 'lage.statusSet', statusSet: [{ key: 'ok', label: 'OK', farbe: '#00ff00' }] });
    await a.warte('lage');
    a.senden({ typ: 'status', status: 'halt', text: 'Brücke gesperrt' });
    expect((await ltg.warte('meldung')).meldung).toMatchObject({ von: aB.teilnehmerId, status: 'halt', text: 'Brücke gesperrt' });
    a.senden({ typ: 'status', status: 'bewegung', text: '' }); // fremder entfernter Status bleibt verboten
    expect((await a.warte('fehler')).meldung).toBe('Unbekannter Status');
  });

  it('Teilnehmer-Code erneuern: alter Code ungültig, bestehende Tokens bleiben', async () => {
    const { l, ltg, a, aB } = await szenario();
    a.senden({ typ: 'lage.codeErneuern' });
    expect((await a.warte('fehler')).meldung).toMatch(/Leitung/);
    ltg.senden({ typ: 'lage.codeErneuern' });
    const { teilnehmerCode } = await ltg.warte('code');
    expect(teilnehmerCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(a.empfangen.some((m) => m.typ === 'code')).toBe(false); // Klartext nur an die Leitung
    const alt = await s.api('/api/beitreten', { method: 'POST', body: JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC }) });
    expect(alt.status).toBe(403);
    expect((await s.beitreten(teilnehmerCode, 'Neu')).rolle).toBe('teilnehmer');
    expect((await s.api('/api/spuren', { token: aB.token })).status).toBe(200);
  });

  it('Lage beenden: Leitung bekommt die Lage mit und behält Export und Löschen', async () => {
    const { ltg, a, ltgB } = await szenario();
    ltg.senden({ typ: 'lage.beenden' });
    expect((await a.warte('beendet')).lage).toBeUndefined();
    expect((await ltg.warte('beendet')).lage?.beendetAm).not.toBeNull();
    // Neu laden: Wiederverbinden liefert wieder 'beendet' mit Lage
    const ws = new WebSocket(s.url.replace('http', 'ws') + '/ws');
    const msgs: { typ: string; lage?: unknown }[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
    const code = new Promise((ok) => ws.on('close', ok));
    await new Promise((ok) => ws.once('open', ok));
    ws.send(JSON.stringify({ typ: 'hallo', token: ltgB.token }));
    expect(await code).toBe(4001);
    expect(msgs[0]).toMatchObject({ typ: 'beendet', lage: { beendetAm: expect.any(Number) } });
    expect((await s.api('/api/export.gpx', { token: ltgB.token })).status).toBe(200);
    expect((await s.api('/api/lage', { method: 'DELETE', token: ltgB.token })).status).toBe(204);
  });

  it('ungültige Nachrichten ergeben fehler, Verbindung bleibt', async () => {
    const { a } = await szenario();
    a.senden({ typ: 'gibtsnicht' });
    await a.warte('fehler');
    a.ws.send('kein json');
    await a.warte('fehler');
    a.senden({ typ: 'chat', an: { art: 'alle' }, text: 'noch da' });
    await a.warte('chat');
  });
});
