// Bloodhound: persönliches Bloodhound per Rechtsklick-Radial (Desktop) und Auftrag der Leitung bis «erreicht».
import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import { bedienung, beitreten, DESKTOP, dokuBild, indieMission, neueMission } from './hilfen.ts';
import type { Beigetreten } from '../shared/protocol.ts';

const PORT = Number(process.env.PW_PORT ?? 8797);
const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const BRAVO = { latitude: 46.9466, longitude: 7.4462 };
const MARKER = { lat: 46.9466, lon: 7.4562 }; // ~800 m östlich von Bravo
const SIDC = '10031000001211000000';

test.describe.configure({ mode: 'serial' });

let leitung: Page;
let bravo: Page;
let bravoCtx: BrowserContext;
let charlie: Page; // Unbeteiligte: sieht die Linie, bekommt keine Meldung
const charlieMsgs: { typ: string; auftrag?: { ende: string | null } }[] = [];

async function seite(browser: Browser, code: string | Beigetreten, rufname: string, geolocation: typeof ADLER, kontext: BrowserContextOptions = {}) {
  const ctx = await browser.newContext({ geolocation, ...kontext });
  const r = await beitreten(ctx.request, code, { rufname });
  const { token } = r;
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  await ctx.addInitScript(bedienung, 'klassisch');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await indieMission(page);
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return { page, token: token as string, ctx };
}

/** Marker direkt über den WebSocket setzen (die UI dafür ist nicht Gegenstand dieses Tests). */
function setzeMarker(token: string): Promise<void> {
  return new Promise((ok, nok) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    ws.on('error', nok);
    ws.on('open', () => ws.send(JSON.stringify({ typ: 'hallo', token })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.typ === 'snapshot') ws.send(JSON.stringify({ typ: 'marker.setzen', marker: { sidc: SIDC, ...MARKER, bezeichnung: 'Treffpunkt', notiz: '' } }));
      if (m.typ === 'marker') {
        ws.close();
        ok();
      }
    });
  });
}

const bild = (p: Page, name: string) => dokuBild(p, `v2-bloodhound-${name}`);
const leiste = (p: Page) => p.getByRole('region', { name: 'Bloodhound' });
const bravoSymbol = (p: Page) => p.locator('.bft', { has: p.locator('.bft-label', { hasText: 'Bravo' }) }).locator('.bft-sym');

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const lage = await neueMission(ctx.request, 'Bloodhound', 'lv');
  await ctx.close();
  const l = await seite(browser, lage, 'Adler', ADLER, DESKTOP);
  leitung = l.page;
  const b = await seite(browser, lage.teilnehmerCode, 'Bravo', BRAVO);
  bravo = b.page;
  bravoCtx = b.ctx;
  const c = await seite(browser, lage.teilnehmerCode, 'Charlie', ADLER);
  charlie = c.page;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); // Charlies Datenstrom: Linie (Delta) ja, Meldung nein
  ws.on('open', () => ws.send(JSON.stringify({ typ: 'hallo', token: c.token })));
  ws.on('message', (d) => charlieMsgs.push(JSON.parse(d.toString())));
  await expect(leitung.locator('.bft-label', { hasText: 'Bravo' })).toBeVisible();
  await setzeMarker(l.token);
  await expect(leitung.locator('[data-ziel-art="marker"]').first()).toBeAttached();
});

test.afterAll(async () => {
  await leitung?.context().close();
  await bravo?.context().close();
  await charlie?.context().close();
});

test('persönliches Bloodhound per Rechtsklick-Radial, überlebt Reload, Beenden', async () => {
  await bravoSymbol(leitung).click({ button: 'right' });
  const ring = leitung.getByRole('menu', { name: /Bravo/ });
  await expect(ring.getByRole('menuitem', { name: 'Bloodhound', exact: true })).toBeVisible();
  await expect(ring.getByRole('menuitem', { name: 'BH-Auftrag' })).toBeVisible();
  await bild(leitung, 'radial');
  await ring.getByRole('menuitem', { name: 'Bloodhound', exact: true }).click();

  const bar = leiste(leitung);
  await expect(bar).toContainText('Bravo');
  await expect(bar).toContainText(/\d+ m/);
  await expect(bar).toContainText(/\d{3}°/);
  await expect(bar).toContainText('‰');
  await expect(bar).toContainText('Rest —'); // keine Bewegung
  await bild(leitung, 'persoenlich-desktop');

  await leitung.reload();
  await indieMission(leitung);
  await expect(leiste(leitung)).toContainText('Bravo');
  await leiste(leitung).getByRole('button', { name: 'Bloodhound beenden' }).click();
  await expect(leiste(leitung)).toHaveCount(0);
});

test('Radial auf leerer Karte: «Bloodhound» startet auf einen Kartenpunkt', async () => {
  const k = (await leitung.locator('.maplibregl-canvas').boundingBox())!;
  await leitung.mouse.click(k.x + k.width * 0.5, k.y + k.height * 0.7, { button: 'right' });
  await leitung.getByRole('menu', { name: 'Aktionen für Punkt' }).getByRole('menuitem', { name: 'Bloodhound', exact: true }).click();
  await expect(leiste(leitung)).toContainText('Kartenpunkt');
  await leiste(leitung).getByRole('button', { name: 'Bloodhound beenden' }).click();
});

test('Auftrag: Leitung → Bravo sieht Banner, quittiert, Leitung sieht «quittiert», erreicht wird gemeldet', async () => {
  // Leitung: Radial «Auftrag: Bloodhound» auf Bravo → Tab «Aufträge», Empfänger vorgewählt
  await bravoSymbol(leitung).click({ button: 'right' });
  await leitung.getByRole('menu', { name: /Bravo/ }).getByRole('menuitem', { name: 'BH-Auftrag' }).click();
  const panel = leitung.getByRole('region', { name: 'Leitung' });
  await expect(panel.getByRole('tab', { name: /Aufträge/ })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.locator('select').first()).toHaveValue(/.+/);
  await panel.locator('select').nth(1).selectOption({ label: 'Treffpunkt' });
  await panel.getByRole('button', { name: 'Auftrag senden' }).click();

  // Bravo: Banner, Signal, Quittieren
  const bar = leiste(bravo);
  await expect(bar).toContainText('Auftrag von Leitung');
  await expect(bar).toContainText('Treffpunkt');
  await expect(bar).toContainText(/\d+ m|\d\.\d+ km/);
  await bar.getByRole('button', { name: 'Quittieren' }).click();
  await expect(bar).toContainText('quittiert');

  // Leitung: «quittiert» in der Liste
  const eintrag = panel.locator('li[data-auftrag]');
  await expect(eintrag).toContainText('Bravo → Treffpunkt');
  await expect(eintrag).toContainText('quittiert');
  await expect(eintrag).not.toContainText('nicht quittiert');
  await bild(leitung, 'auftraege-leitung');

  // Handy quer: Leiste kollidiert nicht mit den Knöpfen rechts; ohne Panel reserviert links nichts Platz
  await expect(bravo.locator('section.sheet')).toHaveCount(0);
  const rechts = (await bravo.locator('nav.werkzeuge').boundingBox())!;
  expect(await bravo.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--links').trim())).toBe('0px');
  await expect.poll(async () => (await bravo.locator('.karte').boundingBox())!.x).toBe(0);
  // MapLibre zieht die Zeichenfläche erst im nächsten Frame nach, neue Kacheln blenden 300 ms ein: abwarten,
  // sonst zeigt das Bild links einen dunklen Streifen, obwohl das Layout stimmt
  await expect.poll(async () => (await bravo.locator('.maplibregl-canvas').boundingBox())!.width).toBeCloseTo(rechts.x, 0);
  await bravo.waitForTimeout(1000);
  await bild(bravo, 'auftrag-banner-quer');

  // Simulierte Position nahe am Ziel → erreicht, Auftrag endet
  await bravoCtx.setGeolocation({ latitude: MARKER.lat, longitude: MARKER.lon - 0.0001 }); // ~7 m
  await expect(bravo.locator('.toast', { hasText: 'Ziel erreicht' })).toBeVisible();
  await expect(leiste(bravo)).toHaveCount(0);
  await expect(leitung.locator('.toast', { hasText: 'Bravo hat das Ziel erreicht' })).toBeVisible();
  await expect(panel.locator('li[data-auftrag]')).toHaveCount(0);
  await bild(leitung, 'erreicht-leitung');

  // Unbeteiligte (Charlie): bekam den Auftrag (Linie auf der Karte), aber nie eine Meldung, keinen Toast, keine Leiste
  expect(charlieMsgs.filter((m) => m.typ === 'bloodhound').map((m) => m.auftrag!.ende)).toEqual([null, null, 'erreicht']); // Auftrag, Quittung, Ende
  expect(charlieMsgs.filter((m) => m.typ === 'meldung')).toEqual([]);
  await expect(charlie.locator('.toast')).toHaveCount(0);
  await expect(leiste(charlie)).toHaveCount(0);
});

test('Aufheben durch die Leitung beendet das Bloodhound beim Empfänger', async () => {
  await bravoCtx.setGeolocation(BRAVO);
  const panel = leitung.getByRole('region', { name: 'Leitung' });
  await panel.locator('select').nth(1).selectOption({ label: 'Treffpunkt' });
  await panel.getByRole('button', { name: 'Auftrag senden' }).click();
  await expect(leiste(bravo)).toContainText('Auftrag von Leitung');
  await panel.locator('li[data-auftrag]').getByRole('button', { name: 'Aufheben' }).click();
  await expect(leiste(bravo)).toHaveCount(0);
  await expect(bravo.locator('.toast', { hasText: 'aufgehoben' })).toBeVisible();
  await expect(leitung.locator('.toast', { hasText: 'Auftrag an Bravo aufgehoben' })).toBeVisible();
});
