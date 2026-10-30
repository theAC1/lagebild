// Rechte direkt gegen die Regeln: Leitung vs. Teilnehmer, fixiertes Raster, Taufe-Konflikte, gesperrte Ebenen.
import { describe, expect, it } from 'vitest';
import { STANDARD_STIL, standardEbeneId, type RasterDef, type TaufeInput, type ZeichnungInput } from '../protocol.ts';
import { deltas, grund, LAGE, welt } from './testwelt.ts';

const GRANDE: RasterDef = { art: 'grande', e: 2_600_000, n: 1_200_600, zeilen: 15, spalten: 21, zellM: 80 };
const STD = standardEbeneId(LAGE.id);
const linie = (extra: Partial<ZeichnungInput> = {}): ZeichnungInput => ({
  ebeneId: STD, art: 'linie', punkte: [{ lat: 47, lon: 8 }, { lat: 47.1, lon: 8.1 }], text: '', bezeichnung: '', stil: STANDARD_STIL, ...extra,
});
const ring: [number, number][] = [[7.44, 46.94], [7.441, 46.94], [7.441, 46.941], [7.44, 46.941], [7.44, 46.94]];
const gebaeude = (name: string, extra: Partial<TaufeInput> = {}): TaufeInput => ({
  familie: 'gebaeude', name, geometrie: { type: 'Polygon', coordinates: [ring] }, quelle: 'vt', objektart: 'building/', stoss: null, fassaden: [], ziel: false, ...extra,
});

describe('Führungsraster', () => {
  it('Teilnehmende legen auf und fixieren; danach löst und löscht nur die Leitung', () => {
    const w = welt();
    expect(deltas(w.tu('a', { typ: 'raster.setzen', raster: GRANDE }))).toEqual(['raster', 'meldung']);
    expect(grund(w.tu('b', { typ: 'raster.setzen', raster: { ...GRANDE, zeilen: 10 } }))).toBe('Nur Ersteller oder Leitung können das Führungsraster Grande ändern');
    expect(grund(w.tu('b', { typ: 'raster.fixieren', art: 'grande', fixiert: true }))).toBe('Nur Ersteller oder Leitung können das Führungsraster Grande fixieren');
    expect(grund(w.tu('a', { typ: 'raster.fixieren', art: 'grande', fixiert: true }))).toBeUndefined();

    // fixiert: niemand verschiebt, auch die Leitung nicht ohne Lösen; Ersteller löst/löscht nicht mehr
    expect(grund(w.tu('a', { typ: 'raster.setzen', raster: GRANDE }))).toBe('Führungsraster Grande ist fixiert – nur die Leitung kann es lösen');
    expect(grund(w.tu('ltg', { typ: 'raster.setzen', raster: GRANDE }))).toBe('Führungsraster Grande ist fixiert – nur die Leitung kann es lösen');
    expect(grund(w.tu('a', { typ: 'raster.fixieren', art: 'grande', fixiert: false }))).toBe('Nur die Leitung kann ein fixiertes Raster lösen');
    expect(grund(w.tu('a', { typ: 'raster.loeschen', art: 'grande' }))).toBe('Nur die Leitung kann ein fixiertes Raster löschen');

    expect(deltas(w.tu('ltg', { typ: 'raster.fixieren', art: 'grande', fixiert: false }))).toEqual(['raster', 'meldung']);
    expect(grund(w.tu('ltg', { typ: 'raster.setzen', raster: { ...GRANDE, zellM: 100 } }))).toBeUndefined();
    const r = w.daten.eintraege.raster![0];
    expect(r).toMatchObject({ id: 'L-raster-grande', zellM: 100, fixiert: false, von: 'a' }); // Ersteller bleibt
  });

  it('gleicher Fixier-Zustand ist still angenommen; fehlendes Raster abgelehnt', () => {
    const w = welt();
    expect(grund(w.tu('a', { typ: 'raster.fixieren', art: 'piccolo', fixiert: true }))).toBe('Führungsraster Piccolo nicht gefunden');
    w.tu('a', { typ: 'raster.setzen', raster: { ...GRANDE, art: 'piccolo' } });
    expect(w.tu('a', { typ: 'raster.fixieren', art: 'piccolo', fixiert: false })).toEqual({ aenderungen: [], deltas: [] });
  });
});

describe('Geländetaufe', () => {
  it('Namen je Lage eindeutig (Gross-/Kleinschreibung, Leerzeichen, über Familien); frei nach dem Löschen', () => {
    const w = welt();
    expect(deltas(w.tu('a', { typ: 'taufe.neu', taufe: gebaeude('Gold') }))).toEqual(['taufe', 'meldung']);
    expect(grund(w.tu('b', { typ: 'taufe.neu', taufe: gebaeude(' gold ', { familie: 'wald' }) }))).toBe('Name « gold » ist in dieser Lage schon vergeben');
    w.tu('b', { typ: 'taufe.neu', taufe: gebaeude('Iron') });
    const [gold, iron] = w.daten.eintraege.taufe!;
    expect(grund(w.tu('b', { typ: 'taufe.aendern', taufe: { id: iron.id, name: 'GOLD' } }))).toBe('Name «GOLD» ist in dieser Lage schon vergeben');
    expect(grund(w.tu('a', { typ: 'taufe.aendern', taufe: { id: gold.id, name: 'gold' } }))).toBeUndefined(); // eigener Name
    // alle dürfen fremde Taufen löschen; danach ist der Name wieder frei
    expect(grund(w.tu('b', { typ: 'taufe.loeschen', id: gold.id }))).toBeUndefined();
    expect(grund(w.tu('b', { typ: 'taufe.neu', taufe: gebaeude('Gold') }))).toBeUndefined();
  });

  it('neue Geometrie verwirft Fassaden; Umbenennen schreibt Meldung', () => {
    const w = welt();
    w.tu('a', { typ: 'taufe.neu', taufe: gebaeude('Gold', { stoss: 90, fassaden: [[0, 'rot']] }) });
    const id = w.daten.eintraege.taufe![0].id;
    w.tu('b', { typ: 'taufe.aendern', taufe: { id, geometrie: { type: 'Polygon', coordinates: [ring.map(([x, y]) => [x + 0.001, y] as [number, number])] } } });
    expect(w.daten.eintraege.taufe![0]).toMatchObject({ fassaden: [], stoss: 90, von: 'a' });
    expect(deltas(w.tu('b', { typ: 'taufe.aendern', taufe: { id, name: 'Iron' } }))).toEqual(['taufe', 'meldung']);
  });

  it('Namenslisten: nur Leitung, keine Doppelten über Familien', () => {
    const w = welt();
    expect(grund(w.tu('a', { typ: 'lage.taufListen', taufListen: { gebaeude: ['Gold'] } }))).toBe('Nur für die Leitung');
    expect(grund(w.tu('ltg', { typ: 'lage.taufListen', taufListen: { gebaeude: ['Gold'], strasse: ['gold'] } }))).toBe('Name «gold» steht doppelt in den Listen');
    w.tu('ltg', { typ: 'lage.taufListen', taufListen: { gebaeude: ['Gold'] } });
    expect(w.daten.lage.taufListen).toEqual({ gebaeude: ['Gold'] });
  });
});

describe('Zeichnen und Ebenen', () => {
  it('fremde Zeichnung: Teilnehmer nein, Leitung ja; Ersteller bleibt', () => {
    const w = welt();
    w.tu('a', { typ: 'zeichnung.neu', zeichnungen: [linie({ id: 'z1' })] });
    expect(grund(w.tu('b', { typ: 'zeichnung.aendern', zeichnungen: [{ ...linie({ bezeichnung: 'x' }), id: 'z1' }] }))).toBe('Keine Berechtigung für diese Zeichnung');
    expect(grund(w.tu('b', { typ: 'zeichnung.loeschen', ids: ['z1'] }))).toBe('Keine Berechtigung für diese Zeichnung');
    expect(grund(w.tu('ltg', { typ: 'zeichnung.aendern', zeichnungen: [{ ...linie({ bezeichnung: 'x' }), id: 'z1' }] }))).toBeUndefined();
    expect(w.daten.eintraege.zeichnung![0]).toMatchObject({ bezeichnung: 'x', von: 'a' });
  });

  it('gesperrte Ebene: nur Leitung zeichnet hinein, nichts wird herausgeschoben', () => {
    const w = welt();
    expect(grund(w.tu('a', { typ: 'ebene.neu', name: 'Stab' }))).toBe('Nur für die Leitung');
    w.tu('ltg', { typ: 'ebene.neu', name: 'Stab', gesperrt: true });
    const stab = w.daten.eintraege.ebene!.find((e) => e.name === 'Stab')!;
    expect(stab.reihenfolge).toBe(1);
    expect(grund(w.tu('a', { typ: 'zeichnung.neu', zeichnungen: [linie({ ebeneId: stab.id })] }))).toBe('Ebene «Stab» ist gesperrt');
    w.tu('a', { typ: 'zeichnung.neu', zeichnungen: [linie({ id: 'z1' })] });
    expect(grund(w.tu('a', { typ: 'zeichnung.aendern', zeichnungen: [{ ...linie({ ebeneId: stab.id }), id: 'z1' }] }))).toBe('Ebene «Stab» ist gesperrt');
    expect(grund(w.tu('ltg', { typ: 'zeichnung.neu', zeichnungen: [linie({ ebeneId: stab.id, id: 'z2' })] }))).toBeUndefined();
    expect(grund(w.tu('ltg', { typ: 'ebene.neu', name: 'Stab' }))).toBe('Ebenen-Name bereits vergeben');
  });

  it('mehrere auf einmal sind alles oder nichts; Ebene löschen nimmt Zeichnungen mit, Standard-Ebene bleibt', () => {
    const w = welt();
    expect(grund(w.tu('a', { typ: 'zeichnung.neu', zeichnungen: [linie({ id: 'z1' }), linie({ id: 'z1' })] }))).toBe('Zeichnungs-ID bereits vergeben');
    expect(w.daten.eintraege.zeichnung).toBeUndefined();
    w.tu('ltg', { typ: 'ebene.neu', name: 'Feind' });
    const feind = w.daten.eintraege.ebene!.find((e) => e.name === 'Feind')!;
    w.tu('a', { typ: 'zeichnung.neu', zeichnungen: [linie({ ebeneId: feind.id, id: 'z1' }), linie({ id: 'z2' })] });
    const r = w.tu('ltg', { typ: 'ebene.loeschen', id: feind.id });
    expect(r).toMatchObject({ deltas: [{ typ: 'ebene.geloescht', id: feind.id, zeichnungIds: ['z1'] }, { typ: 'meldung' }] });
    expect(w.daten.eintraege.zeichnung!.map((z) => z.id)).toEqual(['z2']);
    expect(grund(w.tu('ltg', { typ: 'ebene.loeschen', id: STD }))).toBe('Die Standard-Ebene kann nicht gelöscht werden');
  });
});

describe('Leitung vs. Teilnehmer', () => {
  it('fremder Marker: Teilnehmer nein, Leitung ja', () => {
    const w = welt();
    w.tu('a', { typ: 'marker.setzen', marker: { id: 'm1', sidc: '10031000001211000000', lat: 47, lon: 8, bezeichnung: '', notiz: '' } });
    const aendern = { typ: 'marker.setzen', marker: { id: 'm1', sidc: '10031000001211000000', lat: 47.1, lon: 8, bezeichnung: 'x', notiz: '' } } as const;
    expect(grund(w.tu('b', aendern))).toBe('Keine Berechtigung für diesen Marker');
    expect(grund(w.tu('b', { typ: 'marker.loeschen', id: 'm1' }))).toBe('Keine Berechtigung für diesen Marker');
    expect(grund(w.tu('ltg', aendern))).toBeUndefined();
    expect(w.daten.eintraege.marker![0]).toMatchObject({ von: 'a', erstelltAm: 2000, geaendertAm: 5000 });
  });

  it('nur die Leitung: Status-Set, Beenden, Entfernen, Ebenen, Bloodhound-Auftrag', () => {
    const w = welt();
    const nurLeitung = [
      { typ: 'lage.statusSet', statusSet: LAGE.statusSet },
      { typ: 'lage.beenden' },
      { typ: 'teilnehmer.entfernen', id: 'b' },
      { typ: 'ebene.neu', name: 'x' },
      { typ: 'bloodhound.auftrag', an: 'b', ziel: { art: 'punkt', punkt: { lat: 47, lon: 8 } } },
    ] as const;
    for (const m of nurLeitung) expect(grund(w.tu('a', m))).toBe('Nur für die Leitung');
    expect(grund(w.tu('ltg', { typ: 'teilnehmer.entfernen', id: 'ltg' }))).toBe('Sich selbst entfernen ist nicht möglich');
    expect(grund(w.tu('ltg', { typ: 'lage.beenden' }))).toBeUndefined();
    expect(w.daten.lage.beendetAm).not.toBeNull();
  });

  it('Alarm aufheben: Auslöser oder Leitung', () => {
    const w = welt();
    w.tu('a', { typ: 'alarm.ausloesen', art: 'notfall', pos: null });
    const id = w.daten.eintraege.alarm![0].id;
    expect(grund(w.tu('b', { typ: 'alarm.aufheben', id }))).toBe('Nur Auslöser oder Leitung können den Alarm aufheben');
    expect(grund(w.tu('ltg', { typ: 'alarm.aufheben', id }))).toBeUndefined();
    expect(grund(w.tu('a', { typ: 'alarm.aufheben', id }))).toBe('Alarm nicht aktiv');
  });

  it('Bloodhound: Empfänger quittiert, nur Leitung hebt auf', () => {
    const w = welt();
    w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'a', ziel: { art: 'teilnehmer', id: 'b' } });
    const id = w.daten.eintraege.bloodhound![0].id;
    expect(grund(w.tu('b', { typ: 'bloodhound.quittieren', id }))).toBe('Nur der Empfänger kann den Auftrag bearbeiten');
    expect(grund(w.tu('a', { typ: 'bloodhound.aufheben', id }))).toBe('Nur für die Leitung');
    expect(grund(w.tu('a', { typ: 'bloodhound.quittieren', id }))).toBeUndefined();
    expect(grund(w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'a', ziel: { art: 'teilnehmer', id: 'a' } }))).toBe('Ziel ist der Empfänger selbst');
  });
});
