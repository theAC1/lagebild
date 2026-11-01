// Import und Export von Ebenen (Spec v8): Datei lesen und prüfen, Ebenen anlegen und füllen, Dateien bauen.
import { MAX_EBENEN_JE_LAGE, MAX_ZEICHNUNGEN_JE_LAGE, MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE } from '../../../../../shared/regeln/index.ts';
import type { ServerMsg, Zeichnung } from '../../../../../shared/protocol.ts';
import { sendeBestaetigt, store } from '../../../lib/store.svelte.ts';
import { slug } from '../../leitung/logik.ts';
import { neueId } from '../aktionen.ts';
import { artLabel } from '../logik.ts';
import { stueckeNachGroesse } from '../verlauf.ts';
import { leseKml, schreibeKml } from './kml.ts';
import { leseMilx, schreibeMilx, type DateiEbene, type ExportEbene } from './milx.ts';
import { entpackeEine, packe } from './zip.ts';

/** Grösste Datei (auch entpackt); mehr fasst das Zeichnungsbudget einer Lage (10 MB) ohnehin kaum. */
export const MAX_DATEI = 10 * 1024 * 1024;
export const ENDUNGEN = '.milxlyz,.milxly,.kml,.kmz';

/** Datei → Ebenen. Wirft mit lesbarer Meldung (Format, Grösse, kaputte Datei). */
export async function lies(datei: File): Promise<DateiEbene[]> {
  if (datei.size > MAX_DATEI) throw new Error('Datei zu gross (höchstens 10 MB)');
  const roh = new Uint8Array(await datei.arrayBuffer());
  const text = (b: Uint8Array) => new TextDecoder().decode(b); // entfernt auch das BOM
  switch (/\.([a-z]+)$/i.exec(datei.name)?.[1].toLowerCase()) {
    case 'milxlyz':
      return leseMilx(text(await entpackeEine(roh, '.milxly', MAX_DATEI)));
    case 'milxly':
      return leseMilx(text(roh));
    case 'kml':
      return [leseKml(text(roh), datei.name)];
    case 'kmz':
      return [leseKml(text(await entpackeEine(roh, '.kml', MAX_DATEI)), datei.name)];
    default:
      throw new Error('Unbekanntes Format – erwartet .milxlyz, .milxly oder .kml');
  }
}

/** «3 × Phasenlinie» je Art bzw. Grund, in der Reihenfolge des ersten Auftretens. */
export function zaehle(texte: string[]): string[] {
  const n = new Map<string, number>();
  for (const t of texte) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].map(([t, k]) => `${k} × ${t}`);
}
export const arten = (e: DateiEbene): string[] => zaehle(e.zeichnungen.map(artLabel));

/** Freier Ebenen-Name: bei Gleichheit «Name (2)», «Name (3)» … */
function freierName(name: string, vergeben: Set<string>): string {
  let n = name;
  for (let i = 2; vergeben.has(n); i++) n = `${name.slice(0, 54)} (${i})`;
  vergeben.add(n);
  return n;
}

/** Ebenen mit Zeichnungen und freien Namen; Grund, falls die Lage sie nicht fasst (der Server prüft dasselbe je Nachricht). */
export function plane(ebenen: DateiEbene[]): { ebenen: DateiEbene[]; fehler: string | null } {
  const vergeben = new Set([...store.ebenen.values()].map((e) => e.name));
  const volle = ebenen.filter((e) => e.zeichnungen.length).map((e) => ({ ...e, name: freierName(e.name, vergeben) }));
  const neu = volle.flatMap((e) => e.zeichnungen);
  const bestand = [...store.zeichnungen.values()];
  const zeichen = [...bestand, ...neu].reduce((n, z) => n + JSON.stringify(z).length + 200, 0); // + Server-Felder
  const fehler = !neu.length
    ? 'Nichts abbildbar in dieser Datei.'
    : store.ebenen.size + volle.length > MAX_EBENEN_JE_LAGE
      ? `Zu viele Ebenen (höchstens ${MAX_EBENEN_JE_LAGE} je Mission).`
      : bestand.length + neu.length > MAX_ZEICHNUNGEN_JE_LAGE
        ? `Zu viele Zeichnungen (höchstens ${MAX_ZEICHNUNGEN_JE_LAGE} je Mission).`
        : zeichen > MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE
          ? 'Zu viele Zeichnungsdaten für diese Mission.'
          : null;
  return { ebenen: volle, fehler };
}

/**
 * Je Ebene `ebene.neu {import}` (ID vom Gerät), dann die Zeichnungen in Stücken. Ablehnungen zeigt der Kern als Toast.
 * ponytail: nicht als Ganzes rückgängig; bricht ein späteres Stück ab, bleibt das Bisherige (Ebene löschen räumt auf).
 */
export async function importiere(ebenen: DateiEbene[]): Promise<{ ids: string[]; ok: boolean }> {
  const ids: string[] = [];
  const echo = (id: string) => (m: ServerMsg) => (m.typ === 'ebene' && m.ebene.id === id) || (m.typ === 'zeichnungen' && m.zeichnungen.some((z) => z.id === id));
  for (const e of ebenen) {
    const id = neueId();
    if ((await sendeBestaetigt({ typ: 'ebene.neu', id, name: e.name, import: true }, echo(id))) !== 'bestaetigt') return { ids, ok: false };
    ids.push(id);
    for (const s of stueckeNachGroesse(e.zeichnungen.map((z) => ({ ...z, id: neueId(), ebeneId: id })))) {
      if ((await sendeBestaetigt({ typ: 'zeichnung.neu', zeichnungen: s }, echo(s[0].id))) !== 'bestaetigt') return { ids, ok: false };
    }
  }
  return { ids, ok: true };
}

const dateiName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Ebene';

/** MilX: alle Ebenen in einer .milxlyz. KML: je Ebene eine Datei, mehrere zusammen als ZIP. */
export async function exportiere(ebenen: ExportEbene[], format: 'milx' | 'kml'): Promise<{ blob: Blob; name: string }> {
  const bytes = (s: string) => new TextEncoder().encode(s);
  const lage = slug(store.lage?.name ?? 'mission');
  if (format === 'milx') {
    const zip = await packe([{ name: 'Layer.milxly', daten: bytes(schreibeMilx(ebenen)) }]);
    return { blob: new Blob([zip as BlobPart], { type: 'application/zip' }), name: `${lage}.milxlyz` };
  }
  if (ebenen.length === 1) return { blob: new Blob([schreibeKml(ebenen[0])], { type: 'application/vnd.google-earth.kml+xml' }), name: `${dateiName(ebenen[0].name)}.kml` };
  const namen = new Set<string>();
  const dateien = ebenen.map((e) => ({ name: `${freierName(dateiName(e.name), namen)}.kml`, daten: bytes(schreibeKml(e)) }));
  return { blob: new Blob([(await packe(dateien)) as BlobPart], { type: 'application/zip' }), name: `${lage}-kml.zip` };
}

/** Ebenen mit ihren Zeichnungen aus dem Store. */
export const exportEbenen = (ids: string[]): ExportEbene[] =>
  ids.flatMap((id) => {
    const e = store.ebenen.get(id);
    return e ? [{ name: e.name, zeichnungen: [...store.zeichnungen.values()].filter((z: Zeichnung) => z.ebeneId === id) }] : [];
  });
