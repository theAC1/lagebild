<script lang="ts">
  import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { getMap } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { ALT_MS, seitFuer, spurLinien } from './logik.ts';
  import { spuren, spurFarbe, starte } from './zustand.svelte.ts';

  const m = getMap();
  const QUELLE = 'spuren';
  const LAYER = [`${QUELLE}-rand`, `${QUELLE}-linie`];
  const leer: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;
  const alt: ExpressionSpecification = ['case', ['get', 'alt'], 0.4, 1];

  m.addSource(QUELLE, { type: 'geojson', data: leer });
  // Dunkler Rand unter der Farbe: lesbar auf Landeskarte und Luftbild
  m.addLayer({ id: LAYER[0], type: 'line', source: QUELLE, layout, paint: { 'line-color': '#161b1f', 'line-width': 6, 'line-opacity': ['*', 0.7, alt] } });
  m.addLayer({ id: LAYER[1], type: 'line', source: QUELLE, layout, paint: { 'line-color': ['get', 'farbe'], 'line-width': 3, 'line-opacity': alt } });

  const stopp = starte();

  $effect(() => {
    const jetzt = store.jetzt; // tickt alle 5 s → Fenster und «alt» wandern mit
    const linien = spurLinien(spuren.daten, spuren.sichtbar, spurFarbe, seitFuer(spuren.fenster, jetzt), jetzt - ALT_MS);
    (m.getSource(QUELLE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: linien });
  });

  onDestroy(() => {
    stopp();
    try {
      for (const id of LAYER) if (m.getLayer(id)) m.removeLayer(id);
      if (m.getSource(QUELLE)) m.removeSource(QUELLE);
    } catch {
      /* Karte bereits entfernt */
    }
  });
</script>
