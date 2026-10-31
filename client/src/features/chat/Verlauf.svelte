<script lang="ts">
  import type { ServerMsg } from '../../../../shared/protocol.ts';
  import { OHNE_QUITTUNG, sendeBestaetigt, store } from '../../lib/store.svelte.ts';
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

  // Gegenüber nicht mehr in der Lage → Server lehnt ab; nicht beschreibbar machen statt Text zu verlieren
  const weg = $derived(kanal.weg === true);
  const gesperrt = $derived(weg || store.verbindung !== 'verbunden');

  /** Ein Tipp sendet sofort (Spec v3), das Textfeld ist zweitrangig. */
  const SCHNELL = ['Verstanden', 'Wiederholen', 'Warten', 'Bereit', 'Ziel erreicht', 'Brauche Unterstützung', 'Negativ'];

  let sendet = $state(false);

  async function sende(t: string): Promise<boolean> {
    const key = kanal.key;
    const echo = (m: ServerMsg) => m.typ === 'chat' && m.chat.von === store.ich && m.chat.text === t && kanalVon(m.chat, ich) === key;
    const z = await sendeBestaetigt({ typ: 'chat', an: kanal.ziel, text: t }, echo);
    if (z === 'unbestaetigt') toast(`Nachricht ${OHNE_QUITTUNG}`, 8000);
    return z === 'bestaetigt';
  }

  /** Schnellmeldung: bis zur Quittung gesperrt, sonst schickt ein Doppeltipp (Handschuhe) sie zweimal. */
  async function schnell(t: string) {
    if (sendet) return;
    sendet = true;
    try {
      await sende(t);
    } finally {
      sendet = false;
    }
  }

  /** Text erst leeren, wenn die eigene Nachricht vom Server zurückkommt. */
  async function senden(e: SubmitEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || weg) return;
    if ((await sende(t)) && text.trim() === t) text = '';
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
      <div class="blase markierbar">{c.text}</div>
    </li>
  {/each}
</ol>

{#if store.istBeobachter}
  <p class="leise">Beobachter: nur lesen.</p>
{:else}
<form onsubmit={senden}>
  <div class="chips schnell" role="group" aria-label="Schnellmeldungen">
    {#each SCHNELL as t (t)}
      <button type="button" disabled={gesperrt || sendet} onclick={() => schnell(t)}>{t}</button>
    {/each}
  </div>
  <input
    bind:value={text}
    maxlength="1000"
    enterkeyhint="send"
    autocomplete="off"
    disabled={weg}
    placeholder={weg ? 'Nicht mehr in der Lage – keine Nachrichten möglich' : `Nachricht an ${kanal.label}`}
    aria-label="Nachricht"
  />
  <button class="primaer icon" type="submit" aria-label="Senden" disabled={gesperrt || !text.trim()}>➤</button>
</form>
{/if}
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
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 0 2px;
    background: var(--surface-glas);
  }
  .schnell {
    flex-basis: 100%;
  }
  .schnell button {
    padding: 0 12px;
  }
  form input {
    flex: 1;
    min-width: 0;
  }
  form button {
    flex: none;
  }
</style>
