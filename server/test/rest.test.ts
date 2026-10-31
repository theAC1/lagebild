// REST: HTTP-Status, Codes, Tokens, Rate-Limits und Kontingente. Fachregeln prüft shared/regeln.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Beigetreten } from '../../shared/protocol.ts';
import { bildFormat, MAX_TEILNEHMER_JE_LAGE } from '../src/http.ts';
import { PASSWORT, SIDC, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const beitritt = (code: string) => JSON.stringify({ code, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC });

describe('Lage erstellen', () => {
  it('Codes ohne verwechselbare Zeichen; Startphase ohne Angabe LV (ältere Web-Stände), neuer Client wählt AP', async () => {
    const r = await s.lage();
    expect(r.teilnehmerCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(r.leitungCode).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    const phase = async (extra: object) => {
      const res = await s.api('/api/lage', { method: 'POST', body: JSON.stringify({ name: 'P', erstellPasswort: PASSWORT, ...extra }) });
      const { leitungCode } = await res.json();
      const ltg = await verbinde(s.url, (await s.beitreten(leitungCode, 'Ltg')).token);
      ltg.zu();
      return ltg.snapshot.lage.phasen.map((p) => p.phase);
    };
    expect(await phase({})).toEqual(['lv']);
    expect(await phase({ phase: 'ap' })).toEqual(['ap']);
  });

  it('falsches Passwort 403, ungültige Eingaben 400; Rate-Limit je IP, CF-Connecting-IP zählt nur vom vertrauten Proxy', async () => {
    expect((await s.api('/api/lage', { method: 'POST', body: JSON.stringify({ name: 'X', erstellPasswort: 'nein' }) })).status).toBe(403);
    expect((await s.api('/api/lage', { method: 'POST', body: JSON.stringify({ name: '', erstellPasswort: PASSWORT }) })).status).toBe(400);
    expect((await s.api('/api/lage', { method: 'POST', body: '{' })).status).toBe(400);
    const body = JSON.stringify({ name: 'X', erstellPasswort: 'falsch' });
    const status: number[] = [];
    for (let i = 0; i < 11; i++) status.push((await s.api('/api/lage', { method: 'POST', body, ip: '192.0.2.9' })).status);
    expect(status.slice(0, 10).every((x) => x === 403)).toBe(true);
    expect(status.at(-1)).toBe(429);
    // 127.0.0.1 ist hier kein cloudflared: wechselnde CF-Connecting-IP umgeht das Limit nicht
    const direkt = await testServer([]);
    try {
      const st: number[] = [];
      for (let i = 0; i < 12; i++) st.push((await direkt.api('/api/lage', { method: 'POST', body, ip: `198.51.100.${i}` })).status);
      expect(st.slice(0, 10).every((x) => x === 403)).toBe(true);
      expect(st.slice(10)).toEqual([429, 429]);
    } finally {
      await direkt.ende();
    }
  });
});

describe('Beitreten', () => {
  it('Code bestimmt die Rolle, Kleinschreibung geht, falscher Code 403; gleicher Rufname ergibt neuen Teilnehmer', async () => {
    const l = await s.lage();
    const a = await s.beitreten(l.teilnehmerCode.toLowerCase(), 'Adler');
    expect(a.rolle).toBe('teilnehmer');
    const b = await s.beitreten(l.teilnehmerCode, 'Adler');
    expect(b.teilnehmerId).not.toBe(a.teilnehmerId);
    expect(b.token).not.toBe(a.token);
    const ltg = await s.beitreten(l.leitungCode, 'Leitung');
    expect(ltg.rolle).toBe('leitung');
    expect(ltg.token.length).toBeGreaterThanOrEqual(40);
    expect((await s.api('/api/beitreten', { method: 'POST', body: beitritt('ZZZZZZZZ') })).status).toBe(403);
  });

  it('Rate-Limit je IP zählt nur falsche Codes (30 Geräte hinter einem NAT); gesperrte IP kommt auch mit richtigem Code nicht durch', async () => {
    const l = await s.lage();
    const status: number[] = [];
    for (let i = 0; i < 12; i++) status.push((await s.api('/api/beitreten', { method: 'POST', body: beitritt('ZZZZZZZZ'), ip: '192.0.2.7' })).status);
    expect(status.slice(0, 10).every((x) => x === 403)).toBe(true);
    expect(status.slice(10)).toEqual([429, 429]);
    expect((await s.api('/api/beitreten', { method: 'POST', body: beitritt('ZZZZZZZZ'), ip: '192.0.2.8' })).status).toBe(403); // andere IP
    for (let i = 0; i < 30; i++) expect((await s.api('/api/beitreten', { method: 'POST', body: beitritt(l.teilnehmerCode), ip: '192.0.2.50' })).status).toBe(201);
    expect((await s.api('/api/beitreten', { method: 'POST', body: beitritt(l.teilnehmerCode), ip: '192.0.2.7' })).status).toBe(429);
  });

  it('Teilnehmer-Kontingent je Lage; entfernte Teilnehmer machen Platz; andere Lagen unberührt', async () => {
    const l = await s.lage();
    const ltg = await s.beitreten(l.leitungCode, 'Leitung');
    const body = beitritt(l.teilnehmerCode);
    const ids: string[] = [];
    for (let i = 1; i < MAX_TEILNEHMER_JE_LAGE; i++) {
      const r = await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.60' });
      expect(r.status).toBe(201);
      ids.push(((await r.json()) as Beigetreten).teilnehmerId);
    }
    expect((await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.60' })).status).toBe(507);
    expect((await s.beitreten((await s.lage()).teilnehmerCode, 'Z')).rolle).toBe('teilnehmer');
    const c = await verbinde(s.url, ltg.token);
    c.senden({ typ: 'teilnehmer.entfernen', id: ids[0] });
    await c.warte('teilnehmer.weg');
    c.zu();
    expect((await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.60' })).status).toBe(201);
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

  it('Foto-Upload: Rate-Limit je Teilnehmer vor dem Lesen des Bodys; in AP 409; Format nur nach Magic Bytes', async () => {
    const tn = await s.beitreten((await s.lage()).teilnehmerCode, 'Foto');
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
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
