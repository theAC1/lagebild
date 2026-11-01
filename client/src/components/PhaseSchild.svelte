<script lang="ts">
  // Phasenschild im Kopf (Spec v6). Für die Leitung ein Knopf: öffnet Leitung › Lage mit den Phasenwechseln.
  import { PHASE_NAME } from '../../../shared/regeln/phase.ts';
  import { store } from '../lib/store.svelte.ts';
  import { oeffne } from '../lib/ui.svelte.ts';

  const titel = $derived(`Phase: ${PHASE_NAME[store.phase]}`);
</script>

{#if store.istLeitung}
  <!-- Trefffläche 44 px um das kleine Schild (quer war es nur 34×30) -->
  <button class="knopf" aria-label="{titel} – wechseln" title={titel} onclick={() => oeffne('leitung', { tab: 'lage' })}>
    <span class="p-schild {store.phase}">{store.phase.toUpperCase()}</span>
  </button>
{:else}
  <span class="p-schild {store.phase}" role="status" aria-label={titel} title={titel}>{store.phase.toUpperCase()}</span>
{/if}

<style>
  .knopf {
    flex: none;
    display: inline-grid;
    place-items: center;
    min-width: 44px;
    min-height: 44px;
    margin: -7px -5px; /* das Schild bleibt in der Zeile so gross wie bisher, nur die Trefffläche wächst */
    padding: 0;
    border: 0;
    background: transparent;
    vertical-align: middle;
  }
  .knopf .p-schild {
    min-height: 30px;
  }
</style>
