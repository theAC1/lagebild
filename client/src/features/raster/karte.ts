// Kartenbewegungen fürs Führungsraster.
import { rahmen, type RasterGeo } from '../../../../shared/raster.ts';
import { getMap } from '../../lib/map.ts';
import { ui } from '../../lib/ui.svelte.ts';

/** Oberkante eines unten angedockten Sheets (Hochformat) in Fensterpixeln; null, wenn keines offen ist (quer: Seitenpanels). */
export function sheetOben(): number | null {
  let oben: number | null = null;
  for (const el of document.querySelectorAll<HTMLElement>('.panels > .sheet')) {
    const r = el.getBoundingClientRect();
    if (r.top > 100 && r.bottom >= innerHeight - 200 && r.width > innerWidth / 2) oben = Math.min(oben ?? Infinity, r.top);
  }
  return oben;
}

/** Ganzes Raster samt Köpfen ins Bild; über einem offenen Sheet. */
export function zeigeRaster(r: RasterGeo): void {
  const m = getMap();
  const ring = rahmen(r);
  const lon = ring.map((p) => p.lon);
  const lat = ring.map((p) => p.lat);
  const sheet = sheetOben();
  ui.folgen = false;
  ui.folgtTeilnehmer = null;
  m.fitBounds(
    [
      [Math.min(...lon), Math.min(...lat)],
      [Math.max(...lon), Math.max(...lat)],
    ],
    { padding: { top: 130, bottom: sheet === null ? 60 : Math.round(innerHeight - sheet + 30), left: 50, right: 50 }, duration: 600 },
  );
}
