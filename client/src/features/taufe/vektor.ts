// swisstopo-Vektorkacheln als unsichtbare Abfrageebene für den Taufmodus (Recherche 2.1): Layer stehen ausserhalb
// des Modus auf visibility 'none' → nichts antippbar, keine Kachel geladen. Im Modus Hervorhebung ab MIN_ZOOM.
import type { FilterSpecification, LayerSpecification, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import { BAECHE, GEBAEUDE_OHNE, STRASSEN_KLASSEN } from './familien.ts';
import { linienAufKachel, zuWelt, type Flaeche, type Kachel, type Linie, type XY } from './geo.ts';
import { MIN_ZOOM } from './zustand.svelte.ts';

export const VT = 'taufe-vt';
/** Offizielle Kachel-URL (TileJSON ch.swisstopo.base.vt v1.0.0). Offline-Gebiete hängen ihre lokale Ablage davor. */
export const VT_KACHELN = [0, 1, 2, 3, 4].map((i) => `https://vectortiles${i}.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf`);
const SWISSTOPO = '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>';

const klasseIn = (liste: string[]): FilterSpecification => ['in', ['get', 'class'], ['literal', liste]];
const klasseNicht = (liste: string[]): FilterSpecification => ['!', ['in', ['coalesce', ['get', 'class'], ''], ['literal', liste]]];
export const FILTER: Record<string, FilterSpecification | undefined> = {
  building: klasseNicht(GEBAEUDE_OHNE),
  transportation: klasseIn(STRASSEN_KLASSEN),
  waterway: klasseIn(BAECHE),
  water: klasseNicht(['pool']),
};

const L = (id: string, sourceLayer: string, rest: Omit<LayerSpecification, 'id' | 'source' | 'source-layer'>): LayerSpecification =>
  ({ id, source: VT, 'source-layer': sourceLayer, minzoom: MIN_ZOOM, layout: { visibility: 'none', ...('layout' in rest ? rest.layout : {}) }, ...(FILTER[sourceLayer] ? { filter: FILTER[sourceLayer] } : {}), ...rest }) as LayerSpecification;

/** Hervorhebung (dezent sichtbar) und breite, unsichtbare Trefferlinien. Reihenfolge = Zeichenreihenfolge. */
export const VT_LAYER: LayerSpecification[] = [
  L('tv-landuse', 'landuse', { type: 'fill', paint: { 'fill-color': '#e8c547', 'fill-opacity': 0.12, 'fill-outline-color': '#e8c547' } }),
  L('tv-landcover', 'landcover', { type: 'fill', paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#8d5a2b', '#e8c547'], 'fill-opacity': ['match', ['get', 'class'], 'wood', 0.22, 0.1] } }),
  L('tv-water', 'water', { type: 'fill', paint: { 'fill-color': '#29b6f6', 'fill-opacity': 0.2 } }),
  L('tv-waterway', 'waterway', { type: 'line', paint: { 'line-color': '#29b6f6', 'line-width': 2, 'line-opacity': 0.8 } }),
  L('tv-waterway-treffer', 'waterway', { type: 'line', paint: { 'line-color': '#000', 'line-width': 16, 'line-opacity': 0 } }),
  L('tv-strasse', 'transportation', { type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff7043', 'line-width': 2.5, 'line-opacity': 0.85 } }),
  L('tv-strasse-treffer', 'transportation', { type: 'line', paint: { 'line-color': '#000', 'line-width': 18, 'line-opacity': 0 } }),
  L('tv-building', 'building', { type: 'fill', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.22 } }),
  L('tv-building-rand', 'building', { type: 'line', paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.8 } }),
];
/** Abgefragt beim Tippen (Vorrang regelt familien.waehleTreffer). */
export const VT_TREFFER = ['tv-building', 'tv-waterway-treffer', 'tv-strasse-treffer', 'tv-water', 'tv-landcover', 'tv-landuse'];

export function fuegeVektorHinzu(m: MapLibreMap, vor?: string): void {
  m.addSource(VT, { type: 'vector', tiles: VT_KACHELN, minzoom: 0, maxzoom: 14, bounds: [3.57, 44.18, 13.66, 48.88], attribution: SWISSTOPO });
  for (const l of VT_LAYER) m.addLayer(l, vor);
}

export function zeigeVektor(m: MapLibreMap, an: boolean): void {
  for (const l of VT_LAYER) m.setLayoutProperty(l.id, 'visibility', an ? 'visible' : 'none');
}

// --- Stücke aus den geladenen Kacheln -----------------------------------------------------------------

type Mit = MapGeoJSONFeature & { _x?: number; _y?: number; _z?: number };
const kachelVon = (f: Mit): Kachel | null => (f._z === undefined ? null : { x: f._x!, y: f._y!, z: f._z });

/** Objekte einer Ebene aus allen geladenen Kacheln; nur die feinste Zoomstufe (beim Zoomen liegen auch gröbere bereit). */
function quellObjekte(m: MapLibreMap, sourceLayer: string, filter?: FilterSpecification): { f: Mit; k: Kachel }[] {
  const alle = (m.querySourceFeatures(VT, { sourceLayer, filter }) as Mit[]).map((f) => ({ f, k: kachelVon(f) })).filter((x): x is { f: Mit; k: Kachel } => !!x.k);
  const z = Math.max(...alle.map((x) => x.k.z));
  return alle.filter((x) => x.k.z === z);
}

export function linienStuecke(m: MapLibreMap, sourceLayer: string): Linie[] {
  return quellObjekte(m, sourceLayer, FILTER[sourceLayer]).flatMap(({ f, k }) => {
    const g = f.geometry;
    const ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    return linienAufKachel(ls.map((l) => l.map(zuWelt)), k);
  });
}

/** Flächenstücke derselben Art (bei Landnutzung/-bedeckung dieselbe Klasse) wie das getippte Objekt. */
export function flaechenStuecke(m: MapLibreMap, sourceLayer: string, klasse: unknown): Flaeche[] {
  const filter: FilterSpecification | undefined = sourceLayer === 'landcover' || sourceLayer === 'landuse' ? ['==', ['get', 'class'], String(klasse ?? '')] : FILTER[sourceLayer];
  return quellObjekte(m, sourceLayer, filter).flatMap(({ f, k }) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.map((p) => ({ ringe: p.map((r) => r.map(zuWelt)), kachel: k }));
  });
}

/** Welteinheiten je Bildschirmpixel bei Zoom z (512-px-Kacheln, 4096 Einheiten je z14-Kachel). */
export const weltJePixel = (zoom: number): number => 8 * 2 ** (14 - zoom);
export const welt = (lngLat: { lng: number; lat: number }): XY => zuWelt([lngLat.lng, lngLat.lat]);
