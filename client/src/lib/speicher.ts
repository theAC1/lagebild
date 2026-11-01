// localStorage aufräumen: je Lage angelegte Schlüssel verlassener Lagen bleiben sonst für immer liegen.
// Die Codes (`lagebild.codes.*`) bleiben: die Leitung findet sie dort wieder.
const JE_LAGE = ['lagebild.chat.gelesen.', 'lagebild.bloodhound.', 'lagebild.rb.', 'lagebild.zeichnen.ausgeblendet.'];

/** Schlüssel, die zu keiner der `lageIds` (Meine Missionen) gehören. */
export const veralteteKeys = (keys: string[], lageIds: string[]): string[] =>
  keys.filter((k) => JE_LAGE.some((p) => k.startsWith(p) && !lageIds.some((id) => k === p + id)));

let erledigt = false;
/** Einmal je App-Start, sobald die offene Lage in Meine Missionen steht. */
export function raeumeAuf(lageIds: string[]): void {
  if (erledigt) return;
  erledigt = true;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
    for (const k of veralteteKeys(keys, lageIds)) localStorage.removeItem(k);
  } catch {
    /* Speicher gesperrt: nichts aufzuräumen */
  }
}
