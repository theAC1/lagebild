<script lang="ts">
  import { Marker } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { entzerre } from '../lib/labels.ts';
  import { getMap, markiereZiel } from '../lib/map.ts';
  import { frische, keinGps, statusDef, store } from '../lib/store.svelte.ts';
  import { teamFarbe } from '../lib/team.ts';
  import { groesse } from '../lib/groesse.svelte.ts';
  import { teilnehmerElement } from '../lib/symbol.ts';
  import { ui, waehle } from '../lib/ui.svelte.ts';

  const m = getMap();
  const eintraege = new Map<string, { marker: Marker; schluessel: string }>();

  // Rufnamen naher Kräfte entzerren: nach Kartenbewegung und nach jeder Änderung (auch der eigenen Position)
  let geplant = 0;
  const plane = () => {
    cancelAnimationFrame(geplant);
    geplant = requestAnimationFrame(() => entzerre(m.getContainer()));
  };
  m.on('moveend', plane);
  $effect(() => {
    void store.meinePos;
    void store.gpsFehler;
    plane();
  });

  $effect(() => {
    const gesehen = new Set<string>();
    for (const t of store.teilnehmer.values()) {
      if (t.id === store.ich || !t.pos) continue; // mich zeichnet EigenePosition (live vom Gerät)
      gesehen.add(t.id);
      const f = frische(t);
      const farbe = statusDef(t.status)?.farbe ?? null;
      const richtung = t.pos.kurs != null && (t.pos.tempo ?? 0) > 0.5 ? Math.round(t.pos.kurs / 15) * 15 : null;
      const ohneGps = keinGps(t);
      const schluessel = [t.sidc, t.rufname, t.einheit, f, farbe, richtung, t.sendetPos, ohneGps, groesse.karte].join('|');
      let e = eintraege.get(t.id);
      if (e && e.schluessel !== schluessel) {
        e.marker.remove();
        e = undefined;
      }
      if (!e) {
        const id = t.id;
        const { element, offset } = teilnehmerElement(t.sidc, {
          rufname: t.rufname,
          size: 26 * groesse.karte,
          farbe,
          team: teamFarbe(t.einheit),
          richtung,
          klassen: [f, ...(t.sendetPos ? [] : ['emcon']), ...(ohneGps ? ['kein-gps'] : [])],
        });
        markiereZiel(element, { art: 'teilnehmer', id });
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
    plane();
  });

  // «Folgen» aus dem Radial-Menü: Karte zieht mit dem Teilnehmer mit, bis er geht oder die Karte verschoben wird
  $effect(() => {
    const id = ui.folgtTeilnehmer;
    if (!id) return;
    const pos = store.teilnehmer.get(id)?.pos;
    if (pos) m.easeTo({ center: [pos.lon, pos.lat], duration: 600 });
    else ui.folgtTeilnehmer = null;
  });

  onDestroy(() => {
    m.off('moveend', plane);
    cancelAnimationFrame(geplant);
    for (const e of eintraege.values()) e.marker.remove();
    eintraege.clear();
  });
</script>
