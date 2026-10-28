// Spuren: Zeitfenster, Zusammenführen von geladenen und Live-Punkten, GeoJSON-Linien (rein, testbar).
import type { Position } from '../../../../shared/protocol.ts';

export type Fenster = '15m' | '1h' | 'alle';
export const FENSTER: { id: Fenster; label: string; ms: number | null }[] = [
  { id: '15m', label: '15 min', ms: 15 * 60_000 },
  { id: '1h', label: '1 h', ms: 60 * 60_000 },
  { id: 'alle', label: 'alles', ms: null },
];

/** Untergrenze (ms seit Epoch) für das Zeitfenster; 0 = alles. */
export function seitFuer(f: Fenster, jetzt: number): number {
  const ms = FENSTER.find((x) => x.id === f)?.ms ?? null;
  return ms === null ? 0 : jetzt - ms;
}

/** Teile der Spur, die älter sind, werden gedämpft gezeichnet. */
export const ALT_MS = 10 * 60_000;

/** Gut unterscheidbar auf Landeskarte und Luftbild (mit dunklem Rand gezeichnet). */
export const SPUR_FARBEN = ['#ff5a36', '#ffd23f', '#3fa7ff', '#ff4fd8', '#5cff6e', '#ff9f1c', '#b388ff', '#00e5d4', '#ffffff', '#c6ff00'];

/**
 * Hängt p an, wenn es neuer als der letzte Punkt ist, und lässt Punkte vor `seit` fallen (Zeitfenster).
 * Liefert eine neue Liste (oder die alte, wenn nichts dazukommt).
 */
export function anhaengen(spur: readonly Position[] | undefined, p: Position, seit = 0): Position[] {
  const liste = spur ?? [];
  const letzte = liste.at(-1);
  if (letzte && p.t <= letzte.t) return liste as Position[];
  const ab = liste.findIndex((x) => x.t >= seit);
  return [...(ab === -1 ? [] : ab === 0 ? liste : liste.slice(ab)), p];
}

/** Geladene Spuren + live angekommene Punkte, die neuer sind als das Geladene (kein Verlust während des Ladens). */
export function zusammenfuehren(geladen: Record<string, Position[]>, live: Record<string, Position[]>): Record<string, Position[]> {
  const ids = new Set([...Object.keys(geladen), ...Object.keys(live)]);
  const neu: Record<string, Position[]> = {};
  for (const id of ids) {
    const basis = geladen[id] ?? [];
    const letzte = basis.at(-1)?.t ?? -Infinity;
    neu[id] = [...basis, ...(live[id] ?? []).filter((p) => p.t > letzte)];
  }
  return neu;
}

type Linie = GeoJSON.Feature<GeoJSON.LineString, { id: string; farbe: string; alt: boolean }>;

const linie = (id: string, farbe: string, alt: boolean, pts: Position[]): Linie => ({
  type: 'Feature',
  properties: { id, farbe, alt },
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
});

/**
 * Linien je sichtbarem Teilnehmer, nur Punkte ab `seit`. Punkte vor `altVor` bilden einen eigenen,
 * gedämpften Teil; der jüngere Teil beginnt am letzten alten Punkt, damit die Linie durchgeht.
 */
export function spurLinien(
  spuren: Record<string, readonly Position[]>,
  ids: Iterable<string>,
  farbe: (id: string) => string,
  seit: number,
  altVor: number,
): Linie[] {
  const out: Linie[] = [];
  for (const id of ids) {
    const pts = (spuren[id] ?? []).filter((p) => p.t >= seit);
    if (pts.length < 2) continue;
    const f = farbe(id);
    const i = pts.findIndex((p) => p.t >= altVor);
    const alt = i === -1 ? pts : pts.slice(0, i);
    const jung = i === -1 ? [] : pts.slice(Math.max(0, i - 1));
    if (alt.length >= 2) out.push(linie(id, f, true, alt));
    if (jung.length >= 2) out.push(linie(id, f, false, jung));
  }
  return out;
}
