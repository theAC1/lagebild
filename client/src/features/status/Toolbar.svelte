<script lang="ts">
  import { statusDef, store } from '../../lib/store.svelte.ts';
  import { istOffen, oeffne, schliesse } from '../../lib/ui.svelte.ts';
  import { textFarbeAuf } from './logik.ts';

  const ich = $derived(store.ichSelbst);
  const def = $derived(ich ? statusDef(ich.status) : null);
  const farbe = $derived(def?.farbe ?? '#3b464d');
</script>

{#if ich}
  <button
    class="schnell"
    style:background={farbe}
    style:color={textFarbeAuf(farbe)}
    aria-label="Eigener Status: {def?.label ?? ich.status}. Status ändern"
    aria-pressed={istOffen('status')}
    onclick={() => (istOffen('status') ? schliesse('status') : oeffne('status'))}
  >
    {def?.label ?? ich.status}
  </button>
{/if}

<style>
  .schnell {
    max-width: 128px;
    padding: 0 14px;
    border: 2px solid rgb(22 27 31 / 0.6);
    border-radius: 999px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
    font-weight: 700;
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .schnell[aria-pressed='true'] {
    border-color: var(--text);
  }
</style>
