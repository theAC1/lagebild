// Reine Hilfen für das Status-Feature (testbar ohne DOM).
import type { Meldung } from '../../../../shared/protocol.ts';

const DUNKEL = '#161b1f';
const HELL = '#ffffff';

/** Relative Leuchtdichte nach WCAG 2.x für #rrggbb. */
function leuchtdichte(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Schriftfarbe mit dem höheren Kontrast auf einer Statusfarbe (Gelb → dunkel, Grün/Rot → hell). */
export function textFarbeAuf(hex: string): string {
  const l = leuchtdichte(hex);
  return (l + 0.05) / (leuchtdichte(DUNKEL) + 0.05) > 1.05 / (l + 0.05) ? DUNKEL : HELL;
}

/** Meldungslog neueste oben (Ankunftsreihenfolge ist nicht garantiert sortiert). */
export const neuesteZuerst = (m: readonly Meldung[]): Meldung[] => [...m].sort((a, b) => b.t - a.t);

/** «14:05» */
export const formatZeit = (t: number): string =>
  new Date(t).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

/** Toast-Text für eine Meldung: «Alpha: Halt – Brücke gesperrt» */
export function meldungText(rufname: string, statusLabel: string | null, text: string): string {
  const inhalt = [statusLabel, text].filter(Boolean).join(' – ');
  return `${rufname}: ${inhalt || 'Meldung'}`;
}
