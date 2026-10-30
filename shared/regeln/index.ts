// Fachliche Regeln einer Lage als reine Funktion: wende(zustand, ereignis) → Änderungen + Deltas oder Ablehnung.
// Heute ruft sie der Server je WebSocket-Nachricht auf; später falten die Geräte damit ihr Ereignislog.
import { BLOODHOUND_TYPEN, wendeBloodhound } from './bloodhound.ts';
import { LAGE_TYPEN, wendeLage } from './lage.ts';
import { RASTER_TYPEN, wendeRaster } from './raster.ts';
import { TAUFE_TYPEN, wendeTaufe } from './taufe.ts';
import type { Befehl, Ereignis, Ergebnis, Zustand } from './typen.ts';
import { wendeZeichnen, ZEICHNEN_TYPEN } from './zeichnen.ts';

export * from './typen.ts';
export { MAX_AUFTRAEGE_JE_LAGE, offen, sichtbareAuftraege } from './bloodhound.ts';
export { MAX_MARKER_JE_LAGE, MAX_SICHTUNGEN_JE_LAGE, POS_MIN_ABSTAND_MS } from './lage.ts';
export { doppelterListenName, MAX_TAUFEN_JE_LAGE, MAX_TAUFEN_ZEICHEN_JE_LAGE, nameFrei } from './taufe.ts';
export { MAX_EBENEN_JE_LAGE, MAX_ZEICHNUNGEN_JE_LAGE, MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE } from './zeichnen.ts';
export { empfaengt, sichtbar } from './sichtbar.ts';
export { anwenden, speicher, type Daten } from './speicher.ts';

type Wender = (z: Zustand, e: Ereignis) => Ergebnis;
/** Jeder Befehlstyp gehört genau einem Modul; `satisfies` prüft beim Bauen, dass keiner fehlt. */
const je = <T extends string>(typen: readonly T[], w: (z: Zustand, e: never) => Ergebnis): Record<T, Wender> =>
  Object.fromEntries(typen.map((t) => [t, w as Wender])) as Record<T, Wender>;
const WENDER = {
  ...je(LAGE_TYPEN, wendeLage),
  ...je(ZEICHNEN_TYPEN, wendeZeichnen),
  ...je(BLOODHOUND_TYPEN, wendeBloodhound),
  ...je(RASTER_TYPEN, wendeRaster),
  ...je(TAUFE_TYPEN, wendeTaufe),
} satisfies Record<Befehl['typ'], Wender>;

export const wende = (z: Zustand, e: Ereignis): Ergebnis => WENDER[e.msg.typ](z, e);
