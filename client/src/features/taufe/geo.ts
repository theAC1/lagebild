// Geometrie der Geländetaufe, rein rechnerisch (testbar): Kachelstücke zuschneiden und zusammenfügen,
// Strassenabschnitt bis zur Kreuzung, Vereinfachen. Gerechnet wird in «Weltkoordinaten» des z14-Kachelgitters
// (1 Einheit = 1/4096 Kachel ≈ 0,4 m bei 47° N); so liegen die Stücke benachbarter Kacheln im selben Raster.
import type { TaufGeometrie } from '../../../../shared/protocol.ts';

export type XY = [number, number];
export type Linie = XY[];
export type Ring = XY[]; // geschlossen: erster = letzter Punkt
/** Kachel, aus der ein Stück stammt (kanonisch, wie MapLibre `_x/_y/_z`). */
export type Kachel = { x: number; y: number; z: number };

const EXTENT = 4096;
const Z = 14;
const WELT = EXTENT * 2 ** Z;
/** Fangtoleranz in Welteinheiten (~0,8 m): gleiche Schnittpunkte zweier Kacheln gelten als ein Knoten. */
export const FANG = 2;

export function zuWelt([lon, lat]: number[]): XY {
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * WELT, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WELT];
}
export function ausWelt([x, y]: XY): XY {
  const n = Math.PI - (2 * Math.PI * y) / WELT;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  // auf 1e-7° runden (~1 cm): kleinere Nachrichten, gleiche Punkte bleiben gleich
  const r = (v: number) => Math.round(v * 1e7) / 1e7;
  return [r((x / WELT) * 360 - 180), r(lat)];
}

/** Ausdehnung einer Kachel in Weltkoordinaten: [minX, minY, maxX, maxY]. */
export function kachelBox(k: Kachel): [number, number, number, number] {
  const g = EXTENT * 2 ** (Z - k.z);
  return [k.x * g, k.y * g, (k.x + 1) * g, (k.y + 1) * g];
}

// --- Zuschneiden auf die Kachel (Vektorkacheln haben einen Puffer über den Rand hinaus) ---------------------

/** Linie auf die Box schneiden (Liang-Barsky je Segment); liefert die Teilstücke innerhalb. */
export function schneideLinie(l: Linie, [x0, y0, x1, y1]: [number, number, number, number]): Linie[] {
  const aus: Linie[] = [];
  let akt: Linie = [];
  const schliesse = () => {
    if (akt.length > 1) aus.push(akt);
    akt = [];
  };
  for (let i = 0; i + 1 < l.length; i++) {
    const [ax, ay] = l[i];
    const [bx, by] = l[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let drin = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) {
        if (q < 0) drin = false;
        continue;
      }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
    if (!drin || t0 > t1) {
      schliesse();
      continue;
    }
    const a: XY = [ax + t0 * dx, ay + t0 * dy];
    const b: XY = [ax + t1 * dx, ay + t1 * dy];
    if (!akt.length) akt.push(a);
    else if (t0 > 0) {
      schliesse();
      akt.push(a);
    }
    akt.push(b);
    if (t1 < 1) schliesse();
  }
  schliesse();
  return aus;
}

/** Ring auf die Box schneiden (Sutherland-Hodgman); null, wenn nichts übrig bleibt. */
export function schneideRing(ring: Ring, [x0, y0, x1, y1]: [number, number, number, number]): Ring | null {
  let pts = ring.slice(0, -1);
  const kanten: [(p: XY) => boolean, (a: XY, b: XY) => XY][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  for (const [innen, schnitt] of kanten) {
    const neu: XY[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      if (innen(b)) {
        if (!innen(a)) neu.push(schnitt(a, b));
        neu.push(b);
      } else if (innen(a)) neu.push(schnitt(a, b));
    }
    pts = neu;
    if (!pts.length) return null;
  }
  return pts.length >= 3 ? [...pts, pts[0]] : null;
}

// --- Knoten mit Fangtoleranz -------------------------------------------------------------------------

/** Vergibt Knoten-IDs; Punkte näher als `tol` bekommen dieselbe ID (Raster-Hash mit Nachbarzellen). */
export class Knoten {
  readonly punkte: XY[] = [];
  private zellen = new Map<string, number[]>();
  constructor(private tol = FANG) {}
  id(p: XY): number {
    const cx = Math.floor(p[0] / this.tol);
    const cy = Math.floor(p[1] / this.tol);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const i of this.zellen.get(`${cx + dx},${cy + dy}`) ?? []) {
          const q = this.punkte[i];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= this.tol) return i;
        }
    const i = this.punkte.push([p[0], p[1]]) - 1;
    const k = `${cx},${cy}`;
    this.zellen.set(k, [...(this.zellen.get(k) ?? []), i]);
    return i;
  }
}

/** Abstand Punkt–Segment (Welteinheiten) und Lage t ∈ [0,1] auf dem Segment. */
export function abstandSegment(p: XY, a: XY, b: XY): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

// --- Strassen: Abschnitt bis zur Kreuzung -----------------------------------------------------------

/**
 * Netz aus Linienstücken (bereits auf ihre Kacheln geschnitten): an der Kachelgrenze treffen sich zwei Stücke
 * in einem Knoten mit Grad 2, eine Kreuzung hat Grad ≥ 3. Liefert vom getippten Segment aus in beide Richtungen
 * den Weg bis zum nächsten Knoten mit Grad ≠ 2 (Kreuzung oder Ende), null ohne Linie in `maxAbstand`.
 * ponytail: nur geteilte Stützpunkte zählen als Kreuzung; Brücken ohne gemeinsamen Punkt (richtig) und
 * Kreuzungen ohne gemeinsamen Punkt in den Daten (falsch) werden gleich behandelt.
 */
export function abschnitt(linien: Linie[], tipp: XY, maxAbstand = Infinity): Linie | null {
  const kn = new Knoten();
  const nachbarn = new Map<number, Set<number>>();
  const verbinde = (a: number, b: number) => {
    if (a === b) return;
    (nachbarn.get(a) ?? nachbarn.set(a, new Set()).get(a)!).add(b);
    (nachbarn.get(b) ?? nachbarn.set(b, new Set()).get(b)!).add(a);
  };
  for (const l of linien) for (let i = 0; i + 1 < l.length; i++) verbinde(kn.id(l[i]), kn.id(l[i + 1]));
  let best: { a: number; b: number; d: number } | null = null;
  for (const [a, ns] of nachbarn)
    for (const b of ns) {
      if (b < a) continue;
      const { d } = abstandSegment(tipp, kn.punkte[a], kn.punkte[b]);
      if (d <= maxAbstand && (!best || d < best.d)) best = { a, b, d };
    }
  if (!best) return null;
  const grad = (n: number) => nachbarn.get(n)?.size ?? 0;
  const laufe = (von: number, nach: number): number[] => {
    const weg = [nach];
    let vor = von;
    let jetzt = nach;
    while (grad(jetzt) === 2) {
      const weiter = [...nachbarn.get(jetzt)!].find((x) => x !== vor)!;
      if (weiter === best.a || weiter === best.b) break; // Ring geschlossen
      weg.push(weiter);
      vor = jetzt;
      jetzt = weiter;
    }
    return weg;
  };
  const rueckwaerts = laufe(best.b, best.a).reverse();
  const vorwaerts = laufe(best.a, best.b);
  return [...rueckwaerts, ...vorwaerts].map((i) => kn.punkte[i]);
}

/**
 * Hängt Linie `neu` an eine bestehende (Multi-)Linie an: Berührt sie ein Ende, wird sie dort verbunden,
 * sonst als weiterer Teil geführt. Teile, die schon enthalten sind, kommen nicht doppelt dazu.
 */
export function haengeAn(teile: Linie[], neu: Linie, tol = FANG): Linie[] {
  const gleich = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
  const schonDa = teile.some((t) => neu.every((p) => t.some((q) => gleich(p, q))));
  if (schonDa) return teile;
  for (let i = 0; i < teile.length; i++) {
    const t = teile[i];
    const n = neu;
    const r = [...n].reverse();
    const verbunden = gleich(t.at(-1)!, n[0]) ? [...t, ...n.slice(1)] : gleich(t.at(-1)!, r[0]) ? [...t, ...r.slice(1)] : gleich(t[0], n.at(-1)!) ? [...n, ...t.slice(1)] : gleich(t[0], r.at(-1)!) ? [...r, ...t.slice(1)] : null;
    if (!verbunden) continue;
    // der verlängerte Teil kann jetzt einen anderen berühren: rekursiv zusammenführen
    return haengeAn(teile.filter((_, j) => j !== i), verbunden, tol);
  }
  return [...teile, neu];
}

// --- Flächen: Stücke über Kachelgrenzen vereinen ---------------------------------------------------------

export type Flaeche = { ringe: Ring[]; kachel: Kachel };

const flaecheInhalt = (r: Ring): number => {
  let s = 0;
  for (let i = 0; i + 1 < r.length; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return s / 2;
};
export function imRing(p: XY, r: Ring): boolean {
  let drin = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}
const imPolygon = (p: XY, ringe: Ring[]): boolean => ringe.length > 0 && imRing(p, ringe[0]) && !ringe.slice(1).some((h) => imRing(p, h));

/**
 * Vereint die Stücke einer Fläche, die eine Kachelgrenze zerschnitten hat, zu Polygonen mit durchgehendem Umriss.
 * Jedes Stück wird auf seine Kachel geschnitten; Kanten auf der gemeinsamen Grenze heben sich gegenseitig auf.
 * Zusammen gehört, was über eine Kachelgrenze am getippten Stück hängt (Nachbargebäude mit gemeinsamer Wand
 * bleiben getrennt, sie liegen in derselben Kachel). Ergebnis: Polygone (Ringe: aussen, Löcher), leer ohne Treffer.
 */
export function vereineFlaeche(stuecke: Flaeche[], tipp: XY): Ring[][] {
  const kn = new Knoten();
  type Box = [number, number, number, number];
  type Teil = { kanten: [number, number][]; kachel: Kachel; ringe: Ring[]; box: Box };
  const teile: Teil[] = [];
  // Naht = Rand der eigenen Kachel. Nicht ans z14-Raster binden: ab Zoom 15 schneidet MapLibre die z14-Kacheln
  // in z15/z16-Stücke (zoomLevelsToOverscale), deren Ränder dazwischen liegen (Fehler «schräge Fassade», 31.10.).
  const aufRand = (p: XY, [x0, y0, x1, y1]: Box, tol = FANG) => Math.abs(p[0] - x0) <= tol || Math.abs(p[0] - x1) <= tol || Math.abs(p[1] - y0) <= tol || Math.abs(p[1] - y1) <= tol;
  for (const s of stuecke) {
    const box = kachelBox(s.kachel);
    const ringe = s.ringe.map((r) => schneideRing(r, box)).filter((r): r is Ring => !!r);
    // nur Stücke, die getippt sind oder an eine Kachelgrenze stossen, können zur Fläche gehören
    if (ringe.length && (imPolygon(tipp, ringe) || ringe.some((r) => r.some((p) => aufRand(p, box))))) teile.push({ kanten: [], kachel: s.kachel, ringe, box });
  }
  // echte Ecken zuerst als Knoten: ein Schnittpunkt (liegt exakt auf dem Rand) fängt sich an ihnen, nicht umgekehrt
  for (const t of teile) for (const r of t.ringe) for (const p of r) if (!aufRand(p, t.box, 1e-6)) kn.id(p);
  for (const t of teile) {
    for (const r of t.ringe) for (let i = 0; i + 1 < r.length; i++) t.kanten.push([kn.id(r[i]), kn.id(r[i + 1])]);
    t.kanten = t.kanten.filter(([a, b]) => a !== b);
  }
  const start = teile.findIndex((t) => imPolygon(tipp, t.ringe));
  if (start < 0) return [];

  // Kanten auf dem Kachelrand an allen dort liegenden Knoten teilen, damit Gegenkanten exakt passen
  const P = kn.punkte;
  const teileKante = ([a, b]: [number, number], [x0, y0, x1, y1]: Box): [number, number][] => {
    const auf = (ax: 0 | 1, v: number) => Math.abs(P[a][ax] - v) <= FANG && Math.abs(P[b][ax] - v) <= FANG;
    const ax: 0 | 1 | -1 = auf(0, x0) || auf(0, x1) ? 0 : auf(1, y0) || auf(1, y1) ? 1 : -1;
    if (ax < 0) return [[a, b]];
    const quer = (1 - ax) as 0 | 1;
    const [lo, hi] = [Math.min(P[a][quer], P[b][quer]), Math.max(P[a][quer], P[b][quer])];
    const dazwischen = P.map((p, i) => i)
      .filter((i) => i !== a && i !== b && Math.abs(P[i][ax] - P[a][ax]) <= FANG && P[i][quer] > lo && P[i][quer] < hi)
      .sort((i, j) => (P[i][quer] - P[j][quer]) * Math.sign(P[b][quer] - P[a][quer]));
    const kette = [a, ...dazwischen, b];
    return kette.slice(1).map((x, i) => [kette[i], x]);
  };
  for (const t of teile) t.kanten = t.kanten.flatMap((k) => teileKante(k, t.box));

  // Nachbarschaft: Gegenkante (b→a) in einem Stück aus einer anderen Kachel
  const wo = new Map<string, number[]>();
  teile.forEach((t, i) => t.kanten.forEach(([a, b]) => wo.set(`${a}>${b}`, [...(wo.get(`${a}>${b}`) ?? []), i])));
  const gruppe = new Set([start]);
  const offen = [start];
  while (offen.length) {
    const i = offen.pop()!;
    for (const [a, b] of teile[i].kanten)
      for (const j of wo.get(`${b}>${a}`) ?? []) {
        const k1 = teile[i].kachel;
        const k2 = teile[j].kachel;
        if (gruppe.has(j) || (k1.x === k2.x && k1.y === k2.y && k1.z === k2.z)) continue;
        gruppe.add(j);
        offen.push(j);
      }
  }

  // Kanten zählen (gerichtet), Gegenkanten heben sich auf
  const zahl = new Map<string, number>();
  for (const i of gruppe)
    for (const [a, b] of teile[i].kanten) {
      const gegen = `${b}>${a}`;
      if ((zahl.get(gegen) ?? 0) > 0) zahl.set(gegen, zahl.get(gegen)! - 1);
      else zahl.set(`${a}>${b}`, (zahl.get(`${a}>${b}`) ?? 0) + 1);
    }
  const aus = new Map<number, number[]>();
  for (const [k, n] of zahl) {
    const [a, b] = k.split('>').map(Number);
    for (let x = 0; x < n; x++) aus.set(a, [...(aus.get(a) ?? []), b]);
  }
  // Ringe ablaufen
  const ringe: Ring[] = [];
  for (const [a0] of aus) {
    while (aus.get(a0)?.length) {
      const ring: number[] = [a0];
      let jetzt = a0;
      for (let schritt = 0; schritt < 1e6; schritt++) {
        const liste = aus.get(jetzt);
        if (!liste?.length) break;
        const weiter = liste.shift()!;
        ring.push(weiter);
        jetzt = weiter;
        if (jetzt === a0) break;
      }
      if (ring.length >= 4 && ring[0] === ring.at(-1)) ringe.push(ohneGeraden(ring.map((i) => P[i])));
    }
  }
  return ordneRinge(ringe.filter((r) => r.length >= 4));
}

/** Punkte auf einer Geraden (z. B. Teilpunkte der aufgehobenen Kachelkante) entfernen; Ring bleibt geschlossen. */
function ohneGeraden(r: Ring): Ring {
  const p = r.slice(0, -1);
  const behalten = p.filter((q, i) => {
    const a = p[(i + p.length - 1) % p.length];
    const b = p[(i + 1) % p.length];
    const kreuz = (q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0]);
    return Math.abs(kreuz) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) > 0.05;
  });
  return behalten.length >= 3 ? [...behalten, behalten[0]] : r;
}

/** Äussere Ringe (grösste zuerst) mit ihren Löchern; Löcher = Ringe innerhalb eines anderen. */
function ordneRinge(ringe: Ring[]): Ring[][] {
  const nachGroesse = [...ringe].sort((a, b) => Math.abs(flaecheInhalt(b)) - Math.abs(flaecheInhalt(a)));
  const polygone: Ring[][] = [];
  for (const r of nachGroesse) {
    const aussen = polygone.find((p) => imRing(r[0], p[0]) && !p.slice(1).some((h) => imRing(r[0], h)));
    if (aussen) aussen.push(r);
    else polygone.push([r]);
  }
  return polygone;
}

// --- Vereinfachen und als GeoJSON ausgeben -----------------------------------------------------------

/** Douglas-Peucker (Welteinheiten); Endpunkte bleiben. */
export function vereinfache(l: XY[], tol: number): XY[] {
  if (l.length <= 2 || tol <= 0) return l;
  const behalten = new Uint8Array(l.length);
  behalten[0] = behalten[l.length - 1] = 1;
  const stapel: [number, number][] = [[0, l.length - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const { d } = abstandSegment(l[i], l[a], l[b]);
      if (d > max) [max, idx] = [d, i];
    }
    if (idx >= 0 && max > tol) {
      behalten[idx] = 1;
      stapel.push([a, idx], [idx, b]);
    }
  }
  return l.filter((_, i) => behalten[i]);
}

const ringVereinfacht = (r: Ring, tol: number): Ring | null => {
  const v = vereinfache(r, tol);
  return v.length >= 4 ? v : null;
};

/** Welt-Geometrie → GeoJSON in WGS84, so lange vereinfacht, bis höchstens `max` Punkte bleiben. */
export function alsGeometrie(g: { linien: Linie[] } | { polygone: Ring[][] }, max: number): TaufGeometrie {
  for (let tol = 0; ; tol = tol ? tol * 2 : 0.5) {
    if ('linien' in g) {
      const ls = g.linien.map((l) => vereinfache(l, tol).map(ausWelt));
      if (ls.flat().length <= max || tol > 1e4) return ls.length === 1 ? { type: 'LineString', coordinates: ls[0] } : { type: 'MultiLineString', coordinates: ls };
    } else {
      const ps = g.polygone.map((p) => p.map((r) => ringVereinfacht(r, tol)).filter((r): r is Ring => !!r)).filter((p) => p.length).map((p) => p.map((r) => r.map(ausWelt)));
      if (ps.flat(2).length <= max || tol > 1e4) return ps.length === 1 ? { type: 'Polygon', coordinates: ps[0] } : { type: 'MultiPolygon', coordinates: ps };
    }
  }
}

/** Linien einer gespeicherten Strassen-/Gewässertaufe in Weltkoordinaten (für das Verlängern). */
export function linienVon(g: TaufGeometrie): Linie[] {
  if (g.type === 'LineString') return [g.coordinates.map(zuWelt)];
  if (g.type === 'MultiLineString') return g.coordinates.map((l) => l.map(zuWelt));
  return [];
}

/** Linien eines Kachelstücks auf die eigene Kachel schneiden (Puffer weg), damit Kachelnähte Grad 2 haben. */
export const linienAufKachel = (linien: Linie[], k: Kachel): Linie[] => linien.flatMap((l) => schneideLinie(l, kachelBox(k)));
