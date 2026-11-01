// Meine Missionen (Spec v7 «Menü», Layout V4 «Karte als Menü»): reine Logik, ohne Svelte testbar.
import type { Phase, Rolle, Taufe, TaufGeometrie } from '../../../shared/protocol.ts';

export type LonLat = [number, number];
/** [[West, Süd], [Ost, Nord]] wie MapLibre LngLatBoundsLike. */
export type Box = [LonLat, LonLat];

/** Eine Mission dieses Geräts (localStorage `lagebild.missionen`): Token und Stand vom letzten Besuch. */
export type MeineMission = {
  lageId: string;
  token: string;
  name: string;
  phase: Phase;
  rolle: Rolle;
  rufname: string;
  funktion: string;
  /** Ausdehnung aller Zielobjekte (Taufen mit `ziel`) beim letzten Besuch. */
  ziele: Box | null;
  /** Letzter Kartenausschnitt dieser Mission auf diesem Gerät. */
  ansicht: { mitte: LonLat; zoom: number } | null;
};

/** Neu oder ersetzt (gleiche Lage), vorne = zuletzt besucht. */
export const mitMission = (liste: MeineMission[], m: MeineMission): MeineMission[] => [m, ...liste.filter((x) => x.lageId !== m.lageId)];

export type Grund = 'neuesToken' | 'beendet' | 'getrennt';
/**
 * Token-Regel nach dem Ende einer Verbindung mit Token `alt` (Gate 01.11.). `gespeichert` = Token dieser Mission frisch aus
 * dem Speicher, nicht aus dem Store: Nach einem Wiederbeitritt (anderer Tab oder dieser) steht dort das neue. Mit einem
 * Token, das der Server eben verworfen hat, wird nie neu verbunden.
 * - 'neuesToken' (Close 4005): Der Server schliesst, bevor die Beitritts-Antwort mit dem neuen Token da ist → warten, bis
 *   ein anderes Token gespeichert ist; nach Ablauf der Frist abmelden.
 * - 'beendet': Ein anderes gespeichertes Token gilt (das 'beendet' betraf das alte), sonst abmelden.
 * - 'getrennt' (Funkloch, Server weg): mit dem gespeicherten, sonst dem bisherigen Token wieder verbinden.
 */
export function weiterNach(grund: Grund, alt: string, gespeichert: string | null, fristUm: boolean): { token: string } | 'warten' | 'abmelden' {
  if (gespeichert && gespeichert !== alt) return { token: gespeichert };
  if (grund === 'getrennt') return { token: alt };
  return grund === 'neuesToken' && !fristUm ? 'warten' : 'abmelden';
}

const punkte = (g: TaufGeometrie): LonLat[] =>
  g.type === 'LineString' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.coordinates.flat();

/** Ausdehnung aller Zielobjekte; null ohne Zielobjekt. */
export function zielBox(taufen: Iterable<Taufe>): Box | null {
  let [w, s, o, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of taufen)
    if (t.ziel)
      for (const [lon, lat] of punkte(t.geometrie)) {
        w = Math.min(w, lon);
        o = Math.max(o, lon);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
  return w <= o ? [[w, s], [o, n]] : null;
}

/** Ort des Fähnchens: Mitte aller Zielobjekte, ohne Zielobjekt der letzte Kartenausschnitt; null ohne beides. */
export const faehnchenOrt = (m: Pick<MeineMission, 'ziele' | 'ansicht'>): LonLat | null =>
  m.ziele ? [(m.ziele[0][0] + m.ziele[1][0]) / 2, (m.ziele[0][1] + m.ziele[1][1]) / 2] : (m.ansicht?.mitte ?? null);

/** Fähnchen in Bildschirmpixeln: Spitze (unten Mitte) am Ort x/y, Breite b. */
export type Fahne = { x: number; y: number; b: number };

/**
 * Nahe Fähnchen auffächern: Überlappende rücken als Reihe nebeneinander, mittig über ihren Orten, nach x geordnet (die
 * Leinen zum echten Ort kreuzen sich nicht). Reihen bleiben zwischen `grenzen` (freie Karte zwischen Menüspalte und
 * Panel); ist eine Reihe breiter, bricht sie in Zeilen übereinander um. Liefert den Versatz je Fähnchen; allein stehende in der freien
 * Karte bleiben bei 0.
 * ponytail: Gruppen verschmelzen paarweise (O(n³)), reicht für die Handvoll Missionen eines Geräts.
 */
export function auffaechern(f: Fahne[], h: number, grenzen: [number, number] = [-Infinity, Infinity], luecke = 6): { dx: number; dy: number }[] {
  let gruppen = f.map((_, i) => [i]);
  const breite = (z: number[]) => z.reduce((s, i) => s + f[i].b, 0) + luecke * (z.length - 1);
  const reihe = (g: number[]) => {
    const mitte = g.reduce((s, i) => s + f[i].x, 0) / g.length;
    const y = g.reduce((s, i) => s + f[i].y, 0) / g.length;
    // nach x geordnet in Zeilen, die in die freie Karte passen (schmales Handy, grosse Schrift); weitere Zeilen darüber
    const zeilen: number[][] = [[]];
    for (const i of [...g].sort((a, b) => f[a].x - f[b].x)) {
      const z = zeilen.at(-1)!;
      if (z.length && breite([...z, i]) > grenzen[1] - grenzen[0]) zeilen.push([i]);
      else z.push(i);
    }
    return zeilen.flatMap((z, k) => {
      let x = Math.max(grenzen[0], Math.min(grenzen[1] - breite(z), mitte - breite(z) / 2));
      return z.map((i) => {
        const l = x;
        x += f[i].b + luecke;
        return { i, l, r: l + f[i].b, y: y - k * (h + luecke) };
      });
    });
  };
  for (;;) {
    const reihen = gruppen.map(reihe);
    const stoesst = (a: number, b: number) =>
      reihen[a].some((p) => reihen[b].some((q) => p.l < q.r + luecke && q.l < p.r + luecke && Math.abs(p.y - q.y) < h));
    let paar: [number, number] | undefined;
    for (let a = 0; a < gruppen.length && !paar; a++) for (let b = a + 1; b < gruppen.length && !paar; b++) if (stoesst(a, b)) paar = [a, b];
    if (!paar) {
      const aus = f.map(() => ({ dx: 0, dy: 0 }));
      for (const r of reihen) for (const p of r) aus[p.i] = { dx: p.l + f[p.i].b / 2 - f[p.i].x, dy: p.y - f[p.i].y };
      return aus;
    }
    const [a, b] = paar;
    gruppen = [...gruppen.filter((_, i) => i !== a && i !== b), [...gruppen[a], ...gruppen[b]]];
  }
}
