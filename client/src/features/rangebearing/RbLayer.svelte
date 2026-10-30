<script lang="ts">
  import { Marker, type GeoJSONSource } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { versetze } from '../../lib/coords.ts';
  import { getMap, registriereRadialAktion } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { ikon, oeffne } from '../../lib/ui.svelte.ts';
  import { messe, rbLabel } from './logik.ts';
  import { hinzufuegen, ladeFuer, punktVon, rb } from './messungen.svelte.ts';

  const m = getMap();
  const QUELLE = 'rangebearing';
  m.addSource(QUELLE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({ id: `${QUELLE}-rand`, type: 'line', source: QUELLE, paint: { 'line-color': '#161b1f', 'line-width': 5, 'line-opacity': 0.6 } });
  m.addLayer({
    id: `${QUELLE}-linie`,
    type: 'line',
    source: QUELLE,
    paint: { 'line-color': '#c8b46a', 'line-width': 2.5, 'line-dasharray': [3, 2] },
  });
  m.addLayer({
    id: `${QUELLE}-enden`,
    type: 'circle',
    source: QUELLE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 5, 'circle-color': '#c8b46a', 'circle-stroke-color': '#161b1f', 'circle-stroke-width': 2 },
  });

  // Messung von mir zum Punkt (wie bisher; ohne GPS zeigt das Panel den Hinweis und rechnet ab dem ersten Fix)
  const abmelden = registriereRadialAktion({
    fuer: 'punkt',
    label: 'R&B', // wie auf Symbolen: von mir zum Ziel; kurz, sonst stossen die unteren Beschriftungen im Ring zusammen
    icon: ikon('<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5l11-11" stroke-dasharray="2 3"/>'),
    aktion: (z) => {
      hinzufuegen({ art: 'punkt', punkt: z.punkt! });
      oeffne('rangebearing');
    },
  });

  // Beschriftungen als HTML-Marker (der Kartenstil hat keine Glyphen für Symbol-Layer)
  const labels = new Map<string, Marker>();

  $effect(() => ladeFuer(store.lage?.id ?? null));

  $effect(() => {
    const features: GeoJSON.Feature[] = [];
    const gesehen = new Set<string>();
    for (const mes of rb.liste) {
      const a = punktVon(mes.a);
      const b = punktVon(mes.b);
      if (!a || !b) continue;
      const e = messe(a, b);
      const mitte = versetze(a, e.m / 2, e.grad);
      features.push(
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [b.lon, b.lat] } },
      );
      gesehen.add(mes.id);
      let mk = labels.get(mes.id);
      if (!mk) {
        const el = document.createElement('button');
        el.className = 'rb-label mono';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          oeffne('rangebearing');
        });
        mk = new Marker({ element: el }).setLngLat([mitte.lon, mitte.lat]).addTo(m);
        labels.set(mes.id, mk);
      } else mk.setLngLat([mitte.lon, mitte.lat]);
      mk.getElement().textContent = rbLabel(e);
    }
    (m.getSource(QUELLE) as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    for (const [id, mk] of labels) {
      if (gesehen.has(id)) continue;
      mk.remove();
      labels.delete(id);
    }
  });

  onDestroy(() => {
    abmelden();
    for (const mk of labels.values()) mk.remove();
    labels.clear();
    if (!m.getStyle()) return;
    for (const l of ['enden', 'linie', 'rand']) m.removeLayer(`${QUELLE}-${l}`);
    m.removeSource(QUELLE);
  });
</script>

<style>
  :global(.rb-label) {
    min-height: 0;
    padding: 3px 8px;
    border: 1px solid #c8b46a;
    border-radius: 8px;
    background: rgb(22 27 31 / 0.88);
    color: #e8eae4;
    font-size: calc(12px * var(--karte));
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
</style>
