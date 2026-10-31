// Führungsraster: Vertragsgrenzen, je Art eines, Snapshot und Export. Rechte (Ersteller/Leitung, fixiert) prüft shared/regeln.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RasterDef, type RasterDef as RDef } from '../../shared/protocol.ts';
import { testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const GRANDE: RDef = { art: 'grande', e: 2_600_000, n: 1_200_600, zeilen: 15, spalten: 21, zellM: 80 };

describe('Führungsraster', () => {
  it('Vertrag: Zeilen bis 26, Spalten bis 99, Ausdehnung ≤ 100 km, LV95', () => {
    const ok = (r: Partial<RDef>) => RasterDef.safeParse({ ...GRANDE, ...r }).success;
    expect(ok({})).toBe(true);
    expect(ok({ zeilen: 26 })).toBe(true);
    expect(ok({ zeilen: 27 })).toBe(false);
    expect(ok({ spalten: 99, zellM: 1000 })).toBe(true);
    expect(ok({ spalten: 99, zellM: 1100 })).toBe(false);
    expect(ok({ zeilen: 1.5 })).toBe(false);
    expect(ok({ e: 600_000 })).toBe(false); // LV03 statt LV95
  });

  it('je Art ein Raster (Setzen ersetzt), Grande und Piccolo nebeneinander; an alle, Snapshot, Löschen, Export', async () => {
    const l = await s.lage();
    const ltgB = await s.beitreten(l.leitungCode, 'Leitung', 'Stab');
    const ltg = await verbinde(s.url, ltgB.token);
    const a = await verbinde(s.url, (await s.beitreten(l.teilnehmerCode, 'Adler')).token);
    const piccolo: RDef = { ...GRANDE, art: 'piccolo', zellM: 10 };
    ltg.senden({ typ: 'raster.setzen', raster: GRANDE });
    expect((await a.warte('raster')).raster).toMatchObject({ ...GRANDE, fixiert: false, von: ltgB.teilnehmerId });
    ltg.senden({ typ: 'raster.setzen', raster: piccolo });
    await a.warte('raster', (m) => m.raster.art === 'piccolo');
    ltg.senden({ typ: 'raster.setzen', raster: { ...GRANDE, spalten: 10 } }); // ersetzt, kein zweites Grande
    await a.warte('raster', (m) => m.raster.spalten === 10);
    const neu = await verbinde(s.url, ltgB.token);
    expect(neu.snapshot.raster.map((r) => `${r.art}:${r.spalten}`).sort()).toEqual(['grande:10', 'piccolo:21']);

    const exp = await (await s.api('/api/export.geojson', { token: ltgB.token })).json();
    const raster = exp.features.filter((f: { properties: { art: string } }) => f.properties.art === 'fuehrungsraster');
    expect(raster).toHaveLength(2);
    expect(raster[0].geometry.coordinates[0]).toHaveLength(5);

    a.senden({ typ: 'raster.loeschen', art: 'piccolo' });
    expect((await a.warte('fehler')).meldung).toMatch(/Ersteller oder Leitung/);
    ltg.senden({ typ: 'raster.loeschen', art: 'piccolo' });
    expect((await a.warte('raster.geloescht')).art).toBe('piccolo');
    expect((await verbinde(s.url, ltgB.token)).snapshot.raster.map((r) => r.art)).toEqual(['grande']);
  });
});
