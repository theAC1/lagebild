// Einstellung «Bediengrösse» auf dem Handy (Touch): Trefferflächen, keine Überlappung, Karte bleibt gross, gemerkt.
import { expect, test, type Browser, type Page } from '@playwright/test';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const SIDC = '10031000001211000000';
const HOCH = { width: 390, height: 844 };
const QUER = { width: 844, height: 390 };
const KARTEN = ['Karte und Ebenen wählen', 'Eigener Position folgen', 'Karte nach Norden ausrichten'];
type Box = { x: number; y: number; width: number; height: number };

test.describe.configure({ mode: 'serial' });

let code: string;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/lage', { data: { name: 'Übung Grösse', erstellPasswort: 'e2e' } });
  code = (await r.json()).teilnehmerCode;
  await ctx.close();
});

/** Handy mit Touch (pointer: coarse); `groesse` wird vor dem ersten Laden gesetzt, sofern noch keine gewählt ist. */
async function handy(browser: Browser, viewport: typeof HOCH, groesse: string, rufname: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, geolocation: ADLER });
  await ctx.clock.install({ time: new Date('2026-10-29T22:00:00+01:00') }); // Nacht-Thema wie die übrigen Bilder
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname, einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  const { token } = await r.json();
  await ctx.addInitScript(
    ([t, g]) => {
      localStorage.setItem('lagebild.token', t);
      const k = 'lagebild.einstellungen';
      const e = JSON.parse(localStorage.getItem(k) ?? '{}');
      if (!e.groesse) localStorage.setItem(k, JSON.stringify({ ...e, groesse: g }));
    },
    [token, groesse],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return page;
}

const knopf = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' });
const ui = (p: Page) => p.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--ui')));
const schneiden = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Leiste (hoch: Dock + Alarm, quer: beide Ränder), Kartenknöpfe und Kopfzeile prüfen. */
async function pruefe(p: Page, viewport: typeof HOCH) {
  const quer = viewport.width > viewport.height;
  const leiste = quer ? p.locator('aside.rand').getByRole('button') : p.getByRole('navigation', { name: 'Hauptaktionen' }).getByRole('button');
  const knoepfe: { name: string; box: Box }[] = [];
  for (const el of await leiste.all()) knoepfe.push({ name: (await el.getAttribute('aria-label')) ?? 'Leiste', box: (await el.boundingBox())! });
  if (!quer) knoepfe.push({ name: 'Alarm', box: (await knopf(p, /^Alarm/).boundingBox())! }); // quer sitzt er im linken Rand
  const karten = [];
  for (const name of KARTEN) karten.push({ name, box: (await knopf(p, name).boundingBox())! });
  const tn = { name: 'Teilnehmende', box: (await knopf(p, /^Teilnehmende/).boundingBox())! };

  for (const k of [...knoepfe, ...karten, tn]) {
    expect(Math.min(k.box.width, k.box.height), `${k.name} ≥ 48 px`).toBeGreaterThanOrEqual(48);
    expect(k.box.x, `${k.name} links im Bild`).toBeGreaterThanOrEqual(0);
    expect(k.box.y, `${k.name} oben im Bild`).toBeGreaterThanOrEqual(0);
    expect(k.box.x + k.box.width, `${k.name} rechts im Bild`).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(k.box.y + k.box.height, `${k.name} unten im Bild`).toBeLessThanOrEqual(viewport.height + 0.5);
  }
  const kopf = (await p.locator('header.kopf').boundingBox())!;
  for (const k of [...knoepfe, ...karten]) expect(schneiden(k.box, kopf), `${k.name} nicht unter der Kopfzeile`).toBe(false);
  const alle = [...knoepfe, ...karten];
  for (const [i, a] of alle.entries()) for (const b of alle.slice(i + 1)) expect(schneiden(a.box, b.box), `${a.name} ↔ ${b.name}`).toBe(false);
  // Kopfzeile einzeilig: Lagename auf einer Zeile
  const lage = (await p.locator('header.kopf .lage').boundingBox())!;
  expect(lage.height).toBeLessThan(kopf.height);

  if (quer) {
    // ohne Panel: freie Karte zwischen den Rändern und unter der Kopfzeile ≥ 55 % der Fläche
    const links = (await p.locator('aside.rand.links').boundingBox())!;
    const rechts = (await p.locator('aside.rand.rechts').boundingBox())!;
    const frei = (rechts.x - (links.x + links.width)) * (viewport.height - kopf.height);
    expect(frei / (viewport.width * viewport.height)).toBeGreaterThanOrEqual(0.55);
  }
}

/** Kacheln laden lassen (wie v3: Netz ruhig, Einblenden abwarten), dann Bild. */
async function bild(p: Page, name: string) {
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(800);
  await p.screenshot({ path: `docs/screens/v2-groesse-${name}.png`, animations: 'disabled' });
}

for (const [ansicht, viewport] of [
  ['hoch', HOCH],
  ['quer', QUER],
] as const) {
  test(`Touch ${ansicht} ${viewport.width}×${viewport.height}: Normal mit grösserer Schrift, alles ≥ 48 px ohne Überlappung`, async ({ browser }) => {
    const p = await handy(browser, viewport, 'normal', `N-${ansicht}`);
    expect(await ui(p)).toBe(1);
    expect(await p.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('18px');
    await pruefe(p, viewport);
    await bild(p, `${ansicht}-normal`);
    await p.context().close();
  });

  test(`Touch ${ansicht} ${viewport.width}×${viewport.height}: Sehr gross bleibt bedienbar, Panel scrollt intern`, async ({ browser }) => {
    const p = await handy(browser, viewport, 'sehrgross', `S-${ansicht}`);
    expect(await ui(p)).toBe(1.4);
    await pruefe(p, viewport);
    await bild(p, `${ansicht}-sehrgross`);

    // Einstellungen als Panel: ganz im Bild und intern scrollbar bis «Lage verlassen»
    await knopf(p, 'Mehr').click();
    await p.getByRole('menuitem', { name: 'Einstellungen' }).click();
    const panel = p.getByRole('region', { name: 'Einstellungen' });
    await expect(panel).toBeInViewport({ ratio: 1 });
    const verlassen = panel.getByRole('button', { name: 'Lage verlassen' });
    await verlassen.scrollIntoViewIfNeeded();
    await expect(verlassen).toBeInViewport({ ratio: 1 });
    // grosse Schrift sprengt keine Spalte: nichts ragt in den rechten Innenabstand oder darüber hinaus
    const raus = await panel.locator('.inhalt').evaluate((i) => {
      const rand = i.getBoundingClientRect().right - parseFloat(getComputedStyle(i).paddingRight) + 1;
      return [...i.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().right > rand).map((x) => x.textContent?.slice(0, 20));
    });
    expect(raus).toEqual([]);
    await p.context().close();
  });
}

test('Bediengrösse in den Einstellungen wählen: wirkt sofort und gilt nach Neuladen', async ({ browser }) => {
  const p = await handy(browser, HOCH, 'normal', 'Reload');
  const folgen = knopf(p, 'Eigener Position folgen');
  const vorher = (await folgen.boundingBox())!.height;
  await knopf(p, 'Mehr').click();
  await p.getByRole('menuitem', { name: 'Einstellungen' }).click();
  const gruppe = p.getByRole('group', { name: 'Bediengrösse' });
  await gruppe.getByRole('button', { name: 'Sehr gross' }).click();
  await expect(gruppe.getByRole('button', { name: 'Sehr gross' })).toHaveAttribute('aria-pressed', 'true');
  expect(await ui(p)).toBe(1.4);
  expect((await folgen.boundingBox())!.height).toBeCloseTo(vorher * 1.4, 0);
  await p.reload();
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  expect(await ui(p)).toBe(1.4);
  await knopf(p, 'Mehr').click();
  await p.getByRole('menuitem', { name: 'Einstellungen' }).click();
  await expect(p.getByRole('group', { name: 'Bediengrösse' }).getByRole('button', { name: 'Sehr gross' })).toHaveAttribute('aria-pressed', 'true');
  await p.context().close();
});

test('Desktop (Maus): Normal bleibt beim heutigen Stand, Gross skaliert', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: ADLER });
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname: 'Desk', einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  const { token } = await r.json();
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  const p = await ctx.newPage();
  await p.goto('/');
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  expect(await ui(p)).toBe(1);
  expect((await knopf(p, 'Eigener Position folgen').boundingBox())!.height).toBe(48);
  await p.evaluate(() => localStorage.setItem('lagebild.einstellungen', JSON.stringify({ ...JSON.parse(localStorage.getItem('lagebild.einstellungen') ?? '{}'), groesse: 'gross' })));
  await p.reload();
  expect(await ui(p)).toBe(1.2);
  expect((await knopf(p, 'Eigener Position folgen').boundingBox())!.height).toBeCloseTo(57.6, 0);
  await ctx.close();
});
