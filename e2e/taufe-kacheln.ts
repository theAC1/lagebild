// Fixture-Vektorkacheln für die Geländetaufe (E2E): kleines Gelände im Schema von ch.swisstopo.base.vt, je Anfrage
// mit geojson-vt + vt-pbf (beide kommen mit maplibre-gl) in eine Kachel gerechnet. Keine Anfrage an swisstopo.
import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';

/** Mitte des Geländes; liegt ~17 m westlich einer z14-Kachelgrenze (lon 7.448730…), damit Gebäude/Strasse sie kreuzen. */
export const MITTE = { latitude: 46.9466, longitude: 7.4485 };
const K = Math.cos((MITTE.latitude * Math.PI) / 180) * 111_320;
/** Meter (Ost, Nord) ab MITTE → [lon, lat] */
export const ll = (ost: number, nord: number): [number, number] => [MITTE.longitude + ost / K, MITTE.latitude + nord / 111_320];
const rechteck = (x0: number, y0: number, x1: number, y1: number) => [[ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)]];

type F = { geometry: GeoJSON.Geometry; properties: Record<string, unknown> };
const poly = (props: Record<string, unknown>, ...r: [number, number, number, number]): F => ({ geometry: { type: 'Polygon', coordinates: rechteck(...r) }, properties: props });
const linie = (props: Record<string, unknown>, ...pts: [number, number][]): F => ({ geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => ll(x, y)) }, properties: props });

/** Gelände in Metern ab MITTE. Die Hauptstrasse hat Kreuzungen bei x = −90 und x = +60. */
export const GELAENDE: Record<string, F[]> = {
  building: [
    poly({ class: '' }, -55, 15, -10, 45), // «West»: ganz in einer Kachel
    poly({ class: 'roof' }, 0, 15, 45, 45), // «Ost»: über die Kachelgrenze
    poly({ class: '' }, -160, 20, -135, 40), // «Teil»: ein Gebäude aus zwei Teilen mit gemeinsamer Wand (wie swisstopo)
    poly({ class: '' }, -135, 20, -110, 40),
  ],
  transportation: [
    linie({ class: 'minor' }, [-250, 0], [-90, 0], [60, 0], [250, 0]),
    linie({ class: 'minor' }, [-90, -150], [-90, 0], [-90, 150]),
    linie({ class: 'tertiary' }, [60, -150], [60, 0], [60, 150]),
    linie({ class: 'path', subclass: 'footway' }, [-30, -120], [-30, -10]),
  ],
  landcover: [poly({ class: 'wood', subclass: 'forest' }, -120, 80, -20, 180)],
  landuse: [poly({ class: 'residential' }, -60, -200, 40, -125)],
};

const indizes = Object.entries(GELAENDE).map(([name, fs]) => [name, new GeoJSONVT({ type: 'FeatureCollection', features: fs.map((f) => ({ type: 'Feature', ...f })) }, { maxZoom: 14, indexMaxZoom: 14, extent: 4096, buffer: 64, tolerance: 0 })] as const);

/** Kachel z/x/y als PBF (leer, wenn das Gelände sie nicht berührt). */
export function kachel(z: number, x: number, y: number): Buffer {
  const layers = Object.fromEntries(indizes.map(([name, idx]) => [name, idx.getTile(z, x, y)]).filter(([, t]) => t));
  return Buffer.from(Object.keys(layers).length ? fromGeojsonVt(layers as never, { version: 2, extent: 4096 }) : new Uint8Array());
}
