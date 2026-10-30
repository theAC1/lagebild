<script lang="ts">
  // Namenslisten der Lage (nur Leitung): je Familie ergänzen/streichen, ein Name pro Zeile; «Vorgabe» setzt zurück.
  import { STANDARD_TAUFNAMEN, TAUF_FAMILIEN, type TaufListen } from '../../../../shared/protocol.ts';
  import { OHNE_QUITTUNG, sendeBestaetigt, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { FAMILIE_LABEL, listeAusText, listeVon } from './familien.ts';

  const texte = $state(Object.fromEntries(TAUF_FAMILIEN.map((f) => [f, listeVon(store.lage, f).join('\n')])) as Record<string, string>);
  let sendet = $state(false);

  async function speichern() {
    const taufListen: TaufListen = {};
    for (const f of TAUF_FAMILIEN) {
      const liste = listeAusText(texte[f]);
      // unverändert = Vorgabe: nicht speichern, damit spätere Vorgaben der App greifen
      if (liste.join('\n') !== STANDARD_TAUFNAMEN[f].join('\n')) taufListen[f] = liste;
    }
    sendet = true;
    const z = await sendeBestaetigt({ typ: 'lage.taufListen', taufListen }, (m) => m.typ === 'lage');
    sendet = false;
    if (z === 'bestaetigt') toast('Namenslisten gespeichert', 2000);
    else if (z === 'unbestaetigt') toast(OHNE_QUITTUNG);
  }
</script>

<div class="listen">
  <p class="leise">Ein Name pro Zeile. Doppelte Namen (auch familienübergreifend) lehnt der Server ab.</p>
  {#each TAUF_FAMILIEN as f (f)}
    <label class="feld">
      <span class="titel">
        {FAMILIE_LABEL[f]} ({listeAusText(texte[f]).length})
        <button type="button" class="klein" onclick={() => (texte[f] = STANDARD_TAUFNAMEN[f].join('\n'))}>Vorgabe</button>
      </span>
      <textarea rows="5" bind:value={texte[f]}></textarea>
    </label>
  {/each}
  <button class="primaer" disabled={sendet} onclick={speichern}>Listen speichern</button>
</div>

<style>
  .listen {
    display: grid;
    gap: 10px;
    margin-top: 8px;
  }
  .titel {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .klein {
    min-height: 32px;
    padding: 0 10px;
    font-size: 0.85rem;
  }
  textarea {
    font-family: var(--mono);
    font-size: 0.9rem;
  }
</style>
