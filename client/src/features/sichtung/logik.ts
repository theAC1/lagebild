// Reine Hilfen der Sichtungsmeldung (ohne DOM, getestet in logik.test.ts).
import type { Punkt, Sichtung } from '../../../../shared/protocol.ts';
import { azimut, distanz, formatDistanz, formatRichtung } from '../../lib/coords.ts';

export const FOTO_MAX_PX = 1600;
export const FOTO_QUALITAET = 0.8;

/** Zielgrösse fürs Verkleinern: längste Seite ≤ max, Seitenverhältnis bleibt, nie vergrössern. */
export function zielMasse(breite: number, hoehe: number, max = FOTO_MAX_PX): { breite: number; hoehe: number } {
  const f = Math.min(1, max / Math.max(breite, hoehe));
  return { breite: Math.max(1, Math.round(breite * f)), hoehe: Math.max(1, Math.round(hoehe * f)) };
}

export const VERTRAUEN = [
  { id: 'bestaetigt', label: 'Bestätigt' },
  { id: 'wahrscheinlich', label: 'Wahrscheinlich' },
  { id: 'unsicher', label: 'Unsicher' },
] as const;
export type Vertrauen = (typeof VERTRAUEN)[number]['id'];
export const vertrauenLabel = (v: Vertrauen) => VERTRAUEN.find((x) => x.id === v)?.label ?? v;

const zwei = (n: number) => String(n).padStart(2, '0');

/** ms → Wert für <input type="datetime-local"> in Ortszeit («2026-10-28T14:05»). */
export function zuDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}T${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/** Wert aus <input type="datetime-local"> → ms (Ortszeit); null wenn leer/ungültig. */
export function ausDatetimeLocal(s: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** «14:05» heute, sonst «27.10. 14:05». */
export function formatZeit(ms: number, heute = Date.now()): string {
  const d = new Date(ms);
  const h = new Date(heute);
  const uhr = `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  return d.toDateString() === h.toDateString() ? uhr : `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}. ${uhr}`;
}

/** «850 m · 045° / 0800 ‰» von mir zur Sichtung; null ohne eigene Position. */
export function vonMir(ich: Punkt | null, ziel: Punkt): string | null {
  return ich ? `${formatDistanz(distanz(ich, ziel))} · ${formatRichtung(azimut(ich, ziel))}` : null;
}

/** Neueste Meldung oben. */
export const neuesteZuerst = (liste: Iterable<Sichtung>): Sichtung[] => [...liste].sort((a, b) => b.erstelltAm - a.erstelltAm);

/** Kleines Kamera-Zeichen (Sichtung mit Foto) für Karte und Liste. */
export const KAMERA_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/></svg>';
