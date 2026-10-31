// Alle Features der App. Jedes Feature lebt in features/<id>/ und exportiert default ein `Feature`.
import type { Component } from 'svelte';
import type { Phase } from '../../../shared/protocol.ts';
import marker from './marker/index.ts';
import status from './status/index.ts';
import chat from './chat/index.ts';
import sichtung from './sichtung/index.ts';
import alarm from './alarm/index.ts';
import rangebearing from './rangebearing/index.ts';
import spuren from './spuren/index.ts';
import leitung from './leitung/index.ts';
import bloodhound from './bloodhound/index.ts';
import zeichnen from './zeichnen/index.ts';
import meldungen from './meldungen/index.ts';
import raster from './raster/index.ts';
import taufe from './taufe/index.ts';
import offline from './offline/index.ts';

/** Props jedes Panels: was `oeffne(id, params)` mitgegeben hat. */
export type PanelProps = { params: Record<string, any> };

export interface Feature {
  id: string;
  label: string;
  /** SVG-Markup (siehe `ikon()` in lib/ui.svelte.ts) oder Komponente */
  icon: string | Component;
  /** Inhalt des Panels, wenn `istOffen(id)` (hoch: Sheet unten, quer: Seitenpanel). Ohne Panel kein Knopf in der Werkzeugleiste. */
  Panel?: Component<PanelProps>;
  /** Wird nach dem Laden der Karte gemountet; zeichnet eigene Quellen/Layer/Marker via getMap(). */
  MapLayer?: Component;
  /** Schwebender Schnellknopf rechts über der Werkzeugleiste. */
  Toolbar?: Component;
  /** Knopf in der Kopfleiste: immer erreichbar, auch über offenen Sheets und im Querformat (Alarm). */
  Kopf?: Component;
  /** Detail-Sheet für `ui.auswahl = { art: detailArt, id }`. */
  Detail?: Component<{ id: string }>;
  detailArt?: string;
  /** Knopf/Panel nur für die Leitung */
  nurLeitung?: boolean;
  /** Zähler am Werkzeugknopf (z.B. ungelesene Nachrichten); wird reaktiv gelesen. */
  badge?: () => number;
  /**
   * Bedienung «Daumen-Ränder»: fest sichtbare Hauptaktion am Rand statt im Mehr-Menü (wo sie sitzt, legt components/Daumen fest).
   * `aktion` ersetzt «Panel auf» (ist das Panel offen, schliesst der Knopf es), `Knopf` ersetzt den ganzen Standardknopf.
   */
  haupt?: { aktion?: () => void; Knopf?: Component };
  /** Knöpfe und Panel nur in diesen Phasen (Spec v6); ohne Angabe immer. Der Kartenlayer bleibt in jeder Phase. */
  phasen?: Phase[];
  /** Schalter in der Ebenen-Auswahl unter der Überschrift `label` (pro Gerät gemerkt); wird reaktiv gelesen. */
  ebenen?: () => { label: string; an: boolean; schalten: () => void }[];
}

export const inPhase = (f: Pick<Feature, 'phasen'>, phase: Phase): boolean => !f.phasen || f.phasen.includes(phase);

export const features: Feature[] = [marker, status, chat, sichtung, alarm, rangebearing, spuren, zeichnen, raster, taufe, leitung, meldungen, offline, bloodhound];
