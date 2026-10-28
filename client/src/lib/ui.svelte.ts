// UI-Zustand: offenes Panel, Auswahl (Detail), Toasts, Punktwahl, Kontextmenü.
import type { Punkt } from '../../../shared/protocol.ts';

export type Auswahl = { art: string; id: string };
export type PanelZustand = { id: string; params: Record<string, any> };

class UiZustand {
  /** Offenes Panel im Bottom-Sheet (Feature-ID oder 'teilnehmer' / 'einstellungen'). */
  panel = $state<PanelZustand | null>(null);
  /** Ausgewähltes Objekt → Detail-Sheet (art 'teilnehmer' eingebaut, sonst Feature mit passender detailArt). */
  auswahl = $state<Auswahl | null>(null);
  toasts = $state<{ id: number; text: string }[]>([]);
  /** Aktiver Fadenkreuz-Modus (siehe map.ts waehlePunkt). */
  punktWahl = $state<{ hinweis: string; fertig: (p: Punkt | null) => void } | null>(null);
  /** Langdruck-Punkt → Kontextmenü. */
  kontext = $state<Punkt | null>(null);
  /** Karte folgt der eigenen Position. */
  folgen = $state(false);
}

export const ui = new UiZustand();

export function oeffne(featureId: string, params: Record<string, any> = {}): void {
  ui.auswahl = null;
  ui.kontext = null;
  ui.panel = { id: featureId, params };
}

export function waehle(art: string, id: string): void {
  ui.panel = null;
  ui.kontext = null;
  ui.auswahl = { art, id };
}

export function schliesse(): void {
  ui.panel = null;
  ui.auswahl = null;
}

let toastId = 0;
export function toast(text: string, dauerMs = 3500): void {
  const id = ++toastId;
  ui.toasts = [...ui.toasts.slice(-2), { id, text }];
  setTimeout(() => (ui.toasts = ui.toasts.filter((t) => t.id !== id)), dauerMs);
}

/** 24×24-Strich-Icon aus SVG-Pfaden (für Feature.icon). */
export const ikon = (inhalt: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inhalt}</svg>`;

/** Kleiner localStorage-Helfer (privater Modus / gesperrter Speicher → still null). */
export function lies(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function schreibe(key: string, wert: string | null): void {
  try {
    if (wert === null) localStorage.removeItem(key);
    else localStorage.setItem(key, wert);
  } catch {
    /* Speicher gesperrt: Einstellung gilt nur für diese Sitzung */
  }
}
