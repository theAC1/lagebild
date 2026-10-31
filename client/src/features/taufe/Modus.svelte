<script lang="ts">
  // Leiste des Taufmodus über der Karte: deutlich sichtbar (gelber Rahmen), Hinweis, Fläche zeichnen, Fertig.
  import { store } from '../../lib/store.svelte.ts';
  import { FAMILIE_LABEL } from './familien.ts';
  import { beendeModus, MIN_ZOOM, tz } from './zustand.svelte.ts';
  import { oeffne } from '../../lib/ui.svelte.ts';

  const verlaengert = $derived(tz.verlaengern ? store.taufen.get(tz.verlaengern) : undefined);
  const umgefaerbt = $derived(tz.umfaerben ? store.taufen.get(tz.umfaerben) : undefined);
  const hinweis = $derived.by(() => {
    if (tz.zeichnen) return tz.zeichnen.length < 3 ? `Eckpunkte antippen (${tz.zeichnen.length}/3)` : `${tz.zeichnen.length} Punkte – abschliessen oder weiter antippen`;
    if (tz.zoom < MIN_ZOOM - 0.01) return `Näher zoomen (ab Stufe ${MIN_ZOOM})`;
    if (verlaengert) return `Weitere Abschnitte antippen: hängt an «${verlaengert.name}»`;
    if (tz.wahl?.teile) return 'Weitere Gebäudeteile antippen: dazu, nochmals: weg';
    return 'Objekt antippen und Namen wählen';
  });

  function abschliessen() {
    const ps = tz.zeichnen;
    if (!ps || ps.length < 3) return;
    tz.zeichnen = null;
    tz.wahl = { familie: 'flaeche', geometrie: { type: 'Polygon', coordinates: [[...ps, ps[0]]] }, quelle: 'gezeichnet', objektart: 'gezeichnet', familieWaehlbar: true };
    oeffne('taufe');
  }
</script>

{#if umgefaerbt}
  <div class="tf-rahmen" aria-hidden="true"></div>
  <section class="tf-modus" aria-label="Fassaden umfärben">
    <div class="text">
      <strong>Fassaden «{umgefaerbt.name}»</strong>
      <span>Fassade antippen schaltet weiss → rot → schwarz → grün</span>
    </div>
    <button class="primaer" onclick={() => (tz.umfaerben = null)}>Fertig</button>
  </section>
{:else if tz.modus}
  <div class="tf-rahmen" aria-hidden="true"></div>
  <section class="tf-modus" aria-label="Taufmodus">
    <div class="text">
      <strong>Taufmodus{#if verlaengert} · {FAMILIE_LABEL[verlaengert.familie]} verlängern{/if}</strong>
      <span>{hinweis}</span>
    </div>
    <div class="knoepfe">
      {#if tz.zeichnen}
        <button onclick={() => (tz.zeichnen = tz.zeichnen!.length ? tz.zeichnen!.slice(0, -1) : null)}>{tz.zeichnen.length ? 'Zurück' : 'Abbrechen'}</button>
        <button class="primaer" disabled={tz.zeichnen.length < 3} onclick={abschliessen}>Abschliessen</button>
      {:else if verlaengert}
        <button class="primaer" onclick={() => (tz.verlaengern = null)}>Fertig verlängern</button>
      {:else}
        <button onclick={() => ((tz.zeichnen = []), (tz.wahl = null))}>Fläche zeichnen</button>
        <button class="primaer" onclick={beendeModus}>Fertig</button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .tf-rahmen {
    position: fixed;
    inset: 0;
    left: var(--karte-l, 0px);
    right: var(--karte-r, 0px);
    border: 4px solid #ffeb3b;
    pointer-events: none;
    z-index: 4;
  }
  .tf-modus {
    position: fixed;
    top: calc(var(--oben) + 6px + var(--banner-h, 0px));
    left: calc(var(--links, 0px) + 10px);
    right: calc(var(--rechts, 0px) + 70px);
    max-width: 520px;
    z-index: 9;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 10px;
    padding: 6px 8px 6px 12px;
    background: var(--kopf-bg);
    border: 1px solid var(--line);
    border-left: 6px solid #ffeb3b;
    border-radius: var(--radius);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
  }
  .text {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .text span {
    font-size: 0.85rem;
    color: var(--text-2);
  }
  .knoepfe {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .knoepfe button {
    min-height: 40px;
    padding: 0 12px;
  }
  /* Querformat Handy: eine Zeile, damit die Karte frei bleibt */
  @media (max-height: 500px) {
    .tf-modus {
      flex-wrap: nowrap;
      padding: 4px 6px 4px 10px;
    }
    .text span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .knoepfe button {
      min-height: 36px;
      padding: 0 10px;
    }
  }
  /* Hochformat mit offenem Sheet: dort schwebt der Alarm-Knopf; der gelbe Rahmen zeigt den Modus weiter an */
  @media (orientation: portrait) {
    :global(:root:has(.panels > .sheet)) .tf-modus {
      display: none;
    }
  }
</style>
