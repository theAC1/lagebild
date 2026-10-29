<script lang="ts">
  // Details einer Zeichnung: Art, Bezeichnung, Ebene, von, Masse; Bearbeiten/Löschen für Ersteller und Leitung.
  import { LngLatBounds } from 'maplibre-gl';
  import { formatKoord } from '../../lib/coords.ts';
  import { getMap } from '../../lib/map.ts';
  import { formatAlter, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { schliesse, toast } from '../../lib/ui.svelte.ts';
  import { loesche } from './aktionen.ts';
  import { umriss } from './darstellung.ts';
  import { bearbeite } from './interaktion.ts';
  import { artLabel, masse } from './logik.ts';
  import { darf } from './zustand.svelte.ts';

  let { id }: { id: string } = $props();

  const z = $derived(store.zeichnungen.get(id));
  const ersteller = $derived(z ? (store.teilnehmer.get(z.von)?.rufname ?? 'nicht mehr in der Lage') : '');
  const ebene = $derived(z ? store.ebenen.get(z.ebeneId) : undefined);
  let loeschenFragen = $state(false);

  function zentriere() {
    if (!z) return;
    const b = new LngLatBounds();
    for (const p of umriss(z)) b.extend([p.lon, p.lat]);
    getMap().fitBounds(b, { padding: 80, maxZoom: 17 });
  }
  async function loeschen() {
    if (!z) return;
    schliesse();
    if (await loesche([id])) toast('Zeichnung gelöscht');
  }
</script>

{#if !z}
  <p class="leise">Zeichnung nicht mehr vorhanden.</p>
{:else}
  <div class="kopf">
    <span class="farbe" style:background={z.stil.farbe}></span>
    <div>
      <div class="name">{z.bezeichnung || (z.art === 'text' ? z.text : artLabel(z))}</div>
      {#if z.bezeichnung || z.art === 'text'}<div class="leise">{artLabel(z)}</div>{/if}
    </div>
  </div>
  <dl>
    {#if z.art === 'text'}<dt>Text</dt><dd>{z.text}</dd>{/if}
    {#if z.bezeichnung}<dt>Bezeichnung</dt><dd>{z.bezeichnung}</dd>{/if}
    <dt>Ebene</dt>
    <dd>{ebene?.name ?? '–'}{#if ebene?.gesperrt}<span class="leise"> · gesperrt</span>{/if}</dd>
    {#each masse(z) as m (m.label)}<dt>{m.label}</dt><dd class="mono">{m.wert}</dd>{/each}
    {#if z.art === 'text' || z.art === 'kreis'}
      <dt>{z.art === 'kreis' ? 'Mittelpunkt' : 'Ort'}</dt>
      <dd class="mono">{formatKoord(z.punkte[0], store.einstellungen.koordFormat)}</dd>
    {/if}
    <dt>Von</dt>
    <dd>{ersteller}</dd>
    <dt>Erstellt</dt>
    <dd>{formatAlter(serverJetzt() - z.erstelltAm)}{#if z.geaendertAm !== z.erstelltAm}<span class="leise"> · geändert {formatAlter(serverJetzt() - z.geaendertAm)}</span>{/if}</dd>
  </dl>

  {#if loeschenFragen}
    <div class="aktionen">
      <button onclick={() => (loeschenFragen = false)}>Abbrechen</button>
      <button class="gefahr" onclick={loeschen}>Endgültig löschen</button>
    </div>
  {:else}
    <div class="aktionen">
      <button onclick={zentriere}>Zentrieren</button>
      {#if darf(z)}
        <button onclick={() => bearbeite(id)}>Bearbeiten</button>
        <button class="gefahr" onclick={() => (loeschenFragen = true)}>Löschen</button>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .kopf {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .farbe {
    width: 28px;
    height: 28px;
    flex: none;
    border-radius: 6px;
    border: 2px solid var(--line);
  }
  .name {
    font-size: 1.2rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 12px 0;
  }
  dt {
    color: var(--text-2);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .aktionen {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .aktionen button {
    flex: 1 1 30%;
  }
</style>
