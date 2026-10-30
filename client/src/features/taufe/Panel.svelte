<script lang="ts">
  // Tauf-Panel: Namenswahl für das getippte Objekt (immer wählen, kein Vorschlag), sonst Taufmodus starten,
  // Liste der Taufen und – für die Leitung – Namenslisten der Lage.
  import { LngLatBounds } from 'maplibre-gl';
  import { TAUF_FAMILIEN, type TaufFamilie } from '../../../../shared/protocol.ts';
  import { getMap } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { schliesse, waehle } from '../../lib/ui.svelte.ts';
  import { FAMILIE_LABEL, freieNamen } from './familien.ts';
  import Listen from './Listen.svelte';
  import { MIN_ZOOM, taufe, tz } from './zustand.svelte.ts';
  import type { PanelProps } from '../registry.ts';

  let {}: PanelProps = $props();

  let familie = $state<TaufFamilie>('flaeche');
  let freitext = $state('');
  let sendet = $state(false);
  let listenOffen = $state(false);
  $effect(() => {
    if (tz.wahl) familie = tz.wahl.familie;
  });
  const frei = $derived(tz.wahl ? freieNamen(store.lage, familie, store.taufen.values()) : []);
  const nachFamilie = $derived(TAUF_FAMILIEN.map((f) => ({ f, taufen: [...store.taufen.values()].filter((t) => t.familie === f).sort((a, b) => a.name.localeCompare(b.name, 'de-CH')) })).filter((g) => g.taufen.length));

  async function tauf(name: string) {
    if (!name.trim() || sendet) return;
    sendet = true;
    const neu = await taufe(name.trim(), familie);
    sendet = false;
    if (!neu) return;
    freitext = '';
    schliesse('taufe');
    // Strasse/Gewässer: weitere Tipps hängen Abschnitte an dieselbe Taufe
    if (neu.geometrie.type === 'LineString' || neu.geometrie.type === 'MultiLineString') tz.verlaengern = neu.id;
  }

  function starte() {
    tz.modus = true;
    const m = getMap();
    if (m.getZoom() < MIN_ZOOM) m.easeTo({ zoom: MIN_ZOOM + 1 });
    schliesse('taufe');
  }

  function zeige(id: string) {
    const t = store.taufen.get(id);
    if (!t) return;
    const b = new LngLatBounds();
    const g = t.geometrie;
    for (const p of g.type === 'LineString' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.coordinates.flat()) b.extend(p as [number, number]);
    getMap().fitBounds(b, { padding: 80, maxZoom: 18 });
    waehle('taufe', id);
  }
</script>

{#if tz.wahl}
  <section class="wahl" aria-label="Namen wählen">
    <h3>{FAMILIE_LABEL[familie]} taufen</h3>
    {#if tz.wahl.vorlage}<p class="leise">In der Karte: {tz.wahl.vorlage}</p>{/if}
    {#if tz.wahl.familieWaehlbar}
      <div class="chips" role="group" aria-label="Familie">
        {#each TAUF_FAMILIEN.filter((f) => f !== 'strasse') as f (f)}
          <button aria-pressed={familie === f} onclick={() => (familie = f)}>{FAMILIE_LABEL[f]}</button>
        {/each}
      </div>
    {/if}
    <p class="gruppe-titel">Freie Namen</p>
    {#if frei.length}
      <div class="chips namen" role="group" aria-label="Freie Namen">
        {#each frei as n (n)}
          <button disabled={sendet} onclick={() => tauf(n)}>{n}</button>
        {/each}
      </div>
    {:else}
      <p class="leise">Alle Namen der Liste sind vergeben – eigenen Namen eingeben.</p>
    {/if}
    <form
      class="frei"
      onsubmit={(e) => {
        e.preventDefault();
        void tauf(freitext);
      }}
    >
      <input bind:value={freitext} maxlength="40" placeholder="Eigener Name" aria-label="Eigener Name" />
      <button class="primaer" disabled={!freitext.trim() || sendet}>Taufen</button>
    </form>
    <button class="abbrechen" onclick={() => ((tz.wahl = null), schliesse('taufe'))}>Abbrechen</button>
  </section>
{:else}
  <div class="kopf">
    {#if tz.modus}
      <p>Taufmodus läuft: Objekt auf der Karte antippen.</p>
    {:else}
      <button class="primaer gross" onclick={starte}>Taufmodus starten</button>
      <p class="leise">Gebäude, Strassen, Gewässer, Wald und Flächen antippen und aus der Namensliste taufen. Fehlt ein Objekt, im Taufmodus eine Fläche zeichnen.</p>
    {/if}
  </div>
  {#if nachFamilie.length}
    {#each nachFamilie as g (g.f)}
      <p class="gruppe-titel">{FAMILIE_LABEL[g.f]} ({g.taufen.length})</p>
      <ul>
        {#each g.taufen as t (t.id)}
          <li>
            <button class="eintrag" onclick={() => zeige(t.id)}>
              <span class:ziel={t.ziel}>{t.name}</span>
              {#if t.stoss !== null}<span class="leise">Stoss {Math.round(t.stoss)}°</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  {:else}
    <p class="leise">Noch keine Taufen in dieser Lage.</p>
  {/if}
  {#if store.istLeitung}
    <button class="listen" aria-expanded={listenOffen} onclick={() => (listenOffen = !listenOffen)}>Namenslisten der Lage</button>
    {#if listenOffen}<Listen />{/if}
  {/if}
{/if}

<style>
  h3 {
    margin: 0 0 4px;
  }
  .wahl {
    display: grid;
    gap: 8px;
  }
  .namen button {
    font-weight: 600;
  }
  .frei {
    display: flex;
    gap: 8px;
  }
  .frei input {
    flex: 1;
    min-width: 0;
  }
  .kopf {
    display: grid;
    gap: 8px;
    margin-bottom: 8px;
  }
  .gross {
    min-height: var(--haupt);
  }
  ul {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .eintrag {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    text-align: left;
  }
  .ziel {
    background: #ffeb3b;
    color: #111;
    padding: 0 6px;
    border-radius: 3px;
    font-weight: 700;
  }
  .listen {
    width: 100%;
    margin-top: 8px;
  }
</style>
