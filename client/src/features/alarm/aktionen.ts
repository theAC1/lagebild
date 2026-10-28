// Alarm-Aktionen und Store-Anbindung, geteilt von Banner, Detail und Panel.
import type { Alarm, Punkt } from '../../../../shared/protocol.ts';
import { meinePosZumSenden, send, store } from '../../lib/store.svelte.ts';
import { toast } from '../../lib/ui.svelte.ts';
import { alarmOrt, ARTEN, type AlarmArt } from './logik.ts';

const OHNE_VERBINDUNG = 'Keine Verbindung – nicht gesendet. Funk benutzen!';

/** Aktueller Ort des Alarms: Live-Position des Auslösers (bei mir vom Gerät), sonst Ort beim Auslösen. */
export function ortVon(a: Alarm): Punkt | null {
  const live = a.von === store.ich ? (store.meinePos ?? store.ichSelbst?.pos) : store.teilnehmer.get(a.von)?.pos;
  return alarmOrt(a, live);
}

export const rufname = (id: string) => (id === store.ich ? 'Ich' : (store.teilnehmer.get(id)?.rufname ?? 'Unbekannt'));

/** Sendet die Position immer mit, auch bei Emission Control; der Kern sendet danach sofort die Position (sendePosJetzt). */
export function ausloesen(art: AlarmArt): boolean {
  const pos = meinePosZumSenden();
  if (!send({ typ: 'alarm.ausloesen', art, pos })) {
    toast(OHNE_VERBINDUNG, 6000);
    return false;
  }
  navigator.vibrate?.(200);
  toast(`${ARTEN[art].label}-Alarm ausgelöst${pos ? '' : ' (ohne Position – kein GPS)'}`, 5000);
  return true;
}

export function quittiere(id: string): void {
  if (!send({ typ: 'alarm.quittieren', id })) toast(OHNE_VERBINDUNG);
}

export function hebeAuf(id: string): void {
  if (!send({ typ: 'alarm.aufheben', id })) toast(OHNE_VERBINDUNG);
}
