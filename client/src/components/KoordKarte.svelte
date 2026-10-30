<script lang="ts">
  // Radial «Koordinate» auf leerer Karte: der Punkt in drei Formaten zum Kopieren, dazu Distanz/Azimut von mir.
  // Kompakt, damit sie auch auf 740×360 quer bei «Sehr gross» ganz im Bild steht; Tippen daneben oder Esc schliesst.
  import { azimut, distanz, formatDistanz, formatLv95, formatMgrs, formatRichtung, formatWgs84 } from '../lib/coords.ts';
  import { rasterAnsprachen } from '../features/raster/zustand.svelte.ts';
  import { getMap, markierePunkt } from '../lib/map.ts';
  import { store } from '../lib/store.svelte.ts';
  import { ikon, toast, ui } from '../lib/ui.svelte.ts';
  import type { Punkt } from '../../../shared/protocol.ts';

  let { punkt }: { punkt: Punkt } = $props();

  const zeilen = $derived(
    [
      { label: 'LV95', wert: formatLv95(punkt) },
      { label: 'MGRS', wert: formatMgrs(punkt) },
      { label: 'WGS84', wert: formatWgs84(punkt) },
      // fixierte Führungsraster: «Grande H 09 C» als eigene Zeile, kopierbar wie die Koordinaten
      ...rasterAnsprachen(punkt).map((wert, i) => ({ label: i ? `Raster ${i + 1}` : 'Raster', wert })),
    ].map((z) => ({ ...z, teile: haelften(z.wert) })),
  );
  // Liegt der Punkt in der unteren Hälfte, steht die Karte oben (und umgekehrt): der Punkt bleibt sichtbar
  const oben = $derived.by(() => {
    const m = getMap();
    return m.project([punkt.lon, punkt.lat]).y + m.getContainer().getBoundingClientRect().top > innerHeight / 2;
  });
  let kopiert = $state<string | null>(null);

  /** Wert in zwei Hälften am mittleren Leerschlag: bricht er um, dann zwischen den Teilen, nicht mitten in einer Zahl. */
  function haelften(s: string): [string, string] {
    let i = -1;
    for (let j = s.indexOf(' '); j >= 0; j = s.indexOf(' ', j + 1)) if (i < 0 || Math.abs(j - s.length / 2) < Math.abs(i - s.length / 2)) i = j;
    return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
  }

  $effect(() => markierePunkt(punkt));

  async function kopiere(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      kopiert = label;
      setTimeout(() => kopiert === label && (kopiert = null), 1500);
    } catch {
      toast('Kopieren nicht möglich');
    }
  }
</script>

<!-- Fläche daneben: Tippen schliesst (pointerdown, damit die Karte darunter nichts abbekommt) -->
<div class="aussen" role="presentation" onpointerdown={() => (ui.koordinate = null)}></div>
<div class="koord-karte" class:oben role="dialog" aria-label="Koordinate">
  {#each zeilen as z (z.label)}
    <button class="zeile" aria-label="{z.label} {z.wert} kopieren" onclick={() => kopiere(z.label, z.wert)}>
      <span class="label">{z.label}</span>
      <span class="mono wert"><span>{z.teile[0]}</span> <span>{z.teile[1]}</span></span>
      {#if kopiert === z.label}
        <span class="ok">Kopiert</span>
      {:else}
        <span class="kopie">{@html ikon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>')}</span>
      {/if}
    </button>
  {/each}
  {#if store.meinePos}
    <div class="leise mono von-mir">
      Von mir: {formatDistanz(distanz(store.meinePos, punkt))} · {formatRichtung(azimut(store.meinePos, punkt))}
    </div>
  {/if}
</div>

<style>
  .aussen {
    position: fixed;
    inset: 0;
    z-index: 26;
  }
  /* Über Kopfzeile, Rändern und Panels (vorübergehend), damit sie auch im niedrigen Querformat ganz Platz hat */
  .koord-karte {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(8px + var(--safe-bottom));
    max-width: 560px;
    max-height: calc(100dvh - 16px);
    margin-inline: auto;
    overflow-y: auto;
    z-index: 27;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    padding: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
  }
  .koord-karte.oben {
    bottom: auto;
    top: calc(8px + var(--safe-top));
  }
  .zeile {
    display: grid;
    grid-template-columns: 3.4em minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    text-align: left;
    background: var(--bg);
    padding: 2px 10px;
  }
  /* langer Wert bricht um statt abgeschnitten zu werden (schmales Handy, grosse Schrift), aber nur zwischen den Hälften */
  .wert > span {
    white-space: nowrap;
  }
  .label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent);
  }
  .kopie {
    display: grid;
    color: var(--text-2);
  }
  .ok {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ok);
  }
  .von-mir {
    padding: 2px 4px 0;
  }
</style>
