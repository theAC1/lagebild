// Koordinaten, Distanz und Richtung. Intern immer WGS84 ({lat, lon}).
import proj4 from 'proj4';
import { forward as mgrsForward } from 'mgrs';
import type { Punkt } from '../../../shared/protocol.ts';

const LV95 =
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs';
const ERDRADIUS = 6371008.8;
const rad = (g: number) => (g * Math.PI) / 180;
const grad = (r: number) => (r * 180) / Math.PI;

export type KoordFormat = 'lv95' | 'mgrs' | 'wgs84';
export const KOORD_FORMATE: { id: KoordFormat; label: string }[] = [
  { id: 'lv95', label: 'LV95' },
  { id: 'mgrs', label: 'MGRS' },
  { id: 'wgs84', label: 'WGS84' },
];

export function zuLv95(p: Punkt): { e: number; n: number } {
  const [e, n] = proj4('WGS84', LV95, [p.lon, p.lat]);
  return { e, n };
}

const tausender = (x: number) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");

/** «2'600'435 / 1'199'506» */
export function formatLv95(p: Punkt): string {
  const { e, n } = zuLv95(p);
  return `${tausender(e)} / ${tausender(n)}`;
}

/** «32T LT 81613 00408» (1 m Auflösung). */
export function formatMgrs(p: Punkt, stellen = 5): string {
  try {
    const m = /^(\d{1,2}[A-Z])([A-Z]{2})(\d*)$/.exec(mgrsForward([p.lon, p.lat], stellen));
    if (!m) return '–';
    const h = m[3].length / 2;
    return [m[1], m[2], m[3].slice(0, h), m[3].slice(h)].filter(Boolean).join(' ');
  } catch {
    return '–'; // Polargebiete: kein MGRS (UPS)
  }
}

/** «N 46.94664° E 7.44434°» */
export function formatWgs84(p: Punkt): string {
  const ns = p.lat >= 0 ? 'N' : 'S';
  const eo = p.lon >= 0 ? 'E' : 'W';
  return `${ns} ${Math.abs(p.lat).toFixed(5)}° ${eo} ${Math.abs(p.lon).toFixed(5)}°`;
}

export function formatKoord(p: Punkt, f: KoordFormat): string {
  return f === 'lv95' ? formatLv95(p) : f === 'mgrs' ? formatMgrs(p) : formatWgs84(p);
}

/** Grosskreis-Distanz in Metern. */
export function distanz(a: Punkt, b: Punkt): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Anfangsazimut von a nach b in Grad (0 = Nord, 90 = Ost), Bereich [0, 360). */
export function azimut(a: Punkt, b: Punkt): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  const g = (grad(Math.atan2(y, x)) + 360) % 360;
  return g > 360 - 1e-9 ? 0 : g; // Rundungsrauschen knapp unter 360 → Nord
}

/** Grad → Artilleriepromille (6400 ‰ = Vollkreis), Bereich [0, 6400). */
export function promille(g: number): number {
  return (((g * 6400) / 360) % 6400 + 6400) % 6400;
}

/** «850 m», «1.25 km», «12.4 km» */
export function formatDistanz(m: number): string {
  // erst runden, dann Grenze prüfen (sonst «1000 m» bzw. «10.00 km»)
  if (Math.round(m) < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km.toFixed(Math.round(km * 100) < 1000 ? 2 : 1)} km`;
}

/** «045° / 0800 ‰» */
export function formatRichtung(g: number): string {
  return `${String(Math.round(g) % 360).padStart(3, '0')}° / ${String(Math.round(promille(g)) % 6400).padStart(4, '0')} ‰`;
}

const HIMMEL = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export const himmelsrichtung = (g: number) => HIMMEL[Math.round(g / 45) % 8];

/** Punkt in Distanz (m) und Azimut (Grad) von p. */
export function versetze(p: Punkt, m: number, g: number): Punkt {
  const d = m / ERDRADIUS;
  const la = rad(p.lat);
  const az = rad(g);
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(az));
  const lon2 = rad(p.lon) + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return { lat: grad(lat2), lon: grad(lon2) };
}

/** Kreis als GeoJSON-Polygon (z.B. Genauigkeitskreis). */
export function kreis(p: Punkt, radiusM: number, n = 48): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = Array.from({ length: n + 1 }, (_, i) => {
    const q = versetze(p, radiusM, (i * 360) / n);
    return [q.lon, q.lat];
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
