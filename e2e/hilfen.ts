// Gemeinsame Hilfen der E2E-Tests (keine Testdatei: testMatch ist *.e2e.ts).
import { generateKeyPairSync, sign } from 'node:crypto';
import { test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { beitrittsText, eroeffnungsText, type Beigetreten, type GeraetNachweis, type LageErstellt } from '../shared/protocol.ts';

type Person = { rufname?: string; einheit?: string; funktion?: string; sidc?: string };
const person = (p: Person) => ({ rufname: 'Adler', einheit: 'Zug 1', funktion: '', sidc: '10031000001211000000', ...p });

/** Gerätenachweis (Spec v7) eines neuen Testgeräts: Challenge holen, mit frischem Ed25519-Schlüssel signieren. */
async function nachweis(req: APIRequestContext, text: (challenge: string) => string): Promise<GeraetNachweis> {
  const { challenge } = await (await req.post('/api/challenge')).json();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pub: publicKey.export({ format: 'jwk' }).x!, challenge, signatur: sign(null, Buffer.from(text(challenge)), privateKey).toString('base64url') };
}

/** Eröffnet eine Mission per REST; das eröffnende Testgerät ist Leitung (Vorgabe Rufname «Adler», Zug 1). */
export async function neueMission(req: APIRequestContext, name: string, phase?: 'ap' | 'lv', p: Person = {}): Promise<LageErstellt> {
  const r = await req.post('/api/lage', { data: { name, erstellPasswort: 'e2e', ...(phase && { phase }), ...person(p), geraet: await nachweis(req, (c) => eroeffnungsText(c, name)) } });
  if (r.status() !== 201) throw new Error(`Mission eröffnen: ${r.status()}`);
  return r.json();
}

/** Tritt per REST mit einem neuen Testgerät bei. Ist `code` schon ein Beitritt (die Leitung aus neueMission), gilt dieser. */
export async function beitreten(req: APIRequestContext, code: string | Beigetreten, p: Person = {}): Promise<Beigetreten> {
  if (typeof code !== 'string') return code;
  const r = await req.post('/api/beitreten', { data: { code, ...person(p), geraet: await nachweis(req, (c) => beitrittsText(c, code.toUpperCase())) } });
  if (r.status() !== 201) throw new Error(`Beitreten: ${r.status()}`);
  return r.json();
}

/**
 * Menü (Spec v7) öffnen – aus der laufenden Mission über den Knopf «Menü», ohne Mission ist es ohnehin offen – und
 * optional eine Seite der Menüspalte wählen. Liefert das Panel der Seite.
 */
export async function menue(p: Page, seite?: string): Promise<Locator> {
  const spalte = p.getByRole('navigation', { name: 'Menü' });
  if (!(await spalte.isVisible())) await p.getByRole('button', { name: 'Menü', exact: true }).click();
  if (seite) await spalte.getByRole('button', { name: seite, exact: true }).click();
  return p.locator('section.panel');
}

/**
 * App-Start ist immer das Menü (Juan 01.11.), auch mit offener Mission: dort verbindet sie im Hintergrund, mit
 * «Zurück zur Mission» geht es hinein. Nach goto() und reload() einer Seite mit Mission aufrufen. Der Knopf erscheint mit
 * dem Eintrag in Meine Missionen (bei Geräten mit nur `lagebild.token` erst mit dem ersten Snapshot).
 */
export async function indieMission(p: Page): Promise<void> {
  await p.getByRole('button', { name: /^Zurück zur Mission/ }).click();
}

/** Vorgabe der Tests (Projekt «quer» in playwright.config.ts): Android-Handy FHD+ 2340×1080 bei DPR 2.75, quer. */
export const QUER = { width: 851, height: 393 };
/** Dasselbe Handy hochkant, für Tests, die bewusst das Hochformat prüfen. */
export const HOCH = { width: 393, height: 851 };
/** Android «Anzeigegrösse gross» (DPR 3), quer: Projekt «quer-gross». */
export const QUER_GROSS = { width: 780, height: 360 };
/** Desktop mit Maus: hebt die Handy-Vorgabe (Touch, isMobile) der Projekte auf. */
export const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false };

/**
 * Bildschirmfoto nach docs/screens/<name>.png, nur mit E2E_BILDER=1 (Doku-Bilder erneuern) und nur im Projekt «quer»
 * (die Zusatzprojekte würden dieselben Namen mit anderem Format überschreiben). Sonst nichts: spart je Bild bis 7 MB
 * PNG und Zeit, und ein normaler Lauf ändert keine Dateien im Repo.
 */
export async function dokuBild(p: Page, name: string): Promise<void> {
  if (process.env.E2E_BILDER && test.info().project.name === 'quer') await p.screenshot({ path: `docs/screens/${name}.png`, animations: 'disabled' });
}

/**
 * Init-Script für context.addInitScript(bedienung, 'klassisch'): setzt die Bedienung, solange keine gewählt ist.
 * Andere Einstellungen (z.B. die per Tippen gemerkte Koordinatenzeile) bleiben über Neuladen erhalten.
 */
export function bedienung(b: 'klassisch' | 'daumen'): void {
  const k = 'lagebild.einstellungen';
  const e = JSON.parse(localStorage.getItem(k) ?? '{}');
  if (!e.bedienung) localStorage.setItem(k, JSON.stringify({ ...e, bedienung: b }));
}

/** Echter Touch-Langdruck (ein Finger, still gehalten) über CDP; Playwright selbst kennt keinen. Braucht hasTouch. */
export async function langdruck(p: Page, x: number, y: number, ms = 800): Promise<void> {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await p.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Echtes Wischen mit einem Finger von `von` nach `nach` über CDP (Touch-Ereignisse bleiben beim Startelement wie am Handy). */
export async function wische(p: Page, von: { x: number; y: number }, nach: { x: number; y: number }, schritte = 8): Promise<void> {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [von] });
  for (let i = 1; i <= schritte; i++) {
    const punkt = { x: von.x + ((nach.x - von.x) * i) / schritte, y: von.y + ((nach.y - von.y) * i) / schritte };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [punkt] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * Kartenmitte in Fensterpixeln. Quer schweben offene Panels über der Karte; MapLibre-Padding (Sheet.svelte) legt die
 * Mitte in den freien Teil rechts daneben. Ohne Panel (und hoch) ist es die Mitte der Zeichenfläche.
 */
export function kartenMitte(p: Page): Promise<{ x: number; y: number }> {
  return p.evaluate(() => {
    const k = document.querySelector('.maplibregl-canvas')!.getBoundingClientRect();
    const panels = document.querySelector('.panels');
    const quer = matchMedia('(orientation: landscape)').matches;
    const links = quer && panels?.querySelector('.sheet') ? Math.round(panels.getBoundingClientRect().right) : k.left;
    return { x: (links + k.right) / 2, y: (k.top + k.bottom) / 2 };
  });
}

/** Erster Bildschirmpunkt aus `kandidaten` (Anteile von Breite/Höhe), unter dem nur die Karte liegt. */
export async function leereStelle(p: Page, kandidaten: [number, number][]): Promise<{ x: number; y: number }> {
  const vp = p.viewportSize()!;
  for (const [fx, fy] of kandidaten) {
    const x = Math.round(vp.width * fx);
    const y = Math.round(vp.height * fy);
    const frei = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas') ?? false, [x, y]);
    if (frei) return { x, y };
  }
  throw new Error('keine freie Kartenstelle gefunden');
}
