// Gemeinsamer Zustand von Spuren-Panel und -Layer. Lebensdauer = SpurenLayer (Login bis Logout).
import { SvelteSet } from 'svelte/reactivity';
import type { Position, Spuren } from '../../../../shared/protocol.ts';
import { api, beiNachricht } from '../../lib/store.svelte.ts';
import { anhaengen, seitFuer, SPUR_FARBEN, zusammenfuehren, type Fenster } from './logik.ts';

class SpurZustand {
  sichtbar = new SvelteSet<string>();
  fenster = $state<Fenster>('1h');
  daten = $state.raw<Record<string, Position[]>>({}); // immer ersetzt, nie mutiert → kein tiefer Proxy
  geladen = $state(false);
  laedt = $state(false);
  fehler = $state<string | null>(null);
}

export const spuren = new SpurZustand();

// Farbe nach Reihenfolge des ersten Auftretens: die ersten 10 sind sicher verschieden, bleibt in der Sitzung stabil.
const farbIndex = new Map<string, number>();
export function spurFarbe(id: string): string {
  if (!farbIndex.has(id)) farbIndex.set(id, farbIndex.size);
  return SPUR_FARBEN[farbIndex.get(id)! % SPUR_FARBEN.length];
}

let ladeNr = 0;
export async function lade(): Promise<void> {
  const nr = ++ladeNr;
  spuren.laedt = true;
  spuren.fehler = null;
  try {
    const r = await api(`/api/spuren?seit=${seitFuer(spuren.fenster, Date.now())}`);
    const d: Spuren = await r.json();
    if (nr !== ladeNr) return; // überholt (Fenster gewechselt)
    spuren.daten = zusammenfuehren(d, spuren.daten);
    spuren.geladen = true;
  } catch (e) {
    if (nr === ladeNr) spuren.fehler = (e as Error).message;
  } finally {
    if (nr === ladeNr) spuren.laedt = false;
  }
}

export function setzeFenster(f: Fenster): void {
  spuren.fenster = f;
  if (spuren.geladen || spuren.sichtbar.size) void lade();
}

export function zeige(ids: string[], an: boolean): void {
  for (const id of ids) {
    if (an) spuren.sichtbar.add(id);
    else spuren.sichtbar.delete(id);
  }
  if (an && !spuren.geladen && !spuren.laedt) void lade();
}

/**
 * Live-Punkte sammeln, aber erst, wenn Spuren gebraucht werden (zeige() lädt dann nach); nur im Zeitfenster.
 * Nach Wiederverbindung Lücke nachladen. Gibt die Abmeldung zurück (setzt alles zurück).
 */
export function starte(): () => void {
  const ab = beiNachricht((m) => {
    if (m.typ === 'pos' && (spuren.geladen || spuren.laedt || spuren.sichtbar.size)) {
      const seit = seitFuer(spuren.fenster, Date.now());
      spuren.daten = { ...spuren.daten, [m.id]: anhaengen(spuren.daten[m.id], m.pos, seit) };
    }
    if (m.typ === 'snapshot' && spuren.geladen) void lade();
  });
  return () => {
    ab();
    ladeNr++;
    spuren.sichtbar.clear();
    spuren.daten = {};
    spuren.geladen = false;
    spuren.laedt = false;
    spuren.fehler = null;
    farbIndex.clear();
  };
}
