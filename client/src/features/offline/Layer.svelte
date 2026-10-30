<script lang="ts">
  // Umrisse der Offline-Gebiete (schaltbar), Aufziehen-Modus; startet Ablauf-Prüfung und unterbrochene Downloads.
  import type { GeoJSONSource } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { beiTreffer } from '../../lib/kachelspeicher.ts';
  import { getMap } from '../../lib/map.ts';
  import Aufziehen from './Aufziehen.svelte';
  import { offline, starte } from './zustand.svelte.ts';

  const QUELLE = 'offline-umrisse';
  const m = getMap();

  m.addSource(QUELLE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({ id: QUELLE, type: 'line', source: QUELLE, paint: { 'line-color': '#ff9f1c', 'line-width': 2, 'line-dasharray': [3, 2] } });

  $effect(() => {
    const features = offline.gebiete.map(({ id, bbox: [w, s, e, n] }) => ({
      type: 'Feature' as const,
      properties: { id },
      geometry: { type: 'LineString' as const, coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] },
    }));
    (m.getSource(QUELLE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  });
  $effect(() => {
    if (m.getLayer(QUELLE)) m.setLayoutProperty(QUELLE, 'visibility', offline.umrisse ? 'visible' : 'none');
  });

  starte();

  onDestroy(() => {
    beiTreffer(null);
    if (m.getLayer(QUELLE)) m.removeLayer(QUELLE);
    if (m.getSource(QUELLE)) m.removeSource(QUELLE);
  });
</script>

{#if offline.aufziehen}<Aufziehen />{/if}
