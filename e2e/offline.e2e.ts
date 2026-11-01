// Offline-Gebiete: Rechteck aufziehen → laden → offline aus dem Speicher anzeigen → löschen; Pausieren/Fortsetzen über Neuladen.
// Alle Kachel-Anfragen gehen an page.route (Farbkacheln), nichts an swisstopo. Service Worker aus, sonst sieht route nichts.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { crc32, deflateSync } from 'node:zlib';
import { beitreten, dokuBild, HOCH, kartenMitte, neueMission, wische } from './hilfen.ts';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const GRUEN = [40, 170, 60] as const;
const BLAU = [30, 80, 220] as const;

test.describe.configure({ mode: 'serial' });

/** 256×256-PNG in einer Farbe. */
function png([r, g, b]: readonly [number, number, number]): Buffer {
  const chunk = (typ: string, daten: Buffer) => {
    const kopf = Buffer.alloc(8);
    kopf.writeUInt32BE(daten.length);
    kopf.write(typ, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])));
    return Buffer.concat([kopf, daten, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const zeile = Buffer.concat([Buffer.from([0]), Buffer.alloc(256 * 3).map((_, i) => [r, g, b][i % 3])]);
  const bild = Buffer.concat(Array.from({ length: 256 }, () => zeile));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(bild)), chunk('IEND', Buffer.alloc(0))]);
}
const KACHEL = { gruen: png(GRUEN), blau: png(BLAU) };

let ctx: BrowserContext;
let page: Page;
let offlineAn = false;
const geholt: string[] = [];

test.beforeAll(async ({ browser }) => {
  const { teilnehmerCode } = await neueMission((await browser.newContext()).request, 'Übung Aare', 'lv');
  ctx = await browser.newContext({ geolocation: ADLER, serviceWorkers: 'block' });
  const r = await beitreten(ctx.request, teilnehmerCode, { rufname: 'Fuchs' });
  const { token } = r;
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  // Gerade Zoomstufen grün, ungerade blau: wechselt die Farbe offline nach dem Hineinzoomen, kam die feinere Stufe
  // aus dem Speicher und nicht als hochgezoomte gröbere aus dem Arbeitsspeicher von MapLibre
  await ctx.route(/^https:\/\/(wmts|vectortiles)\.geo\.admin\.ch\//, (route) => {
    if (offlineAn) return route.abort('internetdisconnected');
    const url = route.request().url();
    geholt.push(url);
    const z = /\/3857\/(\d+)\//.exec(url)?.[1];
    return route.fulfill({ status: 200, contentType: 'image/png', body: Number(z) % 2 ? KACHEL.blau : KACHEL.gruen });
  });
  page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
});

test.afterAll(() => ctx.close());

const knopf = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });
const bild = (name: string) => dokuBild(page, `v4-offline-${name}`);
const gebiete = () => page.locator('ul.gebiete > li');
const kachelnImSpeicher = () => page.evaluate(async () => (await (await caches.open('lagebild-offline-kacheln')).keys()).length);
const gespeichert = () => page.evaluate(() => JSON.parse(localStorage.getItem('lagebild.offline.gebiete') ?? '[]'));

async function oeffneVerwaltung() {
  await knopf('Mehr').click();
  await page.getByRole('menuitem', { name: 'Offline-Karten' }).click();
  await expect(knopf('Neues Gebiet aufziehen')).toBeVisible();
}

/** Mitte der Karte: hoch randlos der ganze Bildschirm, quer rechts neben dem offenen Panel. */
const mitte = () => kartenMitte(page);

/** Rechteck mit dem Finger aufziehen, symmetrisch um die Kartenmitte. */
async function ziehe(dx: number, dy: number) {
  const m = await mitte();
  await wische(page, { x: m.x - dx, y: m.y - dy }, { x: m.x + dx, y: m.y + dy });
}

/** Farbe knapp neben der Kartenmitte (dort sitzt das eigene Symbol) aus einem Screenshot; der Browser dekodiert das PNG. */
async function farbeMitte(): Promise<number[]> {
  const b64 = (await page.screenshot()).toString('base64');
  const m = await mitte();
  return page.evaluate(
    async ({ b64, x, y }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const f = img.width / innerWidth;
      return [...g.getImageData(Math.round((x + 40) * f), Math.round((y + 40) * f), 1, 1).data.slice(0, 3)];
    },
    { b64, ...m },
  );
}
const nah = (a: number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]) < 30);

test('Rechteck aufziehen, laden, offline aus dem Speicher, löschen', async () => {
  await knopf('Eigener Position folgen').click(); // Zoom 16 auf der eigenen Position
  await page.waitForTimeout(1500);
  await oeffneVerwaltung();
  await expect(page.getByText('Noch keine Offline-Gebiete')).toBeVisible();
  await knopf('Neues Gebiet aufziehen').click();
  await expect(page.getByText('Rechteck auf der Karte aufziehen')).toBeVisible();
  await ziehe(80, 80); // der Messpunkt neben dem eigenen Symbol liegt auch nach dem Hineinzoomen sicher drin
  const leiste = page.getByRole('dialog', { name: 'Offline-Gebiet aufziehen' });
  await expect(leiste).toContainText(/[\d.]+ × [\d.]+ km · ca\. [\d.]+ MB/);
  await bild('aufziehen-quer');
  await knopf('Weiter').click();
  await expect(leiste).toContainText('Frei auf dem Gerät');
  await expect(leiste).not.toContainText('WLAN empfohlen');
  await bild('bestaetigen-quer');
  await knopf('Laden').click();

  await expect(gebiete()).toHaveCount(1);
  await expect(gebiete().first().getByRole('textbox', { name: 'Name' })).toHaveValue(/^Übung Aare · \d{1,2}\.\d{1,2}\.\d{4}$/);
  await expect(gebiete().first().getByRole('status')).toHaveText('Fertig', { timeout: 45_000 });
  const [g] = await gespeichert();
  expect(g.erledigt).toBe(g.gesamt);
  expect(await kachelnImSpeicher()).toBe(g.gesamt);
  expect(g.bytes).toBeGreaterThan(0);
  await bild('verwaltung-quer');
  await dokuBild(page, 'quer-offline-gebiete');

  const vorgabe = page.viewportSize()!;
  // Umbenennen bleibt gespeichert
  await gebiete().first().getByRole('textbox', { name: 'Name' }).fill('Raum Bern');
  await gebiete().first().getByRole('textbox', { name: 'Name' }).press('Enter');
  await expect.poll(async () => (await gespeichert())[0].name).toBe('Raum Bern');

  // Hoch: Verwaltung als Sheet unten
  await page.setViewportSize(HOCH);
  await page.waitForTimeout(400);
  await bild('verwaltung-hoch');
  await page.setViewportSize(vorgabe);

  // Offline: eine Stufe tiefer zoomen → die Farbe der feineren Stufe kommt aus dem Speicher
  await knopf('Schliessen').first().click();
  offlineAn = true;
  await ctx.setOffline(true);
  const m = await mitte();
  await page.waitForTimeout(1500); // Karte nach dem Drehen (hoch → quer) zur Ruhe kommen lassen
  const vorZoom = nah(await farbeMitte(), BLAU) ? BLAU : GRUEN;
  expect(nah(await farbeMitte(), vorZoom)).toBe(true);
  await page.mouse.dblclick(m.x + 40, m.y + 40); // neben dem eigenen Symbol (Doppelklick darauf = Details)
  const nachZoom = vorZoom === BLAU ? GRUEN : BLAU;
  await expect.poll(async () => nah(await farbeMitte(), nachZoom), { timeout: 10_000 }).toBe(true);
  await bild('karte-offline-quer');
  // ausserhalb: grob statt Fehlerflut, keine Toasts
  await expect(page.locator('.toast')).toHaveCount(0);

  // Löschen entfernt alle Kacheln (kein anderes Gebiet)
  await ctx.setOffline(false);
  offlineAn = false;
  await oeffneVerwaltung();
  await gebiete().first().getByRole('button', { name: 'Löschen' }).click();
  await expect(gebiete()).toHaveCount(0);
  await expect.poll(kachelnImSpeicher).toBe(0);
});

test('Pausieren, Fortsetzen und Weiterladen nach Neuladen', async () => {
  await knopf('Schliessen').first().click();
  const m = await mitte();
  await page.mouse.move(m.x + 40, m.y + 40);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 500); // herauszoomen: grösseres Gebiet, das nicht in ein paar Sekunden fertig ist
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1000);
  await oeffneVerwaltung();
  await knopf('Neues Gebiet aufziehen').click();
  await ziehe(330, 120);
  await knopf('Luftbild').click();
  const ohne = Number((await page.getByRole('dialog', { name: 'Offline-Gebiet aufziehen' }).textContent())?.match(/\(([\d']+) Kacheln\)/)?.[1].replace(/'/g, ''));
  await knopf('Volles Detail').click(); // bis z20: mehr Kacheln, das Gebiet ist nicht in ein paar Sekunden fertig
  const kacheln = Number((await page.getByRole('dialog', { name: 'Offline-Gebiet aufziehen' }).textContent())?.match(/\(([\d']+) Kacheln\)/)?.[1].replace(/'/g, ''));
  expect(kacheln).toBeGreaterThan(300);
  expect(kacheln).toBeGreaterThan(ohne); // «Volles Detail» lädt das Luftbild eine Stufe tiefer
  await knopf('Weiter').click();
  await knopf('Laden').click();
  const g = gebiete().first();
  await expect(g.getByRole('status')).toContainText(/Lädt … · [1-9]\d? %/, { timeout: 30_000 });
  await g.getByRole('button', { name: 'Pausieren' }).click();
  await expect(g.getByRole('status')).toContainText('Pausiert');
  await page.waitForTimeout(1500);
  const pausiert = (await gespeichert())[0].erledigt;
  expect(pausiert).toBeGreaterThan(0);

  // Neu laden: bleibt pausiert, Stand bleibt
  await page.reload();
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  await page.waitForTimeout(1500);
  expect((await gespeichert())[0]).toMatchObject({ status: 'pausiert', erledigt: pausiert });
  await oeffneVerwaltung();
  await expect(g.getByRole('status')).toContainText('Pausiert');
  await bild('pausiert-quer');
  await g.getByRole('button', { name: 'Fortsetzen' }).click();
  await expect.poll(async () => (await gespeichert())[0].erledigt, { timeout: 15_000 }).toBeGreaterThan(pausiert + 5);

  // App «zu» mitten im Download: läuft beim nächsten Öffnen von selbst weiter
  await page.waitForTimeout(1200);
  const abgebrochen = (await gespeichert())[0].erledigt;
  await page.reload();
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  await expect.poll(async () => (await gespeichert())[0].erledigt, { timeout: 15_000 }).toBeGreaterThan(abgebrochen + 5);

  await oeffneVerwaltung();
  await gebiete().first().getByRole('button', { name: 'Löschen' }).click();
  await expect(gebiete()).toHaveCount(0);
});

test('Aufziehen im Hochformat', async () => {
  await page.setViewportSize(HOCH);
  await page.waitForTimeout(400);
  await knopf('Neues Gebiet aufziehen').click();
  await ziehe(120, 60);
  await expect(page.getByRole('dialog', { name: 'Offline-Gebiet aufziehen' })).toContainText('km');
  await bild('aufziehen-hoch');
  await knopf('Abbrechen').click();
  await expect(knopf('Neues Gebiet aufziehen')).toBeVisible();
});
