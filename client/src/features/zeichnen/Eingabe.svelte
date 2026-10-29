<script lang="ts">
  // Kleines Eingabefeld an der Karte: Text einer Text-Zeichnung oder Bezeichnung einer taktischen Form.
  import { onMount } from 'svelte';
  import { groesse } from '../../lib/groesse.svelte.ts';

  let { x, y, titel, wert: start, ohneText, fertig }: { x: number; y: number; titel: string; wert: string; ohneText: string | null; fertig: (t: string | null) => void } = $props();
  // svelte-ignore state_referenced_locally
  let wert = $state(start); // Startwert, danach tippt der Nutzer
  let feld: HTMLInputElement;
  onMount(() => feld.focus());

  function taste(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    fertig(e.key === 'Enter' ? wert : null);
  }
  const links = $derived(Math.min(Math.max(8, x + 12), innerWidth - 268 * groesse.ui));
  const oben = $derived(Math.min(Math.max(8, y + 12), innerHeight - 120 * groesse.ui));
</script>

<div class="eingabe" role="dialog" aria-label={titel} style:left="{links}px" style:top="{oben}px">
  <label class="feld">
    {titel}
    <input bind:this={feld} bind:value={wert} onkeydown={taste} maxlength="200" autocomplete="off" />
  </label>
  <div class="knoepfe">
    {#if ohneText}<button onclick={() => fertig(null)}>{ohneText}</button>{:else}<button onclick={() => fertig(null)}>Abbrechen</button>{/if}
    <button class="primaer" onclick={() => fertig(wert)}>OK</button>
  </div>
</div>

<style>
  .eingabe {
    position: fixed;
    z-index: 28;
    width: min(260px, calc(100vw - 16px));
    display: grid;
    gap: 8px;
    padding: 10px;
    background: var(--surface-glas);
    border: 1px solid var(--accent);
    border-radius: 10px;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.5);
  }
  input {
    min-height: 36px;
    padding: 6px 8px;
  }
  .knoepfe {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .knoepfe button {
    min-height: 34px;
    padding: 0 12px;
  }
</style>
