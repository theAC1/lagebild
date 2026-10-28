// Sende- und Frische-Regeln für Positionen (rein, testbar).
import { OFFLINE_MS, STALE_MS, type Punkt } from '../../../shared/protocol.ts';
import { distanz } from './coords.ts';

export const MIN_ABSTAND_MS = 1000;
export const BEWEGUNG_M = 25;
/** «Dynamisch»: unter 0.45 m/s (≈ 1 mph, wie ATAK) gilt Stillstand → alle 30 s. */
export const STILLSTAND_MS = 0.45;
export const STILLSTAND_INTERVALL_MS = 30_000;

/** Senden, wenn erzwungen, das Intervall um ist oder > 25 m Bewegung – aber nie öfter als 1/s. */
export function sollSenden(
  jetzt: number,
  pos: Punkt,
  letzte: { t: number; pos: Punkt } | null,
  intervallMs: number,
  erzwingen = false,
): boolean {
  if (!letzte) return true;
  const seit = jetzt - letzte.t;
  if (seit < MIN_ABSTAND_MS) return false;
  return erzwingen || seit >= intervallMs || distanz(letzte.pos, pos) > BEWEGUNG_M;
}

export type Frische = 'aktiv' | 'stale' | 'geist';

/** aktiv → stale (Alter > staleNach, Rückfall STALE_MS; offline sofort) → geist (Alter > OFFLINE_MS). */
export function frischeAus(alterMs: number, online: boolean, staleNach: number | undefined): Frische {
  if (alterMs > OFFLINE_MS) return 'geist';
  if (!online || alterMs > (staleNach ?? STALE_MS)) return 'stale';
  return 'aktiv';
}
