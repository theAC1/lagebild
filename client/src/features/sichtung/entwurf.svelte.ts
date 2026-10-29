// Formular-Entwurf auf Modulebene: überlebt das Ausblenden des Sheets (Fadenkreuz-Punktwahl) und Schliessen des Panels.
import type { Punkt } from '../../../../shared/protocol.ts';
import { waehlePunkt } from '../../lib/map.ts';
import { oeffne } from '../../lib/ui.svelte.ts';
import { STANDARD_WAHL, type Wahl } from './logik.ts';

export interface Entwurf {
  /** null = eigene Live-Position beim Melden */
  ort: Punkt | null;
  /** Chips (Art, Grösse, Tätigkeit …), siehe felderAus */
  wahl: Wahl;
  /** Freitext, eingeklappt hinter «+ Text» */
  einheit: string;
  bemerkung: string;
  /** Start der Meldung: «jetzt» bzw. «vor n min» zählen ab hier */
  zeitMs: number;
  /** verkleinertes JPEG (EXIF durch Re-Encode entfernt) */
  foto: Blob | null;
  fotoUrl: string | null;
  /** nach erfolgreichem Upload gemerkt, damit ein erneuter Versuch nicht doppelt hochlädt */
  fotoId: string | null;
}

export const sichtungZustand = $state<{ entwurf: Entwurf | null }>({ entwurf: null });

export function starteEntwurf(ort: Punkt | null = null): void {
  verwirfEntwurf();
  sichtungZustand.entwurf = {
    ort,
    wahl: { ...STANDARD_WAHL, ausruestung: [] },
    einheit: '',
    bemerkung: '',
    zeitMs: Date.now(),
    foto: null,
    fotoUrl: null,
    fotoId: null,
  };
}

/**
 * Hauptknopf «Sichtung»: Fadenkreuz → «Hier» → Chips mit Vorgaben → «Senden» (drei Tipps).
 * Ein Entwurf mit Foto oder Text wird fortgesetzt; sonst neu, damit nicht alter Ort und alte Zeit rausgehen.
 */
export async function sichtungMelden(): Promise<void> {
  const e = sichtungZustand.entwurf;
  if (e && (e.foto || e.einheit.trim() || e.bemerkung.trim())) return oeffne('sichtung');
  const p = await waehlePunkt('Fadenkreuz auf den Ort der Sichtung', 'Hier');
  if (!p) return;
  starteEntwurf(p);
  oeffne('sichtung');
}

export function setzeFoto(foto: Blob | null): void {
  const e = sichtungZustand.entwurf;
  if (!e) return;
  if (e.fotoUrl) URL.revokeObjectURL(e.fotoUrl);
  e.foto = foto;
  e.fotoUrl = foto ? URL.createObjectURL(foto) : null;
  e.fotoId = null;
}

export function verwirfEntwurf(): void {
  setzeFoto(null);
  sichtungZustand.entwurf = null;
}
