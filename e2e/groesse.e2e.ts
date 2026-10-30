// Einstellung «Bediengrösse» auf dem Handy (Touch): Trefferflächen, keine Überlappung, Karte bleibt gross, gemerkt.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { langdruck, leereStelle } from './hilfen.ts';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const SIDC = '10031000001211000000';
const HOCH = { width: 390, height: 844 };
const QUER = { width: 844, height: 390 };
const NIEDRIG = { width: 740, height: 360 };
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

  // Melden-Wahl: ganz im Bild, Kacheln ≥ 56 px, überdecken weder einander noch den Melden-Knopf
  const melden = knopf(p, 'Melden');
  await melden.click();
  const wahl = p.getByRole('menu', { name: 'Melden' });
  await expect(wahl).toBeInViewport({ ratio: 1 });
  const mk = (await melden.boundingBox())!;
  const kacheln: Box[] = [];
  for (const el of await wahl.getByRole('menuitem').all()) kacheln.push((await el.boundingBox())!);
  expect(kacheln).toHaveLength(2);
  expect(schneiden(kacheln[0], kacheln[1]), 'Kacheln ↔ einander').toBe(false);
  for (const k of kacheln) {
    expect(Math.min(k.width, k.height), 'Kachel ≥ 56 px').toBeGreaterThanOrEqual(56);
    expect(schneiden(k, mk), 'Kachel ↔ Melden').toBe(false);
  }
  await p.touchscreen.tap(viewport.width / 2, viewport.height * (quer ? 0.85 : 0.4)); // daneben tippen schliesst
  await expect(wahl).toHaveCount(0);

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
  ['niedrig', NIEDRIG],
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

// Langdruck überall (30.10.): auf leerer Karte derselbe Ring wie auf Symbolen, «Koordinate» als kompakte Karte
const LEER = ['Koordinate', 'Marker hier', 'Sichtung hier', 'R&B', 'Bloodhound'];
const STELLEN: [number, number][] = [
  [0.5, 0.62],
  [0.4, 0.7],
  [0.6, 0.4],
  [0.35, 0.35],
];
const ringLeer = (p: Page) => p.getByRole('menu', { name: 'Aktionen für Punkt' });

/** Vibration zählen: jeder Ring meldet sich einmal, ein Doppel-Auslösen (MapLibre + natives contextmenu) zeigt sich als 2. */
const zaehleVibration = (p: Page) =>
  p.evaluate(() => {
    const w = window as unknown as { vib: number };
    w.vib = 0;
    navigator.vibrate = () => (w.vib++, true);
  });
const vibriert = (p: Page) => p.evaluate(() => (window as unknown as { vib: number }).vib);

for (const [ansicht, viewport] of [
  ['quer', NIEDRIG],
  ['hoch', HOCH],
] as const) {
  for (const stufe of ['normal', 'sehrgross'] as const) {
    test(`Langdruck auf leere Karte ${viewport.width}×${viewport.height} ${stufe}: Ring, Koordinate ganz im Bild`, async ({ browser }) => {
      const p = await handy(browser, viewport, stufe, `L-${ansicht}-${stufe}`);
      await p.context().grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write']);
      await p.waitForLoadState('networkidle');
      await zaehleVibration(p);
      const { x, y } = await leereStelle(p, STELLEN);
      await langdruck(p, x, y);

      const ring = ringLeer(p);
      await expect(ring.getByRole('menuitem')).toHaveText(LEER);
      expect(await vibriert(p), 'genau ein Auslösen').toBe(1);
      for (const el of await ring.getByRole('menuitem').all()) await expect(el).toBeInViewport({ ratio: 1 });
      const gekuerzt = await ring.locator('.text').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
      expect(gekuerzt, 'Beschriftungen ungekürzt').toEqual([]);
      const teile: { name: string; box: Box }[] = [];
      for (const el of await ring.locator('.text, .symbol').all()) teile.push({ name: (await el.textContent()) || 'Symbol', box: (await el.boundingBox())! });
      for (const t of teile) {
        expect(t.box.x >= 0 && t.box.y >= 0 && t.box.x + t.box.width <= viewport.width + 0.5 && t.box.y + t.box.height <= viewport.height + 0.5, `${t.name} im Bild`).toBe(true);
      }
      for (const [i, a] of teile.entries()) for (const b of teile.slice(i + 1)) expect(schneiden(a.box, b.box), `${a.name} ↔ ${b.name}`).toBe(false);
      await p.waitForTimeout(300);
      await p.screenshot({ path: `docs/screens/v3-radial-leer-${ansicht}-${stufe}.png`, animations: 'disabled' });

      await ring.getByRole('menuitem', { name: 'Koordinate' }).tap();
      await expect(ring).toHaveCount(0);
      const karte = p.getByRole('dialog', { name: 'Koordinate' });
      await expect(karte).toBeInViewport({ ratio: 1 });
      for (const f of ['LV95', 'MGRS', 'WGS84']) await expect(karte.getByRole('button', { name: new RegExp(`^${f} .+ kopieren$`) })).toBeInViewport({ ratio: 1 });
      await expect(karte).toContainText(/Von mir: \d/);
      // nichts abgeschnitten: kein internes Scrollen, kein Element ragt aus der Karte oder läuft in sich über
      expect(await karte.evaluate((k) => k.scrollHeight <= k.clientHeight + 1), 'Karte scrollt nicht').toBe(true);
      const raus = await karte.evaluate((k) => {
        const r = k.getBoundingClientRect();
        return [...k.querySelectorAll('*')]
          .filter((x) => {
            const b = x.getBoundingClientRect();
            return b.right > r.right + 0.5 || b.left < r.left - 0.5 || b.bottom > r.bottom + 0.5 || x.scrollWidth > x.clientWidth + 1;
          })
          .map((x) => x.textContent?.slice(0, 24));
      });
      expect(raus).toEqual([]);
      await p.screenshot({ path: `docs/screens/v3-koordinate-${ansicht}-${stufe}.png`, animations: 'disabled' });

      const lv95 = karte.getByRole('button', { name: /^LV95 / });
      await lv95.tap();
      await expect(lv95).toContainText('Kopiert');
      expect(await p.evaluate(() => navigator.clipboard.readText())).toMatch(/^\d.* \/ \d/);

      // Tippen daneben schliesst: unter bzw. über der Karte
      const b = (await karte.boundingBox())!;
      const daneben = b.y > viewport.height / 2 ? b.y / 2 : (b.y + b.height + viewport.height) / 2;
      await p.touchscreen.tap(b.x + b.width / 2, daneben);
      await expect(karte).toHaveCount(0);
      await p.context().close();
    });
  }
}

test('Langdruck auf leere Karte: «Marker hier» setzt einen Marker, Esc schliesst den Ring', async ({ browser }) => {
  const p = await handy(browser, NIEDRIG, 'normal', 'L-Marker');
  await p.waitForLoadState('networkidle');
  const vorher = await p.locator('.lage-marker').count();
  const { x, y } = await leereStelle(p, STELLEN);
  await langdruck(p, x, y);
  await expect(ringLeer(p).getByRole('menuitem').first()).toBeVisible(); // der Ring selbst ist 0×0
  await p.keyboard.press('Escape');
  await expect(ringLeer(p)).toHaveCount(0);

  await langdruck(p, x, y);
  await ringLeer(p).getByRole('menuitem', { name: 'Marker hier' }).tap();
  await p.getByRole('button', { name: 'Marker setzen', exact: true }).tap();
  await expect(p.locator('.lage-marker')).toHaveCount(vorher + 1);
  await p.context().close();
});
