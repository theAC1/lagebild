<script lang="ts">
  // Leitung: Rolle und Einheit eines anderen Mitglieds setzen, Leitung übergeben (Spec v7). In Teilnehmerdetail und Leitung › Teilnehmer.
  import type { ClientMsg, CodeRolle, Teilnehmer } from '../../../../shared/protocol.ts';
  import { ROLLE_NAME } from '../../../../shared/regeln/rollen.ts';
  import { send } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';

  let { t }: { t: Teilnehmer } = $props();

  const ROLLEN: CodeRolle[] = ['gruppenfuehrer', 'teilnehmer', 'beobachter'];
  let einheit = $state('');
  let uebergebenFrage = $state(false);
  // nur bei geänderter Einheit zurücksetzen, nicht bei jeder Position (t wird dann ersetzt)
  const bisher = $derived(t.einheit);
  $effect(() => {
    einheit = bisher;
  });
  const uebergabeHinweis = $derived(t.rolle === 'beobachter' ? 'Beobachter können nicht Leitung werden.' : !t.online ? 'Nur an verbundene Mitglieder.' : null);

  const sende = (m: ClientMsg): boolean => send(m) || (toast('Keine Verbindung – bitte später erneut.'), false);

  function einheitSetzen(e: SubmitEvent) {
    e.preventDefault();
    const neu = einheit.trim();
    if (neu && neu !== t.einheit) sende({ typ: 'teilnehmer.aendern', id: t.id, einheit: neu });
  }

  function uebergeben() {
    if (sende({ typ: 'leitung.uebergeben', id: t.id })) uebergebenFrage = false;
  }
</script>

<div class="verwalten">
  <div class="segmente" role="group" aria-label="Rolle von {t.rufname}">
    {#each ROLLEN as r (r)}
      <button aria-pressed={t.rolle === r} onclick={() => t.rolle !== r && sende({ typ: 'teilnehmer.aendern', id: t.id, rolle: r })}>{ROLLE_NAME[r]}</button>
    {/each}
  </div>
  <form class="einheit" onsubmit={einheitSetzen}>
    <label class="feld">Einheit <input bind:value={einheit} required maxlength="32" /></label>
    <button type="submit" disabled={!einheit.trim() || einheit.trim() === t.einheit}>Ändern</button>
  </form>
  {#if uebergebenFrage}
    <div class="frage" role="alert">
      <span><strong>{t.rufname}</strong> wird Leitung, du wirst Teilnehmer. Weiter?</span>
      <div class="knoepfe">
        <button onclick={() => (uebergebenFrage = false)}>Abbrechen</button>
        <button class="primaer" onclick={uebergeben}>Ja, übergeben</button>
      </div>
    </div>
  {:else}
    <button disabled={uebergabeHinweis !== null} onclick={() => (uebergebenFrage = true)}>Leitung übergeben …</button>
    {#if uebergabeHinweis}<p class="leise klein">{uebergabeHinweis}</p>{/if}
  {/if}
</div>

<style>
  .verwalten {
    display: grid;
    gap: 8px;
  }
  .einheit {
    display: flex;
    gap: 8px;
    align-items: end;
  }
  .einheit .feld {
    flex: 1;
    min-width: 0;
  }
  .frage {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--warn);
    border-radius: var(--radius);
  }
  .knoepfe {
    display: flex;
    gap: 8px;
  }
  .knoepfe button {
    flex: 1;
  }
  .klein {
    margin: 0;
    font-size: 0.85rem;
  }
</style>
