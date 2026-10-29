// Marker-Schnellablauf (Spec v3): Fadenkreuz → «Setzen» → Marker mit dem zuletzt benutzten Zeichen, ohne Bezeichnung.
import { waehlePunkt } from '../../lib/map.ts';
import { sendeBestaetigt, store } from '../../lib/store.svelte.ts';
import { istGueltig } from '../../lib/symbol.ts';
import { lies, oeffne, schreibe, toast } from '../../lib/ui.svelte.ts';
import { MARKER_STANDARD_SIDC, setzenNachricht } from './logik.ts';

const ZEICHEN_KEY = 'lagebild.marker.zeichen';

/** Zuletzt benutztes Zeichen (pro Gerät gemerkt), sonst der Standard. */
export function letztesZeichen(): string {
  const s = lies(ZEICHEN_KEY);
  return s && istGueltig(s) ? s : MARKER_STANDARD_SIDC;
}
export const merkeZeichen = (sidc: string): void => schreibe(ZEICHEN_KEY, sidc);

export async function markerSchnell(): Promise<void> {
  const p = await waehlePunkt('Karte verschieben, bis das Fadenkreuz auf dem Ort liegt', 'Setzen');
  if (!p) return;
  let id: string | null = null;
  const z = await sendeBestaetigt(setzenNachricht({ sidc: letztesZeichen(), lat: p.lat, lon: p.lon, bezeichnung: '', notiz: '' }), (m) => {
    if (m.typ !== 'marker' || m.marker.von !== store.ich || m.marker.lat !== p.lat || m.marker.lon !== p.lon) return false;
    id = m.marker.id;
    return true;
  });
  const neu = id;
  if (z === 'bestaetigt' && neu) toast('Marker gesetzt', 6000, { label: 'Bearbeiten', aktion: () => oeffne('marker', { bearbeiten: neu }) });
  else if (z === 'unbestaetigt') toast('Marker nicht bestätigt – Verbindung prüfen.', 6000);
}
