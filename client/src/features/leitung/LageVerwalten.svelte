<script lang="ts">
  import type { Phase } from '../../../../shared/protocol.ts';
  import { PHASE_NAME, WECHSEL } from '../../../../shared/regeln/phase.ts';
  import { abmelden, api, send, store } from '../../lib/store.svelte.ts';
  import { schreibe, toast } from '../../lib/ui.svelte.ts';
  import { codesKey, PHASE_TEXT } from './logik.ts';
  import { wg } from '../wiedergabe/zustand.svelte.ts';

  /** Gewählter Wechsel, wartet auf «Ja, wechseln». */
  let ziel = $state<Phase | null>(null);
  let loeschenName = $state('');
  let loescht = $state(false);

  const name = $derived(store.lage?.name ?? '');
  const nameStimmt = $derived(name !== '' && loeschenName.trim() === name.trim());

  function wechseln(p: Phase) {
    ziel = null;
    if (!send({ typ: 'lage.phase', phase: p })) return toast('Keine Verbindung – Phase nicht gewechselt.');
    wg.selbstOeffnenFuer = p === 'an' ? (store.lage?.id ?? '') : '';
  }

  async function loeschen() {
    if (!nameStimmt || !store.lage) return;
    const lageId = store.lage.id;
    loescht = true;
    try {
      await api('/api/lage', { method: 'DELETE' });
      schreibe(codesKey(lageId), null);
      // Der Server wirft per WebSocket ('beendet') meist schon vorher ab
      if (store.token) abmelden('Mission endgültig gelöscht.');
      else toast('Mission endgültig gelöscht.', 6000);
    } catch (e) {
      toast(`Löschen fehlgeschlagen: ${(e as Error).message}`);
      loescht = false;
    }
  }
</script>

<section aria-label="Phase">
  <h3>Phase: {PHASE_NAME[store.phase]} ({store.phase.toUpperCase()})</h3>
  {#if ziel}
    <div class="frage" role="alert">
      <span>{PHASE_TEXT[ziel].frage}</span>
      <div class="knoepfe">
        <button onclick={() => (ziel = null)}>Abbrechen</button>
        <button class="primaer" onclick={() => wechseln(ziel!)}>Ja, wechseln</button>
      </div>
    </div>
  {:else}
    {#each WECHSEL[store.phase] as p (p)}
      <button class="breit phase-knopf {p}" onclick={() => (ziel = p)}>{PHASE_TEXT[p].knopf(store.phase)}</button>
    {/each}
  {/if}
</section>

<section>
  <h3>Mission endgültig löschen</h3>
  <p class="leise">Löscht die Mission, Teilnehmende, Spuren, Marker, Meldungen und Fotos unwiderruflich. Zur Bestätigung den Namen der Mission eingeben:</p>
  <label class="feld">
    <span>Name: <strong class="mono">{name}</strong></span>
    <input bind:value={loeschenName} autocomplete="off" placeholder="Name der Mission" />
  </label>
  <button class="gefahr voll breit" disabled={!nameStimmt || loescht} onclick={loeschen}>
    {loescht ? 'Wird gelöscht …' : 'Endgültig löschen'}
  </button>
</section>

<style>
  section {
    display: grid;
    gap: 8px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  section:last-child {
    border-bottom: 0;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  p {
    margin: 0;
  }
  .breit {
    width: 100%;
  }
  .voll:not(:disabled) {
    background: var(--danger);
    color: #fff;
  }
  .phase-knopf {
    border-width: 2px;
    font-weight: 600;
  }
  .phase-knopf.lv {
    border-color: var(--text);
  }
  .phase-knopf.ap {
    border-color: #555a5e;
  }
  .phase-knopf.an {
    border-color: #2e9e44;
  }
  .frage {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
  }
  .knoepfe {
    display: flex;
    gap: 8px;
  }
  .knoepfe button {
    flex: 1;
  }
</style>
