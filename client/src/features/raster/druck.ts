// PDF-Ausdruck eines Führungsrasters: Blattgeometrie, Massstab, Tabellenfelder rundum und Kachelplan. Rein rechnerisch
// (Tests: druck.test.ts). Aufbau wie Juans Vorlage: das Raster ist eine Tabelle, die Karte füllt genau den Rahmen, rundum
// Kopf- und Fusszeilen als Felder. Das Blatt ist nordausgerichtet in LV95 (Raster achsparallel wie auf der Landeskarte);
// Luftbild und Landeskarte (Web-Mercator-Kacheln) werden per affiner Abbildung daraufgelegt. Einheit: Punkt (1/72 Zoll).
import type { RasterArt } from '../../../../shared/protocol.ts';
import { RASTER_NAME, spaltenName, vonLv95, rasterMitteLv95, zeilenName, type Lv95, type RasterGeo } from '../../../../shared/raster.ts';
import type { Xy } from './beschriftung.ts';

export type Format = { name: string; w: number; h: number };
export const A4_QUER: Format = { name: 'A4', w: 842, h: 595 };
// ponytail: nur A4 in der Bedienung; A3 quer wäre { name: 'A3', w: 1191, h: 842 }, alles Weitere rechnet sich gleich.

export type Rechteck = { x: number; y: number; w: number; h: number };
/** Punkt auf Papier in Metern */
const M_JE_PT = 0.0254 / 72;
/** Seitenrand (≈ 4 mm, Druckerrand) */
export const RAND = 12;
/** Höhe einer Kopf-/Fusszeile (Titel, Spaltenköpfe, Lage) */
export const BAND = 20;
/** Breite der Zeilenköpfe links und rechts */
export const ZEILE_W = 32;
/** Kleinste Breite bzw. Höhe eines beschrifteten Kopffelds; schmalere Zellen: nur jede k-te beschriften */
const MIN_SPALTE = 16;
const MIN_ZEILE = 12;

export type Blatt = {
  format: Format;
  /** Rahmen des Rasters = Kartenfeld */
  rahmen: Rechteck;
  /** Ganze Tabelle samt Köpfen */
  tabelle: Rechteck;
  /** Massstabszahl N (1:N) */
  massstab: number;
  /** Blattpunkte je Meter im Gelände */
  ptJeM: number;
  zu: (p: Lv95) => Xy;
  von: (p: Xy) => Lv95;
};

/** Runde Massstabszahl ≥ n: Mantisse auf 0,5 aufgerundet (808 → 850, 6461 → 6500, 1000 → 1000). */
export function runderMassstab(n: number): number {
  const stufe = 10 ** Math.floor(Math.log10(n)) / 2;
  return Math.ceil(n / stufe - 1e-9) * stufe;
}

/**
 * Raster samt Tabelle mittig aufs Blatt, im kleinsten runden Massstab, der passt. Senkrecht: Titelzeile, Spaltenköpfe,
 * Karte, Spaltenköpfe, Lagezeile; waagrecht: Zeilenköpfe, Karte, Zeilenköpfe.
 */
export function blatt(r: RasterGeo, format: Format = A4_QUER): Blatt {
  const platzW = format.w - 2 * RAND - 2 * ZEILE_W;
  const platzH = format.h - 2 * RAND - 4 * BAND;
  const breiteM = r.spalten * r.zellM;
  const hoeheM = r.zeilen * r.zellM;
  const massstab = runderMassstab(Math.max(breiteM / platzW, hoeheM / platzH) / M_JE_PT);
  const ptJeM = 1 / (massstab * M_JE_PT);
  const mitte = rasterMitteLv95(r);
  const cx = format.w / 2;
  const cy = format.h / 2;
  const zu = (p: Lv95): Xy => ({ x: cx + (p.e - mitte.e) * ptJeM, y: cy - (p.n - mitte.n) * ptJeM });
  const von = (p: Xy): Lv95 => ({ e: mitte.e + (p.x - cx) / ptJeM, n: mitte.n - (p.y - cy) / ptJeM });
  const ol = zu({ e: r.e, n: r.n });
  const rahmen = { x: ol.x, y: ol.y, w: breiteM * ptJeM, h: hoeheM * ptJeM };
  const tabelle = { x: rahmen.x - ZEILE_W, y: rahmen.y - 2 * BAND, w: rahmen.w + 2 * ZEILE_W, h: rahmen.h + 4 * BAND };
  return { format, rahmen, tabelle, massstab, ptJeM, zu, von };
}

/**
 * Ein Feld der Tabelle. `stil`: hell = weiss mit schwarzer Schrift, grau = grau mit weisser Schrift (wie die Vorlage).
 * `art`: text (Schrift mittig, `mitte` = x der Schriftmitte, falls nicht die Feldmitte), nord (Nordpfeil),
 * massstab (Balken über `n` Zellen = `meter`), lage (Lagename + Zeile).
 */
export type Feld = Rechteck & { text: string; stil: 'hell' | 'grau'; art: 'text' | 'nord' | 'massstab' | 'lage'; mitte?: number; n?: number; meter?: number };

/** Seite des Ausdrucks */
export type SeitenArt = 'luftbild' | 'spotmap' | 'landeskarte';
export const SEITE_NAME: Record<SeitenArt, string> = { luftbild: 'Luftbild', spotmap: 'SpotMap', landeskarte: 'Landeskarte' };

/**
 * Alle Felder rund ums Kartenfeld (Juans Vorlage, ohne Einstufung und ohne Seitenfarben):
 * Ecke oben links Quadranten-Legende A B / C D, darüber rechts davon Massstabsbalken | Seitenart | Rastername,
 * Ecke oben rechts Nordpfeil; Spaltenköpfe oben (hell) und unten (grau), Zeilenköpfe links und rechts (grau),
 * unten die Lagezeile.
 */
export function blattFelder(r: RasterGeo & { art: RasterArt }, b: Blatt, seite: SeitenArt): Feld[] {
  const { x, y, w, h } = b.rahmen;
  const zelle = w / r.spalten;
  const L = x - ZEILE_W;
  const R = x + w;
  const aus: Feld[] = [];
  const feld = (f: Rechteck, text: string, stil: Feld['stil'], extra: Partial<Feld> = {}) => aus.push({ ...f, text, stil, art: 'text', ...extra });

  // Ecken
  ['A', 'B', 'C', 'D'].forEach((q, i) => feld({ x: L + (i % 2) * (ZEILE_W / 2), y: y - 2 * BAND + Math.floor(i / 2) * BAND, w: ZEILE_W / 2, h: BAND }, q, 'hell'));
  feld({ x: R, y: y - 2 * BAND, w: ZEILE_W, h: 2 * BAND }, 'N', 'hell', { art: 'nord' });
  feld({ x: L, y: y + h, w: ZEILE_W, h: 2 * BAND }, '', 'grau');
  feld({ x: R, y: y + h, w: ZEILE_W, h: 2 * BAND }, '', 'grau');

  // Titelzeile in Dritteln über den Spalten
  const a = Math.round(r.spalten / 3);
  const c = Math.round((2 * r.spalten) / 3);
  const n = Math.max(1, Math.round((a * 5) / 7)); // Vorlage: Balken über 5 von 7 Spalten
  const oben = (von: number, bis: number) => ({ x: x + von * zelle, y: y - 2 * BAND, w: (bis - von) * zelle, h: BAND });
  if (a > 0) feld(oben(0, a), `1:${massstabZahl(b.massstab)}`, 'grau', { art: 'massstab', n, meter: n * r.zellM });
  if (c > a) feld(oben(a, c), SEITE_NAME[seite].toUpperCase(), 'hell');
  if (r.spalten > c) feld(oben(c, r.spalten), RASTER_NAME[r.art].toUpperCase(), 'grau');

  // Spaltenköpfe oben und unten, Zeilenköpfe links und rechts; bei schmalen Zellen jede k-te, Feld über k Zellen
  const kS = Math.max(1, Math.ceil(MIN_SPALTE / zelle));
  const kZ = Math.max(1, Math.ceil(MIN_ZEILE / zelle));
  for (let i = 0; i < r.spalten; i += kS) {
    const f = { x: x + i * zelle, w: Math.min(kS, r.spalten - i) * zelle, h: BAND };
    const mitte = x + (i + 0.5) * zelle;
    feld({ ...f, y: y - BAND }, spaltenName(i), 'hell', { mitte });
    feld({ ...f, y: y + h }, spaltenName(i), 'grau', { mitte });
  }
  for (let j = 0; j < r.zeilen; j += kZ) {
    const f = { y: y + j * zelle, w: ZEILE_W, h: Math.min(kZ, r.zeilen - j) * zelle };
    feld({ ...f, x: L }, zeilenName(j), 'grau');
    feld({ ...f, x: R }, zeilenName(j), 'grau');
  }
  feld({ x, y: y + h + BAND, w, h: BAND }, '', 'grau', { art: 'lage' });
  return aus;
}

/** «6'500» */
const massstabZahl = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
/** «1:6'500» */
export const massstabText = (n: number): string => `1:${massstabZahl(n)}`;

// --- Kacheln ---------------------------------------------------------------------------------------------

/** Erdumfang am Äquator (Web-Mercator) */
const UMFANG = 40_075_016.686;
export const TILE = 256;
/** Höchste Kachelstufe: so weit laden Offline-Gebiete das Luftbild ohne «Volles Detail» (LUFTBILD_STANDARD_Z); die Landeskarte endet bei z19. */
export const MAX_Z = 19;

/** Web-Mercator-Pixel auf Stufe z */
export function mercator(lon: number, lat: number, z: number): Xy {
  const s = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s };
}

/** Affine Abbildung [a, b, c, d, e, f] wie Canvas setTransform (x' = a·x + c·y + e, y' = b·x + d·y + f), die s[i] auf d[i] legt. */
export function affin(s: [Xy, Xy, Xy], d: [Xy, Xy, Xy]): [number, number, number, number, number, number] {
  const u = { x: s[1].x - s[0].x, y: s[1].y - s[0].y };
  const v = { x: s[2].x - s[0].x, y: s[2].y - s[0].y };
  const U = { x: d[1].x - d[0].x, y: d[1].y - d[0].y };
  const V = { x: d[2].x - d[0].x, y: d[2].y - d[0].y };
  const det = u.x * v.y - u.y * v.x;
  const a = (U.x * v.y - V.x * u.y) / det;
  const c = (V.x * u.x - U.x * v.x) / det;
  const b = (U.y * v.y - V.y * u.y) / det;
  const dd = (V.y * u.x - U.y * v.x) / det;
  return [a, b, c, dd, d[0].x - a * s[0].x - c * s[0].y, d[0].y - b * s[0].x - dd * s[0].y];
}

export type KachelPlan = {
  z: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Mercator-Pixel relativ zur Ecke von Kachel (x0, y0) → Blattpunkte. Relativ, damit Canvas (float32) genau bleibt. */
  matrix: [number, number, number, number, number, number];
};

/**
 * Welche Kacheln das Kartenfeld (= Rahmen) abdecken und wie sie aufs Blatt kommen. Stufe so, dass ein Kachelpixel etwa einem
 * Bildpixel bei `pxJePt` entspricht (höchstens MAX_Z).
 */
export function kachelPlan(b: Blatt, pxJePt: number): KachelPlan {
  const { x, y, w, h } = b.rahmen;
  const ecken: Xy[] = [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }];
  const geo = ecken.map((p) => vonLv95(b.von(p)));
  const lat = (geo[0].lat + geo[3].lat) / 2;
  const mJePx = 1 / (b.ptJeM * pxJePt);
  const z = Math.max(0, Math.min(MAX_Z, Math.round(Math.log2((UMFANG * Math.cos((lat * Math.PI) / 180)) / (TILE * mJePx)))));
  const merc = geo.map((p) => mercator(p.lon, p.lat, z));
  const xs = merc.map((p) => p.x);
  const ys = merc.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs) / TILE);
  const y0 = Math.floor(Math.min(...ys) / TILE);
  const rel = merc.map((p) => ({ x: p.x - x0 * TILE, y: p.y - y0 * TILE }));
  return {
    z,
    x0,
    x1: Math.floor(Math.max(...xs) / TILE),
    y0,
    y1: Math.floor(Math.max(...ys) / TILE),
    matrix: affin([rel[0], rel[1], rel[2]], [ecken[0], ecken[1], ecken[2]]),
  };
}

/** Dateiname: «lage-grande-2026-10-30.pdf» (nur Buchstaben, Ziffern, Bindestrich). */
export function dateiName(lage: string, art: RasterArt, datum: Date): string {
  const lageTeil = lage
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const tag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
  return `${[lageTeil || 'lage', art, tag].join('-')}.pdf`;
}
