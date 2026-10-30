// Offline-Gebiete: welche Kacheln ein Gebiet braucht, wie gross das wird, was beim Löschen weg darf, was abläuft.
// Reine Logik ohne Browser-APIs (Tests: kacheln.test.ts).
import { ABDECKUNG, BASISKARTEN, kachelUrl, TAUFE_VT } from '../../lib/karten.ts';

export type OfflineKarte = 'farbe' | 'luftbild' | 'taufe';
/** [West, Süd, Ost, Nord] in WGS84-Grad */
export type Bbox = [number, number, number, number];

export interface Gebiet {
  id: string;
  name: string;
  bbox: Bbox;
  karten: OfflineKarte[];
  erstellt: number;
  /** Zuletzt eine Kachel daraus angezeigt (oder erstellt/aktualisiert). */
  zuletztGenutzt: number;
  status: 'laeuft' | 'pausiert' | 'fertig';
  /** Kacheln 0 … erledigt-1 sind geladen (Reihenfolge siehe bereiche); Wiederaufnahme ab hier. */
  erledigt: number;
  gesamt: number;
  bytes: number;
  /** Aktualisieren: vorhandene Kacheln neu laden statt überspringen. */
  erneuern?: boolean;
  /** Grund der letzten Unterbrechung, z.B. «Speicher voll». */
  fehler?: string;
}

export interface KartenDef {
  id: OfflineKarte;
  label: string;
  /** https-URL-Vorlage mit {z}/{x}/{y} */
  vorlage: string;
  maxzoom: number;
  /** Gemessene Kachelgrösse in KB je Zoomstufe (Thun, 30.10.2026, siehe docs/recherche/offline-gebiete.md) */
  kb: (z: number) => number;
}

const wmts = (id: 'farbe' | 'luftbild') => BASISKARTEN.find((b) => b.id === id)!;

export const OFFLINE_KARTEN: KartenDef[] = [
  { id: 'farbe', label: 'Landeskarte', vorlage: kachelUrl(wmts('farbe')), maxzoom: wmts('farbe').maxzoom, kb: (z) => (z <= 13 ? 26 : z <= 17 ? 33 : z === 18 ? 18 : 13) },
  { id: 'luftbild', label: 'Luftbild', vorlage: kachelUrl(wmts('luftbild')), maxzoom: wmts('luftbild').maxzoom, kb: (z) => (z <= 13 ? 23 : z <= 18 ? 27 : z === 19 ? 22 : 18) },
  // Vektorkacheln liegen entpackt im Speicher (fetch entpackt gzip), darum die entpackten Grössen
  { id: 'taufe', label: 'Taufe-Vektordaten', vorlage: TAUFE_VT.vorlage, maxzoom: TAUFE_VT.maxzoom, kb: (z) => (z <= 11 ? 340 : z === 12 ? 225 : z === 13 ? 125 : 117) },
];

export const karteDef = (id: OfflineKarte): KartenDef => OFFLINE_KARTEN.find((k) => k.id === id)!;

/** Tiefste geladene Zoomstufe (Übersicht Schweiz). */
export const MIN_Z = 5;
/** Bis zu dieser Stufe lädt ein Gebiet auch die Umgebung, darüber nur das Rechteck. */
export const UMGEBUNG_Z = 10;
/** Umgebung: Rand um das Rechteck in km. */
export const UMGEBUNG_KM = 20;
/** Gebiete ohne Nutzung so lange behalten. */
export const ABLAUF_MS = 60 * 24 * 60 * 60 * 1000;

export interface Bereich {
  karte: OfflineKarte;
  z: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface Kachel {
  karte: OfflineKarte;
  z: number;
  x: number;
  y: number;
}

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Rechteck um `km` nach allen Seiten vergrössert, auf die swisstopo-Abdeckung beschnitten. */
export function erweitere([w, s, e, n]: Bbox, km: number): Bbox {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return beschneide([w - dLon, s - dLat, e + dLon, n + dLat]);
}

const beschneide = ([w, s, e, n]: Bbox): Bbox => [Math.max(w, ABDECKUNG[0]), Math.max(s, ABDECKUNG[1]), Math.min(e, ABDECKUNG[2]), Math.min(n, ABDECKUNG[3])];

/** Kachelbereiche je Karte und Zoom in fester Reihenfolge (Karte, Zoom aufsteigend): grobe Übersicht kommt zuerst. */
export function bereiche(g: Pick<Gebiet, 'bbox' | 'karten'>): Bereich[] {
  const innen = beschneide(g.bbox);
  const aussen = erweitere(g.bbox, UMGEBUNG_KM);
  const out: Bereich[] = [];
  for (const k of OFFLINE_KARTEN) {
    if (!g.karten.includes(k.id)) continue;
    for (let z = MIN_Z; z <= k.maxzoom; z++) {
      const [w, s, e, n] = z <= UMGEBUNG_Z ? aussen : innen;
      if (w >= e || s >= n) continue;
      out.push({ karte: k.id, z, x0: lon2x(w, z), x1: lon2x(e, z), y0: lat2y(n, z), y1: lat2y(s, z) });
    }
  }
  return out;
}

const groesse = (b: Bereich) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
export const anzahl = (bs: Bereich[]): number => bs.reduce((s, b) => s + groesse(b), 0);

/** Geschätzte Bytes für ein Gebiet. */
export function schaetzeBytes(bs: Bereich[]): number {
  return bs.reduce((s, b) => s + groesse(b) * karteDef(b.karte).kb(b.z) * 1024, 0);
}

/** i-te Kachel in der Reihenfolge von bereiche (zeilenweise je Bereich). */
export function kachelBei(bs: Bereich[], i: number): Kachel {
  for (const b of bs) {
    const n = groesse(b);
    if (i < n) {
      const breite = b.x1 - b.x0 + 1;
      return { karte: b.karte, z: b.z, x: b.x0 + (i % breite), y: b.y0 + Math.floor(i / breite) };
    }
    i -= n;
  }
  throw new RangeError('Kachel ausserhalb des Gebiets');
}

export function* alleKacheln(bs: Bereich[]): Generator<Kachel> {
  for (const b of bs) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) yield { karte: b.karte, z: b.z, x, y };
}

export const urlVon = (k: Kachel): string =>
  karteDef(k.karte).vorlage.replace('{z}', String(k.z)).replace('{x}', String(k.x)).replace('{y}', String(k.y));

/** Umkehrung von urlVon; null für Kacheln, die kein Offline-Gebiet lädt (andere Layer). */
export function kachelVon(url: string): Kachel | null {
  for (const k of OFFLINE_KARTEN) {
    const [vor, nach] = k.vorlage.split('{z}/{x}/{y}');
    if (!url.startsWith(vor) || !url.endsWith(nach)) continue;
    const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(url.slice(vor.length, url.length - nach.length));
    if (m) return { karte: k.id, z: +m[1], x: +m[2], y: +m[3] };
  }
  return null;
}

/** Braucht das Gebiet diese Kachel? `nurInnen`: Umgebung (z ≤ UMGEBUNG_Z) nicht mitzählen. */
export function enthaelt(g: Pick<Gebiet, 'bbox' | 'karten'>, k: Kachel, nurInnen = false): boolean {
  if (nurInnen && k.z <= UMGEBUNG_Z) return false;
  const b = bereiche(g).find((x) => x.karte === k.karte && x.z === k.z);
  return !!b && k.x >= b.x0 && k.x <= b.x1 && k.y >= b.y0 && k.y <= b.y1;
}

/** Kacheln von `weg`, die keines der übrigen Gebiete braucht (überlappende Gebiete teilen Kacheln). */
export function* zuLoeschen(weg: Gebiet, uebrige: Gebiet[]): Generator<string> {
  const andere = uebrige.filter((g) => g.id !== weg.id).map(bereiche);
  const drin = (k: Kachel) => andere.some((bs) => bs.some((b) => b.karte === k.karte && b.z === k.z && k.x >= b.x0 && k.x <= b.x1 && k.y >= b.y0 && k.y <= b.y1));
  for (const k of alleKacheln(bereiche(weg))) if (!drin(k)) yield urlVon(k);
}

/** Gebiete, die seit ABLAUF_MS nicht mehr genutzt wurden. */
export const abgelaufen = (gs: Gebiet[], jetzt: number): Gebiet[] => gs.filter((g) => jetzt - g.zuletztGenutzt > ABLAUF_MS);

/** Breite × Höhe in km (Mitte des Rechtecks). */
export function masseKm([w, s, e, n]: Bbox): { breite: number; hoehe: number } {
  return { breite: (e - w) * 111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180), hoehe: (n - s) * 111.32 };
}

export function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString('de-CH', { maximumFractionDigits: 1 })} GB`;
  return `${Math.max(b / 1024 ** 2, b > 0 ? 0.1 : 0).toLocaleString('de-CH', { maximumFractionDigits: b < 10 * 1024 ** 2 ? 1 : 0 })} MB`;
}
