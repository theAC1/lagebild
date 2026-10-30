// Führungsraster: je Lage höchstens ein Grande und ein Piccolo. Rechte, Persistenz, Verteilung.
import { rasterId, type ClientMsg, type Lage, type Raster, type Teilnehmer } from '../../shared/protocol.ts';
import { RASTER_NAME } from '../../shared/raster.ts';
import type { Umfeld } from './zeichnen.ts';

/**
 * Erstellen: alle. Nicht fixiert ändern, fixieren, löschen: Ersteller oder Leitung.
 * Fixiert: nur die Leitung löst oder löscht es; ändern geht erst nach dem Lösen.
 * true, wenn die Nachricht hierher gehört (auch bei Fehlern, die dann per `fehler` gemeldet sind).
 */
export function verarbeiteRaster(u: Umfeld, t: Teilnehmer, lage: Lage, m: ClientMsg): boolean {
  if (m.typ !== 'raster.setzen' && m.typ !== 'raster.fixieren' && m.typ !== 'raster.loeschen') return false;
  const leitung = t.rolle === 'leitung';
  const art = m.typ === 'raster.setzen' ? m.raster.art : m.art;
  const id = rasterId(lage.id, art);
  const alt = u.db.eintrag(lage.id, 'raster', id);
  const name = `Führungsraster ${RASTER_NAME[art]}`;
  const nein = (text: string): true => (u.fehler(text), true);
  const darfOffenes = (r: Raster): boolean => leitung || r.von === t.id;
  const speichere = (r: Raster): void => {
    u.db.speichern(lage.id, 'raster', r, r.geaendertAm);
    u.anAlle(lage.id, { typ: 'raster', raster: r });
  };

  switch (m.typ) {
    case 'raster.setzen': {
      if (alt?.fixiert) return nein(`${name} ist fixiert – nur die Leitung kann es lösen`);
      if (alt && !darfOffenes(alt)) return nein(`Nur Ersteller oder Leitung können das ${name} ändern`);
      speichere({ ...m.raster, id, fixiert: false, von: alt?.von ?? t.id, geaendertAm: Date.now() });
      if (!alt) u.meldung(lage.id, t.id, `${name} aufgelegt`);
      return true;
    }
    case 'raster.fixieren': {
      if (!alt) return nein(`${name} nicht gefunden`);
      if (alt.fixiert === m.fixiert) return true;
      if (m.fixiert ? !darfOffenes(alt) : !leitung) return nein(m.fixiert ? `Nur Ersteller oder Leitung können das ${name} fixieren` : 'Nur die Leitung kann ein fixiertes Raster lösen');
      speichere({ ...alt, fixiert: m.fixiert, geaendertAm: Date.now() });
      u.meldung(lage.id, t.id, `${name} ${m.fixiert ? 'fixiert' : 'gelöst'}`);
      return true;
    }
    case 'raster.loeschen': {
      if (!alt) return nein(`${name} nicht gefunden`);
      if (alt.fixiert ? !leitung : !darfOffenes(alt)) return nein(alt.fixiert ? 'Nur die Leitung kann ein fixiertes Raster löschen' : `Nur Ersteller oder Leitung können das ${name} löschen`);
      u.db.loeschen(lage.id, 'raster', id);
      u.anAlle(lage.id, { typ: 'raster.geloescht', art });
      u.meldung(lage.id, t.id, `${name} gelöscht`);
      return true;
    }
  }
}
