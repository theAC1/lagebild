// Gemeinsamer Zustand des Zeichnen-Features (Layer, Palette, Panels). Lebensdauer = ZeichnenLayer.
import { MediaQuery, SvelteMap, SvelteSet } from 'svelte/reactivity';
import { STANDARD_STIL, standardEbeneId, type Punkt, type Stil, type Zeichnung } from '../../../../shared/protocol.ts';
import { darfAendern as darfVon, store } from '../../lib/store.svelte.ts';
import { lies, schreibe } from '../../lib/ui.svelte.ts';
import type { Fang, Px } from './geometrie.ts';
import { darfAendern, sichtKey } from './logik.ts';
import { Verlauf, type ZInhalt } from './verlauf.ts';
import type { WerkzeugId } from './werkzeuge.ts';

/** Desktop = breit UND feiner Zeiger (Maus). Sonst stark reduzierter Mobil-Modus. */
const desktopMq = typeof window === 'undefined' ? null : new MediaQuery('(min-width: 1024px) and (pointer: fine)', false);
export const istDesktop = (): boolean => desktopMq?.current ?? false;

/** Ein Griff am Bildschirm: Stützpunkt, Mittelgriff (fügt ein), Rechteck-Ecke oder Kreisradius. */
export type Griff = { art: 'punkt' | 'mitte' | 'ecke' | 'radius'; i: number; p: Punkt };
/** Offene Texteingabe (Text-Werkzeug oder Bezeichnung einer taktischen Form) am Bildschirmpunkt. */
export type Eingabe = { x: number; y: number; titel: string; wert: string; ohneText: string | null; fertig: (text: string | null) => void };

const FANG_KEY = 'lagebild.zeichnen.fang';

class ZeichnenZustand {
  /** Aktives Werkzeug; Desktop standardmässig «auswahl», mobil null (nur ansehen). */
  werkzeug = $state<WerkzeugId | null>(null);
  /** Gesetzte Punkte der Form im Bau. */
  entwurf = $state.raw<Punkt[]>([]);
  /** Mausposition auf der Karte (mit Fang) für Gummiband und Live-Masse. */
  maus = $state.raw<Punkt | null>(null);
  /** Mausposition im Fenster (clientX/Y) für die Live-Masse neben dem Cursor. */
  mausFenster = $state.raw<Px | null>(null);
  fang = $state.raw<(Fang & { geo: Punkt }) | null>(null);
  fangAn = $state(lies(FANG_KEY) !== '0');
  auswahl = new SvelteSet<string>();
  /** Angeklickter Stützpunkt der (einzigen) Auswahl: Koordinate editierbar, Entf löscht ihn. */
  griff = $state.raw<(Griff & { id: string }) | null>(null);
  /** Lokale Vorschau beim Ziehen/bis zum Echo des Servers: überschreibt die Zeichnung aus dem Store. */
  vorschau = new SvelteMap<string, ZInhalt>();
  aktiveEbene = $state<string | null>(null);
  ausgeblendet = new SvelteSet<string>();
  stil = $state<Stil>({ ...STANDARD_STIL });
  /** Abgeschlossene Messung (bleibt bis Esc/neue Messung, wird nie gespeichert). */
  messung = $state.raw<Punkt[] | null>(null);
  /** Lasso-Umriss in Kartenpixeln, solange gezogen wird. */
  lasso = $state.raw<Px[] | null>(null);
  koordVorschau = $state.raw<Punkt | null>(null);
  eingabe = $state<Eingabe | null>(null);
  /** Mobil: eigene Form, deren Punkte gerade bearbeitet werden. */
  mobilBearbeiten = $state<string | null>(null);
  /** Zählt Änderungen am Verlauf (der Stapel selbst ist nicht reaktiv). */
  verlaufStand = $state(0);
  /** Steigt bei Zoomende: taktische Zeichen in Pixelgrösse neu berechnen. */
  zoomStand = $state(0);
}

export const zn = new ZeichnenZustand();
export const verlauf = new Verlauf();
/** Zwischenablage (Ctrl+C/V), nur in dieser Sitzung. */
export const ablage: { inhalte: ZInhalt[]; eingefuegt: number } = { inhalte: [], eingefuegt: 0 };
/** Beschriftungs-Elemente je Zeichnung (Treffer auf Text-Zeichnungen über deren Rechteck). */
export const labelElemente = new Map<string, HTMLElement[]>();

export function setzeFang(an: boolean): void {
  zn.fangAn = an;
  schreibe(FANG_KEY, an ? null : '0');
}

/** Zeichnungen, wie sie angezeigt werden: Store + lokale Vorschau, ohne ausgeblendete Ebenen, nach Ebenen-Reihenfolge. */
export function anzeige(): Zeichnung[] {
  const rang = (id: string) => store.ebenen.get(id)?.reihenfolge ?? 0;
  const liste: Zeichnung[] = [];
  for (const z of store.zeichnungen.values()) {
    const v = zn.vorschau.get(z.id);
    const a = v ? { ...z, ...v } : z;
    if (!zn.ausgeblendet.has(a.ebeneId)) liste.push(a);
  }
  return liste.sort((a, b) => rang(a.ebeneId) - rang(b.ebeneId) || a.erstelltAm - b.erstelltAm);
}

export const darf = (z: Pick<Zeichnung, 'von' | 'ebeneId'>): boolean => darfAendern(z, darfVon(z.von), store.istLeitung, store.ebenen);

/** Ebene, in die neue Zeichnungen kommen: die gewählte, falls vorhanden und beschreibbar, sonst «Allgemein». */
export function zielEbene(): string {
  const lage = store.lage?.id ?? '';
  const e = zn.aktiveEbene ? store.ebenen.get(zn.aktiveEbene) : undefined;
  return e && (!e.gesperrt || store.istLeitung) ? e.id : standardEbeneId(lage);
}

export function ladeSichtbarkeit(lageId: string | null): void {
  zn.ausgeblendet.clear();
  if (!lageId) return;
  try {
    for (const id of JSON.parse(lies(sichtKey(lageId)) ?? '[]')) if (typeof id === 'string') zn.ausgeblendet.add(id);
  } catch {
    /* kaputter Eintrag: alles sichtbar */
  }
}

export function setzeSichtbar(ebeneId: string, sichtbar: boolean): void {
  if (sichtbar) zn.ausgeblendet.delete(ebeneId);
  else zn.ausgeblendet.add(ebeneId);
  // Ausgeblendetes lässt sich nicht bearbeiten: aus Auswahl nehmen
  if (!sichtbar) for (const id of [...zn.auswahl]) if (store.zeichnungen.get(id)?.ebeneId === ebeneId) zn.auswahl.delete(id);
  const lage = store.lage?.id;
  if (lage) schreibe(sichtKey(lage), zn.ausgeblendet.size ? JSON.stringify([...zn.ausgeblendet]) : null);
}

/** Werkzeug wechseln: laufender Entwurf, Lasso und Messung verfallen. */
export function setzeWerkzeug(id: WerkzeugId | null): void {
  zn.werkzeug = id;
  zn.entwurf = [];
  zn.lasso = null;
  zn.messung = null;
  zn.koordVorschau = null;
  zn.eingabe?.fertig(null);
  if (id !== 'auswahl' && id !== 'lasso') {
    zn.griff = null;
    zn.auswahl.clear(); // beim Zeichnen keine alte Auswahl hervorheben
  }
}

export function waehleAus(ids: string[], dazu = false): void {
  if (!dazu) zn.auswahl.clear();
  for (const id of ids) zn.auswahl.add(id);
  zn.griff = null;
}

export function zuruecksetzen(): void {
  setzeWerkzeug(null);
  zn.auswahl.clear();
  zn.vorschau.clear();
  zn.mobilBearbeiten = null;
  zn.griff = null;
  zn.maus = null;
  zn.fang = null;
  verlauf.leeren();
  ablage.inhalte = [];
  zn.verlaufStand++;
}
