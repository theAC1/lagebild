// Spec v8: Ebenen aus MilX importieren (Vorschau → Ebene auf der Karte) und als KML/MilX exportieren, quer am Handy.
// Datei erfunden (Namen, Orte bei Bern); nur die Struktur folgt einer echten MilX-Datei.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { entpackeEine, packe } from '../client/src/features/zeichnen/austausch/zip.ts';
import { bedienung, dokuBild, indieMission, neueMission } from './hilfen.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const grafik = (symbol: string, pts: [number, number][]) =>
  `<MilXGraphic><MssStringXML>${esc(symbol)}</MssStringXML><PointList>${pts.map(([x, y]) => `<Point><X>${x}</X><Y>${y}</Y></Point>`).join('')}</PointList></MilXGraphic>`;
const MILX = `﻿<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<MilXDocument_Layer xmlns="http://gs-soft.com/MilX/V3.1"><MilXLayer><Name>Planung</Name><LayerType>Normal</LayerType><GraphicList>${[
  grafik('<Symbol ID="GFGPGLP--------"><Attribute ID="T">ALPHA</Attribute></Symbol>', [[600000, 199900], [600700, 199950]]),
  grafik('<Symbol ID="GFGPGLB----C---"><Attribute ID="T">LINKS</Attribute><Attribute ID="T1">RECHTS</Attribute></Symbol>', [[600100, 199500], [600400, 199600], [600700, 199550]]),
  grafik('<Symbol ID="G.9.AP---------"><Attribute ID="XM"><Line Width="20" Color="$00000000"/><Fill Color="$9640A0C0" Transparency="59" /></Attribute></Symbol>', [[600150, 199580], [600650, 199620], [600650, 199300], [600150, 199300], [600150, 199580]]),
  grafik('<Symbol ID="SFGPUCI--------"><Attribute ID="T">KP</Attribute></Symbol>', [[600300, 199400]]),
].join('')}</GraphicList><CoordSystemType>SwissLv03</CoordSystemType><SymbolSize>33</SymbolSize></MilXLayer></MilXDocument_Layer>`;

test('Import MilX → Vorschau → Ebene sichtbar → Export KML und MilX (quer)', async ({ browser }) => {
  const ctx = await browser.newContext({ geolocation: { latitude: 46.9466, longitude: 7.4442 } });
  const lage = await neueMission(ctx.request, 'Austausch', 'lv');
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), lage.token);
  await ctx.addInitScript(bedienung, 'klassisch');
  const p = await ctx.newPage();
  p.on('pageerror', (e) => {
    throw e;
  });
  await p.goto('/');
  await indieMission(p);
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();

  await p.locator('nav.werkzeuge button.werkzeug', { hasText: 'Zeichnen' }).click();
  const panel = p.getByRole('region', { name: 'Zeichnen' });
  const datei = await packe([{ name: 'Layer.milxly', daten: new TextEncoder().encode(MILX) }]);
  const [wahl] = await Promise.all([p.waitForEvent('filechooser'), panel.getByRole('button', { name: 'Importieren …' }).click()]);
  await wahl.setFiles({ name: 'uebung.milxlyz', mimeType: 'application/octet-stream', buffer: Buffer.from(datei) });

  const vorschau = panel.getByRole('region', { name: 'Import-Vorschau' });
  await expect(vorschau).toContainText('Planung');
  await expect(vorschau).toContainText('1 × Phasenlinie · 1 × Grenze · 1 × Fläche');
  await expect(vorschau).toContainText('Nicht abbildbar: 1 × SFGPUCI-------- «KP»');
  await dokuBild(p, 'v8-import-vorschau');
  await vorschau.getByRole('button', { name: 'Importieren' }).click();

  // Ebene da, gesperrt (Leitung), mit drei Zeichnungen; Karte zeigt Grenze mit Stufe und beiden Namen
  const ebene = panel.locator('li.ebene', { hasText: 'Planung' });
  await expect(ebene.locator('.zahl')).toHaveText('3');
  await expect(ebene.getByLabel('gesperrt')).toBeVisible();
  for (const t of ['PL ALPHA', '●●', 'LINKS', 'RECHTS']) await expect(p.locator('.zn-label', { hasText: t }).first()).toBeVisible();
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
  expect(text.match(/<Placemark>/g)).toHaveLength(3);

  await panel.getByRole('button', { name: 'Exportieren …' }).click();
  await panel.getByRole('region', { name: 'Export' }).getByRole('checkbox', { name: 'Allgemein' }).uncheck();
  const [milx] = await Promise.all([p.waitForEvent('download'), panel.getByRole('button', { name: 'MilX' }).click()]);
  expect(milx.suggestedFilename()).toBe('austausch.milxlyz');
  const inhalt = new TextDecoder().decode(await entpackeEine(new Uint8Array(await readFile((await milx.path())!)), '.milxly', 1e6));
  expect(inhalt).toContain('<Name>Planung</Name>');
  // Originalcode unverändert (auch das Leerzeichen vor «/>»)
  expect(inhalt).toContain(esc('<Fill Color="$9640A0C0" Transparency="59" /></Attribute></Symbol>').replaceAll('"', '&quot;'));
  await ctx.close();
});
