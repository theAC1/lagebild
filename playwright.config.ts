import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.PW_PORT ?? 8797);
// Frische Datenbank je Lauf (Playwright lädt die Config auch in den Workern → nur im Hauptprozess anlegen).
process.env.E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'lagebild-e2e-'));

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts', // nicht *.spec.ts, sonst sammelt vitest die Datei ein
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    permissions: ['geolocation'],
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    trace: 'retain-on-failure',
  },
  // Vorgabe (31.10., Juan: «die Hauptnutzung (98 %) wird in landscape genutzt»): Android-Handy quer, FHD+ 2340×1080
  // physisch bei DPR 2.75 = 851×393 CSS-px, mit Touch. Desktop-Tests setzen ihren Kontext selbst (DESKTOP in e2e/hilfen.ts).
  projects: [
    { name: 'quer', use: { viewport: { width: 851, height: 393 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true } },
    // Android «Anzeigegrösse gross»: weniger CSS-px auf demselben Bildschirm; nur Layout-Prüfungen
    { name: 'quer-gross', grep: /@layout/, use: { viewport: { width: 780, height: 360 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
    { name: 'hoch', grep: /@hoch/, use: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: `http://127.0.0.1:${port}/`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { PORT: String(port), LAGE_ERSTELL_PASSWORT: 'e2e', DATA_DIR: process.env.E2E_DATA_DIR },
  },
});
