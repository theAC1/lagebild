// swisstopo-WMTS-Layer (EPSG:3857). Je Layer per curl bei Bern geprüft (28.10.2026): maxzoom = höchste Stufe mit HTTP 200.
export type Basiskarte = 'farbe' | 'grau' | 'winter' | 'luftbild';
export type Overlay = 'hangneigung' | 'relief' | 'namen' | 'schiessen' | 'drohnen';

export interface KartenLayer<T extends string> {
  id: T;
  label: string;
  layer: string; // geo.admin.ch Layer-ID
  ext: 'jpeg' | 'png';
  maxzoom: number;
  attribution: string;
  deckkraft?: number;
}

const SWISSTOPO = '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>';

export const BASISKARTEN: KartenLayer<Basiskarte>[] = [
  { id: 'farbe', label: 'Landeskarte', layer: 'ch.swisstopo.pixelkarte-farbe', ext: 'jpeg', maxzoom: 19, attribution: SWISSTOPO },
  { id: 'grau', label: 'Landeskarte grau', layer: 'ch.swisstopo.pixelkarte-grau', ext: 'jpeg', maxzoom: 19, attribution: SWISSTOPO },
  { id: 'winter', label: 'Landeskarte Winter', layer: 'ch.swisstopo.pixelkarte-farbe-winter', ext: 'jpeg', maxzoom: 19, attribution: SWISSTOPO },
  {
    id: 'luftbild',
    label: 'Luftbild',
    layer: 'ch.swisstopo.swissimage',
    ext: 'jpeg',
    maxzoom: 20,
    attribution: `${SWISSTOPO} · CNES, Spot Image, swisstopo, NPOC`,
  },
];

export const OVERLAYS: KartenLayer<Overlay>[] = [
  { id: 'relief', label: 'Relief', layer: 'ch.swisstopo.swissalti3d-reliefschattierung_monodirektional', ext: 'png', maxzoom: 18, attribution: SWISSTOPO, deckkraft: 0.35 },
  { id: 'hangneigung', label: 'Hangneigung ≥ 30°', layer: 'ch.swisstopo.hangneigung-ueber_30', ext: 'png', maxzoom: 17, attribution: SWISSTOPO, deckkraft: 0.4 },
  { id: 'namen', label: 'Ortsnamen', layer: 'ch.swisstopo.swissnames3d', ext: 'png', maxzoom: 17, attribution: SWISSTOPO },
  { id: 'schiessen', label: 'Schiessanzeigen', layer: 'ch.vbs.schiessanzeigen', ext: 'png', maxzoom: 18, attribution: 'Schweizer Armee', deckkraft: 0.6 },
  { id: 'drohnen', label: 'Drohnen-Einschränkungen', layer: 'ch.bazl.einschraenkungen-drohnen', ext: 'png', maxzoom: 18, attribution: 'BAZL', deckkraft: 0.5 },
];

/** Abdeckung laut WMTSCapabilities (WGS84); ausserhalb liefert swisstopo HTTP 400 → gar nicht erst anfragen. */
export const ABDECKUNG: [number, number, number, number] = [5.140242, 45.398181, 11.47757, 48.230651];

export const kachelUrl = (l: KartenLayer<string>) =>
  `https://wmts.geo.admin.ch/1.0.0/${l.layer}/default/current/3857/{z}/{x}/{y}.${l.ext}`;

/**
 * swisstopo-Basiskarte als Vektorkacheln (Datenquelle der Geländetaufe, docs/recherche/gelaendetaufe.md 1.1).
 * Offline-Gebiete legen sie unter dieser URL in den Kachelspeicher; eine Vektorquelle bekommt sie mit
 * `tiles: [lokal(TAUFE_VT.vorlage)]` (lib/kachelspeicher.ts) zuerst von dort, dann aus dem Netz.
 */
export const TAUFE_VT = {
  vorlage: 'https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf',
  maxzoom: 14, // z15 → HTTP 404
};
