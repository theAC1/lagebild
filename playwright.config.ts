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
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    permissions: ['geolocation'],
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    trace: 'retain-on-failure',
  },
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
