<script lang="ts">
  import { formatKoord, KOORD_FORMATE } from '../lib/coords.ts';
  import { setzeEinstellung, store } from '../lib/store.svelte.ts';

  const format = $derived(store.einstellungen.koordFormat);
  function naechstes() {
    const i = KOORD_FORMATE.findIndex((f) => f.id === format);
    setzeEinstellung('koordFormat', KOORD_FORMATE[(i + 1) % KOORD_FORMATE.length].id);
  }
</script>

<button class="leiste" onclick={naechstes} aria-label="Koordinatenformat wechseln">
  <span class="fmt">{KOORD_FORMATE.find((f) => f.id === format)?.label}</span>
  {#if store.meinePos}
    <span class="mono wert">{formatKoord(store.meinePos, format)}</span>
    {#if store.meinePos.ce != null}<span class="leise">±{Math.round(store.meinePos.ce)} m</span>{/if}
  {:else}
    <span class="leise wert">{store.gpsFehler ?? 'Warte auf GPS …'}</span>
  {/if}
  {#if store.ichSelbst && !store.ichSelbst.sendetPos}<span class="emcon">EMCON</span>{/if}
</button>

<style>
  .leiste {
    width: 100%;
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border: 0;
    border-radius: 0;
    background: rgb(22 27 31 / 0.9);
    text-align: left;
    font-size: 0.95rem;
  }
  .fmt {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent);
    min-width: 42px;
  }
  .wert {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .emcon {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--warn);
  }
</style>
