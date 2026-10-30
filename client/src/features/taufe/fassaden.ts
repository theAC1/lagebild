// Fassadenfarben aus der Stossrichtung (Juan, 30.10.): Fassade mit Zutritt (dem Angreifer zugewandt) weiss,
// Rückseite schwarz, Seiten wie beim Flieger: links in Stossrichtung gesehen rot, rechts grün.
import type { Fassade, Taufe, TaufGeometrie } from '../../../../shared/protocol.ts';

export const FASSADE_FARBE: Record<Fassade, string> = { weiss: '#ffffff', schwarz: '#111111', rot: '#e53935', gruen: '#2e7d32' };
export const FASSADE_LABEL: Record<Fassade, string> = { weiss: 'Weiss', schwarz: 'Schwarz', rot: 'Rot', gruen: 'Grün' };
export const FASSADEN: Fassade[] = ['weiss', 'rot', 'schwarz', 'gruen'];

export type Pos = [number, number]; // [lon, lat]
/** Kante des Umrisses (nur Aussenringe) mit Index (fortlaufend über alle Aussenringe) und Normalen nach aussen. */
export type Kante = { i: number; a: Pos; b: Pos; normale: number };

const grad = (r: number) => (r * 180) / Math.PI;
const norm360 = (w: number) => ((w % 360) + 360) % 360;

/** Aussenringe einer Flächen-Geometrie (Linien: keine). */
export function aussenRinge(g: TaufGeometrie): Pos[][] {
  if (g.type === 'Polygon') return [g.coordinates[0] as Pos[]];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p[0] as Pos[]);
  return [];
}

/** Alle Kanten der Aussenringe; Normale = Azimut (° ab Nord, im Uhrzeigersinn) der Richtung aus dem Gebäude hinaus. */
export function kanten(g: TaufGeometrie): Kante[] {
  const aus: Kante[] = [];
  let i = 0;
  for (const ring of aussenRinge(g)) {
    const k = Math.cos((ring[0][1] * Math.PI) / 180);
    // lokale Ebene: x Ost, y Nord; Fläche > 0 = gegen den Uhrzeigersinn → Inneres links der Laufrichtung
    let flaeche = 0;
    for (let j = 0; j + 1 < ring.length; j++) flaeche += ring[j][0] * k * ring[j + 1][1] - ring[j + 1][0] * k * ring[j][1];
    const aussenRechts = flaeche > 0;
    for (let j = 0; j + 1 < ring.length; j++, i++) {
      const a = ring[j];
      const b = ring[j + 1];
      const richtung = grad(Math.atan2((b[0] - a[0]) * k, b[1] - a[1]));
      aus.push({ i, a, b, normale: norm360(richtung + (aussenRechts ? 90 : -90)) });
    }
  }
  return aus;
}

/**
 * Farbe einer Fassade mit Normale `normale` bei Stossrichtung `stoss` (beides Azimut).
 * Zeigt die Fassade dem Angreifer entgegen (Normale ≈ stoss + 180°) → weiss, in Stossrichtung → schwarz,
 * nach links (stoss − 90°) → rot, nach rechts (stoss + 90°) → grün. Grenzen bei ±45°.
 */
export function fassadeAus(normale: number, stoss: number): Fassade {
  const d = norm360(normale - stoss + 180) - 180; // (-180, 180]: 0 = in Stossrichtung
  if (Math.abs(d) <= 45) return 'schwarz';
  if (Math.abs(d) >= 135) return 'weiss';
  return d < 0 ? 'rot' : 'gruen';
}

/** Farbe je Kante: berechnet aus der Stossrichtung, umgefärbte Kanten übersteuern. Ohne Stossrichtung leer. */
export function fassadenFarben(t: Pick<Taufe, 'geometrie' | 'stoss' | 'fassaden'>): { kante: Kante; farbe: Fassade }[] {
  if (t.stoss === null) return [];
  const ueber = new Map(t.fassaden);
  return kanten(t.geometrie).map((kante) => ({ kante, farbe: ueber.get(kante.i) ?? fassadeAus(kante.normale, t.stoss!) }));
}

/**
 * Eine «Fassade» = Folge benachbarter Kanten mit derselben berechneten Farbe (bei verwinkelten Umrissen viele
 * kleine Kanten). Liefert die Kantenindizes der Fassade, zu der Kante `i` gehört – zum gemeinsamen Umfärben.
 */
export function fassadeVonKante(t: Pick<Taufe, 'geometrie' | 'stoss'>, i: number): number[] {
  if (t.stoss === null) return [i];
  const alle = kanten(t.geometrie);
  const k = alle.find((x) => x.i === i);
  if (!k) return [i];
  const ring = alle.filter((x) => ringVon(alle, x) === ringVon(alle, k));
  const farbe = (x: Kante) => fassadeAus(x.normale, t.stoss!);
  const pos = ring.indexOf(k);
  const n = ring.length;
  const treffer = new Set([k.i]);
  for (const schritt of [1, -1])
    for (let s = 1; s < n; s++) {
      const x = ring[(pos + s * schritt + n * n) % n];
      if (farbe(x) !== farbe(k)) break;
      treffer.add(x.i);
    }
  return [...treffer].sort((a, b) => a - b);
}
/** Ring-Nummer einer Kante: Aussenringe folgen lückenlos; ein Ring endet, wo b ≠ a der nächsten Kante ist. */
function ringVon(alle: Kante[], k: Kante): number {
  let r = 0;
  for (let j = 1; j <= k.i; j++) if (alle[j - 1].b[0] !== alle[j].a[0] || alle[j - 1].b[1] !== alle[j].a[1]) r++;
  return r;
}

/** Nächste Farbe beim Umfärben per Tipp. */
export const naechsteFassade = (f: Fassade): Fassade => FASSADEN[(FASSADEN.indexOf(f) + 1) % FASSADEN.length];

/** Kompass-Chips für die Stossrichtung. */
export const KOMPASS: { label: string; grad: number }[] = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'].map((label, i) => ({ label, grad: i * 45 }));
