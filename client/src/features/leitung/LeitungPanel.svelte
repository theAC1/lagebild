<script lang="ts">
  import { untrack } from 'svelte';
  import type { PanelProps } from '../registry.ts';
  import { statusDef, store } from '../../lib/store.svelte.ts';
  import Alarme from './Alarme.svelte';
  import Export from './Export.svelte';
  import LageVerwalten from './LageVerwalten.svelte';
  import StatusSet from './StatusSet.svelte';
  import Teilnehmende from './Teilnehmende.svelte';
  import Zugang from './Zugang.svelte';
  import { uhrzeit } from './logik.ts';

  let { params }: PanelProps = $props();

  const TABS = [
    { id: 'zugang', label: 'Zugang' },
    { id: 'teilnehmer', label: 'Teilnehmer' },
    { id: 'status', label: 'Status-Set' },
    { id: 'alarme', label: 'Alarme' },
    { id: 'log', label: 'Log' },
    { id: 'export', label: 'Export' },
    { id: 'lage', label: 'Lage' },
  ] as const;
  type Tab = (typeof TABS)[number]['id'];

  let tab = $state<Tab>(untrack(() => (TABS.some((t) => t.id === params.tab) ? params.tab : 'zugang')));
  const aktiveAlarme = $derived([...store.alarme.values()].filter((a) => a.aufgehobenAm === null).length);
  const log = $derived([...store.meldungen].reverse());
</script>

{#if !store.istLeitung}
  <p class="leise">Nur für die Leitung.</p>
{:else}
  <div class="tabs" role="tablist" aria-label="Leitung">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} onclick={() => (tab = t.id)}>
        {t.label}{#if t.id === 'alarme' && aktiveAlarme}<span class="zahl">{aktiveAlarme}</span>{/if}
      </button>
    {/each}
  </div>

  <div class="inhalt" role="tabpanel">
    {#if tab === 'zugang'}<Zugang />
    {:else if tab === 'teilnehmer'}<Teilnehmende />
    {:else if tab === 'status'}<StatusSet />
    {:else if tab === 'alarme'}<Alarme />
    {:else if tab === 'export'}<Export />
    {:else if tab === 'lage'}<LageVerwalten />
    {:else}
      {#if log.length === 0}<p class="leise">Noch keine Meldungen.</p>{/if}
      <ol class="log">
        {#each log as m (m.id)}
          {@const s = m.status ? statusDef(m.status) : null}
          <li>
            <span class="mono leise">{uhrzeit(m.t)}</span>
            <span>
              <strong>{store.teilnehmer.get(m.von)?.rufname ?? 'Unbekannt'}</strong>
              {#if s}<span class="punkt" style:background={s.farbe}></span>{s.label}{/if}
              {#if m.text}{s ? ' – ' : ''}{m.text}{/if}
            </span>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
{/if}

<style>
  .tabs {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px;
    margin: 0 -4px 8px;
    background: var(--bg);
    border-radius: var(--radius);
  }
  .tabs button {
    flex: none;
    border: 0;
    background: transparent;
    padding: 0 12px;
    white-space: nowrap;
  }
  .tabs button[aria-selected='true'] {
    background: var(--surface-2);
    color: var(--accent);
    font-weight: 600;
  }
  .zahl {
    margin-left: 6px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
  }
  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .log li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: baseline;
  }
  .punkt {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin: 0 4px 0 6px;
    border-radius: 50%;
  }
</style>
