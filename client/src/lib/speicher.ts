// localStorage aufräumen: je Lage angelegte Schlüssel anderer (alter) Lagen bleiben sonst für immer liegen.
// Die Codes (`lagebild.codes.*`) bleiben: die Leitung findet sie dort wieder.
const JE_LAGE = ['lagebild.chat.gelesen.', 'lagebild.bloodhound.', 'lagebild.rb.', 'lagebild.zeichnen.ausgeblendet.'];

/** Schlüssel, die zu einer anderen Lage als `lageId` gehören. */
export const veralteteKeys = (keys: string[], lageId: string): string[] =>
  keys.filter((k) => JE_LAGE.some((p) => k.startsWith(p) && k !== p + lageId));

let erledigt = false;
/** Einmal je App-Start, sobald die Lage bekannt ist. */
export function raeumeAuf(lageId: string): void {
  if (erledigt) return;
  erledigt = true;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
    for (const k of veralteteKeys(keys, lageId)) localStorage.removeItem(k);
  } catch {
    /* Speicher gesperrt: nichts aufzuräumen */
  }
}
