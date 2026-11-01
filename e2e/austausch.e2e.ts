// Spec v8: Ebenen aus MilX importieren (Vorschau → Ebene auf der Karte) und als KML/MilX exportieren, quer am Handy;
// Ebenen schalten und exportieren auch als Beobachter unter «Karte und Ebenen» (Juan 01.11.).
// Datei erfunden (Namen, Orte bei Bern); nur die Struktur folgt einer echten MilX-Datei.
import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { entpackeEine, packe } from '../client/src/features/zeichnen/austausch/zip.ts';
import { bedienung, beitreten, dokuBild, indieMission, neueMission } from './hilfen.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const grafik = (symbol: string, pts: [number, number][]) =>
  `<MilXGraphic><MssStringXML>${esc(symbol)}</MssStringXML><PointList>${pts.map(([x, y]) => `<Point><X>${x}</X><Y>${y}</Y></Point>`).join('')}</PointList></MilXGraphic>`;
const MILX = `﻿<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<MilXDocument_Layer xmlns="http://gs-soft.com/MilX/V3.1"><MilXLayer><Name>Planung</Name><LayerType>Normal</LayerType><GraphicList>${[
  grafik('<Symbol ID="GFGPGLP--------"><Attribute ID="T">ALPHA</Attribute></Symbol>', [[600000, 199900], [600700, 199950]]),
  grafik('<Symbol ID="GFGPGLB----C---"><Attribute ID="T">LINKS</Attribute><Attribute ID="T1">RECHTS</Attribute></Symbol>', [[600100, 199500], [600400, 199600], [600700, 199550]]),
  grafik('<Symbol ID="GFGPGLB----D---"><Attribute ID="T">NORD</Attribute><Attribute ID="T1">SÜD</Attribute></Symbol>', [[600400, 199950], [600420, 199300]]),
  grafik('<Symbol ID="G.9.AP---------"><Attribute ID="XM"><Line Width="20" Color="$00000000"/><Fill Color="$9640A0C0" Transparency="59" /></Attribute></Symbol>', [[600150, 199580], [600650, 199620], [600650, 199300], [600150, 199300], [600150, 199580]]),
  grafik('<Symbol ID="SFGPUCI--------"><Attribute ID="T">KP</Attribute></Symbol>', [[600300, 199400]]),
].join('')}</GraphicList><CoordSystemType>SwissLv03</CoordSystemType><SymbolSize>33</SymbolSize></MilXLayer></MilXDocument_Layer>`;

const GEO = { latitude: 46.94838, longitude: 7.44257 }; // LV03 600300 / 199700, neben der Mitte der Zeichen

/** Leitung in einer neuen Mission (quer, klassisch). */
async function leitungIn(browser: Browser, name: string) {
  const ctx = await browser.newContext({ geolocation: GEO });
  const lage = await neueMission(ctx.request, name, 'lv');
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), lage.token);
  await ctx.addInitScript(bedienung, 'klassisch');
  const p = await ctx.newPage();
  p.on('pageerror', (e) => {
    throw e;
  });
  await p.goto('/');
  await indieMission(p);
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  return { ctx, lage, p };
}

/** Zeichnen-Panel auf, MILX wählen, Vorschau abwarten. */
async function waehleMilx(p: Page) {
  await p.locator('nav.werkzeuge button.werkzeug', { hasText: 'Zeichnen' }).click();
  const panel = p.getByRole('region', { name: 'Zeichnen' });
  const datei = await packe([{ name: 'Layer.milxly', daten: new TextEncoder().encode(MILX) }]);
  const [wahl] = await Promise.all([p.waitForEvent('filechooser'), panel.getByRole('button', { name: 'Importieren …' }).click()]);
  await wahl.setFiles({ name: 'uebung.milxlyz', mimeType: 'application/octet-stream', buffer: Buffer.from(datei) });
  const vorschau = panel.getByRole('region', { name: 'Import-Vorschau' });
  await expect(vorschau).toContainText('Planung');
  return { panel, vorschau };
}

test('Import MilX → Vorschau → Ebene sichtbar → Export KML und MilX (quer)', async ({ browser }) => {
  const { ctx, p } = await leitungIn(browser, 'Austausch');
  const { panel, vorschau } = await waehleMilx(p);
  await expect(vorschau).toContainText('1 × Phasenlinie · 2 × Grenze · 1 × Fläche');
  await expect(vorschau).toContainText('Nicht abbildbar: 1 × SFGPUCI-------- «KP»');
  await dokuBild(p, 'v8-import-vorschau');
  await vorschau.getByRole('button', { name: 'Importieren' }).click();

  // Ebene da, gesperrt (Leitung), mit vier Zeichnungen; Karte zeigt die Grenzen mit beiden Namen (Verbandszeichen: Unit-Test, Bild)
  const ebene = panel.locator('li.ebene', { hasText: 'Planung' });
  await expect(ebene.locator('.zahl')).toHaveText('4');
  await expect(ebene.getByLabel('gesperrt')).toBeVisible();
  for (const t of ['PL ALPHA', 'LINKS', 'RECHTS', 'NORD', 'SÜD']) await expect(p.locator('.zn-label', { hasText: t }).first()).toBeVisible();
  await dokuBild(p, 'v8-import-ebene');

  // Export: Vorgabe alle sichtbaren Ebenen; nur «Planung» → eine KML-Datei mit dem Originalcode
  await panel.getByRole('button', { name: 'Exportieren …' }).click();
  const exp = panel.getByRole('region', { name: 'Export' });
  await expect(exp.getByRole('checkbox')).toHaveCount(2);
  await exp.getByRole('checkbox', { name: 'Allgemein' }).uncheck();
  await dokuBild(p, 'v8-export');
  const [kml] = await Promise.all([p.waitForEvent('download'), exp.getByRole('button', { name: 'KML' }).click()]);
  expect(kml.suggestedFilename()).toBe('Planung.kml');
  const text = await readFile((await kml.path())!, 'utf8');
  expect(text).toContain('&lt;Symbol ID=&quot;GFGPGLB----C---&quot;&gt;');
  expect(text.match(/<Placemark>/g)).toHaveLength(4);

  await panel.getByRole('button', { name: 'Exportieren …' }).click();
  await panel.getByRole('region', { name: 'Export' }).getByRole('checkbox', { name: 'Allgemein' }).uncheck();
  const [milx] = await Promise.all([p.waitForEvent('download'), panel.getByRole('button', { name: 'MilX' }).click()]);
  expect(milx.suggestedFilename()).toBe('austausch.milxlyz');
  const inhalt = new TextDecoder().decode(await entpackeEine(new Uint8Array(await readFile((await milx.path())!)), '.milxly', 1e6));
  expect(inhalt).toContain('<Name>Planung</Name>');
  // Code aus der Whitelist neu aufgebaut: Werte wie im Original
  expect(inhalt).toContain(esc('<Fill Color="$9640A0C0" Transparency="59"/></Attribute></Symbol>').replaceAll('"', '&quot;'));
  await panel.getByRole('button', { name: 'Schliessen' }).click();
  await p.getByRole('button', { name: 'Eigener Position folgen' }).click(); // Zoom 16
  await p.waitForTimeout(2500); // easeTo, Kacheln, Toast weg
  await dokuBild(p, 'v8-grenze-quer');
  await ctx.close();
});

test('Beobachter auf Juans Handy: Ebenen unter «Karte und Ebenen» schalten und exportieren, importierte Ebene erscheint sofort', async ({ browser }) => {
  const { ctx, lage, p } = await leitungIn(browser, 'Beobachtung');
  const bctx = await browser.newContext({ viewport: { width: 891, height: 411 }, deviceScaleFactor: 3.5, hasTouch: true, isMobile: true, geolocation: GEO });
  const { token } = await beitreten(bctx.request, lage.beobachterCode, { rufname: 'Echo' });
  await bctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  await bctx.addInitScript(bedienung, 'klassisch');
  await bctx.addInitScript(() => localStorage.setItem('lagebild.einstellungen', JSON.stringify({ ...JSON.parse(localStorage.getItem('lagebild.einstellungen') ?? '{}'), groesse: 'klein' })));
  const b = await bctx.newPage();
  b.on('pageerror', (e) => {
    throw e;
  });
  await b.goto('/');
  await indieMission(b);
  await expect(b.locator('.verbindung.verbunden')).toBeVisible();
  await expect(b.locator('nav.werkzeuge button.werkzeug', { hasText: 'Zeichnen' })).toHaveCount(0); // kein Zeichnen-Panel
  await b.getByRole('button', { name: 'Eigener Position folgen' }).click();
  await b.getByRole('button', { name: 'Karte und Ebenen wählen' }).click();
  const menue = b.getByRole('group', { name: 'Karte' });
  const schalter = (name: string) => menue.getByRole('button', { name, exact: true });
  await expect(schalter('Allgemein')).toHaveAttribute('aria-pressed', 'true');

  // Leitung importiert: die neue Ebene erscheint beim Beobachter ohne Neuladen (Delta)
  const { vorschau } = await waehleMilx(p);
  await vorschau.getByRole('button', { name: 'Importieren' }).click();
  await expect(schalter('Planung')).toHaveAttribute('aria-pressed', 'true');
  await expect(b.locator('.zn-label', { hasText: 'PL ALPHA' }).first()).toBeAttached();
  await menue.getByRole('button', { name: 'Exportieren …' }).scrollIntoViewIfNeeded();
  await dokuBild(b, 'v8-ebenen-beobachter');
  await schalter('Planung').click(); // nur auf diesem Gerät aus
  await expect(schalter('Planung')).toHaveAttribute('aria-pressed', 'false');
  await expect(b.locator('.zn-label', { hasText: 'PL ALPHA' })).toHaveCount(0);
  await expect(p.locator('.zn-label', { hasText: 'PL ALPHA' }).first()).toBeAttached();
  await schalter('Planung').click();

  // Export auch für Beobachter: nur «Planung» als KML
  await menue.getByRole('button', { name: 'Exportieren …' }).click();
  const exp = menue.getByRole('region', { name: 'Export' });
  await exp.getByRole('checkbox', { name: 'Allgemein' }).uncheck();
  const [kml] = await Promise.all([b.waitForEvent('download'), exp.getByRole('button', { name: 'KML' }).click()]);
  expect(kml.suggestedFilename()).toBe('Planung.kml');
  await expect(menue.getByRole('button', { name: 'Importieren …' })).toHaveCount(0); // Import nur Leitung und Gruppenführer

  await b.getByRole('button', { name: 'Karte und Ebenen wählen' }).click(); // zu
  await expect(b.locator('.zn-label', { hasText: 'NORD' }).first()).toBeVisible();
  await b.waitForTimeout(2500); // Kacheln, Toast weg
  await dokuBild(b, 'v8-grenze-juan');
  await bctx.close();
  await ctx.close();
});
