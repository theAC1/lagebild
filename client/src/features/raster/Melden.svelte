<script lang="ts">
  // Marker per Rasterposition: Raster, Zeile, Spalte, Quadrant per Chips (keine Tastatur), Marker in die Mitte der Zelle/des Viertels.
  import { untrack } from 'svelte';
  import type { RasterArt } from '../../../../shared/protocol.ts';
  import { ansprache, funkAnsprache, QUADRANTEN, RASTER_NAME, spaltenName, zelleVon, zeilenName, zellMitte, type Quadrant } from '../../../../shared/raster.ts';
  import { kartenMitte, zentriere } from '../../lib/map.ts';
  import { schliesse } from '../../lib/ui.svelte.ts';
  import { setzeSchnell } from '../marker/schnell.ts';
  import { fixierte, rz } from './zustand.svelte.ts';

  const liste = $derived(fixierte());
  // Vorgabe: das Raster und die Zelle unter der Kartenmitte (Piccolo vor Grande), sonst A 01 im ersten Raster
  const start = untrack(() => {
    const mitte = kartenMitte();
    for (const r of [...fixierte()].reverse()) {
      const z = mitte && zelleVon(r, mitte);
      if (z) return { art: r.art, ...z, quadrant: null };
    }
    return { art: fixierte()[0]?.art ?? 'grande', zeile: 0, spalte: 0, quadrant: null };
  });
  let art = $state<RasterArt>(start.art);
  let zeileW = $state(start.zeile);
  let spalteW = $state(start.spalte);
  let quadrant = $state<Quadrant | null>(start.quadrant);
  let sendet = $state(false);

  const r = $derived(liste.find((x) => x.art === art) ?? liste[0]);
  // anderes Raster gewählt: Zeile/Spalte innerhalb halten
  const zelle = $derived(r ? { zeile: Math.min(zeileW, r.zeilen - 1), spalte: Math.min(spalteW, r.spalten - 1), quadrant } : null);

  $effect(() => {
    rz.markierung = r && zelle ? { art: r.art, zelle } : null;
    return () => (rz.markierung = null);
  });

  async function setzen() {
    if (!r || !zelle || sendet) return;
    const p = zellMitte(r, zelle);
    sendet = true;
    const ok = await setzeSchnell(p, `${RASTER_NAME[r.art]} ${ansprache(zelle)}`);
    sendet = false;
    if (!ok) return;
    schliesse('raster');
    zentriere(p);
  }
</script>

{#if !r || !zelle}
  <p class="leise">Noch kein fixiertes Führungsraster in dieser Lage.</p>
{:else}
  <div class="ansage">
    <div class="mono gross" aria-live="polite">{RASTER_NAME[r.art]} {ansprache(zelle)}</div>
    <div class="leise">{funkAnsprache(zelle)}</div>
  </div>
  {#if liste.length > 1}
    <div class="segmente" role="group" aria-label="Raster">
      {#each liste as x (x.art)}<button aria-pressed={x.art === r.art} onclick={() => (art = x.art)}>{RASTER_NAME[x.art]}</button>{/each}
    </div>
  {/if}
  <div class="gruppe-titel">Zeile</div>
  <div class="chips raster-chips" role="group" aria-label="Zeile">
    {#each { length: r.zeilen } as _, i (i)}
      <button aria-pressed={zelle.zeile === i} onclick={() => (zeileW = i)}>{zeilenName(i)}</button>
    {/each}
  </div>
  <div class="gruppe-titel">Spalte</div>
  <div class="chips raster-chips" role="group" aria-label="Spalte">
    {#each { length: r.spalten } as _, i (i)}
      <button aria-pressed={zelle.spalte === i} onclick={() => (spalteW = i)}>{spaltenName(i)}</button>
    {/each}
  </div>
  <div class="gruppe-titel">Quadrant</div>
  <div class="quadrant">
    <div class="viertel" role="group" aria-label="Quadrant">
      {#each QUADRANTEN as q (q)}<button aria-pressed={quadrant === q} onclick={() => (quadrant = quadrant === q ? null : q)}>{q}</button>{/each}
    </div>
    <div class="chips"><button aria-pressed={quadrant === null} onclick={() => (quadrant = null)}>Ganze Zelle</button></div>
  </div>
  <button class="primaer breit" disabled={sendet} onclick={setzen}>Marker setzen</button>
{/if}

<style>
  .ansage {
    display: grid;
    gap: 2px;
    margin-bottom: 8px;
  }
  .gross {
    font-size: 1.4rem;
    font-weight: 800;
  }
  .raster-chips {
    gap: 4px;
  }
  .raster-chips button {
    min-width: var(--touch);
    padding: 0 6px;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }
  .quadrant {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
  }
  /* A B / C D wie die Legende in Juans Vorlage */
  .viertel {
    display: grid;
    grid-template-columns: repeat(2, var(--touch));
    gap: 4px;
  }
  .viertel button {
    padding: 0;
    font-weight: 800;
  }
  .viertel button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  .breit {
    width: 100%;
  }
</style>
