// Layout quer (@layout, 31.10.: «die Hauptnutzung (98 %) wird in landscape genutzt»): beide Bedienungen (Klassisch,
// Daumen-Ränder) × Leitung und Teilnehmer × Phasen AP, LV und AN mit offener Wiedergabe. Je Ansicht: alle sichtbaren
// Knöpfe ganz im Bild, nicht verdeckt, ohne Überlappung, ≥ 44 px Trefffläche, Beschriftung nicht abgeschnitten; die Karte
// behält eine nutzbare Fläche. Bildschirm aus dem Projekt (quer 851×393, quer-gross 780×360).
import { expect, test, type Browser, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import { bedienung } from './hilfen.ts';

const PORT = Number(process.env.PW_PORT ?? 8797);
const ADLER = { latitude: 46.9466, longitude: 7.4442 };
const NAH = { latitude: 46.9476, longitude: 7.4462 };
const SIDC = '10031000001211000000';
/** Freie Karte: Anteil der Bildschirmfläche, unter dem nur Karte liegt (ohne bzw. mit offenem Panel). */
const KARTE_MIN = { ohnePanel: 0.5, mitPanel: 0.3 };

test.describe.configure({ mode: 'serial' });
test.describe.configure({ timeout: 120_000 });

type Ansicht = { name: string; bed: 'klassisch' | 'daumen'; p: Page };
const ansichten: Ansicht[] = [];
let leitungToken = '';

async function seite(browser: Browser, code: string, rufname: string, bed: Ansicht['bed'], geolocation: typeof ADLER) {
  const ctx = await browser.newContext({ geolocation });
  await ctx.clock.install({ time: new Date('2026-10-29T22:00:00+01:00') });
  const r = await ctx.request.post('/api/beitreten', { data: { code, rufname, einheit: 'Zug 1', funktion: '', sidc: SIDC } });
  expect(r.status()).toBe(201);
  const { token } = await r.json();
  await ctx.addInitScript((t) => localStorage.setItem('lagebild.token', t), token);
  await ctx.addInitScript(bedienung, bed);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => {
    throw e;
  });
  await p.goto('/');
  await expect(p.locator('.verbindung.verbunden')).toBeVisible();
  return { p, token: token as string };
}

/** Phase per WebSocket der Leitung wechseln (niemand in den Seiten «wechselt», die Wiedergabe öffnet nirgends selbst). */
function phase(ziel: 'lv' | 'an'): Promise<void> {
  return new Promise((ok, nok) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    ws.on('error', nok);
    ws.on('open', () => ws.send(JSON.stringify({ typ: 'hallo', token: leitungToken })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.typ === 'snapshot') ws.send(JSON.stringify({ typ: 'lage.phase', phase: ziel }));
      else if (m.typ === 'fehler') nok(new Error(m.meldung));
      else if (m.typ === 'lage' && m.lage.phasen.at(-1)?.phase === ziel) (ws.close(), ok());
    });
  });
}

type Befund = { knoepfe: number; fehler: string[]; karte: number };

/** Misst im Browser: Knöpfe (im Bild, nicht verdeckt, keine Überlappung, ≥ 44 px, Text ganz) und freie Kartenfläche. */
function messe(): Befund {
  const vw = innerWidth;
  const vh = innerHeight;
  type R = { l: number; t: number; r: number; b: number };
  const schnitt = (a: R, b: R): R => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const leer = (a: R) => a.r - a.l < 1 || a.b - a.t < 1;
  const rect = (e: Element | Range): R => {
    const b = e.getBoundingClientRect();
    return { l: b.left, t: b.top, r: b.right, b: b.bottom };
  };
  const name = (e: Element) => (e.getAttribute('aria-label') || e.textContent || e.className).trim().replace(/\s+/g, ' ').slice(0, 40);
  const fehler: string[] = [];
  const knoepfe: { el: Element; n: string; sicht: R }[] = [];
  for (const el of document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="tab"], a[href]')) {
    // Kartenobjekte (Symbole, Rufnamen) und der Quellennachweis der Karte sind keine Bedienknöpfe
    if (el.closest('.maplibregl-marker, .maplibregl-ctrl-attrib')) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const r = rect(el);
    if (leer(r)) continue;
    // sichtbarer Ausschnitt: geschnitten mit allen abschneidenden (scrollenden) Vorfahren; ganz weggescrollt = nicht sichtbar
    let sicht = r;
    let imScroller = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const scrollt = a.scrollHeight > a.clientHeight + 1 || a.scrollWidth > a.clientWidth + 1;
        if (scrollt) {
          imScroller = true;
          const c = rect(a);
          if (c.l < -0.5 || c.t < -0.5 || c.r > vw + 0.5 || c.b > vh + 0.5) fehler.push(`Scrollbereich um «${name(el)}» ragt aus dem Bild`);
        }
        sicht = schnitt(sicht, rect(a));
      }
    }
    if (leer(sicht)) continue;
    const n = name(el);
    if (!imScroller && (r.l < -0.5 || r.t < -0.5 || r.r > vw + 0.5 || r.b > vh + 0.5)) fehler.push(`«${n}» ragt aus dem Bild (${Math.round(r.l)},${Math.round(r.t)}–${Math.round(r.r)},${Math.round(r.b)})`);
    if (Math.min(r.r - r.l, r.b - r.t) < 44 - 0.5) fehler.push(`«${n}» Trefffläche ${Math.round(r.r - r.l)}×${Math.round(r.b - r.t)} < 44`);
    // Beschriftung: jeder Text liegt ganz im Knopf und in jedem abschneidenden Kind (Ellipse, overflow: hidden)
    const gang = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = gang.nextNode(); t; t = gang.nextNode()) {
      if (!t.textContent?.trim()) continue;
      const bereich = document.createRange();
      bereich.selectNodeContents(t);
      const tr = rect(bereich);
      if (leer(tr)) continue;
      for (let a = t.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (a === el || s.overflowX !== 'visible' || s.textOverflow !== 'clip') {
          const ar = rect(a);
          if (tr.l < ar.l - 1 || tr.r > ar.r + 1 || tr.t < ar.t - 1 || tr.b > ar.b + 1) {
            fehler.push(`«${n}» Text «${t.textContent.trim().slice(0, 20)}» abgeschnitten (${Math.round(tr.r - tr.l)}×${Math.round(tr.b - tr.t)} in ${Math.round(ar.r - ar.l)}×${Math.round(ar.b - ar.t)})`);
            break;
          }
        }
        if (a === el) break;
      }
    }
    // nicht verdeckt: in der Mitte des sichtbaren Teils liegt der Knopf selbst
    const oben = document.elementFromPoint((sicht.l + sicht.r) / 2, (sicht.t + sicht.b) / 2);
    if (oben && !el.contains(oben) && !oben.contains(el)) fehler.push(`«${n}» verdeckt von ${oben.tagName.toLowerCase()}.${[...oben.classList].join('.')}`);
    knoepfe.push({ el, n, sicht });
  }
  for (const [i, a] of knoepfe.entries())
    for (const b of knoepfe.slice(i + 1)) {
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const s = schnitt(a.sicht, b.sicht);
      if (s.r - s.l > 1 && s.b - s.t > 1) fehler.push(`«${a.n}» überlappt «${b.n}» (${[a.sicht, b.sicht].map((q) => [q.l, q.t, q.r, q.b].map(Math.round).join(",")).join(" / ")})`);
    }
  // freie Karte: Raster von Stichproben, Treffer = Karte (Zeichenfläche oder Symbole darauf)
  let frei = 0;
  let alle = 0;
  for (let x = 0.5; x < 32; x++)
    for (let y = 0.5; y < 16; y++) {
      alle++;
      const e = document.elementFromPoint((x / 32) * vw, (y / 16) * vh);
      if (e?.closest('.maplibregl-canvas-container, .maplibregl-marker')) frei++;
    }
  return { knoepfe: knoepfe.length, fehler, karte: frei / alle };
}

async function pruefe(a: Ansicht, phase: string, mitPanel: boolean) {
  const p = a.p;
  // Einblend-Animationen (Panels, Toasts) fertig, sonst misst man verschobene Boxen
  await p.evaluate(() => Promise.all(document.getAnimations().map((x) => x.finished)));
  await p.waitForTimeout(300);
  const b = await p.evaluate(messe);
  const wo = `${a.name} ${phase}`;
  expect(b.knoepfe, `${wo}: Knöpfe gefunden`).toBeGreaterThan(4);
  expect(b.fehler, wo).toEqual([]);
  expect(b.karte, `${wo}: freie Kartenfläche`).toBeGreaterThanOrEqual(mitPanel ? KARTE_MIN.mitPanel : KARTE_MIN.ohnePanel);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const r = await ctx.request.post('/api/lage', { data: { name: 'Übung Aare Querformat', erstellPasswort: 'e2e', phase: 'ap' } });
  const codes = await r.json();
  await ctx.close();
  for (const bed of ['klassisch', 'daumen'] as const) {
    const l = await seite(browser, codes.leitungCode, `Adler ${bed}`, bed, ADLER);
    leitungToken = l.token;
    ansichten.push({ name: `${bed} Leitung`, bed, p: l.p });
    ansichten.push({ name: `${bed} Teilnehmer`, bed, p: (await seite(browser, codes.teilnehmerCode, `Bravo ${bed}`, bed, NAH)).p });
  }
});

test.afterAll(async () => {
  for (const a of ansichten) await a.p.context().close();
});

test('AP: Phasenschild, alle Knöpfe bedienbar, Karte frei @layout', async () => {
  for (const a of ansichten) {
    await expect(a.p.locator('.phase-rahmen.ap')).toBeAttached();
    await pruefe(a, 'AP', false);
  }
});

test('LV: Hauptansicht ohne Panel @layout', async () => {
  await phase('lv');
  for (const a of ansichten) {
    await expect(a.p.locator('.phase-rahmen.lv')).toBeAttached();
    await pruefe(a, 'LV', false);
  }
});

test('LV: Status-Panel offen, Karte bleibt nutzbar @layout', async () => {
  for (const a of ansichten) {
    await a.p.getByRole('button', { name: /^Eigener Status/ }).click();
    await expect(a.p.getByRole('region', { name: 'Status' })).toBeVisible();
    await pruefe(a, 'LV Status', true);
    await a.p.keyboard.press('Escape');
    await expect(a.p.locator('section.sheet')).toHaveCount(0);
  }
});

test('AN: Wiedergabe offen mit Ereignisliste @layout', async () => {
  await phase('an');
  for (const a of ansichten) {
    await expect(a.p.locator('.phase-rahmen.an')).toBeAttached();
    await pruefe(a, 'AN', false);
    await a.p.getByRole('button', { name: 'Wiedergabe', exact: true }).first().click();
    const wg = a.p.getByRole('region', { name: 'Wiedergabe' });
    const zeitpunkt = wg.getByRole('slider', { name: 'Zeitpunkt' });
    await expect(zeitpunkt).toBeVisible();
    await pruefe(a, 'AN Wiedergabe', true);
    // Mitlauf ans Ende der Liste: Uhrzeit, Schieber und Knöpfe bleiben als Kopf ganz im Panel, darunter noch ≥ 2 Listenzeilen
    await zeitpunkt.fill(String(Math.floor(Number(await zeitpunkt.getAttribute('max')) / 1000) * 1000));
    await wg.getByRole('button', { name: 'Voriges Ereignis' }).click();
    await wg.getByRole('button', { name: 'Abspielen' }).click();
    await a.p.waitForTimeout(1500);
    await expect(wg.locator('.liste [aria-current="true"]')).toBeAttached();
    const m = await wg.evaluate((w) => {
      const r = (s: string) => w.querySelector(s)!.getBoundingClientRect();
      const panel = r('.inhalt');
      const rumpf = (w.querySelector('.rumpf') ?? w.querySelector('.inhalt'))!.getBoundingClientRect(); // Scrollbereich der Liste
      return {
        panel: { t: panel.top, b: panel.bottom },
        teile: [r('.zeit strong'), r('[aria-label="Zeitpunkt"]'), r('.spiel')].map((x) => ({ t: x.top, b: x.bottom })),
        frei: rumpf.bottom - Math.max(rumpf.top, r('.leiste').bottom),
        zeile: parseFloat(getComputedStyle(w.querySelector('.liste .zeile')!).minHeight),
      };
    });
    for (const [i, t] of m.teile.entries()) {
      expect(t.t, `${a.name}: Kopfteil ${i} oben im Panel`).toBeGreaterThanOrEqual(m.panel.t - 0.5);
      expect(t.b, `${a.name}: Kopfteil ${i} unten im Panel`).toBeLessThanOrEqual(m.panel.b + 0.5);
    }
    expect(m.frei, `${a.name}: Liste zeigt ≥ 2 Zeilen`).toBeGreaterThanOrEqual(2 * m.zeile);
    const pause = wg.getByRole('button', { name: 'Pause' });
    if (await pause.isVisible()) await pause.click(); // am Ende hält die Wiedergabe von selbst
    await pruefe(a, 'AN Wiedergabe Mitlauf', true);
  }
});

/** Taufmodus-Leiste: Hinweis nie abgeschnitten (kein Ellipsis/Überlauf), Leiste im Bild und höchstens ein Viertel hoch. */
async function pruefeTaufleiste(a: Ansicht, zustand: string) {
  const wo = `${a.name} Taufmodus ${zustand}`;
  await a.p.waitForTimeout(300);
  const m = await a.p.evaluate(() => {
    const leiste = document.querySelector('.tf-modus')!.getBoundingClientRect();
    const abgeschnitten = [...document.querySelectorAll('.tf-modus .text > *')]
      .filter((e) => e.checkVisibility())
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || getComputedStyle(e).textOverflow === 'ellipsis')
      .map((e) => e.textContent);
    return { abgeschnitten, l: leiste.left, r: leiste.right, t: leiste.top, b: leiste.bottom, h: leiste.height, vw: innerWidth, vh: innerHeight };
  });
  expect(m.abgeschnitten, `${wo}: Text abgeschnitten`).toEqual([]);
  expect(m.l, wo).toBeGreaterThanOrEqual(0);
  expect(m.r, wo).toBeLessThanOrEqual(m.vw);
  expect(m.b, wo).toBeLessThanOrEqual(m.vh);
  expect(m.h, `${wo}: Leiste zu hoch`).toBeLessThanOrEqual(m.vh * 0.3);
  const b = await a.p.evaluate(messe);
  expect(b.fehler, wo).toEqual([]);
}

test('Taufmodus: Leiste lesbar, Knöpfe ganz sichtbar @layout', async () => {
  await phase('lv');
  for (const a of ansichten) {
    const p = a.p;
    if (a.bed === 'daumen') {
      await p.getByRole('button', { name: 'Mehr', exact: true }).click();
      await p.getByRole('menuitem', { name: 'Geländetaufe' }).click();
    } else await p.getByRole('button', { name: 'Geländetaufe', exact: true }).click();
    await p.getByRole('button', { name: 'Taufmodus starten', exact: true }).click();
    await pruefeTaufleiste(a, 'Start');
    await p.getByRole('button', { name: 'Fläche zeichnen', exact: true }).click();
    await pruefeTaufleiste(a, 'Fläche leer');
    const k = (await p.locator('.maplibregl-canvas').boundingBox())!;
    for (const [i, [fx, fy]] of ([[0.4, 0.55], [0.5, 0.7], [0.6, 0.55]] as const).entries()) {
      await p.mouse.click(k.x + k.width * fx, k.y + k.height * fy);
      await p.waitForTimeout(500);
      if (i < 2) await pruefeTaufleiste(a, `Fläche ${i + 1} Punkte`);
    }
    await expect(p.getByRole('button', { name: 'Abschliessen', exact: true })).toBeEnabled();
    await pruefeTaufleiste(a, 'Fläche 3 Punkte');
    for (let n = 0; n < 3; n++) await p.getByRole('button', { name: 'Zurück', exact: true }).click();
    await p.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await p.getByRole('button', { name: 'Fertig', exact: true }).click();
    await expect(p.locator('.tf-modus')).toHaveCount(0);
  }
});
