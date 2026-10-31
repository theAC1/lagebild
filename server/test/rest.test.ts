import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Beigetreten } from '../../shared/protocol.ts';
import { bildFormat, MAX_TEILNEHMER_JE_LAGE } from '../src/http.ts';
import { PASSWORT, SIDC, testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

describe('REST', () => {
  it('erstellt eine Lage mit Codes ohne verwechselbare Zeichen', async () => {
    const r = await s.lage();
    expect(r.teilnehmerCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(r.leitungCode).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
  });

  it('Startphase: ohne Angabe LV (ältere Web-Stände kennen keine Phasen), neuer Client wählt AP', async () => {
    const phase = async (extra: object) => {
      const r = await s.api('/api/lage', { method: 'POST', body: JSON.stringify({ name: 'P', erstellPasswort: PASSWORT, ...extra }) });
      const { leitungCode } = await r.json();
      const ltg = await verbinde(s.url, (await s.beitreten(leitungCode, 'Ltg')).token);
      ltg.zu();
      return ltg.snapshot.lage.phasen.map((p) => p.phase);
    };
    expect(await phase({})).toEqual(['lv']);
    expect(await phase({ phase: 'ap' })).toEqual(['ap']);
  });

  it('verweigert falsches Erstell-Passwort und ungültige Eingaben', async () => {
    const falsch = await s.api('/api/lage', { method: 'POST', body: JSON.stringify({ name: 'X', erstellPasswort: 'nein' }) });
    expect(falsch.status).toBe(403);
    const leer = await s.api('/api/lage', { method: 'POST', body: JSON.stringify({ name: '', erstellPasswort: PASSWORT }) });
    expect(leer.status).toBe(400);
    const kaputt = await s.api('/api/lage', { method: 'POST', body: '{' });
    expect(kaputt.status).toBe(400);
  });

  it('Beitreten: Code bestimmt die Rolle, Kleinschreibung geht, falscher Code nicht', async () => {
    const l = await s.lage();
    expect((await s.beitreten(l.teilnehmerCode.toLowerCase(), 'Adler')).rolle).toBe('teilnehmer');
    const ltg = await s.beitreten(l.leitungCode, 'Leitung');
    expect(ltg.rolle).toBe('leitung');
    expect(ltg.token.length).toBeGreaterThanOrEqual(40);
    const r = await s.api('/api/beitreten', { method: 'POST', body: JSON.stringify({ code: 'ZZZZZZZZ', rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC }) });
    expect(r.status).toBe(403);
  });

  it('gleicher Rufname ergibt neuen Teilnehmer', async () => {
    const l = await s.lage();
    const a = await s.beitreten(l.teilnehmerCode, 'Adler');
    const b = await s.beitreten(l.teilnehmerCode, 'Adler');
    expect(a.teilnehmerId).not.toBe(b.teilnehmerId);
    expect(a.token).not.toBe(b.token);
  });

  it('Rate-Limit pro IP beim Beitreten', async () => {
    const body = JSON.stringify({ code: 'ZZZZZZZZ', rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC });
    const status: number[] = [];
    for (let i = 0; i < 12; i++) status.push((await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.7' })).status);
    expect(status.slice(0, 10).every((x) => x === 403)).toBe(true);
    expect(status.slice(10)).toEqual([429, 429]);
    // andere IP ist nicht betroffen
    expect((await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.8' })).status).toBe(403);
  });

  it('Beitreten: erfolgreiche Beitritte zählen nicht (30 Geräte hinter einem NAT)', async () => {
    const l = await s.lage();
    const body = JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC });
    for (let i = 0; i < 30; i++) expect((await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.50' })).status).toBe(201);
    // ein gesperrter Absender kommt auch mit richtigem Code nicht durch (kein Erraten trotz Sperre)
    const falsch = JSON.stringify({ code: 'ZZZZZZZZ', rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC });
    for (let i = 0; i < 10; i++) await s.api('/api/beitreten', { method: 'POST', body: falsch, ip: '192.0.2.51' });
    expect((await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.51' })).status).toBe(429);
  });

  it('Beitreten: Teilnehmer-Kontingent je Lage, entfernte Teilnehmer machen Platz', async () => {
    const l = await s.lage();
    const ltg = await s.beitreten(l.leitungCode, 'Leitung');
    const body = JSON.stringify({ code: l.teilnehmerCode, rufname: 'X', einheit: 'Y', funktion: '', sidc: SIDC });
    const ids: string[] = [];
    for (let i = 1; i < MAX_TEILNEHMER_JE_LAGE; i++) {
      const r = await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.60' });
      expect(r.status).toBe(201);
      ids.push(((await r.json()) as Beigetreten).teilnehmerId);
    }
    const voll = await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.60' });
    expect(voll.status).toBe(507);
    // andere Lagen sind nicht betroffen
    expect((await s.beitreten((await s.lage()).teilnehmerCode, 'Z')).rolle).toBe('teilnehmer');
    const c = await verbinde(s.url, ltg.token);
    c.senden({ typ: 'teilnehmer.entfernen', id: ids[0] });
    await c.warte('teilnehmer.weg');
    c.zu();
    expect((await s.api('/api/beitreten', { method: 'POST', body, ip: '192.0.2.60' })).status).toBe(201);
  });

  it('CF-Connecting-IP von nicht vertrauter Quelle umgeht das Limit nicht', async () => {
    const direkt = await testServer([]); // 127.0.0.1 ist hier kein cloudflared
    try {
      const status: number[] = [];
      for (let i = 0; i < 12; i++)
        status.push((await direkt.api('/api/lage', { method: 'POST', body: JSON.stringify({ name: 'a', erstellPasswort: `rate${i}` }), ip: `198.51.100.${i}` })).status);
      expect(status.slice(0, 10).every((x) => x === 403)).toBe(true);
      expect(status.slice(10)).toEqual([429, 429]);
    } finally {
      await direkt.ende();
    }
  });

  it('Foto-Upload: Rate-Limit pro Teilnehmer vor dem Lesen des Bodys', async () => {
    const tn = await s.beitreten((await s.lage()).teilnehmerCode, 'Foto');
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
    const status: number[] = [];
    for (let i = 0; i < 12; i++) status.push((await s.api('/api/foto', { method: 'POST', token: tn.token, body: jpeg })).status);
    expect(status.slice(0, 10).every((x) => x === 201)).toBe(true);
    expect(status.slice(10)).toEqual([429, 429]);
  });

  it('Rate-Limit pro IP beim Erstellen', async () => {
    const body = JSON.stringify({ name: 'X', erstellPasswort: 'falsch' });
    const status: number[] = [];
    for (let i = 0; i < 11; i++) status.push((await s.api('/api/lage', { method: 'POST', body, ip: '192.0.2.9' })).status);
    expect(status.at(-1)).toBe(429);
  });

  it('Bearer-Pflicht und Leitungsrechte', async () => {
    const l = await s.lage();
    const tn = await s.beitreten(l.teilnehmerCode, 'Adler');
    expect((await s.api('/api/spuren')).status).toBe(401);
    expect((await s.api('/api/spuren', { token: 'x'.repeat(43) })).status).toBe(401);
    expect((await s.api('/api/spuren', { token: tn.token })).status).toBe(200);
    expect((await s.api('/api/export.gpx', { token: tn.token })).status).toBe(403);
    expect((await s.api('/api/lage', { method: 'DELETE', token: tn.token })).status).toBe(403);
  });

  it('Sicherheits-Header und fehlender Client', async () => {
    const r = await s.api('/irgendwo');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain('worker-src');
    expect(r.status).toBe(404);
    expect((await s.api('/../../etc/passwd')).status).toBe(404);
  });

  it('erkennt Bildformate nur nach Magic Bytes', () => {
    expect(bildFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(bildFormat(Buffer.from('89504e470d0a1a0a00', 'hex'))).toBe('png');
    expect(bildFormat(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp');
    expect(bildFormat(Buffer.from('GIF89a'))).toBeUndefined();
    expect(bildFormat(Buffer.from('<svg'))).toBeUndefined();
  });
});
