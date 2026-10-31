import { describe, expect, it } from 'vitest';
import { STANDARD_STATUS, type Lage, type Marker, type Protokoll, type ProtokollEintrag, type Teilnehmer } from '../../../../shared/protocol.ts';
import { csv, ereignisListe, type Zeile } from './liste.ts';

const tn = (id: string, rufname: string, rolle: Teilnehmer['rolle'] = 'teilnehmer'): Teilnehmer => ({
  id, rufname, einheit: 'Zug 1', funktion: '', sidc: '10031000001211000000', rolle, status: 'bereit', statusText: '', pos: null, sendetPos: true, online: false, zuletzt: 0,
});
const mk = (bezeichnung: string): Marker => ({ id: 'm1', sidc: '10031000001211000000', lat: 46.95, lon: 7.44, bezeichnung, notiz: '', von: 'a', erstelltAm: 0, geaendertAm: 0 });
const e = (t: number, von: string, d: ProtokollEintrag['d']): ProtokollEintrag => ({ t, von, d });
// AP bis 100, LV 100–200, AN ab 200
const lage: Lage = { id: 'L', name: 'Übung', statusSet: STANDARD_STATUS, erstelltAm: 0, phasen: [{ phase: 'ap', t: 0 }, { phase: 'lv', t: 100 }, { phase: 'an', t: 200 }] };
const raster = { id: 'L-raster-piccolo', art: 'piccolo' as const, e: 2_600_000, n: 1_200_200, zeilen: 15, spalten: 21, zellM: 10, fixiert: true, von: 'ltg', geaendertAm: 0 };
const protokoll: Protokoll = {
  teilnehmer: [tn('ltg', 'Adler', 'leitung'), tn('a', 'Bravo'), tn('b', 'Charlie')],
  spuren: { b: [{ lat: 46.951, lon: 7.441, alt: null, ce: null, kurs: null, tempo: null, t: 120 }] },
  ereignisse: [
    e(50, 'a', { typ: 'marker', marker: { ...mk('geplant'), id: 'm0' } }), // AP: nicht in der Liste
    e(110, 'a', { typ: 'marker', marker: mk('Brücke') }),
    e(120, 'b', { typ: 'meldung', meldung: { id: 'x1', von: 'b', status: 'halt', text: 'Pause', t: 120 } }),
    e(130, 'b', { typ: 'chat', chat: { id: 'c1', von: 'b', an: { art: 'alle' }, text: 'Sicht frei', t: 130 } }),
    e(140, 'ltg', { typ: 'bloodhound', auftrag: { id: 'h1', von: 'ltg', an: 'a', ziel: { art: 'punkt', punkt: { lat: 47, lon: 8 } }, erstelltAm: 140, quittiertAm: null, ende: null, endeAm: null } }),
    e(150, 'ltg', { typ: 'marker.geloescht', id: 'm1' }),
    e(160, 'ltg', { typ: 'raster', raster }),
    e(170, 'a', { typ: 'alarm', alarm: { id: 'al', art: 'notfall', von: 'a', lat: 46.94, lon: 7.4, t: 170, quittiertVon: [], aufgehobenAm: null } }),
    e(180, 'b', { typ: 'alarm', alarm: { id: 'al', art: 'notfall', von: 'a', lat: 46.94, lon: 7.4, t: 170, quittiertVon: ['b'], aufgehobenAm: null } }),
  ],
};
const notizen = [{ id: 'n1', von: 'ltg', t: 135, text: 'Hier zu spät', erstelltAm: 300 }];

describe('ereignisListe', () => {
  const fuer = (id: string, rolle: Teilnehmer['rolle']) => ereignisListe({ protokoll, lage, notizen, ich: { id, rolle } });

  it('nur LV, Zeilen je Ereignis mit Autor, Details und Ort', () => {
    const z = fuer('b', 'teilnehmer');
    expect(z.map((x) => x.ereignis)).toEqual(['Marker gesetzt', 'Status', 'Chat', 'Notiz', 'Marker gelöscht', 'Raster gesetzt', 'Alarm Notfall', 'Alarm quittiert']);
    expect(z[0]).toMatchObject({ t: 110, rufname: 'Bravo', einheit: 'Zug 1', details: 'Brücke', punkt: { lat: 46.95, lon: 7.44 } });
    expect(z[1]).toMatchObject({ rufname: 'Charlie', details: 'Halt – Pause', punkt: { lat: 46.951, lon: 7.441 } }); // Ort aus der Spur
    expect(z[2].details).toBe('an alle: Sicht frei');
    expect(z[3]).toMatchObject({ rufname: 'Adler', details: 'Hier zu spät', notizId: 'n1' });
    expect(z[4]).toMatchObject({ rufname: 'Adler', details: 'Brücke' });
    expect(z[7].rufname).toBe('Charlie');
  });

  it('Bloodhound nur für Leitung und Empfänger', () => {
    expect(fuer('b', 'teilnehmer').some((x) => x.ereignis.startsWith('Bloodhound'))).toBe(false);
    expect(fuer('a', 'teilnehmer').find((x) => x.ereignis === 'Bloodhound-Auftrag')?.details).toBe('an Bravo');
    expect(fuer('ltg', 'leitung').some((x) => x.ereignis === 'Bloodhound-Auftrag')).toBe(true);
  });

  it('Rasterzelle, sobald ein Raster liegt', () => {
    const z = fuer('b', 'teilnehmer');
    expect(z[0].zelle).toBe(''); // vor dem Raster
    expect(z.find((x) => x.ereignis === 'Alarm Notfall')?.zelle).toBe(''); // ausserhalb
    const drin = ereignisListe({
      protokoll: { ...protokoll, ereignisse: [...protokoll.ereignisse, e(190, 'a', { typ: 'marker', marker: { ...mk('Drin'), id: 'm2', lat: 46.952, lon: 7.439 } })] },
      lage, notizen: [], ich: { id: 'b', rolle: 'teilnehmer' },
    }).at(-1)!;
    expect(drin.zelle).toMatch(/^Piccolo [A-O] \d\d [A-D]$/);
  });
});

describe('csv', () => {
  it('Semikolon, BOM, Felder mit Sonderzeichen in Anführungszeichen', () => {
    const z: Zeile = { t: 0, von: 'a', rufname: 'Bravo', einheit: 'Zug 1', ereignis: 'Chat', details: 'a; "b"\nc', punkt: { lat: 47, lon: 8 }, zelle: '' };
    const text = csv([z], () => '2\'600\'000 / 1\'200\'000', () => '31.10.2026 14:03:27');
    expect(text.startsWith('﻿Zeit;Rufname;Einheit;Ereignis;Details;Koordinate;Rasterzelle\r\n')).toBe(true);
    expect(text).toContain('31.10.2026 14:03:27;Bravo;Zug 1;Chat;"a; ""b""\nc";2\'600\'000 / 1\'200\'000;');
  });
});
