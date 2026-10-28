<script lang="ts">
  import { azimut, distanz, formatDistanz, formatLv95, formatMgrs, formatRichtung } from '../../lib/coords.ts';
  import { waehlePunkt, zentriere } from '../../lib/map.ts';
  import { formatAlter, send, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { funktionLabel, symbolSvg } from '../../lib/symbol.ts';
  import { oeffne, schliesse, toast } from '../../lib/ui.svelte.ts';
  import { darfAendern, formatZeit, markerName, setzenNachricht } from './logik.ts';

  let { id }: { id: string } = $props();

  const m = $derived(store.marker.get(id));
  const ersteller = $derived(m ? (store.teilnehmer.get(m.von)?.rufname ?? 'nicht mehr in der Lage') : '');
  const darf = $derived(m ? darfAendern(m, store.ich, store.istLeitung) : false);
  let loeschenFragen = $state(false);

  async function verschieben() {
    if (!m) return;
    const p = await waehlePunkt(`«${markerName(m)}» verschieben: Fadenkreuz auf den neuen Ort`);
    const aktuell = store.marker.get(id); // kann sich während der Punktwahl geändert haben
    if (!p || !aktuell) return;
    if (!send(setzenNachricht({ ...aktuell, lat: p.lat, lon: p.lon }))) toast('Keine Verbindung – Marker nicht verschoben.');
  }

  function loeschen() {
    if (!send({ typ: 'marker.loeschen', id })) return toast('Keine Verbindung – Marker nicht gelöscht.');
    toast('Marker gelöscht');
    schliesse();
  }
</script>

{#if !m}
  <p class="leise">Marker nicht mehr vorhanden.</p>
{:else}
  <div class="kopf">
    <div class="zeichen">{@html symbolSvg(m.sidc, { size: 34 })}</div>
    <div class="titel">
      <div class="name">{markerName(m)}</div>
      <div class="leise">{funktionLabel(m.sidc)}</div>
    </div>
  </div>

  {#if m.notiz}<p class="notiz">{m.notiz}</p>{/if}

  <dl>
    <dt>LV95</dt>
    <dd class="mono">{formatLv95(m)}</dd>
    <dt>MGRS</dt>
    <dd class="mono">{formatMgrs(m)}</dd>
    {#if store.meinePos}
      <dt>Von mir</dt>
      <dd class="mono">{formatDistanz(distanz(store.meinePos, m))} · {formatRichtung(azimut(store.meinePos, m))}</dd>
    {/if}
    <dt>Von</dt>
    <dd>{ersteller}</dd>
    <dt>Gesetzt</dt>
    <dd>{formatZeit(m.erstelltAm)}{#if m.geaendertAm !== m.erstelltAm}<span class="leise"> · geändert {formatAlter(serverJetzt() - m.geaendertAm)}</span>{/if}</dd>
  </dl>

  {#if loeschenFragen}
    <div class="aktionen">
      <button onclick={() => (loeschenFragen = false)}>Abbrechen</button>
      <button class="gefahr" onclick={loeschen}>Endgültig löschen</button>
    </div>
  {:else}
    <div class="aktionen">
      <button onclick={() => zentriere(m)}>Zentrieren</button>
      <button onclick={() => oeffne('rangebearing', { ziel: { art: 'marker', id } })}>Range &amp; Bearing</button>
      {#if darf}
        <button onclick={() => oeffne('marker', { bearbeiten: id })}>Bearbeiten</button>
        <button onclick={verschieben}>Verschieben</button>
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
  .zeichen {
    min-width: 56px;
    display: grid;
    place-items: center;
  }
  .titel {
    min-width: 0;
  }
  .name {
    font-size: 1.25rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .notiz {
    margin: 12px 0 0;
    padding: 10px 12px;
    background: var(--bg);
    border-radius: 8px;
    white-space: pre-wrap;
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
  }
  .aktionen {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .aktionen button {
    flex: 1 1 40%;
  }
</style>
