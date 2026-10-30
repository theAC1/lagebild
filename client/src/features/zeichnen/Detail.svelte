<script lang="ts">
  // Details einer Zeichnung: Art, Bezeichnung, Ebene, von, Masse; Bearbeiten/Löschen für Ersteller und Leitung.
  // Mobil zusätzlich Stil per Chips (Linie, Pfeil, Kreis): Farbe aus der festen Palette, Dicke, Darstellung, Füllung.
  import { LngLatBounds } from 'maplibre-gl';
  import type { Stil } from '../../../../shared/protocol.ts';
  import { formatKoord } from '../../lib/coords.ts';
  import { getMap } from '../../lib/map.ts';
  import { formatAlter, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { schliesse, toast } from '../../lib/ui.svelte.ts';
  import { aendere, loesche } from './aktionen.ts';
  import { umriss } from './darstellung.ts';
  import { bearbeite } from './interaktion.ts';
  import { artLabel, FARBEN, masse, mitStil, zuInhalt } from './logik.ts';
  import { darf, istDesktop, zn } from './zustand.svelte.ts';

  let { id }: { id: string } = $props();

  const STIL_MOBIL = new Set(['linie', 'pfeil', 'kreis']);
  const DICKEN = [
    { breite: 2, label: 'Dünn' },
    { breite: 3, label: 'Mittel' },
    { breite: 6, label: 'Dick' },
  ];
  const STRICHE: { id: Stil['strich']; label: string }[] = [
    { id: 'voll', label: 'Durchgezogen' },
    { id: 'gestrichelt', label: 'Gestrichelt' },
  ];

  // mit lokaler Vorschau: ein Tipp auf einen Chip wirkt sofort, nicht erst mit dem Echo des Servers
  const z = $derived.by(() => {
    const s = store.zeichnungen.get(id);
    const v = s && zn.vorschau.get(id);
    return s && v ? { ...s, ...v } : s;
  });
  const stilMobil = $derived(!!z && !istDesktop() && STIL_MOBIL.has(z.art) && darf(z));
  function setzeStil(teil: Partial<Stil>) {
    if (z) void aendere([{ ...zuInhalt(z), stil: mitStil(z.stil, teil) }]);
  }
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

  {#if stilMobil}
    <div class="stil">
      <p class="gruppe-titel">Farbe</p>
      <div class="chips" role="group" aria-label="Farbe">
        {#each FARBEN as f (f.farbe)}
          <button class="farbe-chip" style:background={f.farbe} aria-label={f.name} aria-pressed={z.stil.farbe === f.farbe} onclick={() => setzeStil({ farbe: f.farbe })}></button>
        {/each}
      </div>
      <p class="gruppe-titel">Dicke</p>
      <div class="chips" role="group" aria-label="Dicke">
        {#each DICKEN as d (d.breite)}
          <button aria-pressed={z.stil.breite === d.breite} onclick={() => setzeStil({ breite: d.breite })}>{d.label}</button>
        {/each}
      </div>
      <p class="gruppe-titel">Darstellung</p>
      <div class="chips" role="group" aria-label="Darstellung">
        {#each STRICHE as s (s.id)}
          <button aria-pressed={z.stil.strich === s.id} onclick={() => setzeStil({ strich: s.id })}>{s.label}</button>
        {/each}
        {#if z.art === 'kreis'}
          <button aria-pressed={!!z.stil.fuellung} onclick={() => setzeStil({ fuellung: z.stil.fuellung ? undefined : z.stil.farbe })}>Gefüllt</button>
        {/if}
      </div>
    </div>
  {/if}

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
  .stil {
    display: grid;
    gap: 4px;
    margin-bottom: 14px;
  }
  .stil .chips {
    margin-bottom: 8px;
  }
  .farbe-chip {
    width: var(--touch);
    padding: 0;
    border: 2px solid var(--line);
  }
  .farbe-chip[aria-pressed='true'] {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
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
