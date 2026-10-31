// Welche Namensfamilie ein Objekt der swisstopo-Vektorkachel (ch.swisstopo.base.vt) hat, aus Layer und Klasse.
// Klassen laut docs/recherche/gelaendetaufe.md 1.1/1.5 (TileJSON vector_layers, live geprüft 30.10.2026).
import { STANDARD_TAUFNAMEN, taufSchluessel, type Lage, type Taufe, type TaufFamilie } from '../../../../shared/protocol.ts';

export const FAMILIE_LABEL: Record<TaufFamilie, string> = { gebaeude: 'Gebäude', strasse: 'Strasse', gewaesser: 'Gewässer', wald: 'Wald', flaeche: 'Fläche' };

/** Fahrbare Wege inkl. Feldwege (track); Fuss- und Wanderwege (`path`) zählen nicht (Juan, 30.10.). */
export const STRASSEN_KLASSEN = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'track'];
export const GEBAEUDE_OHNE = ['underground', 'chimney', 'covered_bridge'];
export const BAECHE = ['river', 'stream', 'canal', 'drain', 'ditch'];

/** Vorrang bei Überlagerung: Gebäude > Gewässer (Linie) > Strasse > Gewässer (Fläche). */
export const VORRANG = ['building', 'waterway', 'transportation', 'water'];

export function familieVon(sourceLayer: string, props: Record<string, unknown>): TaufFamilie | null {
  const klasse = String(props.class ?? '');
  switch (sourceLayer) {
    case 'building':
      return GEBAEUDE_OHNE.includes(klasse) ? null : 'gebaeude';
    case 'transportation':
      return STRASSEN_KLASSEN.includes(klasse) ? 'strasse' : null;
    case 'waterway':
      return BAECHE.includes(klasse) ? 'gewaesser' : null;
    case 'water':
      return klasse === 'pool' ? null : 'gewaesser';
    // Wald und Flächen werden gezeichnet, nicht erkannt (Juan, 31.10.: Tipp auf die Wiese nahm «einen Riesenbereich»)
    default:
      return null;
  }
}

export type Kandidat = { sourceLayer: string; properties: Record<string, unknown> };

/** Bester Treffer unter dem Finger (nach VORRANG), mit Familie; null, wenn nichts taufbar ist. */
export function waehleTreffer<K extends Kandidat>(treffer: K[]): { k: K; familie: TaufFamilie } | null {
  const taufbar = treffer.map((k) => ({ k, familie: familieVon(k.sourceLayer, k.properties) })).filter((x): x is { k: K; familie: TaufFamilie } => !!x.familie);
  taufbar.sort((a, b) => VORRANG.indexOf(a.k.sourceLayer) - VORRANG.indexOf(b.k.sourceLayer));
  return taufbar[0] ?? null;
}

/** Linienförmig (Abschnitt bis zur Kreuzung, verlängerbar) statt Fläche. */
export const istLinienLayer = (sourceLayer: string): boolean => sourceLayer === 'transportation' || sourceLayer === 'waterway';

/** Namensliste der Familie in dieser Lage (angepasst durch die Leitung, sonst Vorgabe). */
export const listeVon = (lage: Pick<Lage, 'taufListen'> | null, f: TaufFamilie): string[] => lage?.taufListen?.[f] ?? STANDARD_TAUFNAMEN[f];

/** Freie Namen der Familie in Listenreihenfolge (vergeben = in irgendeiner Taufe der Lage, ohne `ausser`). */
export function freieNamen(lage: Pick<Lage, 'taufListen'> | null, f: TaufFamilie, taufen: Iterable<Pick<Taufe, 'id' | 'name'>>, ausser?: string): string[] {
  const vergeben = new Set([...taufen].filter((t) => t.id !== ausser).map((t) => taufSchluessel(t.name)));
  return listeVon(lage, f).filter((n) => !vergeben.has(taufSchluessel(n)));
}

/** Liste aus Freitext (eine Zeile oder Komma je Name), getrimmt, ohne Leere und Doppelte. */
export function listeAusText(text: string): string[] {
  const gesehen = new Set<string>();
  return text
    .split(/[\n,]/)
    .map((n) => n.trim().replace(/\s+/g, ' ').slice(0, 40))
    .filter((n) => n && !gesehen.has(taufSchluessel(n)) && gesehen.add(taufSchluessel(n)));
}
