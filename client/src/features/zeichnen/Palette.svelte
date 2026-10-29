<script lang="ts">
  // Desktop: kompakte Werkzeugpalette oben links am Kartenrand (rechts neben offenen Seitenpanels).
  import { istOffen, oeffne, schliesse } from '../../lib/ui.svelte.ts';
  import { rueckgaengig, wiederholen } from './aktionen.ts';
  import { IKON, IKON_FANG, IKON_VOR, IKON_ZURUECK } from './ikonen.ts';
  import { WERKZEUGE, type Gruppe } from './werkzeuge.ts';
  import { setzeFang, setzeWerkzeug, verlauf, zn } from './zustand.svelte.ts';

  const GRUPPEN: { id: Gruppe; label: string }[] = [
    { id: 'bedienen', label: 'Bedienen' },
    { id: 'formen', label: 'Formen' },
    { id: 'taktisch', label: 'Taktische Linien' },
    { id: 'raeume', label: 'Räume' },
  ];
  const kannZurueck = $derived((void zn.verlaufStand, verlauf.kannZurueck));
  const kannVor = $derived((void zn.verlaufStand, verlauf.kannVor));
  const panel = (tab: string) => (istOffen('zeichnen') ? schliesse('zeichnen') : oeffne('zeichnen', { tab }));
</script>

<div class="palette" role="toolbar" aria-label="Zeichenwerkzeuge" aria-orientation="vertical">
  {#each GRUPPEN as g (g.id)}
    <div class="gruppe" role="group" aria-label={g.label}>
      {#each WERKZEUGE.filter((w) => w.gruppe === g.id) as w (w.id)}
        <button
          class="wz"
          aria-label={w.label}
          title={w.kuerzel ? `${w.label} (${w.kuerzel})` : w.label}
          aria-pressed={zn.werkzeug === w.id}
          onclick={() => setzeWerkzeug(zn.werkzeug === w.id && w.id !== 'auswahl' ? 'auswahl' : w.id)}
        >
          {@html IKON[w.id]}
          {#if w.kuerzel}<span class="kz">{w.kuerzel}</span>{/if}
        </button>
      {/each}
    </div>
  {/each}
  <div class="gruppe" role="group" aria-label="Optionen">
    <button class="wz" aria-label="Fang" title="Fang an Punkte und Linien (Alt gedrückt: aus)" aria-pressed={zn.fangAn} onclick={() => setzeFang(!zn.fangAn)}>{@html IKON_FANG}</button>
    <button class="wz text" aria-label="Stil" title="Stil und Eigenschaften" aria-pressed={istOffen('zeichnen')} onclick={() => panel('eigenschaften')}>Stil</button>
    <button class="wz" aria-label="Rückgängig" title="Rückgängig (Ctrl+Z)" disabled={!kannZurueck} onclick={rueckgaengig}>{@html IKON_ZURUECK}</button>
    <button class="wz" aria-label="Wiederholen" title="Wiederholen (Ctrl+Y)" disabled={!kannVor} onclick={wiederholen}>{@html IKON_VOR}</button>
  </div>
</div>

<style>
  .palette {
    position: fixed;
    top: calc(var(--oben) + 10px + var(--banner-h, 0px));
    left: calc(var(--links, 0px) + 10px);
    z-index: 9;
    display: grid;
    gap: 6px;
    padding: 5px;
    background: var(--surface-glas);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 3px 12px rgb(0 0 0 / 0.4);
    max-height: calc(100dvh - var(--oben) - var(--unten) - 90px);
    overflow-y: auto;
    scrollbar-width: none;
  }
  .gruppe {
    display: grid;
    grid-template-columns: repeat(2, 34px);
    gap: 3px;
  }
  .gruppe + .gruppe {
    padding-top: 6px;
    border-top: 1px solid var(--line);
  }
  .wz {
    position: relative;
    width: 34px;
    min-height: 34px;
    height: 34px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text);
  }
  .wz :global(svg) {
    width: 20px;
    height: 20px;
  }
  .wz:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .wz[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-text);
  }
  .wz.text {
    font-size: 0.72rem;
    font-weight: 700;
  }
  .kz {
    position: absolute;
    right: 2px;
    bottom: 0;
    font-size: 9px;
    font-weight: 700;
    opacity: 0.65;
  }
</style>
