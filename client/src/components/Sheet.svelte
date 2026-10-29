<script lang="ts">
  import type { Snippet } from 'svelte';

  let { titel, onclose, children, panelId }: { titel: string; onclose: () => void; children: Snippet; panelId?: string } = $props();
</script>

<!-- data-panel: App merkt sich, in welchem Panel zuletzt getippt wurde (Esc, Drill-down) -->
<section class="sheet" aria-label={titel} data-panel={panelId}>
  <header>
    <h2>{titel}</h2>
    <button class="icon schliessen" onclick={onclose} aria-label="Schliessen">✕</button>
  </header>
  <div class="inhalt">{@render children()}</div>
</section>

<style>
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    max-height: 70dvh;
    display: flex;
    flex-direction: column;
    background: var(--surface-glas);
    border-top: 1px solid var(--line);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -8px 24px rgb(0 0 0 / 0.4);
    padding-bottom: var(--safe-bottom);
    animation: hoch 0.18s ease-out;
  }
  @media (min-width: 640px) {
    .sheet {
      left: 50%;
      width: 520px;
      transform: translateX(-50%);
    }
  }
  /* Daumen-Ränder hoch: das Dock bleibt unter dem Sheet sichtbar und bedienbar */
  @media (orientation: portrait) {
    :global(:root:has(.daumen)) .sheet {
      bottom: var(--unten);
      padding-bottom: 0;
    }
  }
  /* Querformat: Seitenpanel neben der Karte (App legt die Panels in eine Zeile links) */
  @media (orientation: landscape) {
    .sheet {
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      transform: none;
      width: var(--panel-b);
      flex: none;
      max-height: none;
      height: 100%;
      border-top: 0;
      border-right: 1px solid var(--line);
      border-radius: 0;
      box-shadow: 4px 0 18px rgb(0 0 0 / 0.35);
      animation-name: rein;
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 0 16px;
  }
  /* Werkzeug-Optik: Titel in Versalien wie die Randknöpfe, Akzentstrich links */
  h2 {
    flex: 1;
    margin: 0;
    padding-left: 10px;
    border-left: 3px solid var(--accent);
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .schliessen {
    border: 0;
    background: transparent;
    font-size: 1.2rem;
  }
  .inhalt {
    overflow-y: auto;
    padding: 4px 16px 16px;
    overscroll-behavior: contain;
  }
  @keyframes rein {
    from {
      translate: -24px 0;
      opacity: 0;
    }
  }
  @keyframes hoch {
    from {
      translate: 0 40px;
      opacity: 0;
    }
  }
</style>
