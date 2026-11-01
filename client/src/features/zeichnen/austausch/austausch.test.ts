// MilX/KML-Import und -Export (Spec v8). Fixtures erfunden (Namen, Orte bei Bern); nur die Struktur folgt echten Dateien.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { STANDARD_STIL, type Punkt, type Zeichnung } from '../../../../../shared/protocol.ts';
import { distanz, vonLv03 } from '../../../lib/coords.ts';
import { grenzNamen } from '../darstellung.ts';
import { leseKml, schreibeKml } from './kml.ts';
import { ebeneAus, FARBE_ZUSATZ, leseMilx, ohneMilxCode, schreibeMilx, type DateiEbene, type Teil } from './milx.ts';
import { crc32, entpackeEine, packe } from './zip.ts';

Object.assign(globalThis, { DOMParser, XMLSerializer }); // im Browser eingebaut

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const grafik = (symbol: string, pts: [number, number][]) =>
  `<MilXGraphic><MssStringXML>${esc(symbol)}</MssStringXML><PointList>${pts.map(([x, y]) => `<Point><X>${x}</X><Y>${y}</Y></Point>`).join('')}</PointList></MilXGraphic>`;
const layer = (name: string, gs: string[], sys = 'SwissLv03') =>
  `<MilXLayer><Name>${name}</Name><LayerType>Normal</LayerType><GraphicList>${gs.join('')}</GraphicList><CoordSystemType>${sys}</CoordSystemType><SymbolSize>33</SymbolSize></MilXLayer>`;
const dok = (...ls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\r\n<MilXDocument_Layer xmlns="http://gs-soft.com/MilX/V3.1">${ls.join('')}</MilXDocument_Layer>`;

const PL = '<Symbol ID="GFGPGLP--------"><Attribute ID="T">ALPHA</Attribute></Symbol>';
const GRENZE = '<Symbol ID="GFGPGLB----D---"><Attribute ID="T">LINKS</Attribute><Attribute ID="T1">RECHTS</Attribute></Symbol>';
const FLAECHE = '<Symbol ID="G.9.AP---------"><Attribute ID="XM"><Line Width="20" Color="$00000000"/><Fill Color="$9640A0C0" Transparency="59"/></Attribute></Symbol>';
const linie: [number, number][] = [[600100, 199900], [600500, 199950], [600900, 199800]];
const ring: [number, number][] = [[600200, 199500], [600600, 199500], [600600, 199200], [600200, 199200]];
const MILX = dok(
  layer('Planung', [
    grafik(PL, linie.slice(0, 2)),
    grafik('<Symbol ID="GHGPGLP--------"><Attribute ID="T">ROT</Attribute></Symbol>', linie),
    grafik('<Symbol ID="GFGPGAA--------"><Attribute ID="T">BRAVO</Attribute></Symbol>', ring),
    grafik('<Symbol ID="GFGPGL---------"><Attribute ID="XE">9SCHTXYZ-------</Attribute></Symbol>', linie),
    grafik('<Symbol ID="GF8P-----------"><Attribute ID="T">OST</Attribute><Attribute ID="XE">9SCHTQQ--------</Attribute></Symbol>', ring),
    grafik('<Symbol ID="SFGPUCI--------"><Attribute ID="T">KP</Attribute></Symbol>', [linie[0]]),
    grafik(PL, [linie[0]]),
  ]),
  layer('Abschnitte', [grafik(GRENZE, linie), grafik(FLAECHE, [...ring, ring[0]])]),
  layer('Fremd', [grafik(PL, linie)], 'Wgs84'),
);

const kurz = (t: Teil) => ({ art: t.art, raumArt: t.raumArt, bezeichnung: t.bezeichnung, farbe: t.stil.farbe, stufe: t.stufe, n: t.punkte.length });
const alsZeichnungen = (e: DateiEbene): Zeichnung[] => e.zeichnungen.map((t, i) => ({ ...t, ebeneId: 'e', id: `z${i}`, von: 'a', erstelltAm: 0, geaendertAm: 0 }));
/** Gleiche Zeichnungen: alles gleich, Punkte auf 1 cm. */
function gleich(a: Teil[], b: Teil[]) {
  const ohne = ({ punkte: _, ...r }: Teil) => r;
  expect(b.map(ohne)).toEqual(a.map(ohne));
  a.forEach((z, i) => z.punkte.forEach((p: Punkt, k: number) => expect(distanz(p, b[i].punkte[k]), `${z.art} ${k}`).toBeLessThan(0.01)));
}

describe('MilX lesen', () => {
  it('Zeichen → Arten, Namen, Farben und LV03; Zusatzzeichen mit Kürzel; Nicht abbildbares benannt; nur LV03; keine DTD', () => {
    const [planung, abschnitte, fremd] = leseMilx(MILX);
    expect(planung.name).toBe('Planung');
    expect(planung.zeichnungen.map(kurz)).toEqual([
      { art: 'phasenlinie', bezeichnung: 'ALPHA', farbe: '#1565c0', n: 2 },
      { art: 'phasenlinie', bezeichnung: 'ROT', farbe: '#d32f2f', n: 3 },
      { art: 'raum', raumArt: 'bereitstellung', bezeichnung: 'BRAVO', farbe: '#1565c0', n: 4 },
      { art: 'linie', bezeichnung: 'XYZ', farbe: FARBE_ZUSATZ, n: 3 },
      { art: 'flaeche', bezeichnung: 'OST', farbe: FARBE_ZUSATZ, n: 4 },
    ]);
    expect(planung.zeichnungen[0]).toMatchObject({ milx: PL, punkte: linie.slice(0, 2).map(([x, y]) => vonLv03(x, y)) });
    expect(planung.nicht).toEqual(['SFGPUCI-------- «KP»', 'Phasenlinie «ALPHA» mit 1 Punkt(en)']);
    // Grenze: zwei Namen und Stufe D; Fläche: $AABBGGRR rückwärts, Transparenz 59 %, ohne Umriss, Schlusspunkt weg
    expect(abschnitte.zeichnungen.map(kurz)).toEqual([
      { art: 'grenze', bezeichnung: 'LINKS | RECHTS', farbe: '#1565c0', stufe: 'D', n: 3 },
      { art: 'flaeche', bezeichnung: '', farbe: '#c0a040', n: 4 },
    ]);
    expect(abschnitte.zeichnungen[1].stil).toEqual({ farbe: '#c0a040', breite: 1, strich: 'keiner', deckkraft: 0.41, fuellung: '#c0a040' });
    expect(fremd).toMatchObject({ zeichnungen: [], nicht: ['Koordinatensystem «Wgs84» nicht unterstützt'] });
    expect(() => leseMilx(`<!DOCTYPE x [<!ENTITY a "b">]>${MILX.slice(MILX.indexOf('<MilX'))}`)).toThrow('DTD');
    // Grenze nur mit T1: der Name bleibt rechts, auch nachdem der Vertrag die Bezeichnung trimmt
    const [nurRechts] = leseMilx(dok(layer('x', [grafik('<Symbol ID="GFGPGLB--------"><Attribute ID="T1">RECHTS</Attribute></Symbol>', linie)])))[0].zeichnungen;
    expect(grenzNamen(nurRechts.bezeichnung.trim())).toEqual(['', 'RECHTS']);
  });
});

describe('KML lesen', () => {
  const kml = (pms: string) => `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${pms}</Document></kml>`;
  const coords = (ps: [number, number][]) => ps.map(([x, y]) => vonLv03(x, y)).map((p) => `${p.lon},${p.lat}`).join(' ');
  it('dieselbe Fläche wie im MilX (rgba = $AABBGGRR), MILSYM über App6aXmlTxt, Name aus dem Dateinamen, KML-Farbe aabbggrr', () => {
    const datei = kml(
      `<Placemark><ExtendedData><Data name="App6aXmlTxt"><value><![CDATA[${GRENZE}]]></value></Data><Data name="FeatureTypeCode"><value>MILSYM</value></Data></ExtendedData><LineString><coordinates>${coords(linie)}</coordinates></LineString></Placemark>` +
        `<Placemark><ExtendedData><Data name="CanvasFillColorCode"><value>rgba(192, 160, 64, 0.41)</value></Data><Data name="ColorCode"><value>rgba(0, 0, 0, 1)</value></Data><Data name="FeatureTypeCode"><value>DRWING</value></Data><Data name="WidthQty"><value>1</value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords([...ring, ring[0]])}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>` +
        `<Placemark><name>Linie Rot</name><Style><LineStyle><color>ff2f2fd3</color><width>4</width></LineStyle></Style><LineString><coordinates>${coords(linie)}</coordinates></LineString></Placemark>`,
    );
    const e = leseKml(datei, 'Abschnitte Test.kml');
    expect(e.name).toBe('Abschnitte Test');
    const [, abschnitte] = leseMilx(MILX);
    gleich(abschnitte.zeichnungen.map(({ milx: _, ...t }) => t).slice(1), e.zeichnungen.slice(1, 2));
    gleich(abschnitte.zeichnungen.slice(0, 1), e.zeichnungen.slice(0, 1));
    expect(e.zeichnungen[2]).toMatchObject({ art: 'linie', bezeichnung: 'Linie Rot', stil: { farbe: '#d32f2f', breite: 4 } });
  });

  it('zu viele Punkte werden vereinfacht; Koordinaten ausserhalb, Text mit 2 und Linien über 50 000 Punkten nicht abbildbar; Point nimmt das erste Tupel', () => {
    const zickzack = Array.from({ length: 2500 }, (_, i): [number, number] => [600000 + i * 2, 199000 + (i % 2) * 0.1]);
    const e = leseKml(
      kml(`<Placemark><LineString><coordinates>${coords(zickzack)}</coordinates></LineString></Placemark><Placemark><Point><coordinates>200,10</coordinates></Point><name>X</name></Placemark><Placemark><Point><coordinates>${coords(linie.slice(0, 2))}</coordinates></Point><name>Y</name></Placemark>`),
      'a.kml',
    );
    expect(e.vereinfacht).toBe(1);
    expect(e.zeichnungen[0].punkte.length).toBeLessThanOrEqual(500);
    expect(e.zeichnungen[1]).toMatchObject({ art: 'text', text: 'Y', punkte: [vonLv03(...linie[0])] });
    expect(e.nicht).toHaveLength(1);
    // Text mit zwei Punkten liess Douglas-Peucker endlos laufen (vereinfache() behält zwei Punkte immer)
    const teil = (art: Teil['art'], n: number): Teil => ({ art, punkte: Array.from({ length: n }, (_, i) => vonLv03(600000 + i, 199000 + (i % 2))), text: 'T', bezeichnung: '', stil: STANDARD_STIL });
    expect(ebeneAus('x', [teil('text', 2), teil('linie', 50_001), teil('linie', 50_000)])).toMatchObject({ nicht: ['Text mit 2 Punkt(en)', 'Linie mit 50001 Punkt(en)'], vereinfacht: 1 });
  });
});

describe('Export', () => {
  it('Rundreise MilX und KML: dieselben Zeichnungen; geänderte Namen/Stufe gehen in den Code, Rest unverändert', () => {
    const [planung, abschnitte] = leseMilx(MILX);
    const ebenen = [planung, abschnitte].map((e) => ({ name: e.name, zeichnungen: alsZeichnungen(e) }));
    const zurueck = leseMilx(schreibeMilx(ebenen));
    expect(zurueck.map((e) => e.name)).toEqual(['Planung', 'Abschnitte']);
    gleich(planung.zeichnungen, zurueck[0].zeichnungen);
    gleich(abschnitte.zeichnungen, zurueck[1].zeichnungen);
    for (const e of [planung, abschnitte]) gleich(e.zeichnungen, leseKml(schreibeKml({ name: e.name, zeichnungen: alsZeichnungen(e) }), `${e.name}.kml`).zeichnungen);

    const [grenze0, flaeche] = alsZeichnungen(abschnitte);
    const grenze = { ...grenze0, bezeichnung: 'NEU | RECHTS', stufe: 'E' as const };
    // Export baut die Symbol-XML aus der Whitelist neu: Kommentar, PI, fremde Elemente und Attribute fallen weg; Steuerzeichen auch
    const fremd = { ...flaeche, milx: FLAECHE.replace('---">', '---" x="1"><!--k--><?p q?><Fremd>t</Fremd>').replace('/><Fill', ' Dash="1"/><Fill') };
    const dateien = [schreibeMilx([{ name: 'x\u0001', zeichnungen: [grenze, fremd] }]), schreibeKml({ name: 'x', zeichnungen: [{ ...fremd, bezeichnung: 'a\u0007b' }] })];
    for (const d of dateien) expect(d).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
    const [neu, sauber] = leseMilx(dateien[0])[0].zeichnungen;
    expect(neu).toMatchObject({ bezeichnung: 'NEU | RECHTS', stufe: 'E', milx: '<Symbol ID="GFGPGLB----E---"><Attribute ID="T">NEU</Attribute><Attribute ID="T1">RECHTS</Attribute></Symbol>' });
    expect(sauber.milx).toBe(FLAECHE);
  });

  it('eigene Zeichnungen: Code für Phasenlinie, Grenze, Bereitstellungsraum, Fläche; ohne Code fehlt im MilX', () => {
    const p = linie.map(([x, y]) => vonLv03(x, y));
    const basis = { ebeneId: 'e', von: 'a', erstelltAm: 0, geaendertAm: 0, text: '', stil: { farbe: '#1565c0', breite: 3, strich: 'voll' as const, deckkraft: 0.25 } };
    const eigene: Zeichnung[] = [
      { ...basis, id: '1', art: 'phasenlinie', punkte: p, bezeichnung: 'A' },
      { ...basis, id: '2', art: 'grenze', punkte: p, bezeichnung: 'L | R', stufe: 'C' },
      { ...basis, id: '3', art: 'raum', raumArt: 'bereitstellung', punkte: p, bezeichnung: 'B' },
      { ...basis, id: '4', art: 'flaeche', punkte: p, bezeichnung: '', stil: { ...basis.stil, fuellung: '#2e7d32', deckkraft: 0.4 } },
      { ...basis, id: '5', art: 'pfeil', punkte: p, bezeichnung: '' },
    ];
    expect(ohneMilxCode(eigene).map((z) => z.art)).toEqual(['pfeil']);
    const [e] = leseMilx(schreibeMilx([{ name: 'Eigene', zeichnungen: eigene }]));
    expect(e.zeichnungen.map(kurz)).toEqual([
      { art: 'phasenlinie', bezeichnung: 'A', farbe: '#1565c0', n: 3 },
      { art: 'grenze', bezeichnung: 'L | R', farbe: '#1565c0', stufe: 'C', n: 3 },
      { art: 'raum', raumArt: 'bereitstellung', bezeichnung: 'B', farbe: '#1565c0', n: 3 },
      { art: 'flaeche', bezeichnung: '', farbe: '#1565c0', n: 3 },
    ]);
    expect(e.zeichnungen[3].stil).toMatchObject({ fuellung: '#2e7d32', deckkraft: 0.4, breite: 3, strich: 'voll' });
  });

  it('ZIP: packt und entpackt (CRC-32 nach Norm), Bombe über der Grenze bricht ab', async () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const daten = new TextEncoder().encode('<a/>'.repeat(5000));
    const zip = await packe([{ name: 'x.kml', daten: new Uint8Array([1]) }, { name: 'Layer.milxly', daten }]);
    expect(await entpackeEine(zip, '.milxly', daten.length)).toEqual(daten);
    await expect(entpackeEine(zip, '.milxly', daten.length - 1)).rejects.toThrow('zu gross');
    const kaputt = await packe([{ name: 'Layer.milxly', daten }]);
    kaputt[30 + 'Layer.milxly'.length] = 0xff; // Deflate-Block mit ungültigem Typ
    await expect(entpackeEine(kaputt, '.milxly', 1e6)).rejects.toThrow('Datei beschädigt oder kein gültiges ZIP');
  });
});
