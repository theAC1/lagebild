<script lang="ts">
  import { abmelden, api, send, store } from '../../lib/store.svelte.ts';
  import { schreibe, toast } from '../../lib/ui.svelte.ts';
  import { codesKey } from './logik.ts';

  let beendenSchritt = $state(0);
  let loeschenName = $state('');
  let loescht = $state(false);

  const name = $derived(store.lage?.name ?? '');
  const nameStimmt = $derived(name !== '' && loeschenName.trim() === name.trim());

  function beenden() {
    if (!send({ typ: 'lage.beenden' })) return toast('Keine Verbindung – Lage nicht beendet.');
    beendenSchritt = 0; // Server meldet 'beendet' → Kern meldet ab
  }

  async function loeschen() {
    if (!nameStimmt || !store.lage) return;
    const lageId = store.lage.id;
    loescht = true;
    try {
      await api('/api/lage', { method: 'DELETE' });
      schreibe(codesKey(lageId), null);
      // Der Server wirft per WebSocket ('beendet') meist schon vorher ab
      if (store.token) abmelden('Lage endgültig gelöscht.');
      else toast('Lage endgültig gelöscht.', 6000);
    } catch (e) {
      toast(`Löschen fehlgeschlagen: ${(e as Error).message}`);
      loescht = false;
    }
  }
</script>

<section>
  <h3>Lage beenden</h3>
  <p class="leise">
    Alle werden abgemeldet, niemand kann mehr beitreten. Die Daten bleiben gespeichert. Export danach nicht mehr über die App möglich –
    vorher exportieren.
  </p>
  {#if beendenSchritt === 0}
    <button class="gefahr breit" onclick={() => (beendenSchritt = 1)}>Lage beenden …</button>
  {:else}
    <div class="frage" role="alert">
      {#if beendenSchritt === 1}
        <span>Lage «{name}» wirklich beenden?</span>
        <div class="knoepfe">
          <button onclick={() => (beendenSchritt = 0)}>Abbrechen</button>
          <button class="gefahr" onclick={() => (beendenSchritt = 2)}>Ja, weiter</button>
        </div>
      {:else}
        <span><strong>Letzte Bestätigung:</strong> alle Geräte werden sofort abgemeldet.</span>
        <div class="knoepfe">
          <button onclick={() => (beendenSchritt = 0)}>Abbrechen</button>
          <button class="gefahr voll" onclick={beenden}>Jetzt beenden</button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<section>
  <h3>Lage endgültig löschen</h3>
  <p class="leise">Löscht Lage, Teilnehmende, Spuren, Marker, Meldungen und Fotos unwiderruflich. Zur Bestätigung den Namen der Lage eingeben:</p>
  <label class="feld">
    <span>Name: <strong class="mono">{name}</strong></span>
    <input bind:value={loeschenName} autocomplete="off" placeholder="Name der Lage" />
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
  .frage {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--danger);
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
