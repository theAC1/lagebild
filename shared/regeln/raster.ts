// Führungsraster: je Lage höchstens ein Grande und ein Piccolo.
// Erstellen: alle. Nicht fixiert ändern, fixieren, löschen: Ersteller oder Leitung.
// Fixiert: nur die Leitung löst oder löscht es; ändern geht erst nach dem Lösen.
import { rasterId, type Raster } from '../protocol.ts';
import { RASTER_NAME } from '../raster.ts';
import { lauf, nein, type Befehl, type Ereignis, type Ergebnis, type Zustand } from './typen.ts';

export const RASTER_TYPEN = ['raster.setzen', 'raster.fixieren', 'raster.loeschen'] as const;
type RasterBefehl = Extract<Befehl, { typ: (typeof RASTER_TYPEN)[number] }>;

export function wendeRaster(z: Zustand, e: Ereignis & { msg: RasterBefehl }): Ergebnis {
  const { autor: t, msg: m, jetzt } = e;
  const leitung = t.rolle === 'leitung';
  const art = m.typ === 'raster.setzen' ? m.raster.art : m.art;
  const id = rasterId(z.lage.id, art);
  const alt = z.eintrag('raster', id);
  const name = `Führungsraster ${RASTER_NAME[art]}`;
  const darfOffenes = (r: Raster): boolean => leitung || r.von === t.id;
  const l = lauf(e);
  const speichere = (r: Raster): void => l.tu({ was: 'speichern', art: 'raster', obj: r, t: r.geaendertAm }, { typ: 'raster', raster: r });

  switch (m.typ) {
    case 'raster.setzen': {
      if (alt?.fixiert) return nein(`${name} ist fixiert – nur die Leitung kann es lösen`);
      if (alt && !darfOffenes(alt)) return nein(`Nur Ersteller oder Leitung können das ${name} ändern`);
      speichere({ ...m.raster, id, fixiert: false, von: alt?.von ?? t.id, geaendertAm: jetzt });
      if (!alt) l.meldung(`${name} aufgelegt`);
      return l.fertig();
    }
    case 'raster.fixieren': {
      if (!alt) return nein(`${name} nicht gefunden`);
      if (alt.fixiert === m.fixiert) return l.fertig();
      if (m.fixiert ? !darfOffenes(alt) : !leitung) return nein(m.fixiert ? `Nur Ersteller oder Leitung können das ${name} fixieren` : 'Nur die Leitung kann ein fixiertes Raster lösen');
      speichere({ ...alt, fixiert: m.fixiert, geaendertAm: jetzt });
      l.meldung(`${name} ${m.fixiert ? 'fixiert' : 'gelöst'}`);
      return l.fertig();
    }
    case 'raster.loeschen': {
      if (!alt) return nein(`${name} nicht gefunden`);
      if (alt.fixiert ? !leitung : !darfOffenes(alt)) return nein(alt.fixiert ? 'Nur die Leitung kann ein fixiertes Raster löschen' : `Nur Ersteller oder Leitung können das ${name} löschen`);
      l.tu({ was: 'loeschen', art: 'raster', id }, { typ: 'raster.geloescht', art });
      l.meldung(`${name} gelöscht`);
      return l.fertig();
    }
  }
}
