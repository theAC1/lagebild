// Führungsraster im Client: Zustand aus Snapshot/Deltas, Rechte, Sichtbarkeit pro Gerät, Ansprache für andere Teile der App.
import { SvelteMap } from 'svelte/reactivity';
import type { Punkt, Raster, RasterArt } from '../../../../shared/protocol.ts';
import { ansprache, RASTER_NAME, zelleVon, type Zelle } from '../../../../shared/raster.ts';
import { beiNachricht, darfAendern as darfVon, store } from '../../lib/store.svelte.ts';
import { lies, oeffne, schreibe, type ToastKnopf } from '../../lib/ui.svelte.ts';

export const ARTEN: RasterArt[] = ['grande', 'piccolo'];
const AUS_KEY = 'lagebild.raster.aus';

const ladeAus = (): RasterArt[] => {
  try {
    return (JSON.parse(lies(AUS_KEY) ?? '[]') as string[]).filter((a): a is RasterArt => ARTEN.includes(a as RasterArt));
  } catch {
    return [];
  }
};

class RasterZustand {
  /** Vom Server bestätigte Raster je Art. */
  raster = new SvelteMap<RasterArt, Raster>();
  /** Ursprung während/nach dem Ziehen, bis der Server antwortet (lokale Vorschau). */
  zieh = $state<{ art: RasterArt; e: number; n: number } | null>(null);
  /** Pro Gerät ausgeblendete Raster (Ebenen-Auswahl). */
  aus = $state<RasterArt[]>(ladeAus());
  /** Melden per Rasterposition: hervorgehobene Zelle bzw. Viertel. */
  markierung = $state<{ art: RasterArt; zelle: Zelle } | null>(null);
}
export const rz = new RasterZustand();

beiNachricht((m) => {
  if (m.typ === 'snapshot') {
    rz.raster.clear();
    for (const r of m.raster ?? []) rz.raster.set(r.art, r);
    rz.zieh = null;
  } else if (m.typ === 'raster') {
    rz.raster.set(m.raster.art, m.raster);
    if (rz.zieh?.art === m.raster.art) rz.zieh = null;
  } else if (m.typ === 'raster.geloescht') {
    rz.raster.delete(m.art);
    if (rz.zieh?.art === m.art) rz.zieh = null;
    if (rz.markierung?.art === m.art) rz.markierung = null;
  } else if (m.typ === 'fehler') rz.zieh = null; // abgelehnt: zurück auf den Serverstand
});

/** Raster wie angezeigt (mit lokaler Zieh-Vorschau). */
export function angezeigt(art: RasterArt): Raster | undefined {
  const r = rz.raster.get(art);
  return r && rz.zieh?.art === art ? { ...r, e: rz.zieh.e, n: rz.zieh.n } : r;
}

export const sichtbar = (art: RasterArt): boolean => !rz.aus.includes(art);
export function schalteSichtbar(art: RasterArt): void {
  rz.aus = sichtbar(art) ? [...rz.aus, art] : rz.aus.filter((a) => a !== art);
  schreibe(AUS_KEY, rz.aus.length ? JSON.stringify(rz.aus) : null);
}

/** Darf ich das Raster jetzt verschieben/ändern? Nicht fixiert: Ersteller oder Leitung; fixiert: niemand (Leitung löst zuerst). */
export const darfAendern = (r: Raster): boolean => !r.fixiert && darfVon(r.von);
/** Fixieren (offen) bzw. lösen und löschen (fixiert). */
export const darfFixieren = (r: Raster): boolean => (r.fixiert ? store.istLeitung : darfVon(r.von));

/** Fixierte Raster: nur sie gelten für die Ansprache (eine Vorschau kann sich noch bewegen). */
export const fixierte = (): Raster[] => ARTEN.map((a) => rz.raster.get(a)).filter((r): r is Raster => !!r?.fixiert);

/** «Grande H 09 C» je fixiertem Raster, in dem `p` liegt (Grande zuerst). */
export function rasterAnsprachen(p: Punkt | null | undefined): string[] {
  if (!p) return [];
  return fixierte().flatMap((r) => {
    const z = zelleVon(r, p);
    return z ? [`${RASTER_NAME[r.art]} ${ansprache(z)}`] : [];
  });
}
/** Für Koordinaten-Anzeigen anderer Teile (Radial-Menü «Koordinate»): «Grande H 09 C · Piccolo B 03 A» oder null. */
export const rasterAnsprache = (p: Punkt | null | undefined): string | null => rasterAnsprachen(p).join(' · ') || null;

/** Knopf «Rasterposition» für die Punktwahl beim Marker, solange ein fixiertes Raster existiert. */
export const rasterMeldenKnopf = (): ToastKnopf | undefined =>
  fixierte().length ? { label: 'Rasterposition', aktion: () => oeffne('raster', { melden: true }) } : undefined;

