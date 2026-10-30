// Testhelfer: eine Lage im Speicher, auf die Befehle nacheinander angewendet werden (wie später die Faltung des Logs).
import { STANDARD_EBENE_NAME, STANDARD_STATUS, standardEbeneId, type Lage, type Teilnehmer } from '../protocol.ts';
import { anwenden, istAbgelehnt, speicher, wende, type Befehl, type Daten, type Ergebnis } from './index.ts';

export const LAGE: Lage = { id: 'L', name: 'Übung', statusSet: STANDARD_STATUS, erstelltAm: 0, beendetAm: null };

export const tn = (id: string, rolle: Teilnehmer['rolle'] = 'teilnehmer', extra: Partial<Teilnehmer> = {}): Teilnehmer => ({
  id, rufname: id.toUpperCase(), einheit: 'Zug 1', funktion: '', sidc: '10031000001211000000', rolle, status: 'bereit', statusText: '',
  pos: null, sendetPos: true, online: false, zuletzt: 0, ...extra,
});

/** Leere Lage mit Standard-Ebene. */
export function leereLage(lage: Lage, teilnehmer: Teilnehmer[] = []): Daten {
  const ebene = { id: standardEbeneId(lage.id), name: STANDARD_EBENE_NAME, gesperrt: false, reihenfolge: 0, erstelltVon: 'system', erstelltAm: lage.erstelltAm };
  return { lage, teilnehmer, entfernt: [], eintraege: { ebene: [ebene] }, spuren: {}, fotos: [], posAm: {} };
}

/** Leitung `ltg`, Teilnehmende `a` und `b`. `tu` wendet an und übernimmt angenommene Änderungen. */
export function welt(daten: Daten = leereLage(LAGE, [tn('ltg', 'leitung'), tn('a'), tn('b', 'teilnehmer', { einheit: 'Zug 2' })])) {
  let d = daten;
  let n = 0;
  let uhr = 1000;
  return {
    get daten(): Daten {
      return d;
    },
    tu(von: string, msg: Befehl): Ergebnis {
      const autor = d.teilnehmer.find((t) => t.id === von)!;
      const r = wende(speicher(d), { autor, msg, jetzt: (uhr += 1000), neueId: () => `id${++n}` });
      if (!istAbgelehnt(r)) d = anwenden(d, r.aenderungen);
      return r;
    },
  };
}

/** Ablehnungsgrund oder undefined (angenommen). */
export const grund = (r: Ergebnis): string | undefined => (istAbgelehnt(r) ? r.abgelehnt : undefined);
/** Typen der Deltas einer angenommenen Antwort. */
export const deltas = (r: Ergebnis): string[] => (istAbgelehnt(r) ? [] : r.deltas.map((x) => x.typ));
