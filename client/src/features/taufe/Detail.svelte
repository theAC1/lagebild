<script lang="ts">
  // Details einer Taufe: umbenennen, Zielobjekt, Stossrichtung (Kompass-Chips) und Fassaden, Strasse verlängern,
  // löschen. Rechte: alle (Juan, 30.10.).
  import { LngLatBounds } from 'maplibre-gl';
  import { formatAlter, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { getMap } from '../../lib/map.ts';
  import { schliesse, toast } from '../../lib/ui.svelte.ts';
  import { istLinie } from './darstellung.ts';
  import { FAMILIE_LABEL, freieNamen } from './familien.ts';
  import { FASSADE_FARBE, FASSADE_LABEL, FASSADEN, KOMPASS } from './fassaden.ts';
  import { aendere, loesche, tz } from './zustand.svelte.ts';

  let { id }: { id: string } = $props();

  const t = $derived(store.taufen.get(id));
  const ersteller = $derived(t ? (store.teilnehmer.get(t.von)?.rufname ?? 'nicht mehr in der Lage') : '');
  const linie = $derived(!!t && istLinie(t.geometrie));
  let umbenennen = $state(false);
  let neuerName = $state('');
  let loeschenFragen = $state(false);
  const frei = $derived(t && umbenennen ? freieNamen(store.lage, t.familie, store.taufen.values(), t.id) : []);

  async function nenne(name: string) {
    if (!t || !name.trim()) return;
    if (await aendere({ id: t.id, name: name.trim() })) {
      umbenennen = false;
      neuerName = '';
    }
  }
  function zentriere() {
    if (!t) return;
    const b = new LngLatBounds();
    const g = t.geometrie;
    for (const p of g.type === 'LineString' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.coordinates.flat()) b.extend(p as [number, number]);
    getMap().fitBounds(b, { padding: 80, maxZoom: 18 });
  }
  function verlaengern() {
    if (!t) return;
    tz.modus = true;
    tz.verlaengern = t.id;
    schliesse();
  }
  /** Gezeichnete Fläche/Wald: Punkte ziehen, einfügen, löschen (Juan, 31.10.) */
  function punkte() {
    if (!t || t.geometrie.type !== 'Polygon') return;
    tz.modus = true;
    tz.wahl = null;
    tz.zeichnen = { punkte: t.geometrie.coordinates[0].slice(0, -1).map(([lon, lat]) => ({ lat, lon })), fertig: true, id: t.id };
    schliesse();
  }
  function umfaerben() {
    if (!t) return;
    tz.umfaerben = t.id;
    schliesse();
  }
  async function loeschen() {
    if (!t) return;
    const name = t.name;
    schliesse();
    if (await loesche(id)) toast(`Taufe «${name}» gelöscht`);
  }
</script>

{#if !t}
  <p class="leise">Taufe nicht mehr vorhanden.</p>
{:else}
  <div class="kopf">
    <span class="name" class:ziel={t.ziel}>{t.name}</span>
    <span class="leise">{FAMILIE_LABEL[t.familie]}{t.quelle === 'gezeichnet' ? ' · gezeichnet' : ''}</span>
  </div>

  <div class="chips" role="group" aria-label="Hervorhebung">
    <button aria-pressed={t.ziel} onclick={() => aendere({ id: t.id, ziel: !t.ziel })}>Zielobjekt</button>
    <button aria-pressed={umbenennen} onclick={() => (umbenennen = !umbenennen)}>Umbenennen</button>
  </div>

  {#if umbenennen}
    <div class="umbenennen">
      {#if frei.length}
        <div class="chips" role="group" aria-label="Freie Namen">
          {#each frei as n (n)}<button onclick={() => nenne(n)}>{n}</button>{/each}
        </div>
      {/if}
      <form
        class="frei"
        onsubmit={(e) => {
          e.preventDefault();
          void nenne(neuerName);
        }}
      >
        <input bind:value={neuerName} maxlength="40" placeholder="Eigener Name" aria-label="Neuer Name" />
        <button class="primaer" disabled={!neuerName.trim()}>Übernehmen</button>
      </form>
    </div>
  {/if}

  {#if !linie}
    <p class="gruppe-titel">Stossrichtung</p>
    <div class="chips kompass" role="group" aria-label="Stossrichtung">
      <button aria-pressed={t.stoss === null} onclick={() => aendere({ id: t.id, stoss: null, fassaden: [] })}>Keine</button>
      {#each KOMPASS as k (k.label)}
        <button aria-pressed={t.stoss === k.grad} aria-label="Stoss nach {k.label}" onclick={() => aendere({ id: t.id, stoss: k.grad, fassaden: [] })}>{k.label}</button>
      {/each}
    </div>
    {#if t.stoss !== null}
      <div class="legende">
        {#each FASSADEN as f (f)}
          <span><i style:background={FASSADE_FARBE[f]}></i>{FASSADE_LABEL[f]}</span>
        {/each}
      </div>
      <p class="leise">Weiss = Zutritt (Angreiferseite), Schwarz = Rückseite, Rot links und Grün rechts in Stossrichtung. Ansprache z.B. «{t.name}, Fassade Rot».</p>
      <div class="aktionen">
        <button onclick={umfaerben}>Fassaden umfärben</button>
        {#if t.fassaden.length}<button onclick={() => aendere({ id: t.id, fassaden: [] })}>Farben aus Stossrichtung</button>{/if}
      </div>
    {/if}
  {/if}

  <dl>
    <dt>Von</dt>
    <dd>{ersteller}</dd>
    <dt>Getauft</dt>
    <dd>{formatAlter(serverJetzt() - t.erstelltAm)}{#if t.geaendertAm !== t.erstelltAm}<span class="leise"> · geändert {formatAlter(serverJetzt() - t.geaendertAm)}</span>{/if}</dd>
    <dt>Vorlage</dt>
    <dd class="leise">{t.objektart}</dd>
  </dl>

  {#if loeschenFragen}
    <div class="aktionen">
      <button onclick={() => (loeschenFragen = false)}>Abbrechen</button>
      <button class="gefahr" onclick={loeschen}>Endgültig löschen</button>
    </div>
  {:else}
    <div class="aktionen">
      <button onclick={zentriere}>Zentrieren</button>
      {#if linie}<button onclick={verlaengern}>Verlängern</button>{/if}
      {#if t.quelle === 'gezeichnet' && t.geometrie.type === 'Polygon'}<button onclick={punkte}>Punkte bearbeiten</button>{/if}
      <button class="gefahr" onclick={() => (loeschenFragen = true)}>Löschen</button>
    </div>
  {/if}
{/if}

<style>
  .kopf {
    display: grid;
    gap: 2px;
    margin-bottom: 10px;
  }
  .name {
    justify-self: start;
    font-size: 1.3rem;
    font-weight: 800;
    overflow-wrap: anywhere;
  }
  .name.ziel {
    background: #ffeb3b;
    color: #111;
    padding: 0 8px;
    border-radius: 3px;
  }
  .umbenennen {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
  .frei {
    display: flex;
    gap: 8px;
  }
  .frei input {
    flex: 1;
    min-width: 0;
  }
  .kompass button {
    min-width: 52px;
  }
  .legende {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin: 8px 0 4px;
  }
  .legende span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legende i {
    width: 22px;
    height: 6px;
    border-radius: 3px;
    outline: 1px solid var(--line);
  }
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
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
    margin-top: 8px;
  }
  .aktionen button {
    flex: 1 1 30%;
  }
</style>
