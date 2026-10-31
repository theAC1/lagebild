import { expect, it } from 'vitest';
import { istNeuer, liesAppVersion } from './appVersion.ts';

it('liest nur gültige version.json; Hinweis nur bei höherem versionCode', () => {
  expect(liesAppVersion({ versionCode: 5, versionName: '0.5' })).toEqual({ versionCode: 5, versionName: '0.5' });
  expect(liesAppVersion({ versionCode: 5 })).toEqual({ versionCode: 5, versionName: '5' });
  for (const x of [null, 'x', {}, { versionCode: '5' }, { versionCode: 1.5 }, { versionCode: 0 }]) expect(liesAppVersion(x), JSON.stringify(x)).toBeUndefined();
  const v = { versionCode: 10, versionName: '1' };
  expect([istNeuer(9, v), istNeuer(10, v), istNeuer(11, v), istNeuer(9, undefined), istNeuer(NaN, v)]).toEqual([true, false, false, false, false]);
});
