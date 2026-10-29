// PostCSS-Plugin für die Einstellung «Bediengrösse» (lib/groesse.svelte.ts): px in den eigenen Stilen werden zu
// Vielfachen von --u (= 1px × --ui) bzw. bei Schriftgrössen von --s (= 1px × --schrift). So schreibt jede Komponente
// weiter Design-Pixel, und ein Faktor auf <html> skaliert alles gleich. Bei --ui = 1 bleibt alles pixelgenau wie vorher.
// Fix bleiben: Haarlinien (≤ 1px), Rahmen, Umrisse, Schatten, Media Queries (keine Deklarationen) und Werte, die
// selbst schon var(--u), var(--s) oder var(--karte) nutzen (dort hat die Komponente bewusst entschieden).
import type { Plugin } from 'postcss';

const PX = /(-?\d*\.?\d+)px\b/g;
const FIX_PROP = /^(border(?!-radius)|outline|box-shadow|text-shadow)/;
const SCHON = /var\(--(u|s|karte)\)/;

export function skaliere(prop: string, wert: string): string {
  if (FIX_PROP.test(prop) || SCHON.test(wert) || !wert.includes('px')) return wert;
  const einheit = prop === 'font-size' || prop === 'font' ? '--s' : '--u';
  return wert.replace(PX, (alles, n: string) => (Math.abs(Number(n)) <= 1 ? alles : `calc(${n} * var(${einheit}))`));
}

/** Nur Dateien unter client/src (nicht maplibre-gl.css aus node_modules). */
export const uiSkala = (): Plugin => ({
  postcssPlugin: 'ui-skala',
  Declaration(d) {
    if (!d.source?.input.file?.includes('/client/src/')) return;
    d.value = skaliere(d.prop, d.value);
  },
});
