import { describe, expect, it } from 'vitest';
import { platziere, type Box } from './labels.ts';

const label = (x: number, y: number): { unten: Box; oben: Box } => ({ unten: { x, y: y + 30, w: 60, h: 16 }, oben: { x, y: y - 18, w: 60, h: 16 } });

describe('platziere', () => {
  it('frei unten; bei Überlappung nach oben statt den zweiten Rufnamen zu verdecken; beides belegt → weg', () => {
    expect(platziere([label(0, 0), label(200, 0)])).toEqual(['unten', 'unten']);
    expect(platziere([label(0, 0), label(20, 0)])).toEqual(['unten', 'oben']);
    expect(platziere([label(0, 0), label(10, 0), label(20, 0)])).toEqual(['unten', 'oben', 'weg']);
  });
  it('fremde Symbole sind Hindernisse, das eigene (gleicher Index) nicht, auch wenn es sein Label schneidet', () => {
    const sym = (x: number): Box => ({ x, y: 20, w: 30, h: 30 }); // ragt ins Label «unten» (y 30–46)
    expect(platziere([label(0, 0), label(500, 0)], [sym(0), sym(500)])).toEqual(['unten', 'unten']);
    expect(platziere([label(0, 0), label(500, 0)], [sym(500), sym(0)])).toEqual(['oben', 'oben']);
  });
});
