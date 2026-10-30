import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RasterDef, rasterId, type RasterDef as RDef } from '../../shared/protocol.ts';
import { testServer, verbinde } from './helfer.ts';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => (s = await testServer()));
afterAll(() => s.ende());

const GRANDE: RDef = { art: 'grande', e: 2_600_000, n: 1_200_600, zeilen: 15, spalten: 21, zellM: 80 };

async function szenario() {
  const l = await s.lage();
  const ltgB = await s.beitreten(l.leitungCode, 'Leitung', 'Stab');
  const aB = await s.beitreten(l.teilnehmerCode, 'Adler');
  const bB = await s.beitreten(l.teilnehmerCode, 'Bär');
  return { lageId: ltgB.lageId, ltg: await verbinde(s.url, ltgB.token), a: await verbinde(s.url, aB.token), b: await verbinde(s.url, bB.token), aId: aB.teilnehmerId, ltgB };
}
const fehler = async (c: Awaited<ReturnType<typeof verbinde>>) => (await c.warte('fehler')).meldung;

describe('Vertrag: RasterDef', () => {
  const ok = (r: Partial<RDef>) => RasterDef.safeParse({ ...GRANDE, ...r }).success;
  it('Zeilen bis 26, Spalten bis 99, Ausdehnung ≤ 100 km, Schweiz', () => {
    expect(ok({})).toBe(true);
    expect(ok({ zeilen: 26 })).toBe(true);
    expect(ok({ zeilen: 27 })).toBe(false);
    expect(ok({ spalten: 99, zellM: 1000 })).toBe(true);
    expect(ok({ spalten: 99, zellM: 1100 })).toBe(false);
    expect(ok({ zeilen: 1.5 })).toBe(false);
    expect(ok({ e: 600_000 })).toBe(false); // LV03 statt LV95
  });
});

describe('Führungsraster: Rechte und Ablauf', () => {
  it('Teilnehmende erstellt und fixiert; danach nur noch die Leitung löst und ändert', async () => {
    const { lageId, ltg, a, b } = await szenario();
    a.senden({ typ: 'raster.setzen', raster: GRANDE });
    const neu = await b.warte('raster');
    expect(neu.raster).toMatchObject({ ...GRANDE, id: rasterId(lageId, 'grande'), fixiert: false });

    // nicht fixiert: andere Teilnehmende dürfen nicht, Ersteller schon
    b.senden({ typ: 'raster.setzen', raster: { ...GRANDE, e: GRANDE.e + 100 } });
    expect(await fehler(b)).toMatch(/Ersteller oder Leitung/);
    b.senden({ typ: 'raster.fixieren', art: 'grande', fixiert: true });
    expect(await fehler(b)).toMatch(/Ersteller oder Leitung/);
    a.senden({ typ: 'raster.setzen', raster: { ...GRANDE, e: GRANDE.e + 100 } });
    expect((await ltg.warte('raster', (m) => m.raster.e === GRANDE.e + 100)).raster.von).toBe(neu.raster.von);

    a.senden({ typ: 'raster.fixieren', art: 'grande', fixiert: true });
    expect((await ltg.warte('raster', (m) => m.raster.fixiert)).raster.fixiert).toBe(true);

    // fixiert: Ersteller kann nicht mehr verschieben, lösen oder löschen
    a.senden({ typ: 'raster.setzen', raster: GRANDE });
    expect(await fehler(a)).toMatch(/fixiert/);
    a.senden({ typ: 'raster.fixieren', art: 'grande', fixiert: false });
    expect(await fehler(a)).toMatch(/Nur die Leitung/);
    a.senden({ typ: 'raster.loeschen', art: 'grande' });
    expect(await fehler(a)).toMatch(/Nur die Leitung/);
    // auch die Leitung ändert erst nach dem Lösen
    ltg.senden({ typ: 'raster.setzen', raster: GRANDE });
    expect(await fehler(ltg)).toMatch(/fixiert/);
    ltg.senden({ typ: 'raster.fixieren', art: 'grande', fixiert: false });
    expect((await a.warte('raster', (m) => !m.raster.fixiert)).raster.fixiert).toBe(false);
    ltg.senden({ typ: 'raster.setzen', raster: { ...GRANDE, zeilen: 26 } });
    expect((await a.warte('raster', (m) => m.raster.zeilen === 26)).raster.e).toBe(GRANDE.e);
  });

  it('je Art ein Raster, Grande und Piccolo nebeneinander; Snapshot, Löschen, Export', async () => {
    const { ltg, a, ltgB } = await szenario();
    const piccolo: RDef = { ...GRANDE, art: 'piccolo', zellM: 10 };
    ltg.senden({ typ: 'raster.setzen', raster: GRANDE });
    ltg.senden({ typ: 'raster.setzen', raster: piccolo });
    await a.warte('raster', (m) => m.raster.art === 'piccolo');
    ltg.senden({ typ: 'raster.setzen', raster: { ...GRANDE, spalten: 10 } }); // ersetzt, kein zweites Grande
    await a.warte('raster', (m) => m.raster.spalten === 10);
    const neu = await verbinde(s.url, ltgB.token);
    expect(neu.snapshot.typ === 'snapshot' && neu.snapshot.raster.map((r) => `${r.art}:${r.spalten}`).sort()).toEqual(['grande:10', 'piccolo:21']);

    const exp = await (await s.api('/api/export.geojson', { token: ltgB.token })).json();
    const raster = exp.features.filter((f: { properties: { art: string } }) => f.properties.art === 'fuehrungsraster');
    expect(raster).toHaveLength(2);
    expect(raster[0].geometry.coordinates[0]).toHaveLength(5);

    a.senden({ typ: 'raster.loeschen', art: 'piccolo' });
    expect(await fehler(a)).toMatch(/Ersteller oder Leitung/);
    ltg.senden({ typ: 'raster.loeschen', art: 'piccolo' });
    expect((await a.warte('raster.geloescht')).art).toBe('piccolo');
    a.senden({ typ: 'raster.fixieren', art: 'piccolo', fixiert: true });
    expect(await fehler(a)).toMatch(/nicht gefunden/);
  });
});
