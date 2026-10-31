import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { UPDATE_SCHLUESSEL } from './updateSchluessel.ts';
import {
  bundleUrl, liesWebManifest, siegelGueltig, siegelNachricht, webAktion, webUpdater, zeigen,
  type Angebot, type Lader, type Stufe, type WebUpdateUmgebung,
} from './webUpdate.ts';

const hash = 'a'.repeat(64);
// Testvektor mit einem eigens erzeugten Test-Schlüsselpaar (nicht dem echten): Siegel über `lagebild-web|500|100|1|normal|aaa…`
const TEST_SCHLUESSEL: JsonWebKey = { kty: 'EC', crv: 'P-256', x: '2LiG9IGYdpLImMF2GM6royEsTyvdLRTCjMLuqZV4XU8', y: '0-6IsGqta_NIpwVeKtfsvrcHfRBPI4-_SMr78utuHKk' };
const sig = 'B8y2W3v6vqZ0siCBAsnRjdwddi8vY25n6yN--VGYR15E_5kyqOqqT0EXPp9-f9kosCoA2KtoB-8xUua-LqC7Lg';
const gut = { webCode: 500, webName: '1.0.9', minNativeCode: 100, url: '/app/web-500.zip', sha256: hash, stufe: 'normal', protokoll: 1, sig };

describe('Web-Manifest', () => {
  it('liest ein gültiges Manifest (webName fällt auf den webCode zurück); lehnt Ungültiges, fremde Adressen, falschen Hash und fehlendes Siegel ab', () => {
    expect(liesWebManifest(gut)).toEqual({ webCode: 500, webName: '1.0.9', minNativeCode: 100, pfad: '/app/web-500.zip', sha256: hash, stufe: 'normal', protokoll: 1, sig });
    expect(liesWebManifest({ ...gut, webName: undefined })?.webName).toBe('500');
    const schlecht = [
      null, 'x', {}, { ...gut, webCode: 0 }, { ...gut, webCode: 1.5 }, { ...gut, minNativeCode: -1 }, { ...gut, minNativeCode: '1' },
      { ...gut, url: 'https://evil.example/app/web-500.zip' }, { ...gut, url: '/app/web-499.zip' }, { ...gut, url: '/app/../x.zip' },
      { ...gut, sha256: 'A'.repeat(64) }, { ...gut, sha256: 'abc' }, { ...gut, sha256: undefined },
      { ...gut, sig: undefined }, { ...gut, sig: '' }, { ...gut, sig: sig.slice(1) }, { ...gut, sig: sig.slice(0, -1) + '=' }, { ...gut, sig: 1 },
      { ...gut, stufe: undefined }, { ...gut, stufe: 'dringend' }, { ...gut, protokoll: undefined }, { ...gut, protokoll: 0 }, { ...gut, protokoll: '1' },
    ];
    for (const x of schlecht) expect(liesWebManifest(x), JSON.stringify(x)).toBeUndefined();
  });
});

describe('Siegel', () => {
  const m = liesWebManifest(gut)!;
  it('Nachricht bindet Stand, Mindest-APK, Protokoll, Stufe und Inhalt; Testvektor wird akzeptiert', async () => {
    expect(siegelNachricht(m)).toBe(`lagebild-web|500|100|1|normal|${hash}`);
    expect(await siegelGueltig(m, TEST_SCHLUESSEL)).toBe(true);
  });
  it('jedes manipulierte Feld (webCode, minNativeCode, sha256, Stufe, Protokoll), kaputte Signatur und fremder Schlüssel werden abgelehnt', async () => {
    const varianten = [
      { ...m, webCode: 501, pfad: '/app/web-501.zip' }, { ...m, minNativeCode: 99 }, { ...m, sha256: 'b'.repeat(64) },
      { ...m, stufe: 'wichtig' as const }, { ...m, stufe: 'sicherheit' as const }, { ...m, protokoll: 2 },
    ];
    for (const v of varianten) expect(await siegelGueltig(v, TEST_SCHLUESSEL), JSON.stringify(v)).toBe(false);
    // kaputte Signatur, fremder Schlüssel
    const kippe = sig[10] === 'A' ? 'B' : 'A';
    expect(await siegelGueltig({ ...m, sig: sig.slice(0, 10) + kippe + sig.slice(11) }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, sig: 'A'.repeat(86) }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, sig: '!!' }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig(m, UPDATE_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig(m, { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' })).toBe(false);
  });
  it('Format wie deploy/siegel.mjs: node:crypto mit ieee-p1363', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const n = { ...m, webCode: 777, minNativeCode: 5, stufe: 'sicherheit' as const };
    const s = sign('sha256', Buffer.from(siegelNachricht(n)), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    expect(s).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await siegelGueltig({ ...n, sig: s }, publicKey.export({ format: 'jwk' }))).toBe(true);
  });
});

describe('Entscheid', () => {
  const m = liesWebManifest(gut)!;
  it('lädt nur neuere Stände, die zur APK passen; Bundle nur über https', () => {
    expect([webAktion(m, 499, 100), webAktion(m, 500, 100), webAktion(m, 600, 100), webAktion(m, 499, 101)]).toEqual(['laden', 'aktuell', 'aktuell', 'laden']);
    expect(webAktion(m, 499, 99)).toBe('apk-noetig');
    expect(webAktion(m, 499, NaN)).toBe('aktuell');
    expect(webAktion(undefined, 1, 1)).toBe('aktuell');
    expect(bundleUrl('https://lage.arvuna.ch/', m)).toBe('https://lage.arvuna.ch/app/web-500.zip');
    expect(bundleUrl('http://10.0.2.2:8080', m)).toBeUndefined();
  });
  it('zeigen: überspringbar nur Stufe normal und nur bis zum gemerkten webCode', () => {
    const a = (webCode: number, stufe: Stufe): Angebot => ({ webCode, stufe, protokoll: 1 });
    expect(zeigen(a(500, 'normal'), undefined)).toBe(true);
    expect(zeigen(a(500, 'normal'), 500)).toBe(false);
    expect(zeigen(a(499, 'normal'), 500)).toBe(false);
    expect(zeigen(a(501, 'normal'), 500)).toBe(true);
    expect(zeigen(a(500, 'wichtig'), 500)).toBe(true);
    expect(zeigen(a(500, 'sicherheit'), 600)).toBe(true);
  });
});

describe('webUpdater', () => {
  // Gesiegelte Manifeste mit eigenem Test-Schlüssel (node:crypto wie deploy/siegel.mjs)
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const schluessel = publicKey.export({ format: 'jwk' });
  const gesiegelt = (webCode: number, stufe: Stufe = 'normal', protokoll = 1) => {
    const m = { webCode, webName: 'x', minNativeCode: 100, url: `/app/web-${webCode}.zip`, sha256: hash, stufe, protokoll };
    return { ...m, sig: sign('sha256', Buffer.from(siegelNachricht(m)), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
  };
  type Bundle = { id: string; version: string; status: string };
  const umgebung = (bundles: Bundle[], manifest: unknown = gesiegelt(500), speicher = new Map<string, string>()) => {
    const lader = {
      list: vi.fn(async () => ({ bundles })),
      download: vi.fn(async (o: { version: string }) => ({ id: 'neu-' + o.version })),
      set: vi.fn(async () => {}),
    } satisfies Lader;
    const bereit = vi.fn();
    let m = manifest;
    const u: WebUpdateUmgebung = {
      lader,
      schluessel,
      laufend: 499,
      basis: 'https://lage.arvuna.ch',
      manifest: async () => m,
      nativ: async () => 100,
      bereit,
      lies: (k) => speicher.get(k) ?? null,
      schreibe: (k, v) => void (v === null ? speicher.delete(k) : speicher.set(k, v)),
    };
    return { lader, bereit, speicher, w: webUpdater(u), neuesManifest: (x: unknown) => (m = x) };
  };

  it('gesiegelter Stand wird einmal geladen und angeboten; erst aktivieren() setzt ihn, ohne bereiten Stand tut es nichts', async () => {
    const leer = umgebung([]);
    await leer.w.aktivieren();
    expect(leer.lader.set).not.toHaveBeenCalled();

    const { lader, bereit, w } = umgebung([]);
    await w.start();
    await w.pruefe();
    await w.pruefe(); // zweite Prüfung (z.B. visibilitychange): kein zweiter Download, keine Aktivierung
    expect(lader.download).toHaveBeenCalledOnce();
    expect(lader.download).toHaveBeenCalledWith({ url: 'https://lage.arvuna.ch/app/web-500.zip', version: '500', checksum: hash });
    expect(bereit).toHaveBeenCalledExactlyOnceWith({ webCode: 500, stufe: 'normal', protokoll: 1 });
    expect(lader.set).not.toHaveBeenCalled();
    await w.aktivieren();
    expect(lader.set).toHaveBeenCalledWith({ id: 'neu-500' });
  });

  it('Neustart: geladener Stand (pending) wird mit seiner Stufe erneut angeboten, nicht übernommen; ohne passendes Bundle oder mit error nichts', async () => {
    const erst = umgebung([], gesiegelt(520, 'sicherheit', 2));
    await erst.w.pruefe();
    // Neustart offline: gleicher Gerätespeicher, das Bundle liegt als pending da
    const { lader, bereit, w } = umgebung([{ id: 'neu-520', version: '520', status: 'pending' }], undefined, erst.speicher);
    await w.start();
    await w.pruefe();
    expect(bereit).toHaveBeenCalledExactlyOnceWith({ webCode: 520, stufe: 'sicherheit', protokoll: 2 });
    expect(lader.set).not.toHaveBeenCalled();
    expect(lader.download).not.toHaveBeenCalled();
    await w.aktivieren();
    expect(lader.set).toHaveBeenCalledWith({ id: 'neu-520' });

    const speicher = new Map([['lagebild.update.angebot', JSON.stringify({ id: 'weg', webCode: 520, stufe: 'normal', protokoll: 1 })]]);
    const weg = umgebung([{ id: 'weg', version: '520', status: 'error' }], undefined, speicher);
    await weg.w.start();
    await weg.w.aktivieren();
    expect(weg.bereit).not.toHaveBeenCalled();
    expect(weg.lader.set).not.toHaveBeenCalled();

    const fehl = umgebung([{ id: 'x', version: '500', status: 'error' }]);
    await fehl.w.pruefe(); // schon einmal nicht gestartet: nicht erneut laden
    expect(fehl.lader.download).not.toHaveBeenCalled();
    expect(fehl.bereit).not.toHaveBeenCalled();
  });

  it('ohne gültiges Siegel: nichts laden, nichts anbieten, nichts setzen', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const echt = gesiegelt(500);
    const schlecht = [{ ...echt, sig: undefined }, { ...echt, minNativeCode: 99 }, { ...echt, sha256: 'b'.repeat(64) }, { ...echt, stufe: 'wichtig' }, { ...echt, protokoll: 2 }, gut];
    for (const manifest of schlecht) {
      const { lader, bereit, w } = umgebung([], manifest);
      await w.start();
      await w.pruefe();
      await w.aktivieren();
      expect(lader.download, JSON.stringify(manifest)).not.toHaveBeenCalled();
      expect(lader.set).not.toHaveBeenCalled();
      expect(bereit).not.toHaveBeenCalled();
    }
    warn.mockRestore();
  });

  it('Überspringen (normal): gleicher Stand nicht mehr, auch nach Neustart; höherer erscheint wieder; wichtig/sicherheit nicht überspringbar', async () => {
    const { lader, bereit, speicher, w, neuesManifest } = umgebung([]);
    await w.pruefe();
    w.ueberspringen();
    await w.pruefe();
    await w.aktivieren();
    expect(bereit).toHaveBeenCalledOnce();
    expect(lader.set).not.toHaveBeenCalled();

    const neustart = umgebung([{ id: 'neu-500', version: '500', status: 'pending' }], undefined, speicher);
    await neustart.w.start();
    await neustart.w.pruefe();
    expect(neustart.bereit).not.toHaveBeenCalled();

    neuesManifest(gesiegelt(501));
    await w.pruefe();
    expect(bereit).toHaveBeenLastCalledWith({ webCode: 501, stufe: 'normal', protokoll: 1 });

    for (const stufe of ['wichtig', 'sicherheit'] as const) {
      const u = umgebung([], gesiegelt(500, stufe));
      await u.w.pruefe();
      u.w.ueberspringen();
      expect(u.speicher.has('lagebild.update.uebersprungen')).toBe(false);
      await u.w.aktivieren(); // bleibt bereit
      expect(u.bereit).toHaveBeenCalledOnce();
      expect(u.lader.set).toHaveBeenCalledWith({ id: 'neu-500' });
    }
    // übersprungene Version verdeckt keine wichtige mit gleichem oder tieferem Code
    const w2 = umgebung([], gesiegelt(500, 'wichtig'), new Map([['lagebild.update.uebersprungen', '600']]));
    await w2.w.pruefe();
    expect(w2.bereit).toHaveBeenCalledOnce();
  });
});
