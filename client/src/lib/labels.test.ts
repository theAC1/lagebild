import { describe, expect, it } from 'vitest';
import { platziere, type Box } from './labels.ts';

const label = (x: number, y: number): { unten: Box; oben: Box } => ({ unten: { x, y: y + 30, w: 60, h: 16 }, oben: { x, y: y - 18, w: 60, h: 16 } });

describe('platziere', () => {
  it('lässt freie Labels unten', () => {
    expect(platziere([label(0, 0), label(200, 0)])).toEqual(['unten', 'unten']);
  });
  it('weicht bei Überlappung nach oben aus, statt den zweiten Rufnamen zu verdecken', () => {
    expect(platziere([label(0, 0), label(20, 0)])).toEqual(['unten', 'oben']);
  });
  it('blendet aus, wenn oben und unten belegt sind', () => {
    expect(platziere([label(0, 0), label(10, 0), label(20, 0)])).toEqual(['unten', 'oben', 'weg']);
  });
  it('fremde Symbole sind Hindernisse, das eigene nicht', () => {
    const sym = (x: number): Box => ({ x, y: 0, w: 30, h: 30 });
    expect(platziere([label(0, 0)], [sym(0)])).toEqual(['unten']);
    expect(platziere([label(0, 0), label(500, 0)], [sym(500), { x: 10, y: 30, w: 30, h: 30 }])).toEqual(['oben', 'unten']);
  });
});
