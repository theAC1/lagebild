<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMapReady } from '../lib/map.ts';

  let { titel, onclose, children, panelId }: { titel: string; onclose: () => void; children: Snippet; panelId?: string } = $props();

  /** Quer schweben die Panels über der Karte: MapLibre-Padding links bis hinter die Panels, damit «Kartenmitte»
   *  (Raster, Folgen, Zentrieren) im freien Teil liegt. Das zuletzt geschlossene Panel setzt es zurück. */
  function kartenPadding(sheet: HTMLElement) {
    const panels = sheet.parentElement!;
    const setze = () =>
      onMapReady((m) => {
        const offen = panels.isConnected && panels.querySelector('.sheet') && matchMedia('(orientation: landscape)').matches;
        const left = offen ? Math.round(panels.getBoundingClientRect().right) : 0;
        if (m.getPadding().left !== left) m.setPadding({ ...m.getPadding(), left });
      });
    const ro = new ResizeObserver(setze);
    ro.observe(panels);
    return () => {
      ro.disconnect();
      requestAnimationFrame(setze); // nach dem Entfernen aus dem DOM messen
    };
  }
</script>

<!-- data-panel: App merkt sich, in welchem Panel zuletzt getippt wurde (Esc, Drill-down) -->
<section class="sheet" aria-label={titel} data-panel={panelId} {@attach kartenPadding}>
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
      width: min(520px, 100vw);
      transform: translateX(-50%);
    }
  }
  /* Daumen-Ränder hoch: das Dock bleibt unter dem Sheet sichtbar und bedienbar */
  @media (orientation: portrait) {
    :global(:root:has(.daumen)) .sheet {
      bottom: var(--unten);
      padding-bottom: 0;
      /* der Alarm (68 px, wandert bei offenem Sheet nach oben) bleibt auch bei grosser Bediengrösse frei */
      max-height: min(70dvh, calc(100dvh - var(--unten) - var(--oben) - 88px));
    }
  }
  /* Querformat: schwebende Karte wie das Panel des Menüs (App legt die Panels mit Abstand in eine Zeile links) */
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
      padding-bottom: 0;
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
      animation-name: rein;
    }
    /* die Karte ist 16 px kürzer als die frühere Spalte: Kopf nur so hoch wie das ✕, damit der Inhalt (Wiedergabe-Liste) Platz behält */
    .sheet header,
    .sheet .inhalt {
      padding-top: 0;
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
  /* Trefffläche nie unter 44 px, auch bei kleiner Bediengrösse (var(--u): die px bleiben fix) */
  .schliessen {
    width: max(44px, calc(48 * var(--u)));
    min-height: max(44px, calc(48 * var(--u)));
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
