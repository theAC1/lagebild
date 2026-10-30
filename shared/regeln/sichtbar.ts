// Wer welches Delta sehen darf: Chat nach Empfänger, Bloodhound nur Leitung und Empfänger, alles andere alle.
// Heute filtert der Server beim Verteilen, später filtert die Anzeige auf dem Gerät.
import type { Chat, ServerMsg, Teilnehmer } from '../protocol.ts';

type Empfaenger = Pick<Teilnehmer, 'id' | 'einheit' | 'rolle'>;

export function sichtbar(c: Chat, empfaenger: Pick<Teilnehmer, 'id' | 'einheit'>): boolean {
  if (c.von === empfaenger.id) return true;
  if (c.an.art === 'alle') return true;
  if (c.an.art === 'einheit') return c.an.einheit === empfaenger.einheit;
  return c.an.id === empfaenger.id;
}

export function empfaengt(d: ServerMsg, e: Empfaenger): boolean {
  if (d.typ === 'chat') return sichtbar(d.chat, e);
  if (d.typ === 'bloodhound') return e.rolle === 'leitung' || d.auftrag.an === e.id;
  return true;
}
