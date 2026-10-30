// Brücke zwischen den Regeln (shared/regeln) und SQLite: Lesesicht auf eine Lage und Änderungen speichern.
// `letztePos` (Zeit der letzten angenommenen Position je Teilnehmer) ist flüchtig: nur im Speicher, wie bisher.
import type { Lage } from '../../shared/protocol.ts';
import type { Aenderung, Zustand } from '../../shared/regeln/index.ts';
import type { Db } from './db.ts';

/** Liest lazy aus der DB: nur was eine Regel braucht (Budgets per COUNT/SUM statt alles zu laden). */
export function sichtAusDb(db: Db, lage: Lage, letztePos: ReadonlyMap<string, number> = new Map()): Zustand {
  return {
    lage,
    eintrag: (art, id) => db.eintrag(lage.id, art, id),
    eintraege: (art) => db.eintraege(lage.id, art),
    anzahl: (art) => db.anzahl(lage.id, art),
    groesse: (art) => db.groesse(lage.id, art),
    idVergeben: (art, id) => db.idVergeben(art, id),
    ebenen: () => db.ebenenSicherstellen(lage.id),
    teilnehmerListe: (auchEntfernte) => db.teilnehmerListe(lage.id, auchEntfernte),
    teilnehmerAktiv: (id) => db.teilnehmerAktiv(lage.id, id),
    fotoVorhanden: (id) => db.foto(id)?.lageId === lage.id,
    letztePosAm: (id) => letztePos.get(id),
  };
}

export function speichere(db: Db, lageId: string, aenderungen: Aenderung[], letztePos: Map<string, number> = new Map()): void {
  for (const a of aenderungen)
    switch (a.was) {
      case 'speichern':
        db.speichern(lageId, a.art, a.obj, a.t);
        break;
      case 'loeschen':
        db.loeschen(lageId, a.art, a.id);
        break;
      case 'lage':
        db.lageSpeichern(a.lage);
        break;
      case 'teilnehmer':
        db.teilnehmerSpeichern(a.teilnehmer);
        break;
      case 'entfernen':
        db.teilnehmerEntfernen(lageId, a.id);
        break;
      case 'spur':
        db.spurAnhaengen(lageId, a.id, a.pos);
        break;
      case 'posAm':
        letztePos.set(a.id, a.t);
        break;
    }
}
