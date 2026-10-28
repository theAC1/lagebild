// Alarm-Aktionen und Store-Anbindung, geteilt von Banner, Detail und Panel.
import type { Alarm, Punkt, ServerMsg } from '../../../../shared/protocol.ts';
import { meinePosZumSenden, OHNE_QUITTUNG, send, sendeBestaetigt, store } from '../../lib/store.svelte.ts';
import { toast } from '../../lib/ui.svelte.ts';
import { alarmOrt, ARTEN, type AlarmArt } from './logik.ts';

const OHNE_VERBINDUNG = 'Keine Verbindung – nicht gesendet. Funk benutzen!';

/** Aktueller Ort des Alarms: Live-Position des Auslösers (bei mir vom Gerät), sonst Ort beim Auslösen. */
export function ortVon(a: Alarm): Punkt | null {
  const live = a.von === store.ich ? (store.meinePos ?? store.ichSelbst?.pos) : store.teilnehmer.get(a.von)?.pos;
  return alarmOrt(a, live);
}

export const rufname = (id: string) => (id === store.ich ? 'Ich' : (store.teilnehmer.get(id)?.rufname ?? 'Unbekannt'));

/**
 * Sendet die Position immer mit, auch bei Emission Control; der Kern sendet danach sofort die Position (sendePosJetzt).
 * «ausgelöst» erst, wenn der eigene Alarm vom Server zurückkommt – sonst «Funk benutzen!». false: gar nicht gesendet.
 */
export function ausloesen(art: AlarmArt): boolean {
  const pos = meinePosZumSenden();
  if (store.verbindung !== 'verbunden') {
    toast(OHNE_VERBINDUNG, 6000);
    return false;
  }
  const echo = (m: ServerMsg) => m.typ === 'alarm' && m.alarm.von === store.ich && m.alarm.art === art && m.alarm.aufgehobenAm === null;
  void sendeBestaetigt({ typ: 'alarm.ausloesen', art, pos }, echo).then((z) => {
    if (z === 'bestaetigt') {
      navigator.vibrate?.(200);
      toast(`${ARTEN[art].label}-Alarm ausgelöst${pos ? '' : ' (ohne Position – kein GPS)'}`, 5000);
    } else if (z === 'unbestaetigt') {
      navigator.vibrate?.([200, 100, 200, 100, 200]);
      toast(`${ARTEN[art].label}-Alarm ${OHNE_QUITTUNG}`, 10_000);
    }
  });
  return true;
}

export function quittiere(id: string): void {
  if (!send({ typ: 'alarm.quittieren', id })) toast(OHNE_VERBINDUNG);
}

export function hebeAuf(id: string): void {
  if (!send({ typ: 'alarm.aufheben', id })) toast(OHNE_VERBINDUNG);
}
