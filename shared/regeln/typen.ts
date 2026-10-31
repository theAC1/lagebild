// Schnittstelle der Regeln: Lesesicht auf den Zustand einer Lage + Ereignis → Änderungen und Deltas oder Ablehnung.
// Rein und deterministisch: keine I/O, keine Uhr, kein Zufall. Zeit und IDs kommen mit dem Ereignis.
import type { Alarm, BloodhoundAuftrag, Chat, ClientMsg, Ebene, Lage, Marker, Meldung, Notiz, Position, Raster, ServerMsg, Sichtung, Taufe, Teilnehmer, Zeichnung } from '../protocol.ts';

export type Eintraege = { marker: Marker; chat: Chat; sichtung: Sichtung; alarm: Alarm; meldung: Meldung; ebene: Ebene; zeichnung: Zeichnung; bloodhound: BloodhoundAuftrag; raster: Raster; taufe: Taufe; notiz: Notiz };
export type Art = keyof Eintraege;

/**
 * Lesesicht auf eine Lage. Der Server liest damit lazy aus SQLite (server/src/regeln.ts), ein Gerät später aus dem
 * Speicher (speicher.ts). Die Regeln schreiben nie hinein, sie geben Änderungen zurück.
 */
export type Zustand = {
  lage: Lage;
  eintrag<A extends Art>(art: A, id: string): Eintraege[A] | undefined;
  /** Aufsteigend nach Zeit. */
  eintraege<A extends Art>(art: A): Eintraege[A][];
  anzahl(art: Art): number;
  /** Summe der JSON-Längen (Zeichen) einer Art, für die Grössenbudgets. */
  groesse(art: Art): number;
  /** ID schon vergeben (der Server prüft über alle Lagen, weil die ID dort global eindeutig ist). */
  idVergeben(art: Art, id: string): boolean;
  /** Nach `reihenfolge`; enthält immer die Standard-Ebene. */
  ebenen(): Ebene[];
  /** Aktive Teilnehmende; mit `auchEntfernte` alle. */
  teilnehmerListe(auchEntfernte?: boolean): Teilnehmer[];
  teilnehmerAktiv(id: string): boolean;
  /** Foto liegt in dieser Lage. */
  fotoVorhanden(id: string): boolean;
  /** Ereigniszeit der letzten angenommenen Position des Teilnehmers (für die Positionsrate). */
  letztePosAm(id: string): number | undefined;
};

/** Was ein Teilnehmer auslöst. `hallo` und `lage.codeErneuern` sind Sache der Verbindung bzw. des Servers. */
export type Befehl = Exclude<ClientMsg, { typ: 'hallo' | 'lage.codeErneuern' }>;

export type Ereignis = {
  /** Stand des Autors vor dem Ereignis (Rolle, Status, Position). */
  autor: Teilnehmer;
  msg: Befehl;
  /** Zeit des Ereignisses (heute Serverzeit, später HLC). */
  jetzt: number;
  /** Liefert neue IDs (heute randomUUID, im Test ein Zähler). */
  neueId: () => string;
};

export type Aenderung =
  | { [A in Art]: { was: 'speichern'; art: A; obj: Eintraege[A]; t: number } }[Art]
  | { was: 'loeschen'; art: Art; id: string }
  | { was: 'lage'; lage: Lage }
  | { was: 'teilnehmer'; teilnehmer: Teilnehmer }
  | { was: 'entfernen'; id: string }
  | { was: 'spur'; id: string; pos: Position }
  | { was: 'posAm'; id: string; t: number };

/**
 * Angenommen: Änderungen (in dieser Reihenfolge anwenden) und Deltas (in dieser Reihenfolge verteilen); beide leer =
 * still ignoriert. Abgelehnt: Grund für die Fehlermeldung an den Autor.
 * Deltas sind ungefiltert: Chat und Bloodhound filtert der Verteiler (sichtbar.ts), `teilnehmer.online` setzt er.
 */
export type Ergebnis = { aenderungen: Aenderung[]; deltas: ServerMsg[] } | { abgelehnt: string };

export const nein = (abgelehnt: string): Ergebnis => ({ abgelehnt });
export const istAbgelehnt = (e: Ergebnis): e is { abgelehnt: string } => 'abgelehnt' in e;

/** Sammelt Änderungen und Deltas eines Ereignisses (lokal, die Eingaben bleiben unberührt). */
export function lauf(e: Ereignis) {
  const aenderungen: Aenderung[] = [];
  const deltas: ServerMsg[] = [];
  /** Änderung, optional mit Delta. */
  const tu = (a: Aenderung, d?: ServerMsg): void => {
    aenderungen.push(a);
    if (d) deltas.push(d);
  };
  return {
    tu,
    sende: (d: ServerMsg): void => void deltas.push(d),
    /** Eintrag ins Meldungslog (Nachbesprechung), vom Autor. */
    meldung(text: string, status: string | null = null, nur?: string[]): void {
      const m: Meldung = { id: e.neueId(), von: e.autor.id, status, text: text.slice(0, 200), t: e.jetzt, ...(nur && { nur }) };
      tu({ was: 'speichern', art: 'meldung', obj: m, t: m.t }, { typ: 'meldung', meldung: m });
    },
    fertig: (): Ergebnis => ({ aenderungen, deltas }),
  };
}
export type Lauf = ReturnType<typeof lauf>;
