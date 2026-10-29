// Spec v3: Bedienung «Daumen-Ränder» (Vorgabe) – Querformat Handy/Tablet, Hochformat, Meldungen mit wenig Tipps,
// Marker per Fadenkreuz, Alarm halten, Tag/Nacht nach Sonnenstand.
import { expect, test, type Browser, type Page } from '@playwright/test';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const NAH = { latitude: 46.9466, longitude: 7.4462 }; // ~150 m östlich
const SIDC = '10031000001211000000';
const SCREENS = 'docs/screens';
// Uhrzeit fürs Thema (Bern, 29.10.: Sonnenaufgang ≈ 07:13, Untergang ≈ 17:11 MEZ)
const NACHT = new Date('2026-10-29T22:00:00+01:00');
const TAG = new Date('2026-10-29T12:00:00+01:00');
const QUER = { width: 844, height: 390 };
const HOCH = { width: 390, height: 844 };

test.describe.configure({ mode: 'serial' });

let codes: { teilnehmerCode: string; leitungCode: string };
let leitung: Page;
let bravo: Page;

async function seite(browser: Browser, code: string, rufname: string, geolocation: typeof ADLER, viewport: typeof QUER, zeit = NACHT): Promise<Page> {
  const ctx = await browser.newContext({ geolocation, viewport });
  await ctx.clock.install({ time: zeit });
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname, einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  expect(r.status()).toBe(201);
  const { token } = await r.json();
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token); // keine Bedienung gesetzt → Vorgabe «daumen»
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return page;
}

const bild = (p: Page, name: string) => p.screenshot({ path: `${SCREENS}/v3-${name}.png`, animations: 'disabled' });
const knopf = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' });
const sheets = (p: Page) => p.locator('section.sheet');
const box = async (p: Page, name: string | RegExp) => (await knopf(p, name).boundingBox())!;
/** Einblend-Animation der Panels abwarten, sonst misst man verschobene Boxen. */
const ruhig = (p: Page) => sheets(p).evaluateAll((els) => Promise.all(els.flatMap((e) => e.getAnimations().map((a) => a.finished))));
/** Zählt Klicks/Tipps, die ein Ablauf braucht. */
function zaehler(p: Page) {
  let n = 0;
  return { tippe: async (name: string | RegExp) => (n++, knopf(p, name).click()), get anzahl() { return n; } };
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/lage', { data: { name: 'Übung Aare', erstellPasswort: 'e2e' } });
  codes = await r.json();
  await ctx.close();
  leitung = await seite(browser, codes.leitungCode, 'Adler', ADLER, QUER);
  bravo = await seite(browser, codes.teilnehmerCode, 'Bravo', NAH, HOCH);
  await expect(leitung.locator('.bft-label', { hasText: 'Bravo' })).toBeVisible();
});

test.afterAll(async () => {
  await leitung?.context().close();
  await bravo?.context().close();
});

test('Handy quer 844×390: Melden links, Karte rechts, grosse Ziele, schlanke Kopfzeile', async () => {
  const status = await box(leitung, /^Eigener Status/);
  const sichtung = await box(leitung, 'Sichtung');
  const alarm = await box(leitung, /^Alarm/);
  expect(status.x + status.width).toBeLessThan(100);
  expect(sichtung.y).toBeGreaterThan(status.y); // Status oben, darunter Sichtung, Alarm ganz unten
  expect(alarm.x + alarm.width).toBeLessThan(100);
  expect(alarm.y + alarm.height).toBeGreaterThan(QUER.height - 80);

  for (const name of ['Marker', 'Chat', 'Mehr']) {
    const b = await box(leitung, name);
    expect(b.x).toBeGreaterThan(QUER.width - 100);
    expect(b.y).toBeGreaterThan(QUER.height / 2); // rechts unten
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(56);
  }
  for (const name of ['Karte und Ebenen wählen', 'Eigener Position folgen', 'Karte nach Norden ausrichten']) {
    const b = await box(leitung, name);
    expect(b.x).toBeGreaterThan(QUER.width - 100);
    expect(b.y).toBeLessThan(QUER.height / 2); // rechts oben
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(48);
  }
  expect(Math.min(status.width, status.height, sichtung.height)).toBeGreaterThanOrEqual(56);

  // Kopfzeile: Lage, Verbindung, Zahl der Teilnehmenden – keine weiteren Knöpfe
  const kopf = leitung.locator('header.kopf');
  await expect(kopf).toContainText('Übung Aare');
  await expect(kopf.getByRole('button', { name: 'Teilnehmende (2)' })).toBeVisible();
  await expect(kopf.getByRole('button')).toHaveCount(1);
  await expect(leitung.locator('html')).toHaveAttribute('data-thema', 'nacht');
  await bild(leitung, 'quer-dunkel');
});

test('Mehr-Menü: übrige Werkzeuge, Panels zwischen linkem Rand und Karte', async () => {
  await knopf(leitung, 'Mehr').click();
  const menu = leitung.getByRole('menu', { name: 'Mehr' });
  for (const name of ['Range & Bearing', 'Spuren', 'Zeichnen', 'Leitung', 'Teilnehmende', 'Einstellungen', 'Meldungslog'])
    await expect(menu.getByRole('menuitem', { name })).toBeVisible();
  await bild(leitung, 'mehr');
  await menu.getByRole('menuitem', { name: 'Meldungslog' }).click();
  await expect(menu).toHaveCount(0);
  await ruhig(leitung);
  const panel = (await sheets(leitung).boundingBox())!;
  const links = await box(leitung, /^Eigener Status/);
  expect(panel.x).toBeGreaterThanOrEqual(links.x + links.width); // Melde-Rand bleibt frei
  const karte = (await leitung.locator('.maplibregl-canvas').boundingBox())!;
  expect(karte.x).toBeGreaterThanOrEqual(panel.x + panel.width - 1);
  await leitung.keyboard.press('Escape');
  await expect(sheets(leitung)).toHaveCount(0);
  // Esc schliesst auch das Menü selbst
  await knopf(leitung, 'Mehr').click();
  await leitung.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('Status mit einem Tipp (zwei mit Öffnen), Panel schliesst sich', async () => {
  const z = zaehler(leitung);
  await z.tippe(/^Eigener Status/);
  await expect(leitung.getByRole('region', { name: 'Status' }).getByText('+ Text')).toBeVisible(); // Freitext eingeklappt
  await expect(leitung.getByRole('region', { name: 'Status' }).getByText('Meldungslog')).toHaveCount(0);
  await z.tippe('Halt');
  expect(z.anzahl).toBe(2);
  await expect(sheets(leitung)).toHaveCount(0);
  await expect(knopf(leitung, /^Eigener Status: Halt/)).toBeVisible();
  await expect(bravo.locator('.toast', { hasText: 'Adler' })).toContainText('Halt');
});

test('Hochformat 390×844: Dock unten, Alarm links darüber, Kartenknöpfe rechts', async () => {
  const dock = bravo.getByRole('navigation', { name: 'Hauptaktionen' });
  const namen = await dock.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(namen.map((n) => n.split(/[:(]/)[0].trim())).toEqual(['Eigener Status', 'Marker', 'Sichtung', 'Chat', 'Mehr']);
  const d = (await dock.boundingBox())!;
  expect(d.y + d.height).toBeGreaterThan(HOCH.height - 2);
  for (const b of await dock.getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect())))
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(56);
  const alarm = await box(bravo, /^Alarm/);
  expect(alarm.x).toBeLessThan(40);
  expect(alarm.y + alarm.height).toBeLessThanOrEqual(d.y);
  const folgen = await box(bravo, 'Eigener Position folgen');
  expect(folgen.x).toBeGreaterThan(HOCH.width - 80);
  await bild(bravo, 'hoch');
});

test('Sichtung in drei Tipps: Sichtung → Hier → Senden (Chips mit Vorgaben)', async () => {
  const vorher = await leitung.locator('.sichtung-symbol').count();
  const z = zaehler(bravo);
  await z.tippe('Sichtung');
  await expect(bravo.locator('.kreuz')).toBeVisible();
  await z.tippe('Hier');
  const panel = bravo.getByRole('region', { name: 'Sichtung' });
  for (const [gruppe, vorgabe] of [['Art', 'Unbekannt'], ['Grösse', 'unbekannt'], ['Tätigkeit', 'unbekannt'], ['Zeit', 'jetzt'], ['Vertrauen', 'Wahrscheinlich']])
    await expect(panel.getByRole('group', { name: gruppe, exact: true }).getByRole('button', { name: vorgabe, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('group', { name: 'Zugehörigkeit' }).getByRole('button', { name: 'Feind' })).toHaveAttribute('aria-pressed', 'true');
  // «bewegt sich» blendet die Richtung ein (nur fürs Bild, danach zurück auf die Vorgabe)
  await panel.getByRole('group', { name: 'Tätigkeit' }).getByRole('button', { name: 'bewegt sich' }).click();
  await expect(panel.getByRole('group', { name: 'Richtung' })).toBeVisible();
  await bild(bravo, 'sichtung-chips');
  await panel.getByRole('group', { name: 'Tätigkeit' }).getByRole('button', { name: 'unbekannt' }).click();
  await z.tippe('Senden');
  expect(z.anzahl).toBe(3);
  await expect(bravo.locator('.toast', { hasText: 'Sichtung gemeldet' })).toBeVisible();
  await expect(sheets(bravo)).toHaveCount(0);
  await expect(leitung.locator('.sichtung-symbol')).toHaveCount(vorher + 1);
});

test('Marker per Fadenkreuz: Marker → Setzen, letztes Zeichen, ohne Bezeichnung; danach bearbeiten', async () => {
  const marker = leitung.locator('.lage-marker');
  const vorher = await marker.count();
  const z = zaehler(leitung);
  await z.tippe('Marker');
  await expect(leitung.locator('.kreuz')).toBeVisible();
  await z.tippe('Setzen');
  expect(z.anzahl).toBe(2);
  await expect(marker).toHaveCount(vorher + 1);
  await expect(bravo.locator('.lage-marker')).toHaveCount(vorher + 1);
  await expect(marker.last()).toHaveAttribute('aria-label', 'Marker Unbestimmt'); // ohne Bezeichnung: Name aus dem Zeichen

  // Optional bearbeiten: Knopf im Toast → Formular; neues Zeichen wird das «letzte» für den nächsten Marker
  await leitung.locator('.toast').getByRole('button', { name: 'Bearbeiten' }).click();
  const formular = leitung.getByRole('region', { name: 'Marker' });
  await expect(formular.getByLabel('Bezeichnung')).toHaveValue('');
  await formular.getByLabel('Bezeichnung').fill('Sperre Nord');
  await formular.getByRole('button', { name: 'Speichern' }).click();
  await expect(leitung.locator('[aria-label="Marker Sperre Nord"]')).toBeVisible();
  await leitung.keyboard.press('Escape');
});

test('Chat-Schnellmeldung: ein Tipp sendet', async () => {
  await knopf(bravo, 'Chat').click();
  await bravo.getByRole('region', { name: 'Chat' }).locator('button.zeile', { hasText: 'Alle' }).first().click();
  const schnell = bravo.getByRole('group', { name: 'Schnellmeldungen' });
  for (const t of ['Verstanden', 'Wiederholen', 'Warten', 'Bereit', 'Ziel erreicht', 'Brauche Unterstützung', 'Negativ'])
    await expect(schnell.getByRole('button', { name: t, exact: true })).toBeVisible();
  await bild(bravo, 'chat-schnell');
  await schnell.getByRole('button', { name: 'Verstanden', exact: true }).click();
  await expect(bravo.getByRole('region', { name: 'Chat' }).locator('.blase', { hasText: 'Verstanden' })).toBeVisible();
  await expect(leitung.locator('.toast', { hasText: 'Bravo: Verstanden' })).toBeVisible();
  await expect(knopf(leitung, 'Chat (1 ungelesen)')).toBeVisible();
  await bravo.keyboard.press('Escape');
});

test('Alarm halten: zu kurz bricht ab, 1,5 s öffnet die Wahl, Notfall löst aus', async () => {
  const alarm = knopf(bravo, /^Alarm/);
  const b = (await alarm.boundingBox())!;
  await bravo.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await bravo.mouse.down();
  await bravo.waitForTimeout(600);
  await bravo.mouse.up();
  await bravo.waitForTimeout(1500);
  await expect(bravo.getByRole('dialog', { name: 'Alarm auslösen' })).toHaveCount(0);
  await expect(leitung.locator('.banner')).toHaveCount(0);

  await bravo.mouse.down();
  await bravo.waitForTimeout(1900);
  await bravo.mouse.up();
  const wahl = bravo.getByRole('dialog', { name: 'Alarm auslösen' });
  await expect(wahl).toBeVisible();
  await wahl.getByRole('button', { name: 'Notfall' }).click();
  await expect(leitung.locator('.banner .alarm', { hasText: 'NOTFALL · Bravo' })).toBeVisible();
  await expect(leitung.locator('.alarm-ring.notfall')).toBeAttached(); // mit Position

  // aufräumen: Auslöser hebt auf
  await bravo.locator('.banner .alarm button.text').click();
  await bravo.getByRole('button', { name: 'Aufheben …' }).click();
  await bravo.getByRole('button', { name: 'Wirklich aufheben' }).click();
  await expect(leitung.locator('.banner')).toHaveCount(0);
  await bravo.keyboard.press('Escape');
});

test('Tablet quer 1180×820: Ränder bleiben, zwei Panels zwischen Rand und Karte', async () => {
  await leitung.setViewportSize({ width: 1180, height: 820 });
  await knopf(leitung, /^Chat/).click(); // «Chat (1 ungelesen)» nach der Schnellmeldung
  await knopf(leitung, /^Teilnehmende/).click();
  await expect(sheets(leitung)).toHaveCount(2);
  await ruhig(leitung);
  const links = await box(leitung, /^Eigener Status/);
  const a = (await sheets(leitung).nth(0).boundingBox())!;
  expect(a.x).toBeGreaterThanOrEqual(links.x + links.width);
  const marker = await box(leitung, 'Marker');
  expect(marker.x).toBeGreaterThan(1180 - 100);
  await bild(leitung, 'tablet');
  await leitung.keyboard.press('Escape');
  await leitung.keyboard.press('Escape');
  await leitung.setViewportSize(QUER);
});

test('Niedriges Handy quer 740×360: alle Randknöpfe ganz sichtbar, Hauptaktionen ≥ 56 px', async () => {
  await leitung.setViewportSize({ width: 740, height: 360 });
  for (const name of [/^Eigener Status/, 'Sichtung', /^Alarm/, 'Karte nach Norden ausrichten', 'Marker', /^Chat/, 'Mehr']) await expect(knopf(leitung, name)).toBeInViewport({ ratio: 1 });
  expect((await box(leitung, 'Mehr')).height).toBeGreaterThanOrEqual(56);
  await leitung.setViewportSize(QUER);
});

test('Klassisch bleibt wählbar und gilt nach Neuladen', async () => {
  await knopf(bravo, 'Mehr').click();
  await bravo.getByRole('menuitem', { name: 'Einstellungen' }).click();
  await bravo.getByRole('group', { name: 'Bedienung' }).getByRole('button', { name: 'Klassisch' }).click();
  await expect(bravo.locator('nav.werkzeuge')).toBeVisible();
  await bravo.reload();
  await expect(bravo.locator('nav.werkzeuge')).toBeVisible();
  await expect(bravo.getByRole('navigation', { name: 'Hauptaktionen' })).toHaveCount(0);
  await knopf(bravo, 'Einstellungen').click();
  await bravo.getByRole('group', { name: 'Bedienung' }).getByRole('button', { name: 'Daumen-Ränder' }).click();
  await expect(bravo.getByRole('navigation', { name: 'Hauptaktionen' })).toBeVisible();
  await bravo.keyboard.press('Escape');
});

test('Tag/Nacht nach Sonnenstand: hell am Mittag, dunkel nach Sonnenuntergang (minütlich geprüft)', async ({ browser }) => {
  const tag = await seite(browser, codes.teilnehmerCode, 'Charlie', ADLER, QUER, TAG);
  await expect(tag.locator('html')).toHaveAttribute('data-thema', 'tag');
  const bg = await tag.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(233, 232, 222)');
  await tag.waitForLoadState('networkidle'); // Kacheln der frischen Seite fertig laden
  await tag.waitForTimeout(500);
  await bild(tag, 'quer-hell');
  await tag.context().close();

  // 16:50 noch Tag; eine gute Stunde später (nach Sonnenuntergang) stellt die minütliche Prüfung auf Nacht
  const abend = await seite(browser, codes.teilnehmerCode, 'Delta', ADLER, QUER, new Date('2026-10-29T16:50:00+01:00'));
  await expect(abend.locator('html')).toHaveAttribute('data-thema', 'tag');
  await abend.clock.fastForward('01:00:00');
  await expect(abend.locator('html')).toHaveAttribute('data-thema', 'nacht');
  await abend.context().close();
});
