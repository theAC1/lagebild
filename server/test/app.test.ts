// Android-App: Auslieferung von version.json/APK und Origin-Zulassung (CORS) für den Capacitor-Ursprung.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { corsKopf } from '../src/sicherheit.ts';
import { testServer } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

describe('corsKopf', () => {
  it('lässt nur die App-Ursprünge zu, nie *', () => {
    expect(corsKopf('https://localhost')).toEqual({ 'Access-Control-Allow-Origin': 'https://localhost', Vary: 'Origin' });
    expect(corsKopf('capacitor://localhost')['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
    for (const o of [undefined, '', '*', 'null', 'https://evil.example', 'http://localhost', 'https://localhost.evil.example', 'https://lage.arvuna.ch'])
      expect(corsKopf(o)).toEqual({});
  });
});

describe('CORS am Server', () => {
  it('Preflight vom App-Ursprung: 204 mit Authorization erlaubt', async () => {
    const r = await fetch(s.url + '/api/beitreten', { method: 'OPTIONS', headers: { origin: 'https://localhost', 'access-control-request-method': 'POST' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(r.headers.get('access-control-allow-headers')).toContain('Authorization');
  });
  it('Preflight von fremdem Ursprung: keine CORS-Kopfzeilen', async () => {
    const r = await fetch(s.url + '/api/beitreten', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    expect(r.status).not.toBe(204);
  });
  it('echte Antworten tragen die Kopfzeile nur für den App-Ursprung (auch bei Fehlern)', async () => {
    const app = await s.api('/api/spuren', { headers: { origin: 'https://localhost' } });
    expect(app.status).toBe(401);
    expect(app.headers.get('access-control-allow-origin')).toBe('https://localhost');
    const fremd = await s.api('/api/spuren', { headers: { origin: 'https://evil.example' } });
    expect(fremd.headers.get('access-control-allow-origin')).toBeNull();
    const ohne = await s.api('/api/spuren');
    expect(ohne.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('/app/*', () => {
  it('404, solange nichts bereitgestellt ist', async () => {
    expect((await fetch(s.url + '/app/version.json')).status).toBe(404);
    expect((await fetch(s.url + '/app/lagebild.apk')).status).toBe(404);
  });
  it('liefert version.json und APK aus dem Datenverzeichnis, sonst nichts', async () => {
    const dir = join(s.dataDir, 'app');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'version.json'), JSON.stringify({ versionCode: 7, versionName: '0.7' }));
    writeFileSync(join(dir, 'lagebild.apk'), Buffer.from('PK\u0003\u0004apk'));
    writeFileSync(join(dir, 'geheim.txt'), 'x');

    const v = await fetch(s.url + '/app/version.json', { headers: { origin: 'https://localhost' } });
    expect(v.status).toBe(200);
    expect(v.headers.get('content-type')).toBe('application/json');
    expect(v.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(await v.json()).toEqual({ versionCode: 7, versionName: '0.7' });

    const a = await fetch(s.url + '/app/lagebild.apk');
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(a.headers.get('content-disposition')).toContain('lagebild.apk');
    expect(Buffer.from(await a.arrayBuffer()).toString('latin1')).toContain('apk');

    expect((await fetch(s.url + '/app/geheim.txt')).status).toBe(404);
    expect((await fetch(s.url + '/app/..%2Fgeheim.txt')).status).toBe(404);
    expect((await fetch(s.url + '/app/version.json', { method: 'POST' })).status).toBe(405);
  });
  it('liefert web.json (no-cache) und Bundles (unveränderlich), nur mit Zahl im Namen', async () => {
    const dir = join(s.dataDir, 'app');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'web.json'), JSON.stringify({ webCode: 42 }));
    writeFileSync(join(dir, 'web-42.zip'), Buffer.from('PK\u0003\u0004zip'));
    writeFileSync(join(dir, 'web-x.zip'), 'x');

    const w = await fetch(s.url + '/app/web.json', { headers: { origin: 'https://localhost' } });
    expect(w.status).toBe(200);
    expect(w.headers.get('cache-control')).toBe('no-cache');
    expect(w.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(await w.json()).toEqual({ webCode: 42 });

    const z = await fetch(s.url + '/app/web-42.zip');
    expect(z.status).toBe(200);
    expect(z.headers.get('content-type')).toBe('application/zip');
    expect(z.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await z.arrayBuffer()).toString('latin1')).toContain('zip');

    expect((await fetch(s.url + '/app/web-43.zip')).status).toBe(404);
    expect((await fetch(s.url + '/app/web-x.zip')).status).toBe(404);
    expect((await fetch(s.url + '/app/web-1%2F..%2Fweb.json')).status).toBe(404);
    expect((await fetch(s.url + '/app/web.json', { method: 'POST' })).status).toBe(405);
  });
});
