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

/** Mitte der Polylinie, Punkte im Abstand `d` links/rechts davon und die Drehung der Schrift (Grad im Uhrzeigersinn, nie kopfüber). */
export function mitteQuer(linie: Xy[], d: number): { mitte: Xy; links: Xy; rechts: Xy; drehung: number } {
  const { p, r } = entlang(linie, gesamtLaenge(linie) / 2);
  const n = mul(links(r), d);
  const w = (-Math.atan2(r[1], r[0]) * 180) / Math.PI;
  return { mitte: p, links: add(p, n), rechts: sub(p, n), drehung: Math.abs(w) > 90 ? w - Math.sign(w) * 180 : w };
}

/** Stück der Polylinie zwischen den Abständen `a` und `b` entlang der Linie. */
function zwischen(linie: Xy[], a: number, b: number): Xy[] {
  const aus: Xy[] = [entlang(linie, a).p];
  let t = 0;
  for (let i = 1; i < linie.length; i++) {
    t += Math.hypot(linie[i][0] - linie[i - 1][0], linie[i][1] - linie[i - 1][1]);
    if (t >= b) break;
    if (t > a) aus.push(linie[i]);
  }
  aus.push(entlang(linie, b).p);
  return aus;
}

/**
 * Linie mit `n` gleich verteilten Lücken der Länge `luecke` (n = Länge/`abstand` gerundet, mindestens 1): die Stücke
 * dazwischen und Mitte und Richtung jeder Lücke. Kürzer als zwei Lücken → ganze Linie ohne Lücke.
 */
export function unterbrochen(linie: Xy[], abstand: number, luecke: number): { stuecke: Xy[][]; luecken: { p: Xy; r: Xy }[] } {
  const l = gesamtLaenge(linie);
  if (l < 2 * luecke) return { stuecke: [linie], luecken: [] };
  const n = Math.max(1, Math.round(l / abstand));
  const mitten = Array.from({ length: n }, (_, i) => ((i + 0.5) * l) / n);
  const kanten = [0, ...mitten.flatMap((m) => [m - luecke / 2, m + luecke / 2]), l];
  return { stuecke: Array.from({ length: n + 1 }, (_, i) => zwischen(linie, kanten[2 * i], kanten[2 * i + 1])), luecken: mitten.map((m) => entlang(linie, m)) };
}

/**
 * Pfeil: Schaft und gefüllter Kopf (Dreieck) an der Spitze = letzter Punkt. Kopf `l` lang und `2b` breit, gekürzt
 * auf höchstens 60 % der Linie. Die Richtung kommt aus der Linie über die ganze Kopflänge, nicht aus dem letzten
 * Stück: ein winziges oder leeres Schlussstück (zweites Tippen, Gummiband beim Zeichnen) dreht den Kopf nicht weg.
 * Der Schaft endet in der Kopfmitte, damit seine runde Kappe nicht über die Spitze ragt. Null bei Länge 0.
 */
export function pfeil(achse: Xy[], l: number, b: number): { schaft: Xy[]; kopf: Xy[] } | null {
  const gesamt = gesamtLaenge(achse);
  if (!gesamt) return null;
  const ende = achse.at(-1)!;
  const k = Math.min(l, gesamt * 0.6);
  const r = norm(sub(ende, entlang(achse, gesamt - k).p));
  const fuss = sub(ende, mul(r, k));
  const n = mul(links(r), (b * k) / l);
  return { schaft: zwischen(achse, 0, gesamt - k / 2), kopf: [add(fuss, n), ende, sub(fuss, n), add(fuss, n)] };
}

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
  const schaft = zwischen(achse, 0, l - kopf); // Schaft endet am Kopfansatz
  const li = versatz(schaft, b / 2);
  const re = versatz(schaft, -b / 2);
  const n = links(ansatz.r);
  return [...li, add(ansatz.p, mul(n, b)), ende, add(ansatz.p, mul(n, -b)), ...re.reverse(), li[0]];
}
