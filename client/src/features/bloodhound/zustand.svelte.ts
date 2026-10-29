// Bloodhound-Zustand: das eine aktive Bloodhound dieser Person (lokal gespeichert), Tempo-Glättung, Messung.
import { SvelteMap } from 'svelte/reactivity';
import type { BloodhoundAuftrag, BloodhoundZiel, Punkt } from '../../../../shared/protocol.ts';
import { azimut, distanz } from '../../lib/coords.ts';
import { OHNE_QUITTUNG, send, sendeBestaetigt, store } from '../../lib/store.svelte.ts';
import { lies, schreibe, toast } from '../../lib/ui.svelte.ts';
import { punktVon } from '../rangebearing/messungen.svelte.ts';
import { ladeLokal, naechsterTempo, restzeitS, stufe, type Lokal, type Stufe, type TempoZustand } from './logik.ts';
import { signal } from './signal.ts';

const key = (lageId: string) => `lagebild.bloodhound.${lageId}`;

class BhZustand {
  aktiv = $state<Lokal | null>(null);
  lageId: string | null = null;
}
export const bh = new BhZustand();

/** Lokalen Zustand der aktuellen Lage laden (vom MapLayer bei Lagewechsel aufgerufen). */
export function ladeFuer(lageId: string | null): void {
  if (bh.lageId === lageId) return;
  bh.lageId = lageId;
  bh.aktiv = lageId ? ladeLokal(lies(key(lageId))) : null;
}

function setze(l: Lokal | null): void {
  bh.aktiv = l;
  if (bh.lageId) schreibe(key(bh.lageId), l ? JSON.stringify(l) : null);
}

/** Persönliches Bloodhound starten. Ein Auftrag der Leitung wird nie still ersetzt. */
export function starte(ziel: BloodhoundZiel): void {
  if (bh.aktiv?.auftragId) return toast('Erst den Auftrag der Leitung beenden.');
  setze({ ziel });
}

/** Auftrag der Leitung übernehmen: startet automatisch, mit kurzem Signal. */
export function uebernimm(a: BloodhoundAuftrag): void {
  setze({ ziel: a.ziel, auftragId: a.id });
  signal();
  toast('Auftrag von Leitung: Bloodhound');
}

/** Lokal beenden, ohne den Server zu fragen (Ziel weg, Auftrag vom Server beendet). */
export function endeLokal(text?: string): void {
  setze(null);
  if (text) toast(text);
}

/** Beenden-Knopf. Bei einem Auftrag erst die Bestätigung des Servers abwarten. */
export async function beende(): Promise<void> {
  const a = bh.aktiv;
  if (!a) return;
  if (!a.auftragId) return endeLokal();
  const id = a.auftragId;
  const r = await sendeBestaetigt({ typ: 'bloodhound.beendet', id }, (m) => m.typ === 'bloodhound' && m.auftrag.id === id && m.auftrag.ende !== null);
  if (r === 'unbestaetigt') return void toast(OHNE_QUITTUNG);
  if (bh.aktiv?.auftragId === id) endeLokal();
}

export async function quittiere(id: string): Promise<void> {
  const r = await sendeBestaetigt({ typ: 'bloodhound.quittieren', id }, (m) => m.typ === 'bloodhound' && m.auftrag.id === id && m.auftrag.quittiertAm !== null);
  if (r === 'unbestaetigt') toast(OHNE_QUITTUNG);
}

/** Auftrag als erreicht melden; false ohne Verbindung (dann später nochmals versuchen). */
export const meldeErreicht = (id: string): boolean => send({ typ: 'bloodhound.erreicht', id });

// --- Tempo je Person (Schlüssel: Teilnehmer-ID, 'ich' = eigene Live-Position) --------------

const tempi = new SvelteMap<string, TempoZustand>();

export function fuettere(wer: string, p: { lat: number; lon: number; t: number; ce?: number | null }): void {
  const alt = tempi.get(wer) ?? null;
  const neu = naechsterTempo(alt, p);
  if (neu !== alt) tempi.set(wer, neu);
}
export const tempoVon = (wer: string): number | null => tempi.get(wer)?.v ?? null;
export const vergissTempo = (wer: string): void => void tempi.delete(wer);

// --- Messung ----------------------------------------------------------------------------

export type Messung = { dist: number; grad: number; restS: number | null; stufe: Stufe };

/** Luftlinie von `von` zum Ziel, mit Restzeit aus dem Tempo `v`. null, wenn Ziel oder Start unbekannt. */
export function messe(von: Punkt | null, ziel: BloodhoundZiel, v: number | null): Messung | null {
  const z = zielPunkt(ziel);
  if (!von || !z) return null;
  const dist = distanz(von, z);
  const restS = restzeitS(dist, v);
  return { dist, grad: azimut(von, z), restS, stufe: stufe(restS) };
}

export const zielPunkt = (ziel: BloodhoundZiel): Punkt | null => punktVon(ziel as Parameters<typeof punktVon>[0]);

export function zielName(ziel: BloodhoundZiel): string {
  switch (ziel.art) {
    case 'teilnehmer':
      return store.teilnehmer.get(ziel.id!)?.rufname ?? 'Teilnehmer (weg)';
    case 'marker': {
      const m = store.marker.get(ziel.id!);
      return m ? m.bezeichnung || 'Marker' : 'Marker (gelöscht)';
    }
    case 'sichtung': {
      const s = store.sichtungen.get(ziel.id!);
      return s ? `Sichtung ${s.taetigkeit || s.einheit}`.trim() : 'Sichtung (weg)';
    }
    default:
      return 'Kartenpunkt';
  }
}

/** Gibt es das Ziel noch im Store? (Kartenpunkte immer.) */
export const zielDa = (z: BloodhoundZiel): boolean =>
  z.art === 'punkt' || (z.art === 'teilnehmer' ? store.teilnehmer.has(z.id!) : z.art === 'marker' ? store.marker.has(z.id!) : store.sichtungen.has(z.id!));

export const rufname = (id: string): string => store.teilnehmer.get(id)?.rufname ?? 'Unbekannt';
