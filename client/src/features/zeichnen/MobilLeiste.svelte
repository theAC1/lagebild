<script lang="ts">
  // Mobil: grosse Knöpfe statt Tastatur – beim Zeichnen (Linie, Pfeil, Kreis) und beim Bearbeiten eigener Formen.
  import { beende, loescheGriffPunkt } from './interaktion.ts';
  import { werkzeug } from './werkzeuge.ts';
  import { setzeWerkzeug, zn } from './zustand.svelte.ts';

  const w = $derived(zn.werkzeug ? werkzeug(zn.werkzeug) : null);
  const genug = $derived(zn.werkzeug === 'kreis' ? false : zn.entwurf.length >= 2);
  const hinweis = $derived(
    zn.werkzeug === 'kreis'
      ? zn.entwurf.length ? 'Rand antippen' : 'Mittelpunkt antippen'
      : zn.entwurf.length < 2 ? 'Punkte antippen' : `${zn.entwurf.length} Punkte`,
  );
  function fertigBearbeiten() {
    zn.mobilBearbeiten = null;
    zn.griff = null;
  }
</script>

{#if w}
  <div class="leiste" role="toolbar" aria-label="{w.label} zeichnen">
    <div class="hinweis"><strong>{w.label}</strong> · {hinweis}</div>
    <div class="knoepfe">
      <button onclick={() => setzeWerkzeug(null)}>Abbrechen</button>
      {#if zn.entwurf.length}<button onclick={() => (zn.entwurf = zn.entwurf.slice(0, -1))}>Zurück</button>{/if}
      {#if zn.werkzeug !== 'kreis'}<button class="primaer" disabled={!genug} onclick={beende}>Fertig</button>{/if}
    </div>
  </div>
{:else if zn.mobilBearbeiten}
  <div class="leiste" role="toolbar" aria-label="Form bearbeiten">
    <div class="hinweis"><strong>Bearbeiten</strong> · {zn.griff ? 'Punkt gewählt' : 'Punkte ziehen oder antippen'}</div>
    <div class="knoepfe">
      {#if zn.griff}<button class="gefahr" onclick={loescheGriffPunkt}>Punkt löschen</button>{/if}
      <button class="primaer" onclick={fertigBearbeiten}>Fertig</button>
    </div>
  </div>
{/if}

<style>
  .leiste {
    position: fixed;
    left: calc(var(--links, 0px) + 10px);
    right: calc(var(--rechts, 0px) + 10px);
    bottom: calc(var(--unten) + 10px);
    z-index: 15;
    display: grid;
    gap: 8px;
    padding: 10px;
    background: var(--surface-glas);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.45);
  }
  .hinweis {
    text-align: center;
  }
  .knoepfe {
    display: flex;
    gap: 8px;
  }
  .knoepfe button {
    flex: 1;
  }
</style>
