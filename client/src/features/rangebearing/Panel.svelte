<script lang="ts" module>
  const verbraucht = new WeakSet<object>();
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import type { PanelProps } from '../registry.ts';
  import { formatDistanz, formatKoord } from '../../lib/coords.ts';
  import { waehlePunkt, zentriere } from '../../lib/map.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { alsEndpunkt, ausSchluessel, formatGrad, formatPromille, messe, schluessel, type Endpunkt } from './logik.ts';
  import { aendere, entferne, hinzufuegen, punktVon, rb } from './messungen.svelte.ts';

  let { params }: PanelProps = $props();

  const WAHL = 'wahl';

  // Ziel aus oeffne('rangebearing', { ziel }) → Messung ich → Ziel. Pro oeffne() nur einmal,
  // auch wenn das Panel nach der Fadenkreuz-Wahl neu gemountet wird.
  $effect(() => {
    if (verbraucht.has(params)) return;
    verbraucht.add(params);
    const ziel = alsEndpunkt(params.ziel);
    if (ziel) untrack(() => hinzufuegen(ziel));
  });

  function name(e: Endpunkt): string {
    switch (e.art) {
      case 'ich':
        return 'Ich';
      case 'teilnehmer':
        return store.teilnehmer.get(e.id)?.rufname ?? 'Teilnehmer (weg)';
      case 'marker': {
        const mk = store.marker.get(e.id);
        return mk ? mk.bezeichnung || 'Marker' : 'Marker (gelöscht)';
      }
      case 'sichtung': {
        const s = store.sichtungen.get(e.id);
        return s ? `Sichtung ${s.taetigkeit || s.einheit}`.trim() : 'Sichtung (weg)';
      }
      case 'punkt':
        return formatKoord(e.punkt, store.einstellungen.koordFormat);
    }
  }

  /** Auswahl für A/B: Ich, Teilnehmende, Marker, Sichtungen (+ aktueller Endpunkt, falls nicht in der Liste). */
  const optionen = $derived([
    { gruppe: '', liste: [{ wert: 'ich', label: 'Ich' }] },
    {
      gruppe: 'Teilnehmende',
      liste: [...store.teilnehmer.values()].filter((t) => t.id !== store.ich && t.pos).map((t) => ({ wert: `teilnehmer:${t.id}`, label: t.rufname })),
    },
    { gruppe: 'Marker', liste: [...store.marker.values()].map((mk) => ({ wert: `marker:${mk.id}`, label: name({ art: 'marker', id: mk.id }) })) },
    { gruppe: 'Sichtungen', liste: [...store.sichtungen.values()].map((s) => ({ wert: `sichtung:${s.id}`, label: name({ art: 'sichtung', id: s.id }) })) },
  ]);
  const bekannt = $derived(new Set(optionen.flatMap((g) => g.liste.map((o) => o.wert))));

  async function waehle(id: string, seite: 'a' | 'b', wert: string) {
    if (wert !== WAHL) {
      const e = ausSchluessel(wert);
      if (e) aendere(id, seite, e);
      return;
    }
    const p = await waehlePunkt(`Punkt ${seite.toUpperCase()} wählen`);
    if (p) aendere(id, seite, { art: 'punkt', punkt: p });
  }

  async function neuAufKarte() {
    const p = await waehlePunkt('Ziel B wählen');
    if (p) hinzufuegen({ art: 'punkt', punkt: p });
  }
</script>

<div class="neu">
  <button class="primaer" onclick={neuAufKarte}>Neue Messung: Punkt auf Karte</button>
  {#if !store.meinePos}<p class="leise">Eigene Position unbekannt – «Ich» als A zeigt erst mit GPS einen Wert.</p>{/if}
</div>

{#if rb.liste.length === 0}
  <p class="leise">Noch keine Messung. Lange auf die Karte tippen → «Range &amp; Bearing hierher», oder bei einem Teilnehmer «Range &amp; Bearing».</p>
{/if}

<ul class="liste">
  {#each rb.liste as mes (mes.id)}
    {@const a = punktVon(mes.a)}
    {@const b = punktVon(mes.b)}
    {@const e = a && b ? messe(a, b) : null}
    <li>
      <div class="enden">
        {#each ['a', 'b'] as const as seite (seite)}
          {@const ep = mes[seite]}
          {@const wert = schluessel(ep)}
          <label class="feld">
            <span>{seite.toUpperCase()}</span>
            <select value={wert} onchange={(ev) => waehle(mes.id, seite, ev.currentTarget.value)}>
              {#if !bekannt.has(wert)}<option value={wert}>{name(ep)}</option>{/if}
              {#each optionen as g (g.gruppe)}
                {#if g.gruppe === ''}
                  {#each g.liste as o (o.wert)}<option value={o.wert}>{o.label}</option>{/each}
                {:else if g.liste.length}
                  <optgroup label={g.gruppe}>
                    {#each g.liste as o (o.wert)}<option value={o.wert}>{o.label}</option>{/each}
                  </optgroup>
                {/if}
              {/each}
              <option value={WAHL}>Punkt auf Karte wählen …</option>
            </select>
          </label>
        {/each}
      </div>
      {#if e}
        <div class="werte mono">
          <div><span class="leise">Distanz</span><strong>{formatDistanz(e.m)}</strong></div>
          <div><span class="leise">Azimut</span><strong>{formatGrad(e.grad)}</strong><span>{formatPromille(e.grad)}</span></div>
          <div><span class="leise">Rückazimut</span><strong>{formatGrad(e.rueck)}</strong><span>{formatPromille(e.rueck)}</span></div>
        </div>
      {:else}
        <p class="leise">{a ? 'B' : 'A'} hat keine Position.</p>
      {/if}
      <div class="aktionen">
        <button disabled={!b} onclick={() => b && zentriere(b)}>B zentrieren</button>
        <button class="gefahr" onclick={() => entferne(mes.id)}>Löschen</button>
      </div>
    </li>
  {/each}
</ul>

<style>
  .neu {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
  }
  .neu p {
    margin: 0;
  }
  .liste {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  li {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .enden {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .enden label {
    grid-template-columns: auto 1fr;
    align-items: center;
  }
  .enden span {
    font-weight: 700;
    color: var(--accent);
  }
  select {
    min-width: 0;
  }
  .werte {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    text-align: center;
  }
  .werte div {
    display: grid;
  }
  .werte strong {
    font-size: 1.25rem;
  }
  .werte .leise {
    font-size: 0.75rem;
  }
  .aktionen {
    display: flex;
    gap: 8px;
  }
  .aktionen button {
    flex: 1;
  }
  p {
    margin: 0 0 8px;
  }
</style>
