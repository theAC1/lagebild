// Alarm: reine Logik (getestet).
import type { Alarm, Punkt } from '../../../../shared/protocol.ts';

export type AlarmArt = Alarm['art'];

export const ARTEN: Record<AlarmArt, { label: string; kurz: string }> = {
  notfall: { label: 'Notfall', kurz: 'NOTFALL' },
  kontakt: { label: 'Feindkontakt', kurz: 'FEINDKONTAKT' },
};
// Für die spätere CoT-Bridge (nicht v1): notfall = b-a-o-tbl (911), kontakt = b-a-o-opn (Troops in Contact),
// aufheben = b-a-o-can (Cancel).

/** Nicht aufgehobene Alarme, neueste zuerst. */
export const aktive = (alarme: Iterable<Alarm>): Alarm[] =>
  [...alarme].filter((a) => a.aufgehobenAm === null).sort((x, y) => y.t - x.t);

/** Aktive Alarme anderer, die ich noch nicht quittiert habe (→ Ton/Vibration, Badge). */
export const offeneFuer = (alarme: Iterable<Alarm>, ich: string | null): Alarm[] =>
  aktive(alarme).filter((a) => a.von !== ich && !(ich && a.quittiertVon.includes(ich)));

export const kannAufheben = (a: Alarm, ich: string | null, istLeitung: boolean) => istLeitung || a.von === ich;

/** Der Ring folgt der aktuellen Position des Auslösers; Fallback ist der Ort beim Auslösen. */
export function alarmOrt(a: Alarm, aktuell: Punkt | null | undefined): Punkt | null {
  if (aktuell) return { lat: aktuell.lat, lon: aktuell.lon };
  return a.lat !== null && a.lon !== null ? { lat: a.lat, lon: a.lon } : null;
}
