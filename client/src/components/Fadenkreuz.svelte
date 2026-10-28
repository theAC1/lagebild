<script lang="ts">
  import { formatKoord } from '../lib/coords.ts';
  import { getMap } from '../lib/map.ts';
  import { store } from '../lib/store.svelte.ts';
  import { ui } from '../lib/ui.svelte.ts';
  import type { Punkt } from '../../../shared/protocol.ts';

  let { hinweis }: { hinweis: string } = $props();

  const m = getMap();
  const mitte = (): Punkt => {
    const c = m.getCenter();
    return { lat: c.lat, lon: c.lng };
  };
  let punkt = $state(mitte());

  $effect(() => {
    const neu = () => (punkt = mitte());
    m.on('move', neu);
    return () => void m.off('move', neu);
  });
</script>

<div class="kreuz" aria-hidden="true"></div>
<div class="leiste">
  <div class="hinweis">{hinweis}</div>
  <div class="mono leise">{formatKoord(punkt, store.einstellungen.koordFormat)}</div>
  <div class="knoepfe">
    <button onclick={() => ui.punktWahl?.fertig(null)}>Abbrechen</button>
    <button class="primaer" onclick={() => ui.punktWahl?.fertig(mitte())}>Übernehmen</button>
  </div>
</div>

<style>
  .kreuz {
    position: fixed;
    left: 50%;
    top: 50%;
    width: 56px;
    height: 56px;
    translate: -50% -50%;
    z-index: 12;
    pointer-events: none;
    background:
      linear-gradient(var(--accent), var(--accent)) center / 2px 100% no-repeat,
      linear-gradient(var(--accent), var(--accent)) center / 100% 2px no-repeat;
    filter: drop-shadow(0 0 2px #000);
  }
  .kreuz::after {
    content: '';
    position: absolute;
    inset: 16px;
    border: 2px solid var(--accent);
    border-radius: 50%;
  }
  .leiste {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 25;
    display: grid;
    gap: 6px;
    padding: 12px 16px calc(12px + var(--safe-bottom));
    background: var(--surface-glas);
    border-top: 1px solid var(--line);
  }
  .hinweis {
    font-weight: 600;
  }
  .knoepfe {
    display: flex;
    gap: 8px;
  }
  .knoepfe button {
    flex: 1;
  }
</style>
