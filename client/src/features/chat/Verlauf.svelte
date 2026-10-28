<script lang="ts">
  import { send, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { markiereGelesen } from './chat.svelte.ts';
  import { formatZeit, kanalVon, type Kanal } from './kanaele.ts';

  let { kanal, onzurueck }: { kanal: Kanal; onzurueck: () => void } = $props();

  let text = $state('');
  let ende = $state<HTMLElement>();

  const ich = $derived(store.ich ?? '');
  const nachrichten = $derived(store.chat.filter((c) => kanalVon(c, ich) === kanal.key));

  // Sichtbar = gelesen; neue Nachricht → ans Ende scrollen
  $effect(() => {
    const letzte = nachrichten.at(-1);
    if (letzte) markiereGelesen(kanal.key, letzte.t);
    ende?.scrollIntoView({ block: 'end' });
  });

  function senden(e: SubmitEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (send({ typ: 'chat', an: kanal.ziel, text: t })) text = '';
    else toast('Keine Verbindung – Nachricht nicht gesendet.');
  }
</script>

<div class="kopf">
  <button class="icon" aria-label="Zurück zu den Kanälen" onclick={onzurueck}>‹</button>
  <div>
    <strong>{kanal.label}</strong>
    <div class="leise">{kanal.info}</div>
  </div>
</div>

{#if nachrichten.length === 0}
  <p class="leise leer">Noch keine Nachrichten.</p>
{/if}
<ol>
  {#each nachrichten as c (c.id)}
    {@const eigen = c.von === ich}
    <li class:eigen>
      <div class="meta leise">
        {eigen ? 'Ich' : (store.teilnehmer.get(c.von)?.rufname ?? 'Unbekannt')} · <span class="mono">{formatZeit(c.t, store.jetzt)}</span>
      </div>
      <div class="blase">{c.text}</div>
    </li>
  {/each}
</ol>

<form onsubmit={senden}>
  <input bind:value={text} maxlength="1000" enterkeyhint="send" autocomplete="off" placeholder="Nachricht an {kanal.label}" aria-label="Nachricht" />
  <button class="primaer icon" type="submit" aria-label="Senden" disabled={!text.trim() || store.verbindung !== 'verbunden'}>➤</button>
</form>
<div bind:this={ende}></div>

<style>
  .kopf {
    position: sticky;
    top: -4px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0 8px;
    background: var(--surface-glas);
  }
  .kopf .icon {
    font-size: 1.6rem;
  }
  .leer {
    margin: 8px 0;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    max-width: 85%;
    justify-self: start;
  }
  li.eigen {
    justify-self: end;
    text-align: right;
  }
  .meta {
    font-size: 0.75rem;
    padding: 0 4px 2px;
  }
  .blase {
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--surface-2);
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .eigen .blase {
    background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  }
  form {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 8px;
    padding: 10px 0 2px;
    background: var(--surface-glas);
  }
  form input {
    flex: 1;
    min-width: 0;
  }
  form button {
    flex: none;
  }
</style>
