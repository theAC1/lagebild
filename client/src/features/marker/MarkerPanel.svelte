<script lang="ts">
  import { Punkt } from '../../../../shared/protocol.ts';
  import type { PanelProps } from '../registry.ts';
  import { azimut, distanz, formatDistanz, formatRichtung } from '../../lib/coords.ts';
  import { waehlePunkt, zentriere } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { symbolSvg, ZUGEHOERIGKEITEN } from '../../lib/symbol.ts';
  import { oeffne, waehle } from '../../lib/ui.svelte.ts';
  import MarkerFormular from './MarkerFormular.svelte';
  import { filtereMarker, markerName, zaehle, type MarkerFilter } from './logik.ts';

  let { params }: PanelProps = $props();

  // Modi: { neu: Punkt } → neuer Marker, { bearbeiten: id } → Formular, sonst Liste
  const neu = $derived(Punkt.safeParse(params.neu).data ?? null);
  const alt = $derived(typeof params.bearbeiten === 'string' ? store.marker.get(params.bearbeiten) : undefined);

  let filter = $state<MarkerFilter>('alle');
  const anzahl = $derived(zaehle(store.marker.values()));
  const liste = $derived(filtereMarker(store.marker.values(), filter, store.meinePos));
  const FILTER: { id: MarkerFilter; label: string }[] = [{ id: 'alle', label: 'Alle' }, ...ZUGEHOERIGKEITEN];

  async function setzenMitFadenkreuz() {
    const p = await waehlePunkt('Karte verschieben, bis das Fadenkreuz auf dem Ort liegt');
    if (p) oeffne('marker', { neu: p });
  }

  function zeige(id: string, p: Punkt) {
    zentriere(p);
    waehle('marker', id);
  }
</script>

{#if neu}
  {#key params}<MarkerFormular punkt={neu} />{/key}
{:else if typeof params.bearbeiten === 'string'}
  {#if alt}
    {#key params}<MarkerFormular {alt} punkt={alt} />{/key}
  {:else}
    <p class="leise">Dieser Marker wurde gelöscht.</p>
    <button onclick={() => oeffne('marker')}>Zur Markerliste</button>
  {/if}
{:else}
  <div class="liste-kopf">
    <button class="primaer neu" onclick={setzenMitFadenkreuz}>+ Marker setzen</button>
    <p class="leise tipp">Oder lange auf die Karte tippen → «Marker hier».</p>
    <div class="segmente" role="group" aria-label="Filter nach Zugehörigkeit">
      {#each FILTER as f (f.id)}
        <button aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>{f.label} <span class="n">{anzahl[f.id]}</span></button>
      {/each}
    </div>
  </div>

  {#if liste.length === 0}
    <p class="leise leer">{anzahl.alle === 0 ? 'Noch keine Marker in dieser Lage.' : 'Keine Marker mit dieser Zugehörigkeit.'}</p>
  {:else}
    <ul>
      {#each liste as m (m.id)}
        <li>
          <button class="zeile" onclick={() => zeige(m.id, m)}>
            <span class="zeichen">{@html symbolSvg(m.sidc, { size: 22 })}</span>
            <span class="name">{markerName(m)}</span>
            {#if store.meinePos}
              <span class="mono leise weg">{formatDistanz(distanz(store.meinePos, m))}<br />{formatRichtung(azimut(store.meinePos, m)).split(' / ')[0]}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .liste-kopf {
    display: grid;
    gap: 8px;
    margin-bottom: 8px;
  }
  .neu {
    width: 100%;
  }
  .tipp {
    margin: 0;
    font-size: 0.8rem;
  }
  .segmente button {
    font-size: 0.8rem;
  }
  .n {
    opacity: 0.7;
    font-size: 0.75rem;
  }
  .leer {
    padding: 8px 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .zeile {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    padding: 6px 12px;
    background: var(--bg);
  }
  .zeichen {
    width: 44px;
    display: grid;
    place-items: center;
    flex: none;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .weg {
    text-align: right;
    font-size: 0.8rem;
    line-height: 1.3;
  }
</style>
