// Bloodhound: Geschwindigkeitsglättung, Restzeit, Farbstufen, Erreicht-Erkennung. Reine Logik (getestet).
import { z } from 'zod';
import { BloodhoundZiel, type BloodhoundAuftrag } from '../../../../shared/protocol.ts';
import { distanz } from '../../lib/coords.ts';

/** Wurde der aufgehobene Auftrag durch einen neuen für dieselbe Person ersetzt? (Dann keine Aufhebe-Meldung.) */
export const istErsetzt = (auftraege: Iterable<Pick<BloodhoundAuftrag, 'id' | 'an' | 'ende'>>, alt: Pick<BloodhoundAuftrag, 'id' | 'an'>): boolean =>
  [...auftraege].some((x) => x.an === alt.an && x.id !== alt.id && x.ende === null);

/** Darunter gilt die Person als stehend: Restzeit «—». */
export const MIN_TEMPO = 0.3;
/** Auftrag gilt in diesem Abstand zum Ziel als erreicht. */
export const ERREICHT_M = 25;
/** Gewicht der neuesten Messung im exponentiellen Mittel. */
export const GLAETTUNG = 0.3;
/** Messungen näher als das (ms) zusammen werden übersprungen; längere Lücken setzen die Glättung neu an. */
const MIN_DT_MS = 1000;
const MAX_DT_MS = 180_000;
/** Genauigkeit schlechter als das: Messung nicht für die Geschwindigkeit nutzen. */
const MAX_CE_M = 100;

export type Messpunkt = { lat: number; lon: number; t: number; ce?: number | null };
/** Zustand der Glättung: letzte verwertete Position und geglättetes Tempo (m/s, null = noch unbekannt). */
export type TempoZustand = { lat: number; lon: number; t: number; v: number | null };

/**
 * Nächster Glättungszustand aus einer neuen Position. Tempo aus Abstand/Zeit der letzten Positionen;
 * gleicher Zeitstempel oder zu schnelle Folgen ändern nichts, Lücken > 180 s beginnen neu.
 */
export function naechsterTempo(alt: TempoZustand | null, p: Messpunkt): TempoZustand {
  const neu = { lat: p.lat, lon: p.lon, t: p.t };
  if (!alt || p.t < alt.t || p.t - alt.t > MAX_DT_MS) return { ...neu, v: null };
  const dt = p.t - alt.t;
  if (dt < MIN_DT_MS || (p.ce != null && p.ce > MAX_CE_M)) return alt;
  const roh = distanz(alt, p) / (dt / 1000);
  const v = alt.v === null ? roh : GLAETTUNG * roh + (1 - GLAETTUNG) * alt.v;
  return { ...neu, v };
}

/** Restzeit in Sekunden bis zum Ziel; null bei Stillstand oder unbekanntem Tempo. */
export function restzeitS(distM: number, v: number | null): number | null {
  return v !== null && v >= MIN_TEMPO ? distM / v : null;
}

export type Stufe = 'neutral' | 'gruen' | 'gelb' | 'rot';
/** > 360 s neutral, ≤ 360 s grün, ≤ 180 s gelb, ≤ 60 s rot. */
export function stufe(restS: number | null): Stufe {
  if (restS === null || restS > 360) return 'neutral';
  if (restS > 180) return 'gruen';
  if (restS > 60) return 'gelb';
  return 'rot';
}
export const STUFE_FARBE: Record<Stufe, string> = { neutral: '#c8b46a', gruen: '#4caf70', gelb: '#e8c33a', rot: '#e5484d' };

/** «5:42», «1:05:30»; null → «—». */
export function formatRestzeit(s: number | null): string {
  if (s === null || !isFinite(s)) return '—';
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sek = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sek}` : `${m}:${sek}`;
}

/** Meldet je Auftrag genau einmal «erreicht», sobald der Abstand ≤ ERREICHT_M ist. */
export class ErreichtWaechter {
  private gemeldet = new Set<string>();
  /** true genau beim ersten Mal; mit `merken = false` (z.B. Senden misslang) zählt es nicht als gemeldet. */
  pruefe(id: string, distM: number | null, merken = true): boolean {
    if (distM === null || distM > ERREICHT_M || this.gemeldet.has(id)) return false;
    if (merken) this.gemeldet.add(id);
    return true;
  }
  vergiss(id: string): void {
    this.gemeldet.delete(id);
  }
}

/** Lokal gespeichertes Bloodhound (ein aktives pro Person). `auftragId` gesetzt = Auftrag von der Leitung. */
export type Lokal = { ziel: BloodhoundZiel; auftragId?: string };
const LokalSchema = z.object({ ziel: BloodhoundZiel, auftragId: z.string().optional() });

export function ladeLokal(json: string | null): Lokal | null {
  try {
    const r = LokalSchema.safeParse(JSON.parse(json ?? 'null'));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
