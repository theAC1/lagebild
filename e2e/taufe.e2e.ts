// Geländetaufe (30.10.): Taufmodus mit abgefangenen swisstopo-Vektorkacheln (Fixture aus taufe-kacheln.ts),
// Gebäude/Strasse taufen, verlängern, Stossrichtung, Layer aus/an, doppelter Name. Gegen den echten Server.
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { kachel, ll, MITTE } from './taufe-kacheln.ts';
import { dokuBild, HOCH, QUER, wische } from './hilfen.ts';

const SIDC = '10031000001211000000';
const TAG = new Date('2026-10-30T11:00:00+01:00');

test.describe.configure({ mode: 'serial' });

type Sitzung = { page: Page; token: string; kacheln: string[] };
let leitung: Sitzung;
let bravo: Sitzung;

async function sitzung(browser: Browser, code: string, rufname: string, viewport: typeof HOCH): Promise<Sitzung> {
  const ctx = await browser.newContext({ geolocation: MITTE, viewport });
  await ctx.clock.install({ time: TAG });
  const kacheln: string[] = [];
  await ctx.route(/vectortiles\d?\.geo\.admin\.ch\/tiles\/ch\.swisstopo\.base\.vt\/v1\.0\.0\/(\d+)\/(\d+)\/(\d+)\.pbf/, (route) => {
    const [z, x, y] = new URL(route.request().url()).pathname.split('/').slice(-3).map((s) => parseInt(s, 10));
    kacheln.push(`${z}/${x}/${y}`);
    return route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: kachel(z, x, y), headers: { 'access-control-allow-origin': '*' } });
  });
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname, einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  expect(r.status()).toBe(201);
  const { token } = await r.json();
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token); // Bedienung: Vorgabe «Daumen-Ränder»
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  return { page, token, kacheln };
}

const knopf = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' });
const bild = (p: Page, name: string) => dokuBild(p, `v4-taufe-${name}`);
const label = (p: Page, name: string) => p.locator('.tf-label', { hasText: new RegExp(`^${name}$`) });

/** Karte auf die eigene Position (= MITTE, Zoom 16). */
async function zentriere(p: Page) {
  await knopf(p, 'Eigener Position folgen').click();
  await p.waitForTimeout(1200);
}
/** Bildschirmpunkt zu Metern (Ost, Nord) ab MITTE bei Zoom 16 (512-px-Kacheln, wie MapLibre). */
async function px(p: Page, ost: number, nord: number): Promise<[number, number]> {
  const b = (await p.locator('.maplibregl-canvas').boundingBox())!;
  const welt = ([lon, lat]: [number, number]) => {
    const s = Math.sin((lat * Math.PI) / 180);
    const w = 512 * 2 ** 16;
    return [((lon + 180) / 360) * w, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w];
  };
  const [x0, y0] = welt([MITTE.longitude, MITTE.latitude]);
  const [x, y] = welt(ll(ost, nord));
  return [b.x + b.width / 2 + (x - x0), b.y + b.height / 2 + (y - y0)];
}
const tippe = async (p: Page, ost: number, nord: number) => p.mouse.click(...(await px(p, ost, nord)));

type ExportTaufe = { geometry: { type: string; coordinates: number[][] | number[][][] }; properties: { name: string; familie: string; stoss: number | null; ziel: boolean; id: string } };
async function taufen(req: APIRequestContext = leitung.page.request): Promise<ExportTaufe[]> {
  const r = await req.get('/api/export.geojson', { headers: { Authorization: `Bearer ${leitung.token}` } });
  return (await r.json()).features.filter((f: { properties: { art: string } }) => f.properties.art === 'taufe');
}
const taufeNamens = async (name: string) => (await taufen()).find((t) => t.properties.name === name)!;
/** Ausdehnung in Metern ab MITTE: [west, süd, ost, nord]. */
function ausdehnung(t: ExportTaufe): number[] {
  const pts = (t.geometry.type === 'Polygon' ? (t.geometry.coordinates as number[][][])[0] : (t.geometry.coordinates as number[][])) as [number, number][];
  const k = Math.cos((MITTE.latitude * Math.PI) / 180) * 111_320;
  const xs = pts.map(([lon]) => Math.round((lon - MITTE.longitude) * k));
  const ys = pts.map(([, lat]) => Math.round((lat - MITTE.latitude) * 111_320));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => v + 0); // -0 → 0
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/lage', { data: { name: 'Übung Taufe', erstellPasswort: 'e2e', phase: 'lv' } });
  const codes = await r.json();
  await ctx.close();
  leitung = await sitzung(browser, codes.leitungCode, 'Adler', HOCH);
  bravo = await sitzung(browser, codes.teilnehmerCode, 'Bravo', QUER);
  await zentriere(leitung.page);
  await zentriere(bravo.page);
});

test.afterAll(async () => {
  await leitung?.page.context().close();
  await bravo?.page.context().close();
});

test('ausserhalb des Taufmodus wird nichts geladen und nichts ist antippbar', async () => {
  const p = leitung.page;
  await tippe(p, 22, 30);
  await p.waitForTimeout(500);
  expect(leitung.kacheln).toEqual([]);
  await expect(p.getByRole('region', { name: 'Namen wählen' })).toHaveCount(0);
});

test('Taufmodus an → Gebäude antippen → Namen wählen → zweites Gerät sieht die Taufe', async () => {
  const p = leitung.page;
  await knopf(p, 'Mehr').click();
  await p.getByRole('menuitem', { name: 'Geländetaufe' }).click();
  await knopf(p, 'Taufmodus starten').click();
  await expect(p.getByRole('region', { name: 'Taufmodus' })).toBeVisible();
  await expect.poll(() => leitung.kacheln.length).toBeGreaterThan(0);
  expect(leitung.kacheln.every((k) => k.startsWith('14/'))).toBe(true);
  await p.waitForTimeout(800);
  await bild(p, 'modus-hoch');

  await tippe(p, 30, 30); // Gebäude «Ost» über der Kachelgrenze
  const wahl = p.getByRole('region', { name: 'Namen wählen' });
  await expect(wahl.getByRole('heading', { name: 'Gebäude taufen' })).toBeVisible();
  const chips = wahl.getByRole('group', { name: 'Freie Namen' }).getByRole('button');
  await expect(chips.first()).toHaveText('Gold'); // Liste, kein Vorschlag: jeder Name ist ein Tipp
  await bild(p, 'wahl-hoch');
  await chips.filter({ hasText: /^Gold$/ }).click();
  await expect(wahl).toHaveCount(0);
  await expect(label(bravo.page, 'Gold')).toBeVisible();
  await expect(label(p, 'Gold')).toBeVisible();

  // Umriss über die Kachelgrenze zusammengefügt: ein Ring mit 4 Ecken, volle Ausdehnung
  const gold = await taufeNamens('Gold');
  expect(gold.geometry.type).toBe('Polygon');
  expect((gold.geometry.coordinates as number[][][])[0]).toHaveLength(5);
  expect(ausdehnung(gold)).toEqual([0, 15, 45, 45]);
});

test('Name doppelt → abgelehnt; vergebener Name fehlt in der Liste', async () => {
  const p = leitung.page;
  await tippe(p, -30, 30); // Gebäude «West»
  const wahl = p.getByRole('region', { name: 'Namen wählen' });
  await expect(wahl).toBeVisible();
  await expect(wahl.getByRole('button', { name: 'Gold', exact: true })).toHaveCount(0);
  await wahl.getByRole('textbox', { name: 'Eigener Name' }).fill('gold');
  await wahl.getByRole('button', { name: 'Taufen' }).click();
  await expect(p.getByText('Name «gold» ist in dieser Lage schon vergeben')).toBeVisible();
  await expect(wahl).toBeVisible(); // Wahl bleibt offen
  await wahl.getByRole('button', { name: 'Copper', exact: true }).click();
  await expect(label(bravo.page, 'Copper')).toBeVisible();
});

test('Strasse taufen (Abschnitt bis zur Kreuzung) und verlängern; Fussweg zählt nicht', async () => {
  const p = leitung.page;
  await tippe(p, -30, -60); // Fussweg
  await expect(p.getByText(/nichts taufbar/)).toBeVisible();
  await tippe(p, -40, 0);
  const wahl = p.getByRole('region', { name: 'Namen wählen' });
  await expect(wahl.getByRole('heading', { name: 'Strasse taufen' })).toBeVisible();
  await wahl.getByRole('button', { name: 'Jaguar', exact: true }).click();
  await expect(label(bravo.page, 'Jaguar')).toBeVisible();
  expect(ausdehnung(await taufeNamens('Jaguar'))).toEqual([-90, 0, 60, 0]); // Kreuzung zu Kreuzung, über die Kachelnaht
  await expect(p.getByRole('region', { name: 'Taufmodus' })).toContainText('hängt an «Jaguar»');

  await tippe(p, 85, 0); // nächster Abschnitt hinter der Kreuzung
  await expect.poll(async () => ausdehnung(await taufeNamens('Jaguar'))).toEqual([-90, 0, 250, 0]);
  await knopf(p, 'Fertig verlängern').click();
  await expect(p.getByRole('region', { name: 'Taufmodus' })).toContainText('Objekt antippen');
});

test('Stossrichtung setzen → Fassaden; Zielobjekt hebt hervor', async () => {
  const p = leitung.page;
  await tippe(p, 30, 30); // bestehende Taufe «Gold» → Details
  await expect(p.getByText('Ansprache', { exact: false })).toHaveCount(0);
  await knopf(p, 'Stoss nach N').click();
  await expect(p.getByText(/Ansprache z\.B\. «Gold, Fassade Rot»/)).toBeVisible();
  await expect.poll(async () => (await taufeNamens('Gold')).properties.stoss).toBe(0);
  await knopf(p, 'Zielobjekt').click();
  await expect(label(bravo.page, 'Gold')).toHaveClass(/tf-ziel/);
  await bild(p, 'detail-hoch');
  // Fassade umfärben: Tipp auf die Südfassade (weiss) schaltet sie auf rot
  await knopf(p, 'Fassaden umfärben').click();
  await expect(p.getByRole('region', { name: 'Fassaden umfärben' })).toBeVisible();
  await tippe(p, 22, 15);
  // Südfassade ist weiss (Zutritt bei Stoss nach Norden) → ein Tipp schaltet sie auf rot
  await expect.poll(async () => ((await taufeNamens('Gold')).properties as unknown as { fassaden: [number, string][] }).fassaden.map(([, f]) => f)).toEqual(['rot']);
  await knopf(p, 'Fertig').click();
  await knopf(p, 'Fertig').click(); // Taufmodus beenden
  await expect(p.getByRole('region', { name: 'Taufmodus' })).toHaveCount(0);
  // ausserhalb des Modus ist nichts antippbar
  await tippe(p, 30, 30);
  await p.waitForTimeout(400);
  await expect(p.getByText('Ansprache', { exact: false })).toHaveCount(0);
});

test('Layer «Geländetaufe» aus und an, pro Gerät gemerkt', async () => {
  const p = bravo.page;
  const ebenen = knopf(p, 'Karte und Ebenen wählen');
  await ebenen.click();
  const schalter = p.getByRole('group', { name: 'Karte' }).getByRole('button', { name: 'Geländetaufe' });
  await expect(schalter).toHaveAttribute('aria-pressed', 'true');
  await schalter.click();
  await expect(label(p, 'Gold')).toHaveCount(0);
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('lagebild.einstellungen')!).taufe)).toBe(false);
  await schalter.click();
  await expect(label(p, 'Gold')).toBeVisible();
  await p.keyboard.press('Escape');
});

test('SpotMap-Ansicht auf Luftbild, quer und hoch', async () => {
  for (const s of [bravo, leitung]) {
    const p = s.page;
    await p.evaluate(() => {
      const k = 'lagebild.einstellungen';
      localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), basiskarte: 'luftbild' }));
    });
    await p.reload();
    await expect(p.locator('.verbindung.verbunden')).toBeVisible();
    await expect(p.locator('.tf-anker').first()).toBeAttached(); // Karte geladen (Layer erst danach gemountet)
    await zentriere(p);
    await expect(label(p, 'Gold')).toBeVisible();
    await p.waitForTimeout(2500); // Luftbild-Kacheln
  }
  await bild(bravo.page, 'spotmap-luftbild-quer');
  await bild(leitung.page, 'spotmap-luftbild-hoch');
});

test('Teilnehmer tauft im Querformat auf dem Luftbild', async () => {
  const p = bravo.page;
  await knopf(p, 'Mehr').click();
  await p.getByRole('menuitem', { name: 'Geländetaufe' }).click();
  await knopf(p, 'Taufmodus starten').click();
  await expect(p.getByRole('region', { name: 'Taufmodus' })).toBeVisible();
  await expect.poll(() => bravo.kacheln.length).toBeGreaterThan(0);
  await p.waitForTimeout(800);
  await bild(p, 'modus-luftbild-quer');
  await dokuBild(p, 'quer-taufmodus');
  const wahl = p.getByRole('region', { name: 'Namen wählen' });
  // erneut tippen, falls die Vektorkacheln (Luftbild, ausgelasteter Rechner) beim ersten Tipp noch nicht bereit waren
  await expect(async () => {
    await tippe(p, -150, 0); // Abschnitt westlich der Kreuzung bei x = −90
    await expect(wahl).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(wahl.getByRole('button', { name: 'Jaguar', exact: true })).toHaveCount(0);
  await wahl.getByRole('button', { name: 'Horse', exact: true }).click();
  await expect(label(leitung.page, 'Horse')).toBeVisible();
  expect(ausdehnung(await taufeNamens('Horse'))).toEqual([-250, 0, -90, 0]);
  await knopf(p, 'Fertig verlängern').click();
  await knopf(p, 'Fertig').click();
});

// Rückmeldung 31.10. – Hauptnutzung Handy quer: Gebäudeteile sammeln, Fläche Punkt für Punkt
const querBild = (p: Page, name: string) => dokuBild(p, `quer-taufe-${name}`);

test('quer: mehrteiliges Gebäude – Teile antippen sammelt (dazu/weg), getauft wird der gemeinsame Umriss', async () => {
  const p = bravo.page;
  await knopf(p, 'Mehr').click();
  await p.getByRole('menuitem', { name: 'Geländetaufe' }).click();
  await knopf(p, 'Taufmodus starten').click();
  const wahl = p.getByRole('region', { name: 'Namen wählen' });
  await expect(async () => {
    await tippe(p, -150, 30);
    await expect(wahl).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(wahl).toContainText('1 Teil');
  await tippe(p, -120, 22);
  await expect(wahl).toContainText('2 Teile');
  await tippe(p, -120, 22); // nochmals: weg
  await expect(wahl).toContainText('1 Teil');
  await tippe(p, -120, 22);
  await expect(wahl).toContainText('2 Teile');
  await expect(p.locator('.toasts .toast')).toHaveCount(0, { timeout: 10_000 }); // Hinweis eines zu frühen Tipps
  await querBild(p, 'teile');
  await wahl.getByRole('button', { name: 'Iridium', exact: true }).click();
  await expect(label(leitung.page, 'Iridium')).toBeVisible();
  const iridium = await taufeNamens('Iridium');
  expect(iridium.geometry.type).toBe('Polygon');
  expect((iridium.geometry.coordinates as number[][][])[0]).toHaveLength(5); // ohne gemeinsame Wand
  expect(ausdehnung(iridium)).toEqual([-160, 20, -110, 40]);
});

test('quer: Wald Punkt für Punkt zeichnen (Doppeltipp zählt nicht), Punkt ziehen, Zwischenpunkt per Mittelgriff', async () => {
  const p = bravo.page;
  const modus = p.getByRole('region', { name: 'Taufmodus' });
  await knopf(p, 'Fläche zeichnen').click();
  await tippe(p, -100, -10);
  await tippe(p, -40, -10);
  await tippe(p, -40, -10); // Doppeltipp
  await expect(modus).toContainText('Eckpunkte antippen (2/3)');
  await tippe(p, -70, -60);
  await knopf(p, 'Abschliessen').click();
  const wahl = p.getByRole('region', { name: 'Namen wählen' });
  await expect(wahl).toBeVisible();
  const zieh = async (von: [number, number], nach: [number, number]) => {
    const [a, b] = [await px(p, ...von), await px(p, ...nach)];
    await wische(p, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
  };
  await zieh([-70, -60], [-70, -75]); // Punkt ziehen (Finger)
  await zieh([-70, -10], [-70, 5]); // Mittelgriff zwischen den ersten Punkten ziehen = neuer Punkt
  await expect(knopf(p, 'Punkt löschen')).toHaveCount(0); // gezogen ist nicht gewählt
  // Mittelgriff antippen fügt ein, Punkt antippen wählt ihn (einmal, trotz Ersatz-Mausereignissen), «Punkt löschen»
  const [kx, ky] = await px(p, -55, -42.5);
  await p.touchscreen.tap(kx, ky);
  await p.waitForTimeout(900);
  await expect(knopf(p, 'Punkt löschen')).toHaveCount(0); // eingefügt, nicht gewählt
  await p.touchscreen.tap(kx, ky);
  await knopf(p, 'Punkt löschen').click();
  await expect(knopf(p, 'Punkt löschen')).toHaveCount(0);
  await p.waitForTimeout(300);
  await querBild(p, 'flaeche');
  await wahl.getByRole('group', { name: 'Familie' }).getByRole('button', { name: 'Wald' }).click();
  await wahl.getByRole('button', { name: 'Forest', exact: true }).click();
  await expect(label(leitung.page, 'Forest')).toBeVisible();
  const forest = await taufeNamens('Forest');
  expect(forest.properties.familie).toBe('wald');
  expect((forest.geometry.coordinates as number[][][])[0]).toHaveLength(5);
  const soll = [-100, -75, -40, 5]; // getippt: ±1 m (1 px ≈ 0,8 m)
  ausdehnung(forest).forEach((v, i) => expect(Math.abs(v - soll[i]), `Ausdehnung ${i}`).toBeLessThanOrEqual(1));
  await knopf(p, 'Fertig').click();
});
