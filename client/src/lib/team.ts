// Team-Farbe je Einheit: deterministisch auf die 14 ATAK-Teamfarben (Icon2525cIconAdapter.teamToColor).
export const TEAM_FARBEN: { name: string; farbe: string }[] = [
  { name: 'White', farbe: '#FFFFFF' },
  { name: 'Yellow', farbe: '#FFFF00' },
  { name: 'Orange', farbe: '#FF7700' },
  { name: 'Magenta', farbe: '#FF00FF' },
  { name: 'Red', farbe: '#FF0000' },
  { name: 'Maroon', farbe: '#7F0000' },
  { name: 'Purple', farbe: '#7F007F' },
  { name: 'Dark Blue', farbe: '#00007F' },
  { name: 'Blue', farbe: '#0000FF' },
  { name: 'Cyan', farbe: '#00FFFF' },
  { name: 'Teal', farbe: '#007F7F' },
  { name: 'Green', farbe: '#00FF00' },
  { name: 'Dark Green', farbe: '#007F00' },
  { name: 'Brown', farbe: '#A0714F' },
];

/** Index in TEAM_FARBEN (FNV-1a über den normalisierten Einheitsnamen); «Zug 2» = « zug 2 ». */
export function teamIndex(einheit: string): number {
  let h = 0x811c9dc5;
  for (const c of einheit.trim().toLowerCase()) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193);
  return (h >>> 0) % TEAM_FARBEN.length;
}

/** Hex-Farbe der Einheit, z.B. «#00FFFF». Später auch `__group name` einer TAK-Bridge. */
export const teamFarbe = (einheit: string): string => TEAM_FARBEN[teamIndex(einheit)].farbe;
