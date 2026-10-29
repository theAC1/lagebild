// Spec v2 Punkt 4: Zeichnen am Desktop (voller Umfang) und mobil (reduziert), gegen den echten Server.
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { bedienung } from './hilfen.ts';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const BRAVO = { latitude: 46.9476, longitude: 7.4462 };
const SIDC = '10031000001211000000';
const SCREENS = 'docs/screens';
const DESKTOP = { width: 1440, height: 900 };

test.describe.configure({ mode: 'serial' });

type Sitzung = { page: Page; token: string; id: string };
let leitung: Sitzung;
let bravo: Sitzung;
let codes: { teilnehmerCode: string; leitungCode: string };

async function sitzung(browser: Browser, code: string, rufname: string, geolocation: typeof ADLER, viewport: { width: number; height: number }): Promise<Sitzung> {
  const ctx = await browser.newContext({ geolocation, viewport });
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname, einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  expect(r.status()).toBe(201);
  const { token, teilnehmerId } = await r.json();
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  await ctx.addInitScript(bedienung, 'klassisch');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return { page, token, id: teilnehmerId };
}

type ExportZeichnung = { geometry: { type: string; coordinates: number[][] | number[][][] }; properties: { form: string; bezeichnung: string; von: string; id: string; ebeneId: string } };
async function zeichnungen(req: APIRequestContext = leitung.page.request): Promise<ExportZeichnung[]> {
  const r = await req.get('/api/export.geojson', { headers: { Authorization: `Bearer ${leitung.token}` } });
  const d = await r.json();
  return d.features.filter((f: { properties: { art: string } }) => f.properties.art === 'zeichnung');
}
const punkteVon = (z: ExportZeichnung): number[][] => (z.geometry.type === 'Polygon' ? (z.geometry.coordinates as number[][][])[0] : (z.geometry.coordinates as number[][]));
const nachForm = async (form: string) => (await zeichnungen()).filter((z) => z.properties.form === form);

const bild = (p: Page, name: string) => p.screenshot({ path: `${SCREENS}/v2-zeichnen-${name}.png`, animations: 'disabled' });
const werkzeug = (p: Page, name: string) => p.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).getByRole('button', { name, exact: true });

/** Karte auf die eigene Position (Zoom 16) und Mitte der Karte in Fensterpixeln. */
async function mitte(p: Page): Promise<{ x: number; y: number }> {
  await p.getByRole('button', { name: 'Eigener Position folgen' }).click();
  await p.waitForTimeout(1200); // easeTo
  const b = (await p.locator('.maplibregl-canvas').boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

let c = { x: 0, y: 0 };
const at = (dx: number, dy: number) => [c.x + dx, c.y + dy] as const;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/lage', { data: { name: 'Zeichnen', erstellPasswort: 'e2e' } });
  codes = await r.json();
  await ctx.close();
  leitung = await sitzung(browser, codes.leitungCode, 'Adler', ADLER, DESKTOP);
  bravo = await sitzung(browser, codes.teilnehmerCode, 'Bravo', BRAVO, DESKTOP);
  c = await mitte(leitung.page);
  await mitte(bravo.page);
});

test.afterAll(async () => {
  await leitung?.page.context().close();
  await bravo?.page.context().close();
});

test('Desktop: Palette sichtbar, Fläche zeichnen mit Kürzel P, Live-Masse, Doppelklick beendet', async () => {
  const p = leitung.page;
  await expect(p.getByRole('toolbar', { name: 'Zeichenwerkzeuge' })).toBeVisible();
  await expect(werkzeug(p, 'Auswahl')).toHaveAttribute('aria-pressed', 'true');
  await p.keyboard.press('p');
  await expect(werkzeug(p, 'Fläche')).toHaveAttribute('aria-pressed', 'true');
  await p.mouse.click(...at(-420, -260));
  await p.mouse.click(...at(-260, -260));
  await p.mouse.move(...at(-300, -150));
  await expect(p.locator('.masse')).toContainText('Fläche');
  await p.mouse.dblclick(...at(-300, -150));
  await expect.poll(async () => (await nachForm('flaeche')).length).toBe(1);
  const [f] = await nachForm('flaeche');
  expect(punkteVon(f)).toHaveLength(4); // 3 Punkte + Schluss
});

test('Desktop: Auswahl, Stützpunkt ziehen, Mittelgriff einfügen', async () => {
  const p = leitung.page;
  await p.keyboard.press('Escape'); // zurück zur Auswahl
  await expect(werkzeug(p, 'Auswahl')).toHaveAttribute('aria-pressed', 'true');
  await p.mouse.click(...at(-340, -260)); // auf die obere Kante
  const vorher = punkteVon((await nachForm('flaeche'))[0]);
  // ersten Stützpunkt nach links oben ziehen
  await p.mouse.move(...at(-420, -260));
  await p.mouse.down();
  await p.mouse.move(...at(-440, -270), { steps: 4 });
  await p.mouse.move(...at(-450, -280), { steps: 4 });
  await p.mouse.up();
  await expect.poll(async () => punkteVon((await nachForm('flaeche'))[0])[0][0]).toBeLessThan(vorher[0][0]);
  const nachher = punkteVon((await nachForm('flaeche'))[0]);
  expect(nachher[1]).toEqual(vorher[1]); // die anderen bleiben
  // Mittelgriff zwischen Punkt 2 und 3 anklicken → neuer Stützpunkt
  const [x2, y2] = at(-260, -260);
  const [x3, y3] = at(-300, -150);
  await p.mouse.click((x2 + x3) / 2, (y2 + y3) / 2);
  await expect.poll(async () => punkteVon((await nachForm('flaeche'))[0]).length).toBe(5);
});

test('Desktop: Phasenlinie mit Bezeichnung, zweiter Teilnehmer sieht sie live', async () => {
  const p = leitung.page;
  await werkzeug(p, 'Phasenlinie').click();
  await p.mouse.click(...at(-430, -100));
  await p.mouse.dblclick(...at(-260, -90));
  const dialog = p.getByRole('dialog', { name: /Bezeichnung Phasenlinie/ });
  await dialog.getByRole('textbox').fill('Adler');
  await dialog.getByRole('textbox').press('Enter');
  await expect.poll(async () => (await nachForm('phasenlinie'))[0]?.properties.bezeichnung).toBe('Adler');
  await expect(p.locator('.zn-label.zn-pl', { hasText: 'PL Adler' })).toHaveCount(2);
  // live bei Bravo, inkl. Fläche
  await expect(bravo.page.locator('.zn-label.zn-pl', { hasText: 'PL Adler' })).toHaveCount(2);
  await p.keyboard.press('Escape');
});

test('Desktop: Lasso über zwei Formen, gemeinsam verschieben, Ctrl+Z macht es rückgängig, Ctrl+Y wiederholt', async () => {
  const p = leitung.page;
  const vorher = (await zeichnungen()).map((z) => [z.properties.id, punkteVon(z)[0][0]] as const);
  await werkzeug(p, 'Lasso').click();
  await p.mouse.move(...at(-480, -310));
  await p.mouse.down();
  for (const [dx, dy] of [[-200, -310], [-200, -50], [-480, -50], [-485, -300]]) await p.mouse.move(...at(dx, dy), { steps: 6 });
  await p.mouse.up();
  await expect(p.locator('.toast', { hasText: '2 Zeichnungen ausgewählt' })).toBeVisible();
  await bild(p, 'lasso');
  // an der Phasenlinie packen und 150 px nach rechts ziehen
  await p.mouse.move(...at(-345, -95));
  await p.mouse.down();
  await p.mouse.move(...at(-275, -95), { steps: 5 });
  await p.mouse.move(...at(-195, -95), { steps: 5 });
  await p.mouse.up();
  const lons = async () => {
    const m = new Map((await zeichnungen()).map((z) => [z.properties.id, punkteVon(z)[0][0]]));
    return vorher.map(([id]) => m.get(id));
  };
  const verschoben = async () => (await lons()).every((x, i) => x! > vorher[i][1]);
  const ursprung = vorher.map(([, x]) => x);
  await expect.poll(verschoben).toBe(true);
  await p.keyboard.press('Control+z');
  await expect.poll(lons).toEqual(ursprung);
  await p.keyboard.press('Control+y');
  await expect.poll(verschoben).toBe(true);
  await p.keyboard.press('Control+z');
  await expect.poll(lons).toEqual(ursprung);
  await p.keyboard.press('Escape');
});

test('Desktop: Koordinate per LV95 eingeben, Format erkannt, Linie entsteht dort', async () => {
  const p = leitung.page;
  // LV95 dieser Punkte (proj4, auf den Meter gerundet → Toleranz ~1e-5°)
  const a = { lat: 46.9452, lon: 7.4425, lv95: "2'600'294 / 1'199'346" };
  const b = { lat: 46.9445, lon: 7.4465, lv95: '2600599 1199268' };
  await p.keyboard.press('l');
  const box = p.getByRole('group', { name: 'Punkt per Koordinate' });
  const feld = box.getByRole('textbox');
  await feld.fill(a.lv95);
  await expect(box).toContainText('LV95 erkannt');
  await bild(p, 'koord');
  await feld.press('Enter');
  await expect(feld).toHaveValue('');
  await feld.fill(b.lv95);
  await expect(box).toContainText('LV95 erkannt');
  await feld.press('Enter');
  await feld.press('Escape'); // Fokus raus, dann beendet Enter die Linie
  await p.keyboard.press('Enter');
  await expect.poll(async () => (await nachForm('linie')).length).toBe(1);
  const [l] = await nachForm('linie');
  const ps = punkteVon(l);
  expect(ps).toHaveLength(2);
  expect(ps[0][0]).toBeCloseTo(a.lon, 4);
  expect(ps[0][1]).toBeCloseTo(a.lat, 4);
  expect(ps[1][0]).toBeCloseTo(b.lon, 4);
  await p.keyboard.press('Escape');
});

test('Desktop: taktische Zeichen und Räume, Stil-Panel für die Auswahl', async () => {
  const p = leitung.page;
  const zeichne = async (name: string, punkte: [number, number][], bez?: string) => {
    await werkzeug(p, name).click();
    for (const [dx, dy] of punkte.slice(0, -1)) await p.mouse.click(...at(dx, dy));
    await p.mouse.dblclick(...at(...punkte.at(-1)!));
    const d = p.getByRole('dialog');
    await d.getByRole('textbox').fill(bez ?? '');
    await d.getByRole('textbox').press('Enter');
  };
  await zeichne('Stossrichtung', [[-120, 260], [60, 200], [200, 120]], 'Haupt');
  await zeichne('Sperre', [[260, 60], [380, 160], [420, 300]], 'S1');
  await zeichne('Grenze', [[-120, 120], [80, 60], [300, -40]], 'Zug 1 / Zug 2');
  await zeichne('Bereitstellungsraum', [[-60, -300], [120, -320], [160, -170], [-40, -160]], 'Nord');
  await zeichne('Sperrraum', [[260, -300], [420, -280], [400, -160], [250, -170]], 'Brücke');
  await werkzeug(p, 'Pfeil').click();
  await p.mouse.click(...at(-420, 140));
  await p.mouse.dblclick(...at(-280, 230));
  await expect.poll(async () => (await zeichnungen()).length).toBe(9);
  await p.keyboard.press('Escape');

  // Sperrraum auswählen, Stil-Panel: Farbe Blau → gilt für die Auswahl
  await p.mouse.click(...at(330, -230));
  await werkzeug(p, 'Stil').click();
  const panel = p.getByRole('region', { name: 'Zeichnen' });
  await expect(panel).toContainText('Sperrraum');
  await panel.getByRole('button', { name: 'Blau' }).click();
  await expect.poll(async () => {
    const r = await leitung.page.request.get('/api/export.geojson', { headers: { Authorization: `Bearer ${leitung.token}` } });
    const d = await r.json();
    return d.features.find((f: { properties: { bezeichnung: string } }) => f.properties.bezeichnung === 'Brücke')?.properties.stil.farbe;
  }).toBe('#1565c0');
  await p.waitForTimeout(800); // Kacheln
  await bild(p, 'desktop');
  await bild(bravo.page, 'teilnehmer');
});

test('Leitung: Ebene anlegen und sperren; Teilnehmer sieht sie gesperrt', async () => {
  const p = leitung.page;
  const panel = p.getByRole('region', { name: 'Zeichnen' });
  await panel.getByRole('tab', { name: 'Ebenen' }).click();
  await panel.getByRole('textbox', { name: 'Name der neuen Ebene' }).fill('Phase 1');
  await panel.getByRole('button', { name: 'Anlegen' }).click();
  const zeile = panel.locator('li.ebene', { hasText: 'Phase 1' });
  await expect(zeile).toBeVisible();
  await expect(zeile.getByRole('radio')).toBeChecked(); // neue Ebene wird aktiv
  await zeile.getByRole('button', { name: 'Sperren' }).click();
  await expect(zeile.getByLabel('gesperrt')).toBeVisible();
  await bild(p, 'ebenen');

  const b = bravo.page;
  await b.locator('nav.werkzeuge button.werkzeug', { hasText: 'Zeichnen' }).click();
  const bp = b.getByRole('region', { name: 'Zeichnen' });
  await bp.getByRole('tab', { name: 'Ebenen' }).click();
  const bz = bp.locator('li.ebene', { hasText: 'Phase 1' });
  await expect(bz.getByLabel('gesperrt')).toBeVisible();
  await expect(bz.getByRole('radio')).toBeDisabled();
  await expect(bp.getByRole('button', { name: 'Anlegen' })).toHaveCount(0);
  // Ebene lokal ausblenden: Phasenlinie verschwindet nur bei Bravo nicht (liegt in «Allgemein»), Allgemein ausblenden schon
  await bp.locator('li.ebene', { hasText: 'Allgemein' }).getByRole('checkbox').uncheck();
  await expect(b.locator('.zn-label.zn-pl')).toHaveCount(0);
  await expect(p.locator('.zn-label.zn-pl')).toHaveCount(2);
  await bp.locator('li.ebene', { hasText: 'Allgemein' }).getByRole('checkbox').check();
  await expect(b.locator('.zn-label.zn-pl')).toHaveCount(2);
});

test('Desktop: Rechtsklick auf Zeichnung öffnet Radial-Menü mit Zeichnen-Aktionen', async () => {
  const p = leitung.page;
  await p.getByRole('region', { name: 'Zeichnen' }).getByRole('button', { name: 'Schliessen' }).click(); // Karte wieder volle Breite
  await p.keyboard.press('Escape');
  await p.mouse.click(...at(-120, 120), { button: 'right' }); // Grenze, Anfang
  const ring = p.getByRole('menu', { name: /Zeichnung/ });
  for (const name of ['Details', 'Bearbeiten', 'Stil', 'Ebene', 'Kopieren', 'Löschen']) await expect(ring.getByRole('menuitem', { name })).toBeVisible();
  await p.keyboard.press('Escape');
  await expect(ring).toHaveCount(0);
});

test('Mobil 390×844: Linie mit Fertig-Knopf, Tippen zeigt Details', async ({ browser }) => {
  const charlie = await sitzung(browser, codes.teilnehmerCode, 'Charlie', ADLER, { width: 390, height: 844 });
  const p = charlie.page;
  const m = await mitte(p);
  await expect(p.getByRole('toolbar', { name: 'Zeichenwerkzeuge' })).toHaveCount(0); // keine Desktop-Palette
  await p.locator('nav.werkzeuge button.werkzeug', { hasText: 'Zeichnen' }).click();
  const panel = p.getByRole('region', { name: 'Zeichnen' });
  await expect(panel.getByRole('group', { name: 'Zeichnen' }).getByRole('button')).toHaveText(['Linie', 'Pfeil', 'Kreis']);
  await bild(p, 'mobil-panel');
  await panel.getByRole('button', { name: 'Linie' }).click();
  const leiste = p.getByRole('toolbar', { name: 'Linie zeichnen' });
  await expect(leiste).toBeVisible();
  await expect(leiste.getByRole('button', { name: 'Fertig' })).toBeDisabled();
  await p.mouse.click(m.x - 150, m.y - 120);
  await p.mouse.click(m.x - 60, m.y - 60);
  await p.waitForTimeout(400); // kein Doppelklick
  await p.mouse.click(m.x + 60, m.y - 100);
  await bild(p, 'mobil');
  await leiste.getByRole('button', { name: 'Fertig' }).click();
  await expect(leiste).toHaveCount(0);
  await expect.poll(async () => (await nachForm('linie')).filter((z) => z.properties.von === charlie.id).map((z) => punkteVon(z).length)).toEqual([3]);

  const detail = p.getByRole('region', { name: 'Zeichnen' });
  // auf die Linie tippen (erneut, falls das Echo des Servers noch unterwegs war)
  await expect(async () => {
    await p.mouse.click(m.x - 105, m.y - 90);
    await expect(detail).toContainText('Linie', { timeout: 1000 });
  }).toPass();
  await expect(detail).toContainText('Charlie');
  await expect(detail.getByRole('button', { name: 'Bearbeiten' })).toBeVisible();
  await bild(p, 'mobil-detail');
  await p.context().close();
});
