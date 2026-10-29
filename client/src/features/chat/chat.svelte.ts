// Chat-Zustand: Lesestand (localStorage je Lage), offener Kanal, Toast bei neuer Nachricht.
import { beiNachricht, store } from '../../lib/store.svelte.ts';
import { istOffen, lies, schreibe, toast } from '../../lib/ui.svelte.ts';
import { kanalVon, parseGelesen, startGelesen, uebersicht, type Gelesen } from './kanaele.ts';

const speicherKey = (lageId: string) => `lagebild.chat.gelesen.${lageId}`;

class ChatZustand {
  gelesen = $state<Gelesen>({});
  /** Kanal, der gerade im Panel offen ist (null = Kanalliste oder Panel zu). */
  aktiv = $state<string | null>(null);
  stand = $derived(uebersicht(store.chat, store.ich ?? '', this.gelesen));
  gesamt = $derived([...this.stand.values()].reduce((n, s) => n + s.ungelesen, 0));
}

export const chat = new ChatZustand();

export function markiereGelesen(key: string, t: number): void {
  const lageId = store.lage?.id;
  if (!lageId || (chat.gelesen[key] ?? chat.gelesen['*'] ?? 0) >= t) return;
  chat.gelesen = { ...chat.gelesen, [key]: t };
  schreibe(speicherKey(lageId), JSON.stringify(chat.gelesen));
}

const kurz = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

beiNachricht((m) => {
  if (m.typ === 'snapshot') {
    const geladen = parseGelesen(lies(speicherKey(m.lage.id)));
    chat.gelesen = geladen ?? startGelesen(m.chat);
    if (!geladen) schreibe(speicherKey(m.lage.id), JSON.stringify(chat.gelesen));
    return;
  }
  if (m.typ !== 'chat' || m.chat.von === store.ich) return;
  const key = kanalVon(m.chat, store.ich ?? '');
  // Panel offen und Kanalliste oder genau dieser Kanal sichtbar → kein Toast nötig
  if (istOffen('chat') && (chat.aktiv === null || chat.aktiv === key)) return;
  const rufname = store.teilnehmer.get(m.chat.von)?.rufname ?? 'Unbekannt';
  const wohin = m.chat.an.art === 'einheit' ? ` → ${m.chat.an.einheit}` : m.chat.an.art === 'person' ? ' (direkt)' : '';
  toast(`${rufname}${wohin}: ${kurz(m.chat.text, 60)}`, 5000);
});
