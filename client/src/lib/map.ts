// Zugriff auf die MapLibre-Karte für Features: Instanz, Fadenkreuz-Punktwahl, Radial-Einträge.
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { Punkt } from '../../../shared/protocol.ts';
import { store } from './store.svelte.ts';
import { toast, ui, type RadialArt, type RadialZiel, type ToastKnopf } from './ui.svelte.ts';

export type { RadialArt, RadialZiel };

let karte: MapLibreMap | null = null;
let warten: ((m: MapLibreMap) => void)[] = [];

/** Nur für MapView: Instanz nach dem ersten 'load' bekannt machen. */
export function setzeKarte(m: MapLibreMap | null): void {
  karte = m;
  if (!m) return;
  const cbs = warten;
  warten = [];
  for (const cb of cbs) cb(m);
}

/** MapLibre-Instanz. Wirft, solange die Karte nicht geladen ist (MapLayer-Komponenten werden erst danach gemountet). */
export function getMap(): MapLibreMap {
  if (!karte) throw new Error('Karte noch nicht bereit');
  return karte;
}

export function onMapReady(cb: (m: MapLibreMap) => void): void {
  if (karte) cb(karte);
  else warten.push(cb);
}

/** Karte auf p zentrieren (mind. Zoom 14) und Folgen-Modus beenden. Vor dem Kartenstart: sobald sie steht. */
export function zentriere(p: Punkt, zoom?: number): void {
  ui.folgen = false;
  ui.folgtTeilnehmer = null;
  onMapReady((m) => m.easeTo({ center: [p.lon, p.lat], zoom: zoom ?? Math.max(m.getZoom(), 14) }));
}

/** Mitte der Karte; null, solange die Karte nicht geladen ist. */
export function kartenMitte(): Punkt | null {
  const c = karte?.getCenter();
  return c ? { lat: c.lat, lon: c.lng } : null;
}

/**
 * Fadenkreuz-Modus: blendet das Sheet aus, zeigt ein Fadenkreuz in der Kartenmitte mit Hinweis.
 * Liefert die Kartenmitte bei der Bestätigung (`knopf`, z.B. «Hier», «Setzen»), null bei «Abbrechen».
 * `extra`: zusätzlicher Knopf neben «Abbrechen» (z.B. «Rasterposition»); seine Aktion beendet die Punktwahl nicht selbst.
 */
export function waehlePunkt(hinweis: string, knopf = 'Übernehmen', extra?: ToastKnopf): Promise<Punkt | null> {
  ui.punktWahl?.fertig(null);
  return new Promise((resolve) => {
    ui.punktWahl = {
      hinweis,
      knopf,
      extra,
      fertig: (p) => {
        ui.punktWahl = null;
        resolve(p);
      },
    };
  });
}

/** Ring-Markierung am Kartenpunkt (Radial-Menü und Koordinaten-Karte der leeren Karte). Gibt die Entfernen-Funktion zurück. */
export function markierePunkt(p: Punkt): () => void {
  const el = document.createElement('div');
  el.className = 'punkt-marke';
  const mk = new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(getMap());
  return () => mk.remove();
}

/** Karte folgt der eigenen Position (Knopf «Folgen», Radial-Menü). */
export function folgeMir(): void {
  if (!store.meinePos) return toast(store.gpsFehler ?? 'Noch keine eigene Position.');
  zentriere(store.meinePos, 16);
  ui.folgen = true;
}

/** Karte folgt einem Teilnehmer, bis die Karte verschoben oder neu zentriert wird. */
export function folgeTeilnehmer(id: string): void {
  const pos = store.teilnehmer.get(id)?.pos;
  if (!pos) return toast('Position unbekannt.');
  zentriere(pos);
  ui.folgtTeilnehmer = id;
}

// --- Radial-Menü ---

export interface RadialAktion {
  /** Für welche Symbolart(en) der Knopf erscheint; 'punkt' = leere Karte (ziel.punkt gesetzt). */
  fuer: RadialArt | readonly RadialArt[];
  /** Beschriftung, fest oder je Ziel (z.B. «Folgen» / «Nicht folgen»); wird reaktiv gelesen. */
  label: string | ((z: RadialZiel) => string);
  /** SVG-Markup, siehe ikon() */
  icon: string;
  aktion: (z: RadialZiel) => void;
  /** Knopf nur zeigen, wenn true (Rechte, Zustand); wird reaktiv gelesen. */
  sichtbar?: (z: RadialZiel) => boolean;
}

/** Höchstens so viele Knöpfe im Ring; spätere Registrierungen fallen weg. */
export const MAX_RADIAL = 8;
const radialAktionen: RadialAktion[] = [];

/** Knopf im Radial-Menü (Langdruck/Rechtsklick auf ein Symbol oder die leere Karte). Gibt eine Abmeldefunktion zurück. */
export function registriereRadialAktion(a: RadialAktion): () => void {
  radialAktionen.push(a);
  return () => {
    const i = radialAktionen.indexOf(a);
    if (i >= 0) radialAktionen.splice(i, 1);
  };
}

export const radialAktionenFuer = (z: RadialZiel): RadialAktion[] =>
  radialAktionen.filter((a) => (typeof a.fuer === 'string' ? a.fuer === z.art : a.fuer.includes(z.art)) && (a.sichtbar?.(z) ?? true)).slice(0, MAX_RADIAL);

/** DOM-Symbol (Marker-Element) als Ziel fürs Radial-Menü und den Doppelklick markieren. */
export function markiereZiel(element: HTMLElement, ziel: RadialZiel): void {
  element.dataset.zielArt = ziel.art;
  element.dataset.zielId = ziel.id;
}

type Treffer = (p: { x: number; y: number }) => RadialZiel | null;
const treffer: Treffer[] = [];

/**
 * Trefferprüfung für Ziele, die nicht als DOM-Symbol existieren (z.B. Zeichnungen im WebGL-Layer):
 * bekommt den Punkt in Kartenpixeln (wie MapMouseEvent.point), liefert das Ziel darunter oder null.
 */
export function registriereTreffer(fn: Treffer): () => void {
  treffer.push(fn);
  return () => {
    const i = treffer.indexOf(fn);
    if (i >= 0) treffer.splice(i, 1);
  };
}

/** Ziel unter dem Bildschirmpunkt (clientX/Y) mit Mittelpunkt fürs Menü, sonst null. */
export function zielUnter(x: number, y: number): { ziel: RadialZiel; x: number; y: number } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-ziel-art]');
  if (el) {
    const r = el.getBoundingClientRect();
    return { ziel: { art: el.dataset.zielArt as RadialArt, id: el.dataset.zielId! }, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if (!karte) return null;
  const c = karte.getContainer().getBoundingClientRect();
  for (const fn of treffer) {
    const ziel = fn({ x: x - c.left, y: y - c.top });
    if (ziel) return { ziel, x, y };
  }
  return null;
}

/** Radial-Menü um (x, y) öffnen – für Features mit eigener Geste; sonst erledigt das die Karte. */
export function oeffneRadial(ziel: RadialZiel, x: number, y: number): void {
  ui.koordinate = null;
  ui.radial = { ziel, x, y };
  navigator.vibrate?.(15);
}
