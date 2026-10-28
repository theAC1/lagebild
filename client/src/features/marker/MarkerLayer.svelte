<script lang="ts">
  import { Marker as MapMarker } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { getMap, registriereKontextAktion } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { symbolElement } from '../../lib/symbol.ts';
  import { oeffne, waehle } from '../../lib/ui.svelte.ts';

  const m = getMap();
  const eintraege = new Map<string, { marker: MapMarker; schluessel: string }>();
  const abmelden = registriereKontextAktion({ label: 'Marker hier', aktion: (p) => oeffne('marker', { neu: p }) });

  $effect(() => {
    const gesehen = new Set<string>();
    for (const mk of store.marker.values()) {
      gesehen.add(mk.id);
      const schluessel = `${mk.sidc}|${mk.bezeichnung}`;
      let e = eintraege.get(mk.id);
      if (e && e.schluessel !== schluessel) {
        e.marker.remove();
        e = undefined;
      }
      if (!e) {
        const id = mk.id;
        const { element, offset } = symbolElement(mk.sidc, { size: 28, rufname: mk.bezeichnung || undefined });
        element.classList.add('lage-marker');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `Marker ${mk.bezeichnung}`);
        element.addEventListener('click', (ev) => {
          ev.stopPropagation();
          waehle('marker', id);
        });
        e = { marker: new MapMarker({ element, offset }).setLngLat([mk.lon, mk.lat]).addTo(m), schluessel };
        eintraege.set(mk.id, e);
      } else e.marker.setLngLat([mk.lon, mk.lat]);
    }
    for (const [id, e] of eintraege) {
      if (gesehen.has(id)) continue;
      e.marker.remove();
      eintraege.delete(id);
    }
  });

  onDestroy(() => {
    abmelden();
    for (const e of eintraege.values()) e.marker.remove();
    eintraege.clear();
  });
</script>

<style>
  :global(.lage-marker) {
    cursor: pointer;
    line-height: 0;
  }
</style>
