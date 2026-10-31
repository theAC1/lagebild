// Ende-zu-Ende: Leitung (Adler, Bundeshaus) und Teilnehmer (Bravo, 1.1 km südlich) in einer Lage, gegen den echten Server.
// Bildschirm aus dem Projekt: läuft quer (Vorgabe) und hoch (@hoch).
import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { bedienung, dokuBild } from './hilfen.ts';

const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const BRAVO = { latitude: 46.9366, longitude: 7.4442 }; // ~1.11 km, Azimut 180° von Adler

test.describe.configure({ mode: 'serial' });

let leitung: Page;
let teilnehmer: Page;
let teilnehmerCode = '';

async function neueSeite(browser: Browser, geolocation: typeof ADLER): Promise<Page> {
  const ctx = await browser.newContext({ geolocation });
  await ctx.addInitScript(bedienung, 'klassisch'); // Layout v2; Daumen-Ränder siehe v3.e2e.ts
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw e;
  });
  return page;
}

async function beitreten(page: Page, rufname: string, einheit: string) {
  await page.getByLabel('Rufname').fill(rufname);
  await page.getByLabel('Einheit').fill(einheit);
  await page.getByRole('button', { name: 'Beitreten', exact: true }).click();
  await expect(page.locator('.verbindung.verbunden')).toBeVisible();
}

// Sheets/Toasts blenden ein → Animationen fertig laufen lassen, sonst halbtransparente Bilder
const bild = (page: Page, name: string) => dokuBild(page, name);

const werkzeug = (page: Page, label: string) => page.locator('nav.werkzeuge button.werkzeug', { hasText: label });
const sheet = (page: Page) => page.locator('section.sheet');
const schliesseSheet = (page: Page) => sheet(page).getByRole('button', { name: 'Schliessen', exact: true }).click();

/** Leitung: Phasenschild antippen, Ziel wählen, bestätigen (`foto`: Doku-Bild der Rückfrage). */
async function phaseWechseln(schild: string, knopf: string, foto?: string) {
  await leitung.getByRole('button', { name: new RegExp(`^${schild}`) }).click();
  await sheet(leitung).getByRole('button', { name: knopf, exact: true }).click();
  if (foto) await bild(leitung, foto);
  await sheet(leitung).getByRole('button', { name: 'Ja, wechseln', exact: true }).click();
}

async function leitungTab(tab: string) {
  if (!(await sheet(leitung).getByRole('tablist').isVisible().catch(() => false))) await werkzeug(leitung, 'Leitung').click();
  await sheet(leitung).getByRole('tab', { name: tab }).click();
}

test.beforeAll(async ({ browser }) => {
  leitung = await neueSeite(browser, ADLER);
  teilnehmer = await neueSeite(browser, BRAVO);
});

test.afterAll(async () => {
  await leitung?.context().close();
  await teilnehmer?.context().close();
});

test('Lage erstellen, beitreten, gegenseitig sehen @hoch', async () => {
  await leitung.goto('/');
  await expect(leitung.getByRole('button', { name: 'Neue Lage erstellen', exact: true })).toBeVisible();
  await bild(leitung, 'quer-login');
  await leitung.getByRole('button', { name: 'Neue Lage erstellen', exact: true }).click();
  await leitung.getByLabel('Name der Lage').fill('Übung Aare');
  await leitung.getByLabel('Erstell-Passwort').fill('e2e');
  await leitung.getByRole('button', { name: 'Lage erstellen', exact: true }).click();
  teilnehmerCode = (await leitung.locator('.code-box:not(.leitung) .code').textContent())!.trim();
  expect(teilnehmerCode).toMatch(/^[A-Z0-9]{8}$/);
  await bild(leitung, 'e2e-codes');
  await leitung.getByRole('button', { name: 'Weiter: als Leitung beitreten', exact: true }).click();
  await beitreten(leitung, 'Adler', 'KP');

  // Neue Lage beginnt in der Aktionsplanung: grauer Rahmen, Schild «AP», kein Status; die Leitung startet die Lageverfolgung
  await expect(leitung.locator('.phase-rahmen.ap')).toBeAttached();
  await expect(leitung.getByRole('button', { name: /^Eigener Status/ })).toHaveCount(0);
  await bild(leitung, 'e2e-phase-ap');
  await bild(leitung, 'quer-ap-phasenschild');
  await phaseWechseln('Phase: Aktionsplanung', 'Lageverfolgung starten (LV)', 'quer-phasenwechsel');
  await expect(leitung.locator('.phase-rahmen.lv')).toBeAttached();
  await expect(leitung.getByRole('button', { name: /^Eigener Status/ })).toBeVisible();
  await schliesseSheet(leitung);

  await teilnehmer.goto(`/?code=${teilnehmerCode}`);
  await expect(teilnehmer.getByLabel('Code')).toHaveValue(teilnehmerCode);
  await beitreten(teilnehmer, 'Bravo', 'Zug 1');

  // Karte: Symbol mit Rufname des jeweils anderen
  await expect(leitung.locator('.bft .bft-label', { hasText: 'Bravo' })).toBeVisible();
  await expect(teilnehmer.locator('.bft .bft-label', { hasText: 'Adler' })).toBeVisible();

  // Teilnehmerliste mit Distanz
  await leitung.getByRole('button', { name: 'Teilnehmende', exact: true }).click();
  await expect(sheet(leitung).locator('.zeile', { hasText: 'Bravo' })).toContainText('1.11 km');
  await expect(sheet(leitung).locator('.zeile', { hasText: 'Adler (ich)' })).toBeVisible();
  await bild(leitung, 'e2e-teilnehmerliste');
  await schliesseSheet(leitung);
  await teilnehmer.getByRole('button', { name: 'Teilnehmende', exact: true }).click();
  await expect(sheet(teilnehmer).locator('.zeile', { hasText: 'Adler' })).toBeVisible();
  await schliesseSheet(teilnehmer);

  // Leitung › Zugang kennt den Code aus dem Erstellen (QR)
  await werkzeug(leitung, 'Leitung').click();
  await expect(sheet(leitung).locator('.code', { hasText: teilnehmerCode })).toBeVisible();
  await expect(sheet(leitung).getByAltText(/QR-Code zum Beitreten/)).toBeVisible();
  await bild(leitung, 'e2e-leitung-zugang');
  await bild(leitung, 'quer-leitung-panel');
  await schliesseSheet(leitung);
  await bild(leitung, 'e2e-karte-leitung');
  await bild(leitung, 'quer-karte-leitung-klassisch');

  // Werkzeugleiste (hoch unten, quer rechts): lange Beschriftungen («Führungsraster», «Geländetaufe») bleiben im eigenen
  // Knopf und überlappen nicht; passt nicht alles, scrollt die Leiste
  const leiste = leitung.locator('nav.werkzeuge');
  const quer = (await leiste.evaluate((n) => getComputedStyle(n).flexDirection)) === 'column';
  if (!quer) expect(await leiste.evaluate((n) => n.scrollWidth > n.clientWidth && getComputedStyle(n).overflowX === 'auto')).toBe(true);
  const boxen = await leiste.locator('button.werkzeug:visible > span:not(.badge)').evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent, k: e.parentElement!.getBoundingClientRect().toJSON(), ...e.getBoundingClientRect().toJSON() })),
  );
  expect(boxen.length).toBeGreaterThan(8);
  for (const b of boxen) {
    expect(b.left, `${b.text} links im Knopf`).toBeGreaterThanOrEqual(b.k.left - 0.5);
    expect(b.right, `${b.text} rechts im Knopf`).toBeLessThanOrEqual(b.k.right + 0.5);
  }
  for (let i = 1; i < boxen.length; i++) {
    const [a, b] = [boxen[i - 1], boxen[i]];
    if (quer) expect(b.top, `${a.text} / ${b.text}`).toBeGreaterThanOrEqual(a.bottom);
    else expect(b.left, `${a.text} / ${b.text}`).toBeGreaterThanOrEqual(a.right);
  }

  // Einstellungen aus der Kopfzeile
  await leitung.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(sheet(leitung).getByRole('group', { name: 'Bedienung' })).toBeVisible();
  await bild(leitung, 'quer-einstellungen');
  await schliesseSheet(leitung);
});

test('Status wechseln und Status-Set der Leitung @hoch', async () => {
  await teilnehmer.getByRole('button', { name: /^Eigener Status/ }).click();
  await sheet(teilnehmer).getByText('+ Text').click(); // Freitext liegt eingeklappt
  await sheet(teilnehmer).getByLabel('Meldung an alle').fill('Brücke gesperrt');
  await sheet(teilnehmer).getByRole('group', { name: 'Status wählen' }).getByRole('button', { name: 'Halt', exact: true }).click();
  await expect(leitung.locator('.toast', { hasText: 'Bravo' })).toContainText('Halt');
  await expect(leitung.locator('.bft', { hasText: 'Bravo' })).toHaveAttribute('style', /--status:\s*#f9a825/);
  await expect(sheet(teilnehmer)).toHaveCount(0); // ein Tipp meldet und schliesst

  await leitungTab('Log');
  await expect(sheet(leitung).locator('.log li', { hasText: 'Bravo' }).first()).toContainText('Brücke gesperrt');

  await leitungTab('Status-Set');
  await sheet(leitung).getByLabel('Bezeichnung').first().fill('Bereitschaft');
  await sheet(leitung).getByRole('button', { name: 'Speichern', exact: true }).click();
  await schliesseSheet(leitung);

  await teilnehmer.getByRole('button', { name: /^Eigener Status/ }).click();
  await expect(sheet(teilnehmer).getByRole('group', { name: 'Status wählen' }).getByRole('button', { name: 'Bereitschaft', exact: true })).toBeVisible();
  await bild(teilnehmer, 'e2e-status');
  await schliesseSheet(teilnehmer);
});

test('Marker setzen; Teilnehmer darf Leitungs-Marker nicht löschen @hoch', async () => {
  await werkzeug(leitung, 'Marker').click();
  await sheet(leitung).getByRole('button', { name: '+ Marker setzen', exact: true }).click();
  await leitung.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await sheet(leitung).getByLabel('Bezeichnung').fill('Sperre Nord');
  await sheet(leitung).getByRole('button', { name: 'Marker setzen', exact: true }).click();
  await expect(leitung.locator('[aria-label="Marker Sperre Nord"]')).toBeVisible();

  await expect(teilnehmer.locator('[aria-label="Marker Sperre Nord"]')).toBeAttached();
  await werkzeug(teilnehmer, 'Marker').click();
  await sheet(teilnehmer).locator('button.zeile', { hasText: 'Sperre Nord' }).click();
  await expect(sheet(teilnehmer).getByText('Sperre Nord').first()).toBeVisible();
  await expect(sheet(teilnehmer).getByRole('button', { name: 'Löschen', exact: true })).toHaveCount(0);
  await expect(sheet(teilnehmer).getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
  await bild(teilnehmer, 'e2e-marker-detail');
  await schliesseSheet(teilnehmer);

  // Auch am UI vorbei lehnt der Server ab
  const antwort = await teilnehmer.evaluate(
    () =>
      new Promise<string>((ok) => {
        const ws = new WebSocket(`ws://${location.host}/ws`);
        ws.onopen = () => ws.send(JSON.stringify({ typ: 'hallo', token: localStorage.getItem('lagebild.token') }));
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.typ === 'snapshot') {
            const mk = m.marker.find((x: { bezeichnung: string }) => x.bezeichnung === 'Sperre Nord');
            ws.send(JSON.stringify({ typ: 'marker.loeschen', id: mk.id }));
          } else if (m.typ === 'fehler' || m.typ === 'marker.geloescht') {
            ws.close();
            ok(m.typ);
          }
        };
      }),
  );
  expect(antwort).toBe('fehler');
  await expect(leitung.locator('[aria-label="Marker Sperre Nord"]')).toBeVisible();
});

test('Chat an alle und direkt, Ungelesen-Zähler @hoch', async () => {
  await werkzeug(teilnehmer, 'Chat').click();
  const kanal = (name: string) => sheet(teilnehmer).locator('button.zeile').filter({ has: teilnehmer.locator('strong', { hasText: new RegExp(`^${name}$`) }) });
  await kanal('Alle').click();
  await sheet(teilnehmer).getByLabel('Nachricht').fill('Bravo an alle: Raum Marzili erreicht');
  await sheet(teilnehmer).getByLabel('Nachricht').press('Enter');
  await expect(werkzeug(leitung, 'Chat').locator('.badge')).toHaveText('1');

  await sheet(teilnehmer).getByRole('button', { name: 'Zurück zu den Kanälen', exact: true }).click();
  await kanal('Adler').click();
  await sheet(teilnehmer).getByLabel('Nachricht').fill('Nur für Adler');
  await sheet(teilnehmer).getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(werkzeug(leitung, 'Chat').locator('.badge')).toHaveText('2');
  await schliesseSheet(teilnehmer);

  await werkzeug(leitung, 'Chat').click();
  await bild(leitung, 'e2e-chat-kanaele');
  await sheet(leitung).locator('button.zeile').filter({ has: leitung.locator('strong', { hasText: /^Bravo$/ }) }).click();
  await expect(sheet(leitung).getByText('Nur für Adler')).toBeVisible();
  await bild(leitung, 'e2e-chat-direkt');
  await bild(leitung, 'quer-chat');
  await schliesseSheet(leitung);
  await expect(werkzeug(leitung, 'Chat').locator('.badge')).toHaveText('1');
});

test('Sichtung mit Foto @hoch', async () => {
  const jpeg = await teilnehmer.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 2000;
    c.height = 1500;
    const g = c.getContext('2d')!;
    g.fillStyle = '#4a6b3a';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#b33';
    g.fillRect(800, 600, 400, 300);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.9));
    let s = '';
    for (const x of new Uint8Array(await blob.arrayBuffer())) s += String.fromCharCode(x);
    return btoa(s);
  });

  await werkzeug(teilnehmer, 'Sichtung').click();
  await sheet(teilnehmer).getByRole('button', { name: 'Neue Sichtung melden', exact: true }).click();
  await sheet(teilnehmer)
    .locator('input[type=file]')
    .setInputFiles({ name: 'sichtung.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  await expect(sheet(teilnehmer).getByAltText('Vorschau der Sichtung')).toBeVisible();
  const chip = (gruppe: string, name: string) => sheet(teilnehmer).getByRole('group', { name: gruppe, exact: true }).getByRole('button', { name, exact: true });
  await chip('Grösse', 'Gruppe (~10)').click();
  await chip('Tätigkeit', 'bewegt sich').click();
  await chip('Richtung', 'N').click();
  await sheet(teilnehmer).getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(teilnehmer.locator('.toast', { hasText: 'Sichtung gemeldet' })).toBeVisible();
  await expect(sheet(teilnehmer)).toHaveCount(0);

  await werkzeug(leitung, 'Sichtung').click();
  await sheet(leitung).locator('li button', { hasText: 'bewegt sich Richtung N' }).click();
  const foto = sheet(leitung).getByAltText('Foto der Sichtung', { exact: true });
  await expect(foto).toBeVisible();
  await expect(foto).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => foto.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1600);
  await bild(leitung, 'e2e-sichtung-detail');
  await schliesseSheet(leitung);
});

test('Alarm auslösen, quittieren, aufheben @hoch', async () => {
  await teilnehmer.getByRole('button', { name: 'Alarm auslösen', exact: true }).click();
  await sheet(teilnehmer).locator('button.art', { hasText: 'Notfall' }).click();
  const knopf = sheet(teilnehmer).locator('button.halten');
  const box = (await knopf.boundingBox())!;
  await teilnehmer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await teilnehmer.mouse.down();
  await teilnehmer.waitForTimeout(2600);
  await teilnehmer.mouse.up();

  const banner = leitung.locator('.banner .alarm', { hasText: 'NOTFALL · Bravo' });
  await expect(banner).toBeVisible();
  await expect(leitung.locator('.alarm-ring.notfall')).toBeAttached();
  await bild(leitung, 'e2e-alarm');
  await banner.getByRole('button', { name: 'Quittieren', exact: true }).click();
  await expect(teilnehmer.locator('.banner .alarm', { hasText: 'DEIN ALARM' })).toContainText('1 quittiert');

  await banner.locator('button.text').click();
  await sheet(leitung).getByRole('button', { name: 'Aufheben …', exact: true }).click();
  await sheet(leitung).getByRole('button', { name: 'Wirklich aufheben', exact: true }).click();
  await expect(leitung.locator('.banner')).toHaveCount(0);
  await expect(teilnehmer.locator('.banner')).toHaveCount(0);
  if (await sheet(teilnehmer).isVisible()) await schliesseSheet(teilnehmer);
});

test('Range & Bearing zum Teilnehmer @hoch', async () => {
  await leitung.getByRole('button', { name: 'Teilnehmende', exact: true }).click();
  await sheet(leitung).locator('.zeile', { hasText: 'Bravo' }).click();
  await sheet(leitung).getByRole('button', { name: 'Range & Bearing', exact: true }).click();
  await expect(leitung.locator('.rb-label')).toContainText('1.11 km');
  await expect(leitung.locator('.rb-label')).toContainText('180°');
  await expect(sheet(leitung)).toContainText('1.11 km');
  await bild(leitung, 'e2e-rangebearing');
  await schliesseSheet(leitung);
});

test('Export GPX, Nachbearbeitung statt Beenden, zurück und löschen @hoch', async () => {
  await leitungTab('Export');
  const [download] = await Promise.all([leitung.waitForEvent('download'), sheet(leitung).getByRole('button', { name: /GPX herunterladen/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.gpx$/);
  const gpx = await readFile((await download.path())!, 'utf8');
  expect(gpx).toContain('<trk>');
  expect(gpx).toContain('<name>Bravo</name>');
  expect(gpx).toContain('Sperre Nord');
  await schliesseSheet(leitung);

  // LV → AN: niemand wird abgemeldet, alles schreibgeschützt, grüner Rahmen bei allen
  await phaseWechseln('Phase: Lageverfolgung', 'Nachbearbeitung starten (AN)');
  await expect(teilnehmer.locator('.phase-rahmen.an')).toBeAttached();
  await expect(teilnehmer.getByRole('status', { name: 'Phase: Aktionsnachbearbeitung' })).toBeVisible();
  await expect(teilnehmer.getByRole('button', { name: /^Eigener Status/ })).toHaveCount(0);
  await expect(teilnehmer.locator('.verbindung.verbunden')).toBeVisible();
  await teilnehmer.reload();
  await expect(teilnehmer.locator('.phase-rahmen.an')).toBeAttached();

  // Wiedergabe öffnet nur bei der Leitung von selbst; Teilnehmende tippen «Wiedergabe» in der Leiste.
  // Sie beginnt am Anfang der LV (Marker noch nicht gesetzt); ans Ende spulen zeigt ihn
  await expect(leitung.getByRole('region', { name: 'Wiedergabe' })).toBeVisible();
  const wiedergabe = teilnehmer.getByRole('region', { name: 'Wiedergabe' });
  await expect(wiedergabe).toHaveCount(0);
  await werkzeug(teilnehmer, 'Wiedergabe').click();
  const zeitpunkt = wiedergabe.getByRole('slider', { name: 'Zeitpunkt' });
  await expect(zeitpunkt).toBeVisible();
  const sperre = teilnehmer.getByRole('button', { name: 'Marker Sperre Nord' });
  await expect(sperre).toHaveCount(0);
  await zeitpunkt.fill(String(Math.floor(Number(await zeitpunkt.getAttribute('max')) / 1000) * 1000)); // Schritt 1 s
  await expect(sperre).toHaveCount(1);
  await wiedergabe.getByRole('button', { name: 'Voriges Ereignis' }).click();
  await wiedergabe.getByRole('button', { name: 'Abspielen' }).click();
  await expect(wiedergabe.getByRole('button', { name: 'Pause' })).toBeVisible();
  // die mitlaufende Ereignisliste schiebt die Knöpfe nicht aus dem Panel (quer nur gut 300 px hoch)
  await teilnehmer.waitForTimeout(1500);
  await expect(wiedergabe.getByRole('button', { name: /^(Pause|Abspielen)$/ })).toBeInViewport({ ratio: 1 });
  await bild(teilnehmer, 'e2e-phase-an');
  await bild(teilnehmer, 'quer-an-wiedergabe');

  // Ereignisliste: Zeile antippen springt hin; Export CSV und PDF für alle Mitglieder
  const liste = wiedergabe.getByRole('region', { name: 'Ereignisliste' });
  await expect(liste.getByRole('button', { name: /Marker gesetzt · Adler – Sperre Nord/ })).toBeVisible();
  await expect(liste.getByRole('button', { name: /Status · Bravo – Halt/ })).toBeVisible();
  const [csvDatei] = await Promise.all([teilnehmer.waitForEvent('download'), liste.getByRole('button', { name: 'CSV', exact: true }).click()]);
  expect(csvDatei.suggestedFilename()).toBe('ereignisse-uebung-aare.csv');
  const text = await readFile((await csvDatei.path())!, 'utf8');
  expect(text).toContain('Zeit;Rufname;Einheit;Ereignis;Details;Koordinate;Rasterzelle');
  expect(text).toMatch(/;Adler;KP;Marker gesetzt;Sperre Nord;2'\d{3}'\d{3}\.?\d* \/ 1'\d{3}'\d{3}/);
  const [pdfDatei] = await Promise.all([teilnehmer.waitForEvent('download'), liste.getByRole('button', { name: 'PDF', exact: true }).click()]);
  expect((await readFile((await pdfDatei.path())!)).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  await liste.getByRole('button', { name: /Marker gesetzt · Adler – Sperre Nord/ }).click();
  await expect(sperre).toHaveCount(1);

  // Schliessen: Live-Stand zurück
  await zeitpunkt.fill('0');
  await expect(sperre).toHaveCount(0);
  await schliesseSheet(teilnehmer);
  await expect(sperre).toHaveCount(1);

  // AN → LV und wieder zurück, jeweils mit Bestätigung
  await phaseWechseln('Phase: Aktionsnachbearbeitung', 'Zurück in die Lageverfolgung (LV)');
  await expect(teilnehmer.locator('.phase-rahmen.lv')).toBeAttached();
  await expect(teilnehmer.getByRole('button', { name: /^Eigener Status/ })).toBeVisible();
  await phaseWechseln('Phase: Lageverfolgung', 'Nachbearbeitung starten (AN)');
  await expect(teilnehmer.locator('.phase-rahmen.an')).toBeAttached();
  await werkzeug(teilnehmer, 'Wiedergabe').click();

  // Debriefing-Notiz der Leitung am Zeitpunkt: alle sehen sie in der Liste; nur die Leitung löscht
  const wgLeitung = leitung.getByRole('region', { name: 'Wiedergabe' });
  await wgLeitung.getByRole('button', { name: /^\+ Notiz bei/ }).click();
  await wgLeitung.getByLabel('Notiz').fill('Funkdisziplin besprechen');
  await wgLeitung.getByRole('button', { name: 'Notiz speichern', exact: true }).click();
  const notizZeile = teilnehmer.getByRole('region', { name: 'Ereignisliste' }).getByRole('button', { name: /Notiz · Adler – Funkdisziplin besprechen/ });
  await expect(notizZeile).toBeVisible();
  await expect(teilnehmer.getByRole('button', { name: 'Notiz löschen' })).toHaveCount(0);
  leitung.once('dialog', (d) => d.accept());
  await wgLeitung.getByRole('button', { name: 'Notiz löschen' }).click();
  await expect(notizZeile).toHaveCount(0);

  // Löschen bleibt bei der Leitung (Phasenschild → Leitung › Lage, auch über der offenen Wiedergabe): beide landen im Login
  await leitung.getByRole('button', { name: /^Phase: Aktionsnachbearbeitung/ }).click();
  await sheet(leitung).getByPlaceholder('Name der Lage').fill('Übung Aare');
  await sheet(leitung).getByRole('button', { name: 'Endgültig löschen', exact: true }).click();
  await expect(leitung.getByRole('button', { name: 'Lage beitreten', exact: true })).toBeVisible();
  await expect(teilnehmer.getByRole('button', { name: 'Lage beitreten', exact: true })).toBeVisible();
  await expect(teilnehmer.locator('.toast', { hasText: 'gelöscht' })).toBeVisible();

  // Code ist danach ungültig (Lage gelöscht)
  await teilnehmer.getByLabel('Code').fill(teilnehmerCode);
  await teilnehmer.getByLabel('Rufname').fill('Charlie');
  await teilnehmer.getByLabel('Einheit').fill('Zug 1');
  await teilnehmer.getByRole('button', { name: 'Beitreten', exact: true }).click();
  await expect(teilnehmer.getByRole('alert')).toContainText('Code ungültig');
});
