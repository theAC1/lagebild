// Führungsraster (v4): auflegen, ziehen, fixieren; Rechte (fixiert: nur noch die Leitung); Ebene; Koordinatenleiste;
// Marker per Rasterposition. Bedienung «Daumen-Ränder» (Vorgabe), beide Handys quer.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ansprache, zelleVon, zellMitte, type RasterGeo } from '../shared/raster.ts';
import { dokuBild, leereStelle } from './hilfen.ts';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const BRAVO = { latitude: 46.9472, longitude: 7.4452 };
const SIDC = '10031000001211000000';
const TAG = new Date('2026-10-29T12:00:00+01:00'); // heller Tagmodus wie auf Papier

test.describe.configure({ mode: 'serial' });

type Sitzung = { page: Page; token: string };
let codes: { teilnehmerCode: string; leitungCode: string };
let leitung: Sitzung;
let bravo: Sitzung;

async function sitzung(browser: Browser, code: string, rufname: string, geolocation: typeof ADLER): Promise<Sitzung> {
  const ctx = await browser.newContext({ geolocation });
  await ctx.clock.install({ time: TAG });
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname, einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  expect(r.status()).toBe(201);
  const { token } = await r.json();
  await ctx.addInitScript((t) => {
    localStorage.setItem('lagebild.token', t);
    if (!localStorage.getItem('lagebild.einstellungen')) localStorage.setItem('lagebild.einstellungen', JSON.stringify({ koordLeiste: true }));
  }, token);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return { page, token };
}

const knopf = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' });
const panel = (p: Page) => p.getByRole('region', { name: 'Führungsraster' });
const abschnitt = (p: Page, name: 'Grande' | 'Piccolo') => panel(p).getByRole('region', { name });
const koepfe = (p: Page, seite = '') => p.locator(`.raster-frei .kopf${seite}`);
const bild = async (p: Page, name: string) => {
  await p.waitForTimeout(1500); // Kacheln
  await dokuBild(p, `v4-raster-${name}`);
};

type ExportRaster = RasterGeo & { art: 'grande' | 'piccolo'; fixiert: boolean };
async function raster(art: 'grande' | 'piccolo'): Promise<ExportRaster | undefined> {
  const r = await leitung.page.request.get('/api/export.geojson', { headers: { Authorization: `Bearer ${leitung.token}` } });
  const f = (await r.json()).features.find((x: { properties: { art: string; raster: string } }) => x.properties.art === 'fuehrungsraster' && x.properties.raster === art);
  return f && { art, e: f.properties.lv95.e, n: f.properties.lv95.n, zeilen: f.properties.zeilen, spalten: f.properties.spalten, zellM: f.properties.zellM, fixiert: f.properties.fixiert };
}

async function oeffnePanel(p: Page) {
  if (await panel(p).isVisible()) return;
  await knopf(p, 'Mehr').click();
  await p.getByRole('menu', { name: 'Mehr' }).getByRole('menuitem', { name: 'Führungsraster' }).click();
  await expect(panel(p)).toBeVisible();
}
async function karte(p: Page, basis: 'Landeskarte' | 'Luftbild') {
  await knopf(p, 'Karte und Ebenen wählen').click();
  await p.getByRole('group', { name: 'Karte' }).getByRole('button', { name: basis, exact: true }).click();
  await p.keyboard.press('Escape');
}
/** Mitte des Rasters auf dem Bildschirm, aus den Köpfen oben und links. */
async function rasterMitte(p: Page): Promise<{ x: number; y: number }> {
  const mitte = async (sel: string, achse: 'x' | 'y') => {
    const boxen = await Promise.all((await koepfe(p, sel).all()).map((k) => k.boundingBox()));
    const w = boxen.filter((b) => b).map((b) => (achse === 'x' ? b!.x + b!.width / 2 : b!.y + b!.height / 2));
    return (Math.min(...w) + Math.max(...w)) / 2;
  };
  return { x: await mitte('.oben', 'x'), y: await mitte('.links', 'y') };
}
async function ziehe(p: Page, von: { x: number; y: number }, dx: number, dy: number) {
  await p.mouse.move(von.x, von.y);
  await p.mouse.down();
  for (let i = 1; i <= 5; i++) await p.mouse.move(von.x + (dx * i) / 5, von.y + (dy * i) / 5);
  await p.mouse.up();
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/lage', { data: { name: 'Raster', erstellPasswort: 'e2e', phase: 'lv' } });
  codes = await r.json();
  await ctx.close();
  leitung = await sitzung(browser, codes.leitungCode, 'Adler', ADLER);
  bravo = await sitzung(browser, codes.teilnehmerCode, 'Bravo', BRAVO);
  for (const s of [leitung, bravo]) {
    await knopf(s.page, 'Eigener Position folgen').click();
    await s.page.waitForTimeout(1200);
  }
});

test.afterAll(async () => {
  await leitung?.page.context().close();
  await bravo?.page.context().close();
});

test('Teilnehmerin legt Grande auf, zieht und fixiert es; Leitung sieht es', async () => {
  const p = bravo.page;
  await oeffnePanel(p);
  await abschnitt(p, 'Grande').getByRole('button', { name: 'Grande auflegen' }).click();
  await expect(abschnitt(p, 'Grande')).toContainText('Vorschau');
  await expect(abschnitt(p, 'Grande')).toContainText('21 × 15 Zellen à 80 m');
  await expect(koepfe(p, '.oben')).not.toHaveCount(0);
  await expect(koepfe(leitung.page, '.vorschau').first()).toBeVisible(); // Leitung sieht die Vorschau gestrichelt
  const vorher = (await raster('grande'))!;
  expect(vorher.fixiert).toBe(false);

  // Zeilen per Stufe, Zellgrösse per Chip
  await abschnitt(p, 'Grande').getByRole('button', { name: 'Mehr Zeilen' }).click();
  await expect(abschnitt(p, 'Grande')).toContainText('21 × 16 Zellen');
  await abschnitt(p, 'Grande').getByRole('button', { name: 'Weniger Zeilen' }).click();
  await expect(abschnitt(p, 'Grande')).toContainText('21 × 15 Zellen');
  await bild(p, 'quer-tn-vorschau');

  // ziehen: das Raster liegt über dem Sheet
  await p.waitForTimeout(800);
  const m = await rasterMitte(p);
  await ziehe(p, m, 40, 30);
  await expect.poll(async () => (await raster('grande'))!.e).not.toBe(vorher.e);
  const gezogen = (await raster('grande'))!;
  expect(gezogen.e).toBeGreaterThan(vorher.e); // nach rechts
  expect(gezogen.n).toBeLessThan(vorher.n); // nach unten

  await abschnitt(p, 'Grande').getByRole('button', { name: 'Fixieren' }).click();
  await expect(abschnitt(p, 'Grande')).toContainText('Fixiert');
  await expect(abschnitt(p, 'Grande').getByRole('button', { name: 'Lösen' })).toHaveCount(0);
  await expect(abschnitt(p, 'Grande').getByRole('button', { name: 'Löschen' })).toHaveCount(0);
  await expect(abschnitt(p, 'Grande')).toContainText('nur die Leitung kann es lösen');
  await expect(koepfe(leitung.page, '.vorschau')).toHaveCount(0);
});

test('fixiert: Teilnehmerin kann es nicht mehr verschieben, die Leitung nach dem Lösen schon', async () => {
  const p = bravo.page;
  const fix = (await raster('grande'))!;
  // Die Aktionsreihe (Zeigen, Als PDF, Offline-Gebiet …) macht das Sheet höher; das Raster erst wieder ins Bild holen
  await abschnitt(p, 'Grande').getByRole('button', { name: 'Zeigen' }).click();
  await p.waitForTimeout(900);
  const m = await rasterMitte(p);
  await ziehe(p, m, 60, 0); // verschiebt nur die Karte
  await p.waitForTimeout(500);
  expect(await raster('grande')).toEqual(fix);
  await p.keyboard.press('Escape');

  const l = leitung.page;
  await oeffnePanel(l);
  await abschnitt(l, 'Grande').getByRole('button', { name: 'Lösen' }).click();
  await expect(abschnitt(l, 'Grande')).toContainText('Vorschau');
  await abschnitt(l, 'Grande').getByRole('button', { name: 'Zeigen' }).click();
  await l.waitForTimeout(900);
  await ziehe(l, await rasterMitte(l), -40, 0);
  await expect.poll(async () => (await raster('grande'))!.e).toBeLessThan(fix.e);
  await abschnitt(l, 'Grande').getByRole('button', { name: 'Fixieren' }).click();
  await expect(abschnitt(l, 'Grande')).toContainText('Fixiert');
  expect((await raster('grande'))!.fixiert).toBe(true);
  await karte(l, 'Luftbild');
  await bild(l, 'quer-grande-luftbild');
});

test('Koordinatenleiste zeigt die eigene Rasterzelle samt Quadrant', async () => {
  const r = (await raster('grande'))!;
  const z = zelleVon(r, { lat: BRAVO.latitude, lon: BRAVO.longitude });
  expect(z).not.toBeNull();
  await expect(bravo.page.locator('footer .leiste .raster')).toHaveText(`Grande ${ansprache(z!)}`);
  await karte(bravo.page, 'Landeskarte');
  await bild(bravo.page, 'quer-tn-grande-landeskarte');
});

test('Radial «Koordinate» zeigt die Rasterzelle des Punkts als eigene Zeile', async () => {
  const p = bravo.page;
  await p.getByRole('button', { name: 'Eigener Position folgen' }).click(); // Zoom 16 auf Bravo, mitten im Grande
  await p.waitForTimeout(600);
  const { x, y } = await leereStelle(p, [[0.5, 0.38], [0.5, 0.6], [0.35, 0.45], [0.65, 0.45]]);
  await p.mouse.click(x, y, { button: 'right' });
  await p.getByRole('menuitem', { name: 'Koordinate' }).click();
  const karte = p.getByRole('dialog', { name: 'Koordinate' });
  await expect(karte.getByRole('button', { name: /^Raster Grande [A-Z] \d{2} [A-D] kopieren$/ })).toBeVisible();
  await p.keyboard.press('Escape');
  await expect(karte).toHaveCount(0);
});

test('Ebene «Führungsraster»: Grande pro Gerät aus- und wieder einschalten', async () => {
  const p = bravo.page;
  await knopf(p, 'Karte und Ebenen wählen').click();
  const schalter = p.getByRole('group', { name: 'Karte' }).getByRole('button', { name: 'Grande', exact: true });
  await expect(schalter).toHaveAttribute('aria-pressed', 'true');
  await schalter.click();
  await expect(schalter).toHaveAttribute('aria-pressed', 'false');
  await expect(koepfe(p)).toHaveCount(0);
  await p.reload();
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  await expect(koepfe(p)).toHaveCount(0); // gemerkt
  await knopf(p, 'Karte und Ebenen wählen').click();
  await p.getByRole('group', { name: 'Karte' }).getByRole('button', { name: 'Grande', exact: true }).click();
  await p.keyboard.press('Escape');
  await expect(koepfe(p, '.oben').first()).toBeVisible();
  await expect(koepfe(leitung.page, '.oben').first()).toBeVisible(); // bei anderen unverändert
});

test('Marker per Rasterposition: Melden → Marker → Rasterposition → H, 09, C → setzen', async () => {
  const p = bravo.page;
  await knopf(p, 'Melden').click();
  await p.getByRole('menu', { name: 'Melden' }).getByRole('menuitem', { name: 'Marker' }).click();
  await knopf(p, 'Rasterposition').click();
  await expect(p.locator('.kreuz')).toHaveCount(0);
  const ps = panel(p);
  await ps.getByRole('group', { name: 'Zeile' }).getByRole('button', { name: 'H', exact: true }).click();
  await ps.getByRole('group', { name: 'Spalte' }).getByRole('button', { name: '09', exact: true }).click();
  await ps.getByRole('group', { name: 'Quadrant' }).getByRole('button', { name: 'C', exact: true }).click();
  await expect(ps.locator('.gross')).toHaveText('Grande H 09 C');
  await expect(ps).toContainText('Hotel 09 Charlie');
  await bild(p, 'quer-tn-melden');
  await ps.getByRole('button', { name: 'Marker setzen' }).click();
  await expect(p.locator('[aria-label="Marker Grande H 09 C"]')).toBeVisible();
  await expect(leitung.page.locator('[aria-label="Marker Grande H 09 C"]')).toBeVisible();

  const r = (await raster('grande'))!;
  const soll = zellMitte(r, { zeile: 7, spalte: 8, quadrant: 'C' });
  const exp = await (await leitung.page.request.get('/api/export.geojson', { headers: { Authorization: `Bearer ${leitung.token}` } })).json();
  const mk = exp.features.find((f: { properties: { art: string; bezeichnung: string } }) => f.properties.art === 'marker' && f.properties.bezeichnung === 'Grande H 09 C');
  expect(mk.geometry.coordinates[0]).toBeCloseTo(soll.lon, 6);
  expect(mk.geometry.coordinates[1]).toBeCloseTo(soll.lat, 6);

  // Marker-Detail zeigt die Rasterzelle
  await p.locator('[aria-label="Marker Grande H 09 C"]').dblclick();
  await expect(p.getByRole('region', { name: 'Marker' })).toContainText('Grande H 09 C');
  await p.keyboard.press('Escape');
});

test('Piccolo neben Grande: Leitung legt es auf und fixiert; beide unterscheidbar', async () => {
  const l = leitung.page;
  await oeffnePanel(l);
  await abschnitt(l, 'Piccolo').getByRole('button', { name: 'Piccolo auflegen' }).click();
  await expect(abschnitt(l, 'Piccolo')).toContainText('21 × 15 Zellen à 10 m');
  await abschnitt(l, 'Piccolo').getByRole('button', { name: 'Fixieren' }).click();
  await expect(abschnitt(l, 'Piccolo')).toContainText('Fixiert');
  await l.keyboard.press('Escape');
  await expect(l.locator('.raster-frei .kopf.name', { hasText: 'Piccolo' })).toBeVisible();
  await bild(l, 'quer-piccolo-luftbild');
  await karte(l, 'Landeskarte');
  await bild(l, 'quer-piccolo-landeskarte');

  // Teilnehmerin: Piccolo in der Mitte, ganz nah – Grande-Köpfe hängen am Bildschirmrand
  const p = bravo.page;
  const pic = (await raster('piccolo'))!;
  await p.evaluate(() => 0); // Seite bereit
  await oeffnePanel(p);
  await abschnitt(p, 'Piccolo').getByRole('button', { name: 'Zeigen' }).click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  await expect(p.locator('.raster-frei .kopf.name', { hasText: 'Piccolo' })).toBeVisible();
  expect(pic.zellM).toBe(10);
  await karte(p, 'Luftbild');
  await bild(p, 'quer-tn-piccolo-luftbild');
});

test('Offline-Gebiet aus dem Raster: Aufziehen startet mit dem Rahmen vorbelegt, «Weiter» sofort möglich', async () => {
  const l = leitung.page;
  await oeffnePanel(l);
  await abschnitt(l, 'Piccolo').getByRole('button', { name: 'Offline-Gebiet …' }).click();
  const leiste = l.getByRole('dialog', { name: 'Offline-Gebiet aufziehen' });
  await expect(leiste).toContainText(/\d km · ca\./);
  await expect(leiste.getByRole('button', { name: 'Weiter' })).toBeEnabled();
  await leiste.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(leiste).toHaveCount(0);
});
