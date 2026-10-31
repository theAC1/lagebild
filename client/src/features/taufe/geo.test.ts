import { describe, expect, it } from 'vitest';
import { abschnitt, alsGeometrie, ausWelt, haengeAn, linienAufKachel, schneideLinie, schneideRing, vereineFlaeche, zuWelt, type Flaeche, type Ring, type XY } from './geo.ts';

const K0 = { x: 0, y: 0, z: 14 };
const K1 = { x: 1, y: 0, z: 14 }; // rechts daneben: Grenze bei x = 4096
const rechteck = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const bbox = (r: XY[]) => [Math.min(...r.map((p) => p[0])), Math.min(...r.map((p) => p[1])), Math.max(...r.map((p) => p[0])), Math.max(...r.map((p) => p[1]))];

describe('Zuschneiden und Ausgabe', () => {
  it('Linie endet genau auf der Kachelkante, raus und rein gibt zwei Stücke; Ring auf die Box geschnitten', () => {
    expect(schneideLinie([[1000, 2000], [4200, 2000]], [0, 0, 4096, 4096])).toEqual([[[1000, 2000], [4096, 2000]]]);
    expect(schneideLinie([[5000, 2000], [6000, 2000]], [0, 0, 4096, 4096])).toEqual([]);
    expect(schneideLinie([[1000, 100], [1000, -100], [2000, -100], [2000, 100]], [0, 0, 4096, 4096])).toEqual([[[1000, 100], [1000, 0]], [[2000, 0], [2000, 100]]]);
    expect(bbox(schneideRing(rechteck(4000, 1000, 4200, 1100), [0, 0, 4096, 4096])!)).toEqual([4000, 1000, 4096, 1100]);
    expect(schneideRing(rechteck(5000, 1000, 5200, 1100), [0, 0, 4096, 4096])).toBeNull();
  });
  it('Ausgabe: Weltkoordinaten hin und zurück; vereinfacht bis zur Punktgrenze; Linie, Polygon, MultiLineString', () => {
    const [lon, lat] = ausWelt(zuWelt([7.4442, 46.9466]));
    expect(lon).toBeCloseTo(7.4442, 7);
    expect(lat).toBeCloseTo(46.9466, 7);
    const [x0, y0] = zuWelt([7.44, 46.94]);
    const zick: XY[] = Array.from({ length: 1000 }, (_, i) => [x0 + i, y0 + (i % 2) * 0.3]);
    const g = alsGeometrie({ linien: [zick] }, 100);
    expect(g.type).toBe('LineString');
    expect((g.coordinates as number[][]).length).toBeLessThanOrEqual(100);
    expect(alsGeometrie({ polygone: [[rechteck(x0, y0, x0 + 10, y0 + 10)]] }, 100).type).toBe('Polygon');
    expect(alsGeometrie({ linien: [zick.slice(0, 2), zick.slice(5, 7)] }, 100).type).toBe('MultiLineString');
  });
});

describe('Strasse: Abschnitt bis zur Kreuzung', () => {
  // Hauptstrasse y=2000 über die Kachelgrenze, Stücke mit Puffer (wie in der Vektorkachel); Querstrasse bei x=6000
  const netz = [
    ...linienAufKachel([[[1000, 2000], [2500, 2000], [4200, 2000]]], K0),
    ...linienAufKachel([[[3990, 2000], [6000, 2000], [7000, 2000]], [[6000, 1000], [6000, 2000], [6000, 3000]]], K1),
    ...linienAufKachel([[[2500, 2000], [2500, 3000]]], K0), // Abzweiger: Kreuzung bei x=2500
  ];
  it('läuft über die Kachelnaht und hält an der nächsten Kreuzung; vom Ende bis zur ersten Kreuzung; nichts in Reichweite → null', () => {
    const l = abschnitt(netz, [3000, 2010])!;
    expect(l[0]).toEqual([2500, 2000]);
    expect(l.at(-1)).toEqual([6000, 2000]);
    expect(l).toContainEqual([4096, 2000]);
    expect(abschnitt(netz, [1500, 1990])).toEqual([[1000, 2000], [2500, 2000]]);
    expect(abschnitt(netz, [6500, 2000])).toEqual([[6000, 2000], [7000, 2000]]);
    expect(abschnitt(netz, [3000, 3500], 50)).toBeNull();
    expect(abschnitt([rechteck(100, 100, 300, 300)], [200, 100])!.length).toBeGreaterThanOrEqual(4); // geschlossene Schlaufe endet
    // ohne Zuschnitt erzeugt der Kachelpuffer eine falsche Kreuzung (deshalb wird geschnitten)
    const roh: XY[][] = [[[1000, 2000], [2500, 2000], [4200, 2000]], [[3990, 2000], [6000, 2000], [7000, 2000]]];
    expect(abschnitt(roh, [3000, 2000])!.at(-1)).not.toEqual([6000, 2000]);
  });
  it('verlängern: anschliessend verbindet (beide Richtungen), getrennt wird weiterer Teil, enthalten nicht doppelt, Lücke schliesst', () => {
    const a: XY[] = [[0, 0], [10, 0]];
    expect(haengeAn([a], [[10, 0], [20, 0]])).toEqual([[[0, 0], [10, 0], [20, 0]]]);
    expect(haengeAn([a], [[20, 0], [10, 0]])).toEqual([[[0, 0], [10, 0], [20, 0]]]);
    expect(haengeAn([a], [[-10, 0], [0, 0]])).toEqual([[[-10, 0], [0, 0], [10, 0]]]);
    expect(haengeAn([a], [[50, 0], [60, 0]])).toEqual([a, [[50, 0], [60, 0]]]);
    expect(haengeAn([a], [[10, 0], [0, 0]])).toEqual([a]);
    expect(haengeAn([a, [[20, 0], [30, 0]]], [[10, 0], [20, 0]])).toEqual([[[0, 0], [10, 0], [20, 0], [30, 0]]]);
  });
});

describe('Flächen über Kachelgrenzen', () => {
  // Gebäude über die Grenze x=4096, je Kachel mit Puffer; Nachbar mit gemeinsamer Wand bei x=4000 in Kachel 0
  const stuecke: Flaeche[] = [
    { ringe: [rechteck(4000, 1000, 4160, 1100)], kachel: K0 },
    { ringe: [rechteck(4030, 1000, 4200, 1100)], kachel: K1 },
    { ringe: [rechteck(3900, 1000, 4000, 1100)], kachel: K0 },
    { ringe: [rechteck(5000, 1000, 5100, 1100)], kachel: K1 },
  ];
  it('Gebäude: ein Umriss ohne Naht, Nachbar mit gemeinsamer Wand bleibt getrennt; U-Form bleibt U', () => {
    const p = vereineFlaeche(stuecke, [4050, 1050]);
    expect(p).toHaveLength(1);
    expect(p[0]).toHaveLength(1);
    expect(p[0][0]).toHaveLength(5); // 4 Ecken + Schluss, Nahtpunkte entfernt
    expect(bbox(p[0][0])).toEqual([4000, 1000, 4200, 1100]);
    expect(vereineFlaeche(stuecke, [4150, 1050])[0][0]).toHaveLength(5); // auch vom anderen Stück aus
    expect(bbox(vereineFlaeche(stuecke, [3950, 1050])[0][0])).toEqual([3900, 1000, 4000, 1100]);
    expect(vereineFlaeche(stuecke, [4500, 1050])).toEqual([]);
    const u: Ring = [[3900, 1000], [4200, 1000], [4200, 1300], [3900, 1300], [3900, 1200], [4150, 1200], [4150, 1100], [3900, 1100], [3900, 1000]];
    const pu = vereineFlaeche([{ ringe: [u], kachel: K0 }, { ringe: [u], kachel: K1 }], [3950, 1050]);
    expect(pu).toHaveLength(1);
    expect(pu[0][0]).toHaveLength(9);
    expect(bbox(pu[0][0])).toEqual([3900, 1000, 4200, 1300]);
  });
  it('Regression 31.10.: Gebäude über die Naht geteilter Kacheln (MapLibre schneidet z14 bis z16) bleibt ganz', () => {
    // «schräge Fassade»: ab Zoom 15 liefert MapLibre z15/z16-Stücke; die Naht bei x = 1024 lag nicht im z14-Raster
    const z16 = [{ x: 0, y: 0, z: 16 }, { x: 1, y: 0, z: 16 }];
    const haus = rechteck(1000, 100, 1060, 200);
    const p = vereineFlaeche(z16.map((kachel) => ({ ringe: [haus], kachel })), [1010, 150]);
    expect(p[0][0]).toHaveLength(5);
    expect(bbox(p[0][0])).toEqual([1000, 100, 1060, 200]);
  });
  it('Wald mit Loch über die Grenze: Loch bleibt Loch', () => {
    const aussen = rechteck(3000, 0, 5000, 2000);
    const loch: Ring = [[3500, 500], [3500, 1500], [3700, 1500], [3700, 500], [3500, 500]];
    const p = vereineFlaeche([{ ringe: [aussen, loch], kachel: K0 }, { ringe: [aussen], kachel: K1 }], [4500, 100]);
    expect(p).toHaveLength(1);
    expect(p[0]).toHaveLength(2);
    expect(bbox(p[0][0])).toEqual([3000, 0, 5000, 2000]);
  });
});
