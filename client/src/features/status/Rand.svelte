<script lang="ts">
  // Hauptknopf der Daumen-Ränder: zeigt den eigenen Status als Farbe und Text, ein Tipp öffnet die Auswahl.
  import { statusDef, store } from '../../lib/store.svelte.ts';
  import { istOffen, oeffne, schliesse } from '../../lib/ui.svelte.ts';
  import { textFarbeAuf } from './logik.ts';

  const ich = $derived(store.ichSelbst);
  const def = $derived(ich ? statusDef(ich.status) : null);
  const farbe = $derived(def?.farbe ?? '#6b6f5e');
  const label = $derived(def?.label ?? ich?.status ?? '–');
</script>

<button
  class="rand-knopf status"
  style:background={farbe}
  style:color={textFarbeAuf(farbe)}
  aria-label="Eigener Status: {label}. Status ändern"
  aria-pressed={istOffen('status')}
  disabled={!ich}
  onclick={() => (istOffen('status') ? schliesse('status') : oeffne('status'))}
>
  <span class="klein">Status</span>
  <strong>{label}</strong>
</button>

<style>
  .status {
    border: 2px solid rgb(0 0 0 / 0.35);
    text-transform: none;
    letter-spacing: 0;
  }
  .status[aria-pressed='true'] {
    border-color: var(--text);
    box-shadow: 0 0 0 2px var(--accent);
  }
  /* min(…, vw): im Hochformat-Dock teilen sich vier Knöpfe die Breite (Bediengrösse) */
  .klein {
    font-size: min(0.6rem, 2.5vw);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.85;
  }
  strong {
    max-width: 100%;
    font-size: min(0.82rem, 3.4vw);
    overflow-wrap: anywhere;
    white-space: normal;
  }
  /* quer in der Melde-Spalte: höher als die anderen, der Status ist die häufigste Meldung */
  :global(.rand.links) .status {
    height: clamp(var(--haupt), 24dvh, 128px);
  }
</style>
