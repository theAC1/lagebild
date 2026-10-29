// Werkzeuge der Palette und Tastaturkürzel (reine Zuordnung, ohne DOM-Zustand).
import type { RaumArt, ZeichnungArt } from '../../../../shared/protocol.ts';

export type WerkzeugId =
  | 'auswahl' | 'lasso' | 'messen'
  | 'linie' | 'pfeil' | 'flaeche' | 'rechteck' | 'kreis' | 'freihand' | 'text'
  | 'phasenlinie' | 'grenze' | 'stossrichtung' | 'sperre'
  | 'raum-bereitstellung' | 'raum-ziel' | 'raum-sperr' | 'raum-verantwortung';

export type Gruppe = 'bedienen' | 'formen' | 'taktisch' | 'raeume';
export interface Werkzeug {
  id: WerkzeugId;
  label: string;
  gruppe: Gruppe;
  kuerzel?: string;
  /** Zeichnungsart, die entsteht (fehlt bei Auswahl, Lasso, Messen) */
  art?: ZeichnungArt;
  raumArt?: RaumArt;
}

export const WERKZEUGE: Werkzeug[] = [
  { id: 'auswahl', label: 'Auswahl', gruppe: 'bedienen', kuerzel: 'S' },
  { id: 'lasso', label: 'Lasso', gruppe: 'bedienen' },
  { id: 'messen', label: 'Messen', gruppe: 'bedienen', kuerzel: 'M' },
  { id: 'linie', label: 'Linie', gruppe: 'formen', kuerzel: 'L', art: 'linie' },
  { id: 'pfeil', label: 'Pfeil', gruppe: 'formen', art: 'pfeil' },
  { id: 'flaeche', label: 'Fläche', gruppe: 'formen', kuerzel: 'P', art: 'flaeche' },
  { id: 'rechteck', label: 'Rechteck', gruppe: 'formen', kuerzel: 'R', art: 'rechteck' },
  { id: 'kreis', label: 'Kreis', gruppe: 'formen', kuerzel: 'K', art: 'kreis' },
  { id: 'freihand', label: 'Freihand', gruppe: 'formen', kuerzel: 'F', art: 'freihand' },
  { id: 'text', label: 'Text', gruppe: 'formen', kuerzel: 'T', art: 'text' },
  { id: 'phasenlinie', label: 'Phasenlinie', gruppe: 'taktisch', art: 'phasenlinie' },
  { id: 'grenze', label: 'Grenze', gruppe: 'taktisch', art: 'grenze' },
  { id: 'stossrichtung', label: 'Stossrichtung', gruppe: 'taktisch', art: 'stossrichtung' },
  { id: 'sperre', label: 'Sperre', gruppe: 'taktisch', art: 'sperre' },
  { id: 'raum-bereitstellung', label: 'Bereitstellungsraum', gruppe: 'raeume', art: 'raum', raumArt: 'bereitstellung' },
  { id: 'raum-ziel', label: 'Zielraum', gruppe: 'raeume', art: 'raum', raumArt: 'ziel' },
  { id: 'raum-sperr', label: 'Sperrraum', gruppe: 'raeume', art: 'raum', raumArt: 'sperr' },
  { id: 'raum-verantwortung', label: 'Verantwortungsraum', gruppe: 'raeume', art: 'raum', raumArt: 'verantwortung' },
];

export const werkzeug = (id: WerkzeugId): Werkzeug => WERKZEUGE.find((w) => w.id === id)!;
/** Auf dem Handy nur diese (Spec: «stark reduziert»). */
export const MOBIL_WERKZEUGE: WerkzeugId[] = ['linie', 'pfeil', 'kreis'];

/** Polylinien-artige Werkzeuge: Klick setzt Punkte, Doppelklick/Enter beendet. */
export const istMehrpunkt = (id: WerkzeugId): boolean => {
  const a = werkzeug(id).art;
  return id === 'messen' || (!!a && !['rechteck', 'kreis', 'text', 'freihand'].includes(a));
};

export type Befehl =
  | { typ: 'werkzeug'; id: WerkzeugId }
  | { typ: 'loeschen' | 'abbrechen' | 'fertig' | 'punktZurueck' | 'rueckgaengig' | 'wiederholen' | 'kopieren' | 'einfuegen' };

type Taste = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Taste → Befehl (Desktop). Buchstaben nur ohne Ctrl/Meta/Alt, damit Browser-Kürzel frei bleiben. */
export function befehlFuer(e: Taste): Befehl | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null;
    if (k === 'z') return { typ: e.shiftKey ? 'wiederholen' : 'rueckgaengig' };
    if (k === 'y') return { typ: 'wiederholen' };
    if (k === 'c') return { typ: 'kopieren' };
    if (k === 'v') return { typ: 'einfuegen' };
    return null;
  }
  if (k === 'Escape') return { typ: 'abbrechen' };
  if (k === 'Enter') return { typ: 'fertig' };
  if (k === 'Delete') return { typ: 'loeschen' };
  if (k === 'Backspace') return { typ: 'punktZurueck' };
  if (e.altKey) return null;
  const w = WERKZEUGE.find((x) => x.kuerzel?.toLowerCase() === k);
  return w ? { typ: 'werkzeug', id: w.id } : null;
}

/** Fokus in einem Eingabefeld → Kürzel aus (Tippen von «L» im Chat soll nicht das Werkzeug wechseln). */
export function istEingabe(el: Element | null): boolean {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset'].includes((el as HTMLInputElement).type);
}
