// Einstellung «Bediengrösse»: ein Faktor für alle Bedienelemente. Die Stile schreiben px wie gewohnt, der Build
// rechnet sie in Vielfache von --u (Bedienelemente) und --s (Schrift) um (client/uiSkala.ts); hier entstehen die Faktoren.
import { MediaQuery } from 'svelte/reactivity';
import { store } from './store.svelte.ts';

export type Bediengroesse = 'normal' | 'gross' | 'sehrgross';
export const BEDIENGROESSEN: { id: Bediengroesse; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'gross', label: 'Gross' },
  { id: 'sehrgross', label: 'Sehr gross' },
];

const STUFE: Record<Bediengroesse, number> = { normal: 1, gross: 1.2, sehrgross: 1.4 };
// Symbole und Beschriftungen auf der Karte wachsen gedämpfter, sonst verdecken sie die Lage
const KARTE: Record<Bediengroesse, number> = { normal: 1, gross: 1.15, sehrgross: 1.3 };

export type Faktoren = { ui: number; schrift: number; karte: number };

/** Touch (Finger statt Maus): schon «Normal» grösser – Trefferflächen +25 %, Grundschrift 18 statt 16 px. */
export function faktoren(stufe: Bediengroesse, touch: boolean): Faktoren {
  const s = STUFE[stufe] ?? 1;
  return { ui: s * (touch ? 1.25 : 1), schrift: s * (touch ? 1.125 : 1), karte: KARTE[stufe] ?? 1 };
}

const finger = typeof window === 'undefined' ? null : new MediaQuery('(pointer: coarse)', false);

/** Reaktiv: aktuelle Faktoren (z.B. für Radien und Symbolgrössen im JS). */
export const groesse: Faktoren = {
  get ui() {
    return faktoren(store.einstellungen.groesse, finger?.current ?? false).ui;
  },
  get schrift() {
    return faktoren(store.einstellungen.groesse, finger?.current ?? false).schrift;
  },
  get karte() {
    return KARTE[store.einstellungen.groesse] ?? 1;
  },
};

/** Nur für App ($effect): Faktoren als CSS-Variablen auf <html> setzen. */
export function wendeGroesseAn(): void {
  const s = document.documentElement.style;
  s.setProperty('--ui', String(groesse.ui));
  s.setProperty('--schrift', String(groesse.schrift));
  s.setProperty('--karte', String(groesse.karte));
}
