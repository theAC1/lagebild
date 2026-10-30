// Feldfälle: Funkloch (halb offene Verbindung), GPS-Verlust, verweigerter Standort, schmale Handys und Querformat.
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { bedienung } from './hilfen.ts';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const NAH = { latitude: 46.9466, longitude: 7.4462 }; // ~150 m östlich: Symbole überlappen auf Zoom 14
const SIDC = '10031000001211000000';

type Lage = { teilnehmerCode: string; leitungCode: string };

async function neueLage(browser: Browser, name: string): Promise<Lage> {
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/lage', { data: { name, erstellPasswort: 'e2e' } });
  expect(r.status()).toBe(201);
  const lage = (await r.json()) as Lage;
  await ctx.close();
  return lage;
}

/** Neue Seite, per REST beigetreten (Token im localStorage), verbunden. */
async function seite(
  browser: Browser,
  code: string,
  rufname: string,
  o: BrowserContextOptions & { vorher?: (p: Page) => Promise<void>; einstellungen?: object } = {},
): Promise<Page> {
  const { vorher, einstellungen, ...ctxOpt } = o;
  const ctx = await browser.newContext(ctxOpt);
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname, einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  expect(r.status()).toBe(201);
  const { token } = await r.json();
  await ctx.addInitScript(
    ([t, e]) => {
      localStorage.setItem('lagebild.token', t);
      if (e) localStorage.setItem('lagebild.einstellungen', e);
    },
    [token, einstellungen ? JSON.stringify(einstellungen) : ''] as const,
  );
  await ctx.addInitScript(bedienung, 'klassisch');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await vorher?.(page);
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return page;
}

/** Ersetzt navigator.geolocation: window.__gps.fix(lat, lon) / window.__gps.fehler(code). */
function fakeGps() {
  const watcher = new Map<number, { ok: PositionCallback; err?: PositionErrorCallback | null }>();
  let n = 0;
  let letzte: GeolocationPosition | null = null;
  const geo = {
    watchPosition(ok: PositionCallback, err?: PositionErrorCallback | null) {
      watcher.set(++n, { ok, err });
      if (letzte) setTimeout(() => ok(letzte!));
      return n;
    },
    clearWatch: (id: number) => watcher.delete(id),
    getCurrentPosition: (ok: PositionCallback) => letzte && ok(letzte),
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  (window as unknown as { __gps: object }).__gps = {
    fix(latitude: number, longitude: number) {
      letzte = { coords: { latitude, longitude, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as GeolocationPosition;
      for (const w of watcher.values()) w.ok(letzte);
    },
    fehler(code: number) {
      for (const w of watcher.values()) w.err?.({ code, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    },
  };
}

const gps = (p: Page) => ({
  fix: (lat: number, lon: number) => p.evaluate(([a, b]) => (window as any).__gps.fix(a, b), [lat, lon]),
  fehler: (code: number) => p.evaluate((c) => (window as any).__gps.fehler(c), code),
});

async function alarmAusloesen(p: Page) {
  await p.getByRole('button', { name: 'Alarm auslösen', exact: true }).click();
  await p.locator('section.sheet button.art', { hasText: 'Notfall' }).click();
  const box = (await p.locator('section.sheet button.halten').boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(2600);
  await p.mouse.up();
}

test('GPS-Verlust: alter Fix wird nicht weitergesendet, Leiste zeigt «kein GPS»', async ({ browser }) => {
  const l = await neueLage(browser, 'GPS-Verlust');
  const gesendet: number[] = [];
  const p = await seite(browser, l.teilnehmerCode, 'Bravo', {
    einstellungen: { intervallS: 5, koordLeiste: true },
    vorher: async (x) => {
      await x.addInitScript(fakeGps);
      x.on('websocket', (ws) => ws.on('framesent', (f) => String(f.payload).includes('"typ":"pos"') && gesendet.push(Date.now())));
    },
  });
  await gps(p).fix(46.9366, 7.4442);
  await expect(p.locator('footer .leiste')).toContainText('±8 m');
  await expect.poll(() => gesendet.length, { timeout: 8000 }).toBeGreaterThan(0);

  await gps(p).fehler(2); // POSITION_UNAVAILABLE (Tunnel)
  const vorher = gesendet.length;
  await expect(p.locator('footer .leiste')).toContainText('kein GPS');
  await p.waitForTimeout(12_000); // > 2 Sendeintervalle
  expect(gesendet.length).toBe(vorher);

  await gps(p).fix(46.9367, 7.4442); // Empfang zurück → sendet wieder
  await expect.poll(() => gesendet.length, { timeout: 8000 }).toBeGreaterThan(vorher);
  await p.context().close();
});

test('Standort zuerst verweigert, später erlaubt: GPS startet wieder', async ({ browser }) => {
  const l = await neueLage(browser, 'Standort');
  const p = await seite(browser, l.teilnehmerCode, 'Charlie', { permissions: [], geolocation: ADLER, einstellungen: { koordLeiste: true } });
  await expect(p.locator('footer .leiste')).toContainText('verweigert');
  await p.context().grantPermissions(['geolocation']);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // zurück aus den Einstellungen
  await expect(p.locator('footer .leiste')).toContainText('±');
  await p.context().close();
});

test('Funkloch: Alarm ohne Quittung meldet «Funk benutzen», Watchdog trennt und verbindet neu', async ({ browser }) => {
  const l = await neueLage(browser, 'Funkloch');
  const p = await seite(browser, l.teilnehmerCode, 'Delta', { geolocation: ADLER, vorher: (x) => x.clock.install() });
  await p.context().setOffline(true); // Socket bleibt OPEN, nur kommt nichts mehr an
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  await alarmAusloesen(p);
  await p.clock.fastForward(6000);
  await expect(p.locator('.toast', { hasText: 'Funk benutzen' })).toBeVisible();
  await expect(p.locator('.toast', { hasText: 'Alarm ausgelöst' })).toHaveCount(0);

  await p.clock.fastForward(50_000);
  await expect(p.locator('.verbindung.verbunden')).toHaveCount(0);
  await p.context().setOffline(false);
  await p.clock.fastForward(5000);
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  await p.context().close();
});

test.describe('schmale Handys und Querformat', () => {
  test.describe.configure({ mode: 'serial' });
  let leitung: Page;
  let bravo: Page;

  test.beforeAll(async ({ browser }) => {
    const l = await neueLage(browser, 'Layout');
    leitung = await seite(browser, l.leitungCode, 'Adler', { geolocation: ADLER, viewport: { width: 360, height: 740 } });
    bravo = await seite(browser, l.teilnehmerCode, 'Bravo Zwei Alpha', { geolocation: NAH });
  });
  test.afterAll(async () => {
    await leitung?.context().close();
    await bravo?.context().close();
  });

  test('nahe Kräfte: beide Rufnamen sichtbar und ohne Überlappung', async () => {
    const labels = leitung.locator('.bft-label');
    await expect(labels).toHaveCount(2);
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([labels.nth(0).boundingBox(), labels.nth(1).boundingBox()]);
        const sichtbar = await labels.evaluateAll((els) => els.every((e) => getComputedStyle(e).visibility === 'visible'));
        return sichtbar && !!a && !!b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
      })
      .toBe(true);
  });

  test('Alarm-Banner: voller Rufname, Ebenen bedienbar, Toasts darunter', async () => {
    await alarmAusloesen(bravo);
    const banner = leitung.locator('.banner');
    const titel = banner.locator('.alarm strong');
    await expect(titel).toHaveText('NOTFALL · Bravo Zwei Alpha');
    expect(await titel.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);

    const ebenen = leitung.getByRole('button', { name: 'Karte und Ebenen wählen' });
    await ebenen.click();
    await expect(leitung.locator('.basis-wahl')).toBeVisible();
    await ebenen.click();

    await bravo.getByRole('button', { name: /^Eigener Status/ }).click();
    await bravo.locator('section.sheet').getByRole('button', { name: 'Halt', exact: true }).click();
    const toast = leitung.locator('.toast', { hasText: 'Bravo' });
    await expect(toast).toBeVisible();
    const [t, b] = [await toast.boundingBox(), await banner.boundingBox()];
    expect(t!.y).toBeGreaterThanOrEqual(b!.y + b!.height);
    await leitung.screenshot({ path: 'docs/screens/e2e-360-alarm.png', animations: 'disabled' });
  });

  test('Radial-Menü, Koordinate und Leitungs-Tabs passen auf 360 px', async () => {
    const karte = leitung.locator('.maplibregl-canvas');
    const k = (await karte.boundingBox())!;
    await leitung.mouse.click(k.x + k.width / 3, k.y + k.height / 2, { button: 'right' });
    const ring = leitung.getByRole('menu', { name: 'Aktionen für Punkt' });
    for (const el of await ring.getByRole('menuitem').all()) await expect(el).toBeInViewport({ ratio: 1 });
    await ring.getByRole('menuitem', { name: 'Koordinate' }).click();
    const menu = leitung.getByRole('dialog', { name: 'Koordinate' });
    await expect(menu).toBeVisible();
    const breite = await menu.locator('button').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().right)));
    expect(breite).toBeLessThanOrEqual(360);
    await leitung.keyboard.press('Escape');

    await leitung.locator('nav.werkzeuge button.werkzeug', { hasText: 'Leitung' }).click();
    for (const tab of await leitung.getByRole('tab').all()) await expect(tab).toBeInViewport({ ratio: 1 });
  });

  test('Symbol-Picker: Segmente laufen nicht über', async () => {
    if (await leitung.locator('section.sheet').isVisible()) await leitung.locator('section.sheet').getByRole('button', { name: 'Schliessen', exact: true }).click();
    await leitung.locator('nav.werkzeuge button.werkzeug', { hasText: 'Marker' }).click();
    await leitung.locator('section.sheet').getByRole('button', { name: '+ Marker setzen', exact: true }).click();
    await leitung.getByRole('button', { name: 'Übernehmen', exact: true }).click();
    const ueber = await leitung.locator('section.sheet .segmente button').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(ueber).toBe(0);
    await leitung.locator('section.sheet').getByRole('button', { name: 'Schliessen', exact: true }).click();
  });

  test('ALARM bleibt erreichbar: über Sheets und im Querformat', async () => {
    const alarm = leitung.getByRole('button', { name: 'Alarm auslösen', exact: true });
    await leitung.getByRole('button', { name: /^Eigener Status/ }).click();
    await alarm.click({ trial: true }); // nicht verdeckt
    await leitung.locator('section.sheet').getByRole('button', { name: 'Schliessen', exact: true }).click();

    await leitung.setViewportSize({ width: 844, height: 390 });
    await alarm.click({ trial: true });
    await leitung.getByRole('button', { name: /^Eigener Status/ }).click({ trial: true });
    await leitung.getByRole('button', { name: 'Karte und Ebenen wählen' }).click();
    const menu = (await leitung.locator('.basis-wahl').boundingBox())!;
    expect(menu.height).toBeGreaterThanOrEqual(150);
    const banner = (await leitung.locator('.banner').boundingBox())!;
    expect(menu.x + menu.width).toBeLessThanOrEqual(banner.x); // aktives Alarm-Banner verdeckt das Menü nicht
    await leitung.screenshot({ path: 'docs/screens/e2e-quer-ebenen.png', animations: 'disabled' });
  });
});
