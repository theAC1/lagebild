// Sonnenhöhe für Tag/Nacht (vereinfachte Formeln des Astronomical Almanac, genau auf ~0.1°).
import type { Punkt } from '../../../shared/protocol.ts';

const GRAD = Math.PI / 180;

/** Höhe der Sonne über dem Horizont in Grad (ohne Refraktion) am Ort p zur Zeit ms (Epoch). */
export function sonnenHoehe(p: Punkt, ms: number): number {
  const d = ms / 86_400_000 - 10_957.5; // Tage seit J2000.0 (2000-01-01 12:00 UTC)
  const g = (357.529 + 0.98560028 * d) * GRAD; // mittlere Anomalie
  const q = 280.459 + 0.98564736 * d; // mittlere Länge
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * GRAD; // ekliptikale Länge
  const e = (23.439 - 0.00000036 * d) * GRAD; // Schiefe der Ekliptik
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
  const dekl = Math.asin(Math.sin(e) * Math.sin(l));
  const sternzeit = (280.46061837 + 360.98564736629 * d + p.lon) * GRAD; // Ortssternzeit
  const h = sternzeit - ra; // Stundenwinkel
  const lat = p.lat * GRAD;
  return Math.asin(Math.sin(lat) * Math.sin(dekl) + Math.cos(lat) * Math.cos(dekl) * Math.cos(h)) / GRAD;
}

/** Tagmodus, solange die Sonne über dem Horizont steht. */
export const istTag = (p: Punkt, ms: number): boolean => sonnenHoehe(p, ms) > 0;
