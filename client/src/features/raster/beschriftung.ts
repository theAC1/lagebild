// Zeilen-/Spaltenköpfe rundum (Juans Vorlage): Zahlen oben/unten, Buchstaben links/rechts, aussen am Rahmen.
// Liegt der Rand ausserhalb des freien Kartenbereichs, heften sich die Köpfe an dessen Rand. Rein, ohne DOM.
import { RASTER_NAME, spaltenName, zeilenName, type Lv95, type RasterGeo } from '../../../../shared/raster.ts';
import type { RasterArt } from '../../../../shared/protocol.ts';

export type Xy = { x: number; y: number };
/** Freier Kartenbereich in Kartenpixeln (ohne Kopfzeile, Leisten, Ränder). */
export type Bereich = { links: number; oben: number; rechts: number; unten: number };
export type Seite = 'oben' | 'unten' | 'links' | 'rechts' | 'name';
/** x/y = linke obere Ecke der Box in Kartenpixeln. */
export type Kopf = { text: string; seite: Seite; x: number; y: number; w: number; h: number };
/** h = Höhe aller Köpfe, wSpalte = Mindestbreite «21», wZeile = Breite «H». */
export type Masse = { h: number; wSpalte: number; wZeile: number };

const lerp = (a: Xy, b: Xy, t: number): Xy => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** Punkt auf der (fast senkrechten) Strecke a→b auf Höhe y bzw. der (fast waagrechten) auf Breite x. LV95 ist gegenüber Mercator leicht gedreht. */
const beiY = (a: Xy, b: Xy, y: number): number => lerp(a, b, b.y === a.y ? 0 : (y - a.y) / (b.y - a.y)).x;
const beiX = (a: Xy, b: Xy, x: number): number => lerp(a, b, b.x === a.x ? 0 : (x - a.x) / (b.x - a.x)).y;

export function koepfe(r: RasterGeo & { art: RasterArt }, proj: (p: Lv95) => Xy, b: Bereich, m: Masse): Kopf[] {
  const S = r.zellM;
  const E = (i: number) => r.e + i * S;
  const N = (j: number) => r.n - j * S;
  const tl = proj({ e: r.e, n: r.n });
  const tr = proj({ e: E(r.spalten), n: r.n });
  const bl = proj({ e: r.e, n: N(r.zeilen) });
  const zellB = Math.hypot(tr.x - tl.x, tr.y - tl.y) / r.spalten;
  const zellH = Math.hypot(bl.x - tl.x, bl.y - tl.y) / r.zeilen;
  if (zellB < 2) return []; // zu weit weg: nur der Rahmen
  const { h, wZeile } = m;
  // Zu kleine Zellen: nur jede k-te beschriften, damit sich die Köpfe nicht überlappen
  const kS = Math.max(1, Math.ceil((m.wSpalte + 4) / zellB));
  const kZ = Math.max(1, Math.ceil((h + 4) / zellH));
  const wS = kS === 1 ? Math.min(Math.max(zellB - 4, m.wSpalte), 2 * m.wSpalte) : m.wSpalte;
  // Angeheftete Ränder halten die Ecken für die Köpfe der anderen Richtung frei
  const angeheftet = { oben: tl.y - h < b.oben, unten: bl.y + h > b.unten, links: tl.x - wZeile < b.links, rechts: tr.x + wZeile > b.rechts };
  const frei = {
    links: b.links + (angeheftet.links ? wZeile : 0),
    rechts: b.rechts - (angeheftet.rechts ? wZeile : 0),
    oben: b.oben + (angeheftet.oben ? h : 0),
    unten: b.unten - (angeheftet.unten ? h : 0),
  };
  const aus: Kopf[] = [];

  for (let c = 0; c < r.spalten; c += kS) {
    const a = proj({ e: E(c + 0.5), n: r.n });
    const z = proj({ e: E(c + 0.5), n: N(r.zeilen) });
    const text = spaltenName(c);
    const yO = Math.max(a.y - h, b.oben);
    const obenDa = yO + h <= z.y && yO + h <= b.unten; // Rahmen reicht noch unter den Kopf, Kopf im Bild
    const yU = Math.min(z.y, b.unten - h);
    const untenDa = yU >= a.y && yU >= b.oben && (!obenDa || yU >= yO + h);
    for (const [da, y, seite] of [[obenDa, yO, 'oben'], [untenDa, yU, 'unten']] as const) {
      const x = beiY(a, z, y + h / 2);
      if (da && x - wS / 2 >= frei.links && x + wS / 2 <= frei.rechts) aus.push({ text, seite, x: x - wS / 2, y, w: wS, h });
    }
  }
  for (let j = 0; j < r.zeilen; j += kZ) {
    const a = proj({ e: r.e, n: N(j + 0.5) });
    const z = proj({ e: E(r.spalten), n: N(j + 0.5) });
    const text = zeilenName(j);
    const xL = Math.max(a.x - wZeile, b.links);
    const linksDa = xL + wZeile <= z.x && xL + wZeile <= b.rechts;
    const xR = Math.min(z.x, b.rechts - wZeile);
    const rechtsDa = xR >= a.x && xR >= b.links && (!linksDa || xR >= xL + wZeile);
    for (const [da, x, seite] of [[linksDa, xL, 'links'], [rechtsDa, xR, 'rechts']] as const) {
      const y = beiX(a, z, x + wZeile / 2);
      if (da && y - h / 2 >= frei.oben && y + h / 2 <= frei.unten) aus.push({ text, seite, x, y: y - h / 2, w: wZeile, h });
    }
  }
  // Name über der Ecke oben links; liegt sie ausserhalb, in die freie Ecke des Bereichs geschoben (bleibt erkennbar, welches Raster)
  const nx = Math.max(tl.x - wZeile, frei.links);
  const ny = Math.max(tl.y - 2 * h - 2, frei.oben);
  if (nx < Math.min(tr.x, b.rechts) && ny + h < Math.min(bl.y, b.unten))
    aus.push({ text: RASTER_NAME[r.art], seite: 'name', x: nx, y: ny, w: 0, h });
  return aus;
}

/**
 * Grande und Piccolo gleichzeitig: Köpfe, die einen früheren überdecken, fallen weg (Reihenfolge = Vorrang).
 * Namensschilder haben w = 0 (Breite nach Inhalt); `breite` schätzt sie.
 */
export function ohneUeberlappung<K extends Kopf>(liste: K[], breite: (k: K) => number): K[] {
  const behalten: K[] = [];
  const b = (k: K) => k.w || breite(k);
  for (const k of liste)
    if (!behalten.some((x) => k.x < x.x + b(x) && x.x < k.x + b(k) && k.y < x.y + x.h && x.y < k.y + k.h)) behalten.push(k);
  return behalten;
}
