// Reine Geometrie fürs Zeichnen: Pixel-Treffer, Fang, Masse, lokale Ebene für taktische Zeichen.
import type { Punkt } from '../../../../shared/protocol.ts';
import { distanz, versetze } from '../../lib/coords.ts';

export type Px = { x: number; y: number };

const ERDRADIUS = 6371008.8;
const rad = (g: number) => (g * Math.PI) / 180;

// --- Pixel-Geometrie ----------------------------------------------------------------------

export const abstandPx = (a: Px, b: Px): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Nächster Punkt auf der Strecke a–b zu p. */
export function lotPunkt(p: Px, a: Px, b: Px): Px {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export const abstandZuStrecke = (p: Px, a: Px, b: Px): number => abstandPx(p, lotPunkt(p, a, b));

/** Kleinster Abstand von p zu einer Polylinie (geschlossen: inkl. Schlusskante). */
export function abstandZuLinie(p: Px, linie: Px[], geschlossen = false): number {
  if (linie.length === 1) return abstandPx(p, linie[0]);
  let min = Infinity;
  const n = geschlossen ? linie.length : linie.length - 1;
  for (let i = 0; i < n; i++) min = Math.min(min, abstandZuStrecke(p, linie[i], linie[(i + 1) % linie.length]));
  return min;
}

/** Punkt in Polygon (Strahlverfahren, gerade/ungerade). */
export function imPolygon(p: Px, poly: Px[]): boolean {
  let drin = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

/** Lasso: alle Punkte der Form liegen innerhalb des Umrisses. */
export const imLasso = (punkte: Px[], lasso: Px[]): boolean => lasso.length >= 3 && punkte.length > 0 && punkte.every((p) => imPolygon(p, lasso));

export type FangArt = 'punkt' | 'strecke';
export type Fang = Px & { art: FangArt };

/**
 * Fang: zuerst der nächste Stützpunkt/Marker innerhalb `toleranz`, sonst das nächste Liniensegment.
 * Punkte haben Vorrang, auch wenn ein Segment näher liegt (sonst rutscht man am Eckpunkt vorbei).
 */
export function fange(p: Px, punkte: Px[], strecken: [Px, Px][], toleranz = 10): Fang | null {
  let best: Fang | null = null;
  let d = toleranz;
  for (const q of punkte) {
    const a = abstandPx(p, q);
    if (a <= d) {
      d = a;
      best = { x: q.x, y: q.y, art: 'punkt' };
    }
  }
  if (best) return best;
  for (const [a, b] of strecken) {
    const l = lotPunkt(p, a, b);
    const ab = abstandPx(p, l);
    if (ab <= d) {
      d = ab;
      best = { ...l, art: 'strecke' };
    }
  }
  return best;
}

// --- Masse auf der Erde -------------------------------------------------------------------

export function laenge(punkte: Punkt[], geschlossen = false): number {
  let s = 0;
  for (let i = 1; i < punkte.length; i++) s += distanz(punkte[i - 1], punkte[i]);
  if (geschlossen && punkte.length > 2) s += distanz(punkte.at(-1)!, punkte[0]);
  return s;
}

/** Fläche eines Rings in m² auf der Kugel (Chamberlain & Duquette, wie in GeoJSON-Werkzeugen üblich). */
export function flaeche(ring: Punkt[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    s += rad(b.lon - a.lon) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)));
  }
  return Math.abs((s * ERDRADIUS * ERDRADIUS) / 2);
}

/** «850 m²», «4.2 ha», «12.5 km²» */
export function formatFlaeche(m2: number): string {
  if (m2 < 10_000) return `${Math.round(m2)} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(m2 < 100_000 ? 2 : 1)} ha`;
  return `${(m2 / 1_000_000).toFixed(m2 < 10_000_000 ? 2 : 1)} km²`;
}

/** Kreis als Ring (ohne Schlusspunkt). */
export const kreisRing = (mitte: Punkt, radiusM: number, n = 64): Punkt[] => Array.from({ length: n }, (_, i) => versetze(mitte, radiusM, (i * 360) / n));

/** Achsenparalleles Rechteck aus zwei gegenüberliegenden Ecken. */
export const rechteckRing = (a: Punkt, b: Punkt): Punkt[] => [a, { lat: a.lat, lon: b.lon }, b, { lat: b.lat, lon: a.lon }];

/** Meter je Bildschirmpixel bei Zoom z (512er-Kacheln wie MapLibre) und Breite lat. */
export const meterJePixel = (lat: number, zoom: number): number => (40075016.686 * Math.cos(rad(lat))) / (512 * 2 ** zoom);

/** Schwerpunkt der Punkte (für Beschriftungen in Flächen); bei Ringen gut genug. */
export function mittelpunkt(punkte: Punkt[]): Punkt {
  const s = punkte.reduce((a, p) => ({ lat: a.lat + p.lat, lon: a.lon + p.lon }), { lat: 0, lon: 0 });
  return { lat: s.lat / punkte.length, lon: s.lon / punkte.length };
}

/** Punkt auf halber Länge einer Polylinie. */
export function linienMitte(punkte: Punkt[]): Punkt {
  const halb = laenge(punkte) / 2;
  let s = 0;
  for (let i = 1; i < punkte.length; i++) {
    const d = distanz(punkte[i - 1], punkte[i]);
    if (s + d >= halb && d > 0) {
      const t = (halb - s) / d;
      const [a, b] = [punkte[i - 1], punkte[i]];
      return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
    }
    s += d;
  }
  return punkte[0];
}

// --- Lokale Ebene (Meter) für taktische Zeichen -------------------------------------------

export type Xy = [number, number];

/** Equirektangulär um einen Ursprung: genau genug für Zeichen von einigen Kilometern. */
export function lokal(ursprung: Punkt) {
  const k = Math.cos(rad(ursprung.lat));
  const m = (ERDRADIUS * Math.PI) / 180;
  return {
    hin: (p: Punkt): Xy => [(p.lon - ursprung.lon) * k * m, (p.lat - ursprung.lat) * m],
    zurueck: ([x, y]: Xy): Punkt => ({ lat: ursprung.lat + y / m, lon: ursprung.lon + x / (k * m) }),
  };
}

const sub = (a: Xy, b: Xy): Xy => [a[0] - b[0], a[1] - b[1]];
const add = (a: Xy, b: Xy): Xy => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Xy, s: number): Xy => [a[0] * s, a[1] * s];
const norm = (a: Xy): Xy => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
/** Linksnormale (90° gegen den Uhrzeigersinn). */
const links = (a: Xy): Xy => [-a[1], a[0]];

/** Pfeilspitze am Ende b (aus Richtung a): zwei Schenkel der Länge `l`, je `winkelGrad` zur Achse. */
export function pfeilspitze(a: Xy, b: Xy, l: number, winkelGrad = 28): [Xy, Xy, Xy] {
  const r = norm(sub(a, b)); // zurück entlang der Linie
  const w = rad(winkelGrad);
  const dreh = (v: Xy, t: number): Xy => [v[0] * Math.cos(t) - v[1] * Math.sin(t), v[0] * Math.sin(t) + v[1] * Math.cos(t)];
  return [add(b, mul(dreh(r, w), l)), b, add(b, mul(dreh(r, -w), l))];
}

/** Polylinie um `d` nach links versetzt (Gehrung an Knicken, begrenzt auf 3·d). */
export function versatz(linie: Xy[], d: number): Xy[] {
  return linie.map((p, i) => {
    const vor = i > 0 ? norm(sub(p, linie[i - 1])) : null;
    const nach = i < linie.length - 1 ? norm(sub(linie[i + 1], p)) : null;
    const n1 = vor ? links(vor) : links(nach!);
    const n2 = nach ? links(nach) : n1;
    const mitte = norm(add(n1, n2));
    const cos = mitte[0] * n1[0] + mitte[1] * n1[1];
    const l = Math.min(Math.abs(d) / Math.max(cos, 1e-6), 3 * Math.abs(d)); // Gehrung, bei spitzen Winkeln begrenzt
    return add(p, mul(mitte, Math.sign(d) * l));
  });
}

/** Punkt in Abstand s entlang der Polylinie und die Richtung dort. */
function entlang(linie: Xy[], s: number): { p: Xy; r: Xy } {
  let rest = s;
  for (let i = 1; i < linie.length; i++) {
    const seg = sub(linie[i], linie[i - 1]);
    const l = Math.hypot(seg[0], seg[1]);
    if (rest <= l || i === linie.length - 1) return { p: add(linie[i - 1], mul(norm(seg), Math.min(rest, l))), r: norm(seg) };
    rest -= l;
  }
  return { p: linie[0], r: [1, 0] };
}

const gesamtLaenge = (linie: Xy[]): number => linie.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - linie[i][0], p[1] - linie[i][1]), 0);

/**
 * Sperre: Zickzack-Zacken links der Linie (Hindernislinie). Liefert die Zackenlinie (Basis–Spitze–Basis …).
 * Abstand `a` zwischen Zackenfüssen, Höhe `h`; mindestens ein Zacken.
 */
export function zacken(linie: Xy[], a: number, h: number): Xy[] {
  const l = gesamtLaenge(linie);
  const n = Math.max(1, Math.floor(l / a));
  const schritt = l / n;
  const aus: Xy[] = [];
  for (let i = 0; i < n; i++) {
    const fuss = entlang(linie, i * schritt);
    const spitze = entlang(linie, (i + 0.5) * schritt);
    aus.push(fuss.p, add(spitze.p, mul(links(spitze.r), h)));
  }
  aus.push(entlang(linie, l).p);
  return aus;
}

/**
 * Stossrichtung: breiter Pfeil entlang der Achse als geschlossener Umriss.
 * Schaft der Breite `b`, Spitze `2b` breit und `1.5b` lang; die Spitze endet genau am letzten Achsenpunkt.
 */
export function stosspfeil(achse: Xy[], b: number): Xy[] {
  const ende = achse.at(-1)!;
  const l = gesamtLaenge(achse);
  const kopf = Math.min(1.5 * b, l * 0.6);
  const ansatz = entlang(achse, l - kopf);
  // Schaft endet am Kopfansatz: Achse bis dorthin kürzen
  const schaft: Xy[] = [];
  let s = 0;
  schaft.push(achse[0]);
  for (let i = 1; i < achse.length; i++) {
    s += Math.hypot(achse[i][0] - achse[i - 1][0], achse[i][1] - achse[i - 1][1]);
    if (s >= l - kopf) break;
    schaft.push(achse[i]);
  }
  schaft.push(ansatz.p);
  const li = versatz(schaft, b / 2);
  const re = versatz(schaft, -b / 2);
  const n = links(ansatz.r);
  return [...li, add(ansatz.p, mul(n, b)), ende, add(ansatz.p, mul(n, -b)), ...re.reverse(), li[0]];
}
