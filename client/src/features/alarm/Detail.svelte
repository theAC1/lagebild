<script lang="ts">
  import { azimut, distanz, formatDistanz, formatKoord, formatRichtung } from '../../lib/coords.ts';
  import { zentriere } from '../../lib/map.ts';
  import { darfAendern, formatAlter, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { schliesse } from '../../lib/ui.svelte.ts';
  import { hebeAuf, ortVon, quittiere, rufname } from './aktionen.ts';
  import { ARTEN } from './logik.ts';

  let { id }: { id: string } = $props();

  const a = $derived(store.alarme.get(id));
  const ort = $derived(a ? ortVon(a) : null);
  const quittiert = $derived(a ? a.quittiertVon.map(rufname) : []);
  const ichQuittiert = $derived(!!a && !!store.ich && a.quittiertVon.includes(store.ich));
  let sicher = $state(false);
</script>

{#if !a}
  <p class="leise">Alarm nicht mehr vorhanden.</p>
{:else}
  <div class="kopf {a.art}">
    <strong>{ARTEN[a.art].label}</strong>
    <span>{rufname(a.von)} · {formatAlter(Math.max(0, serverJetzt() - a.t))}</span>
  </div>
  {#if a.aufgehobenAm !== null}<p class="aufgehoben">Aufgehoben.</p>{/if}

  <dl>
    <dt>Ort</dt>
    <dd class="mono">{ort ? formatKoord(ort, store.einstellungen.koordFormat) : 'unbekannt'}</dd>
    {#if ort && store.meinePos && a.von !== store.ich}
      <dt>Von mir</dt>
      <dd class="mono">{formatDistanz(distanz(store.meinePos, ort))} · {formatRichtung(azimut(store.meinePos, ort))}</dd>
    {/if}
    <dt>Quittiert ({quittiert.length})</dt>
    <dd>{quittiert.length ? quittiert.join(', ') : 'noch niemand'}</dd>
  </dl>

  <div class="aktionen">
    <button disabled={!ort} onclick={() => ort && zentriere(ort, 16)}>Zentrieren</button>
    {#if a.aufgehobenAm === null && a.von !== store.ich && !ichQuittiert}
      <button class="primaer" onclick={() => quittiere(a.id)}>Quittieren</button>
    {/if}
    {#if a.aufgehobenAm === null && darfAendern(a.von)}
      {#if !sicher}
        <button class="gefahr" onclick={() => (sicher = true)}>Aufheben …</button>
      {:else}
        <button
          class="gefahr bestaetigen"
          onclick={() => {
            hebeAuf(a.id);
            schliesse();
          }}>Wirklich aufheben</button
        >
      {/if}
    {/if}
  </div>
{/if}

<style>
  .kopf {
    display: grid;
    padding: 10px 14px;
    border-radius: var(--radius);
    background: #a3271a;
    color: #fff;
  }
  .kopf.kontakt {
    background: #8f3d0c;
  }
  .kopf strong {
    font-size: 1.2rem;
  }
  .aufgehoben {
    color: var(--ok);
    margin: 8px 0 0;
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
  .bestaetigen {
    background: var(--danger);
    color: #fff;
  }
</style>
