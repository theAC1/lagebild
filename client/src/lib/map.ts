// Zugriff auf die MapLibre-Karte für Features: Instanz, Fadenkreuz-Punktwahl, Kontextmenü-Einträge.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Punkt } from '../../../shared/protocol.ts';
import { ui } from './ui.svelte.ts';

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

/** Karte auf p zentrieren (mind. Zoom 14) und Folgen-Modus beenden. */
export function zentriere(p: Punkt, zoom?: number): void {
  ui.folgen = false;
  const m = getMap();
  m.easeTo({ center: [p.lon, p.lat], zoom: zoom ?? Math.max(m.getZoom(), 14) });
}

/**
 * Fadenkreuz-Modus: blendet das Sheet aus, zeigt ein Fadenkreuz in der Kartenmitte mit Hinweis.
 * Liefert die Kartenmitte bei «Übernehmen», null bei «Abbrechen».
 */
export function waehlePunkt(hinweis: string): Promise<Punkt | null> {
  ui.punktWahl?.fertig(null);
  return new Promise((resolve) => {
    ui.punktWahl = {
      hinweis,
      fertig: (p) => {
        ui.punktWahl = null;
        resolve(p);
      },
    };
  });
}

export interface KontextAktion {
  label: string;
  aktion: (p: Punkt) => void;
  /** nur für die Leitung anzeigen */
  nurLeitung?: boolean;
}

const aktionen: KontextAktion[] = [];

/** Eintrag im Langdruck-Kontextmenü. Gibt eine Abmeldefunktion zurück. */
export function registriereKontextAktion(a: KontextAktion): () => void {
  aktionen.push(a);
  return () => {
    const i = aktionen.indexOf(a);
    if (i >= 0) aktionen.splice(i, 1);
  };
}

export const kontextAktionen = (): readonly KontextAktion[] => aktionen;
