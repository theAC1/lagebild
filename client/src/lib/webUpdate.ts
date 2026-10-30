// Live-Update der Oberfläche in der Android-App: Manifest (`/app/web.json`, vom Server geliefert) prüfen, Siegel prüfen,
// laden und erst auf Zustimmung aktivieren. Ohne Plugin-Import: das Plugin kommt als `Lader` herein (update.svelte.ts).
export const STUFEN = ['normal', 'wichtig', 'sicherheit'] as const;
/** normal: überspringbar; wichtig: bleibt dezent sichtbar; sicherheit: deutlich, bleibt sichtbar. Nie ohne Antippen. */
export type Stufe = (typeof STUFEN)[number];

/** Was der Hinweis «Neue Version bereit» anzeigt. */
export interface Angebot {
  webCode: number;
  stufe: Stufe;
  /** PROTOKOLL_VERSION des angebotenen Stands. */
  protokoll: number;
}

export interface WebManifest {
  /** Build-Zeitpunkt des Web-Stands (Minuten seit 1.1.2026), steigt mit jedem Bauen. */
  webCode: number;
  webName: string;
  /** Mindest-versionCode der installierten APK, ab dem dieser Stand läuft. */
  minNativeCode: number;
  /** Serverpfad des Bundles (zip), immer `/app/web-<webCode>.zip`. */
  pfad: string;
  /** SHA-256 des zip, 64 Hex-Zeichen klein. */
  sha256: string;
  stufe: Stufe;
  /** Hauptversion des Vertrags (shared/protocol.ts) dieses Stands. */
  protokoll: number;
  /** Siegel über siegelNachricht(): ECDSA P-256/SHA-256, r||s (64 Byte) als base64url. */
  sig: string;
}

const istZahl = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Prüft die Antwort von /app/web.json streng; undefined bei allem, was nicht passt (auch fremde Pfade, fehlendes Siegel). */
export function liesWebManifest(roh: unknown): WebManifest | undefined {
  if (typeof roh !== 'object' || roh === null) return undefined;
  const { webCode, webName, minNativeCode, url, sha256, stufe, protokoll, sig } = roh as Record<string, unknown>;
  if (!istZahl(webCode) || webCode < 1 || !istZahl(minNativeCode) || !istZahl(protokoll) || protokoll < 1) return undefined;
  if (!STUFEN.includes(stufe as Stufe)) return undefined;
  // Nur ein relativer Pfad zur eigenen Server-Basis; nie eine fremde URL
  if (typeof url !== 'string' || url !== `/app/web-${webCode}.zip`) return undefined;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return undefined;
  if (typeof sig !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(sig)) return undefined;
  return { webCode, webName: typeof webName === 'string' ? webName.slice(0, 32) : String(webCode), minNativeCode, pfad: url, sha256, stufe: stufe as Stufe, protokoll, sig };
}

/** Vom Siegel gedeckt: Stand, Mindest-APK, Protokoll, Stufe und Inhalt. Eine Signatur gilt nur für genau diesen Stand
 *  (auch von deploy/siegel.mjs benutzt). */
export const siegelNachricht = (m: Pick<WebManifest, 'webCode' | 'minNativeCode' | 'protokoll' | 'stufe' | 'sha256'>): string =>
  `lagebild-web|${m.webCode}|${m.minNativeCode}|${m.protokoll}|${m.stufe}|${m.sha256}`;

const vonBase64url = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Prüft das Siegel gegen den fest eingebauten Schlüssel; false bei allem, was nicht passt. */
export async function siegelGueltig(m: WebManifest, schluessel: JsonWebKey): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('jwk', schluessel, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, vonBase64url(m.sig), new TextEncoder().encode(siegelNachricht(m)));
  } catch {
    return false;
  }
}

export type WebAktion = 'aktuell' | 'apk-noetig' | 'laden';

/** Neuer als der laufende Stand? Passt er zur installierten APK (`nativ` = versionCode)? */
export function webAktion(m: WebManifest | undefined, laufend: number, nativ: number): WebAktion {
  if (!m || !Number.isFinite(nativ) || m.webCode <= laufend) return 'aktuell';
  return m.minNativeCode > nativ ? 'apk-noetig' : 'laden';
}

/** Nur HTTPS: die Download-URL aus Basis und Pfad; undefined bei unsicherer Basis (z.B. Entwicklung mit http). */
export const bundleUrl = (basis: string, m: WebManifest): string | undefined => (basis.startsWith('https://') ? basis.replace(/\/+$/, '') + m.pfad : undefined);

/** Ist der Hinweis zu zeigen? Übersprungen werden kann nur Stufe normal, und nur genau bis zum gemerkten webCode. */
export const zeigen = (a: Angebot, uebersprungen: number | undefined): boolean =>
  a.stufe !== 'normal' || uebersprungen === undefined || a.webCode > uebersprungen;

/** Was vom Plugin (@capgo/capacitor-updater) gebraucht wird. */
export interface Lader {
  list(): Promise<{ bundles: { id: string; version: string; status: string }[] }>;
  download(o: { url: string; version: string; checksum: string }): Promise<{ id: string }>;
  set(o: { id: string }): Promise<void>;
}

export interface WebUpdateUmgebung {
  lader: Lader;
  schluessel: JsonWebKey;
  /** Laufender Stand (__WEB_CODE__). */
  laufend: number;
  /** Server-Basis (https), von der das Bundle kommt. */
  basis: string;
  /** Antwort von /app/web.json (undefined, wenn nicht da); darf werfen (offline). */
  manifest(): Promise<unknown>;
  /** versionCode der installierten APK. */
  nativ(): Promise<number>;
  /** Hinweis «Neue Version bereit · Neu laden» zeigen. */
  bereit(a: Angebot): void;
  /** Gerätespeicher (localStorage über lies/schreibe aus ui.svelte.ts). */
  lies(key: string): string | null;
  schreibe(key: string, wert: string | null): void;
}

const K_ANGEBOT = 'lagebild.update.angebot'; // { id, webCode, stufe, protokoll } des geladenen, noch nicht aktiven Stands
const K_UEBERSPRUNGEN = 'lagebild.update.uebersprungen'; // webCode

function liesJson(text: string | null): unknown {
  try {
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Lädt gesiegelte Stände im Hintergrund und meldet sie als bereit. Aktiviert (`set`) wird ausschliesslich in
 * aktivieren(), also nach Antippen von «Neu laden»; nie beim Start oder beim Wechsel in den Hintergrund.
 */
export function webUpdater(u: WebUpdateUmgebung): { start(): Promise<void>; pruefe(): Promise<void>; aktivieren(): Promise<void>; ueberspringen(): void } {
  let bereit: (Angebot & { id: string }) | undefined; // geladener, noch nicht aktiver Stand
  let laedt = false;
  const uebersprungen = (): number | undefined => {
    const n = Number(u.lies(K_UEBERSPRUNGEN));
    return u.lies(K_UEBERSPRUNGEN) !== null && Number.isInteger(n) ? n : undefined;
  };
  /** Merkt den Stand; zeigt den Hinweis, ausser er wurde übersprungen. */
  const melde = (b: Angebot & { id: string }): void => {
    u.schreibe(K_ANGEBOT, JSON.stringify(b));
    if (!zeigen(b, uebersprungen())) return;
    bereit = b;
    u.bereit({ webCode: b.webCode, stufe: b.stufe, protokoll: b.protokoll });
  };

  return {
    /** Beim Start: ein früher geladener, noch nicht aktiver Stand wird erneut angeboten, nicht übernommen. Geladen wurde
     *  er nur nach gültigem Siegel (pruefe), und eine neue APK verwirft alte Bundles (resetWhenUpdate). */
    async start() {
      try {
        const g = liesJson(u.lies(K_ANGEBOT)) as Partial<Angebot & { id: string }> | undefined;
        if (!g || typeof g.id !== 'string' || !istZahl(g.webCode) || g.webCode <= u.laufend) return;
        if (!STUFEN.includes(g.stufe as Stufe) || !istZahl(g.protokoll)) return;
        const { bundles } = await u.lader.list();
        if (bundles.some((b) => b.id === g.id && b.status === 'pending' && b.version === String(g.webCode))) melde(g as Angebot & { id: string });
      } catch {
        /* weiter mit dem laufenden Stand */
      }
    },
    async pruefe() {
      if (laedt || bereit) return;
      laedt = true;
      try {
        const m = liesWebManifest(await u.manifest());
        if (!m || webAktion(m, u.laufend, await u.nativ()) !== 'laden') return;
        const url = bundleUrl(u.basis, m);
        if (!url) return;
        if (!(await siegelGueltig(m, u.schluessel))) return void console.warn(`Live-Update: Stand ${m.webCode} ohne gültiges Siegel, ignoriert`);
        if (!zeigen(m, uebersprungen())) return; // übersprungen: gar nicht erst laden
        const { bundles } = await u.lader.list();
        const da = bundles.find((b) => b.version === String(m.webCode));
        if (da?.status === 'error') return; // schon einmal nicht gestartet: nicht erneut laden, erst ein neuerer Stand
        const b = da?.status === 'pending' ? da : await u.lader.download({ url, version: String(m.webCode), checksum: m.sha256 });
        melde({ id: b.id, webCode: m.webCode, stufe: m.stufe, protokoll: m.protokoll });
      } catch {
        /* offline, Prüfsumme falsch o.ä.: nächster Versuch reicht */
      } finally {
        laedt = false;
      }
    },
    async aktivieren() {
      if (bereit) await u.lader.set({ id: bereit.id }); // lädt die Seite neu
    },
    /** «Diese Version überspringen»: nur Stufe normal; ein höherer webCode erscheint wieder. */
    ueberspringen() {
      if (bereit?.stufe !== 'normal') return;
      u.schreibe(K_UEBERSPRUNGEN, String(bereit.webCode));
      bereit = undefined;
    },
  };
}
