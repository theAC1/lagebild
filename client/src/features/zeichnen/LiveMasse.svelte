<script lang="ts">
  // Desktop: Länge/Fläche/Radius der Form im Bau neben dem Mauszeiger.
  import { liveMasse } from './logik.ts';
  import { werkzeug } from './werkzeuge.ts';
  import { zn } from './zustand.svelte.ts';

  const zeilen = $derived.by(() => {
    const w = zn.werkzeug;
    if (!w || !zn.mausFenster || !zn.entwurf.length) return [];
    const art = w === 'messen' ? 'messen' : werkzeug(w).art;
    return art ? liveMasse(art, zn.entwurf, zn.maus) : [];
  });
</script>

{#if zeilen.length && zn.mausFenster}
  <div class="masse mono" style:left="{zn.mausFenster.x + 18}px" style:top="{zn.mausFenster.y + 18}px" aria-live="off">
    {#each zeilen as z, i (i)}<div>{z}</div>{/each}
  </div>
{/if}

<style>
  .masse {
    position: fixed;
    z-index: 25;
    pointer-events: none;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgb(22 27 31 / 0.9);
    border: 1px solid var(--line);
    font-size: 12px;
    line-height: 1.45;
    white-space: nowrap;
  }
</style>
