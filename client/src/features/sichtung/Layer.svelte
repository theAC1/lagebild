<script lang="ts">
  import { Marker } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { groesse } from '../../lib/groesse.svelte.ts';
  import { getMap, markiereZiel, registriereKontextAktion } from '../../lib/map.ts';
  import { beiNachricht, store } from '../../lib/store.svelte.ts';
  import { symbolElement } from '../../lib/symbol.ts';
  import { oeffne, toast, waehle } from '../../lib/ui.svelte.ts';
  import { starteEntwurf } from './entwurf.svelte.ts';
  import { KAMERA_SVG } from './logik.ts';

  const m = getMap();
  // Sichtungen sind unveränderlich (kein Bearbeiten im Vertrag) → je ID einmal anlegen (neu nur bei anderer Bediengrösse)
  const eintraege = new Map<string, Marker>();
  let faktor = 0;

  $effect(() => {
    if (groesse.karte !== faktor) {
      for (const mk of eintraege.values()) mk.remove();
      eintraege.clear();
      faktor = groesse.karte;
    }
    for (const s of store.sichtungen.values()) {
      if (eintraege.has(s.id)) continue;
      const { element, offset } = symbolElement(s.sidc, { size: 26 * faktor });
      element.classList.add('sichtung-symbol');
      markiereZiel(element, { art: 'sichtung', id: s.id });
      if (s.fotoId) element.insertAdjacentHTML('beforeend', `<span class="sichtung-kamera">${KAMERA_SVG}</span>`);
      element.title = 'Sichtung';
      element.addEventListener('click', (ev) => {
        ev.stopPropagation();
        waehle('sichtung', s.id);
      });
      eintraege.set(s.id, new Marker({ element, offset }).setLngLat([s.lon, s.lat]).addTo(m));
    }
    for (const [id, mk] of eintraege) {
      if (store.sichtungen.has(id)) continue;
      mk.remove();
      eintraege.delete(id);
    }
  });

  const abmelden = [
    registriereKontextAktion({
      label: 'Sichtung hier',
      aktion: (p) => {
        starteEntwurf(p);
        oeffne('sichtung');
      },
    }),
    beiNachricht((msg) => {
      if (msg.typ !== 'sichtung' || msg.sichtung.von === store.ich) return;
      toast(`Neue Sichtung von ${store.teilnehmer.get(msg.sichtung.von)?.rufname ?? 'unbekannt'}`);
    }),
  ];

  onDestroy(() => {
    for (const f of abmelden) f();
    for (const mk of eintraege.values()) mk.remove();
    eintraege.clear();
  });
</script>

<style>
  :global(.sichtung-symbol) {
    cursor: pointer;
    line-height: 0;
  }
  :global(.sichtung-kamera) {
    position: absolute;
    right: -8px;
    top: -8px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--bg);
    color: var(--accent);
    border: 1px solid var(--accent);
  }
</style>
