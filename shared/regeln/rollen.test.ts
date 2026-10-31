// Rollen (Spec v7): «darf ändern» für Gruppenführer, Beobachter, eigene Angaben, Rolle setzen, Übergabe, Wiederbeitritt.
import { describe, expect, it } from 'vitest';
import { STANDARD_STIL, standardEbeneId, type RasterDef, type Rolle } from '../protocol.ts';
import { darfAendern, wiederbeitritt } from './rollen.ts';
import type { Befehl } from './typen.ts';
import { deltas, grund, LAGE, leereLage, tn, welt } from './testwelt.ts';

const PUNKT = { art: 'punkt', punkt: { lat: 47, lon: 8 } } as const;
const linie = (id: string) => ({ id, ebeneId: standardEbeneId(LAGE.id), art: 'linie' as const, punkte: [{ lat: 47, lon: 8 }, { lat: 47.1, lon: 8.1 }], text: '', bezeichnung: '', stil: STANDARD_STIL });
const marker = (id: string, bezeichnung = '') => ({ typ: 'marker.setzen', marker: { id, sidc: '10031000001211000000', lat: 47, lon: 8, bezeichnung, notiz: '' } }) as const;
const GRANDE: RasterDef = { art: 'grande', e: 2_600_000, n: 1_200_600, zeilen: 15, spalten: 21, zellM: 80 };

/** Leitung, Gruppenführer `gf` und Teilnehmer `a` in Zug 1, Teilnehmer `b` in Zug 2, Beobachter `beob` (online). */
const rollenWelt = () =>
  welt(
    leereLage(LAGE, [
      tn('ltg', 'leitung'), tn('gf', 'gruppenfuehrer'), tn('a'), tn('b', 'teilnehmer', { einheit: 'Zug 2', online: true }),
      tn('beob', 'beobachter', { online: true }),
    ]),
  );

describe('Gruppenführer', () => {
  it('ändert und löscht Objekte der eigenen Einheit, nicht die einer fremden; Aufträge und Alarme ebenso', () => {
    const w = rollenWelt();
    w.tu('a', marker('m-a'));
    w.tu('b', marker('m-b'));
    w.tu('a', { typ: 'zeichnung.neu', zeichnungen: [linie('z-a')] });
    w.tu('b', { typ: 'zeichnung.neu', zeichnungen: [linie('z-b')] });
    w.tu('b', { typ: 'raster.setzen', raster: GRANDE });
    w.tu('a', { typ: 'alarm.ausloesen', art: 'notfall', pos: null });
    w.tu('b', { typ: 'alarm.ausloesen', art: 'kontakt', pos: null });
    const [alarmA, alarmB] = w.daten.eintraege.alarm!.map((x) => x.id);

    expect(grund(w.tu('gf', marker('m-a', 'geändert')))).toBeUndefined();
    expect(grund(w.tu('gf', { typ: 'zeichnung.loeschen', ids: ['z-a'] }))).toBeUndefined();
    expect(grund(w.tu('gf', { typ: 'alarm.aufheben', id: alarmA }))).toBeUndefined();
    expect(grund(w.tu('gf', { typ: 'bloodhound.auftrag', an: 'a', ziel: PUNKT }))).toBeUndefined();

    expect(grund(w.tu('gf', marker('m-b', 'geändert')))).toBe('Keine Berechtigung für diesen Marker');
    expect(grund(w.tu('gf', { typ: 'zeichnung.loeschen', ids: ['z-b'] }))).toBe('Keine Berechtigung für diese Zeichnung');
    expect(grund(w.tu('gf', { typ: 'raster.setzen', raster: { ...GRANDE, zeilen: 10 } }))).toBe('Nur Ersteller oder Leitung können das Führungsraster Grande ändern');
    expect(grund(w.tu('gf', { typ: 'alarm.aufheben', id: alarmB }))).toMatch(/^Nur Auslöser/);
    expect(grund(w.tu('gf', { typ: 'bloodhound.auftrag', an: 'b', ziel: PUNKT }))).toBe('Nur Leitung oder Gruppenführer der Einheit');
    w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'b', ziel: PUNKT });
    const anB = w.daten.eintraege.bloodhound!.find((x) => x.an === 'b')!.id;
    expect(grund(w.tu('gf', { typ: 'bloodhound.aufheben', id: anB }))).toBe('Nur Leitung oder Gruppenführer der Einheit');
  });

  it('löst kein fixiertes Raster und ändert die eigene Einheit nicht selbst (sonst Rechte über eine fremde Einheit)', () => {
    const w = rollenWelt();
    w.tu('a', { typ: 'raster.setzen', raster: GRANDE });
    w.tu('a', { typ: 'raster.fixieren', art: 'grande', fixiert: true });
    expect(grund(w.tu('gf', { typ: 'raster.fixieren', art: 'grande', fixiert: false }))).toBe('Nur die Leitung kann ein fixiertes Raster lösen');
    expect(grund(w.tu('gf', { typ: 'ich.aendern', einheit: 'Zug 2' }))).toBe('Die Einheit eines Gruppenführers ändert die Leitung');
    expect(grund(w.tu('gf', { typ: 'ich.aendern', einheit: 'Zug 1', rufname: 'Falke' }))).toBeUndefined(); // gleiche Einheit geht
    expect(grund(w.tu('a', { typ: 'ich.aendern', einheit: 'Zug 2' }))).toBeUndefined();
    expect(w.daten.teilnehmer.find((t) => t.id === 'gf')).toMatchObject({ einheit: 'Zug 1', rufname: 'Falke' });
  });
});

describe('Beobachter', () => {
  it('Position still verworfen, jede Änderung abgelehnt, eigene Angaben erlaubt; bekommt keine Aufträge', () => {
    const w = rollenWelt();
    const pos = { lat: 47, lon: 8, alt: null, ce: null, kurs: null, tempo: null, t: 1 };
    expect(w.tu('beob', { typ: 'pos', pos })).toEqual({ aenderungen: [], deltas: [] });
    const verboten: Befehl[] = [
      marker('m1'),
      { typ: 'chat', an: { art: 'alle' }, text: 'x' },
      { typ: 'status', status: 'bereit', text: '' },
      { typ: 'alarm.ausloesen', art: 'notfall', pos: null },
      { typ: 'sendetPos', an: false },
      { typ: 'zeichnung.neu', zeichnungen: [linie('z1')] },
      { typ: 'taufe.loeschen', id: 'x' },
    ];
    for (const m of verboten) expect(grund(w.tu('beob', m)), m.typ).toBe('Beobachter: nur lesen');
    expect(deltas(w.tu('beob', { typ: 'ich.aendern', rufname: 'Auge' }))).toEqual(['teilnehmer', 'meldung']);
    expect(grund(w.tu('ltg', { typ: 'bloodhound.auftrag', an: 'beob', ziel: PUNKT }))).toBe('Beobachter bekommen keine Aufträge');
    // eigene Objekte aus der Zeit als Teilnehmer: auch die Oberfläche (darfAendern) bietet kein Ändern an
    expect(darfAendern(tn('beob', 'beobachter'), 'beob', () => 'Zug 1')).toBe(false);
  });
});

describe('Leitung', () => {
  it('setzt Rolle und Einheit anderer (mit Meldung), nicht die eigene', () => {
    const w = rollenWelt();
    const r = w.tu('ltg', { typ: 'teilnehmer.aendern', id: 'a', rolle: 'gruppenfuehrer', einheit: 'Zug 2' });
    expect(r).toMatchObject({ deltas: [{ typ: 'teilnehmer' }, { meldung: { text: 'A ist jetzt Gruppenführer' } }, { meldung: { text: 'A ist jetzt in Zug 2' } }] });
    expect(w.daten.teilnehmer.find((t) => t.id === 'a')).toMatchObject({ rolle: 'gruppenfuehrer', einheit: 'Zug 2' });
    expect(grund(w.tu('ltg', { typ: 'teilnehmer.aendern', id: 'ltg', rolle: 'teilnehmer' }))).toBe('Nicht für sich selbst');
  });

  it('Übergabe: nur an verbundene Nicht-Beobachter; danach genau eine Leitung, die bisherige ist Teilnehmer', () => {
    const w = rollenWelt();
    expect(grund(w.tu('ltg', { typ: 'leitung.uebergeben', id: 'a' }))).toBe('A ist nicht verbunden');
    expect(grund(w.tu('ltg', { typ: 'leitung.uebergeben', id: 'beob' }))).toBe('Beobachter können nicht Leitung werden');
    expect(deltas(w.tu('ltg', { typ: 'leitung.uebergeben', id: 'b' }))).toEqual(['teilnehmer', 'teilnehmer', 'meldung']);
    expect(w.daten.teilnehmer.filter((t) => t.rolle === 'leitung').map((t) => t.id)).toEqual(['b']);
    expect(w.daten.teilnehmer.find((t) => t.id === 'ltg')?.rolle).toBe('teilnehmer');
    expect(grund(w.tu('ltg', { typ: 'lage.phase', phase: 'ap' }))).toBe('Nur für die Leitung');
    expect(grund(w.tu('b', { typ: 'lage.phase', phase: 'ap' }))).toBeUndefined();
  });
});

it('Wiederbeitritt: gleicher Eintrag, Rufname/Funktion neu, Rolle nur angehoben; entfernter Eintrag wie neu', () => {
  const faelle: [Rolle, Rolle, boolean, Rolle][] = [
    ['gruppenfuehrer', 'teilnehmer', false, 'gruppenfuehrer'],
    ['teilnehmer', 'gruppenfuehrer', false, 'gruppenfuehrer'],
    ['beobachter', 'teilnehmer', false, 'teilnehmer'],
    ['leitung', 'beobachter', false, 'leitung'],
    ['gruppenfuehrer', 'teilnehmer', true, 'teilnehmer'],
  ];
  for (const [alt, code, entfernt, erwartet] of faelle) {
    const t = wiederbeitritt(tn('x', alt, { status: 'halt' }), entfernt, { rufname: 'Neu', funktion: 'San', einheit: 'Zug 9', sidc: '10031000001211000001' }, code as Exclude<Rolle, 'leitung'>);
    expect(t, `${alt}+${code}${entfernt ? ' entfernt' : ''}`).toMatchObject({ id: 'x', rolle: erwartet, rufname: 'Neu', funktion: 'San', status: 'halt', einheit: entfernt ? 'Zug 9' : 'Zug 1' });
  }
});
