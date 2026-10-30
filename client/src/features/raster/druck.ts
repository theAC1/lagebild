// PDF-Ausdruck eines Führungsrasters: Blattgeometrie, Massstab, Köpfe und Kachelplan. Rein rechnerisch (Tests: druck.test.ts).
// Das Blatt ist nordausgerichtet in LV95 (Raster achsparallel wie auf der Landeskarte); das Luftbild (Web-Mercator-Kacheln)
// wird per affiner Abbildung daraufgelegt. Einheit auf dem Blatt: Punkt (1/72 Zoll).
import type { RasterArt } from '../../../../shared/protocol.ts';
import { vonLv95, rasterMitteLv95, type Lv95, type RasterGeo } from '../../../../shared/raster.ts';
import { koepfe, type Kopf, type Masse, type Xy } from './beschriftung.ts';

export type Format = { name: string; w: number; h: number };
export const A4_QUER: Format = { name: 'A4', w: 842, h: 595 };
// ponytail: nur A4 in der Bedienung; A3 quer wäre { name: 'A3', w: 1191, h: 842 }, alles Weitere rechnet sich gleich.

export type Rechteck = { x: number; y: number; w: number; h: number };
/** Punkt auf Papier in Metern */
const M_JE_PT = 0.0254 / 72;
export const RAND = 20;
export const TITEL_H = 30;
/** Köpfe: Höhe, Mindestbreite Spaltenkopf «21», Breite Zeilenkopf «H» */
export const KOPF: Masse = { h: 13, wSpalte: 16, wZeile: 13 };

export type Blatt = {
  format: Format;
  /** Kartenfeld (Luftbild) unter der Titelzeile */
  karte: Rechteck;
  /** Rahmen des Rasters */
  rahmen: Rechteck;
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

/** Raster mittig ins Kartenfeld, mit Platz für die Köpfe rundum, im kleinsten runden Massstab, der passt. */
export function blatt(r: RasterGeo, format: Format = A4_QUER): Blatt {
  const karte = { x: RAND, y: RAND + TITEL_H, w: format.w - 2 * RAND, h: format.h - 2 * RAND - TITEL_H };
  const platzW = karte.w - 2 * (KOPF.wZeile + 2);
  const platzH = karte.h - 2 * (KOPF.h + 2);
  const breiteM = r.spalten * r.zellM;
  const hoeheM = r.zeilen * r.zellM;
  const massstab = runderMassstab(Math.max(breiteM / platzW, hoeheM / platzH) / M_JE_PT);
  const ptJeM = 1 / (massstab * M_JE_PT);
  const mitte = rasterMitteLv95(r);
  const cx = karte.x + karte.w / 2;
  const cy = karte.y + karte.h / 2;
  const zu = (p: Lv95): Xy => ({ x: cx + (p.e - mitte.e) * ptJeM, y: cy - (p.n - mitte.n) * ptJeM });
  const von = (p: Xy): Lv95 => ({ e: mitte.e + (p.x - cx) / ptJeM, n: mitte.n - (p.y - cy) / ptJeM });
  const ol = zu({ e: r.e, n: r.n });
  return { format, karte, rahmen: { x: ol.x, y: ol.y, w: breiteM * ptJeM, h: hoeheM * ptJeM }, massstab, ptJeM, zu, von };
}

/** Zeilen- und Spaltenköpfe rundum (dieselbe Logik wie auf der Karte, ohne Namensschild). */
export const blattKoepfe = (r: RasterGeo & { art: RasterArt }, b: Blatt): Kopf[] =>
  koepfe(r, b.zu, { links: b.karte.x, oben: b.karte.y, rechts: b.karte.x + b.karte.w, unten: b.karte.y + b.karte.h }, KOPF).filter((k) => k.seite !== 'name');

/** «1:6'500» */
export const massstabText = (n: number): string => `1:${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;

// --- Kacheln ---------------------------------------------------------------------------------------------

/** Erdumfang am Äquator (Web-Mercator) */
const UMFANG = 40_075_016.686;
export const TILE = 256;
/** Höchste Kachelstufe fürs Luftbild: so weit laden Offline-Gebiete ohne «Volles Detail» (LUFTBILD_STANDARD_Z). */
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
 * Welche Kacheln das Kartenfeld abdecken und wie sie aufs Blatt kommen. Stufe so, dass ein Kachelpixel etwa einem
 * Bildpixel bei `pxJePt` entspricht (höchstens MAX_Z).
 */
export function kachelPlan(b: Blatt, pxJePt: number): KachelPlan {
  const { x, y, w, h } = b.karte;
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
