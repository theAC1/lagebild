// Zustand einer Lage im Speicher: Lesesicht für die Regeln und Anwenden der Änderungen (immutabel).
// Heute für die Unit-Tests der Regeln; später der Zustand auf dem Gerät, den das Ereignislog faltet.
import type { Lage, Spuren, Teilnehmer } from '../protocol.ts';
import type { Aenderung, Art, Eintraege, Zustand } from './typen.ts';

export type Daten = {
  lage: Lage;
  /** Alle Teilnehmenden der Lage, auch entfernte (siehe `entfernt`). */
  teilnehmer: Teilnehmer[];
  entfernt: string[];
  /** Je Art in Einfüge-Reihenfolge; die Standard-Ebene gehört unter `ebene` dazu. */
  eintraege: { [A in Art]?: Eintraege[A][] };
  spuren: Spuren;
  fotos: string[];
};

export function speicher(d: Daten): Zustand {
  const liste = <A extends Art>(art: A): Eintraege[A][] => (d.eintraege[art] ?? []) as Eintraege[A][];
  return {
    lage: d.lage,
    eintrag: (art, id) => liste(art).find((x) => x.id === id),
    eintraege: (art) => [...liste(art)],
    anzahl: (art) => liste(art).length,
    groesse: (art) => liste(art).reduce((n, x) => n + JSON.stringify(x).length, 0),
    idVergeben: (art, id) => liste(art).some((x) => x.id === id),
    ebenen: () => [...liste('ebene')].sort((a, b) => a.reihenfolge - b.reihenfolge || a.erstelltAm - b.erstelltAm),
    teilnehmerListe: (auchEntfernte = false) => d.teilnehmer.filter((t) => auchEntfernte || !d.entfernt.includes(t.id)),
    teilnehmerAktiv: (id) => d.teilnehmer.some((t) => t.id === id) && !d.entfernt.includes(id),
    fotoVorhanden: (id) => d.fotos.includes(id),
  };
}

const ersetze = <T extends { id: string }>(xs: T[], x: T): T[] => (xs.some((a) => a.id === x.id) ? xs.map((a) => (a.id === x.id ? x : a)) : [...xs, x]);

function eine(d: Daten, a: Aenderung): Daten {
  switch (a.was) {
    case 'speichern':
      return { ...d, eintraege: { ...d.eintraege, [a.art]: ersetze<{ id: string }>(d.eintraege[a.art] ?? [], a.obj) } };
    case 'loeschen':
      return { ...d, eintraege: { ...d.eintraege, [a.art]: (d.eintraege[a.art] ?? []).filter((x: { id: string }) => x.id !== a.id) } };
    case 'lage':
      return { ...d, lage: a.lage };
    case 'teilnehmer':
      return { ...d, teilnehmer: ersetze(d.teilnehmer, a.teilnehmer) };
    case 'entfernen':
      return { ...d, entfernt: d.entfernt.includes(a.id) ? d.entfernt : [...d.entfernt, a.id] };
    case 'spur':
      return { ...d, spuren: { ...d.spuren, [a.id]: [...(d.spuren[a.id] ?? []), a.pos] } };
  }
}

/** Neue Daten mit den Änderungen in ihrer Reihenfolge; `d` bleibt unverändert. */
export const anwenden = (d: Daten, aenderungen: Aenderung[]): Daten => aenderungen.reduce(eine, d);

