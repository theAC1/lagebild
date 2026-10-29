// Bedienung auf der Karte: Zeichnen, Griffe ziehen, Verschieben, Lasso, Fang, Tastatur. Desktop voll, mobil reduziert.
import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import { PUNKTE_JE_ART, MAX_PUNKTE_LANG, STANDARD_STIL, type Punkt, type Zeichnung } from '../../../../shared/protocol.ts';
import { distanz, versetze } from '../../lib/coords.ts';
import { groesse } from '../../lib/groesse.svelte.ts';
import { getMap, registriereTreffer } from '../../lib/map.ts';
import { store } from '../../lib/store.svelte.ts';
import { schliesseAlle, toast, ui, waehle } from '../../lib/ui.svelte.ts';
import { aendere, erstelle, kopiere, loesche, neueId, rueckgaengig, wiederholen } from './aktionen.ts';
import { istGeschlossen, PX, umriss } from './darstellung.ts';
import { abstandPx, abstandZuLinie, fange, imLasso, imPolygon, rechteckRing, type Px } from './geometrie.ts';
import { artLabel, ersetzePunkt, mitPunkt, ohnePunkt, pxMitte, verschiebePunkte, zuInhalt } from './logik.ts';
import type { ZInhalt } from './verlauf.ts';
import { befehlFuer, istEingabe, istMehrpunkt, werkzeug, type Befehl } from './werkzeuge.ts';
import { ablage, anzeige, darf, istDesktop, labelElemente, setzeWerkzeug, waehleAus, zielEbene, zn, type Griff } from './zustand.svelte.ts';

const proj = (p: Punkt): Px => {
  const q = getMap().project([p.lon, p.lat]);
  return { x: q.x, y: q.y };
};
const unproj = (q: Px): Punkt => {
  const l = getMap().unproject([q.x, q.y]);
  return { lat: l.lat, lon: l.lng };
};

/** Ein Zeichenwerkzeug (nicht Auswahl/Lasso) ist aktiv: Klicks setzen Punkte, Symbole sind nicht anklickbar. */
export const zeichnetGerade = (): boolean => !!zn.werkzeug && zn.werkzeug !== 'auswahl' && zn.werkzeug !== 'lasso';

/** Aktueller Inhalt (inkl. lokaler Vorschau) einer Zeichnung. */
function aktuell(id: string): ZInhalt | null {
  const v = zn.vorschau.get(id);
  if (v) return v;
  const z = store.zeichnungen.get(id);
  return z ? zuInhalt(z) : null;
}

// --- Griffe ----------------------------------------------------------------------------------

/** Form, deren Griffe sichtbar sind: Desktop die einzige bearbeitbare Auswahl, mobil die Form im Bearbeiten-Modus. */
export function griffForm(): Zeichnung | null {
  const id = istDesktop()
    ? zn.werkzeug === 'auswahl' || zn.werkzeug === 'lasso'
      ? zn.auswahl.size === 1 && [...zn.auswahl][0]
      : null
    : zn.mobilBearbeiten;
  if (!id) return null;
  const z = store.zeichnungen.get(id);
  if (!z || !darf(z) || zn.ausgeblendet.has(z.ebeneId)) return null;
  const v = zn.vorschau.get(id);
  return v ? { ...z, ...v } : z;
}

export function griffeVon(z: Pick<Zeichnung, 'art' | 'punkte' | 'radiusM'>, mitMitte = istDesktop()): Griff[] {
  const ps = z.punkte;
  if (z.art === 'text') return [];
  if (z.art === 'kreis') return [{ art: 'punkt', i: 0, p: ps[0] }, { art: 'radius', i: 0, p: versetze(ps[0], z.radiusM ?? 1, 90) }];
  if (z.art === 'rechteck') return rechteckRing(ps[0], ps[1]).map((p, i) => ({ art: 'ecke', i, p }));
  const griffe: Griff[] = ps.map((p, i) => ({ art: 'punkt', i, p }));
  if (!mitMitte) return griffe;
  const n = istGeschlossen(z.art) ? ps.length : ps.length - 1;
  for (let i = 0; i < n; i++) {
    const [a, b] = [ps[i], ps[(i + 1) % ps.length]];
    griffe.push({ art: 'mitte', i, p: { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 } });
  }
  return griffe;
}

/** Neuer Inhalt, wenn Griff g nach p gezogen wird. */
export function mitGriff(z: ZInhalt, g: Griff, p: Punkt): ZInhalt {
  switch (g.art) {
    case 'radius':
      return { ...z, radiusM: Math.max(1, distanz(z.punkte[0], p)) };
    case 'ecke':
      return { ...z, punkte: [rechteckRing(z.punkte[0], z.punkte[1])[(g.i + 2) % 4], p] };
    case 'mitte':
      return { ...z, punkte: mitPunkt(z.punkte, g.i, p) };
    default:
      return { ...z, punkte: ersetzePunkt(z.punkte, g.i, p) };
  }
}

function griffUnter(z: Zeichnung, px: Px): Griff | null {
  const tol = (istDesktop() ? 9 : 24) * groesse.ui;
  let best: Griff | null = null;
  let d = tol;
  // Stützpunkte vor Mittelgriffen: bei kurzen Segmenten liegen beide nah beieinander
  for (const g of griffeVon(z)) {
    const a = abstandPx(px, proj(g.p)) + (g.art === 'mitte' ? 3 : 0);
    if (a <= d) [d, best] = [a, g];
  }
  return best;
}

// --- Treffer auf Formen ------------------------------------------------------------------------

const flaechig = (z: Zeichnung): boolean => !!z.stil.fuellung || z.art === 'stossrichtung' || (z.art === 'raum' && z.raumArt !== 'verantwortung');

/** Oberste Zeichnung unter px (Kartenpixel). Erst Text, Linien und Ränder, dann das Innere gefüllter Flächen. */
export function trifft(px: Px): string | null {
  const c = getMap().getContainer().getBoundingClientRect();
  const formen = anzeige().reverse();
  const tol = istDesktop() ? 6 : 14;
  for (const z of formen) {
    if (z.art === 'text') {
      for (const el of labelElemente.get(z.id) ?? []) {
        const r = el.getBoundingClientRect();
        if (px.x >= r.left - c.left - 3 && px.x <= r.right - c.left + 3 && px.y >= r.top - c.top - 3 && px.y <= r.bottom - c.top + 3) return z.id;
      }
      continue;
    }
    const ring = umriss(z).map(proj);
    const breit = z.art === 'stossrichtung' ? PX.stoss / 2 : z.stil.breite / 2;
    if (abstandZuLinie(px, ring, istGeschlossen(z.art)) <= tol + breit) return z.id;
  }
  for (const z of formen) if (istGeschlossen(z.art) && flaechig(z) && imPolygon(px, umriss(z).map(proj))) return z.id;
  return null;
}

// --- Fang ----------------------------------------------------------------------------------------

/** Mausposition mit Fang an Stützpunkte, Marker und Segmente (ohne die Form `ausser`). Alt oder Schalter aus = frei. */
function mitFang(px: Px, alt: boolean, ausser?: string): { geo: Punkt; fang: (Px & { art: 'punkt' | 'strecke'; geo: Punkt }) | null } {
  if (!zn.fangAn || alt) return { geo: unproj(px), fang: null };
  const c = getMap().getContainer();
  const [w, h] = [c.clientWidth, c.clientHeight];
  const sichtbar = (q: Px) => q.x > -20 && q.y > -20 && q.x < w + 20 && q.y < h + 20;
  const punkte: { px: Px; geo: Punkt }[] = [];
  const strecken: [Px, Px][] = [];
  const nimm = (ps: Punkt[], geschlossen: boolean) => {
    const pp = ps.map(proj);
    pp.forEach((q, i) => sichtbar(q) && punkte.push({ px: q, geo: ps[i] }));
    for (let i = 1; i < pp.length; i++) strecken.push([pp[i - 1], pp[i]]);
    if (geschlossen && pp.length > 2) strecken.push([pp.at(-1)!, pp[0]]);
  };
  // ponytail: projiziert bei jeder Mausbewegung alle sichtbaren Zeichnungen; bei Tausenden Formen ein Raster-Index
  for (const z of anzeige()) if (z.id !== ausser && z.art !== 'text') nimm(z.art === 'kreis' ? z.punkte : umriss(z), istGeschlossen(z.art));
  nimm(zn.entwurf, false);
  for (const mk of store.marker.values()) nimm([mk], false);
  const f = fange(px, punkte.map((p) => p.px), strecken, 10);
  if (!f) return { geo: unproj(px), fang: null };
  const exakt = f.art === 'punkt' ? punkte.find((p) => p.px.x === f.x && p.px.y === f.y)?.geo : undefined;
  const geo = exakt ?? unproj(f);
  return { geo, fang: { ...f, geo } };
}

// --- Zeichnen ------------------------------------------------------------------------------------

/** Aufeinanderfolgende Punkte, die am Bildschirm zusammenfallen (Doppelklick), nur einmal. */
const ohneDoppelte = (ps: Punkt[]): Punkt[] => ps.filter((p, i) => i === 0 || abstandPx(proj(p), proj(ps[i - 1])) >= 4);

/** Grob ausdünnen, falls Freihand die Höchstzahl sprengt. */
const ausduennen = (ps: Punkt[], max: number): Punkt[] => (ps.length <= max ? ps : ps.filter((_, i) => i % Math.ceil(ps.length / max) === 0 || i === ps.length - 1));

const neuerStil = () => (istDesktop() ? { ...zn.stil } : { ...STANDARD_STIL });

function fenster(p: Punkt): Px {
  const c = getMap().getContainer().getBoundingClientRect();
  const q = proj(p);
  return { x: c.left + q.x, y: c.top + q.y };
}

function frageText(p: Punkt): void {
  const f = fenster(p);
  zn.eingabe = {
    ...f,
    titel: 'Text',
    wert: '',
    ohneText: null,
    fertig: (t) => {
      zn.eingabe = null;
      const text = t?.trim().slice(0, 200);
      if (text) void erstelle([{ id: neueId(), ebeneId: zielEbene(), art: 'text', punkte: [p], text, bezeichnung: '', stil: neuerStil() }]);
    },
  };
}

function frageBezeichnung(inhalt: ZInhalt): void {
  const f = fenster(inhalt.punkte.at(-1)!);
  zn.eingabe = {
    ...f,
    titel: `Bezeichnung ${artLabel(inhalt)}`,
    wert: '',
    ohneText: 'Ohne Bezeichnung',
    fertig: (t) => {
      zn.eingabe = null;
      void erstelle([{ ...inhalt, bezeichnung: (t ?? '').trim().slice(0, 200) }]);
    },
  };
}

/** Form im Bau abschliessen (Doppelklick, Enter, Fertig, zweiter Punkt bei Rechteck/Kreis). */
export function beende(): void {
  const w = zn.werkzeug;
  if (!w || w === 'auswahl' || w === 'lasso') return;
  const ps = ohneDoppelte(zn.entwurf);
  if (w === 'messen') {
    zn.messung = ps.length >= 2 ? ps : null;
    zn.entwurf = [];
    return;
  }
  const def = werkzeug(w);
  const art = def.art!;
  let punkte = art === 'freihand' ? ausduennen(ps, MAX_PUNKTE_LANG) : ps;
  let radiusM: number | undefined;
  if (art === 'kreis') {
    if (ps.length < 2) return;
    radiusM = Math.max(1, distanz(ps[0], ps[1]));
    punkte = [ps[0]];
  }
  const [min, max] = PUNKTE_JE_ART[art];
  if (punkte.length < min) {
    toast(`${def.label}: mindestens ${min} Punkte`);
    return;
  }
  zn.entwurf = [];
  const inhalt: ZInhalt = {
    id: neueId(),
    ebeneId: zielEbene(),
    art,
    ...(def.raumArt ? { raumArt: def.raumArt } : {}),
    punkte: punkte.slice(0, max),
    ...(radiusM !== undefined ? { radiusM } : {}),
    text: '',
    bezeichnung: '',
    stil: neuerStil(),
  };
  if (!istDesktop()) setzeWerkzeug(null);
  const taktisch = ['phasenlinie', 'grenze', 'stossrichtung', 'sperre', 'raum'].includes(art);
  if (istDesktop() && taktisch) frageBezeichnung(inhalt);
  else void erstelle([inhalt]);
}

/** Punkt setzen (Klick, Tippen oder Koordinateneingabe). */
export function fuegeHinzu(p: Punkt): void {
  const w = zn.werkzeug;
  if (!w || w === 'auswahl' || w === 'lasso') return;
  if (w === 'text') return frageText(p);
  if (w === 'messen' && zn.messung) zn.messung = null;
  zn.entwurf = [...zn.entwurf, p];
  if ((w === 'rechteck' || w === 'kreis') && zn.entwurf.length >= 2) beende();
}

/** Koordinate aus dem Eingabefeld: als Punkt setzen und, falls ausserhalb, dorthin schwenken. */
export function punktPerKoordinate(p: Punkt): void {
  const m = getMap();
  if (!m.getBounds().contains([p.lon, p.lat])) m.easeTo({ center: [p.lon, p.lat] });
  fuegeHinzu(p);
}

// --- Bearbeiten ----------------------------------------------------------------------------------

/** «Bearbeiten» aus Radial-Menü oder Details: Desktop wählt die Form aus (Griffe), mobil startet der Punkte-Modus. */
export function bearbeite(id: string): void {
  if (istDesktop()) {
    setzeWerkzeug('auswahl');
    waehleAus([id]);
  } else {
    zn.mobilBearbeiten = id;
    zn.griff = null;
    schliesseAlle();
  }
}

/** Koordinate des angeklickten Stützpunkts setzen. */
export function setzeGriffKoord(p: Punkt): void {
  const g = zn.griff;
  const z = g && aktuell(g.id);
  if (!g || !z) return;
  void aendere([mitGriff(z, g, p)]);
  zn.griff = { ...g, p };
}

export function loescheGriffPunkt(): void {
  const g = zn.griff;
  const z = g && aktuell(g.id);
  if (!g || !z) return;
  if (g.art !== 'punkt' || z.art === 'kreis') return toast('Dieser Punkt lässt sich nicht löschen.');
  const ps = ohnePunkt(z.punkte, g.i, PUNKTE_JE_ART[z.art][0]);
  if (!ps) return toast(`${artLabel(z)}: mindestens ${PUNKTE_JE_ART[z.art][0]} Punkte`);
  zn.griff = null;
  void aendere([{ ...z, punkte: ps }]);
}

let mausPx: Px | null = null;
let letztesEinfuegen: Px | null = null;

/** Zwischenablage an der Mausposition einfügen; wiederholtes Einfügen an derselben Stelle versetzt um 16 px. */
export function fuegeEin(): void {
  if (!ablage.inhalte.length) return;
  const mitte = pxMitte(ablage.inhalte.flatMap((z) => z.punkte).map(proj));
  const gleicheStelle = mausPx && letztesEinfuegen && abstandPx(mausPx, letztesEinfuegen) < 2;
  ablage.eingefuegt = gleicheStelle || !mausPx ? ablage.eingefuegt + 1 : 0;
  letztesEinfuegen = mausPx;
  const ziel = mausPx ?? mitte;
  const versatz = 16 * (mausPx ? ablage.eingefuegt : Math.max(1, ablage.eingefuegt));
  const [dx, dy] = [ziel.x - mitte.x + versatz, ziel.y - mitte.y + versatz];
  const neue = ablage.inhalte.map((z) => ({ ...z, id: neueId(), ebeneId: zielEbene(), punkte: verschiebePunkte(z.punkte, dx, dy, proj, unproj) }));
  void erstelle(neue);
  if (zn.werkzeug !== 'lasso') setzeWerkzeug('auswahl');
  waehleAus(neue.map((z) => z.id));
}

function loescheAuswahl(): void {
  const ids = [...zn.auswahl];
  const n = ids.filter((id) => {
    const z = store.zeichnungen.get(id);
    return z && darf(z);
  }).length;
  if (!n) return toast('Keine Berechtigung für die Auswahl.');
  void loesche(ids);
  toast(`${n === 1 ? 'Zeichnung' : `${n} Zeichnungen`} gelöscht – Ctrl+Z macht rückgängig`);
}

/** Tastenbefehl ausführen; true = erledigt (Taste nicht weiterreichen). */
export function fuehreAus(b: Befehl): boolean {
  switch (b.typ) {
    case 'werkzeug':
      setzeWerkzeug(b.id);
      return true;
    case 'abbrechen':
      if (zn.entwurf.length) zn.entwurf = [];
      else if (zn.messung) zn.messung = null;
      else if (zn.werkzeug && zn.werkzeug !== 'auswahl') setzeWerkzeug('auswahl');
      else if (zn.griff) zn.griff = null;
      else if (zn.auswahl.size) zn.auswahl.clear();
      else return false;
      return true;
    case 'fertig':
      if (!zn.entwurf.length) return false;
      beende();
      return true;
    case 'punktZurueck':
      if (!zn.entwurf.length) return false;
      zn.entwurf = zn.entwurf.slice(0, -1);
      return true;
    case 'loeschen':
      if (zn.griff) loescheGriffPunkt();
      else if (zn.auswahl.size) loescheAuswahl();
      else return false;
      return true;
    case 'rueckgaengig':
      rueckgaengig();
      return true;
    case 'wiederholen':
      wiederholen();
      return true;
    case 'kopieren':
      if (!zn.auswahl.size) return false;
      kopiere([...zn.auswahl]);
      return true;
    case 'einfuegen':
      if (!ablage.inhalte.length) return false;
      fuegeEin();
      return true;
  }
}

// --- Ereignisse -------------------------------------------------------------------------------------

type Zug =
  | { art: 'griff'; id: string; griff: Griff; basis: ZInhalt; start: Px; bewegt: boolean }
  | { art: 'verschieben'; basis: ZInhalt[]; start: Px; bewegt: boolean }
  | { art: 'lasso'; dazu: boolean }
  | { art: 'freihand' };

/** Verbindet Karte, Fenster und Tastatur. Gibt die Abmeldung zurück. */
export function starteInteraktion(m: MapLibreMap): () => void {
  const container = m.getContainer();
  let zug: Zug | null = null;
  const blockiert = () => !!ui.punktWahl || !!ui.radial || !!zn.eingabe;
  const imKarte = (x: number, y: number): Px | null => {
    const r = container.getBoundingClientRect();
    const p = { x: x - r.left, y: y - r.top };
    return p.x >= 0 && p.y >= 0 && p.x <= r.width && p.y <= r.height ? p : null;
  };
  const relativ = (x: number, y: number): Px => {
    const r = container.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  };

  /** Beginn einer Geste (Maus oder Finger). true = übernommen, die Karte soll nicht schwenken. */
  function runter(px: Px, shift: boolean, alt: boolean): boolean {
    if (blockiert()) return false;
    const gf = griffForm();
    const g = gf && griffUnter(gf, px);
    if (gf && g) {
      zug = { art: 'griff', id: gf.id, griff: g, basis: zuInhalt(gf), start: px, bewegt: false };
      return true;
    }
    if (!istDesktop()) return false;
    const w = zn.werkzeug;
    if (w === 'freihand') {
      zn.entwurf = [mitFang(px, alt).geo];
      zug = { art: 'freihand' };
      return true;
    }
    if (w !== 'auswahl' && w !== 'lasso') return false;
    const id = trifft(px);
    if (id && shift && zn.auswahl.has(id)) {
      zn.auswahl.delete(id);
      zn.griff = null;
      return true;
    }
    if (id) {
      if (!zn.auswahl.has(id)) waehleAus([id], shift);
      const basis = [...zn.auswahl].map(aktuell).filter((z): z is ZInhalt => !!z && darf(store.zeichnungen.get(z.id)!));
      if (!basis.length) return false;
      zug = { art: 'verschieben', basis, start: px, bewegt: false };
      return true;
    }
    if (w === 'lasso') {
      zn.lasso = [px];
      zug = { art: 'lasso', dazu: shift };
      return true;
    }
    if (!shift) waehleAus([]);
    return false;
  }

  function ziehe(px: Px, alt: boolean): void {
    if (!zug) return;
    if (zug.art === 'griff') {
      if (!zug.bewegt && abstandPx(px, zug.start) < 3) return;
      zug.bewegt = true;
      const { geo, fang } = mitFang(px, alt, zug.id);
      zn.fang = fang;
      zn.vorschau.set(zug.id, mitGriff(zug.basis, zug.griff, geo));
    } else if (zug.art === 'verschieben') {
      if (!zug.bewegt && abstandPx(px, zug.start) < 3) return;
      zug.bewegt = true;
      const [dx, dy] = [px.x - zug.start.x, px.y - zug.start.y];
      for (const z of zug.basis) zn.vorschau.set(z.id, { ...z, punkte: verschiebePunkte(z.punkte, dx, dy, proj, unproj) });
    } else if (zug.art === 'lasso') {
      const l = zn.lasso ?? [];
      if (!l.length || abstandPx(px, l.at(-1)!) >= 3) zn.lasso = [...l, px];
    } else {
      const letzter = zn.entwurf.at(-1);
      if (!letzter || abstandPx(px, proj(letzter)) >= 4) zn.entwurf = [...zn.entwurf, unproj(px)];
    }
  }

  function los(): void {
    const z = zug;
    zug = null;
    zn.fang = null;
    if (!z) return;
    if (z.art === 'griff') {
      if (z.bewegt) {
        const neu = zn.vorschau.get(z.id);
        if (neu) void aendere([neu]);
      } else if (z.griff.art === 'mitte') void aendere([mitGriff(z.basis, z.griff, z.griff.p)]);
      else if (z.griff.art !== 'radius') zn.griff = { ...z.griff, id: z.id };
    } else if (z.art === 'verschieben') {
      if (z.bewegt) void aendere(z.basis.map((b) => zn.vorschau.get(b.id) ?? b));
    } else if (z.art === 'lasso') {
      const lasso = zn.lasso ?? [];
      zn.lasso = null;
      const ids = anzeige()
        .filter((f) => imLasso((f.art === 'kreis' ? f.punkte : umriss(f)).map(proj), lasso))
        .map((f) => f.id);
      waehleAus(ids, z.dazu);
      if (ids.length) toast(ids.length === 1 ? '1 Zeichnung ausgewählt' : `${ids.length} Zeichnungen ausgewählt`, 2000);
    } else beende();
  }

  // Maus: Geste auf der Karte beginnen, im Fenster weiterverfolgen (auch über Panels hinweg)
  const mausRunter = (e: MapMouseEvent) => {
    if (e.originalEvent.button === 0 && runter(e.point, e.originalEvent.shiftKey, e.originalEvent.altKey)) e.preventDefault();
  };
  const fingerRunter = (e: MapTouchEvent) => {
    if (e.points.length === 1 && runter(e.point, false, false)) e.preventDefault();
  };
  const bewegt = (e: MouseEvent) => {
    const px = relativ(e.clientX, e.clientY);
    if (zug) return ziehe(px, e.altKey);
    const drin = imKarte(e.clientX, e.clientY);
    mausPx = drin;
    zn.mausFenster = drin && zeichnetGerade() ? { x: e.clientX, y: e.clientY } : null;
    if (!drin || blockiert()) return;
    if (zeichnetGerade()) {
      const { geo, fang } = mitFang(px, e.altKey);
      zn.maus = geo;
      zn.fang = fang;
      m.getCanvas().style.cursor = 'crosshair';
      return;
    }
    zn.fang = null;
    if (!zn.werkzeug) return;
    const gf = griffForm();
    const id = gf && griffUnter(gf, px) ? 'griff' : trifft(px);
    m.getCanvas().style.cursor = id === 'griff' ? 'grab' : id ? (zn.auswahl.has(id) ? 'move' : 'pointer') : zn.werkzeug === 'lasso' ? 'crosshair' : '';
  };
  const fingerBewegt = (e: TouchEvent) => zug && e.touches[0] && ziehe(relativ(e.touches[0].clientX, e.touches[0].clientY), false);
  const klick = (e: MapMouseEvent) => {
    if (blockiert()) return;
    if (!zn.werkzeug) {
      if (zn.mobilBearbeiten) return;
      const id = trifft(e.point);
      if (id) waehle('zeichnung', id);
      return;
    }
    if (!zeichnetGerade() || zn.werkzeug === 'freihand') return;
    fuegeHinzu(mitFang(e.point, e.originalEvent.altKey).geo);
  };
  const doppelklick = (e: MapMouseEvent) => {
    if (!zeichnetGerade()) return;
    e.preventDefault();
    if (istMehrpunkt(zn.werkzeug!)) beende();
  };
  // Rechtsklick auf einen Griff löscht den Punkt; beim Zeichnen kein Kontextmenü. Capture: vor MapLibre und MapView.
  const kontext = (e: MouseEvent) => {
    const px = imKarte(e.clientX, e.clientY);
    if (!px || !container.contains(e.target as Node)) return;
    const gf = griffForm();
    const g = gf && griffUnter(gf, px);
    if (gf && g && istDesktop()) {
      e.preventDefault();
      e.stopPropagation();
      if (g.art === 'mitte' || g.art === 'radius') return;
      zn.griff = { ...g, id: gf.id };
      loescheGriffPunkt();
    } else if (zeichnetGerade()) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const taste = (e: KeyboardEvent) => {
    if (!istDesktop() || e.defaultPrevented || istEingabe(document.activeElement) || ui.punktWahl || ui.radial || ui.kontext || zn.eingabe) return;
    const b = befehlFuer(e);
    if (b && fuehreAus(b)) e.preventDefault();
  };

  m.on('mousedown', mausRunter);
  m.on('touchstart', fingerRunter);
  m.on('click', klick);
  m.on('dblclick', doppelklick);
  addEventListener('mousemove', bewegt);
  addEventListener('mouseup', los);
  addEventListener('touchmove', fingerBewegt);
  addEventListener('touchend', los);
  addEventListener('contextmenu', kontext, true);
  addEventListener('keydown', taste, true);
  const abTreffer = registriereTreffer((px) => {
    if (zeichnetGerade() || zug) return null;
    const id = trifft(px);
    return id ? { art: 'zeichnung', id } : null;
  });
  return () => {
    m.off('mousedown', mausRunter);
    m.off('touchstart', fingerRunter);
    m.off('click', klick);
    m.off('dblclick', doppelklick);
    removeEventListener('mousemove', bewegt);
    removeEventListener('mouseup', los);
    removeEventListener('touchmove', fingerBewegt);
    removeEventListener('touchend', los);
    removeEventListener('contextmenu', kontext, true);
    removeEventListener('keydown', taste, true);
    abTreffer();
    m.getCanvas().style.cursor = '';
  };
}
