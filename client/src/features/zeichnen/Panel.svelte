<script lang="ts">
  // Panel «Zeichnen»: Desktop Eigenschaften/Ebenen; mobil die drei Werkzeuge und Ebenen-Sichtbarkeit.
  import type { PanelProps } from '../registry.ts';
  import { schliesse } from '../../lib/ui.svelte.ts';
  import Ebenen from './Ebenen.svelte';
  import Eigenschaften from './Eigenschaften.svelte';
  import { IKON } from './ikonen.ts';
  import { MOBIL_WERKZEUGE, werkzeug, type WerkzeugId } from './werkzeuge.ts';
  import { istDesktop, setzeWerkzeug } from './zustand.svelte.ts';

  let { params }: PanelProps = $props();
  let tab = $state<'eigenschaften' | 'ebenen'>('eigenschaften');
  $effect(() => {
    if (params.tab === 'ebenen' || params.tab === 'eigenschaften') tab = params.tab;
  });

  function starte(id: WerkzeugId) {
    setzeWerkzeug(id);
    schliesse('zeichnen');
  }
</script>

{#if istDesktop()}
  <div class="segmente" role="tablist" aria-label="Zeichnen">
    <button role="tab" aria-selected={tab === 'eigenschaften'} onclick={() => (tab = 'eigenschaften')}>Eigenschaften</button>
    <button role="tab" aria-selected={tab === 'ebenen'} onclick={() => (tab = 'ebenen')}>Ebenen</button>
  </div>
  <div class="inhalt" role="tabpanel">
    {#if tab === 'eigenschaften'}<Eigenschaften fokus={params.fokus} />{:else}<Ebenen verwalten />{/if}
  </div>
{:else}
  <div class="mobil-werkzeuge" role="group" aria-label="Zeichnen">
    {#each MOBIL_WERKZEUGE as id (id)}
      <button onclick={() => starte(id)}>{@html IKON[id]}<span>{werkzeug(id).label}</span></button>
    {/each}
  </div>
  <p class="leise">Volle Zeichenwerkzeuge (Stil, taktische Linien, Ebenen verwalten) am Computer mit Maus.</p>
  <h3>Ebenen</h3>
  <Ebenen verwalten={false} />
{/if}

<style>
  .inhalt {
    margin-top: 12px;
  }
  .segmente button[aria-selected='true'] {
    background: var(--surface-2);
    color: var(--accent);
    font-weight: 600;
  }
  .mobil-werkzeuge {
    display: flex;
    gap: 8px;
  }
  .mobil-werkzeuge button {
    flex: 1;
    min-width: 0;
    padding: 0 4px;
    min-height: 64px;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
  }
  h3 {
    margin: 14px 0 6px;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-2);
  }
</style>
