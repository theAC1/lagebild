// Geländetaufe: Taufen und Namenslisten pro Lage. Rechte: alle; Namenslisten nur Leitung. Namen je Lage eindeutig.
import { randomUUID } from 'node:crypto';
import { taufSchluessel, type ClientMsg, type Lage, type Taufe, type TaufFamilie, type Teilnehmer } from '../../shared/protocol.ts';
import type { Umfeld } from './zeichnen.ts';

export const MAX_TAUFEN_JE_LAGE = 2000;
/** Budget für alle Taufen einer Lage (JSON-Zeichen): sie gehen wie Zeichnungen mit jedem Snapshot an jedes Gerät. */
export const MAX_TAUFEN_ZEICHEN_JE_LAGE = 6 * 1024 * 1024;

const FAMILIE_NAME: Record<TaufFamilie, string> = { gebaeude: 'Gebäude', strasse: 'Strasse', gewaesser: 'Gewässer', wald: 'Wald', flaeche: 'Fläche' };

/** Ist `name` in der Lage noch frei (ohne Gross-/Kleinschreibung, über alle Familien)? `ausser`: eigene Taufe beim Umbenennen. */
export function nameFrei(taufen: Pick<Taufe, 'id' | 'name'>[], name: string, ausser?: string): boolean {
  const k = taufSchluessel(name);
  return !taufen.some((t) => t.id !== ausser && taufSchluessel(t.name) === k);
}

/** Erster doppelte Name über alle Listen, sonst undefined. */
export function doppelterListenName(listen: Partial<Record<TaufFamilie, string[]>>): string | undefined {
  const gesehen = new Set<string>();
  for (const namen of Object.values(listen))
    for (const n of namen ?? []) {
      const k = taufSchluessel(n);
      if (gesehen.has(k)) return n;
      gesehen.add(k);
    }
  return undefined;
}

/** true, wenn die Nachricht hierher gehört (auch bei Fehlern, die dann per `fehler` gemeldet sind). */
export function verarbeiteTaufe(u: Umfeld, t: Teilnehmer, lage: Lage, m: ClientMsg): boolean {
  const { db } = u;
  const jetzt = Date.now();
  const nein = (text: string): true => (u.fehler(text), true);
  const vergeben = (name: string) => `Name «${name}» ist in dieser Lage schon vergeben`;
  const passtInsBudget = (zuwachs: number) => zuwachs <= 0 || db.groesse(lage.id, 'taufe') + zuwachs <= MAX_TAUFEN_ZEICHEN_JE_LAGE;
  const speichere = (x: Taufe) => {
    db.speichern(lage.id, 'taufe', x, x.erstelltAm);
    u.anAlle(lage.id, { typ: 'taufe', taufe: x });
  };

  switch (m.typ) {
    case 'taufe.neu': {
      const taufen = db.eintraege(lage.id, 'taufe');
      if (!nameFrei(taufen, m.taufe.name)) return nein(vergeben(m.taufe.name));
      if (taufen.length >= MAX_TAUFEN_JE_LAGE) return nein('Zu viele Taufen in dieser Lage');
      const neu: Taufe = { ...m.taufe, id: randomUUID(), von: t.id, erstelltAm: jetzt, geaendertAm: jetzt };
      if (!passtInsBudget(JSON.stringify(neu).length)) return nein('Zu viele Taufdaten in dieser Lage');
      speichere(neu);
      u.meldung(lage.id, t.id, `Taufe: ${neu.name} (${FAMILIE_NAME[neu.familie]})`);
      return true;
    }
    case 'taufe.aendern': {
      const alt = db.eintrag(lage.id, 'taufe', m.taufe.id);
      if (!alt) return nein('Taufe nicht gefunden');
      const { id: _id, ...aenderung } = m.taufe;
      if (aenderung.name !== undefined && !nameFrei(db.eintraege(lage.id, 'taufe'), aenderung.name, alt.id)) return nein(vergeben(aenderung.name));
      // Neue Geometrie: alte Fassaden-Kanten passen nicht mehr
      const neu: Taufe = { ...alt, ...aenderung, ...(aenderung.geometrie && !aenderung.fassaden ? { fassaden: [] } : {}), geaendertAm: jetzt };
      if (!passtInsBudget(JSON.stringify(neu).length - JSON.stringify(alt).length)) return nein('Zu viele Taufdaten in dieser Lage');
      speichere(neu);
      if (neu.name !== alt.name) u.meldung(lage.id, t.id, `Taufe umbenannt: ${alt.name} → ${neu.name}`);
      return true;
    }
    case 'taufe.loeschen': {
      const alt = db.eintrag(lage.id, 'taufe', m.id);
      if (!alt) return nein('Taufe nicht gefunden');
      db.loeschen(lage.id, 'taufe', m.id);
      u.anAlle(lage.id, { typ: 'taufe.geloescht', id: m.id });
      u.meldung(lage.id, t.id, `Taufe gelöscht: ${alt.name}`);
      return true;
    }
    case 'lage.taufListen': {
      if (t.rolle !== 'leitung') return nein('Nur für die Leitung');
      const doppelt = doppelterListenName(m.taufListen);
      if (doppelt) return nein(`Name «${doppelt}» steht doppelt in den Listen`);
      const neu: Lage = { ...lage, taufListen: m.taufListen };
      db.lageSpeichern(neu);
      u.anAlle(lage.id, { typ: 'lage', lage: neu });
      return true;
    }
    default:
      return false;
  }
}
