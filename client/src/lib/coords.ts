// Koordinaten, Distanz und Richtung. Intern immer WGS84 ({lat, lon}).
import proj4 from 'proj4';
import { forward as mgrsForward, toPoint as mgrsToPoint } from 'mgrs';
import type { Punkt } from '../../../shared/protocol.ts';

const LV95 =
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs';
// LV03 = LV95 − (2'000'000, 1'000'000), gleiche Projektion
const LV03 =
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=600000 +y_0=200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs';
const ERDRADIUS = 6371008.8;
const rad = (g: number) => (g * Math.PI) / 180;
const grad = (r: number) => (r * 180) / Math.PI;

export type KoordFormat = 'lv95' | 'lv03' | 'mgrs' | 'utm' | 'wgs84' | 'wgsgms';
export const KOORD_FORMATE: { id: KoordFormat; label: string }[] = [
  { id: 'lv95', label: 'LV95' },
  { id: 'lv03', label: 'LV03' },
  { id: 'mgrs', label: 'MGRS' },
  { id: 'utm', label: 'UTM' },
  { id: 'wgs84', label: 'WGS84' },
  { id: 'wgsgms', label: 'WGS84 G/M/S' },
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

/** «600'435 / 199'506» */
export function formatLv03(p: Punkt): string {
  const [e, n] = proj4('WGS84', LV03, [p.lon, p.lat]);
  return `${tausender(e)} / ${tausender(n)}`;
}

const utmDef = (zone: number, band: string): string => `+proj=utm +zone=${zone} ${band < 'N' ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;

/** «32T 381613 5200408» (Zone, Band, Ost, Nord in m); Polargebiete: «–». */
export function formatUtm(p: Punkt): string {
  try {
    const m = /^(\d{1,2})([A-Z])/.exec(mgrsForward([p.lon, p.lat], 5));
    if (!m) return '–';
    const [e, n] = proj4('WGS84', utmDef(Number(m[1]), m[2]), [p.lon, p.lat]);
    return `${m[1]}${m[2]} ${Math.round(e)} ${Math.round(n)}`;
  } catch {
    return '–';
  }
}

/** «46°57'03" N 7°26'51" E» (Sekunden gerundet) */
export function formatWgs84Gms(p: Punkt): string {
  const teil = (x: number): string => {
    const s = Math.round(Math.abs(x) * 3600);
    return `${Math.floor(s / 3600)}°${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}'${String(s % 60).padStart(2, '0')}"`;
  };
  return `${teil(p.lat)} ${p.lat >= 0 ? 'N' : 'S'} ${teil(p.lon)} ${p.lon >= 0 ? 'E' : 'W'}`;
}

export function formatKoord(p: Punkt, f: KoordFormat): string {
  switch (f) {
    case 'lv95': return formatLv95(p);
    case 'lv03': return formatLv03(p);
    case 'mgrs': return formatMgrs(p);
    case 'utm': return formatUtm(p);
    case 'wgsgms': return formatWgs84Gms(p);
    default: return formatWgs84(p);
  }
}

// --- Eingabe erkennen ---------------------------------------------------------

export type KoordTreffer = { punkt: Punkt; format: KoordFormat };
const imBereich = (x: number, min: number, max: number) => x >= min && x <= max;
const punktOk = (lat: number, lon: number): Punkt | null =>
  Number.isFinite(lat) && Number.isFinite(lon) && imBereich(lat, -90, 90) && imBereich(lon, -180, 180) ? { lat, lon } : null;

function parseMgrs(e: string): KoordTreffer | null {
  const kompakt = e.replace(/\s+/g, '').toUpperCase();
  const m = /^(\d{1,2})[C-HJ-NP-X][A-HJ-NP-Z][A-HJ-NP-V](\d{2,10})$/.exec(kompakt);
  if (!m || m[2].length % 2 || Number(m[1]) < 1 || Number(m[1]) > 60) return null;
  try {
    const [lon, lat] = mgrsToPoint(kompakt);
    const p = punktOk(lat, lon);
    return p && { punkt: p, format: 'mgrs' };
  } catch {
    return null;
  }
}

function parseUtm(e: string): KoordTreffer | null {
  const m = /^(\d{1,2})\s*([C-HJ-NP-X])\s+(\d{5,6}(?:\.\d+)?)\s*m?E?\s*[\s/,;]\s*(\d{1,8}(?:\.\d+)?)\s*m?N?$/i.exec(e);
  if (!m) return null;
  const zone = Number(m[1]);
  const [ost, nord] = [Number(m[3]), Number(m[4])];
  if (zone < 1 || zone > 60 || !imBereich(ost, 100_000, 900_000) || nord > 10_000_000) return null;
  const [lon, lat] = proj4(utmDef(zone, m[2].toUpperCase()), 'WGS84', [ost, nord]);
  const p = punktOk(lat, lon);
  return p && { punkt: p, format: 'utm' };
}

/** Schweizer Koordinaten: nur Ziffern, Trenner, Apostrophe und Beschriftung E/N/Y/X/LV95/LV03 erlaubt. */
function parseLv(e: string): KoordTreffer | null {
  if (!/^[\d\s'’ʼ´`.,/;:ENYXLVenyxlv]+$/.test(e)) return null;
  const t = e.replace(/LV\s*(95|03)/gi, ' ').replace(/[ENYXenyx:]/g, ' ').replace(/(?<=\d)['’ʼ´`](?=\d)/g, '');
  // mit «/» oder «;» dürfen Leerzeichen als Tausendertrenner in den Zahlen stehen
  const teile = (/[/;]/.test(t) ? t.split(/[/;]/).map((x) => x.replace(/\s+/g, '')) : t.trim().split(/\s*,\s+|\s+|,(?=\d{6})/)).filter(Boolean);
  if (teile.length !== 2 || !teile.every((x) => /^\d+(\.\d+)?$/.test(x))) return null;
  const [a, b] = teile.map(Number);
  // Reihenfolge Ost/Nord oder Nord/Ost: Ost ist in beiden Systemen die grössere Zahl
  const [o, n] = a > b ? [a, b] : [b, a];
  const lv95 = imBereich(o, 2_400_000, 2_900_000) && imBereich(n, 1_000_000, 1_350_000);
  const lv03 = imBereich(o, 400_000, 900_000) && imBereich(n, 50_000, 350_000);
  if (!lv95 && !lv03) return null;
  const [lon, lat] = proj4(lv95 ? LV95 : LV03, 'WGS84', [o, n]);
  const p = punktOk(lat, lon);
  return p && { punkt: p, format: lv95 ? 'lv95' : 'lv03' };
}

/**
 * Dezimalgrad, Grad/Dezimalminuten und Grad/Minuten/Sekunden; N/S/E/W/O vor oder nach der Zahl, Vorzeichen,
 * Symbole ° ' " und Trenner (Leerzeichen, Komma, Semikolon, Schrägstrich). Ohne Buchstaben: Breite zuerst.
 */
function parseWgs(e: string): KoordTreffer | null {
  if (!/^[\d\s.,;/°º˚'’′"”″NSEWOnsewo+-]+$/.test(e)) return null;
  const t = e.includes('.') ? e : e.replace(/(\d),(\d)/g, '$1.$2'); // Dezimalkomma, solange kein Punkt vorkommt
  const tokens = [...t.matchAll(/([NSEWO])|([+-]?\d+(?:\.\d+)?)/gi)].map((m) => m[1]?.toUpperCase() ?? m[2]);
  const buchstaben = tokens.filter((x) => /^[A-Z]$/.test(x));
  const zahlen = tokens.filter((x) => !/^[A-Z]$/.test(x));
  const n = zahlen.length;
  if (![2, 4, 6].includes(n) || (buchstaben.length !== 0 && buchstaben.length !== 2)) return null;
  const k = n / 2;
  const achseWert = (z: string[], negBuchstabe: boolean): number | null => {
    const w = z.map((x) => Math.abs(Number(x)));
    if (w.slice(1).some((x) => x >= 60)) return null;
    return (z[0].startsWith('-') || negBuchstabe ? -1 : 1) * w.reduce((s, x, i) => s + x / 60 ** i, 0);
  };
  let latErst = true;
  let negErst = false;
  let negZweit = false;
  if (buchstaben.length === 2) {
    const [b1, b2] = buchstaben;
    const istLat = (b: string) => b === 'N' || b === 'S';
    if (istLat(b1) === istLat(b2)) return null; // zwei Breiten oder zwei Längen
    latErst = istLat(b1);
    negErst = b1 === 'S' || b1 === 'W';
    negZweit = b2 === 'S' || b2 === 'W';
  }
  const erst = achseWert(zahlen.slice(0, k), negErst);
  const zweit = achseWert(zahlen.slice(k), negZweit);
  if (erst === null || zweit === null) return null;
  let [lat, lon] = latErst ? [erst, zweit] : [zweit, erst];
  if (buchstaben.length === 0 && Math.abs(lat) > 90 && Math.abs(lon) <= 90) [lat, lon] = [lon, lat];
  const p = punktOk(lat, lon);
  return p && { punkt: p, format: k === 1 ? 'wgs84' : 'wgsgms' };
}

/** Erkennt das Format aus der Eingabe. `null`, wenn nichts passt oder die Werte ausserhalb des Gültigen liegen. */
export function parseKoord(eingabe: string): KoordTreffer | null {
  const e = eingabe.trim();
  return e ? (parseMgrs(e) ?? parseUtm(e) ?? parseLv(e) ?? parseWgs(e)) : null;
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
