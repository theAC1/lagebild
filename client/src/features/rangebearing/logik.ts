// Range & Bearing: Endpunkte, Auflösung auf Koordinaten, Beschriftung. Reine Logik (getestet).
import { z } from 'zod';
import { Id, Punkt } from '../../../../shared/protocol.ts';
import { azimut, distanz, formatDistanz, promille } from '../../lib/coords.ts';

export type Endpunkt =
  | { art: 'ich' }
  | { art: 'teilnehmer' | 'marker' | 'sichtung'; id: string }
  | { art: 'punkt'; punkt: Punkt };

export type Messung = { id: string; a: Endpunkt; b: Endpunkt };

/** Woraus Endpunkte aufgelöst werden (aus dem Store). */
export interface Quellen {
  ich: Punkt | null;
  teilnehmer: (id: string) => Punkt | null;
  marker: (id: string) => Punkt | null;
  sichtung: (id: string) => Punkt | null;
}

export const ICH: Endpunkt = { art: 'ich' };

const EndpunktSchema = z.discriminatedUnion('art', [
  z.object({ art: z.literal('ich') }),
  z.object({ art: z.enum(['teilnehmer', 'marker', 'sichtung']), id: Id }),
  z.object({ art: z.literal('punkt'), punkt: Punkt }),
]);
const MessungSchema = z.object({ id: Id, a: EndpunktSchema, b: EndpunktSchema });

/** Endpunkt aus fremden Daten (ui-params, localStorage) prüfen; null wenn ungültig. */
export function alsEndpunkt(x: unknown): Endpunkt | null {
  const r = EndpunktSchema.safeParse(x);
  return r.success ? r.data : null;
}

/** Gespeicherte Liste lesen; Ungültiges fällt still weg. */
export function ladeMessungen(json: string | null): Messung[] {
  try {
    const roh = JSON.parse(json ?? '[]');
    if (!Array.isArray(roh)) return [];
    return roh.flatMap((m) => {
      const r = MessungSchema.safeParse(m);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

export const gleich = (x: Endpunkt, y: Endpunkt) => schluessel(x) === schluessel(y);

/** Eindeutiger Text je Endpunkt, auch als <select>-Wert: «ich», «teilnehmer:ID», «punkt:lat,lon». */
export function schluessel(e: Endpunkt): string {
  if (e.art === 'ich') return 'ich';
  if (e.art === 'punkt') return `punkt:${e.punkt.lat.toFixed(6)},${e.punkt.lon.toFixed(6)}`;
  return `${e.art}:${e.id}`;
}

export function ausSchluessel(s: string): Endpunkt | null {
  if (s === 'ich') return ICH;
  const i = s.indexOf(':');
  const art = s.slice(0, i);
  const rest = s.slice(i + 1);
  if (art === 'punkt') {
    const [lat, lon] = rest.split(',').map(Number);
    return alsEndpunkt({ art, punkt: { lat, lon } });
  }
  return alsEndpunkt({ art, id: rest });
}

export function aufloesen(e: Endpunkt, q: Quellen): Punkt | null {
  switch (e.art) {
    case 'ich':
      return q.ich;
    case 'punkt':
      return e.punkt;
    default:
      return q[e.art](e.id);
  }
}

export interface Ergebnis {
  m: number;
  grad: number;
  /** Rückazimut (von B nach A) */
  rueck: number;
}

export function messe(a: Punkt, b: Punkt): Ergebnis {
  return { m: distanz(a, b), grad: azimut(a, b), rueck: azimut(b, a) };
}

export const formatGrad = (g: number) => `${String(Math.round(g) % 360).padStart(3, '0')}°`;
export const formatPromille = (g: number) => `${String(Math.round(promille(g)) % 6400).padStart(4, '0')} ‰`; // wie formatRichtung im Kern

/** «1.24 km · 047° · 0836 ‰» */
export const rbLabel = (e: Pick<Ergebnis, 'm' | 'grad'>) => `${formatDistanz(e.m)} · ${formatGrad(e.grad)} · ${formatPromille(e.grad)}`;
