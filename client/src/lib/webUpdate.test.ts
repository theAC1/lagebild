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
  it('liest ein gültiges Manifest', () => {
    expect(liesWebManifest(gut)).toEqual({ webCode: 500, webName: '1.0.9', minNativeCode: 100, pfad: '/app/web-500.zip', sha256: hash, stufe: 'normal', protokoll: 1, sig });
    expect(liesWebManifest({ ...gut, webName: undefined })?.webName).toBe('500');
  });
  it('lehnt Ungültiges, fremde Adressen und fehlendes Siegel ab', () => {
    const schlecht = [
      null, 'x', {}, { ...gut, webCode: 0 }, { ...gut, webCode: 1.5 }, { ...gut, minNativeCode: -1 }, { ...gut, minNativeCode: '1' },
      { ...gut, url: 'https://evil.example/app/web-500.zip' }, { ...gut, url: '/app/web-499.zip' }, { ...gut, url: '/app/../x.zip' },
      { ...gut, sha256: 'A'.repeat(64) }, { ...gut, sha256: 'abc' }, { ...gut, sha256: undefined },
      { ...gut, sig: undefined }, { ...gut, sig: '' }, { ...gut, sig: sig.slice(1) }, { ...gut, sig: sig.slice(0, -1) + '=' }, { ...gut, sig: 1 },
      { ...gut, stufe: undefined }, { ...gut, stufe: 'dringend' }, { ...gut, protokoll: undefined }, { ...gut, protokoll: 0 }, { ...gut, protokoll: '1' },
    ];
    for (const x of schlecht) expect(liesWebManifest(x)).toBeUndefined();
  });
});

describe('Siegel', () => {
  const m = liesWebManifest(gut)!;
  it('Nachricht bindet Stand, Mindest-APK, Protokoll, Stufe und Inhalt', () => {
    expect(siegelNachricht(m)).toBe(`lagebild-web|500|100|1|normal|${hash}`);
  });
  it('gültige Signatur (Testvektor) wird akzeptiert', async () => {
    expect(await siegelGueltig(m, TEST_SCHLUESSEL)).toBe(true);
  });
  it('manipulierter webCode, minNativeCode oder sha256 wird abgelehnt', async () => {
    expect(await siegelGueltig({ ...m, webCode: 501, pfad: '/app/web-501.zip' }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, minNativeCode: 99 }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, sha256: 'b'.repeat(64) }, TEST_SCHLUESSEL)).toBe(false);
  });
  it('manipulierte Stufe oder Protokoll wird abgelehnt', async () => {
    expect(await siegelGueltig({ ...m, stufe: 'wichtig' }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, stufe: 'sicherheit' }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, protokoll: 2 }, TEST_SCHLUESSEL)).toBe(false);
  });
  it('kaputte Signatur wird abgelehnt', async () => {
    const kippe = sig[10] === 'A' ? 'B' : 'A';
    expect(await siegelGueltig({ ...m, sig: sig.slice(0, 10) + kippe + sig.slice(11) }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, sig: 'A'.repeat(86) }, TEST_SCHLUESSEL)).toBe(false);
    expect(await siegelGueltig({ ...m, sig: '!!' }, TEST_SCHLUESSEL)).toBe(false);
  });
  it('fremder Schlüssel wird abgelehnt', async () => {
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

describe('Stufen', () => {
  const a = (webCode: number, stufe: Stufe): Angebot => ({ webCode, stufe, protokoll: 1 });
  it('überspringen nur bei normal, ein höherer webCode erscheint wieder', () => {
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

  it('gesiegelter Stand wird geladen und angeboten, aber erst aktivieren() setzt ihn', async () => {
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

  it('beim nächsten Start: geladener Stand wird erneut angeboten (mit seiner Stufe), nicht übernommen', async () => {
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
  });

  it('gemerkter Stand ohne passendes Bundle wird nicht angeboten', async () => {
    const speicher = new Map([['lagebild.update.angebot', JSON.stringify({ id: 'weg', webCode: 520, stufe: 'normal', protokoll: 1 })]]);
    const { lader, bereit, w } = umgebung([{ id: 'weg', version: '520', status: 'error' }], undefined, speicher);
    await w.start();
    await w.aktivieren();
    expect(bereit).not.toHaveBeenCalled();
    expect(lader.set).not.toHaveBeenCalled();
  });

  it('ohne bereiten Stand tut aktivieren() nichts', async () => {
    const { lader, w } = umgebung([]);
    await w.aktivieren();
    expect(lader.set).not.toHaveBeenCalled();
  });

  it('ohne gültiges Siegel: nichts laden, nichts anbieten', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const echt = gesiegelt(500);
    const schlecht = [{ ...echt, sig: undefined }, { ...echt, minNativeCode: 99 }, { ...echt, sha256: 'b'.repeat(64) }, { ...echt, stufe: 'wichtig' }, { ...echt, protokoll: 2 }, gut];
    for (const manifest of schlecht) {
      const { lader, bereit, w } = umgebung([], manifest);
      await w.start();
      await w.pruefe();
      await w.aktivieren();
      expect(lader.download).not.toHaveBeenCalled();
      expect(lader.set).not.toHaveBeenCalled();
      expect(bereit).not.toHaveBeenCalled();
    }
    warn.mockRestore();
  });

  it('fehlgeschlagener Stand (error) wird nicht erneut geladen', async () => {
    const { lader, bereit, w } = umgebung([{ id: 'x', version: '500', status: 'error' }]);
    await w.pruefe();
    expect(lader.download).not.toHaveBeenCalled();
    expect(bereit).not.toHaveBeenCalled();
  });

  it('Überspringen (normal): gleicher Stand nicht mehr, auch nach Neustart; ein höherer erscheint wieder', async () => {
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
  });

  it('wichtig und sicherheit lassen sich nicht überspringen', async () => {
    for (const stufe of ['wichtig', 'sicherheit'] as const) {
      const { lader, bereit, speicher, w } = umgebung([], gesiegelt(500, stufe));
      await w.pruefe();
      w.ueberspringen();
      expect(speicher.has('lagebild.update.uebersprungen')).toBe(false);
      await w.aktivieren(); // bleibt bereit
      expect(bereit).toHaveBeenCalledOnce();
      expect(lader.set).toHaveBeenCalledWith({ id: 'neu-500' });
    }
  });

  it('übersprungene Version verdeckt keine wichtige mit gleichem oder tieferem Code', async () => {
    const { bereit, w } = umgebung([], gesiegelt(500, 'wichtig'), new Map([['lagebild.update.uebersprungen', '600']]));
    await w.pruefe();
    expect(bereit).toHaveBeenCalledOnce();
  });
});
