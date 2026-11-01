// Menü (Spec v7, Layout V4 «Karte als Menü»): Meine Missionen als Fähnchen, wechseln, Menü über der laufenden Mission,
// unbekannte Missionen fallen heraus; Token-Haltung nach Wiederbeitritt (Close 4005) und «beendet» (Gate 01.11.).
import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';
import { beitreten, neueMission } from './hilfen.ts';

// Geräte schliessen: offene Seiten liefen sonst mit Karte und Verbindung in die folgenden Testdateien hinein
const offen: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(offen.splice(0).map((c) => c.close()));
});
const neuerKontext = async (browser: Browser, o = {}) => {
  const c = await browser.newContext(o);
  offen.push(c);
  return c;
};

type Eintrag = { lageId: string; token: string; name: string; ansicht?: { mitte: [number, number]; zoom: number } };

/** Gerät mit diesen Missionen (Stand vom letzten Besuch) und WebSocket-Mitschnitt: hallo-Tokens, Verbindungen, Abbrüche. */
async function geraet(browser: Browser, missionen: Eintrag[], offen?: string) {
  const ctx = await neuerKontext(browser, { geolocation: { latitude: 46.948, longitude: 7.4474 } });
  await ctx.addInitScript(
    ([m, t]) => {
      if (localStorage.getItem('lagebild.missionen')) return; // nur beim ersten Laden
      localStorage.setItem('lagebild.missionen', JSON.stringify(m));
      localStorage.setItem('lagebild.profil', JSON.stringify({ rufname: 'Adler', einheit: 'Zug 1', funktion: '', sidc: '10031000001211000000' }));
      if (t) localStorage.setItem('lagebild.token', t);
    },
    [missionen.map((m) => ({ phase: 'lv', rolle: 'teilnehmer', rufname: 'Adler', funktion: '', ziele: null, ansicht: null, ...m })), offen ?? null] as const,
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  const ws = { hallos: [] as string[], zu: 0, route: undefined as WebSocketRoute | undefined };
  await page.routeWebSocket(/\/ws$/, (r) => {
    ws.route = r;
    const server = r.connectToServer();
    r.onMessage((m) => {
      const j = JSON.parse(String(m));
      if (j.typ === 'hallo') ws.hallos.push(j.token);
      server.send(m);
    });
    r.onClose(() => {
      ws.zu++;
      server.close();
    });
  });
  return { page, ws };
}

const kopf = (p: Page) => p.locator('header.kopf');
const panel = (p: Page) => p.locator('section.panel');
const boxen = (p: Page, sel: string) => p.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));

test('Meine Missionen: Fähnchen aufgefächert in der freien Karte, wechseln; Menü über der Mission hält die Verbindung; gelöschte fällt heraus @layout', async ({ browser }) => {
  const { request } = await neuerKontext(browser);
  const aare = await neueMission(request, 'Übung Aare', 'lv');
  const wabern = await neueMission(request, 'Häuserkampf Wabern', 'lv');
  const bern = { mitte: [7.4474, 46.948] as [number, number], zoom: 14 };
  const { page, ws } = await geraet(browser, [
    { lageId: aare.lageId, token: aare.token, name: 'Übung Aare', ansicht: bern },
    { lageId: wabern.lageId, token: wabern.token, name: 'Häuserkampf Wabern', ansicht: { mitte: [7.4476, 46.9479], zoom: 14 } },
    { lageId: 'unbekannt', token: 'u'.repeat(43), name: 'Gelöschte Übung', ansicht: { mitte: [8.03, 46.25], zoom: 12 } },
  ]);
  await page.goto('/');

  // Startseite: Menü; die unbekannte Mission fällt mit Hinweis heraus, die beiden in Bern stehen nebeneinander
  await expect(page.locator('.toast', { hasText: 'Gelöschte Übung' })).toBeVisible();
  await expect(panel(page).locator('.mission')).toHaveCount(2);
  await expect(page.locator('.m-pin')).toHaveCount(2);
  await page.waitForTimeout(300); // Auffächern läuft auf 'move'
  const [a, b] = await boxen(page, '.m-pin');
  expect(a.right <= b.left || b.right <= a.left, 'Fähnchen nebeneinander').toBe(true);
  const [spalte] = await boxen(page, 'nav.spalte');
  const [p] = await boxen(page, 'section.panel');
  for (const f of [a, b]) expect(f.left >= spalte.right && f.right <= p.left, 'Fähnchen zwischen Menüspalte und Panel').toBe(true);
  for (const k of await boxen(page, 'nav.spalte button')) expect(k.height >= 44 && k.bottom <= page.viewportSize()!.height, 'Menüknopf ≥ 44 px im Bild').toBe(true);

  // Fähnchen antippen: Unterseite, Mission öffnen
  await page.locator('.m-pin', { hasText: 'Häuserkampf' }).click();
  await expect(panel(page).getByRole('heading', { level: 2 })).toHaveText('Häuserkampf Wabern');
  await panel(page).getByRole('button', { name: 'Mission öffnen', exact: true }).click();
  await expect(kopf(page)).toContainText('Häuserkampf Wabern');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();

  // Menü über der laufenden Mission: dieselbe Verbindung läuft weiter, «Zurück zur Mission» rechts unten
  await page.getByRole('button', { name: 'Menü', exact: true }).click();
  await expect(panel(page).locator('.mission.offen')).toContainText('läuft');
  await page.waitForTimeout(1500);
  await panel(page).getByRole('button', { name: /^Zurück zur Mission/ }).click();
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  expect(ws.hallos).toEqual([wabern.token]);
  expect(ws.zu).toBe(0);

  // Wechsel: die andere öffnen schliesst die offene; gelöscht → beim nächsten Menü mit Hinweis aus der Liste
  await page.getByRole('button', { name: 'Menü', exact: true }).click();
  await panel(page).locator('.mission', { hasText: 'Übung Aare' }).click();
  await panel(page).getByRole('button', { name: 'Mission öffnen', exact: true }).click();
  await expect(kopf(page)).toContainText('Übung Aare');
  await expect.poll(() => ws.hallos).toEqual([wabern.token, aare.token]);
  expect((await page.request.delete('/api/lage', { headers: { Authorization: `Bearer ${wabern.token}` } })).status()).toBe(204);
  await page.getByRole('button', { name: 'Menü', exact: true }).click();
  await expect(page.locator('.toast', { hasText: 'Häuserkampf Wabern' })).toBeVisible();
  await expect(panel(page).locator('.mission')).toHaveText([/Übung Aare/]);
});

test('Token-Regel: nach 4005 erst mit dem neuen Token aus dem Speicher verbinden; «beendet» für ein altes Token meldet nicht ab', async ({ browser }) => {
  const ctx = await neuerKontext(browser);
  const m = await neueMission(ctx.request, 'Übung Token', 'lv');
  const [alpha, bravo, charlie] = [await beitreten(ctx.request, m.teilnehmerCode, { rufname: 'Alpha' }), await beitreten(ctx.request, m.teilnehmerCode, { rufname: 'Bravo' }), await beitreten(ctx.request, m.teilnehmerCode, { rufname: 'Charlie' })];
  const { page, ws } = await geraet(browser, [{ lageId: m.lageId, token: alpha.token, name: 'Übung Token' }], alpha.token);
  await page.goto('/');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  // Ein anderer Tab (oder der eigene Beitritt) speichert das neue Token, der Server schliesst die alte Verbindung mit 4005
  const neuesToken = (t: string) =>
    page.evaluate(([id, t]) => {
      const liste = JSON.parse(localStorage.getItem('lagebild.missionen')!);
      localStorage.setItem('lagebild.missionen', JSON.stringify(liste.map((x: { lageId: string }) => (x.lageId === id ? { ...x, token: t } : x))));
    }, [m.lageId, t]);

  await ws.route!.close({ code: 4005, reason: 'neues Token' });
  await page.waitForTimeout(1200); // die Beitritts-Antwort steht noch aus: nicht mit dem verworfenen Token neu verbinden
  expect(ws.hallos).toEqual([alpha.token]);
  await neuesToken(bravo.token);
  await expect.poll(() => ws.hallos).toEqual([alpha.token, bravo.token]);
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lagebild.token'))).toBe(bravo.token);

  // «beendet» für das Token dieser Verbindung, während schon ein neueres gespeichert ist: weiter mit dem neueren
  await neuesToken(charlie.token);
  ws.route!.send(JSON.stringify({ typ: 'beendet' }));
  await expect.poll(() => ws.hallos).toEqual([alpha.token, bravo.token, charlie.token]);
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menü' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lagebild.token'))).toBe(charlie.token);
});

test('Beitreten mit dem Code der offenen Mission (gleiches Gerät): 4005 kommt vor der Antwort, die Mission bleibt offen', async ({ browser }) => {
  const m = await neueMission((await neuerKontext(browser)).request, 'Übung Wieder', 'lv');
  const { page, ws } = await geraet(browser, []);
  const beitreten = async () => {
    const form = page.locator('section.panel form');
    await form.getByLabel('Code').fill(m.teilnehmerCode);
    await form.getByRole('button', { name: 'Beitreten', exact: true }).click();
    await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  };
  await page.goto('/');
  await beitreten();
  await page.getByRole('button', { name: 'Menü', exact: true }).click();
  await page.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Beitreten', exact: true }).click();
  await beitreten();
  await expect.poll(() => ws.hallos.length).toBe(2);
  expect(ws.hallos[1]).not.toBe(ws.hallos[0]);
  await page.waitForTimeout(1000);
  expect(ws.hallos).toHaveLength(2); // kein Versuch mit dem verworfenen Token
  const liste = await page.evaluate(() => JSON.parse(localStorage.getItem('lagebild.missionen')!));
  expect(liste.map((x: { lageId: string; token: string }) => [x.lageId, x.token])).toEqual([[m.lageId, ws.hallos[1]]]);
});
