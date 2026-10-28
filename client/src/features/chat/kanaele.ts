// Chat-Kanäle (rein, testbar): Ableitung aus Teilnehmenden und Verlauf, Ungelesen-Zählung, Zeitformat.
import { ChatZiel, type Chat, type Teilnehmer } from '../../../../shared/protocol.ts';

export interface Kanal {
  key: string;
  ziel: ChatZiel;
  label: string;
  /** Zusatzzeile in der Liste, z.B. Einheit einer Person */
  info: string;
  /** nur bei Personen: Symbol */
  sidc?: string;
}

/** Gelesen bis (Serverzeit) je Kanal; '*' gilt für Kanäle ohne eigenen Eintrag. */
export type Gelesen = Record<string, number>;

export const kanalKey = (z: ChatZiel): string =>
  z.art === 'alle' ? 'alle' : z.art === 'einheit' ? `einheit:${z.einheit}` : `person:${z.id}`;

/** Kanal einer Nachricht aus meiner Sicht: Direktnachrichten landen beim Gegenüber. */
export const kanalVon = (c: Chat, ich: string): string =>
  c.an.art === 'person' ? `person:${c.von === ich ? c.an.id : c.von}` : kanalKey(c.an);

const vergleiche = (a: string, b: string) => a.localeCompare(b, 'de');

/** «Alle», dann Einheiten (eigene zuerst), dann Personen (ohne mich) – inkl. Kanäle, die nur noch im Verlauf vorkommen. */
export function kanaele(teilnehmer: Teilnehmer[], chat: Chat[], ich: string): Kanal[] {
  const meineEinheit = teilnehmer.find((t) => t.id === ich)?.einheit;
  const einheiten = new Set(teilnehmer.map((t) => t.einheit));
  const personen = new Map(teilnehmer.filter((t) => t.id !== ich).map((t) => [t.id, t]));
  const weg = new Set<string>();
  for (const c of chat) {
    if (c.an.art === 'einheit') einheiten.add(c.an.einheit);
    if (c.an.art === 'person') {
      const anderer = c.von === ich ? c.an.id : c.von;
      if (anderer !== ich && !personen.has(anderer)) weg.add(anderer);
    }
  }

  const einheitKanaele: Kanal[] = [...einheiten]
    .sort((a, b) => Number(b === meineEinheit) - Number(a === meineEinheit) || vergleiche(a, b))
    .map((einheit) => ({
      key: kanalKey({ art: 'einheit', einheit }),
      ziel: { art: 'einheit', einheit },
      label: einheit,
      info: einheit === meineEinheit ? 'eigene Einheit' : 'Einheit',
    }));
  const personKanaele: Kanal[] = [...personen.values()]
    .sort((a, b) => vergleiche(a.rufname, b.rufname))
    .map((t) => ({
      key: kanalKey({ art: 'person', id: t.id }),
      ziel: { art: 'person', id: t.id },
      label: t.rufname,
      info: [t.einheit, t.funktion].filter(Boolean).join(' · '),
      sidc: t.sidc,
    }));
  const wegKanaele: Kanal[] = [...weg].map((id) => ({
    key: kanalKey({ art: 'person', id }),
    ziel: { art: 'person', id },
    label: 'Unbekannt',
    info: 'nicht mehr in der Lage',
  }));

  return [{ key: 'alle', ziel: { art: 'alle' }, label: 'Alle', info: 'ganze Lage' }, ...einheitKanaele, ...personKanaele, ...wegKanaele];
}

export interface KanalStand {
  ungelesen: number;
  letzte: Chat | null;
}

/** Je Kanal: ungelesene fremde Nachrichten und letzte Nachricht. */
export function uebersicht(chat: Chat[], ich: string, gelesen: Gelesen): Map<string, KanalStand> {
  const stand = new Map<string, KanalStand>();
  for (const c of chat) {
    const key = kanalVon(c, ich);
    const s = stand.get(key) ?? { ungelesen: 0, letzte: null };
    const neu = c.von !== ich && c.t > (gelesen[key] ?? gelesen['*'] ?? 0);
    stand.set(key, { ungelesen: s.ungelesen + (neu ? 1 : 0), letzte: c });
  }
  return stand;
}

/** Gespeicherten Lesestand prüfen (localStorage ist fremde Eingabe). */
export function parseGelesen(text: string | null): Gelesen | null {
  if (!text) return null;
  try {
    const o: unknown = JSON.parse(text);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));
  } catch {
    return null;
  }
}

/** Erster Lesestand einer Lage: alles bis zum Beitritt gilt als gelesen. */
export const startGelesen = (chat: Chat[]): Gelesen => ({ '*': chat.reduce((m, c) => Math.max(m, c.t), 0) });

/** Ziel aus `oeffne('chat', { an })` prüfen. */
export const zielAus = (an: unknown): ChatZiel | null => {
  const r = ChatZiel.safeParse(an);
  return r.success ? r.data : null;
};

/** «14:05» heute, sonst «27.10. 14:05». */
export function formatZeit(t: number, jetzt: number): string {
  const d = new Date(t);
  const zeit = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date(jetzt).toDateString() ? zeit : `${d.getDate()}.${d.getMonth() + 1}. ${zeit}`;
}
