// Live-Update der Oberfläche in der Android-App: Manifest (`/app/web.json`, vom Server geliefert) prüfen und entscheiden.
// Reine Logik ohne Plugin-Aufrufe; das Laden und Aktivieren steht in update.svelte.ts.
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
}

const istZahl = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Prüft die Antwort von /app/web.json streng; undefined bei allem, was nicht passt (auch fremde Pfade). */
export function liesWebManifest(roh: unknown): WebManifest | undefined {
  if (typeof roh !== 'object' || roh === null) return undefined;
  const { webCode, webName, minNativeCode, url, sha256 } = roh as Record<string, unknown>;
  if (!istZahl(webCode) || webCode < 1 || !istZahl(minNativeCode)) return undefined;
  // Nur ein relativer Pfad zur eigenen Server-Basis; nie eine fremde URL
  if (typeof url !== 'string' || url !== `/app/web-${webCode}.zip`) return undefined;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return undefined;
  return { webCode, webName: typeof webName === 'string' ? webName.slice(0, 32) : String(webCode), minNativeCode, pfad: url, sha256 };
}

export type WebAktion = 'aktuell' | 'apk-noetig' | 'laden';

/** Neuer als der laufende Stand? Passt er zur installierten APK (`nativ` = versionCode)? */
export function webAktion(m: WebManifest | undefined, laufend: number, nativ: number): WebAktion {
  if (!m || !Number.isFinite(nativ) || m.webCode <= laufend) return 'aktuell';
  return m.minNativeCode > nativ ? 'apk-noetig' : 'laden';
}

/** Nur HTTPS: die Download-URL aus Basis und Pfad; undefined bei unsicherer Basis (z.B. Entwicklung mit http). */
export const bundleUrl = (basis: string, m: WebManifest): string | undefined => (basis.startsWith('https://') ? basis.replace(/\/+$/, '') + m.pfad : undefined);
