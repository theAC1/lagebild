<script lang="ts">
  import { groesse } from '../lib/groesse.svelte.ts';
  import { radialAktionenFuer, type RadialAktion } from '../lib/map.ts';
  import { store } from '../lib/store.svelte.ts';
  import { ui, type RadialZiel } from '../lib/ui.svelte.ts';

  let { ziel, x, y }: { ziel: RadialZiel; x: number; y: number } = $props();

  // Ring wächst mit der Bediengrösse, aber nie über den Bildschirm hinaus (Knopf + Beschriftung bleiben im Bild)
  const RADIUS = $derived(Math.min(88 * groesse.ui, Math.min(innerWidth, innerHeight) / 2 - 52 * groesse.ui));
  const RAND = $derived(RADIUS + 52 * groesse.ui);

  const aktionen = $derived(radialAktionenFuer(ziel));
  const titel = $derived.by(() => {
    if (ziel.art === 'ich') return store.ichSelbst?.rufname ?? 'Ich';
    if (ziel.art === 'teilnehmer') return store.teilnehmer.get(ziel.id)?.rufname ?? 'Teilnehmer';
    if (ziel.art === 'marker') return store.marker.get(ziel.id)?.bezeichnung || 'Marker';
    return ziel.art === 'sichtung' ? 'Sichtung' : 'Zeichnung';
  });
  const mitte = $derived({
    x: Math.min(Math.max(x, RAND), Math.max(RAND, innerWidth - RAND)),
    y: Math.min(Math.max(y, RAND), Math.max(RAND, innerHeight - RAND)),
  });

  const label = (a: RadialAktion) => (typeof a.label === 'string' ? a.label : a.label(ziel));
  const schliessen = () => (ui.radial = null);
  function ausfuehren(a: RadialAktion) {
    const z = ziel; // Props hängen an ui.radial und sind nach dem Schliessen weg
    ui.radial = null;
    a.aktion(z);
  }
</script>

<!-- Fläche ausserhalb des Rings: Tippen schliesst (pointerdown, damit die Karte darunter nichts abbekommt) -->
<div class="aussen" role="presentation" onpointerdown={schliessen} oncontextmenu={(e) => e.preventDefault()}></div>
<div class="ring" role="menu" aria-label="Aktionen für {titel}" style:left="{mitte.x}px" style:top="{mitte.y}px">
  <button class="mitte" aria-label="Menü schliessen" onclick={schliessen}>✕</button>
  {#each aktionen as a, i (a)}
    {@const winkel = (i / aktionen.length) * 2 * Math.PI - Math.PI / 2}
    <button
      class="knopf"
      role="menuitem"
      style:left="{Math.cos(winkel) * RADIUS}px"
      style:top="{Math.sin(winkel) * RADIUS}px"
      onclick={() => ausfuehren(a)}
    >
      <span class="symbol">{@html a.icon}</span>
      <span class="text">{label(a)}</span>
    </button>
  {/each}
  {#if !aktionen.length}<div class="leer leise">Keine Aktionen</div>{/if}
</div>

<style>
  .aussen {
    position: fixed;
    inset: 0;
    z-index: 26;
  }
  .ring {
    position: fixed;
    z-index: 27;
    width: 0;
    height: 0;
  }
  .ring button {
    position: absolute;
    translate: -50% -50%;
    padding: 0;
  }
  .mitte {
    left: 0;
    top: 0;
    width: 44px;
    min-height: 44px;
    border-radius: 50%;
    background: var(--karte-bg);
    color: var(--karte-text);
  }
  /* Symbol (nicht der ganze Knopf mit Beschriftung) sitzt auf dem Ring */
  .ring .knopf {
    translate: -50% -22px;
    width: 76px;
    min-height: 0;
    height: 64px;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 2px;
    border: 0;
    background: transparent;
  }
  .symbol {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--accent);
    color: var(--accent);
    box-shadow: 0 3px 10px rgb(0 0 0 / 0.5);
  }
  .text {
    max-width: 132px;
    padding: 0 5px;
    border-radius: 6px;
    background: var(--karte-bg);
    color: var(--karte-text);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .leer {
    position: absolute;
    top: 30px;
    translate: -50% 0;
    white-space: nowrap;
  }
</style>
