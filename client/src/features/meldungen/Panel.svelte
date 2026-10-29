<script lang="ts">
  import type { PanelProps } from '../registry.ts';
  import { statusDef, store } from '../../lib/store.svelte.ts';
  import { formatZeit, neuesteZuerst, textFarbeAuf } from '../status/logik.ts';

  let _props: PanelProps = $props();

  const log = $derived(neuesteZuerst(store.meldungen));
</script>

{#if log.length === 0}
  <p class="leise">Noch keine Meldungen.</p>
{:else}
  <ul class="log">
    {#each log as m (m.id)}
      {@const def = m.status ? statusDef(m.status) : null}
      <li>
        <span class="zeit mono">{formatZeit(m.t)}</span>
        <span class="inhalt">
          <strong>{store.teilnehmer.get(m.von)?.rufname ?? 'Unbekannt'}{m.von === store.ich ? ' (ich)' : ''}</strong>
          {#if m.status}
            {@const farbe = def?.farbe ?? '#6b6f5e'}
            <span class="badge" style:background={farbe} style:color={textFarbeAuf(farbe)}>{def?.label ?? m.status}</span>
          {/if}
          {#if m.text}<span class="text">{m.text}</span>{/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .log {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .log li {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .zeit {
    flex: none;
    color: var(--text-2);
  }
  .inhalt {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: baseline;
    min-width: 0;
  }
  .badge {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .text {
    flex-basis: 100%;
    overflow-wrap: anywhere;
  }
</style>
