// Wiedergabe in AN (Spec v6): LV-Zeitleiste ohne AP-Abschnitte, Faltung des Ereignisprotokolls bis zu einem Zeitpunkt,
// Position aus der Spur. Rein und testbar; die Anzeige (zustand.svelte.ts) schreibt das Ergebnis in den Store.
import type {
  Alarm, BloodhoundAuftrag, Chat, Ebene, Marker, Meldung, PhasenWechsel, Position, ProtokollEintrag, Raster, RasterArt, ServerMsg, Sichtung, Taufe, Zeichnung,
} from '../../../../shared/protocol.ts';

export type Fenster = { von: number; bis: number };

/** LV-Zeiträume aus dem Phasenverlauf; ein noch offenes LV endet bei `jetzt`. */
export function lvFenster(phasen: PhasenWechsel[], jetzt: number): Fenster[] {
  return phasen.flatMap((p, i) => (p.phase === 'lv' ? [{ von: p.t, bis: phasen[i + 1]?.t ?? jetzt }] : []));
}

export const dauer = (f: Fenster[]): number => f.reduce((n, x) => n + (x.bis - x.von), 0);

/** Versatz auf der Zeitleiste (nur LV) → echte Zeit; ausserhalb an den Rand geklemmt. */
export function zeitAus(f: Fenster[], versatz: number): number {
  let rest = Math.max(0, versatz);
  for (const x of f) {
    if (rest <= x.bis - x.von) return x.von + rest;
    rest -= x.bis - x.von;
  }
  return f.at(-1)?.bis ?? 0;
}

/** Echte Zeit → Versatz; in einer AP-Lücke die Naht davor. */
export function versatzAus(f: Fenster[], t: number): number {
  let n = 0;
  for (const x of f) {
    if (t < x.von) return n;
    if (t <= x.bis) return n + (t - x.von);
    n += x.bis - x.von;
  }
  return n;
}

export type Stand = {
  marker: Map<string, Marker>;
  sichtungen: Map<string, Sichtung>;
  ebenen: Map<string, Ebene>;
  zeichnungen: Map<string, Zeichnung>;
  taufen: Map<string, Taufe>;
  /** nur offene */
  bloodhound: Map<string, BloodhoundAuftrag>;
  alarme: Map<string, Alarm>;
  raster: Map<RasterArt, Raster>;
  chat: Chat[];
  meldungen: Meldung[];
};

export const leererStand = (ebenen: Ebene[]): Stand => ({
  marker: new Map(), sichtungen: new Map(), ebenen: new Map(ebenen.map((x) => [x.id, x])), zeichnungen: new Map(), taufen: new Map(),
  bloodhound: new Map(), alarme: new Map(), raster: new Map(), chat: [], meldungen: [],
});

/** Ein Delta in den Stand übernehmen (der Stand gehört dem Aufrufer und wird verändert). */
export function uebernimm(s: Stand, d: ServerMsg): void {
  switch (d.typ) {
    case 'marker': s.marker.set(d.marker.id, d.marker); break;
    case 'marker.geloescht': s.marker.delete(d.id); break;
    case 'sichtung': s.sichtungen.set(d.sichtung.id, d.sichtung); break;
    case 'ebene': s.ebenen.set(d.ebene.id, d.ebene); break;
    case 'ebene.geloescht':
      s.ebenen.delete(d.id);
      for (const id of d.zeichnungIds) s.zeichnungen.delete(id);
      break;
    case 'zeichnungen': for (const z of d.zeichnungen) s.zeichnungen.set(z.id, z); break;
    case 'zeichnungen.geloescht': for (const id of d.ids) s.zeichnungen.delete(id); break;
    case 'taufe': s.taufen.set(d.taufe.id, d.taufe); break;
    case 'taufe.geloescht': s.taufen.delete(d.id); break;
    case 'bloodhound':
      if (d.auftrag.ende === null) s.bloodhound.set(d.auftrag.id, d.auftrag);
      else s.bloodhound.delete(d.auftrag.id);
      break;
    case 'raster': s.raster.set(d.raster.art, d.raster); break;
    case 'raster.geloescht': s.raster.delete(d.art); break;
    case 'alarm': s.alarme.set(d.alarm.id, d.alarm); break;
    case 'chat': s.chat.push(d.chat); break;
    case 'meldung': s.meldungen.push(d.meldung); break;
  }
}

/**
 * Faltet das Protokoll bis zu einem Zeitpunkt. Vorwärts baut sie auf dem letzten Stand auf (Abspielen), zurück
 * beginnt sie von vorn. `version` zählt die übernommenen Ereignisse: gleich = Objekte unverändert.
 */
export class Falter {
  #ereignisse: ProtokollEintrag[];
  #ebenen: Ebene[];
  #stand: Stand;
  #i = 0;
  constructor(ereignisse: ProtokollEintrag[], ebenen: Ebene[]) {
    this.#ereignisse = ereignisse;
    this.#ebenen = ebenen;
    this.#stand = leererStand(ebenen);
  }
  stand(bis: number): Stand & { version: number } {
    if (this.#i > 0 && this.#ereignisse[this.#i - 1].t > bis) {
      this.#stand = leererStand(this.#ebenen);
      this.#i = 0;
    }
    while (this.#i < this.#ereignisse.length && this.#ereignisse[this.#i].t <= bis) uebernimm(this.#stand, this.#ereignisse[this.#i++].d);
    return { ...this.#stand, version: this.#i };
  }
}

/** Letzte Position bis `t` (Spur aufsteigend nach Zeit), Binärsuche. */
export function posBei(spur: Position[] | undefined, t: number): Position | null {
  if (!spur?.length || spur[0].t > t) return null;
  let lo = 0;
  let hi = spur.length - 1;
  while (lo < hi) {
    const mitte = (lo + hi + 1) >> 1;
    if (spur[mitte].t <= t) lo = mitte;
    else hi = mitte - 1;
  }
  return spur[lo];
}
