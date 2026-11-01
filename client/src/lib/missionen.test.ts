import { expect, it } from 'vitest';
import type { Taufe } from '../../../shared/protocol.ts';
import { auffaechern, faehnchenOrt, weiterNach, zielBox } from './missionen.ts';

it('Token-Regel: nach 4005 nie mit dem verworfenen Token neu verbinden, sondern auf das neue warten; «beendet» für ein altes Token ignorieren', () => {
  expect(weiterNach('neuesToken', 'alt', 'alt', false)).toBe('warten'); // Beitritts-Antwort steht noch aus
  expect(weiterNach('neuesToken', 'alt', 'neu', false)).toEqual({ token: 'neu' });
  expect(weiterNach('neuesToken', 'alt', 'alt', true)).toBe('abmelden');
  expect(weiterNach('beendet', 'alt', 'neu', false)).toEqual({ token: 'neu' });
  expect(weiterNach('beendet', 'alt', 'alt', false)).toBe('abmelden');
  expect(weiterNach('beendet', 'alt', null, false)).toBe('abmelden');
  expect(weiterNach('getrennt', 'alt', null, false)).toEqual({ token: 'alt' });
});

it('Fähnchen: Mitte aller Zielobjekte (andere Taufen zählen nicht), ohne Zielobjekt der letzte Ausschnitt', () => {
  const taufe = (ziel: boolean, geometrie: Taufe['geometrie']) => ({ ziel, geometrie }) as Taufe;
  const ziele = zielBox([
    taufe(true, { type: 'LineString', coordinates: [[7.0, 46.0], [7.1, 46.1]] }),
    taufe(false, { type: 'LineString', coordinates: [[9.0, 47.0], [9.1, 47.1]] }),
    taufe(true, { type: 'MultiPolygon', coordinates: [[[[7.4, 46.4], [7.5, 46.4], [7.5, 46.5], [7.4, 46.4]]]] }),
  ]);
  expect(ziele).toEqual([[7.0, 46.0], [7.5, 46.5]]);
  const ansicht = { mitte: [8, 47] as [number, number], zoom: 12 };
  expect(faehnchenOrt({ ziele, ansicht })).toEqual([7.25, 46.25]);
  expect(faehnchenOrt({ ziele: zielBox([taufe(false, { type: 'LineString', coordinates: [[9, 47], [9.1, 47]] })]), ansicht })).toEqual([8, 47]);
});

it('Auffächern: Überlappende stehen nebeneinander (nach x geordnet), auch wenn die Reihe in ein drittes stösst; Fernes bleibt, am Rand rückt es in die freie Karte, zu breit übereinander', () => {
  const f = [
    { x: 102, y: 100, b: 80 },
    { x: 100, y: 102, b: 80 },
    { x: 190, y: 100, b: 60 }, // überlappt erst die aufgefächerte Reihe
    { x: 600, y: 100, b: 80 },
  ];
  const v = auffaechern(f, 30, [0, 1000]);
  const boxen = f.map((p, i) => ({ l: p.x + v[i].dx - p.b / 2, r: p.x + v[i].dx + p.b / 2, y: p.y + v[i].dy }));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(boxen[i].r <= boxen[j].l || boxen[j].r <= boxen[i].l, `${i}/${j}`).toBe(true);
  expect(boxen[1].l).toBeLessThan(boxen[0].l); // links liegt, was links liegt
  expect(v[3]).toEqual({ dx: 0, dy: 0 });
  expect(auffaechern([{ x: 600, y: 100, b: 80 }], 30, [600, 1000])).toEqual([{ dx: 40, dy: 0 }]);
  // zu breit für die freie Karte: übereinander, beide ganz drin
  const eng = auffaechern([{ x: 100, y: 100, b: 150 }, { x: 101, y: 100, b: 150 }], 30, [0, 200]);
  expect(Math.abs(eng[0].dy - eng[1].dy)).toBeGreaterThanOrEqual(30);
  for (const [i, v] of eng.entries()) expect(100 + i + v.dx - 75 >= 0 && 100 + i + v.dx + 75 <= 200, `${i} im Bild`).toBe(true);
});
