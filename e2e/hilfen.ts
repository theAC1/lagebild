// Gemeinsame Hilfen der E2E-Tests (keine Testdatei: testMatch ist *.e2e.ts).
import type { Page } from '@playwright/test';

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
