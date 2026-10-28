<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PanelProps } from '../registry.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { symbolSvg } from '../../lib/symbol.ts';
  import { teamFarbe } from '../../lib/team.ts';
  import { chat } from './chat.svelte.ts';
  import { kanaele, kanalKey, zielAus } from './kanaele.ts';
  import Verlauf from './Verlauf.svelte';

  let { params }: PanelProps = $props();

  // oeffne('chat', { an }) → direkt in den passenden Kanal
  $effect.pre(() => {
    const ziel = zielAus(params.an);
    if (ziel) chat.aktiv = kanalKey(ziel);
  });
  onDestroy(() => (chat.aktiv = null));

  const liste = $derived(kanaele([...store.teilnehmer.values()], store.chat, store.ich ?? ''));
  const offen = $derived(liste.find((k) => k.key === chat.aktiv) ?? null);
  const name = (id: string) => (id === store.ich ? 'Ich' : (store.teilnehmer.get(id)?.rufname ?? 'Unbekannt'));
</script>

{#if offen}
  <Verlauf kanal={offen} onzurueck={() => (chat.aktiv = null)} />
{:else}
  <ul>
    {#each liste as k, i (k.key)}
      {@const s = chat.stand.get(k.key)}
      {#if k.ziel.art !== liste[i - 1]?.ziel.art && i > 0}
        <li class="gruppe">{k.ziel.art === 'einheit' ? 'Einheiten' : 'Direkt'}</li>
      {/if}
      <li>
        <button class="zeile" class:neu={(s?.ungelesen ?? 0) > 0} onclick={() => (chat.aktiv = k.key)}>
          <span class="zeichen" aria-hidden="true">
            {#if k.sidc}{@html symbolSvg(k.sidc, { size: 18 })}
            {:else if k.ziel.art === 'einheit'}<span class="team" style:background={teamFarbe(k.ziel.einheit)}></span>
            {:else}<span class="alle">∗</span>{/if}
          </span>
          <span class="text">
            <strong>{k.label}</strong>
            <span class="leise">{s?.letzte ? `${name(s.letzte.von)}: ${s.letzte.text}` : k.info}</span>
          </span>
          {#if s?.ungelesen}<span class="badge" aria-label="{s.ungelesen} ungelesen">{s.ungelesen > 99 ? '99+' : s.ungelesen}</span>{/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .gruppe {
    padding: 8px 4px 0;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
  }
  .zeile {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    min-height: 56px;
    text-align: left;
    background: var(--bg);
  }
  .zeile.neu strong {
    color: var(--accent);
  }
  .zeichen {
    width: 36px;
    flex: none;
    display: grid;
    place-items: center;
  }
  .team {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid var(--line);
  }
  .alle {
    font-size: 1.4rem;
    color: var(--accent);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .text .leise {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    flex: none;
    min-width: 24px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-weight: 700;
    line-height: 24px;
    text-align: center;
  }
</style>
