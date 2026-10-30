// Lastmessung im Browser (kein Test): Start bis Lage sichtbar und Hauptthread-Last der Leitung bei 50 Geräten (je 1 Pos/s),
// 500 Zeichnungen, 300 Taufen, Spuren 4 h. Zahlen und Vergleich: docs/spec.md «Performance 30.10.».
//   npm run build && PORT=8830 LAGE_ERSTELL_PASSWORT=last DATA_DIR=/tmp/last npm start &
//   PORT=8830 DATA_DIR=/tmp/last node e2e/lastmessung.ts        (DROSSEL=4 CPU-Drossel, MESS_S=15 Messfenster)
// Schreibt die Testdaten direkt in die SQLite des laufenden Servers (frisches DATA_DIR nehmen).
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import { oeffneDb } from '../server/src/db.ts';
import { standardEbeneId, STANDARD_STIL, type Beigetreten, type LageErstellt, type Taufe, type Zeichnung } from '../shared/protocol.ts';

const URL = `http://127.0.0.1:${process.env.PORT}`;
const DROSSEL = Number(process.env.DROSSEL ?? 4);
const MESS_S = Number(process.env.MESS_S ?? 15);
const SIDC = '10031000001211000000';
const Z = { lat: 46.9466, lon: 7.4442 };

const post = async <T>(pfad: string, body: unknown): Promise<T> =>
  (await fetch(URL + pfad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<T>;
let saat = 7;
const r = () => (saat = (saat * 16807) % 2147483647) / 2147483647;
const pt = () => ({ lat: Z.lat + (r() - 0.5) * 0.03, lon: Z.lon + (r() - 0.5) * 0.045 });

// --- Lage und Daten -----------------------------------------------------------------------
const l = await post<LageErstellt>('/api/lage', { name: 'Last', erstellPasswort: process.env.LAGE_ERSTELL_PASSWORT ?? 'last' });
const neu = (code: string, rufname: string, einheit: string) => post<Beigetreten>('/api/beitreten', { code, rufname, einheit, funktion: 'Sdt', sidc: SIDC });
const ltg = await neu(l.leitungCode, 'Leitung', 'Stab');
const tn: Beigetreten[] = [];
for (let i = 0; i < 49; i++) tn.push(await neu(l.teilnehmerCode, `TN${i}`, `Zug ${i % 5}`));

const db = oeffneDb(join(process.env.DATA_DIR!, 'lagebild.sqlite'));
const t0 = Date.now() - 4 * 3600_000;
const arten = ['linie', 'flaeche', 'pfeil', 'kreis', 'text', 'freihand', 'raum'] as const;
for (let i = 0; i < 500; i++) {
  const art = arten[i % arten.length];
  const c = pt();
  const n = art === 'kreis' || art === 'text' ? 1 : art === 'freihand' ? 150 : art === 'raum' || art === 'flaeche' ? 8 : 4;
  const punkte = Array.from({ length: n }, () => ({ lat: c.lat + (r() - 0.5) * 0.004, lon: c.lon + (r() - 0.5) * 0.006 }));
  const z: Zeichnung = { id: randomUUID(), von: ltg.teilnehmerId, erstelltAm: t0, geaendertAm: t0, ebeneId: standardEbeneId(ltg.lageId), art, punkte, text: art === 'text' ? `Treffpunkt ${i}` : '', bezeichnung: `Z${i}`, stil: STANDARD_STIL };
  if (art === 'kreis') z.radiusM = 100;
  if (art === 'raum') z.raumArt = 'ziel';
  db.speichern(ltg.lageId, 'zeichnung', z, t0 + i);
}
for (let i = 0; i < 300; i++) {
  const c = pt();
  const n = i % 10 === 0 ? 60 : 6;
  const ring = Array.from({ length: n }, (_, k): [number, number] => [c.lon + 0.0002 * Math.cos((k / n) * 2 * Math.PI), c.lat + 0.00015 * Math.sin((k / n) * 2 * Math.PI)]);
  const t: Taufe = { id: randomUUID(), von: ltg.teilnehmerId, erstelltAm: t0, geaendertAm: t0, familie: 'gebaeude', name: `Haus ${i}`, geometrie: { type: 'Polygon', coordinates: [[...ring, ring[0]]] }, quelle: 'gezeichnet', objektart: 'building/roof', stoss: null, fassaden: [], ziel: false };
  db.speichern(ltg.lageId, 'taufe', t, t0 + i);
}
const geraete = tn.map((b) => ({ b, ...pt() }));
const schritt = (g: { lat: number; lon: number }) => ((g.lat += (r() - 0.5) * 0.0002), (g.lon += (r() - 0.5) * 0.0003));
for (const g of geraete)
  for (let t = t0; t < Date.now(); t += 10_000) {
    schritt(g);
    db.spurAnhaengen(ltg.lageId, g.b.teilnehmerId, { lat: g.lat, lon: g.lon, alt: 500, ce: 5, kurs: 90, tempo: 1.2, t, staleNach: 35000 });
  }
db.schliessen();

// --- 49 Geräte senden je 1 Pos/s (gestaffelt; nacheinander verbinden wegen des hallo-Limits je IP) -----------
const sockets: WebSocket[] = [];
for (const g of geraete)
  sockets.push(
    await new Promise<WebSocket>((ok) => {
      const ws = new WebSocket(`${URL.replace('http', 'ws')}/ws`);
      ws.on('open', () => ws.send(JSON.stringify({ typ: 'hallo', token: g.b.token })));
      ws.once('message', () => ok(ws));
    }),
  );
let laeuft = true;
geraete.forEach((g, i) =>
  setTimeout(function tick() {
    if (!laeuft) return;
    schritt(g);
    sockets[i].send(JSON.stringify({ typ: 'pos', pos: { lat: g.lat, lon: g.lon, alt: 500, ce: 5, kurs: Math.floor(r() * 360), tempo: 1.2, t: Date.now(), staleNach: 35000 } }));
    setTimeout(tick, 1000);
  }, (i * 1000) / geraete.length),
);

// --- Leitung im Browser ---------------------------------------------------------------------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: Z.lat, longitude: Z.lon }, permissions: ['geolocation'] });
await ctx.addInitScript((token: string) => {
  localStorage.setItem('lagebild.token', token);
  localStorage.setItem('lagebild.einstellungen', JSON.stringify({ bedienung: 'klassisch' }));
}, ltg.token);
const p: Page = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: DROSSEL });
await cdp.send('Performance.enable');
const metrik = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

const start = Date.now();
await p.goto(`${URL}/`);
await p.waitForFunction(() => document.querySelectorAll('.bft').length >= 49, null, { timeout: 120_000, polling: 100 });
console.log(`Start bis 49 Symbole: ${Date.now() - start} ms (CPU-Drossel ${DROSSEL}×)`);
await p.waitForTimeout(3000);

/** Bilder/s (eigene rAF-Schleife) und Hauptthread-Zeiten je Sekunde über MESS_S. */
async function messe(name: string) {
  await p.evaluate(() => {
    const w = window as unknown as { rafs: number };
    w.rafs = 0;
    const f = () => (w.rafs++, requestAnimationFrame(f));
    requestAnimationFrame(f);
  });
  const a = await metrik();
  const t = Date.now();
  await p.waitForTimeout(MESS_S * 1000);
  const b = await metrik();
  const s = (Date.now() - t) / 1000;
  const je = (k: string) => (((b[k] - a[k]) / s) * 1000).toFixed(0);
  const bilder = (await p.evaluate(() => (window as unknown as { rafs: number }).rafs)) / s;
  console.log(`${name.padEnd(30)} ${bilder.toFixed(1)} Bilder/s · Script ${je('ScriptDuration')} · Layout ${je('LayoutDuration')} · Style ${je('RecalcStyleDuration')} ms/s`);
}
await messe('Ruhe, 49 Geräte live');
await p.locator('nav.werkzeuge button.werkzeug', { hasText: 'Spuren' }).click();
await p.getByRole('button', { name: 'Alle zeigen' }).click();
await p.waitForFunction(() => !document.body.textContent!.includes('Spuren werden geladen'), null, { timeout: 120_000 });
await p.locator('section.sheet').getByRole('button', { name: 'Schliessen', exact: true }).click();
await p.waitForTimeout(3000);
await messe('alle Spuren (1 h) sichtbar');

laeuft = false;
for (const s of sockets) s.close();
await browser.close();
