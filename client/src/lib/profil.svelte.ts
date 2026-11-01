// Profil des Geräts (Spec v7, Menü › Profil): Einheit und Symbol gelten für alle Missionen; Rufname und Funktion sind die
// zuletzt benutzten (Vorgabe für Beitreten und Neue Mission), je Mission ändern sie sich unter «Meine Angaben».
import { STANDARD_SIDC } from './symbol.ts';
import { lies, schreibe } from './ui.svelte.ts';

const KEY = 'lagebild.profil';
export type Profil = { rufname: string; einheit: string; funktion: string; sidc: string };

function lade(): Profil {
  const leer = { rufname: '', einheit: '', funktion: '', sidc: STANDARD_SIDC };
  try {
    return { ...leer, ...JSON.parse(lies(KEY) ?? '{}') };
  } catch {
    return leer;
  }
}

export const profil = $state<Profil>(lade());

export function setzeProfil(teil: Partial<Profil>): void {
  Object.assign(profil, teil);
  schreibe(KEY, JSON.stringify(profil));
}
