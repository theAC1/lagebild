// Fläche/Wald zeichnen und Punkte bearbeiten (Juan, 31.10.): pro Tipp ein Punkt, «Zurück», «Abschliessen»;
// Punkte ziehen, Mittelgriff fügt einen Punkt ein, gewählten Punkt löschen – auch mit dem Finger.
// Griffe und Punktlisten-Hilfen kommen aus features/zeichnen (griffeVon, mitPunkt, ersetzePunkt, ohnePunkt).
import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import { MAX_TAUF_PUNKTE, type Punkt, type TaufGeometrie } from '../../../../shared/protocol.ts';
import { groesse } from '../../lib/groesse.svelte.ts';
import { oeffne, toast } from '../../lib/ui.svelte.ts';
import { abstandPx, type Px } from '../zeichnen/geometrie.ts';
import { griffeVon } from '../zeichnen/interaktion.ts';
import { ersetzePunkt, mitPunkt, ohnePunkt } from '../zeichnen/logik.ts';
import type { Griff } from '../zeichnen/zustand.svelte.ts';
import { kreuztSich } from './geo.ts';
import { aendere, tz, type Entwurf } from './zustand.svelte.ts';

const KREUZT = 'Kanten dürfen sich nicht kreuzen';
const lonLat = (p: Punkt): [number, number] => [p.lon, p.lat];
export const alsPolygon = (ps: Punkt[]): TaufGeometrie => ({ type: 'Polygon', coordinates: [[...ps, ps[0]].map(lonLat)] });
const kreuzt = (ps: Punkt[], geschlossen: boolean) => kreuztSich(ps.map(lonLat), geschlossen);

/** Neue Punkte übernehmen; bei abgeschlossener neuer Fläche folgt die Geometrie der Namenswahl. */
function setze(e: Entwurf, punkte: Punkt[], griff: number | undefined): void {
  tz.zeichnen = { ...e, punkte, griff };
  if (e.fertig && !e.id && tz.wahl) tz.wahl = { ...tz.wahl, geometrie: alsPolygon(punkte) };
}

/** Griffe des Entwurfs: im Bau offener Zug, danach geschlossen (Mittelgriff auch auf der Schlusskante). */
export const griffe = (e: Entwurf): Griff[] => griffeVon({ art: e.fertig ? 'flaeche' : 'linie', punkte: e.punkte }, true);

/** Tipp im Bau: neuer Punkt. Tipp nahe einem Punkt (Doppel-/Fehltipp) zählt nicht, auf den ersten schliesst ab. */
export function tippe(m: MapLibreMap, p: Punkt): void {
  const e = tz.zeichnen;
  if (!e || e.fertig) return;
  const px = m.project(lonLat(p));
  const nah = e.punkte.findIndex((q) => abstandPx(px, m.project(lonLat(q))) < 12 * groesse.ui);
  if (nah === 0 && e.punkte.length >= 3) return abschliessen();
  if (nah >= 0) return;
  if (e.punkte.length >= MAX_TAUF_PUNKTE - 1) return toast('Zu viele Punkte');
  const neu = [...e.punkte, p];
  if (kreuzt(neu, false)) return toast(KREUZT);
  setze(e, neu, undefined);
}

export function zurueck(): void {
  const e = tz.zeichnen;
  if (!e) return;
  if (!e.punkte.length) tz.zeichnen = null;
  else setze(e, e.punkte.slice(0, -1), undefined);
}

/** Neue Fläche abschliessen → Namenswahl (Punkte bleiben ziehbar); bestehende Taufe → speichern. */
export function abschliessen(): void {
  const e = tz.zeichnen;
  if (!e || e.punkte.length < 3) return;
  if (kreuzt(e.punkte, true)) return toast(`${KREUZT} – Punkt verschieben oder «Zurück»`);
  if (e.id) {
    tz.zeichnen = null;
    void aendere({ id: e.id, geometrie: alsPolygon(e.punkte) });
    return;
  }
  tz.wahl = { familie: 'flaeche', geometrie: alsPolygon(e.punkte), quelle: 'gezeichnet', objektart: 'gezeichnet', familieWaehlbar: true };
  tz.zeichnen = { ...e, fertig: true, griff: undefined };
  oeffne('taufe');
}

export function loeschePunkt(): void {
  const e = tz.zeichnen;
  if (!e || e.griff === undefined) return;
  const ps = ohnePunkt(e.punkte, e.griff, e.fertig ? 3 : 0);
  if (!ps) return toast('Mindestens 3 Punkte');
  if (kreuzt(ps, e.fertig)) return toast(KREUZT);
  setze(e, ps, undefined);
}

let losgelassen = { t: 0, px: { x: NaN, y: NaN } };
/** Der Kartentipp gehört zum eben losgelassenen Griff (der Klick folgt dem Loslassen): kein neuer Punkt. */
export const griffGetippt = (px: Px): boolean => Date.now() - losgelassen.t < 500 && abstandPx(px, losgelassen.px) < 20;

/** Punkte bearbeiten: Ziehen (Maus oder Finger) an Stütz- und Mittelgriffen. Gibt die Abmeldung zurück. */
export function startePunkte(m: MapLibreMap): () => void {
  let zug: { griff: Griff; basis: Entwurf; start: Px; bewegt: boolean } | null = null;
  const unter = (px: Px): Griff | null => {
    const e = tz.zeichnen;
    if (!e) return null;
    let best: Griff | null = null;
    let d = 24 * groesse.ui;
    // Stützpunkte vor Mittelgriffen (wie in features/zeichnen)
    for (const g of griffe(e)) {
      const a = abstandPx(px, m.project(lonLat(g.p))) + (g.art === 'mitte' ? 3 : 0);
      if (a <= d) [d, best] = [a, g];
    }
    return best;
  };
  const runter = (px: Px): boolean => {
    const g = unter(px);
    if (!g || !tz.zeichnen) return false;
    zug = { griff: g, basis: tz.zeichnen, start: px, bewegt: false };
    return true;
  };
  const ziehe = (px: Px) => {
    letzter = px;
    if (!zug || (!zug.bewegt && abstandPx(px, zug.start) < 4)) return;
    zug.bewegt = true;
    const l = m.unproject([px.x, px.y]);
    const p = { lat: l.lat, lon: l.lng };
    const { basis, griff } = zug;
    setze(basis, griff.art === 'mitte' ? mitPunkt(basis.punkte, griff.i, p) : ersetzePunkt(basis.punkte, griff.i, p), griff.art === 'mitte' ? griff.i + 1 : griff.i);
  };
  let letzter: Px = { x: NaN, y: NaN };
  const los = (ev: Event) => {
    if (ev.type === 'touchend') fingerZeit = Date.now();
    else if (Date.now() - fingerZeit < 800) return;
    const z = zug;
    zug = null;
    if (!z) return;
    losgelassen = { t: Date.now(), px: z.bewegt ? letzter : z.start };
    const e = tz.zeichnen;
    if (!e) return;
    if (z.bewegt) {
      if (kreuzt(e.punkte, e.fertig)) {
        setze(z.basis, z.basis.punkte, undefined);
        toast(KREUZT);
      } else setze(e, e.punkte, undefined); // gezogen: nicht gewählt (Wählen = antippen)
    } else if (z.griff.art === 'mitte') setze(e, mitPunkt(e.punkte, z.griff.i, z.griff.p), undefined);
    else if (!e.fertig && z.griff.i === 0 && e.punkte.length >= 3) abschliessen();
    else setze(e, e.punkte, e.griff === z.griff.i ? undefined : z.griff.i);
  };
  const relativ = (x: number, y: number): Px => {
    const r = m.getContainer().getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  };
  // Nach einem Fingertipp schickt der Browser Ersatz-Mausereignisse: die zählen nicht (sonst schaltet ein Tipp zweimal)
  let fingerZeit = 0;
  const maus = (e: MapMouseEvent) => Date.now() - fingerZeit > 800 && e.originalEvent.button === 0 && runter(e.point) && e.preventDefault();
  const finger = (e: MapTouchEvent) => {
    fingerZeit = Date.now();
    if (e.points.length === 1 && runter(e.point)) e.preventDefault();
  };
  const mausZug = (e: MouseEvent) => zug && Date.now() - fingerZeit > 800 && ziehe(relativ(e.clientX, e.clientY));
  const fingerZug = (e: TouchEvent) => zug && e.touches[0] && ziehe(relativ(e.touches[0].clientX, e.touches[0].clientY));
  m.on('mousedown', maus);
  m.on('touchstart', finger);
  addEventListener('mousemove', mausZug);
  addEventListener('touchmove', fingerZug);
  addEventListener('mouseup', los);
  addEventListener('touchend', los);
  return () => {
    m.off('mousedown', maus);
    m.off('touchstart', finger);
    removeEventListener('mousemove', mausZug);
    removeEventListener('touchmove', fingerZug);
    removeEventListener('mouseup', los);
    removeEventListener('touchend', los);
  };
}
