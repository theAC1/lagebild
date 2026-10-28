<script lang="ts">
  import { Marker } from 'maplibre-gl';
  import { azimut, distanz, formatDistanz, formatLv95, formatMgrs, formatRichtung, formatWgs84 } from '../lib/coords.ts';
  import { getMap, kontextAktionen } from '../lib/map.ts';
  import { store } from '../lib/store.svelte.ts';
  import { toast, ui } from '../lib/ui.svelte.ts';
  import type { Punkt } from '../../../shared/protocol.ts';

  let { punkt }: { punkt: Punkt } = $props();

  const zeilen = $derived([
    { label: 'LV95', wert: formatLv95(punkt) },
    { label: 'MGRS', wert: formatMgrs(punkt) },
    { label: 'WGS84', wert: formatWgs84(punkt) },
  ]);
  const aktionen = $derived(kontextAktionen().filter((a) => !a.nurLeitung || store.istLeitung));

  // Fadenkreuz-Markierung am gewählten Punkt
  $effect(() => {
    const el = document.createElement('div');
    el.className = 'kontext-punkt';
    const mk = new Marker({ element: el }).setLngLat([punkt.lon, punkt.lat]).addTo(getMap());
    return () => mk.remove();
  });

  async function kopiere(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Kopiert');
    } catch {
      toast('Kopieren nicht möglich');
    }
  }

  function ausfuehren(a: (p: Punkt) => void) {
    ui.kontext = null;
    a(punkt);
  }
</script>

<div class="karte-menu" role="dialog" aria-label="Punkt">
  {#each zeilen as z (z.label)}
    <button class="koord" onclick={() => kopiere(z.wert)}>
      <span class="label">{z.label}</span>
      <span class="mono">{z.wert}</span>
      <span class="leise">Kopieren</span>
    </button>
  {/each}
  {#if store.meinePos}
    <div class="leise von-mir mono">
      Von mir: {formatDistanz(distanz(store.meinePos, punkt))} · {formatRichtung(azimut(store.meinePos, punkt))}
    </div>
  {/if}
  <div class="aktionen">
    {#each aktionen as a (a.label)}
      <button onclick={() => ausfuehren(a.aktion)}>{a.label}</button>
    {/each}
    <button onclick={() => (ui.kontext = null)}>Schliessen</button>
  </div>
</div>

<style>
  .karte-menu {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(var(--unten) + 8px);
    z-index: 15;
    display: grid;
    /* sonst wächst die Spalte auf die nowrap-Breite der Koordinaten und läuft rechts aus dem Bild */
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
  }
  @media (min-width: 640px) {
    .karte-menu {
      left: 50%;
      right: auto;
      width: 460px;
      transform: translateX(-50%);
    }
  }
  .koord {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: var(--bg);
    padding: 0 12px;
  }
  .koord .mono {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent);
    min-width: 44px;
  }
  .von-mir {
    padding: 2px 4px;
  }
  .aktionen {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .aktionen button {
    flex: 1 1 40%;
  }
  :global(.kontext-punkt) {
    width: 28px;
    height: 28px;
    border: 2px solid var(--accent);
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgb(22 27 31 / 0.6);
  }
</style>
