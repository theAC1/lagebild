// Zeichnungen und Ebenen: alle zeichnen; ändern/löschen wer «darf ändern» (rollen.ts); gesperrte Ebene nur Leitung; Ebenen nur
// Leitung, ausser beim Import (Spec v8: auch Gruppenführer).
import { standardEbeneId, type Ebene, type Rolle, type Zeichnung } from '../protocol.ts';
import { darfAendern, einheiten } from './rollen.ts';
import { lauf, nein, type Befehl, type Ereignis, type Ergebnis, type Zustand } from './typen.ts';

export const MAX_ZEICHNUNGEN_JE_LAGE = 5000;
export const MAX_EBENEN_JE_LAGE = 50;
/** Budget für alle Zeichnungen einer Lage (JSON-Zeichen): sie gehen mit jedem Snapshot an jedes Gerät. */
export const MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE = 10 * 1024 * 1024;
const zeichen = (zs: object[]): number => zs.reduce((n, z) => n + JSON.stringify(z).length, 0);

const ZEICHNUNG_NAME: Record<string, string> = {
  linie: 'Linie', pfeil: 'Pfeil', flaeche: 'Fläche', rechteck: 'Rechteck', kreis: 'Kreis', freihand: 'Freihand', text: 'Text',
  phasenlinie: 'Phasenlinie', grenze: 'Grenze', stossrichtung: 'Stossrichtung', sperre: 'Sperre', raum: 'Raum',
};

/** Ebenen aus MilX/KML importieren (Spec v8): Leitung und Gruppenführer. */
export const darfImportieren = (rolle: Rolle): boolean => rolle === 'leitung' || rolle === 'gruppenfuehrer';

export const ZEICHNEN_TYPEN = ['zeichnung.neu', 'zeichnung.aendern', 'zeichnung.loeschen', 'ebene.neu', 'ebene.aendern', 'ebene.loeschen'] as const;
type ZeichnenBefehl = Extract<Befehl, { typ: (typeof ZEICHNEN_TYPEN)[number] }>;

export function wendeZeichnen(z: Zustand, e: Ereignis & { msg: ZeichnenBefehl }): Ergebnis {
  const { autor: t, msg: m, jetzt } = e;
  const leitung = t.rolle === 'leitung';
  const einheit = einheiten(z);
  const darf = (von: string): boolean => darfAendern(t, von, einheit);
  const l = lauf(e);
  /** Darf der Autor in dieser Ebene schreiben (neu, ändern, löschen)? Fehlertext oder undefined. */
  const ebenenFehler = (ebeneId: string): string | undefined => {
    const x = z.eintrag('ebene', ebeneId);
    if (!x) return 'Ebene nicht gefunden';
    if (x.gesperrt && !leitung) return `Ebene «${x.name}» ist gesperrt`;
    return undefined;
  };

  switch (m.typ) {
    case 'zeichnung.neu': {
      const ids = new Set<string>();
      for (const x of m.zeichnungen) {
        const fe = ebenenFehler(x.ebeneId);
        if (fe) return nein(fe);
        if (x.id && (ids.has(x.id) || z.idVergeben('zeichnung', x.id))) return nein('Zeichnungs-ID bereits vergeben');
        if (x.id) ids.add(x.id);
      }
      if (z.anzahl('zeichnung') + m.zeichnungen.length > MAX_ZEICHNUNGEN_JE_LAGE) return nein('Zu viele Zeichnungen in dieser Lage');
      const neu: Zeichnung[] = m.zeichnungen.map((x) => ({ ...x, id: x.id ?? e.neueId(), von: x.von && darf(x.von) ? x.von : t.id, erstelltAm: jetzt, geaendertAm: jetzt }));
      if (z.groesse('zeichnung') + zeichen(neu) > MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE) return nein('Zu viele Zeichnungsdaten in dieser Lage');
      for (const x of neu) l.tu({ was: 'speichern', art: 'zeichnung', obj: x, t: x.erstelltAm });
      l.sende({ typ: 'zeichnungen', zeichnungen: neu });
      l.meldung(neu.length === 1 ? `Zeichnung: ${ZEICHNUNG_NAME[neu[0].art]}${neu[0].bezeichnung ? ` «${neu[0].bezeichnung}»` : ''}` : `${neu.length} Zeichnungen eingefügt`);
      return l.fertig();
    }
    case 'zeichnung.aendern': {
      const alte: Zeichnung[] = [];
      for (const x of m.zeichnungen) {
        const alt = z.eintrag('zeichnung', x.id);
        if (!alt) return nein('Zeichnung nicht gefunden');
        if (alte.some((a) => a.id === x.id)) return nein('Zeichnung doppelt');
        if (!darf(alt.von)) return nein('Keine Berechtigung für diese Zeichnung');
        // Quell- und Zielebene prüfen: nichts aus einer gesperrten Ebene herausnehmen, nichts hineinlegen
        const fe = ebenenFehler(alt.ebeneId) ?? ebenenFehler(x.ebeneId);
        if (fe) return nein(fe);
        alte.push(alt);
      }
      const neu: Zeichnung[] = m.zeichnungen.map((x, i) => ({ ...x, von: alte[i].von, erstelltAm: alte[i].erstelltAm, geaendertAm: jetzt }));
      const zuwachs = zeichen(neu) - zeichen(alte);
      if (zuwachs > 0 && z.groesse('zeichnung') + zuwachs > MAX_ZEICHNUNGEN_ZEICHEN_JE_LAGE) return nein('Zu viele Zeichnungsdaten in dieser Lage');
      for (const x of neu) l.tu({ was: 'speichern', art: 'zeichnung', obj: x, t: x.erstelltAm });
      l.sende({ typ: 'zeichnungen', zeichnungen: neu });
      return l.fertig(); // kein Log-Eintrag: Verschieben/Stützpunkte ziehen würden das Meldungslog fluten
    }
    case 'zeichnung.loeschen': {
      const ids = [...new Set(m.ids)];
      for (const id of ids) {
        const alt = z.eintrag('zeichnung', id);
        if (!alt) return nein('Zeichnung nicht gefunden');
        if (!darf(alt.von)) return nein('Keine Berechtigung für diese Zeichnung');
        const fe = ebenenFehler(alt.ebeneId);
        if (fe) return nein(fe);
      }
      for (const id of ids) l.tu({ was: 'loeschen', art: 'zeichnung', id });
      l.sende({ typ: 'zeichnungen.geloescht', ids });
      l.meldung(ids.length === 1 ? 'Zeichnung gelöscht' : `${ids.length} Zeichnungen gelöscht`);
      return l.fertig();
    }
    case 'ebene.neu': {
      if (!(m.import ? darfImportieren(t.rolle) : leitung)) return nein('Nur für die Leitung');
      const ebenen = z.ebenen();
      if (ebenen.length >= MAX_EBENEN_JE_LAGE) return nein('Zu viele Ebenen in dieser Lage');
      if (ebenen.some((x) => x.name === m.name)) return nein('Ebenen-Name bereits vergeben');
      if (m.id && z.idVergeben('ebene', m.id)) return nein('Ebenen-ID bereits vergeben');
      const reihenfolge = Math.min(1000, Math.max(...ebenen.map((x) => x.reihenfolge)) + 1);
      // Import: Ebene der Leitung gesperrt (nur sie ändert), die eines Gruppenführers offen
      const gesperrt = m.import ? leitung : (m.gesperrt ?? false);
      const ebene: Ebene = { id: m.id ?? e.neueId(), name: m.name, gesperrt, reihenfolge, erstelltVon: t.id, erstelltAm: jetzt };
      l.tu({ was: 'speichern', art: 'ebene', obj: ebene, t: jetzt }, { typ: 'ebene', ebene });
      l.meldung(`Ebene ${m.import ? 'importiert' : 'angelegt'}: ${ebene.name}`);
      return l.fertig();
    }
    case 'ebene.aendern': {
      if (!leitung) return nein('Nur für die Leitung');
      const alt = z.eintrag('ebene', m.id);
      if (!alt) return nein('Ebene nicht gefunden');
      if (m.name !== undefined && m.name !== alt.name && z.ebenen().some((x) => x.name === m.name)) return nein('Ebenen-Name bereits vergeben');
      const ebene: Ebene = { ...alt, name: m.name ?? alt.name, gesperrt: m.gesperrt ?? alt.gesperrt, reihenfolge: m.reihenfolge ?? alt.reihenfolge };
      l.tu({ was: 'speichern', art: 'ebene', obj: ebene, t: alt.erstelltAm }, { typ: 'ebene', ebene });
      if (ebene.gesperrt !== alt.gesperrt) l.meldung(`Ebene ${ebene.gesperrt ? 'gesperrt' : 'entsperrt'}: ${ebene.name}`);
      return l.fertig();
    }
    case 'ebene.loeschen': {
      if (!leitung) return nein('Nur für die Leitung');
      const alt = z.eintrag('ebene', m.id);
      if (!alt) return nein('Ebene nicht gefunden');
      if (m.id === standardEbeneId(z.lage.id)) return nein('Die Standard-Ebene kann nicht gelöscht werden');
      const zeichnungIds = z.eintraege('zeichnung').filter((x) => x.ebeneId === m.id).map((x) => x.id);
      for (const id of zeichnungIds) l.tu({ was: 'loeschen', art: 'zeichnung', id });
      l.tu({ was: 'loeschen', art: 'ebene', id: m.id }, { typ: 'ebene.geloescht', id: m.id, zeichnungIds });
      l.meldung(`Ebene gelöscht: ${alt.name}${zeichnungIds.length ? ` (${zeichnungIds.length} Zeichnungen)` : ''}`);
      return l.fertig();
    }
  }
}
