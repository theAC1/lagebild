// Messungen je Lage, lokal im Gerät gespeichert. Panel und MapLayer teilen diesen Zustand.
import type { Punkt } from '../../../../shared/protocol.ts';
import { store } from '../../lib/store.svelte.ts';
import { lies, schreibe } from '../../lib/ui.svelte.ts';
import { aufloesen, gleich, ICH, ladeMessungen, type Endpunkt, type Messung, type Quellen } from './logik.ts';

const key = (lageId: string) => `lagebild.rb.${lageId}`;

class RbZustand {
  liste = $state<Messung[]>([]);
  lageId: string | null = null;
}
export const rb = new RbZustand();

/** Liste der aktuellen Lage laden (vom MapLayer bei Lagewechsel aufgerufen). */
export function ladeFuer(lageId: string | null): void {
  if (rb.lageId === lageId) return;
  rb.lageId = lageId;
  rb.liste = lageId ? ladeMessungen(lies(key(lageId))) : [];
}

function setze(liste: Messung[]): void {
  rb.liste = liste;
  if (rb.lageId) schreibe(key(rb.lageId), JSON.stringify(liste));
}

const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Neue Messung A→B; existiert dieselbe schon, wird keine doppelte angelegt. Liefert die ID. */
export function hinzufuegen(b: Endpunkt, a: Endpunkt = ICH): string {
  const da = rb.liste.find((m) => gleich(m.a, a) && gleich(m.b, b));
  if (da) return da.id;
  const id = neueId();
  setze([{ id, a, b }, ...rb.liste]);
  return id;
}

export function aendere(id: string, seite: 'a' | 'b', e: Endpunkt): void {
  setze(rb.liste.map((m) => (m.id === id ? { ...m, [seite]: e } : m)));
}

export function entferne(id: string): void {
  setze(rb.liste.filter((m) => m.id !== id));
}

const posVon = (p: { lat: number; lon: number } | null | undefined): Punkt | null => (p ? { lat: p.lat, lon: p.lon } : null);

/** Endpunkte aus dem Live-Store (reaktiv gelesen). */
export const quellen: Quellen = {
  get ich() {
    return posVon(store.meinePos);
  },
  teilnehmer: (id) => (id === store.ich && store.meinePos ? posVon(store.meinePos) : posVon(store.teilnehmer.get(id)?.pos)),
  marker: (id) => posVon(store.marker.get(id)),
  sichtung: (id) => posVon(store.sichtungen.get(id)),
};

export const punktVon = (e: Endpunkt) => aufloesen(e, quellen);
