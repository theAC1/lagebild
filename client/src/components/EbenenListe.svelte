<script lang="ts">
  // Inhalt des Ebenen-Menüs (Basiskarte + Overlays); Position und Rahmen legt die jeweilige Bedienung fest.
  import { BASISKARTEN, OVERLAYS, type Overlay } from '../lib/karten.ts';
  import { setzeEinstellung, store } from '../lib/store.svelte.ts';

  function umschalten(o: Overlay) {
    const aktiv = store.einstellungen.overlays;
    setzeEinstellung('overlays', aktiv.includes(o) ? aktiv.filter((x) => x !== o) : [...aktiv, o]);
  }
</script>

<div class="gruppe">Karte</div>
{#each BASISKARTEN as b (b.id)}
  <button aria-pressed={store.einstellungen.basiskarte === b.id} onclick={() => setzeEinstellung('basiskarte', b.id)}>{b.label}</button>
{/each}
<div class="gruppe">Ebenen</div>
{#each OVERLAYS as o (o.id)}
  <button class="ebene" aria-pressed={store.einstellungen.overlays.includes(o.id)} onclick={() => umschalten(o.id)}>
    <span class="haken" aria-hidden="true"></span>{o.label}
  </button>
{/each}

<style>
  button {
    border: 0;
    text-align: left;
    background: transparent;
  }
  button[aria-pressed='true'] {
    color: var(--accent);
    font-weight: 600;
  }
  .gruppe {
    padding: 6px 12px 2px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
  }
  .ebene {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .haken {
    width: 18px;
    height: 18px;
    flex: none;
    border: 2px solid var(--line);
    border-radius: 4px;
  }
  .ebene[aria-pressed='true'] .haken {
    border-color: var(--accent);
    background: var(--accent);
    box-shadow: inset 0 0 0 3px var(--surface);
  }
</style>
