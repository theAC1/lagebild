// Menü (Spec v7, Layout V4 «Karte als Menü»): Meine Missionen als Fähnchen, wechseln, Menü über der laufenden Mission,
// unbekannte Missionen fallen heraus; Token-Haltung nach Wiederbeitritt (Close 4005) und «beendet» (Gate 01.11.).
import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';
import { beitreten, indieMission, neueMission } from './hilfen.ts';

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

type Eintrag = { lageId: string; token: string; name: string; rolle?: string; ansicht?: { mitte: [number, number]; zoom: number } };

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
  const ws = { hallos: [] as string[], zu: 0, vomServer: [] as number[], route: undefined as WebSocketRoute | undefined };
  await page.routeWebSocket(/\/ws$/, (r) => {
    ws.route = r;
    const server = r.connectToServer();
    server.onClose((code, reason) => {
      ws.vomServer.push(code ?? 0);
      void r.close({ code, reason }); // an die Seite weiterreichen (mit eigenem Hörer leitet Playwright nicht selbst weiter)
    });
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
  const anders = await neueMission(ctx.request, 'Übung Anders', 'lv');
  const anders2 = await beitreten(ctx.request, anders.teilnehmerCode, { rufname: 'Delta' });
  const { page, ws } = await geraet(
    browser,
    [
      { lageId: m.lageId, token: alpha.token, name: 'Übung Token' },
      { lageId: anders.lageId, token: anders.token, name: 'Übung Anders' },
    ],
    alpha.token,
  );
  await page.goto('/');
  await indieMission(page);
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  // Ein anderer Tab (oder der eigene Beitritt) speichert das neue Token, der Server schliesst die alte Verbindung mit 4005
  const neuesToken = (t: string, lageId = m.lageId) =>
    page.evaluate(([id, t]) => {
      const liste = JSON.parse(localStorage.getItem('lagebild.missionen')!);
      localStorage.setItem('lagebild.missionen', JSON.stringify(liste.map((x: { lageId: string }) => (x.lageId === id ? { ...x, token: t } : x))));
    }, [lageId, t]);

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

  // Unterbrochenes Warten: 4005, während des Wartens eine andere Mission öffnen. Ein späteres 4005 auf dieser wartet wieder die
  // volle Frist ab, statt wegen des alten Zeitstempels sofort abzumelden (Mission und Token blieben sonst weg)
  await ws.route!.close({ code: 4005, reason: 'neues Token' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Menü', exact: true }).click();
  await page.locator('section.panel .mission', { hasText: 'Übung Anders' }).click();
  await page.locator('section.panel').getByRole('button', { name: 'Mission öffnen', exact: true }).click();
  await expect.poll(() => ws.hallos).toEqual([alpha.token, bravo.token, charlie.token, anders.token]);
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  await page.waitForTimeout(10_500); // länger als die Frist (10 s) seit dem ersten 4005
  await ws.route!.close({ code: 4005, reason: 'neues Token' });
  await page.waitForTimeout(800);
  const liste = await page.evaluate(() => JSON.parse(localStorage.getItem('lagebild.missionen')!).map((x: { name: string }) => x.name));
  expect(liste).toContain('Übung Anders');
  expect(await page.evaluate(() => localStorage.getItem('lagebild.token'))).toBe(anders.token);
  await neuesToken(anders2.token, anders.lageId);
  await expect.poll(() => ws.hallos.at(-1)).toBe(anders2.token);
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
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
  // Antwort zurückhalten, bis der Client die Schliessung (4005) hat: so ist die Reihenfolge erzwungen, nicht Glückssache
  await page.route('**/api/beitreten', async (route) => {
    const antwort = await route.fetch(); // der Server schliesst die alte Verbindung, bevor er antwortet
    await expect.poll(() => ws.vomServer).toEqual([4005]);
    await page.waitForTimeout(1500); // länger als jede Wiederverbindung (Backoff höchstens 1,25 s): mit dem verworfenen Token hätte sich der Client schon gemeldet
    await route.fulfill({ response: antwort });
  });
  await beitreten();
  expect(ws.vomServer).toEqual([4005]);
  await expect.poll(() => ws.hallos.length).toBe(2);
  expect(ws.hallos[1]).not.toBe(ws.hallos[0]);
  await page.waitForTimeout(1000);
  expect(ws.hallos).toHaveLength(2); // kein Versuch mit dem verworfenen Token
  const liste = await page.evaluate(() => JSON.parse(localStorage.getItem('lagebild.missionen')!));
  expect(liste.map((x: { lageId: string; token: string }) => [x.lageId, x.token])).toEqual([[m.lageId, ws.hallos[1]]]);
});

test('App-Start immer im Menü: die offene Mission verbindet im Hintergrund, «Zurück zur Mission» geht hinein; Fähnchen nah weg', async ({ browser }) => {
  const ctx = await neuerKontext(browser);
  const start = await neueMission(ctx.request, 'Übung Start', 'lv');
  const daneben = await neueMission(ctx.request, 'Übung Daneben', 'lv');
  const ansicht = { mitte: [7.4474, 46.948] as [number, number], zoom: 14 };
  const { page, ws } = await geraet(
    browser,
    [
      { lageId: start.lageId, token: start.token, name: 'Übung Start', rolle: 'leitung', ansicht },
      { lageId: daneben.lageId, token: daneben.token, name: 'Übung Daneben', ansicht: { mitte: [7.63, 46.76], zoom: 12 } },
    ],
    start.token,
  );
  const stand = () => page.evaluate(() => JSON.parse(localStorage.getItem('lagebild.missionen')!)[0]);
  await page.goto('/');

  // Menü statt Mission; alle Fähnchen im Bild, die Mission läuft schon im Hintergrund
  await expect(page.getByRole('navigation', { name: 'Menü' })).toBeVisible();
  await expect(page.locator('.verbindung')).toHaveCount(0); // nicht in der Mission
  await expect(page.locator('.m-pin')).toHaveCount(2);
  await expect(panel(page).locator('.mission.offen')).toContainText('läuft');
  await expect.poll(() => ws.hallos).toEqual([start.token]);
  // Der gemerkte Stand bleibt: vor dem ersten Snapshot wüsste das Gerät sonst nichts von den Zielobjekten
  expect((await stand()).ansicht).toEqual(ansicht);
  // In der Übersicht (Zoom ≤ 13) bleibt das Fähnchen der offenen Mission sichtbar
  await expect(page.locator('.m-pin.laeuft')).toBeVisible();

  // Unterseite der offenen Mission: Karte fliegt in ihr Gebiet (Zoom 14), ihr Fähnchen verdeckte dort Symbol und Ziel
  await page.locator('.m-pin.laeuft').click();
  await expect(page.locator('.m-pin.laeuft')).toBeHidden();
  await expect(page.locator('.m-pin:not(.laeuft)')).toBeVisible(); // andere Missionen unverändert
  // Eigene Angaben live ändern: Meine Missionen führt sie sofort nach, nicht erst beim nächsten Snapshot
  const rufname = panel(page).getByLabel('Rufname');
  await rufname.fill('Falke');
  await rufname.press('Tab');
  await expect.poll(async () => (await stand()).rufname).toBe('Falke');
  await panel(page).getByRole('button', { name: 'Zurück zu Meine Missionen' }).click();
  await expect(page.locator('.m-pin.laeuft')).toBeVisible();

  await indieMission(page);
  await expect(kopf(page)).toContainText('Übung Start');
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  expect(ws.hallos).toEqual([start.token]);
});

test('Missionswechsel setzt die Features zurück: Spuren aus A stehen nicht in B', async ({ browser }) => {
  const ctx = await neuerKontext(browser);
  const a = await neueMission(ctx.request, 'Übung A', 'lv');
  const b = await neueMission(ctx.request, 'Übung B', 'lv');
  const { page } = await geraet(
    browser,
    [
      { lageId: a.lageId, token: a.token, name: 'Übung A', rolle: 'leitung' },
      { lageId: b.lageId, token: b.token, name: 'Übung B', rolle: 'leitung' },
    ],
    a.token,
  );
  const spuren = async () => {
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Spuren', exact: true }).click();
    return page.locator('section.sheet');
  };
  await page.goto('/');
  await indieMission(page);
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  const inA = await spuren();
  await inA.getByRole('switch').first().check();
  await expect(inA.getByRole('button', { name: 'Keine', exact: true })).toBeEnabled();

  // A → B ohne Zwischenschritt über «keine Mission»
  await page.getByRole('button', { name: 'Menü', exact: true }).click();
  await panel(page).locator('.mission', { hasText: 'Übung B' }).click();
  await panel(page).getByRole('button', { name: 'Mission öffnen', exact: true }).click();
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
  const inB = await spuren();
  await expect(inB.getByRole('button', { name: 'Keine', exact: true })).toBeDisabled();
});
