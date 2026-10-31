<script lang="ts">
  // Phasenschild im Kopf (Spec v6). Für die Leitung ein Knopf: öffnet Leitung › Lage mit den Phasenwechseln.
  import { PHASE_NAME } from '../../../shared/regeln/phase.ts';
  import { store } from '../lib/store.svelte.ts';
  import { oeffne } from '../lib/ui.svelte.ts';

  const titel = $derived(`Phase: ${PHASE_NAME[store.phase]}`);
</script>

{#if store.istLeitung}
  <button class="schild {store.phase}" aria-label="{titel} – wechseln" title={titel} onclick={() => oeffne('leitung', { tab: 'lage' })}>{store.phase.toUpperCase()}</button>
{:else}
  <span class="schild {store.phase}" role="status" aria-label={titel} title={titel}>{store.phase.toUpperCase()}</span>
{/if}

<style>
  .schild {
    flex: none;
    display: inline-grid;
    place-items: center;
    min-width: 34px;
    min-height: 26px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #000;
    color: #fff;
    font: 700 0.78rem/1 var(--mono);
    letter-spacing: 0.04em;
    vertical-align: middle;
  }
  button.schild {
    min-height: 30px;
  }
  .ap {
    background: #555a5e;
  }
  .an {
    background: #2e9e44;
  }
</style>
