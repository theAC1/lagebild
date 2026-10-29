// UI-Zustand: offene Panels (bis zu zwei), Toasts, Punktwahl, Kontext- und Radial-Menü.
import { MediaQuery } from 'svelte/reactivity';
import type { Punkt } from '../../../shared/protocol.ts';

export type Auswahl = { art: string; id: string };
/** Ein offenes Panel. Details laufen als Panel `DETAIL` mit params `{ art, id }`. */
export type PanelZustand = { id: string; params: Record<string, any> };
/** Ziel eines Radial-Menüs (Langdruck/Rechtsklick auf ein Symbol). */
export type RadialArt = 'teilnehmer' | 'marker' | 'sichtung' | 'ich' | 'zeichnung';
export type RadialZiel = { art: RadialArt; id: string };

/** Panel-ID des Detail-Sheets (ui.auswahl). */
export const DETAIL = 'detail';
const LEISTE_KEY = 'lagebild.leisteZu';

// Ab dieser Breite (und quer) zwei Panels nebeneinander, darunter ersetzt ein neues Panel das offene.
const zweiPanels = typeof window === 'undefined' ? null : new MediaQuery('(min-width: 1100px) and (orientation: landscape)', false);
export const maxPanels = (): number => (zweiPanels?.current ? 2 : 1);

class UiZustand {
  /** Offene Panels in Anzeigereihenfolge (links → rechts); höchstens maxPanels(). */
  panels = $state<PanelZustand[]>([]);
  /** ID des obersten Panels: zuletzt geöffnet oder bedient. Esc und schliesse() ohne ID treffen dieses. */
  oben = $state<string | null>(null);
  toasts = $state<{ id: number; text: string; knopf?: ToastKnopf }[]>([]);
  /** Aktiver Fadenkreuz-Modus (siehe map.ts waehlePunkt); `knopf` beschriftet die Bestätigung. */
  punktWahl = $state<{ hinweis: string; knopf: string; fertig: (p: Punkt | null) => void } | null>(null);
  /** Langdruck-Punkt → Kontextmenü. */
  kontext = $state<Punkt | null>(null);
  /** Langdruck/Rechtsklick auf ein Symbol → Radial-Menü um (x, y) in Bildschirmpixeln. */
  radial = $state<{ ziel: RadialZiel; x: number; y: number } | null>(null);
  /** Karte folgt der eigenen Position. */
  folgen = $state(false);
  /** Karte folgt diesem Teilnehmer (schliesst folgen aus). */
  folgtTeilnehmer = $state<string | null>(null);
  /** Werkzeugleiste im Querformat eingeklappt (gemerkt). */
  leisteZu = $state(lies(LEISTE_KEY) === '1');

  /** Oberstes Feature-Panel (ohne Details) – kompatibel zu v1. Für «ist X offen?» istOffen(id) nehmen. */
  get panel(): PanelZustand | null {
    const p = this.panels.filter((x) => x.id !== DETAIL);
    return p.find((x) => x.id === this.oben) ?? p.at(-1) ?? null;
  }
  /** Ausgewähltes Objekt im Detail-Sheet – kompatibel zu v1. */
  get auswahl(): Auswahl | null {
    const d = this.panels.find((x) => x.id === DETAIL);
    return d ? (d.params as Auswahl) : null;
  }
}

export const ui = new UiZustand();

// Panel, in dem zuletzt getippt wurde (siehe merkeQuelle): öffnet es ein anderes, ersetzt dieses sich selbst (Drill-down).
let quelle: string | null = null;
/** Nur für App: bei jedem pointerdown die Panel-ID unter dem Finger (oder null) melden. */
export function merkeQuelle(panelId: string | null): void {
  quelle = panelId;
  if (panelId) ui.oben = panelId;
}

export const istOffen = (id: string): boolean => ui.panels.some((p) => p.id === id);

/**
 * Panel öffnen. Schon offen → nur params ersetzen. Aus einem Panel heraus geöffnet → ersetzt dieses.
 * Sonst daneben, solange Platz ist (≥ 1100 px quer: zwei), andernfalls ersetzt es das ältere.
 */
export function oeffne(featureId: string, params: Record<string, any> = {}): void {
  ui.punktWahl?.fertig(null); // Panels sind während der Punktwahl ausgeblendet: Knopf am Rand bricht sie ab
  ui.kontext = null;
  ui.radial = null;
  const neu = { id: featureId, params };
  const liste = ui.panels;
  const max = maxPanels();
  let ziel = liste.findIndex((p) => p.id === featureId);
  if (ziel < 0) ziel = liste.findIndex((p) => p.id === quelle);
  if (ziel < 0 && liste.length >= max) ziel = liste.findIndex((p) => p.id !== ui.oben);
  if (ziel >= 0) ui.panels = liste.map((p, i) => (i === ziel ? neu : p)).slice(-max);
  else ui.panels = [...liste, neu].slice(-max);
  ui.oben = featureId;
  quelle = null;
}

/** Detail-Sheet für ein Objekt (art 'teilnehmer' eingebaut, sonst Feature mit passender detailArt). */
export function waehle(art: string, id: string): void {
  oeffne(DETAIL, { art, id });
}

/** Panel schliessen; ohne ID das oberste. */
export function schliesse(id: string | null = ui.oben): void {
  ui.panels = ui.panels.filter((p) => p.id !== id);
  if (ui.oben === id || !istOffen(ui.oben ?? '')) ui.oben = ui.panels.at(-1)?.id ?? null;
}

export function schliesseAlle(): void {
  ui.panels = [];
  ui.oben = null;
}

/** Nur für App: nach Drehen/Verkleinern unter 1100 px nur das oberste Panel behalten. */
export function begrenzePanels(): void {
  const max = maxPanels();
  if (ui.panels.length <= max) return;
  const oben = ui.panels.find((p) => p.id === ui.oben);
  ui.panels = oben ? [oben] : ui.panels.slice(-max);
}

export function setzeLeisteZu(zu: boolean): void {
  ui.leisteZu = zu;
  schreibe(LEISTE_KEY, zu ? '1' : null);
}

/** Optionaler Knopf im Toast, z.B. «Bearbeiten» nach dem schnellen Marker. */
export type ToastKnopf = { label: string; aktion: () => void };

let toastId = 0;
export function toast(text: string, dauerMs = 3500, knopf?: ToastKnopf): void {
  const id = ++toastId;
  ui.toasts = [...ui.toasts.slice(-2), { id, text, knopf }];
  setTimeout(() => (ui.toasts = ui.toasts.filter((t) => t.id !== id)), dauerMs);
}

/** 24×24-Strich-Icon aus SVG-Pfaden (für Feature.icon). */
export const ikon = (inhalt: string) =>
  `<svg class="ikon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inhalt}</svg>`;

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
