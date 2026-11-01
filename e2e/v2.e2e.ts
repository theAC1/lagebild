// Spec v2: Querformat (Handy, Tablet, Desktop), zwei Panels, Desktop-Bedienung, Radial-Menü.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { bedienung, beitreten, dokuBild, HOCH, menue, neueMission, QUER } from './hilfen.ts';
import type { Beigetreten } from '../shared/protocol.ts';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const NAH = { latitude: 46.9466, longitude: 7.4462 }; // ~150 m östlich

test.describe.configure({ mode: 'serial' });

let leitung: Page;
let bravo: Page;

async function seite(browser: Browser, code: string | Beigetreten, rufname: string, geolocation: typeof ADLER, viewport: { width: number; height: number }): Promise<Page> {
  const ctx = await browser.newContext({ geolocation, viewport });
  const r = await beitreten(ctx.request, code, { rufname });
  const { token } = r;
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  await ctx.addInitScript(bedienung, 'klassisch');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return page;
}

const bild = (p: Page, name: string) => dokuBild(p, `v2-${name}`);
const werkzeug = (p: Page, label: string) => p.locator('nav.werkzeuge button.werkzeug', { hasText: label });
const sheets = (p: Page) => p.locator('section.sheet');
const karte = (p: Page) => p.locator('.maplibregl-canvas');
const box = async (p: Page, sel: string) => (await p.locator(sel).first().boundingBox())!;
const bravoSymbol = (p: Page) => p.locator('.bft', { has: p.locator('.bft-label', { hasText: 'Bravo' }) }).locator('.bft-sym');

/** Einblend-Animation der Panels abwarten, sonst misst man verschobene Boxen. */
const ruhig = (p: Page) => p.locator('section.sheet').evaluateAll((els) => Promise.all(els.flatMap((e) => e.getAnimations().map((a) => a.finished))));

/** Leiste rechts, Panel links daneben, Karte dazwischen und bedienbar. */
async function pruefeQuerLayout(p: Page, breite: number) {
  const leiste = await box(p, 'nav.werkzeuge');
  expect(leiste.x + leiste.width).toBeGreaterThanOrEqual(breite - 1);
  expect(leiste.height).toBeGreaterThan(leiste.width);
  await werkzeug(p, 'Chat').click();
  await ruhig(p);
  const panel = await box(p, 'section.sheet');
  const k = (await karte(p).boundingBox())!;
  expect(panel.x).toBeLessThanOrEqual(1);
  expect(panel.width).toBeGreaterThanOrEqual(319.5);
  await expect.poll(async () => (await karte(p).boundingBox())!.x).toBeGreaterThanOrEqual(panel.x + panel.width - 1);
  expect(k.x + k.width).toBeLessThanOrEqual(leiste.x + 1);
  // Karte bleibt bedienbar, während das Panel offen ist
  const k2 = (await karte(p).boundingBox())!;
  await p.mouse.click(k2.x + k2.width * 0.5, k2.y + k2.height * 0.8, { button: 'right' });
  const ring = p.getByRole('menu', { name: 'Aktionen für Punkt' });
  await expect(ring.getByRole('menuitem').first()).toBeVisible(); // der Ring selbst ist 0×0
  await p.keyboard.press('Escape');
  await expect(ring).toHaveCount(0);
  await expect(sheets(p)).toHaveCount(1);
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const lage = await neueMission(ctx.request, 'Querformat', 'lv');
  await ctx.close();
  leitung = await seite(browser, lage, 'Adler', ADLER, QUER);
  bravo = await seite(browser, lage.teilnehmerCode, 'Bravo', NAH, HOCH);
  await expect(leitung.locator('.bft-label', { hasText: 'Bravo' })).toBeVisible();
});

test.afterAll(async () => {
  await leitung?.context().close();
  await bravo?.context().close();
});

test('Handy quer 851×393: Leiste rechts, Panel seitlich, einklappen gemerkt', async () => {
  await pruefeQuerLayout(leitung, QUER.width);
  await bild(leitung, 'handy-quer');
  await leitung.keyboard.press('Escape');
  await expect(sheets(leitung)).toHaveCount(0);

  const vorher = (await karte(leitung).boundingBox())!.width;
  await leitung.getByRole('button', { name: 'Werkzeugleiste einklappen' }).click();
  await expect.poll(async () => (await karte(leitung).boundingBox())!.width).toBeGreaterThan(vorher + 50);
  await leitung.reload();
  await expect(leitung.getByRole('button', { name: 'Werkzeugleiste ausklappen' })).toBeVisible();
  await expect(werkzeug(leitung, 'Chat')).toBeHidden();
  await bild(leitung, 'handy-quer-eingeklappt');
  await leitung.getByRole('button', { name: 'Werkzeugleiste ausklappen' }).click();
  await expect(werkzeug(leitung, 'Chat')).toBeVisible();
});

test('Handy quer: unter 1100 px ersetzt ein zweites Panel das erste', async () => {
  await werkzeug(leitung, 'Chat').click();
  await werkzeug(leitung, 'Marker').click();
  await expect(sheets(leitung)).toHaveCount(1);
  await expect(sheets(leitung)).toHaveAttribute('aria-label', 'Marker');
  await leitung.keyboard.press('Escape');
});

test('Tablet 1180×820: zwei Panels nebeneinander', async () => {
  await leitung.setViewportSize({ width: 1180, height: 820 });
  await pruefeQuerLayout(leitung, 1180);
  await leitung.getByRole('button', { name: 'Teilnehmende', exact: true }).click();
  await expect(sheets(leitung)).toHaveCount(2);
  await bild(leitung, 'tablet');
  await leitung.keyboard.press('Escape');
  await leitung.keyboard.press('Escape');
  await expect(sheets(leitung)).toHaveCount(0);
});

test('Desktop 1440×900: zwei Panels, jedes mit eigenem Schliessen; Karte bleibt klickbar', async () => {
  await leitung.setViewportSize({ width: 1440, height: 900 });
  await werkzeug(leitung, 'Chat').click();
  await leitung.getByRole('button', { name: 'Teilnehmende', exact: true }).click();
  await ruhig(leitung);
  const [a, b] = [(await sheets(leitung).nth(0).boundingBox())!, (await sheets(leitung).nth(1).boundingBox())!];
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1); // nebeneinander, ohne Überlappung
  await expect.poll(async () => (await karte(leitung).boundingBox())!.x).toBeGreaterThanOrEqual(b.x + b.width - 1);
  const k = (await karte(leitung).boundingBox())!;
  expect(k.width).toBeGreaterThan(1440 / 3);
  await expect(sheets(leitung).nth(0).getByRole('button', { name: 'Schliessen' })).toBeVisible();
  await expect(sheets(leitung).nth(1).getByRole('button', { name: 'Schliessen' })).toBeVisible();
  // Klick in die Karte schliesst nichts
  await leitung.mouse.click(k.x + k.width * 0.3, k.y + k.height * 0.8);
  await expect(sheets(leitung)).toHaveCount(2);
  // Azimut dreistellig, Himmelsrichtung getrennt (Bravo liegt östlich: «090° O», nicht «O 90°»)
  const bravoZeile = leitung.getByRole('region', { name: 'Teilnehmende' }).locator('li', { hasText: 'Bravo' });
  await expect(bravoZeile.locator('.dist')).toContainText(/(?<!\d)\d{3}° O$/);
  await bild(leitung, 'desktop-panels');

  // Chat-Panel schliessen lässt Teilnehmende offen
  await leitung.getByRole('region', { name: 'Chat' }).getByRole('button', { name: 'Schliessen' }).click();
  await expect(sheets(leitung)).toHaveCount(1);
  await expect(sheets(leitung)).toHaveAttribute('aria-label', 'Teilnehmende');
});

test('Desktop: Rechtsklick auf Teilnehmer öffnet Radial-Menü, Esc schliesst', async () => {
  await bravoSymbol(leitung).click({ button: 'right' });
  const ring = leitung.getByRole('menu', { name: /Bravo/ });
  await expect(ring.getByRole('menuitem').first()).toBeVisible(); // Ring selbst ist 0×0, nur Anker
  for (const name of ['Details', 'R&B', 'Folgen', 'Spur ein', 'Chat']) await expect(ring.getByRole('menuitem', { name })).toBeVisible();
  const knoepfe = await ring.locator('.symbol').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  for (const r of knoepfe) expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
  await bild(leitung, 'desktop-radial');
  await leitung.keyboard.press('Escape');
  await expect(ring).toHaveCount(0);
  await expect(sheets(leitung)).toHaveCount(1); // Esc schloss nur das Menü

  // Chat aus dem Ring → öffnet neben der Teilnehmerliste. MapView verwirft einen zweiten Rechtsklick an derselben
  // Stelle binnen 500 ms (Android-Doppelereignis); früher wartete das Bildschirmfoto davor lange genug.
  await leitung.waitForTimeout(600);
  await bravoSymbol(leitung).click({ button: 'right' });
  await ring.getByRole('menuitem', { name: 'Chat' }).click();
  await expect(sheets(leitung)).toHaveCount(2);
  await expect(leitung.getByRole('region', { name: 'Chat' })).toBeVisible();

  // Tippen ausserhalb schliesst den Ring
  await bravoSymbol(leitung).click({ button: 'right' });
  await expect(ring.getByRole('menuitem').first()).toBeVisible(); // Ring selbst ist 0×0, nur Anker
  await leitung.mouse.click(5, 450);
  await expect(ring).toHaveCount(0);

  // Esc schliesst das oberste Panel (Chat), dann das nächste
  await leitung.keyboard.press('Escape');
  await expect(sheets(leitung)).toHaveCount(1);
  await expect(sheets(leitung)).toHaveAttribute('aria-label', 'Teilnehmende');
  await leitung.keyboard.press('Escape');
  await expect(sheets(leitung)).toHaveCount(0);
});

test('Desktop: Doppelklick auf Symbol = Details, Rechtsklick auf leere Karte = Radial-Menü', async () => {
  await bravoSymbol(leitung).dblclick();
  await expect(leitung.getByRole('region', { name: 'Teilnehmer' })).toContainText('Bravo');
  await leitung.keyboard.press('Escape');

  const k = (await karte(leitung).boundingBox())!;
  await leitung.mouse.click(k.x + 40, k.y + k.height - 60, { button: 'right' });
  const ring = leitung.getByRole('menu', { name: 'Aktionen für Punkt' });
  for (const name of ['Koordinate', 'Marker hier', 'Sichtung hier', 'R&B', 'Bloodhound']) await expect(ring.getByRole('menuitem', { name })).toBeVisible();
  await ring.getByRole('menuitem', { name: 'Koordinate' }).click();
  const koord = leitung.getByRole('dialog', { name: 'Koordinate' });
  await expect(koord).toBeInViewport({ ratio: 1 });
  await leitung.keyboard.press('Escape');
  await expect(koord).toHaveCount(0);
});

test('Koordinatenzeile: standardmässig aus, Klick aufs eigene Symbol schaltet (gemerkt); Radial am eigenen Symbol', async () => {
  const leiste = leitung.locator('footer .leiste');
  await expect(leitung.locator('.bft.ich')).toBeVisible();
  await expect(leiste).toHaveCount(0);
  await leitung.locator('.bft.ich .bft-sym').click();
  await expect(leiste).toBeVisible();
  await leitung.reload();
  await expect(leiste).toBeVisible();

  await leitung.locator('.bft.ich .bft-sym').click({ button: 'right' });
  const ring = leitung.getByRole('menu', { name: /Adler/ });
  for (const name of ['Details', 'Koord. aus', 'Folgen', 'Spur ein', 'Marker hier']) await expect(ring.getByRole('menuitem', { name })).toBeVisible();
  await ring.getByRole('menuitem', { name: 'Koord. aus' }).click();
  await expect(leiste).toHaveCount(0);
});

test('Ausrichtung fix «Hoch» ohne Sperre: Hinweis «Gerät drehen»', async () => {
  await menue(leitung, 'Einstellungen');
  const gruppe = leitung.getByRole('group', { name: 'Ausrichtung' });
  // «ohne Sperre» ausdrücklich: headless Chromium erfüllt lock() sonst, dann blitzt der Hinweis nur kurz auf
  await leitung.evaluate(() => {
    (screen.orientation as ScreenOrientation & { lock: () => Promise<void> }).lock = () => Promise.reject(new Error('nicht unterstützt'));
  });
  await gruppe.getByRole('button', { name: 'Hoch' }).click();
  await expect(leitung.getByRole('status').filter({ hasText: 'Gerät drehen' })).toBeVisible();
  await bild(leitung, 'desktop-drehen');
  await gruppe.getByRole('button', { name: 'Automatisch' }).click();
  await expect(leitung.getByText('Gerät drehen')).toHaveCount(0);
  await leitung.keyboard.press('Escape');
});
