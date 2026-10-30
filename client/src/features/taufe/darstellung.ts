// Darstellung der Taufen, angelehnt an Juans SpotMap: GeoJSON-Features für die Karte, Ankerpunkte und
// kollisionsarme Platzierung der Namenskästchen. Rein rechnerisch, damit ein späterer PDF-Export (SpotMap) dieselbe
// Darstellung wiederverwenden kann.
import type { Taufe, TaufFamilie, TaufGeometrie } from '../../../../shared/protocol.ts';
import { FASSADE_FARBE, fassadenFarben, type Pos } from './fassaden.ts';

export const FAMILIE_FARBE: Record<TaufFamilie, string> = { gebaeude: '#ffffff', strasse: '#e53935', gewaesser: '#29b6f6', wald: '#8d5a2b', flaeche: '#e8c547' };
export const ZIEL_FARBE = '#ffeb3b';

const M_JE_GRAD = 111_320;

/** Punkt im Inneren eines Rings (Mitte der breitesten Strecke auf der Höhe des Schwerpunkts; für L- und U-Formen). */
export function innererPunkt(ring: Pos[]): Pos {
  let sx = 0;
  let sy = 0;
  for (const p of ring) [sx, sy] = [sx + p[0], sy + p[1]];
  const y = sy / ring.length;
  const xs: number[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const [a, b] = [ring[i], ring[i + 1]];
    if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  xs.sort((a, b) => a - b);
  let best: Pos = [sx / ring.length, y];
  let breite = -1;
  for (let i = 0; i + 1 < xs.length; i += 2)
    if (xs[i + 1] - xs[i] > breite) [breite, best] = [xs[i + 1] - xs[i], [(xs[i] + xs[i + 1]) / 2, y]];
  return best;
}

const laengeM = (l: Pos[]): number => {
  let s = 0;
  for (let i = 0; i + 1 < l.length; i++) {
    const k = Math.cos((l[i][1] * Math.PI) / 180);
    s += Math.hypot((l[i + 1][0] - l[i][0]) * k, l[i + 1][1] - l[i][1]) * M_JE_GRAD;
  }
  return s;
};
const ringFlaeche = (r: Pos[]): number => {
  let s = 0;
  for (let i = 0; i + 1 < r.length; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(s / 2);
};

export const linienVon = (g: TaufGeometrie): Pos[][] => (g.type === 'LineString' ? [g.coordinates as Pos[]] : g.type === 'MultiLineString' ? (g.coordinates as Pos[][]) : []);
export const polygoneVon = (g: TaufGeometrie): Pos[][][] => (g.type === 'Polygon' ? [g.coordinates as Pos[][]] : g.type === 'MultiPolygon' ? (g.coordinates as Pos[][][]) : []);
export const istLinie = (g: TaufGeometrie): boolean => g.type === 'LineString' || g.type === 'MultiLineString';

/** Anker der Beschriftung: Flächen im Inneren der grössten Fläche, Linien auf halber Länge des längsten Teils (mit Richtung). */
export function labelAnker(g: TaufGeometrie): { punkt: Pos; richtung?: [Pos, Pos] } {
  if (istLinie(g)) {
    const teil = linienVon(g).reduce((a, b) => (laengeM(b) > laengeM(a) ? b : a));
    const halb = laengeM(teil) / 2;
    let s = 0;
    for (let i = 0; i + 1 < teil.length; i++) {
      const d = laengeM([teil[i], teil[i + 1]]);
      if (s + d >= halb || i + 2 === teil.length) {
        const t = d ? (halb - s) / d : 0;
        const [a, b] = [teil[i], teil[i + 1]];
        return { punkt: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], richtung: [a, b] };
      }
      s += d;
    }
    return { punkt: teil[0] };
  }
  const gross = polygoneVon(g).reduce((a, b) => (ringFlaeche(b[0]) > ringFlaeche(a[0]) ? b : a));
  return { punkt: innererPunkt(gross[0]) };
}

/** Pfeil der Stossrichtung: kommt von aussen auf das Objekt zu (Angreiferseite), endet vor dem Umriss. */
export function stossPfeil(t: Pick<Taufe, 'geometrie' | 'stoss'>): { schaft: Pos[]; spitze: Pos[] } | null {
  if (t.stoss === null || istLinie(t.geometrie)) return null;
  const ring = polygoneVon(t.geometrie)[0][0];
  const m = innererPunkt(ring);
  const k = Math.cos((m[1] * Math.PI) / 180);
  const radius = Math.max(...ring.map((p) => Math.hypot((p[0] - m[0]) * k, p[1] - m[1]) * M_JE_GRAD));
  const w = (t.stoss * Math.PI) / 180;
  const punkt = (dM: number, quer = 0): Pos => {
    // dM entlang der Stossrichtung (negativ = Angreiferseite), quer nach rechts
    const ost = dM * Math.sin(w) + quer * Math.cos(w);
    const nord = dM * Math.cos(w) - quer * Math.sin(w);
    return [m[0] + ost / (M_JE_GRAD * k), m[1] + nord / M_JE_GRAD];
  };
  const ende = -(radius + 4);
  const laenge = Math.max(14, Math.min(60, radius));
  const kopf = Math.max(4, laenge * 0.3);
  return { schaft: [punkt(ende - laenge), punkt(ende - kopf * 0.8)], spitze: [punkt(ende), punkt(ende - kopf, kopf * 0.55), punkt(ende - kopf, -kopf * 0.55), punkt(ende)] };
}

/** Alle Kartenobjekte der Taufen (Flächen, Linien, Fassaden, Stosspfeile) als GeoJSON-Features. */
export function taufFeatures(taufen: Iterable<Taufe>): GeoJSON.Feature[] {
  const aus: GeoJSON.Feature[] = [];
  const f = (geometry: GeoJSON.Geometry, p: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', geometry, properties: p });
  for (const t of taufen) {
    const basis = { id: t.id, familie: t.familie, ziel: t.ziel };
    if (istLinie(t.geometrie)) {
      aus.push(f(t.geometrie as GeoJSON.Geometry, { ...basis, rolle: 'linie' }));
      continue;
    }
    aus.push(f(t.geometrie as GeoJSON.Geometry, { ...basis, rolle: 'flaeche' }));
    // Fassaden: aufeinanderfolgende Kanten gleicher Farbe als eine Linie (sauberere Ecken)
    let lauf: { farbe: string; punkte: Pos[]; kante: number } | null = null;
    const schliesse = () => lauf && aus.push(f({ type: 'LineString', coordinates: lauf.punkte }, { ...basis, rolle: 'fassade', farbe: FASSADE_FARBE[lauf.farbe as keyof typeof FASSADE_FARBE], fassade: lauf.farbe, kante: lauf.kante }));
    for (const { kante, farbe } of fassadenFarben(t)) {
      if (lauf && lauf.farbe === farbe && lauf.punkte.at(-1) === kante.a) lauf.punkte.push(kante.b);
      else {
        schliesse();
        lauf = { farbe, punkte: [kante.a, kante.b], kante: kante.i };
      }
    }
    schliesse();
    const pfeil = stossPfeil(t);
    if (pfeil) aus.push(f({ type: 'LineString', coordinates: pfeil.schaft }, { ...basis, rolle: 'pfeil' }), f({ type: 'Polygon', coordinates: [pfeil.spitze] }, { ...basis, rolle: 'pfeilspitze' }));
  }
  return aus;
}

/** Einzelne Fassaden-Kanten (für das Umfärben per Tipp: jede Kante trifft für sich). */
export function fassadenKanten(t: Taufe): GeoJSON.Feature[] {
  return fassadenFarben(t).map(({ kante, farbe }) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [kante.a, kante.b] }, properties: { id: t.id, kante: kante.i, fassade: farbe } }));
}

// --- Platzierung der Namenskästchen -------------------------------------------------------------

export type Box = { x: number; y: number; w: number; h: number };
export type LabelWunsch = {
  id: string;
  /** Anker in Bildschirmpixeln */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Grösse des Objekts am Bildschirm: passt das Kästchen hinein, steht es in der Mitte. */
  objekt?: { w: number; h: number };
  /** Zielobjekte erscheinen immer (notfalls überlappend). */
  immer?: boolean;
  /** Darf mit Führungslinie neben das Objekt (Gebäude). */
  fuehrung?: boolean;
};
export type LabelPlatz = { id: string; dx: number; dy: number; fuehrung: boolean } | { id: string; weg: true };

const schneidet = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Greedy nach Reihenfolge (Priorität): Mitte, wenn das Kästchen ins Objekt passt oder keine Führung erlaubt ist,
 * sonst schräg daneben mit Führungslinie (acht Richtungen, zwei Abstände). Was nirgends frei ist, entfällt.
 * ponytail: O(n²) über die gesetzten Kästchen, reicht für einige hundert Taufen im Bild.
 */
export function platziere(wuensche: LabelWunsch[], abstand = 18): LabelPlatz[] {
  const belegt: Box[] = [];
  const box = (l: LabelWunsch, dx: number, dy: number): Box => ({ x: l.x + dx - l.w / 2 - 2, y: l.y + dy - l.h / 2 - 2, w: l.w + 4, h: l.h + 4 });
  const frei = (b: Box) => !belegt.some((x) => schneidet(x, b));
  return wuensche.map((l) => {
    const passt = !l.objekt || (l.objekt.w >= l.w + 4 && l.objekt.h >= l.h + 2);
    const kandidaten: [number, number, boolean][] = passt || !l.fuehrung ? [[0, 0, false]] : [];
    if (l.fuehrung)
      for (const r of [1, 1.8]) {
        const ox = ((l.objekt?.w ?? 0) / 2 + l.w / 2 + abstand) * r;
        const oy = ((l.objekt?.h ?? 0) / 2 + l.h / 2 + abstand) * r;
        kandidaten.push([ox * 0.7, -oy, true], [-ox * 0.7, -oy, true], [ox * 0.7, oy, true], [-ox * 0.7, oy, true], [0, -oy, true], [0, oy, true], [ox, 0, true], [-ox, 0, true]);
      }
    for (const [dx, dy, fuehrung] of kandidaten) {
      const b = box(l, dx, dy);
      if (frei(b)) {
        belegt.push(b);
        return { id: l.id, dx, dy, fuehrung };
      }
    }
    if (l.immer) {
      const [dx, dy, fuehrung] = kandidaten[0];
      belegt.push(box(l, dx, dy));
      return { id: l.id, dx, dy, fuehrung };
    }
    return { id: l.id, weg: true };
  });
}

/** Reihenfolge der Beschriftung: Zielobjekte, dann Gebäude, Strassen, Gewässer, Wald, Flächen. */
export const LABEL_RANG: Record<TaufFamilie, number> = { gebaeude: 1, strasse: 2, gewaesser: 3, wald: 4, flaeche: 5 };
