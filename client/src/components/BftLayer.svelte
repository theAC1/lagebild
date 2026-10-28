<script lang="ts">
  import { Marker } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { getMap } from '../lib/map.ts';
  import { frische, keinGps, statusDef, store } from '../lib/store.svelte.ts';
  import { teamFarbe } from '../lib/team.ts';
  import { teilnehmerElement } from '../lib/symbol.ts';
  import { waehle } from '../lib/ui.svelte.ts';

  const m = getMap();
  const eintraege = new Map<string, { marker: Marker; schluessel: string }>();

  $effect(() => {
    const gesehen = new Set<string>();
    for (const t of store.teilnehmer.values()) {
      if (t.id === store.ich || !t.pos) continue; // mich zeichnet EigenePosition (live vom Gerät)
      gesehen.add(t.id);
      const f = frische(t);
      const farbe = statusDef(t.status)?.farbe ?? null;
      const richtung = t.pos.kurs != null && (t.pos.tempo ?? 0) > 0.5 ? Math.round(t.pos.kurs / 15) * 15 : null;
      const ohneGps = keinGps(t);
      const schluessel = [t.sidc, t.rufname, t.einheit, f, farbe, richtung, t.sendetPos, ohneGps].join('|');
      let e = eintraege.get(t.id);
      if (e && e.schluessel !== schluessel) {
        e.marker.remove();
        e = undefined;
      }
      if (!e) {
        const id = t.id;
        const { element, offset } = teilnehmerElement(t.sidc, {
          rufname: t.rufname,
          farbe,
          team: teamFarbe(t.einheit),
          richtung,
          klassen: [f, ...(t.sendetPos ? [] : ['emcon']), ...(ohneGps ? ['kein-gps'] : [])],
        });
        element.addEventListener('click', (ev) => {
          ev.stopPropagation();
          waehle('teilnehmer', id);
        });
        e = { marker: new Marker({ element, offset }).setLngLat([t.pos.lon, t.pos.lat]).addTo(m), schluessel };
        eintraege.set(t.id, e);
      } else e.marker.setLngLat([t.pos.lon, t.pos.lat]);
    }
    for (const [id, e] of eintraege) {
      if (gesehen.has(id)) continue;
      e.marker.remove();
      eintraege.delete(id);
    }
  });

  onDestroy(() => {
    for (const e of eintraege.values()) e.marker.remove();
    eintraege.clear();
  });
</script>
