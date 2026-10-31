import { describe, expect, it } from 'vitest';
import { STANDARD_TAUFNAMEN, type TaufGeometrie } from '../../../../shared/protocol.ts';
import { familieVon, freieNamen, listeAusText, waehleTreffer } from './familien.ts';
import { fassadeAus, fassadenFarben, fassadeVonKante, kanten } from './fassaden.ts';

describe('Familie aus Layer und Klasse', () => {
  it('Vektorkachel-Layer → Familie; Wald/Flächen nicht antippbar (31.10.: nur zeichnen), Gebäude vor Strasse, Fussweg zählt nicht', () => {
    const faelle: [string, Record<string, string>, string | null][] = [
      ['building', { class: 'roof' }, 'gebaeude'],
      ['building', { class: 'underground' }, null],
      ['transportation', { class: 'track' }, 'strasse'],
      ['transportation', { class: 'path', subclass: 'footway' }, null],
      ['transportation', { class: 'rail' }, null],
      ['waterway', { class: 'stream' }, 'gewaesser'],
      ['water', { class: 'pool' }, null],
      ['landcover', { class: 'wood', subclass: 'forest' }, null],
      ['landuse', { class: 'residential' }, null],
      ['place', { class: 'neighbourhood' }, null],
    ];
    for (const [layer, props, erwartet] of faelle) expect(familieVon(layer, props), `${layer}/${props.class}`).toBe(erwartet);
    const t = (sourceLayer: string, c: string) => ({ sourceLayer, properties: { class: c } });
    expect(waehleTreffer([t('transportation', 'minor'), t('building', 'roof')])?.familie).toBe('gebaeude');
    expect(waehleTreffer([t('landcover', 'wood'), t('transportation', 'path'), t('transportation', 'track')])?.k).toEqual(t('transportation', 'track'));
    expect(waehleTreffer([t('landcover', 'wood'), t('waterway', 'stream')])?.familie).toBe('gewaesser');
    expect(waehleTreffer([t('transportation', 'path')])).toBeNull();
  });
});

describe('Namenslisten', () => {
  it('freie Namen in Listenreihenfolge, vergeben ohne Gross-/Kleinschreibung, eigene Taufe zählt nicht; Liste aus Text', () => {
    const taufen = [{ id: 'a', name: 'gold' }, { id: 'b', name: 'Fluor' }];
    const frei = freieNamen(null, 'gebaeude', taufen);
    expect(frei[0]).toBe('Copper');
    expect(frei).not.toContain('Gold');
    expect(frei).toHaveLength(STANDARD_TAUFNAMEN.gebaeude.length - 2);
    expect(freieNamen(null, 'gebaeude', taufen, 'a')[0]).toBe('Gold');
    expect(freieNamen({ taufListen: { gebaeude: ['Gold', 'Kryptonit'] } }, 'gebaeude', taufen)).toEqual(['Kryptonit']);
    expect(freieNamen({ taufListen: { gebaeude: ['Kryptonit'] } }, 'strasse', [])).toEqual(STANDARD_TAUFNAMEN.strasse);
    expect(listeAusText('Gold\n  Queck   Silver ,gold\n\nIron')).toEqual(['Gold', 'Queck Silver', 'Iron']);
  });
});

// Quadratisches Gebäude ~ 70 × 70 m bei Bern; Kanten in Reihenfolge: Süd, Ost, Nord, West (gegen den Uhrzeigersinn)
const ccw: [number, number][] = [[7.44, 46.94], [7.441, 46.94], [7.441, 46.9407], [7.44, 46.9407], [7.44, 46.94]];
const quadrat = (ring = ccw): TaufGeometrie => ({ type: 'Polygon', coordinates: [ring] });

describe('Fassaden aus der Stossrichtung', () => {
  it('Normalen zeigen nach aussen (unabhängig von der Laufrichtung); Farben je Stoss: Zutritt weiss, Stossseite schwarz, links rot, rechts grün', () => {
    expect(kanten(quadrat()).map((k) => Math.round(k.normale))).toEqual([180, 90, 0, 270]);
    expect(kanten(quadrat([...ccw].reverse())).map((k) => Math.round(k.normale))).toEqual([270, 0, 90, 180]);
    expect(fassadenFarben({ geometrie: quadrat(), stoss: 0, fassaden: [] }).map((f) => f.farbe)).toEqual(['weiss', 'gruen', 'schwarz', 'rot']);
    expect(fassadenFarben({ geometrie: quadrat(), stoss: 90, fassaden: [] }).map((f) => f.farbe)).toEqual(['gruen', 'schwarz', 'rot', 'weiss']);
    expect(fassadeAus(180, 0)).toBe('weiss');
    expect(fassadeAus(10, 350)).toBe('schwarz'); // über 360°
    expect(fassadeAus(300, 0)).toBe('rot');
    expect(fassadeAus(60, 0)).toBe('gruen');
    expect(fassadeAus(45, 0)).toBe('schwarz'); // Grenze
  });
  it('umgefärbte Fassade übersteuert, ohne Stossrichtung oder bei Linien keine; Fassade aus mehreren Kanten wird gemeinsam umgefärbt', () => {
    expect(fassadenFarben({ geometrie: quadrat(), stoss: 0, fassaden: [[1, 'weiss']] }).map((f) => f.farbe)).toEqual(['weiss', 'weiss', 'schwarz', 'rot']);
    expect(fassadenFarben({ geometrie: quadrat(), stoss: null, fassaden: [[1, 'weiss']] })).toEqual([]);
    expect(fassadenFarben({ geometrie: { type: 'LineString', coordinates: [[7, 46], [7.1, 46]] }, stoss: 0, fassaden: [] })).toEqual([]);
    // Südseite in zwei Kanten geteilt (leicht geknickt): Kanten 0 und 1 bilden die weisse Fassade
    const ring: [number, number][] = [[7.44, 46.94], [7.4405, 46.93998], [7.441, 46.94], [7.441, 46.9407], [7.44, 46.9407], [7.44, 46.94]];
    expect(fassadeVonKante({ geometrie: quadrat(ring), stoss: 0 }, 1)).toEqual([0, 1]);
    expect(fassadeVonKante({ geometrie: quadrat(ring), stoss: 0 }, 3)).toEqual([3]);
  });
});
