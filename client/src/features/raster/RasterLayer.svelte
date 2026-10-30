<script lang="ts">
  // Führungsraster auf der Karte: Rahmen, Zell- und Viertellinien (MapLibre), Köpfe rundum (HTML, am freien Rand angeheftet),
  // Hervorhebung beim Melden und Ziehen einer nicht fixierten Vorschau (Ersteller oder Leitung, solange das Panel offen ist).
  import type { GeoJSONSource, LayerSpecification, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import type { RasterArt } from '../../../../shared/protocol.ts';
  import { linien, rahmen, vonLv95, zelleLv95, zellRing, zuLv95, type Lv95 } from '../../../../shared/raster.ts';
  import { groesse } from '../../lib/groesse.svelte.ts';
  import { getMap } from '../../lib/map.ts';
  import { send } from '../../lib/store.svelte.ts';
  import { istOffen, toast, ui } from '../../lib/ui.svelte.ts';
  import { koepfe, ohneUeberlappung, type Kopf } from './beschriftung.ts';
  import { sheetOben } from './karte.ts';
  import { angezeigt, ARTEN, darfAendern, rz, sichtbar } from './zustand.svelte.ts';

  const m = getMap();
  const Q = 'raster';
  const MARK = 'raster-markierung';
  const LINIE = '#111';
  const leer: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const koord = (p: { lat: number; lon: number }) => [p.lon, p.lat];
  /** Zellgrösse auf dem Bildschirm, ab der Zell- bzw. Viertellinien erscheinen. */
  const AB_PX = { zelle: 6, viertel: 110 };

  m.addSource(Q, { type: 'geojson', data: leer });
  m.addSource(MARK, { type: 'geojson', data: leer });
  const layer: LayerSpecification[] = [
    ...ARTEN.flatMap((art): LayerSpecification[] => {
      const f = (rolle: string) => ['all', ['==', ['get', 'art'], art], ['==', ['get', 'rolle'], rolle]] as never;
      return [
        { id: `${Q}-${art}-viertel`, type: 'line', source: Q, filter: f('viertel'), paint: { 'line-color': LINIE, 'line-width': 1, 'line-opacity': 0.7, 'line-dasharray': [3, 3] } },
        { id: `${Q}-${art}-zelle-saum`, type: 'line', source: Q, filter: f('zelle'), paint: { 'line-color': '#fff', 'line-width': 3, 'line-opacity': 0.4 } },
        { id: `${Q}-${art}-zelle`, type: 'line', source: Q, filter: f('zelle'), paint: { 'line-color': LINIE, 'line-width': 1.2, 'line-opacity': 0.9 } },
      ];
    }),
    { id: `${MARK}-flaeche`, type: 'fill', source: MARK, paint: { 'fill-color': '#ffeb3b', 'fill-opacity': 0.35 } },
    { id: `${MARK}-linie`, type: 'line', source: MARK, paint: { 'line-color': '#ffeb3b', 'line-width': 3 } },
    { id: `${Q}-rahmen-saum`, type: 'line', source: Q, filter: ['==', ['get', 'rolle'], 'rahmen'], paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.55 } },
    { id: `${Q}-rahmen`, type: 'line', source: Q, filter: ['all', ['==', ['get', 'rolle'], 'rahmen'], ['get', 'fixiert']], paint: { 'line-color': LINIE, 'line-width': 3 } },
    { id: `${Q}-vorschau`, type: 'line', source: Q, filter: ['all', ['==', ['get', 'rolle'], 'rahmen'], ['!', ['get', 'fixiert']]], paint: { 'line-color': LINIE, 'line-width': 3, 'line-dasharray': [2, 1.5] } },
  ];
  for (const l of layer) m.addLayer(l);

  /** Zoom, ab dem eine Zelle von `zellM` mindestens `px` Pixel misst (MapLibre: 512-px-Kacheln). */
  const zoomAb = (zellM: number, px: number, lat: number) => Math.max(0, Math.log2((40075016.686 * Math.cos((lat * Math.PI) / 180) * px) / (512 * zellM)));

  // Linien neu, wenn sich ein Raster, seine Vorschau oder die Sichtbarkeit ändert
  $effect(() => {
    const features: GeoJSON.Feature[] = [];
    for (const art of ARTEN) {
      const r = angezeigt(art);
      if (!r || !sichtbar(art)) continue;
      const lat = vonLv95({ e: r.e, n: r.n }).lat;
      m.setLayerZoomRange(`${Q}-${art}-viertel`, zoomAb(r.zellM, AB_PX.viertel, lat), 24);
      for (const id of [`${Q}-${art}-zelle`, `${Q}-${art}-zelle-saum`]) m.setLayerZoomRange(id, zoomAb(r.zellM, AB_PX.zelle, lat), 24);
      const props = { art, fixiert: r.fixiert };
      features.push(
        { type: 'Feature', properties: { ...props, rolle: 'rahmen' }, geometry: { type: 'LineString', coordinates: rahmen(r).map(koord) } },
        { type: 'Feature', properties: { ...props, rolle: 'zelle' }, geometry: { type: 'MultiLineString', coordinates: linien(r, 1).map((l) => l.map(koord)) } },
        { type: 'Feature', properties: { ...props, rolle: 'viertel' }, geometry: { type: 'MultiLineString', coordinates: linien(r, 2).map((l) => l.map(koord)) } },
      );
    }
    (m.getSource(Q) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    plane();
  });

  $effect(() => {
    const mk = rz.markierung;
    const r = mk && angezeigt(mk.art);
    const data: GeoJSON.FeatureCollection =
      r && mk ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [zellRing(r, mk.zelle).map(koord)] } }] } : leer;
    (m.getSource(MARK) as GeoJSONSource).setData(data);
  });

  // --- Köpfe rundum ---
  let frei: HTMLDivElement;
  let liste = $state<(Kopf & { art: RasterArt; fixiert: boolean })[]>([]);
  let geplant = 0;
  function plane() {
    if (!geplant) geplant = requestAnimationFrame(rechne);
  }
  function rechne() {
    geplant = 0;
    if (!frei) return;
    const k = m.getContainer().getBoundingClientRect();
    const f = frei.getBoundingClientRect();
    // Köpfe werden im freien Bereich positioniert; Karte und Bereich haben verschiedene Ursprünge
    const dx = f.left - k.left;
    const dy = f.top - k.top;
    const sheet = sheetOben(); // Hochformat: Köpfe über dem Sheet anheften statt dahinter
    const bereich = { links: dx, oben: dy, rechts: dx + f.width, unten: Math.min(dy + f.height, sheet === null ? Infinity : sheet - k.top) };
    const g = groesse.karte;
    const masse = { h: 24 * g, wSpalte: 30 * g, wZeile: 24 * g };
    const proj = (p: Lv95) => {
      const w = vonLv95(p);
      return m.project([w.lon, w.lat]);
    };
    // Vorrang bei Überdeckung: Namensschilder, dann Piccolo (liegt meist im Grande), dann Grande
    const alle = (['piccolo', 'grande'] as const).flatMap((art) => {
      const r = angezeigt(art);
      if (!r || !sichtbar(art)) return [];
      return koepfe(r, proj, bereich, masse).map((kopf) => ({
        ...kopf,
        text: kopf.seite === 'name' && !r.fixiert ? `${kopf.text} · Vorschau` : kopf.text,
        x: kopf.x - dx,
        y: kopf.y - dy,
        art,
        fixiert: r.fixiert,
      }));
    });
    alle.sort((a, b) => Number(b.seite === 'name') - Number(a.seite === 'name'));
    liste = ohneUeberlappung(alle, (k) => (k.text.length * 9 + 16) * g);
  }
  m.on('move', plane);
  m.on('resize', plane);
  $effect(() => {
    void groesse.karte;
    plane();
  });
  // Sheet auf/zu (nach der Einblend-Animation)
  $effect(() => {
    void ui.panels.length;
    const t = setTimeout(plane, 250);
    return () => clearTimeout(t);
  });

  // --- Ziehen (nur Vorschau, nur bei offenem Raster-Panel) ---
  let start: { art: RasterArt; maus: Lv95; e: number; n: number } | null = null;
  const lv = (e: MapMouseEvent | MapTouchEvent): Lv95 => zuLv95({ lat: e.lngLat.lat, lon: e.lngLat.lng });
  /** Ziehbares Raster unter dem Punkt (Piccolo zuerst, es liegt meist im Grande). */
  function ziehbar(p: Lv95): RasterArt | null {
    if (!istOffen('raster')) return null;
    for (const art of ['piccolo', 'grande'] as const) {
      const r = angezeigt(art);
      if (r && sichtbar(art) && darfAendern(r) && zelleLv95(r, p)) return art;
    }
    return null;
  }
  function unten(e: MapMouseEvent | MapTouchEvent) {
    if ('points' in e ? e.points.length !== 1 : e.originalEvent.button !== 0) return;
    const p = lv(e);
    const art = ziehbar(p);
    const r = art && angezeigt(art);
    if (!art || !r) return;
    e.preventDefault(); // Karte nicht mitschieben
    start = { art, maus: p, e: r.e, n: r.n };
  }
  function bewegt(e: MapMouseEvent | MapTouchEvent) {
    if (!start) {
      if (!('points' in e)) m.getCanvas().style.cursor = ziehbar(lv(e)) ? 'move' : '';
      return;
    }
    const p = lv(e);
    rz.zieh = { art: start.art, e: start.e + p.e - start.maus.e, n: start.n + p.n - start.maus.n };
  }
  function los() {
    if (!start) return;
    const { art } = start;
    start = null;
    const z = rz.zieh;
    const r = rz.raster.get(art);
    if (!z || z.art !== art || !r) return;
    const raster = { art, e: Math.round(z.e), n: Math.round(z.n), zeilen: r.zeilen, spalten: r.spalten, zellM: r.zellM };
    if (!send({ typ: 'raster.setzen', raster })) {
      rz.zieh = null;
      toast('Keine Verbindung – Raster nicht verschoben.');
    }
  }
  m.on('mousedown', unten);
  m.on('touchstart', unten);
  m.on('mousemove', bewegt);
  m.on('touchmove', bewegt);
  m.on('mouseup', los);
  m.on('touchend', los);
  addEventListener('pointerup', los); // losgelassen ausserhalb der Karte

  onDestroy(() => {
    cancelAnimationFrame(geplant);
    removeEventListener('pointerup', los);
    for (const [t, f] of [['move', plane], ['resize', plane], ['mousedown', unten], ['touchstart', unten], ['mousemove', bewegt], ['touchmove', bewegt], ['mouseup', los], ['touchend', los]] as const)
      m.off(t, f as never);
    for (const l of layer) if (m.getLayer(l.id)) m.removeLayer(l.id);
    for (const q of [Q, MARK]) if (m.getSource(q)) m.removeSource(q);
  });
</script>

<div class="raster-frei" bind:this={frei} aria-hidden="true">
  {#each liste as k, i (i)}
    <div class="kopf {k.seite}" class:vorschau={!k.fixiert} style="left:{k.x}px;top:{k.y}px;{k.w ? `width:${k.w}px;` : ''}height:{k.h}px">{k.text}</div>
  {/each}
</div>

<style>
  /* Freier Kartenbereich: ohne Kopfzeile, Banner, Leisten und Seitenpanels (Variablen aus app.css) */
  .raster-frei {
    position: fixed;
    top: calc(var(--oben) + var(--banner-h, 0px));
    bottom: var(--unten);
    left: var(--links, 0px);
    right: var(--rechts, 0px);
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
  }
  /* Kräftige Kästchen wie in Juans Vorlage, Farben nach Tag/Nacht */
  .kopf {
    position: absolute;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border: 2px solid var(--karte-text);
    background: var(--karte-bg);
    color: var(--karte-text);
    font: 800 calc(14px * var(--karte)) / 1 ui-monospace, 'SF Mono', Menlo, monospace;
    letter-spacing: 0.02em;
  }
  .kopf.name {
    padding: 0 6px;
    font-family: inherit;
    font-size: calc(12px * var(--karte));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }
  .kopf.vorschau {
    border-style: dashed;
  }
</style>
