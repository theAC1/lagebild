import { describe, expect, it } from 'vitest';
import { istTag, sonnenHoehe } from './sonne.ts';

const BERN = { lat: 46.948, lon: 7.4474 };

describe('sonnenHoehe', () => {
  it('Bern, Sommersonnenwende Mittag: 90° − Breite + Neigung', () => {
    // wahrer Mittag in Bern ≈ 11:32 UTC
    expect(sonnenHoehe(BERN, Date.UTC(2026, 5, 21, 11, 32))).toBeCloseTo(90 - 46.948 + 23.44, 0);
  });
  it('Bern, Wintersonnenwende Mittag: tief, aber über dem Horizont', () => {
    expect(sonnenHoehe(BERN, Date.UTC(2026, 11, 21, 11, 29))).toBeCloseTo(90 - 46.948 - 23.44, 0);
  });
  it('Bern, Mitternacht im Sommer: unter dem Horizont', () => {
    const h = sonnenHoehe(BERN, Date.UTC(2026, 5, 21, 23, 32));
    expect(h).toBeLessThan(-15);
    expect(h).toBeCloseTo(-(90 - 46.948 - 23.44), 0);
  });
  it('Tagundnachtgleiche: Sonne am Äquator mittags fast im Zenit', () => {
    expect(sonnenHoehe({ lat: 0, lon: 0 }, Date.UTC(2026, 2, 20, 12, 7))).toBeGreaterThan(89);
  });
});

describe('istTag', () => {
  it('Bern 29.10.: 09:00 Tag, 19:00 Nacht (Ortszeit MEZ = UTC+1)', () => {
    expect(istTag(BERN, Date.UTC(2026, 9, 29, 8))).toBe(true);
    expect(istTag(BERN, Date.UTC(2026, 9, 29, 18))).toBe(false);
  });
  it('wechselt um den Sonnenaufgang (Bern 29.10. ≈ 07:13 MEZ)', () => {
    expect(istTag(BERN, Date.UTC(2026, 9, 29, 6, 0))).toBe(false);
    expect(istTag(BERN, Date.UTC(2026, 9, 29, 6, 30))).toBe(true);
  });
});
