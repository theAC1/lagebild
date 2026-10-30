<script lang="ts">
  import { AttributionControl, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
  // MapLibre 6 sucht den Worker relativ zu import.meta.url – im Bundle existiert der nicht, darum explizit als Asset.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { onMount, type Snippet } from 'svelte';
  import { oeffneRadial, setzeKarte, zielUnter } from '../lib/map.ts';
  import { zeigeDetails } from '../lib/radialKern.ts';
  import { ABDECKUNG, BASISKARTEN, kachelUrl, OVERLAYS, type Overlay } from '../lib/karten.ts';
  import { store } from '../lib/store.svelte.ts';
  import { ui } from '../lib/ui.svelte.ts';

  let { children }: { children?: Snippet } = $props();
  setWorkerUrl(workerUrl);

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

    // Langdruck (Touch) bzw. Rechtsklick → Radial-Menü auf einem Symbol, sonst Kontextmenü mit Koordinate
    let zuletzt = { t: 0, x: 0, y: 0 };
    const langdruck = (x: number, y: number) => {
      // Langdruck erkennt MapLibre selbst (auch iOS); Android feuert zusätzlich ein natives contextmenu an derselben Stelle
      const doppelt = Date.now() - zuletzt.t < 500 && Math.hypot(x - zuletzt.x, y - zuletzt.y) < 10;
      if (doppelt || ui.punktWahl) return;
      zuletzt = { t: Date.now(), x, y };
      const z = zielUnter(x, y);
      if (z) return oeffneRadial(z.ziel, z.x, z.y);
      const r = el.getBoundingClientRect();
      const p = m.unproject([x - r.left, y - r.top]);
      ui.radial = null;
      ui.kontext = { lat: p.lat, lon: p.lng };
      navigator.vibrate?.(15);
    };
    m.on('contextmenu', (e) => langdruck(e.originalEvent.clientX, e.originalEvent.clientY)); // Browser-Menü sperrt App (keinBrowserMenu)
    // Doppelklick auf ein Symbol = Details statt Zoom; auf leerer Karte zoomt MapLibre selbst
    m.on('dblclick', (e) => {
      const z = zielUnter(e.originalEvent.clientX, e.originalEvent.clientY);
      if (!z) return;
      e.preventDefault();
      zeigeDetails(z.ziel);
    });
    m.on('click', () => (ui.kontext = null));
    m.on('dragstart', () => {
      ui.folgen = false;
      ui.folgtTeilnehmer = null;
    });
    // Container ändert die Grösse ohne Fenster-Resize (Seitenpanels, Werkzeugleiste im Querformat)
    const beobachter = new ResizeObserver(() => m.resize());
    beobachter.observe(el);
    m.on('load', () => {
      setzeKarte(m);
      bereit = true;
    });
    return () => {
      beobachter.disconnect();
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
    /* Querformat: Platz für Seitenpanels links und Werkzeugleiste rechts (app.css) */
    left: var(--karte-l, 0px);
    right: var(--karte-r, 0px);
    background: #2b3136;
  }
</style>
