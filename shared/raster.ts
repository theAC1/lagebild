// Führungsraster: reine Geometrie und Ansprache (Zelle ↔ Punkt). Genutzt von Client (Karte, Melden, Koordinatenleiste),
// Server (GeoJSON-Export) und später vom PDF-Export. Gerechnet wird in LV95, weil das Raster parallel zum LV95-Gitter liegt.
import proj4 from 'proj4';
import type { Punkt, RasterArt, RasterDef } from './protocol.ts';

/** LV95 (EPSG:2056) für proj4; lib/coords.ts nutzt dieselbe Definition. */
export const LV95_PROJ =
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs';

export type Lv95 = { e: number; n: number };
/** Nur die Geometrie eines Rasters (RasterDef ohne Art, auch für ein Raster aus dem Server). */
export type RasterGeo = Pick<RasterDef, 'e' | 'n' | 'zeilen' | 'spalten' | 'zellM'>;
/** Viertel einer Zelle: A oben links, B oben rechts, C unten links, D unten rechts (Juans Vorlage). */
export type Quadrant = 'A' | 'B' | 'C' | 'D';
export const QUADRANTEN: Quadrant[] = ['A', 'B', 'C', 'D'];
/** Zeile und Spalte ab 0 (Zeile 0 = «A» oben, Spalte 0 = «01» links). */
export type Zelle = { zeile: number; spalte: number; quadrant: Quadrant | null };

export const RASTER_NAME: Record<RasterArt, string> = { grande: 'Grande', piccolo: 'Piccolo' };
/** Vorgabe wie Juans Vorlage: 21 Spalten × 15 Zeilen; Grande 80 m, Piccolo 10 m je Zelle. */
export const RASTER_VORGABE: Record<RasterArt, Pick<RasterDef, 'zeilen' | 'spalten' | 'zellM'>> = {
  grande: { zeilen: 15, spalten: 21, zellM: 80 },
  piccolo: { zeilen: 15, spalten: 21, zellM: 10 },
};

const NATO = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-Ray', 'Yankee', 'Zulu'];

export const zuLv95 = (p: Punkt): Lv95 => {
  const [e, n] = proj4('WGS84', LV95_PROJ, [p.lon, p.lat]);
  return { e, n };
};
export const vonLv95 = (p: Lv95): Punkt => {
  const [lon, lat] = proj4(LV95_PROJ, 'WGS84', [p.e, p.n]);
  return { lat, lon };
};

export const zeilenName = (i: number): string => String.fromCharCode(65 + i);
export const spaltenName = (i: number): string => String(i + 1).padStart(2, '0');

/** «H 09 C» bzw. «H 09» ohne Quadrant. */
export const ansprache = (z: Zelle): string => [zeilenName(z.zeile), spaltenName(z.spalte), z.quadrant].filter(Boolean).join(' ');
/** Für den Funk: «Hotel 09 Charlie». */
export const funkAnsprache = (z: Zelle): string => [NATO[z.zeile], spaltenName(z.spalte), z.quadrant && NATO[z.quadrant.charCodeAt(0) - 65]].filter(Boolean).join(' ');

/** Zelle samt Quadrant unter einem LV95-Punkt; null ausserhalb. Rand rechts/unten gehört nicht mehr dazu. */
export function zelleLv95(r: RasterGeo, p: Lv95): Zelle | null {
  const x = (p.e - r.e) / r.zellM;
  const y = (r.n - p.n) / r.zellM;
  const spalte = Math.floor(x);
  const zeile = Math.floor(y);
  if (spalte < 0 || zeile < 0 || spalte >= r.spalten || zeile >= r.zeilen) return null;
  const rechts = x - spalte >= 0.5;
  const unten = y - zeile >= 0.5;
  return { zeile, spalte, quadrant: unten ? (rechts ? 'D' : 'C') : rechts ? 'B' : 'A' };
}
export const zelleVon = (r: RasterGeo, p: Punkt): Zelle | null => zelleLv95(r, zuLv95(p));

/** Mitte der Zelle bzw. ihres Viertels in LV95. */
export function zellMitteLv95(r: RasterGeo, z: Zelle): Lv95 {
  const q = z.quadrant ? QUADRANTEN.indexOf(z.quadrant) : -1;
  const dx = q < 0 ? 0.5 : q % 2 ? 0.75 : 0.25;
  const dy = q < 0 ? 0.5 : q >= 2 ? 0.75 : 0.25;
  return { e: r.e + (z.spalte + dx) * r.zellM, n: r.n - (z.zeile + dy) * r.zellM };
}
export const zellMitte = (r: RasterGeo, z: Zelle): Punkt => vonLv95(zellMitteLv95(r, z));

/** Ecken der Zelle bzw. ihres Viertels als geschlossener Ring (WGS84), z.B. zum Hervorheben. */
export function zellRing(r: RasterGeo, z: Zelle): Punkt[] {
  const m = zellMitteLv95(r, z);
  const h = (z.quadrant ? 0.25 : 0.5) * r.zellM;
  return ringLv95(m.e - h, m.n + h, m.e + h, m.n - h);
}

/** «H 09 C», «h9c», «H09» → Zelle (ohne Bereichsprüfung, siehe imRaster). */
export function parseAnsprache(text: string): Zelle | null {
  const m = /^\s*([A-Za-z])\s*0?(\d{1,2})\s*([A-Da-d])?\s*$/.exec(text);
  if (!m || Number(m[2]) < 1) return null;
  return { zeile: m[1].toUpperCase().charCodeAt(0) - 65, spalte: Number(m[2]) - 1, quadrant: (m[3]?.toUpperCase() as Quadrant | undefined) ?? null };
}
export const imRaster = (r: RasterGeo, z: Zelle): boolean => z.zeile >= 0 && z.spalte >= 0 && z.zeile < r.zeilen && z.spalte < r.spalten;

/** Raster mit Mitte `m` (auf ganze Meter gerundet, damit Ausdrucke runde Werte zeigen). */
export function rasterUm(m: Lv95, g: Pick<RasterDef, 'zeilen' | 'spalten' | 'zellM'>): RasterGeo {
  return { ...g, e: Math.round(m.e - (g.spalten * g.zellM) / 2), n: Math.round(m.n + (g.zeilen * g.zellM) / 2) };
}
export const rasterMitteLv95 = (r: RasterGeo): Lv95 => ({ e: r.e + (r.spalten * r.zellM) / 2, n: r.n - (r.zeilen * r.zellM) / 2 });

function ringLv95(e1: number, n1: number, e2: number, n2: number): Punkt[] {
  const r = [vonLv95({ e: e1, n: n1 }), vonLv95({ e: e2, n: n1 }), vonLv95({ e: e2, n: n2 }), vonLv95({ e: e1, n: n2 })];
  return [...r, r[0]];
}
/** Aussenrahmen als geschlossener Ring (WGS84): oben links, oben rechts, unten rechts, unten links, oben links. */
export const rahmen = (r: RasterGeo): Punkt[] => ringLv95(r.e, r.n, r.e + r.spalten * r.zellM, r.n - r.zeilen * r.zellM);

// ponytail: Linien nur mit Endpunkten. LV95-Geraden sind in Web-Mercator leicht gekrümmt; bei ≤ 100 km Ausdehnung
// bleibt das unter einem Pixel bis Zoom ~14, bei Bedarf Linien unterteilen.
/**
 * Innere Linien: `teilung` 1 = Zellgrenzen, 2 = nur die Viertellinien (Zellmitten). Je Linie zwei Punkte (WGS84).
 */
export function linien(r: RasterGeo, teilung: 1 | 2): Punkt[][] {
  const o = teilung === 2 ? 0.5 : 0;
  const unten = r.n - r.zeilen * r.zellM;
  const rechts = r.e + r.spalten * r.zellM;
  const senk = Array.from({ length: r.spalten - (teilung === 1 ? 1 : 0) }, (_, i) => r.e + (i + (teilung === 1 ? 1 : o)) * r.zellM);
  const waag = Array.from({ length: r.zeilen - (teilung === 1 ? 1 : 0) }, (_, i) => r.n - (i + (teilung === 1 ? 1 : o)) * r.zellM);
  return [
    ...senk.map((e) => [vonLv95({ e, n: r.n }), vonLv95({ e, n: unten })]),
    ...waag.map((n) => [vonLv95({ e: r.e, n }), vonLv95({ e: rechts, n })]),
  ];
}
