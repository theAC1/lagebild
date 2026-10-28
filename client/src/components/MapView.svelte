<script lang="ts">
  import { AttributionControl, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
  // MapLibre 6 sucht den Worker relativ zu import.meta.url – im Bundle existiert der nicht, darum explizit als Asset.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { onMount, type Snippet } from 'svelte';
  import { setzeKarte } from '../lib/map.ts';
  import { ABDECKUNG, BASISKARTEN, kachelUrl, OVERLAYS, type Overlay } from '../lib/karten.ts';
  import { store } from '../lib/store.svelte.ts';
  import { ui } from '../lib/ui.svelte.ts';

  let { children }: { children?: Snippet } = $props();
  setWorkerUrl(workerUrl);

  const LANGDRUCK_MS = 550;

  let el: HTMLDivElement;
  let karte: MapLibreMap | undefined;
  let bereit = $state(false);

  function stil(): StyleSpecification {
    const { basiskarte, overlays } = store.einstellungen;
    const alle = [...BASISKARTEN, ...OVERLAYS];
    return {
      version: 8,
      sources: Object.fromEntries(
        alle.map((l) => [
          l.id,
          { type: 'raster', tiles: [kachelUrl(l)], tileSize: 256, maxzoom: l.maxzoom, bounds: ABDECKUNG, attribution: l.attribution },
        ]),
      ),
      layers: alle.map((l) => ({
        id: `karte-${l.id}`,
        type: 'raster',
        source: l.id,
        paint: { 'raster-opacity': l.deckkraft ?? 1 },
        layout: { visibility: l.id === basiskarte || overlays.includes(l.id as Overlay) ? 'visible' : 'none' },
      })),
    };
  }

  onMount(() => {
    const m = new MapLibreMap({
      container: el,
      style: stil(),
      bounds: [
        [5.96, 45.82],
        [10.49, 47.81],
      ],
      maxBounds: [
        [4.4, 45.0],
        [12.2, 48.6],
      ],
      maxZoom: 20,
      maxPitch: 0,
      attributionControl: false,
    });
    karte = m;
    m.addControl(new NavigationControl({ showZoom: false, visualizePitch: false }), 'top-right');
    m.addControl(new ScaleControl({ unit: 'metric', maxWidth: 100 }), 'bottom-left');
    m.addControl(new AttributionControl({ compact: false }), 'bottom-right');
    m.touchZoomRotate.enable();

    // Langdruck (Touch) bzw. Rechtsklick → Kontextmenü mit Koordinate
    let zuletzt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | null = null;
    const kontext = (lat: number, lon: number) => {
      if (Date.now() - zuletzt < 800 || ui.punktWahl) return; // Android feuert zusätzlich contextmenu
      zuletzt = Date.now();
      ui.kontext = { lat, lon };
      navigator.vibrate?.(15);
    };
    const abbrechen = () => {
      clearTimeout(timer);
      start = null;
    };
    m.on('touchstart', (e) => {
      abbrechen();
      if (e.points.length !== 1) return;
      start = e.point;
      timer = setTimeout(() => kontext(e.lngLat.lat, e.lngLat.lng), LANGDRUCK_MS);
    });
    m.on('touchmove', (e) => {
      if (start && Math.hypot(e.point.x - start.x, e.point.y - start.y) > 10) abbrechen();
    });
    m.on('touchend', abbrechen);
    m.on('touchcancel', abbrechen);
    m.on('contextmenu', (e) => kontext(e.lngLat.lat, e.lngLat.lng));
    m.on('click', () => (ui.kontext = null));
    m.on('dragstart', () => (ui.folgen = false));
    m.on('load', () => {
      setzeKarte(m);
      bereit = true;
    });
    return () => {
      setzeKarte(null);
      m.remove();
    };
  });

  $effect(() => {
    const { basiskarte, overlays } = store.einstellungen;
    if (!bereit || !karte) return;
    for (const l of BASISKARTEN) karte.setLayoutProperty(`karte-${l.id}`, 'visibility', l.id === basiskarte ? 'visible' : 'none');
    for (const l of OVERLAYS) karte.setLayoutProperty(`karte-${l.id}`, 'visibility', overlays.includes(l.id) ? 'visible' : 'none');
  });
</script>

<div class="karte" bind:this={el}></div>
{#if bereit}{@render children?.()}{/if}

<style>
  .karte {
    position: fixed;
    inset: 0;
    background: #2b3136;
  }
</style>
