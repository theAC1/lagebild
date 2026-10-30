// Geländetaufe: Taufen und Namenslisten pro Lage. Rechte: alle; Namenslisten nur Leitung. Namen je Lage eindeutig.
import { taufSchluessel, type Lage, type Taufe, type TaufFamilie } from '../protocol.ts';
import { lauf, nein, type Befehl, type Ereignis, type Ergebnis, type Zustand } from './typen.ts';

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

export const TAUFE_TYPEN = ['taufe.neu', 'taufe.aendern', 'taufe.loeschen', 'lage.taufListen'] as const;
type TaufeBefehl = Extract<Befehl, { typ: (typeof TAUFE_TYPEN)[number] }>;

export function wendeTaufe(z: Zustand, e: Ereignis & { msg: TaufeBefehl }): Ergebnis {
  const { autor: t, msg: m, jetzt } = e;
  const l = lauf(e);
  const vergeben = (name: string) => `Name «${name}» ist in dieser Lage schon vergeben`;
  const passtInsBudget = (zuwachs: number) => zuwachs <= 0 || z.groesse('taufe') + zuwachs <= MAX_TAUFEN_ZEICHEN_JE_LAGE;
  const speichere = (x: Taufe) => l.tu({ was: 'speichern', art: 'taufe', obj: x, t: x.erstelltAm }, { typ: 'taufe', taufe: x });

  switch (m.typ) {
    case 'taufe.neu': {
      const taufen = z.eintraege('taufe');
      if (!nameFrei(taufen, m.taufe.name)) return nein(vergeben(m.taufe.name));
      if (taufen.length >= MAX_TAUFEN_JE_LAGE) return nein('Zu viele Taufen in dieser Lage');
      const neu: Taufe = { ...m.taufe, id: e.neueId(), von: t.id, erstelltAm: jetzt, geaendertAm: jetzt };
      if (!passtInsBudget(JSON.stringify(neu).length)) return nein('Zu viele Taufdaten in dieser Lage');
      speichere(neu);
      l.meldung(`Taufe: ${neu.name} (${FAMILIE_NAME[neu.familie]})`);
      return l.fertig();
    }
    case 'taufe.aendern': {
      const alt = z.eintrag('taufe', m.taufe.id);
      if (!alt) return nein('Taufe nicht gefunden');
      const { id: _id, ...aenderung } = m.taufe;
      if (aenderung.name !== undefined && !nameFrei(z.eintraege('taufe'), aenderung.name, alt.id)) return nein(vergeben(aenderung.name));
      // Neue Geometrie: alte Fassaden-Kanten passen nicht mehr
      const neu: Taufe = { ...alt, ...aenderung, ...(aenderung.geometrie && !aenderung.fassaden ? { fassaden: [] } : {}), geaendertAm: jetzt };
      if (!passtInsBudget(JSON.stringify(neu).length - JSON.stringify(alt).length)) return nein('Zu viele Taufdaten in dieser Lage');
      speichere(neu);
      if (neu.name !== alt.name) l.meldung(`Taufe umbenannt: ${alt.name} → ${neu.name}`);
      return l.fertig();
    }
    case 'taufe.loeschen': {
      const alt = z.eintrag('taufe', m.id);
      if (!alt) return nein('Taufe nicht gefunden');
      l.tu({ was: 'loeschen', art: 'taufe', id: m.id }, { typ: 'taufe.geloescht', id: m.id });
      l.meldung(`Taufe gelöscht: ${alt.name}`);
      return l.fertig();
    }
    case 'lage.taufListen': {
      if (t.rolle !== 'leitung') return nein('Nur für die Leitung');
      const doppelt = doppelterListenName(m.taufListen);
      if (doppelt) return nein(`Name «${doppelt}» steht doppelt in den Listen`);
      const neu: Lage = { ...z.lage, taufListen: m.taufListen };
      l.tu({ was: 'lage', lage: neu }, { typ: 'lage', lage: neu });
      return l.fertig();
    }
  }
}
