<script lang="ts">
  import type { PanelProps } from '../registry.ts';
  import { OHNE_QUITTUNG, sendeBestaetigt, statusDef, store } from '../../lib/store.svelte.ts';
  import { schliesse, toast } from '../../lib/ui.svelte.ts';
  import { textFarbeAuf } from './logik.ts';

  let {}: PanelProps = $props();

  const MAX_TEXT = 200;
  let text = $state('');
  let sendet = $state<string | null>(null);

  const ich = $derived(store.ichSelbst);
  const aktuell = $derived(ich ? statusDef(ich.status) : null);
  const statusSet = $derived(store.lage?.statusSet ?? []);
  const verbunden = $derived(store.verbindung === 'verbunden');

  /**
   * Ein Tipp meldet den Status (mit dem Text, falls einer aufgeklappt ist) und schliesst das Panel.
   * Der Kern (send) schickt danach die eigene Position sofort mit. Den Text erst leeren, wenn die eigene
   * Meldung vom Server zurückkommt – sonst geht er bei Ablehnung verloren.
   */
  async function melde(status: string) {
    if (sendet) return;
    const t = text.trim();
    sendet = status;
    const z = await sendeBestaetigt({ typ: 'status', status, text: t }, (m) => m.typ === 'meldung' && m.meldung.von === store.ich && m.meldung.status === status);
    sendet = null;
    if (z === 'bestaetigt') {
      if (text.trim() === t) text = '';
      schliesse('status');
    } else if (z === 'unbestaetigt') toast(`Meldung ${OHNE_QUITTUNG}`, 8000);
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
        aria-busy={sendet === s.key}
        disabled={!verbunden || sendet !== null}
        onclick={() => melde(s.key)}>{s.label}</button
      >
    {/each}
  </div>

  <details class="freitext">
    <summary>+ Text</summary>
    <form
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
        <span class="leise">Oder einen Status tippen: er geht mit diesem Text raus.</span>
        <button class="primaer" type="submit" disabled={!verbunden || !text.trim() || sendet !== null}>Senden</button>
      </div>
    </form>
  </details>
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
    min-height: var(--haupt);
    padding: 0 10px;
    border: 3px solid transparent;
    font-size: 0.95rem;
    font-weight: 700;
    hyphens: auto;
    overflow-wrap: break-word;
  }
  .status:disabled {
    opacity: 0.6;
  }
  .status[aria-pressed='true'] {
    border-color: var(--text);
    box-shadow: 0 0 0 2px var(--bg) inset;
  }
  .status[aria-pressed='true']::before {
    content: '✓ ';
  }
  .status[aria-busy='true'] {
    opacity: 1;
    animation: senden 0.8s ease-in-out infinite alternate;
  }
  .freitext summary {
    display: flex;
    align-items: center;
    min-height: var(--touch);
    padding: 0 4px;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }
  .freitext summary::-webkit-details-marker {
    display: none;
  }
  form {
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
  @keyframes senden {
    to {
      filter: brightness(1.35);
    }
  }
</style>
