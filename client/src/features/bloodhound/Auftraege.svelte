<script lang="ts">
  // Leitung: Bloodhound-Aufträge erteilen und überwachen (Tab «Aufträge» im Leitungs-Panel).
  import { untrack } from 'svelte';
  import type { BloodhoundZiel } from '../../../../shared/protocol.ts';
  import { formatDistanz, formatKoord } from '../../lib/coords.ts';
  import { waehlePunkt } from '../../lib/map.ts';
  import { OHNE_QUITTUNG, send, sendeBestaetigt, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { formatGrad } from '../rangebearing/logik.ts';
  import { formatRestzeit, STUFE_FARBE } from './logik.ts';
  import { messe, rufname, tempoVon, zielName } from './zustand.svelte.ts';

  let { params }: { params: Record<string, any> } = $props();

  let an = $state(untrack(() => (typeof params.an === 'string' ? params.an : '')));
  let zielWert = $state('');
  let punkt = $state<{ lat: number; lon: number } | null>(null);
  let sendet = $state(false);

  // erneutes Öffnen aus dem Radial-Menü (anderer Empfänger) übernimmt den Empfänger
  $effect(() => {
    if (typeof params.an === 'string') an = params.an;
  });

  const offene = $derived([...store.bloodhound.values()].sort((a, b) => b.erstelltAm - a.erstelltAm));
  const personen = $derived([...store.teilnehmer.values()].sort((a, b) => a.rufname.localeCompare(b.rufname)));

  function ziel(): BloodhoundZiel | null {
    if (zielWert === 'punkt') return punkt ? { art: 'punkt', punkt } : null;
    const i = zielWert.indexOf(':');
    if (i < 0) return null;
    const art = zielWert.slice(0, i);
    const id = zielWert.slice(i + 1);
    return art === 'teilnehmer' || art === 'marker' || art === 'sichtung' ? { art, id } : null;
  }
  const bereit = $derived(!!an && an !== (zielWert.startsWith('teilnehmer:') ? zielWert.slice(11) : '') && ziel() !== null);

  async function karte() {
    const p = await waehlePunkt('Ziel des Auftrags wählen');
    if (!p) return;
    punkt = { lat: p.lat, lon: p.lon };
    zielWert = 'punkt';
  }

  async function sende() {
    const z = ziel();
    if (!z || !an || sendet) return;
    sendet = true;
    const r = await sendeBestaetigt(
      { typ: 'bloodhound.auftrag', an, ziel: z },
      (m) => m.typ === 'bloodhound' && m.auftrag.an === an && m.auftrag.ende === null && m.auftrag.quittiertAm === null,
    );
    sendet = false;
    if (r === 'bestaetigt') toast(`Auftrag an ${rufname(an)} gesendet`);
    else if (r === 'unbestaetigt') toast(OHNE_QUITTUNG);
  }

  function aufheben(id: string) {
    if (!send({ typ: 'bloodhound.aufheben', id })) toast('Keine Verbindung – Auftrag nicht aufgehoben.');
  }
</script>

<div class="neu">
  <label class="feld">
    Empfänger
    <select bind:value={an}>
      <option value="">– wählen –</option>
      {#each personen.filter((t) => t.id !== store.ich) as t (t.id)}<option value={t.id}>{t.rufname} ({t.einheit})</option>{/each}
    </select>
  </label>
  <label class="feld">
    Ziel
    <select bind:value={zielWert}>
      <option value="">– wählen –</option>
      {#if punkt}<option value="punkt">Kartenpunkt ({formatKoord(punkt, store.einstellungen.koordFormat)})</option>{/if}
      <optgroup label="Teilnehmende">
        {#each personen.filter((t) => t.id !== an && t.pos) as t (t.id)}<option value={`teilnehmer:${t.id}`}>{t.rufname}</option>{/each}
      </optgroup>
      <optgroup label="Marker">
        {#each store.marker.values() as mk (mk.id)}<option value={`marker:${mk.id}`}>{zielName({ art: 'marker', id: mk.id })}</option>{/each}
      </optgroup>
      <optgroup label="Sichtungen">
        {#each store.sichtungen.values() as s (s.id)}<option value={`sichtung:${s.id}`}>{zielName({ art: 'sichtung', id: s.id })}</option>{/each}
      </optgroup>
    </select>
  </label>
  <div class="knoepfe">
    <button onclick={karte}>Punkt auf Karte</button>
    <button class="primaer" disabled={!bereit || sendet} onclick={sende}>Auftrag senden</button>
  </div>
  <p class="leise">Ein neuer Auftrag ersetzt den bisherigen der Person.</p>
</div>

<h3>Offene Aufträge ({offene.length})</h3>
{#if offene.length === 0}<p class="leise">Keine offenen Aufträge.</p>{/if}
<ul class="liste">
  {#each offene as a (a.id)}
    {@const pos = store.teilnehmer.get(a.an)?.pos ?? null}
    {@const ms = messe(pos, a.ziel, tempoVon(a.an))}
    <li data-auftrag={a.id}>
      <div class="kopf">
        <strong>{rufname(a.an)} → {zielName(a.ziel)}</strong>
        <span class="chip" class:ja={a.quittiertAm !== null}>{a.quittiertAm !== null ? 'quittiert' : 'nicht quittiert'}</span>
      </div>
      <div class="mono werte">
        {#if ms}
          <span>{formatDistanz(ms.dist)}</span>
          <span>{formatGrad(ms.grad)}</span>
          <span style:color={STUFE_FARBE[ms.stufe]}>Rest {formatRestzeit(ms.restS)}</span>
        {:else}
          <span class="leise">{pos ? 'Ziel ohne Position' : 'Position unbekannt'}</span>
        {/if}
      </div>
      <button class="gefahr" onclick={() => aufheben(a.id)}>Aufheben</button>
    </li>
  {/each}
</ul>

<style>
  .neu {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
  }
  .knoepfe {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  h3 {
    margin: 12px 0 6px;
    font-size: 0.95rem;
  }
  .liste {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: grid;
    gap: 4px;
    padding: 8px 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .kopf {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .chip {
    font-size: 0.75rem;
    color: var(--warn);
  }
  .chip.ja {
    color: var(--ok);
  }
  .werte {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.85rem;
  }
  li button {
    justify-self: start;
  }
</style>
