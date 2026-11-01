// REST: HTTP-Status, Codes, Tokens, Rate-Limits und Kontingente. Fachregeln prüft shared/regeln.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { beitrittsText, eroeffnungsText, type Beigetreten, type GeraetNachweis, type LageErstellt } from '../../shared/protocol.ts';
import { bildFormat, MAX_TEILNEHMER_JE_LAGE } from '../src/http.ts';
import { geraet, PASSWORT, SIDC, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const post = (pfad: string, body: string, ip?: string) => s.api(pfad, { method: 'POST', body, ip });

describe('Lage erstellen', () => {
  it('Codes ohne verwechselbare Zeichen; Ersteller ist Leitung; Startphase ohne Angabe LV (ältere Web-Stände), neuer Client wählt AP', async () => {
    const r = await s.lage();
    expect(r.teilnehmerCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(r.gruppenfuehrerCode).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(r.beobachterCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    const eroeffnen = async (extra: object) => {
      const l: LageErstellt = await (await post('/api/lage', await s.lageBody('P', extra))).json();
      const ltg = await verbinde(s.url, l.token);
      ltg.zu();
      return { phasen: ltg.snapshot.lage.phasen.map((p) => p.phase), ich: ltg.snapshot.teilnehmer.find((t) => t.id === l.teilnehmerId) };
    };
    expect(await eroeffnen({})).toMatchObject({ phasen: ['lv'], ich: { rolle: 'leitung', rufname: 'Leitung', einheit: 'Stab' } });
    expect((await eroeffnen({ phase: 'ap' })).phasen).toEqual(['ap']);
  });

  it('falsches Passwort 403, ungültige Eingaben 400; Rate-Limit je IP, CF-Connecting-IP zählt nur vom vertrauten Proxy', async () => {
    expect((await post('/api/lage', await s.lageBody('X', { erstellPasswort: 'nein' }))).status).toBe(403);
    expect((await post('/api/lage', await s.lageBody('X', { name: '' }))).status).toBe(400);
    expect((await post('/api/lage', JSON.stringify({ name: 'X', erstellPasswort: PASSWORT }))).status).toBe(400); // ohne Gerätenachweis
    expect((await post('/api/lage', '{')).status).toBe(400);
    const body = await s.lageBody('X', { erstellPasswort: 'falsch' });
    const status: number[] = [];
    for (let i = 0; i < 11; i++) status.push((await post('/api/lage', body, '192.0.2.9')).status);
    expect(status.slice(0, 10).every((x) => x === 403)).toBe(true);
    expect(status.at(-1)).toBe(429);
    // 127.0.0.1 ist hier kein cloudflared: wechselnde CF-Connecting-IP umgeht das Limit nicht
    const direkt = await testServer([]);
    try {
      const st: number[] = [];
      const b = await direkt.lageBody('X', { erstellPasswort: 'falsch' });
      for (let i = 0; i < 12; i++) st.push((await direkt.api('/api/lage', { method: 'POST', body: b, ip: `198.51.100.${i}` })).status);
      expect(st.slice(0, 10).every((x) => x === 403)).toBe(true);
      expect(st.slice(10)).toEqual([429, 429]);
    } finally {
      await direkt.ende();
    }
  });
});

describe('Gerätenachweis', () => {
  it('Signatur über anderen Code oder Namen, fremder Schlüssel, wiederverwendete Challenge → 403; Challenges je IP begrenzt', async () => {
    const l = await s.lage();
    const g = geraet();
    const mit = (nachweis: GeraetNachweis) => JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC, geraet: nachweis });
    expect((await post('/api/beitreten', mit(await s.nachweis(g, (c) => beitrittsText(c, 'ANDERS23'))))).status).toBe(403);
    const fremderSchluessel = { ...(await s.nachweis(g, (c) => beitrittsText(c, l.teilnehmerCode))), pub: geraet().publicKey.export({ format: 'jwk' }).x! };
    expect((await post('/api/beitreten', mit(fremderSchluessel))).status).toBe(403);
    const gut = mit(await s.nachweis(g, (c) => beitrittsText(c, l.teilnehmerCode)));
    expect((await post('/api/beitreten', gut)).status).toBe(201);
    expect((await post('/api/beitreten', gut)).status).toBe(403); // Challenge verbraucht
    const andererName = JSON.parse(await s.lageBody('Übung'));
    andererName.geraet = await s.nachweis(g, (c) => eroeffnungsText(c, 'Andere Übung'));
    expect((await post('/api/lage', JSON.stringify(andererName))).status).toBe(403);
    const st: number[] = [];
    for (let i = 0; i < 61; i++) st.push((await post('/api/challenge', '', '192.0.2.70')).status);
    expect(st.slice(0, 60).every((x) => x === 201)).toBe(true);
    expect(st.at(-1)).toBe(429);
  });
});

describe('Beitreten', () => {
  it('Code bestimmt die Rolle, Kleinschreibung geht, falscher Code 403; anderes Gerät mit gleichem Rufnamen ist ein neuer Teilnehmer', async () => {
    const l = await s.lage();
    const a = await s.beitreten(l.teilnehmerCode.toLowerCase(), 'Adler');
    expect(a.rolle).toBe('teilnehmer');
    const b = await s.beitreten(l.teilnehmerCode, 'Adler');
    expect(b.teilnehmerId).not.toBe(a.teilnehmerId);
    expect(b.token).not.toBe(a.token);
    expect(b.token.length).toBeGreaterThanOrEqual(40);
    expect((await s.beitreten(l.gruppenfuehrerCode, 'Grfhr')).rolle).toBe('gruppenfuehrer');
    expect((await s.beitreten(l.beobachterCode, 'Beob')).rolle).toBe('beobachter');
    expect((await post('/api/beitreten', await s.beitrittsBody('ZZZZZZZZ'))).status).toBe(403);
  });

  it('gleiches Gerät: derselbe Eintrag mit neuem Token (altes ungültig), Kennung vom Server abgeleitet; auch nach dem Entfernen', async () => {
    const l = await s.lage();
    // fester Schlüssel: Kennung unabhängig nachgerechnet (base32(SHA-256(pub))[0..8])
    const seed = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 7)]);
    const privateKey = createPrivateKey({ key: seed, format: 'der', type: 'pkcs8' });
    const g = { privateKey, publicKey: createPublicKey(privateKey) };
    const erst = await s.beitreten(l.teilnehmerCode, 'Adler', 'Zug 1', g);
    const wieder = await s.beitreten(l.teilnehmerCode, 'Adler 2', 'Zug 1', g);
    expect(wieder.teilnehmerId).toBe(erst.teilnehmerId);
    expect(wieder.token).not.toBe(erst.token);
    expect((await s.api('/api/spuren', { token: erst.token })).status).toBe(401);
    const ltg = await verbinde(s.url, l.token);
    expect(ltg.snapshot.teilnehmer.map((t) => [t.rufname, t.geraet])).toEqual([['Leitung', expect.stringMatching(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/)], ['Adler 2', '72AS-YEXT']]);
    ltg.senden({ typ: 'teilnehmer.entfernen', id: erst.teilnehmerId });
    await ltg.warte('teilnehmer.weg');
    const zurueck = await s.beitreten(l.teilnehmerCode, 'Adler 3', 'Zug 3', g);
    expect(zurueck.teilnehmerId).toBe(erst.teilnehmerId);
    expect((await verbinde(s.url, zurueck.token)).snapshot.teilnehmer.find((t) => t.id === erst.teilnehmerId)).toMatchObject({ rufname: 'Adler 3', einheit: 'Zug 3' });
    ltg.zu();
  });

  it('Rate-Limit je IP zählt nur Fehlversuche (30 Geräte hinter einem NAT); gesperrte IP kommt auch mit richtigem Code nicht durch', async () => {
    const l = await s.lage();
    const status: number[] = [];
    for (let i = 0; i < 12; i++) status.push((await post('/api/beitreten', await s.beitrittsBody('ZZZZZZZZ'), '192.0.2.7')).status);
    expect(status.slice(0, 10).every((x) => x === 403)).toBe(true);
    expect(status.slice(10)).toEqual([429, 429]);
    expect((await post('/api/beitreten', await s.beitrittsBody('ZZZZZZZZ'), '192.0.2.8')).status).toBe(403); // andere IP
    for (let i = 0; i < 30; i++) expect((await post('/api/beitreten', await s.beitrittsBody(l.teilnehmerCode), '192.0.2.50')).status).toBe(201);
    expect((await post('/api/beitreten', await s.beitrittsBody(l.teilnehmerCode), '192.0.2.7')).status).toBe(429);
  });

  it('Teilnehmer-Kontingent je Lage; entfernte Teilnehmer machen Platz; andere Lagen unberührt', async () => {
    const l = await s.lage();
    const neu = async () => post('/api/beitreten', await s.beitrittsBody(l.teilnehmerCode), '192.0.2.60');
    const ids: string[] = [];
    for (let i = 1; i < MAX_TEILNEHMER_JE_LAGE; i++) {
      const r = await neu();
      expect(r.status).toBe(201);
      ids.push(((await r.json()) as Beigetreten).teilnehmerId);
    }
    expect((await neu()).status).toBe(507);
    expect((await s.beitreten((await s.lage()).teilnehmerCode, 'Z')).rolle).toBe('teilnehmer');
    const c = await verbinde(s.url, l.token);
    c.senden({ typ: 'teilnehmer.entfernen', id: ids[0] });
    await c.warte('teilnehmer.weg');
    c.zu();
    expect((await neu()).status).toBe(201);
  });
});

describe('Zugriff', () => {
  it('Bearer-Pflicht (401), Leitungsrechte (403) für Export und Löschen', async () => {
    const l = await s.lage();
    const tn = await s.beitreten(l.teilnehmerCode, 'Adler');
    expect((await s.api('/api/spuren')).status).toBe(401);
    expect((await s.api('/api/spuren', { token: 'x'.repeat(43) })).status).toBe(401);
    expect((await s.api('/api/spuren', { token: tn.token })).status).toBe(200);
    expect((await s.api('/api/export.gpx', { token: tn.token })).status).toBe(403);
    expect((await s.api('/api/lage', { method: 'DELETE', token: tn.token })).status).toBe(403);
  });

  it('Foto-Upload: Rate-Limit je Teilnehmer vor dem Lesen des Bodys; in AP 409; Beobachter 403; Format nur nach Magic Bytes', async () => {
    const l = await s.lage();
    const tn = await s.beitreten(l.teilnehmerCode, 'Foto');
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
    expect((await s.api('/api/foto', { method: 'POST', token: (await s.beitreten(l.beobachterCode, 'Auge')).token, body: jpeg })).status).toBe(403);
    const status: number[] = [];
    for (let i = 0; i < 12; i++) status.push((await s.api('/api/foto', { method: 'POST', token: tn.token, body: jpeg })).status);
    expect(status.slice(0, 10).every((x) => x === 201)).toBe(true);
    expect(status.slice(10)).toEqual([429, 429]);
    const ap = await s.beitreten((await s.lage('Plan', 'ap')).teilnehmerCode, 'Foto');
    expect((await s.api('/api/foto', { method: 'POST', token: ap.token, body: jpeg })).status).toBe(409);
    expect(bildFormat(jpeg)).toBe('jpg');
    expect(bildFormat(Buffer.from('89504e470d0a1a0a00', 'hex'))).toBe('png');
    expect(bildFormat(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp');
    expect(bildFormat(Buffer.from('GIF89a'))).toBeUndefined();
    expect(bildFormat(Buffer.from('<svg'))).toBeUndefined();
  });

  it('Meine Missionen: Stand je Token, entfernt oder gelöscht → null; Limit je IP', async () => {
    const a = await s.lage('Aare', 'ap');
    const b = await s.lage('Bern');
    const tn = await s.beitreten(b.gruppenfuehrerCode, 'Adler');
    const weg = await s.beitreten(b.teilnehmerCode, 'Weg');
    const ltg = await verbinde(s.url, b.token);
    ltg.senden({ typ: 'teilnehmer.entfernen', id: weg.teilnehmerId });
    await ltg.warte('teilnehmer.weg');
    ltg.zu();
    const geloescht = await s.lage('Gelöscht');
    expect((await s.api('/api/lage', { method: 'DELETE', token: geloescht.token })).status).toBe(204);
    const abfrage = (tokens: string[], ip?: string) => post('/api/missionen', JSON.stringify({ tokens }), ip);
    const r = await abfrage([a.token, tn.token, weg.token, geloescht.token, 'x'.repeat(43)]);
    expect(await r.json()).toEqual({
      missionen: [{ lageId: a.lageId, name: 'Aare', phase: 'ap', rolle: 'leitung' }, { lageId: b.lageId, name: 'Bern', phase: 'lv', rolle: 'gruppenfuehrer' }, null, null, null],
    });
    const status: number[] = [];
    for (let i = 0; i < 61; i++) status.push((await abfrage([], '192.0.2.70')).status);
    expect(status.slice(0, 60).every((x) => x === 200)).toBe(true);
    expect(status.at(-1)).toBe(429);
  });

  it('Sicherheits-Header, fehlender Client 404, kein Pfad aus dem Client-Verzeichnis heraus', async () => {
    const r = await s.api('/irgendwo');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain('worker-src');
    expect(r.status).toBe(404);
    // Datei neben dem Client-Verzeichnis: über `..` (kodiert, sonst normalisiert schon die URL) nicht erreichbar
    writeFileSync(join(s.dataDir, 'geheim.txt'), 'x');
    expect((await s.api('/..%2Fgeheim.txt')).status).toBe(404);
    expect((await s.api('/x/..%2F..%2Fgeheim.txt')).status).toBe(404);
  });
});
