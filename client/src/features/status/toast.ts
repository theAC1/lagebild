// Neue Meldungen anderer als Toast, in beiden Bedienungen (der Snapshot kommt nicht als 'meldung' → kein Schwall beim Verbinden).
import { beiNachricht, statusDef, store } from '../../lib/store.svelte.ts';
import { toast } from '../../lib/ui.svelte.ts';
import { meldungText } from './logik.ts';

beiNachricht((m) => {
  // status null = Alarm-Eintrag des Servers; den zeigt schon das Alarm-Banner
  if (m.typ !== 'meldung' || m.meldung.von === store.ich || m.meldung.status === null) return;
  const { von, status, text } = m.meldung;
  toast(meldungText(store.teilnehmer.get(von)?.rufname ?? 'Unbekannt', status ? (statusDef(status)?.label ?? status) : null, text));
});
