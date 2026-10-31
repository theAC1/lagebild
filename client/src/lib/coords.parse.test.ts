import { describe, expect, it } from 'vitest';
import type { Punkt } from '../../../shared/protocol.ts';
import { distanz, formatKoord, formatLv03, formatMgrs, formatUtm, formatWgs84Gms, KOORD_FORMATE, parseKoord, type KoordFormat } from './coords.ts';

const bundeshaus: Punkt = { lat: 46.94664, lon: 7.44434 };
// Alte Sternwarte Bern = Ursprung LV03 (600000/200000) bzw. LV95 (2600000/1200000), WGS84 46°57'03.90"N 7°26'19.08"E
const sternwarte: Punkt = { lat: 46.951083, lon: 7.438632 };

/** Alle Schreibweisen ergeben dasselbe Format und liegen näher als `m` Meter am Ziel. */
function alle(eingaben: string[], format: KoordFormat, ziel: Punkt, m = 2) {
  for (const s of eingaben) {
    const r = parseKoord(s);
    expect(r?.format, s).toBe(format);
    expect(distanz(r!.punkt, ziel), s).toBeLessThan(m);
  }
}

describe('parseKoord', () => {
  it('LV95: Apostroph, Leerzeichen, Komma, Präfix E/N, Nord/Ost vertauscht', () => {
    alle(["2'600'000 / 1'200'000", '2600000,1200000', 'E 2600000 N 1200000', "2'600'000.0 / 1'200'000.0", '1200000 2600000'], 'lv95', sternwarte);
    alle(["2'600'434.52 / 1'199'506.09"], 'lv95', bundeshaus, 1);
  });
  it('LV03: erkannt an der Grössenordnung, derselbe Ort wie LV95', () => {
    alle(["600'000 / 200'000", 'LV03 600 000 / 200 000', 'Y 600000 X 200000', '200000 600000'], 'lv03', sternwarte);
    expect(formatLv03(bundeshaus)).toBe("600'435 / 199'506");
    expect(distanz(parseKoord('600000 200000')!.punkt, parseKoord('2600000 1200000')!.punkt)).toBeLessThan(0.01);
  });
  it('WGS84 dezimal: Trennzeichen, Dezimalkomma, Hemisphären-Buchstaben (auch O = Ost), Länge zuerst, negative Werte', () => {
    const faelle: [string, number, number][] = [
      ['46.95, 7.44', 46.95, 7.44],
      ['46,95; 7,44', 46.95, 7.44],
      ['46.95° N, 7.44° E', 46.95, 7.44],
      ['7.44 E 46.95 N', 46.95, 7.44],
      ['46.95 N 7.44 O', 46.95, 7.44],
      ['S 33.8688 E 151.2093', -33.8688, 151.2093],
      ['40.7128 N 74.0060 W', 40.7128, -74.006],
      ['151.2093 -33.8688', -33.8688, 151.2093], // Breite > 90 gibt es nicht: vertauscht
    ];
    for (const [s, lat, lon] of faelle) {
      const r = parseKoord(s);
      expect(r?.format, s).toBe('wgs84');
      expect(r?.punkt.lat, s).toBeCloseTo(lat, 5);
      expect(r?.punkt.lon, s).toBeCloseTo(lon, 5);
    }
    for (const s of ['91 191', '46.95 181', '46.95 N 7.44 N', '46.95 7.44 E']) expect(parseKoord(s), s).toBeNull();
  });
  it('WGS84 Grad/Minuten/Sekunden: Zeichenvarianten, Dezimalminuten, Süd/West; Minuten/Sekunden ≥ 60 ungültig', () => {
    alle([`46°57'03.90"N 7°26'19.08"E`, `46° 57' 03.90" N, 7° 26' 19.08" E`, `46°57′03.90″N 7°26′19.08″E`, `46 57 03.90 N 7 26 19.08 E`], 'wgsgms', sternwarte, 1);
    const dm = parseKoord(`46°57.05' N 7°26.85' E`);
    expect(dm?.punkt.lat).toBeCloseTo(46 + 57.05 / 60, 6);
    expect(dm?.punkt.lon).toBeCloseTo(7 + 26.85 / 60, 6);
    expect(parseKoord(`33°52'08"S 151°12'33"E`)?.punkt.lat).toBeCloseTo(-(33 + 52 / 60 + 8 / 3600), 6);
    expect(parseKoord(`40°42'46"N 74°00'22"W`)?.punkt.lon).toBeLessThan(0);
    expect(parseKoord(`46°60'03"N 7°26'51"E`)).toBeNull();
    expect(parseKoord(`46°57'60"N 7°26'51"E`)).toBeNull();
    // Formatierer rundet Sekunden; 59.6 s läuft in die nächste Minute über
    expect(formatWgs84Gms(bundeshaus)).toBe(`46°56'48" N 7°26'40" E`);
    expect(formatWgs84Gms({ lat: 46 + 59 / 60 + 59.6 / 3600, lon: 7 })).toBe(`47°00'00" N 7°00'00" E`);
  });
  it('MGRS: mit/ohne Leerzeichen, Kleinschreibung, geringere Auflösung; ungültige Zone/Buchstaben/ungerade Ziffern', () => {
    alle(['32T LT 81613 00408', '32tlt8161300408', ' 32T  LT  81613  00408 '], 'mgrs', bundeshaus, 1);
    alle(['32T LT 816 004'], 'mgrs', bundeshaus, 150);
    for (const s of ['61T LT 81613 00408', '32T LT 81613 0040', '32I LT 81613 00408']) expect(parseKoord(s), s).toBeNull();
  });
  it('UTM: Varianten, Südhalbkugel; nicht mit MGRS verwechselt; ungültige Zone/Ostwert', () => {
    alle(['32T 381613 5200408', '32T 381613E 5200408N', '32 T 381613 / 5200408', '32t 381613m 5200408m'], 'utm', bundeshaus, 1.5);
    expect(formatUtm(bundeshaus)).toBe('32T 381613 5200409');
    const sydney: Punkt = { lat: -33.8688, lon: 151.2093 };
    expect(formatUtm(sydney)).toMatch(/^56H /);
    alle([formatUtm(sydney)], 'utm', sydney, 1);
    expect(parseKoord('32T LT 81613 00408')?.format).toBe('mgrs');
    for (const s of ['61T 381613 5200408', '32T 38161 5200408']) expect(parseKoord(s), s).toBeNull();
  });
  it('leer, Text und Unsinn → null; Roundtrip aller Formate über mehrere Orte der Schweiz', () => {
    for (const s of ['', '   ', 'Bern', 'abc 123', '1 2 3', '12345', '32T', "2'600'000"]) expect(parseKoord(s), s).toBeNull();
    const orte: Punkt[] = [
      { lat: 46.2044, lon: 6.1432 }, // Genf
      { lat: 47.3769, lon: 8.5417 }, // Zürich
      { lat: 46.0037, lon: 8.9511 }, // Lugano
      { lat: 46.8499, lon: 9.5329 }, // Chur
      { lat: 45.9763, lon: 7.6586 }, // Matterhorn-Region
    ];
    const toleranz: Record<KoordFormat, number> = { lv95: 1, lv03: 1, mgrs: 1, utm: 1, wgs84: 1.5, wgsgms: 20 };
    expect(KOORD_FORMATE).toHaveLength(6);
    for (const o of orte)
      for (const f of KOORD_FORMATE) {
        const s = formatKoord(o, f.id);
        const r = parseKoord(s);
        expect(r?.format, `${f.id} ${s}`).toBe(f.id);
        expect(distanz(r!.punkt, o), `${f.id} ${s}`).toBeLessThan(toleranz[f.id]);
      }
    expect(distanz(parseKoord(formatMgrs(bundeshaus))!.punkt, bundeshaus)).toBeLessThan(1);
  });
});
