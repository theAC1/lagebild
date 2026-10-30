import { describe, expect, it } from 'vitest';
import { istNeuer, liesAppVersion } from './appVersion.ts';

describe('App-Version', () => {
  it('liest nur gültige version.json', () => {
    expect(liesAppVersion({ versionCode: 5, versionName: '0.5' })).toEqual({ versionCode: 5, versionName: '0.5' });
    expect(liesAppVersion({ versionCode: 5 })).toEqual({ versionCode: 5, versionName: '5' });
    for (const x of [null, 'x', {}, { versionCode: '5' }, { versionCode: 1.5 }, { versionCode: 0 }]) expect(liesAppVersion(x)).toBeUndefined();
  });
  it('Hinweis nur bei höherem versionCode', () => {
    const v = { versionCode: 10, versionName: '1' };
    expect(istNeuer(9, v)).toBe(true);
    expect(istNeuer(10, v)).toBe(false);
    expect(istNeuer(11, v)).toBe(false);
    expect(istNeuer(9, undefined)).toBe(false);
    expect(istNeuer(NaN, v)).toBe(false);
  });
});
