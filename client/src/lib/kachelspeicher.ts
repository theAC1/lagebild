// Kachelspeicher der Offline-Gebiete (Cache Storage) und MapLibre-Protokoll «kachel://»: zuerst lokal, dann Netz.
// Gilt gleich in der PWA und in der Android-App (dort ohne Service Worker). In der PWA geht der Netzweg weiter durch
// den Workbox-Cache «swisstopo-kacheln» (angezeigte Kacheln); Offline-Gebiete laden an ihm vorbei (vite.config.ts).
import { addProtocol, AJAXError } from 'maplibre-gl';

export const KACHEL_CACHE = 'lagebild-offline-kacheln';
/** Workbox-Runtime-Cache der PWA (vite.config.ts) */
export const ANSICHT_CACHE = 'swisstopo-kacheln';
const PROTOKOLL = 'kachel';

/** https-Kachel-URL → URL fürs MapLibre-Protokoll (für `tiles` in Raster- und Vektorquellen). */
export const lokal = (url: string): string => url.replace(/^https:\/\//, `${PROTOKOLL}://`);

/** Cache Storage gibt es nur in sicheren Kontexten (https, localhost); sonst null. */
export function oeffneSpeicher(name = KACHEL_CACHE): Promise<Cache | null> {
  if (typeof caches === 'undefined') return Promise.resolve(null);
  return caches.open(name).catch(() => null);
}

let speicher: Promise<Cache | null> | null = null;
let treffer: ((url: string) => void) | null = null;

/** Hörer für Kacheln, die aus dem Speicher angezeigt wurden («zuletzt genutzt» der Gebiete). */
export function beiTreffer(fn: ((url: string) => void) | null): void {
  treffer = fn;
}

// Fehlt eine Kachel ohne Netz, meldet das Protokoll 404: MapLibre zeigt dann still die gröbere Stufe statt eines
// Fehlers pro Kachel (tile_manager feuert «error» nur bei status ≠ 404).
const fehlt = (url: string) => new AJAXError(404, 'nicht offline verfügbar', url, new Blob());

let registriert = false;
export function registriereKachelProtokoll(): void {
  if (registriert) return;
  registriert = true;
  addProtocol(PROTOKOLL, async (params, abort) => {
    const url = params.url.replace(`${PROTOKOLL}://`, 'https://');
    speicher ??= oeffneSpeicher();
    const da = await (await speicher)?.match(url).catch(() => undefined);
    if (da) {
      treffer?.(url);
      return { data: await da.arrayBuffer() };
    }
    let r: Response;
    try {
      r = await fetch(url, { signal: abort.signal });
    } catch (e) {
      if (abort.signal.aborted) throw e;
      throw fehlt(url);
    }
    if (!r.ok) throw new AJAXError(r.status, r.statusText, url, new Blob());
    return { data: await r.arrayBuffer(), cacheControl: r.headers.get('cache-control'), expires: r.headers.get('expires') };
  });
}
