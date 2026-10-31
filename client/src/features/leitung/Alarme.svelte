<script lang="ts">
  import { darfAendern, send, store } from '../../lib/store.svelte.ts';
  import { zentriere } from '../../lib/map.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { uhrzeit } from './logik.ts';

  const ART = { notfall: 'Notfall', kontakt: 'Feindkontakt' } as const;
  const name = (id: string) => store.teilnehmer.get(id)?.rufname ?? 'Unbekannt';
  const liste = $derived([...store.alarme.values()].sort((a, b) => Number(a.aufgehobenAm !== null) - Number(b.aufgehobenAm !== null) || b.t - a.t));

  function aufheben(id: string) {
    if (!send({ typ: 'alarm.aufheben', id })) toast('Keine Verbindung – nicht aufgehoben.');
  }
</script>

{#if liste.length === 0}<p class="leise">Keine Alarme in dieser Sitzung.</p>{/if}
<ul>
  {#each liste as a (a.id)}
    {@const aktiv = a.aufgehobenAm === null}
    <li class:aktiv>
      <div class="kopf">
        <strong>{ART[a.art]}</strong>
        <span class="mono leise">{uhrzeit(a.t)}</span>
      </div>
      <div>von {name(a.von)}</div>
      <div class="leise">
        {#if a.quittiertVon.length}Quittiert: {a.quittiertVon.map(name).join(', ')}{:else}Noch nicht quittiert{/if}
      </div>
      {#if !aktiv}<div class="leise">Aufgehoben {uhrzeit(a.aufgehobenAm!)}</div>{/if}
      <div class="knoepfe">
        {#if a.lat !== null && a.lon !== null}
          {@const p = { lat: a.lat, lon: a.lon }}
          <button onclick={() => zentriere(p, 16)}>Auf Karte</button>
        {/if}
        {#if aktiv && darfAendern(a.von)}<button class="gefahr" onclick={() => aufheben(a.id)}>Aufheben</button>{/if}
      </div>
    </li>
  {/each}
</ul>
<p class="leise">Zeigt aktive Alarme und die seit dem Öffnen der App aufgehobenen.</p>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: grid;
    gap: 2px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  li.aktiv {
    border-color: var(--danger);
  }
  li.aktiv strong {
    color: var(--danger);
  }
  .kopf {
    display: flex;
    justify-content: space-between;
  }
  .knoepfe {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .knoepfe button {
    flex: 1;
  }
</style>
