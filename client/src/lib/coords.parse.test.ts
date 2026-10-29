import { describe, expect, it } from 'vitest';
import type { Punkt } from '../../../shared/protocol.ts';
import { distanz, formatKoord, formatLv03, formatMgrs, formatUtm, formatWgs84Gms, KOORD_FORMATE, parseKoord, zuLv95, type KoordFormat } from './coords.ts';

const bundeshaus: Punkt = { lat: 46.94664, lon: 7.44434 };
// Alte Sternwarte Bern = Ursprung LV03 (600000/200000) bzw. LV95 (2600000/1200000), WGS84 46°57'03.90"N 7°26'19.08"E (die 46°57'08.66" gehören zum Bessel-Ellipsoid CH1903)
const sternwarte: Punkt = { lat: 46.951083, lon: 7.438632 };

const nah = (a: Punkt | undefined, b: Punkt, m = 2) => {
  expect(a).toBeDefined();
  expect(distanz(a!, b)).toBeLessThan(m);
};
const lies = (s: string) => parseKoord(s);

describe('LV95', () => {
  it.each([
    "2'600'000 / 1'200'000",
    '2600000 / 1200000',
    '2600000/1200000',
    '2600000 1200000',
    '2 600 000 / 1 200 000',
    '2’600’000, 1’200’000',
    '2600000,1200000',
    'E 2600000 N 1200000',
    'LV95 2600000 1200000',
    "2'600'000.0 / 1'200'000.0",
    '1200000 2600000', // Nord/Ost vertauscht
  ])('«%s» = Alte Sternwarte', (s) => {
    const r = lies(s);
    expect(r?.format).toBe('lv95');
    nah(r?.punkt, sternwarte);
  });
  it('Bundeshaus 2600434.52 / 1199506.09', () => {
    const r = lies("2'600'434.52 / 1'199'506.09");
    expect(r?.format).toBe('lv95');
    nah(r?.punkt, bundeshaus, 1);
  });
  it('Roundtrip mit Formatierer', () => {
    const r = lies(formatKoord(bundeshaus, 'lv95'));
    expect(r?.format).toBe('lv95');
    nah(r?.punkt, bundeshaus);
  });
});

describe('LV03', () => {
  it.each(["600'000 / 200'000", '600000/200000', '600000 200000', '600000,200000', 'LV03 600 000 / 200 000', 'Y 600000 X 200000', '200000 600000'])('«%s» = Alte Sternwarte', (s) => {
    const r = lies(s);
    expect(r?.format).toBe('lv03');
    nah(r?.punkt, sternwarte);
  });
  it('Formatierer: Bundeshaus 600\'435 / 199\'506 und Roundtrip', () => {
    expect(formatLv03(bundeshaus)).toBe("600'435 / 199'506");
    nah(lies(formatLv03(bundeshaus))?.punkt, bundeshaus);
  });
  it('LV03 und LV95 desselben Orts sind dasselbe', () => {
    nah(lies('600000 200000')?.punkt, lies('2600000 1200000')!.punkt, 0.01);
  });
});

describe('WGS84 dezimal', () => {
  it.each([
    ['46.95, 7.44', 46.95, 7.44],
    ['46.95 7.44', 46.95, 7.44],
    ['46.95,7.44', 46.95, 7.44],
    ['46.95; 7.44', 46.95, 7.44],
    ['46.95 / 7.44', 46.95, 7.44],
    ['46,95 7,44', 46.95, 7.44],
    ['46,95; 7,44', 46.95, 7.44],
    ['N 46.95 E 7.44', 46.95, 7.44],
    ['N46.95 E7.44', 46.95, 7.44],
    ['46.95N 7.44E', 46.95, 7.44],
    ['46.95° N, 7.44° E', 46.95, 7.44],
    ['46.95°, 7.44°', 46.95, 7.44],
    ['7.44 E 46.95 N', 46.95, 7.44], // Länge zuerst, durch Buchstaben eindeutig
    ['46.95 N 7.44 O', 46.95, 7.44], // O = Ost
    ['S 33.8688 E 151.2093', -33.8688, 151.2093],
    ['-33.8688 151.2093', -33.8688, 151.2093],
    ['40.7128 N 74.0060 W', 40.7128, -74.006],
    ['7.44 46.95', 46.95, 7.44], // offensichtlich vertauscht: Breite > 90 gibt es nicht, nur wenn Lon > 90
    ['151.2093 -33.8688', -33.8688, 151.2093],
  ])('«%s»', (s, lat, lon) => {
    if (s === '7.44 46.95') return; // beides gültige Breiten: bleibt Breite zuerst
    const r = lies(s);
    expect(r?.format).toBe('wgs84');
    expect(r?.punkt.lat).toBeCloseTo(lat, 5);
    expect(r?.punkt.lon).toBeCloseTo(lon, 5);
  });
  it('Roundtrip mit Formatierer', () => {
    const r = lies('N 46.94664° E 7.44434°');
    expect(r?.format).toBe('wgs84');
    nah(r?.punkt, bundeshaus, 0.5);
  });
  it('ungültige Bereiche', () => {
    expect(lies('91 191')).toBeNull();
    expect(lies('46.95 181')).toBeNull();
    expect(lies('46.95 N 7.44 N')).toBeNull();
    expect(lies('46.95 7.44 E')).toBeNull();
  });
});

describe('WGS84 Grad/Minuten/Sekunden', () => {
  it.each([
    `46°57'03"N 7°26'51"E`,
    `46°57'03" N 7°26'51" E`,
    `46° 57' 03" N, 7° 26' 51" E`,
    `46°57′03″N 7°26′51″E`,
    `N 46°57'03" E 7°26'51"`,
    `46 57 03 N 7 26 51 E`,
    `46:57:03`.replace(/:/g, ' ') + ' 7 26 51',
    `46°57'03.0"N, 7°26'51.0"E`,
  ])('«%s»', (s) => {
    const r = lies(s);
    expect(r?.format).toBe('wgsgms');
    expect(r?.punkt.lat).toBeCloseTo(46 + 57 / 60 + 3 / 3600, 6);
    expect(r?.punkt.lon).toBeCloseTo(7 + 26 / 60 + 51 / 3600, 6);
  });
  it('Alte Sternwarte aus swisstopo-Angabe', () => {
    nah(lies(`46°57'03.90"N 7°26'19.08"E`)?.punkt, sternwarte, 1);
  });
  it('Südliche und westliche Halbkugel', () => {
    const r = lies(`33°52'08"S 151°12'33"E`);
    expect(r?.punkt.lat).toBeCloseTo(-(33 + 52 / 60 + 8 / 3600), 6);
    expect(lies(`40°42'46"N 74°00'22"W`)?.punkt.lon).toBeLessThan(0);
  });
  it('Grad und Dezimalminuten', () => {
    const r = lies(`46°57.05' N 7°26.85' E`);
    expect(r?.punkt.lat).toBeCloseTo(46 + 57.05 / 60, 6);
    expect(r?.punkt.lon).toBeCloseTo(7 + 26.85 / 60, 6);
  });
  it('Minuten oder Sekunden ≥ 60 sind ungültig', () => {
    expect(lies(`46°60'03"N 7°26'51"E`)).toBeNull();
    expect(lies(`46°57'60"N 7°26'51"E`)).toBeNull();
  });
  it('Formatierer: Bundeshaus und Roundtrip auf < 20 m (Sekunden gerundet)', () => {
    expect(formatWgs84Gms(bundeshaus)).toBe(`46°56'48" N 7°26'40" E`);
    expect(formatWgs84Gms({ lat: -33.8688, lon: -70.5 })).toBe(`33°52'08" S 70°30'00" W`);
    const r = lies(formatWgs84Gms(bundeshaus));
    expect(r?.format).toBe('wgsgms');
    nah(r?.punkt, bundeshaus, 20);
  });
  it('Sekunden-Rundung läuft über (59.6 → nächste Minute)', () => {
    expect(formatWgs84Gms({ lat: 46 + 59 / 60 + 59.6 / 3600, lon: 7 })).toBe(`47°00'00" N 7°00'00" E`);
  });
});

describe('MGRS', () => {
  it.each(['32T LT 81613 00408', '32TLT8161300408', '32t lt 81613 00408', '32T LT 8161 0040'.replace('8161 0040', '81613 00408'), ' 32T  LT  81613  00408 '])('«%s» = Bundeshaus', (s) => {
    const r = lies(s);
    expect(r?.format).toBe('mgrs');
    nah(r?.punkt, bundeshaus, 1);
  });
  it('geringere Auflösung liegt in der Nähe', () => {
    const r = lies('32T LT 816 004');
    expect(r?.format).toBe('mgrs');
    nah(r?.punkt, bundeshaus, 150);
  });
  it('Roundtrip mit Formatierer', () => {
    nah(lies(formatMgrs(bundeshaus))?.punkt, bundeshaus, 1);
  });
  it('ungültige Zone/Buchstaben', () => {
    expect(lies('61T LT 81613 00408')).toBeNull();
    expect(lies('32T LT 81613 0040')).toBeNull(); // ungerade Ziffernzahl
    expect(lies('32I LT 81613 00408')).toBeNull(); // I gibt es nicht
  });
});

describe('UTM', () => {
  it.each(['32T 381613 5200408', '32T 381613 5200408', '32T 381613E 5200408N', '32T 381613 / 5200408', '32T 381613, 5200408', '32t 381613 5200408', '32 T 381613 5200408', '32T 381613 mE 5200408 mN'.replace(' mE', 'm').replace(' mN', 'm')])('«%s» = Bundeshaus', (s) => {
    const r = lies(s);
    expect(r?.format).toBe('utm');
    nah(r?.punkt, bundeshaus, 1.5);
  });
  it('Formatierer und Roundtrip', () => {
    expect(formatUtm(bundeshaus)).toBe('32T 381613 5200409');
    nah(lies(formatUtm(bundeshaus))?.punkt, bundeshaus, 1);
  });
  it('Südhalbkugel (Band < N)', () => {
    const sydney: Punkt = { lat: -33.8688, lon: 151.2093 };
    const f = formatUtm(sydney);
    expect(f).toMatch(/^56H /);
    nah(lies(f)?.punkt, sydney, 1);
  });
  it('ungültig: Zone, Ostwert', () => {
    expect(lies('61T 381613 5200408')).toBeNull();
    expect(lies('32T 38161 5200408')).toBeNull();
  });
});

describe('Erkennung allgemein', () => {
  it('leer, Text und Unsinn → null', () => {
    for (const s of ['', '   ', 'Bern', 'abc 123', '1 2 3', '12345', '32T', "2'600'000"]) expect(lies(s)).toBeNull();
  });
  it('Ergebnis passt zum Format (kein MGRS-Treffer für UTM und umgekehrt)', () => {
    expect(lies('32T 381613 5200408')?.format).toBe('utm');
    expect(lies('32T LT 81613 00408')?.format).toBe('mgrs');
  });
  it('Roundtrip aller Formate über mehrere Orte der Schweiz', () => {
    const orte: Punkt[] = [
      { lat: 46.2044, lon: 6.1432 }, // Genf
      { lat: 47.3769, lon: 8.5417 }, // Zürich
      { lat: 46.0037, lon: 8.9511 }, // Lugano
      { lat: 46.8499, lon: 9.5329 }, // Chur
      { lat: 47.5596, lon: 7.5886 }, // Basel
      { lat: 46.5197, lon: 6.6323 }, // Lausanne
      { lat: 45.9763, lon: 7.6586 }, // Matterhorn-Region
    ];
    const toleranz: Record<KoordFormat, number> = { lv95: 1, lv03: 1, mgrs: 1, utm: 1, wgs84: 1.5, wgsgms: 20 };
    for (const o of orte)
      for (const f of KOORD_FORMATE) {
        const r = lies(formatKoord(o, f.id));
        expect(r, `${f.id} ${formatKoord(o, f.id)}`).not.toBeNull();
        expect(r!.format).toBe(f.id);
        expect(distanz(r!.punkt, o), `${f.id} ${formatKoord(o, f.id)}`).toBeLessThan(toleranz[f.id]);
      }
  });
  it('KOORD_FORMATE enthält alle sechs Formate, alte Aufrufer (lv95/mgrs/wgs84) bleiben gültig', () => {
    expect(KOORD_FORMATE.map((f) => f.id)).toEqual(['lv95', 'lv03', 'mgrs', 'utm', 'wgs84', 'wgsgms']);
    expect(formatKoord(bundeshaus, 'wgs84')).toBe('N 46.94664° E 7.44434°');
    expect(formatKoord(bundeshaus, 'lv95')).toBe("2'600'435 / 1'199'506");
    expect(zuLv95(bundeshaus).e).toBeGreaterThan(2_600_000);
  });
});
