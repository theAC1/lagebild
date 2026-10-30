// Zeichnungen, Ebenen und Bloodhound-Aufträge: Rechte, Limits, Persistenz, Verteilung.
import { randomUUID } from 'node:crypto';
import { standardEbeneId, type BloodhoundAuftrag, type BloodhoundEnde, type ClientMsg, type Ebene, type Lage, type ServerMsg, type Teilnehmer, type Zeichnung } from '../../shared/protocol.ts';
import type { Db } from './db.ts';

export const MAX_ZEICHNUNGEN_JE_LAGE = 5000;
export const MAX_EBENEN_JE_LAGE = 50;
export const MAX_AUFTRAEGE_JE_LAGE = 1000;
/** Budget für alle Zeichnungen einer Lage (JSON-Zeichen): sie gehen mit jedem Snapshot an jedes Gerät. */
export const MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE = 10 * 1024 * 1024;
const zeichen = (zs: object[]): number => zs.reduce((n, z) => n + JSON.stringify(z).length, 0);

/** Was ws.ts bereitstellt; hält dieses Modul frei von Verbindungsdetails. */
export type Umfeld = {
  db: Db;
  anAlle: (lageId: string, m: ServerMsg) => void;
  /** Nur an Leitung und den Empfänger des Auftrags. */
  anLeitungUnd: (lageId: string, id: string, m: ServerMsg) => void;
  fehler: (text: string) => void;
  meldung: (lageId: string, von: string, text: string) => void;
};

const ZEICHNUNG_NAME: Record<string, string> = {
  linie: 'Linie', pfeil: 'Pfeil', flaeche: 'Fläche', rechteck: 'Rechteck', kreis: 'Kreis', freihand: 'Freihand', text: 'Text',
  phasenlinie: 'Phasenlinie', grenze: 'Grenze', stossrichtung: 'Stossrichtung', sperre: 'Sperre', raum: 'Raum',
};

export const offen = (a: BloodhoundAuftrag): boolean => a.ende === null;

/** Offene Aufträge, die `t` sehen darf: Leitung alle, sonst die an sie selbst. */
export function sichtbareAuftraege(db: Db, lageId: string, t: Pick<Teilnehmer, 'id' | 'rolle'>): BloodhoundAuftrag[] {
  return db.eintraege(lageId, 'bloodhound').filter((a) => offen(a) && (t.rolle === 'leitung' || a.an === t.id));
}

/**
 * Beendet offene Aufträge, auf die `trifft` passt, als 'aufgehoben' (Empfänger entfernt, Ziel gelöscht),
 * verteilt sie und schreibt ein Meldungslog. Gibt die Anzahl zurück.
 */
export function beendeAuftraege(u: Umfeld, lageId: string, von: string, trifft: (a: BloodhoundAuftrag) => boolean, grund: string): number {
  const jetzt = Date.now();
  const treffer = u.db.eintraege(lageId, 'bloodhound').filter((a) => offen(a) && trifft(a));
  for (const a of treffer) {
    const neu: BloodhoundAuftrag = { ...a, ende: 'aufgehoben', endeAm: jetzt };
    u.db.speichern(lageId, 'bloodhound', neu, neu.erstelltAm);
    u.anLeitungUnd(lageId, neu.an, { typ: 'bloodhound', auftrag: neu });
    u.meldung(lageId, von, `Bloodhound-Auftrag aufgehoben (${grund})`);
  }
  return treffer.length;
}

/** true, wenn die Nachricht hierher gehört (auch bei Fehlern, die dann per `fehler` gemeldet sind). */
export function verarbeiteZeichnen(u: Umfeld, t: Teilnehmer, lage: Lage, m: ClientMsg): boolean {
  const { db, anAlle } = u;
  const leitung = t.rolle === 'leitung';
  const jetzt = Date.now();
  const nein = (text: string): true => (u.fehler(text), true);
  const name = (id: string): string => db.teilnehmerListe(lage.id, true).find((x) => x.id === id)?.rufname ?? '?';

  /** Darf `t` in dieser Ebene schreiben (neu, ändern, löschen)? Fehlertext oder undefined. */
  const ebenenFehler = (ebeneId: string): string | undefined => {
    const e = db.eintrag(lage.id, 'ebene', ebeneId);
    if (!e) return 'Ebene nicht gefunden';
    if (e.gesperrt && !leitung) return `Ebene «${e.name}» ist gesperrt`;
    return undefined;
  };
  const speichereAuftrag = (a: BloodhoundAuftrag): void => {
    db.speichern(lage.id, 'bloodhound', a, a.erstelltAm);
    u.anLeitungUnd(lage.id, a.an, { typ: 'bloodhound', auftrag: a });
  };

  switch (m.typ) {
    case 'zeichnung.neu': {
      const ids = new Set<string>();
      for (const z of m.zeichnungen) {
        const fe = ebenenFehler(z.ebeneId);
        if (fe) return nein(fe);
        if (z.id && (ids.has(z.id) || db.idVergeben('zeichnung', z.id))) return nein('Zeichnungs-ID bereits vergeben');
        if (z.id) ids.add(z.id);
      }
      if (db.anzahl(lage.id, 'zeichnung') + m.zeichnungen.length > MAX_ZEICHNUNGEN_JE_LAGE) return nein('Zu viele Zeichnungen in dieser Lage');
      const neu: Zeichnung[] = m.zeichnungen.map((z) => ({ ...z, id: z.id ?? randomUUID(), von: leitung && z.von ? z.von : t.id, erstelltAm: jetzt, geaendertAm: jetzt }));
      if (db.groesse(lage.id, 'zeichnung') + zeichen(neu) > MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE) return nein('Zu viele Zeichnungsdaten in dieser Lage');
      for (const z of neu) db.speichern(lage.id, 'zeichnung', z, z.erstelltAm);
      anAlle(lage.id, { typ: 'zeichnungen', zeichnungen: neu });
      u.meldung(lage.id, t.id, neu.length === 1 ? `Zeichnung: ${ZEICHNUNG_NAME[neu[0].art]}${neu[0].bezeichnung ? ` «${neu[0].bezeichnung}»` : ''}` : `${neu.length} Zeichnungen eingefügt`);
      return true;
    }
    case 'zeichnung.aendern': {
      const alte: Zeichnung[] = [];
      for (const z of m.zeichnungen) {
        const alt = db.eintrag(lage.id, 'zeichnung', z.id);
        if (!alt) return nein('Zeichnung nicht gefunden');
        if (alte.some((a) => a.id === z.id)) return nein('Zeichnung doppelt');
        if (alt.von !== t.id && !leitung) return nein('Keine Berechtigung für diese Zeichnung');
        // Quell- und Zielebene prüfen: nichts aus einer gesperrten Ebene herausnehmen, nichts hineinlegen
        const fe = ebenenFehler(alt.ebeneId) ?? ebenenFehler(z.ebeneId);
        if (fe) return nein(fe);
        alte.push(alt);
      }
      const neu: Zeichnung[] = m.zeichnungen.map((z, i) => ({ ...z, von: alte[i].von, erstelltAm: alte[i].erstelltAm, geaendertAm: jetzt }));
      const zuwachs = zeichen(neu) - zeichen(alte);
      if (zuwachs > 0 && db.groesse(lage.id, 'zeichnung') + zuwachs > MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE) return nein('Zu viele Zeichnungsdaten in dieser Lage');
      for (const z of neu) db.speichern(lage.id, 'zeichnung', z, z.erstelltAm);
      anAlle(lage.id, { typ: 'zeichnungen', zeichnungen: neu });
      return true; // kein Log-Eintrag: Verschieben/Stützpunkte ziehen würden das Meldungslog fluten
    }
    case 'zeichnung.loeschen': {
      const ids = [...new Set(m.ids)];
      for (const id of ids) {
        const alt = db.eintrag(lage.id, 'zeichnung', id);
        if (!alt) return nein('Zeichnung nicht gefunden');
        if (alt.von !== t.id && !leitung) return nein('Keine Berechtigung für diese Zeichnung');
        const fe = ebenenFehler(alt.ebeneId);
        if (fe) return nein(fe);
      }
      for (const id of ids) db.loeschen(lage.id, 'zeichnung', id);
      anAlle(lage.id, { typ: 'zeichnungen.geloescht', ids });
      u.meldung(lage.id, t.id, ids.length === 1 ? 'Zeichnung gelöscht' : `${ids.length} Zeichnungen gelöscht`);
      return true;
    }
    case 'ebene.neu': {
      if (!leitung) return nein('Nur für die Leitung');
      const ebenen = db.ebenenSicherstellen(lage.id);
      if (ebenen.length >= MAX_EBENEN_JE_LAGE) return nein('Zu viele Ebenen in dieser Lage');
      if (ebenen.some((e) => e.name === m.name)) return nein('Ebenen-Name bereits vergeben');
      const reihenfolge = Math.min(1000, Math.max(...ebenen.map((e) => e.reihenfolge)) + 1);
      const ebene: Ebene = { id: randomUUID(), name: m.name, gesperrt: m.gesperrt ?? false, reihenfolge, erstelltVon: t.id, erstelltAm: jetzt };
      db.speichern(lage.id, 'ebene', ebene, jetzt);
      anAlle(lage.id, { typ: 'ebene', ebene });
      u.meldung(lage.id, t.id, `Ebene angelegt: ${ebene.name}`);
      return true;
    }
    case 'ebene.aendern': {
      if (!leitung) return nein('Nur für die Leitung');
      const alt = db.eintrag(lage.id, 'ebene', m.id);
      if (!alt) return nein('Ebene nicht gefunden');
      if (m.name !== undefined && m.name !== alt.name && db.ebenenSicherstellen(lage.id).some((e) => e.name === m.name)) return nein('Ebenen-Name bereits vergeben');
      const ebene: Ebene = { ...alt, name: m.name ?? alt.name, gesperrt: m.gesperrt ?? alt.gesperrt, reihenfolge: m.reihenfolge ?? alt.reihenfolge };
      db.speichern(lage.id, 'ebene', ebene, alt.erstelltAm);
      anAlle(lage.id, { typ: 'ebene', ebene });
      if (ebene.gesperrt !== alt.gesperrt) u.meldung(lage.id, t.id, `Ebene ${ebene.gesperrt ? 'gesperrt' : 'entsperrt'}: ${ebene.name}`);
      return true;
    }
    case 'ebene.loeschen': {
      if (!leitung) return nein('Nur für die Leitung');
      const alt = db.eintrag(lage.id, 'ebene', m.id);
      if (!alt) return nein('Ebene nicht gefunden');
      if (m.id === standardEbeneId(lage.id)) return nein('Die Standard-Ebene kann nicht gelöscht werden');
      const zeichnungIds = db.eintraege(lage.id, 'zeichnung').filter((z) => z.ebeneId === m.id).map((z) => z.id);
      for (const id of zeichnungIds) db.loeschen(lage.id, 'zeichnung', id);
      db.loeschen(lage.id, 'ebene', m.id);
      anAlle(lage.id, { typ: 'ebene.geloescht', id: m.id, zeichnungIds });
      u.meldung(lage.id, t.id, `Ebene gelöscht: ${alt.name}${zeichnungIds.length ? ` (${zeichnungIds.length} Zeichnungen)` : ''}`);
      return true;
    }
    case 'bloodhound.auftrag': {
      if (!leitung) return nein('Nur für die Leitung');
      if (!db.teilnehmerAktiv(lage.id, m.an)) return nein('Empfänger nicht gefunden');
      const z = m.ziel;
      const vorhanden = z.art === 'punkt' ? true : z.art === 'teilnehmer' ? db.teilnehmerAktiv(lage.id, z.id!) : !!db.eintrag(lage.id, z.art, z.id!);
      if (!vorhanden) return nein('Ziel nicht gefunden');
      if (z.art === 'teilnehmer' && z.id === m.an) return nein('Ziel ist der Empfänger selbst');
      if (db.anzahl(lage.id, 'bloodhound') >= MAX_AUFTRAEGE_JE_LAGE) return nein('Zu viele Bloodhound-Aufträge in dieser Lage');
      // ein offener Auftrag je Empfänger: der neue ersetzt den alten
      for (const alt of db.eintraege(lage.id, 'bloodhound').filter((a) => offen(a) && a.an === m.an)) speichereAuftrag({ ...alt, ende: 'aufgehoben', endeAm: jetzt });
      speichereAuftrag({ id: randomUUID(), von: t.id, an: m.an, ziel: z, erstelltAm: jetzt, quittiertAm: null, ende: null, endeAm: null });
      u.meldung(lage.id, t.id, `Bloodhound-Auftrag an ${name(m.an)}`);
      return true;
    }
    case 'bloodhound.aufheben':
    case 'bloodhound.quittieren':
    case 'bloodhound.beendet':
    case 'bloodhound.erreicht': {
      const a = db.eintrag(lage.id, 'bloodhound', m.id);
      if (!a || !offen(a)) return nein('Auftrag nicht aktiv');
      if (m.typ === 'bloodhound.aufheben') {
        if (!leitung) return nein('Nur für die Leitung');
      } else if (a.an !== t.id) return nein('Nur der Empfänger kann den Auftrag bearbeiten');
      if (m.typ === 'bloodhound.quittieren') {
        if (a.quittiertAm === null) speichereAuftrag({ ...a, quittiertAm: jetzt });
        return true;
      }
      const ende: BloodhoundEnde = m.typ === 'bloodhound.aufheben' ? 'aufgehoben' : m.typ === 'bloodhound.beendet' ? 'beendet' : 'erreicht';
      speichereAuftrag({ ...a, ende, endeAm: jetzt });
      u.meldung(lage.id, t.id, { aufgehoben: `Bloodhound-Auftrag an ${name(a.an)} aufgehoben`, beendet: 'Bloodhound beendet', erreicht: 'Bloodhound-Ziel erreicht' }[ende]);
      return true;
    }
    default:
      return false;
  }
}
