import { describe, expect, it } from 'vitest';
import { bundleUrl, liesWebManifest, webAktion } from './webUpdate.ts';

const hash = 'a'.repeat(64);
const gut = { webCode: 500, webName: '1.0.9', minNativeCode: 100, url: '/app/web-500.zip', sha256: hash };

describe('Web-Manifest', () => {
  it('liest ein gültiges Manifest', () => {
    expect(liesWebManifest(gut)).toEqual({ webCode: 500, webName: '1.0.9', minNativeCode: 100, pfad: '/app/web-500.zip', sha256: hash });
    expect(liesWebManifest({ ...gut, webName: undefined })?.webName).toBe('500');
  });
  it('lehnt Ungültiges und fremde Adressen ab', () => {
    const schlecht = [
      null, 'x', {}, { ...gut, webCode: 0 }, { ...gut, webCode: 1.5 }, { ...gut, minNativeCode: -1 }, { ...gut, minNativeCode: '1' },
      { ...gut, url: 'https://evil.example/app/web-500.zip' }, { ...gut, url: '/app/web-499.zip' }, { ...gut, url: '/app/../x.zip' },
      { ...gut, sha256: 'A'.repeat(64) }, { ...gut, sha256: 'abc' }, { ...gut, sha256: undefined },
    ];
    for (const x of schlecht) expect(liesWebManifest(x)).toBeUndefined();
  });
});

describe('Aktion', () => {
  const m = liesWebManifest(gut)!;
  it('lädt nur neuere Stände, die zur APK passen', () => {
    expect(webAktion(m, 499, 100)).toBe('laden');
    expect(webAktion(m, 500, 100)).toBe('aktuell');
    expect(webAktion(m, 600, 100)).toBe('aktuell');
    expect(webAktion(m, 499, 101)).toBe('laden');
  });
  it('zu hoher nativer Mindestcode: nicht anwenden', () => {
    expect(webAktion(m, 499, 99)).toBe('apk-noetig');
    expect(webAktion(m, 499, NaN)).toBe('aktuell');
    expect(webAktion(undefined, 1, 1)).toBe('aktuell');
  });
});

describe('bundleUrl', () => {
  const m = liesWebManifest(gut)!;
  it('nur über https', () => {
    expect(bundleUrl('https://lage.arvuna.ch/', m)).toBe('https://lage.arvuna.ch/app/web-500.zip');
    expect(bundleUrl('http://10.0.2.2:8080', m)).toBeUndefined();
  });
});
