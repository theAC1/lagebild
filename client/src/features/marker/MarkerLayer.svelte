<script lang="ts">
  import { Marker as MapMarker } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { OHNE_BEOBACHTER } from '../../../../shared/regeln/rollen.ts';
  import { groesse } from '../../lib/groesse.svelte.ts';
  import { getMap, markiereZiel, registriereRadialAktion } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { symbolElement } from '../../lib/symbol.ts';
  import { ikon, oeffne, waehle } from '../../lib/ui.svelte.ts';
  import { markerName } from './logik.ts';

  const m = getMap();
  const eintraege = new Map<string, { marker: MapMarker; schluessel: string }>();
  const abmelden = registriereRadialAktion({
    fuer: 'punkt',
    label: 'Marker hier',
    icon: ikon('<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z"/><path d="M12 7v6M9 10h6"/>'),
    aktion: (z) => oeffne('marker', { neu: z.punkt }),
    phasen: ['ap', 'lv'],
    rollen: OHNE_BEOBACHTER,
  });

  $effect(() => {
    const gesehen = new Set<string>();
    for (const mk of store.marker.values()) {
      gesehen.add(mk.id);
      const schluessel = `${mk.sidc}|${mk.bezeichnung}|${groesse.karte}`;
      let e = eintraege.get(mk.id);
      if (e && e.schluessel !== schluessel) {
        e.marker.remove();
        e = undefined;
      }
      if (!e) {
        const id = mk.id;
        const { element, offset } = symbolElement(mk.sidc, { size: 28 * groesse.karte, rufname: mk.bezeichnung || undefined });
        element.classList.add('lage-marker');
        markiereZiel(element, { art: 'marker', id });
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `Marker ${markerName(mk)}`);
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
