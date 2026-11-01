// Führungsraster als PDF: Raster und Taufen direkt über den WebSocket, dann im Panel «Als PDF» → Datei mit drei Seiten
// (Luftbild, SpotMap, Landeskarte). Die Seitenbilder landen als Screenshots in docs/screens (Kacheln von swisstopo, ohne Netz grau).
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { rasterUm, RASTER_VORGABE, zuLv95 } from '../shared/raster.ts';
import { dokuBild, indieMission, neueMission } from './hilfen.ts';

const PORT = Number(process.env.PW_PORT ?? 8797);
const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const K = Math.cos((ADLER.latitude * Math.PI) / 180) * 111_320;
/** Meter (Ost, Nord) ab ADLER → [lon, lat] */
const ll = (ost: number, nord: number): [number, number] => [ADLER.longitude + ost / K, ADLER.latitude + nord / 111_320];
const rechteck = (x0: number, y0: number, x1: number, y1: number) => [[ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)]];
const taufe = (familie: string, name: string, geometrie: unknown, extra: Record<string, unknown> = {}) => ({
  typ: 'taufe.neu',
  taufe: { familie, name, geometrie, quelle: 'gezeichnet', objektart: '', stoss: null, fassaden: [], ziel: false, ...extra },
});

/** Nachrichten nacheinander senden, jeweils auf die Antwort `echo` warten. */
function sende(token: string, schritte: [object, string][]): Promise<void> {
  return new Promise((ok, nok) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    let i = -1;
    const weiter = () => {
      if (++i === schritte.length) return (ws.close(), ok());
      ws.send(JSON.stringify(schritte[i][0]));
    };
    ws.on('error', nok);
    ws.on('open', () => ws.send(JSON.stringify({ typ: 'hallo', token })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.typ === 'fehler') nok(new Error(m.text ?? JSON.stringify(m)));
      else if (m.typ === 'snapshot' && i < 0) weiter();
      else if (i >= 0 && i < schritte.length && m.typ === schritte[i][1]) weiter();
    });
  });
}

/** JPEG-Seiten aus dem PDF (je /DCTDecode-Stream). */
function seitenbilder(pdf: Buffer): Buffer[] {
  const text = pdf.toString('latin1');
  return [...text.matchAll(/\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/g)].map((m) => pdf.subarray(m.index! + m[0].length, m.index! + m[0].length + Number(m[1])));
}

async function bild(p: Page, jpeg: Buffer, name: string) {
  await p.setViewportSize({ width: 1170, height: 827 });
  await p.setContent(`<body style="margin:0"><img style="width:1170px;display:block" src="data:image/jpeg;base64,${jpeg.toString('base64')}"></body>`);
  await p.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  await dokuBild(p, `v4-raster-pdf-${name}`);
}

test('Piccolo «Als PDF»: Datei mit Luftbild, SpotMap und Landeskarte', async ({ browser }) => {
  test.setTimeout(150_000);
  const start = await browser.newContext();
  const { token } = await neueMission(start.request, 'Übung Aare');
  await start.close();

  const ctx = await browser.newContext({ geolocation: ADLER });
  const raster = { art: 'piccolo', ...rasterUm(zuLv95({ lat: ADLER.latitude, lon: ADLER.longitude }), RASTER_VORGABE.piccolo) };
  await sende(token, [
    [{ typ: 'raster.setzen', raster }, 'raster'],
    [{ typ: 'raster.fixieren', art: 'piccolo', fixiert: true }, 'raster'],
    [taufe('gebaeude', 'Gold', { type: 'Polygon', coordinates: rechteck(-25, 10, 15, 35) }, { stoss: 0, ziel: true }), 'taufe'],
    [taufe('gebaeude', 'Iridium', { type: 'Polygon', coordinates: rechteck(30, -40, 55, -15) }, { stoss: 270 }), 'taufe'],
    [taufe('strasse', 'Bear', { type: 'LineString', coordinates: [ll(-100, -5), ll(0, -5), ll(100, -8)] }), 'taufe'],
    [taufe('flaeche', 'Floor', { type: 'Polygon', coordinates: rechteck(-80, -60, -30, -25) }), 'taufe'],
  ]);

  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => {
    throw e;
  });
  await p.goto('/');
  await indieMission(p);
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  await p.getByRole('button', { name: 'Mehr', exact: true }).click();
  await p.getByRole('menu', { name: 'Mehr' }).getByRole('menuitem', { name: 'Führungsraster' }).click();
  const piccolo = p.getByRole('region', { name: 'Führungsraster' }).getByRole('region', { name: 'Piccolo' });
  await expect(piccolo).toContainText('Fixiert');

  await piccolo.getByRole('button', { name: 'A3' }).scrollIntoViewIfNeeded();
  await dokuBild(p, 'quer-fuehrungsraster');
  const download = p.waitForEvent('download', { timeout: 120_000 });
  await piccolo.getByRole('button', { name: 'Als PDF' }).click();
  await expect(piccolo.getByRole('button', { name: 'PDF entsteht …' })).toBeDisabled();
  await dokuBild(p, 'v4-raster-pdf-panel');
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^ubung-aare-piccolo-\d{4}-\d{2}-\d{2}\.pdf$/);
  const pdf = readFileSync((await d.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.toString('latin1')).toContain('/Count 3');
  const seiten = seitenbilder(pdf);
  expect(seiten).toHaveLength(3);
  for (const s of seiten) expect([...s.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  await expect(piccolo.getByRole('button', { name: 'Als PDF' })).toBeEnabled();

  // A3: gültiges PDF mit drei Seiten im A3-Format
  const a3 = p.waitForEvent('download', { timeout: 120_000 });
  await piccolo.getByRole('button', { name: 'A3' }).click();
  const pdf3 = readFileSync((await (await a3).path())!);
  expect(pdf3.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf3.toString('latin1')).toContain('/Count 3');
  expect(pdf3.toString('latin1')).toContain('/MediaBox [0 0 1191 842]');
  expect(seitenbilder(pdf3)).toHaveLength(3);
  await expect(piccolo.getByRole('button', { name: 'A3' })).toBeEnabled();

  await bild(p, seiten[0], 'luftbild');
  await bild(p, seiten[1], 'spotmap');
  await bild(p, seiten[2], 'landeskarte');
  await ctx.close();
});
