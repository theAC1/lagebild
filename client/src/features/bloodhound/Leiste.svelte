<script lang="ts">
  // Kompakte Karte über der Karte: Ziel, Distanz, Azimut, Restzeit. Blinkt kurz beim Wechsel der Farbstufe.
  import { untrack } from 'svelte';
  import { formatDistanz } from '../../lib/coords.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { formatGrad, formatPromille } from '../rangebearing/logik.ts';
  import { formatRestzeit, STUFE_FARBE } from './logik.ts';
  import { beende, bh, messe, quittiere, tempoVon, zielName } from './zustand.svelte.ts';

  const ms = $derived(bh.aktiv ? messe(store.meinePos, bh.aktiv.ziel, tempoVon('ich')) : null);
  const stufe = $derived(ms?.stufe ?? 'neutral');
  const auftrag = $derived(bh.aktiv?.auftragId ? store.bloodhound.get(bh.aktiv.auftragId) : undefined);

  let blinkt = $state(false);
  let vorher = 'neutral';
  $effect(() => {
    const s = stufe;
    if (s === vorher) return;
    vorher = s;
    if (s === 'neutral') return;
    untrack(() => (blinkt = true));
    const t = setTimeout(() => (blinkt = false), 2400);
    return () => clearTimeout(t);
  });
</script>

{#if bh.aktiv}
  <section class="bh" class:blinkt data-stufe={stufe} style:--farbe={STUFE_FARBE[stufe]} aria-label="Bloodhound">
    {#if bh.aktiv.auftragId}
      <div class="auftrag">
        <strong>Auftrag von Leitung</strong>
        {#if auftrag && auftrag.quittiertAm === null}
          <button class="primaer" onclick={() => quittiere(auftrag.id)}>Quittieren</button>
        {:else}
          <span class="ok">quittiert</span>
        {/if}
      </div>
    {/if}
    <div class="zeile">
      <div class="info">
        <strong class="name">{zielName(bh.aktiv.ziel)}</strong>
        {#if ms}
          <span class="mono werte">
            <span>{formatDistanz(ms.dist)}</span>
            <span>{formatGrad(ms.grad)} · {formatPromille(ms.grad)}</span>
            <span class="rest">Rest {formatRestzeit(ms.restS)}</span>
          </span>
        {:else}
          <span class="leise">{store.meinePos ? 'Ziel ohne Position' : 'Eigene Position unbekannt'}</span>
        {/if}
      </div>
      <button class="ende" onclick={beende} aria-label="Bloodhound beenden">Beenden</button>
    </div>
  </section>
{/if}

<style>
  .bh {
    position: fixed;
    top: calc(var(--oben) + 6px + var(--banner-h, 0px));
    left: calc(var(--links, 0px) + 10px);
    /* rechts frei für die schwebenden Knöpfe (Karte, Folgen, Status) */
    right: calc(var(--rechts, 0px) + 70px);
    max-width: 440px;
    z-index: 8;
    display: grid;
    gap: 4px;
    padding: 6px 8px 6px 12px;
    background: rgb(22 27 31 / 0.92);
    border: 1px solid var(--line);
    border-left: 5px solid var(--farbe);
    border-radius: var(--radius);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
  }
  .zeile,
  .auftrag {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .info {
    min-width: 0;
    display: grid;
    line-height: 1.25;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .werte {
    display: flex;
    flex-wrap: wrap;
    column-gap: 10px;
    font-size: 0.85rem;
  }
  .rest {
    color: var(--farbe);
    font-weight: 700;
  }
  .ende {
    flex: none;
    min-height: 40px;
    padding: 0 10px;
  }
  .auftrag {
    font-size: 0.85rem;
    color: var(--accent);
  }
  .auftrag button {
    min-height: 36px;
    padding: 0 12px;
  }
  .ok {
    color: var(--ok);
  }
  .blinkt {
    animation: bh-blinken 0.6s ease-in-out 4;
  }
  @keyframes bh-blinken {
    50% {
      background: color-mix(in srgb, var(--farbe) 45%, rgb(22 27 31));
    }
  }
  @media (max-height: 500px) {
    .bh {
      right: calc(var(--rechts, 0px) + 230px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .blinkt {
      animation: none;
      outline: 2px solid var(--farbe);
    }
  }
</style>
