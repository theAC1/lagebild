// Erzeugt die PWA-Icons aus public/icons/icon.svg (einmalig: node client/scripts/icons.mjs).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const dir = new URL('../public/icons/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', dir), 'utf8');
// CHROMIUM=<pfad> erlaubt einen bereits installierten Browser, falls die Playwright-Version keinen eigenen hat.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-maskable-512', 512, 0.12]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - 2 * pad));
  await page.setContent(
    `<body style="margin:0;background:#161b1f;display:grid;place-items:center;height:100vh">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: new URL(`${name}.png`, dir).pathname, omitBackground: pad === 0 });
}
await browser.close();
