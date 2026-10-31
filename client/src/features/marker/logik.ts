// Reine Marker-Logik (testbar ohne DOM/Karte).
import type { ClientMsg, Marker, Punkt } from '../../../../shared/protocol.ts';
import { distanz } from '../../lib/coords.ts';
import { baueSidc, funktionLabel, zerlegeSidc, type Zugehoerigkeit } from '../../lib/symbol.ts';

/** Standard für neue Marker: Unbekannt, Land (Truppen), ohne Funktion. */
export const MARKER_STANDARD_SIDC = baueSidc({ zugehoerigkeit: 'unbekannt', set: '10', groesse: '00', funktion: '000000' });

export type MarkerFilter = Zugehoerigkeit | 'alle';

/** Anzeigename: Bezeichnung, sonst die Funktion des Zeichens. */
export const markerName = (m: Pick<Marker, 'bezeichnung' | 'sidc'>) => m.bezeichnung.trim() || funktionLabel(m.sidc);

/** Gefiltert nach Zugehörigkeit; mit eigener Position nach Distanz, sonst zuletzt geändert zuerst. */
export function filtereMarker(liste: Iterable<Marker>, filter: MarkerFilter, von: Punkt | null): Marker[] {
  const treffer = [...liste].filter((m) => filter === 'alle' || zerlegeSidc(m.sidc).zugehoerigkeit === filter);
  return von ? treffer.sort((a, b) => distanz(von, a) - distanz(von, b)) : treffer.sort((a, b) => b.geaendertAm - a.geaendertAm);
}

/** Anzahl Marker je Zugehörigkeit (für die Filterknöpfe). */
export function zaehle(liste: Iterable<Marker>): Record<MarkerFilter, number> {
  const n: Record<MarkerFilter, number> = { alle: 0, freund: 0, feind: 0, neutral: 0, unbekannt: 0 };
  for (const m of liste) {
    n.alle++;
    n[zerlegeSidc(m.sidc).zugehoerigkeit]++;
  }
  return n;
}

export interface MarkerEingabe {
  id?: string;
  sidc: string;
  lat: number;
  lon: number;
  bezeichnung: string;
  notiz: string;
}

/** `marker.setzen` mit getrimmten, auf Vertragslänge gekürzten Texten. Ohne id legt der Server neu an. */
export function setzenNachricht(e: MarkerEingabe): ClientMsg {
  const marker = { sidc: e.sidc, lat: e.lat, lon: e.lon, bezeichnung: e.bezeichnung.trim().slice(0, 60), notiz: e.notiz.trim().slice(0, 500) };
  return { typ: 'marker.setzen', marker: e.id ? { ...marker, id: e.id } : marker };
}

const zwei = (n: number) => String(n).padStart(2, '0');

/** «14:05» heute, sonst «27.10. 14:05» (Gerätezeitzone). */
export function formatZeit(ms: number, jetzt = Date.now()): string {
  const d = new Date(ms);
  const uhr = `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  return d.toDateString() === new Date(jetzt).toDateString() ? uhr : `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}. ${uhr}`;
}
