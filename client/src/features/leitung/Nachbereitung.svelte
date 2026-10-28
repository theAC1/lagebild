<script lang="ts">
  // Lage beendet, ich bin Leitung: ohne Verbindung, aber mit Token → Export und endgültiges Löschen per REST.
  import { abmelden, store } from '../../lib/store.svelte.ts';
  import Export from './Export.svelte';
  import LageVerwalten from './LageVerwalten.svelte';
</script>

<div class="huelle">
  <section class="karte" aria-label="Lage beendet">
    <h1>Lage «{store.lage?.name}» beendet</h1>
    <p class="leise">Niemand kann mehr beitreten. Jetzt exportieren und danach die Lage samt Fotos und Spuren endgültig löschen.</p>
    <h2>Export</h2>
    <Export />
    <LageVerwalten />
    <p class="hinweis">Nach dem Abmelden sind Export und Löschen über die App nicht mehr möglich.</p>
    <button class="breit" onclick={() => abmelden()}>Abmelden</button>
  </section>
</div>

<style>
  .huelle {
    position: fixed;
    inset: 0;
    z-index: 28; /* unter den Toasts (29) */
    overflow-y: auto;
    display: grid;
    align-items: end;
    padding: calc(16px + var(--safe-top)) 12px calc(12px + var(--safe-bottom));
    background: rgb(22 27 31 / 0.8);
  }
  .karte {
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    display: grid;
    gap: 10px;
    padding: 18px 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 20px;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
    overflow-wrap: anywhere;
  }
  h2 {
    margin: 8px 0 0;
    font-size: 1rem;
  }
  p {
    margin: 0;
  }
  .hinweis {
    color: var(--warn);
    font-size: 0.9rem;
  }
  .breit {
    width: 100%;
  }
</style>
