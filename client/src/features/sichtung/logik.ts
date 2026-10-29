// Reine Hilfen der Sichtungsmeldung (ohne DOM, getestet in logik.test.ts).
import type { Punkt, Sichtung } from '../../../../shared/protocol.ts';
import { azimut, distanz, formatDistanz, formatRichtung } from '../../lib/coords.ts';
import { baueSidc, type Zugehoerigkeit } from '../../lib/symbol.ts';

export const FOTO_MAX_PX = 1600;
export const FOTO_QUALITAET = 0.8;

/** Zielgrösse fürs Verkleinern: längste Seite ≤ max, Seitenverhältnis bleibt, nie vergrössern. */
export function zielMasse(breite: number, hoehe: number, max = FOTO_MAX_PX): { breite: number; hoehe: number } {
  const f = Math.min(1, max / Math.max(breite, hoehe));
  return { breite: Math.max(1, Math.round(breite * f)), hoehe: Math.max(1, Math.round(hoehe * f)) };
}

export const VERTRAUEN = [
  { id: 'bestaetigt', label: 'Bestätigt' },
  { id: 'wahrscheinlich', label: 'Wahrscheinlich' },
  { id: 'unsicher', label: 'Unsicher' },
] as const;
export type Vertrauen = (typeof VERTRAUEN)[number]['id'];
export const vertrauenLabel = (v: Vertrauen) => VERTRAUEN.find((x) => x.id === v)?.label ?? v;

// --- Chips (Spec v3 «Wenig Tipps»): jede Auswahl hat eine Vorgabe, «Senden» geht sofort ---

/** Art setzt das Zeichen (Symbolset + Funktion); Rad-Fahrzeug zusätzlich mit Mobilität «Räder, geländegängig». */
export const ARTEN = [
  { id: 'infanterie', label: 'Infanterie', set: '10', funktion: '121100' },
  { id: 'spz', label: 'Schützenpanzer', set: '10', funktion: '121102' },
  { id: 'panzer', label: 'Panzer', set: '10', funktion: '120500' },
  { id: 'rad', label: 'Rad-Fahrzeug', set: '15', funktion: '140100', mobilitaet: '32' },
  { id: 'drohne', label: 'Drohne', set: '01', funktion: '110300' },
  { id: 'scharfschuetze', label: 'Scharfschütze', set: '10', funktion: '121500' },
  { id: 'unbekannt', label: 'Unbekannt', set: '10', funktion: '000000' },
] as const;
export const SEITEN: { id: Zugehoerigkeit; label: string }[] = [
  { id: 'feind', label: 'Feind' },
  { id: 'unbekannt', label: 'Unbekannt' },
  { id: 'neutral', label: 'Neutral' },
];
/** Grösse; `echelon` erscheint am Truppen-Zeichen. */
export const GROESSEN = [
  { id: 'person', label: '1 Person', echelon: '00' },
  { id: 'trupp', label: 'Trupp (2–4)', echelon: '11' },
  { id: 'gruppe', label: 'Gruppe (~10)', echelon: '12' },
  { id: 'zug', label: 'Zug (~30)', echelon: '14' },
  { id: 'kompanie', label: 'Kompanie+', echelon: '15' },
  { id: 'unbekannt', label: 'unbekannt', echelon: '00' },
] as const;
export const TAETIGKEITEN = ['bewegt sich', 'in Stellung', 'beobachtet', 'schiesst', 'sperrt/baut', 'ruht', 'unbekannt'] as const;
export const RICHTUNGEN = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] as const;
export const AUSRUESTUNG = ['Handwaffen', 'Mg', 'Panzerabwehr', 'Fahrzeuge', 'Drohne'] as const;
export const ZEITEN = [
  { min: 0, label: 'jetzt' },
  { min: 5, label: 'vor 5 min' },
  { min: 15, label: 'vor 15 min' },
  { min: 30, label: 'vor 30 min' },
] as const;

export interface Wahl {
  art: (typeof ARTEN)[number]['id'];
  seite: Zugehoerigkeit;
  groesse: (typeof GROESSEN)[number]['id'];
  taetigkeit: (typeof TAETIGKEITEN)[number];
  /** nur bei «bewegt sich» */
  richtung: (typeof RICHTUNGEN)[number] | null;
  ausruestung: string[];
  vorMin: number;
  vertrauen: Vertrauen;
}

export const STANDARD_WAHL: Wahl = {
  art: 'unbekannt',
  seite: 'feind',
  groesse: 'unbekannt',
  taetigkeit: 'unbekannt',
  richtung: null,
  ausruestung: [],
  vorMin: 0,
  vertrauen: 'wahrscheinlich',
};

/** Chips → Felder von SichtungInput (Vertrag unverändert). «unbekannt» bleibt leer; Zeit relativ zum Start der Meldung. */
export function felderAus(w: Wahl, startMs: number): Pick<Sichtung, 'sidc' | 'groesse' | 'taetigkeit' | 'ausruestung' | 'zeit' | 'vertrauen'> {
  const art = ARTEN.find((a) => a.id === w.art) ?? ARTEN[ARTEN.length - 1];
  const groesse = GROESSEN.find((g) => g.id === w.groesse) ?? GROESSEN[GROESSEN.length - 1];
  const sidc = baueSidc({ zugehoerigkeit: w.seite, set: art.set, groesse: groesse.echelon, funktion: art.funktion });
  const taetigkeit = w.taetigkeit === 'bewegt sich' && w.richtung ? `bewegt sich Richtung ${w.richtung}` : w.taetigkeit;
  return {
    sidc: 'mobilitaet' in art ? sidc.slice(0, 8) + art.mobilitaet + sidc.slice(10) : sidc,
    groesse: w.groesse === 'unbekannt' ? '' : groesse.label,
    taetigkeit: w.taetigkeit === 'unbekannt' ? '' : taetigkeit,
    ausruestung: AUSRUESTUNG.filter((a) => w.ausruestung.includes(a)).join(', '),
    zeit: startMs - w.vorMin * 60_000,
    vertrauen: w.vertrauen,
  };
}

const zwei = (n: number) => String(n).padStart(2, '0');

/** «14:05» heute, sonst «27.10. 14:05». */
export function formatZeit(ms: number, heute = Date.now()): string {
  const d = new Date(ms);
  const h = new Date(heute);
  const uhr = `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  return d.toDateString() === h.toDateString() ? uhr : `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}. ${uhr}`;
}

/** «850 m · 045° / 0800 ‰» von mir zur Sichtung; null ohne eigene Position. */
export function vonMir(ich: Punkt | null, ziel: Punkt): string | null {
  return ich ? `${formatDistanz(distanz(ich, ziel))} · ${formatRichtung(azimut(ich, ziel))}` : null;
}

/** Neueste Meldung oben. */
export const neuesteZuerst = (liste: Iterable<Sichtung>): Sichtung[] => [...liste].sort((a, b) => b.erstelltAm - a.erstelltAm);

/** Kleines Kamera-Zeichen (Sichtung mit Foto) für Karte und Liste. */
export const KAMERA_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/></svg>';
