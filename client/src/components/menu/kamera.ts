// Kamera des Menüs (Spec v7 «Menü-Layout V4»): Menüspalte und Panel gehen als padding in die Fahrten ein, die
// Schweiz-Grenze (maxBounds in MapView) bleibt. Dazu der Stand der offenen Mission für die Fähnchen.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { onMapReady } from '../../lib/map.ts';
import { zielBox, type Box, type MeineMission } from '../../lib/missionen.ts';
import { merkeMission, store } from '../../lib/store.svelte.ts';
import { ui } from '../../lib/ui.svelte.ts';

export type Rand = { top: number; bottom: number; left: number; right: number };

export const SCHWEIZ: Box = [
  [5.96, 45.82],
  [10.49, 47.81],
];

/** Zielobjekte und Kartenausschnitt der offenen Mission merken (Menü öffnen, App in den Hintergrund). */
export function merkeStand(): void {
  // Vor dem ersten Snapshot (App-Start im Menü) wüsste das Gerät nichts von den Zielobjekten und überschriebe den gemerkten Stand
  if (!store.lage) return;
  onMapReady((m) => {
    const c = m.getCenter();
    merkeMission({ ziele: zielBox(store.taufen.values()), ansicht: { mitte: [c.lng, c.lat], zoom: m.getZoom() } });
  });
}

/** Rand so kürzen, dass mindestens 80 px Karte frei bleiben (sonst bewegt fitBounds die Karte gar nicht). */
function passend(m: MapLibreMap, r: Rand): Rand {
  const { clientWidth: b, clientHeight: h } = m.getContainer();
  const fx = Math.min(1, (b - 80) / Math.max(1, r.left + r.right));
  const fy = Math.min(1, (h - 80) / Math.max(1, r.top + r.bottom));
  return { left: r.left * fx, right: r.right * fx, top: r.top * fy, bottom: r.bottom * fy };
}

/** Ausschnitt einer Mission zeigen: alle Zielobjekte, sonst der letzte Ausschnitt; ohne beides bleibt die Karte. */
export function zeigeMission(m: MapLibreMap, x: Pick<MeineMission, 'ziele' | 'ansicht'>, rand: Rand, dauer = 900): void {
  const r = passend(m, rand);
  if (x.ziele) m.fitBounds(x.ziele, { padding: r, duration: dauer, maxZoom: 16 });
  else if (x.ansicht) m.flyTo({ center: x.ansicht.mitte, zoom: x.ansicht.zoom, offset: [(r.left - r.right) / 2, (r.top - r.bottom) / 2], duration: dauer });
}

/** Alle Orte im Bild (ohne Orte die ganze Schweiz). */
export function zeigeAlle(m: MapLibreMap, orte: [number, number][], rand: Rand, dauer = 900): void {
  const box: Box = orte.length
    ? [
        [Math.min(...orte.map((o) => o[0])), Math.min(...orte.map((o) => o[1]))],
        [Math.max(...orte.map((o) => o[0])), Math.max(...orte.map((o) => o[1]))],
      ]
    : SCHWEIZ;
  m.fitBounds(box, { padding: passend(m, rand), duration: dauer, maxZoom: 13 });
}

/** Rand für die Ansicht der Mission ohne Menü (Daumen-Ränder bzw. Kopf und Leiste). */
export const MISSIONS_RAND = (): Rand =>
  innerWidth > innerHeight ? { top: 64, bottom: 24, left: 96, right: 96 } : { top: 80, bottom: 96, left: 24, right: 72 };

/** Menü schliessen und zurück in die offene Mission, zum Ausschnitt vom letzten Besuch (Knopf «Zurück zur Mission», Esc). */
export function zurueckZurMission(): void {
  ui.menue = false;
  const a = store.missionen.find((m) => m.token === store.token)?.ansicht;
  if (a) onMapReady((m) => m.flyTo({ center: a.mitte, zoom: a.zoom, duration: 900 }));
}
