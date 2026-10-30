// Download eines Offline-Gebiets: gedrosselt (Fair Use geo.admin.ch, docs/recherche/offline-gebiete.md), wiederaufnehmbar.
// Browser-APIs kommen als Parameter, damit die Wiederaufnahme ohne Browser testbar ist (laden.test.ts).
import { anzahl, bereiche, kachelBei, urlVon, type Gebiet } from './kacheln.ts';

/** Gleichzeitige Anfragen eines Geräts. */
export const PARALLEL = 4;
/** Mindestabstand zwischen zwei Anfragen je Dienst: WMTS ≤ 6/s (Limit 1200/min), Vektorkacheln ≤ 30/min (Limit 40/min). */
export const ABSTAND_MS: Record<string, number> = { 'wmts.geo.admin.ch': 1000 / 6, 'vectortiles.geo.admin.ch': 2000 };
/** Pause nach Netzfehler bzw. Serverfehler (429/5xx), bevor dieselbe Kachel nochmals kommt. */
export const WARTEN_NETZ_MS = 10_000;
export const WARTEN_SERVER_MS = 30_000;

export interface Werkzeug {
  speicher: Cache;
  /** Workbox-Cache der angezeigten Kacheln (PWA): was dort schon liegt, wird verschoben statt neu geladen. */
  ansicht: Cache | null;
  holen: typeof fetch;
  schlafe: (ms: number) => Promise<void>;
  jetzt: () => number;
}

export interface Stand {
  erledigt: number;
  bytes: number;
  /** true, solange ein Netzfehler den Download aufhält */
  wartet: boolean;
}

/** Startzeiten je Dienst auseinanderziehen (gilt für alle Arbeiter zusammen). */
export function drossel(w: Pick<Werkzeug, 'schlafe' | 'jetzt'>): (url: string) => Promise<void> {
  const frei = new Map<string, number>();
  return async (url) => {
    const host = new URL(url).hostname;
    const jetzt = w.jetzt();
    const start = Math.max(jetzt, frei.get(host) ?? 0);
    frei.set(host, start + (ABSTAND_MS[host] ?? 1000));
    if (start > jetzt) await w.schlafe(start - jetzt);
  };
}

async function groesse(r: Response): Promise<number> {
  return Number(r.headers.get('content-length')) || (await r.blob()).size;
}

async function lege(w: Werkzeug, url: string, daten: ArrayBuffer, typ: string | null): Promise<number> {
  await w.speicher.put(url, new Response(daten, { headers: { 'content-type': typ ?? '', 'content-length': String(daten.byteLength) } }));
  return daten.byteLength;
}

/** Eine Kachel holen und ablegen; liefert die Bytes oder null, wenn abgebrochen. */
async function ladeKachel(w: Werkzeug, url: string, erneuern: boolean, warte: (url: string) => Promise<void>, weiter: () => boolean, netz: (ok: boolean) => void): Promise<number | null> {
  if (!erneuern) {
    const da = await w.speicher.match(url);
    if (da) return groesse(da);
    const alt = await w.ansicht?.match(url);
    if (alt?.ok) {
      const n = await lege(w, url, await alt.arrayBuffer(), alt.headers.get('content-type'));
      await w.ansicht!.delete(url);
      return n;
    }
  }
  for (;;) {
    if (!weiter()) return null;
    await warte(url);
    if (!weiter()) return null;
    let r: Response;
    try {
      r = await w.holen(url, { cache: 'no-store' });
    } catch {
      netz(false);
      await w.schlafe(WARTEN_NETZ_MS);
      continue;
    }
    netz(true);
    if (r.status === 400 || r.status === 404) return 0; // ausserhalb der Daten: gibt es nicht, zählt als erledigt
    if (!r.ok) {
      await w.schlafe(WARTEN_SERVER_MS);
      continue;
    }
    return lege(w, url, await r.arrayBuffer(), r.headers.get('content-type'));
  }
}

/**
 * Lädt ab `g.erledigt` weiter, bis alles da ist oder `weiter()` false liefert (Pause, Löschen).
 * `melde` bekommt den Stand; `erledigt` wächst nur über lückenlos fertige Kacheln, damit ein Abbruch nichts auslässt.
 * Wirft bei Speicherfehlern (z.B. QuotaExceededError), nachdem die übrigen Arbeiter angehalten haben.
 */
export async function ladeGebiet(g: Gebiet, w: Werkzeug, weiter: () => boolean, melde: (s: Stand) => void): Promise<'fertig' | 'angehalten'> {
  const bs = bereiche(g);
  const gesamt = anzahl(bs);
  const warte = drossel(w);
  let erledigt = Math.min(g.erledigt, gesamt);
  let bytes = g.bytes;
  let naechste = erledigt;
  let wartet = false;
  let fehler: unknown = null;
  const fertig = new Map<number, number>(); // Index → Bytes, fertig, aber vor ihr fehlt noch eine
  const laeuft = () => fehler === null && weiter();
  const netz = (ok: boolean) => {
    if (wartet === ok) {
      wartet = !ok;
      melde({ erledigt, bytes, wartet });
    }
  };

  async function arbeiter(): Promise<void> {
    while (laeuft() && naechste < gesamt) {
      const i = naechste++;
      let n: number | null;
      try {
        n = await ladeKachel(w, urlVon(kachelBei(bs, i)), !!g.erneuern, warte, laeuft, netz);
      } catch (e) {
        fehler ??= e;
        return;
      }
      if (n === null) return;
      fertig.set(i, n);
      while (fertig.has(erledigt)) {
        bytes += fertig.get(erledigt)!;
        fertig.delete(erledigt++);
      }
      melde({ erledigt, bytes, wartet });
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));
  if (fehler) throw fehler;
  return erledigt >= gesamt ? 'fertig' : 'angehalten';
}
