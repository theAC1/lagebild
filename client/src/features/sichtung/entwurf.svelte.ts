// Formular-Entwurf auf Modulebene: überlebt das Ausblenden des Sheets (Fadenkreuz-Punktwahl) und Schliessen des Panels.
import type { Punkt } from '../../../../shared/protocol.ts';
import { mitZugehoerigkeit, STANDARD_SIDC } from '../../lib/symbol.ts';
import { zuDatetimeLocal, type Vertrauen } from './logik.ts';

export interface Entwurf {
  /** null = eigene Live-Position beim Melden */
  ort: Punkt | null;
  sidc: string;
  groesse: string;
  taetigkeit: string;
  einheit: string;
  /** Wert des datetime-local-Felds (Minuten) */
  zeit: string;
  /** Startzeit des Entwurfs auf die ms – gilt, solange das Zeitfeld unverändert ist */
  zeitMs: number;
  ausruestung: string;
  bemerkung: string;
  vertrauen: Vertrauen;
  /** verkleinertes JPEG (EXIF durch Re-Encode entfernt) */
  foto: Blob | null;
  fotoUrl: string | null;
  /** nach erfolgreichem Upload gemerkt, damit ein erneuter Versuch nicht doppelt hochlädt */
  fotoId: string | null;
}

export const sichtungZustand = $state<{ entwurf: Entwurf | null }>({ entwurf: null });

export function starteEntwurf(ort: Punkt | null = null): void {
  verwirfEntwurf();
  const jetzt = Date.now();
  sichtungZustand.entwurf = {
    ort,
    sidc: mitZugehoerigkeit(STANDARD_SIDC, 'feind'),
    groesse: '',
    taetigkeit: '',
    einheit: '',
    zeit: zuDatetimeLocal(jetzt),
    zeitMs: jetzt,
    ausruestung: '',
    bemerkung: '',
    vertrauen: 'wahrscheinlich',
    foto: null,
    fotoUrl: null,
    fotoId: null,
  };
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
