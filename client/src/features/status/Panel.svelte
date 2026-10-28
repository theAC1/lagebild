<script lang="ts">
  import type { PanelProps } from '../registry.ts';
  import { send, statusDef, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { formatZeit, neuesteZuerst, textFarbeAuf } from './logik.ts';

  let {}: PanelProps = $props();

  const MAX_TEXT = 200;
  let text = $state('');

  const ich = $derived(store.ichSelbst);
  const aktuell = $derived(ich ? statusDef(ich.status) : null);
  const statusSet = $derived(store.lage?.statusSet ?? []);
  const log = $derived(neuesteZuerst(store.meldungen));
  const verbunden = $derived(store.verbindung === 'verbunden');

  /** Sendet Status + Freitext. Der Kern (send) schickt danach die eigene Position sofort mit (sendePosJetzt). */
  function melde(status: string) {
    if (!send({ typ: 'status', status, text: text.trim() })) return toast('Keine Verbindung – Meldung nicht gesendet.');
    text = '';
  }
</script>

{#if !ich}
  <p class="leise">Noch nicht mit der Lage verbunden.</p>
{:else}
  <div class="aktuell" style:--farbe={aktuell?.farbe ?? 'var(--line)'}>
    <span class="punkt"></span>
    <span>Aktuell <strong>{aktuell?.label ?? ich.status}</strong>{#if ich.statusText}<span class="leise">&nbsp;– {ich.statusText}</span>{/if}</span>
  </div>

  <div class="knoepfe" role="group" aria-label="Status wählen">
    {#each statusSet as s (s.key)}
      <button
        class="status"
        style:background={s.farbe}
        style:color={textFarbeAuf(s.farbe)}
        aria-pressed={s.key === ich.status}
        disabled={!verbunden}
        onclick={() => melde(s.key)}>{s.label}</button
      >
    {/each}
  </div>

  <form
    class="meldung"
    onsubmit={(e) => {
      e.preventDefault();
      if (text.trim()) melde(ich.status);
    }}
  >
    <label class="feld">
      Meldung an alle
      <textarea bind:value={text} maxlength={MAX_TEXT} rows="2" placeholder="z.B. Brücke gesperrt, weichen nach Norden aus"></textarea>
    </label>
    <div class="zeile">
      <span class="leise">Tippe einen Status, um ihn mit dem Text zu senden.</span>
      <button class="primaer" type="submit" disabled={!verbunden || !text.trim()}>Senden</button>
    </div>
  </form>

  <h3>Meldungslog</h3>
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
              {@const farbe = def?.farbe ?? '#3b464d'}
              <span class="badge" style:background={farbe} style:color={textFarbeAuf(farbe)}>{def?.label ?? m.status}</span>
            {/if}
            {#if m.text}<span class="text">{m.text}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .aktuell {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-left: 4px solid var(--farbe);
    border-radius: 8px;
    background: var(--bg);
  }
  .punkt {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--farbe);
  }
  .knoepfe {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin: 12px 0;
  }
  .status {
    min-height: 60px;
    padding: 0 10px;
    border: 3px solid transparent;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .status[aria-pressed='true'] {
    border-color: var(--text);
    box-shadow: 0 0 0 2px var(--bg) inset;
  }
  .status[aria-pressed='true']::before {
    content: '✓ ';
  }
  .meldung {
    display: grid;
    gap: 8px;
  }
  textarea {
    resize: vertical;
  }
  .zeile {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
  .zeile .leise {
    font-size: 0.8rem;
  }
  h3 {
    margin: 18px 0 6px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-2);
  }
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
