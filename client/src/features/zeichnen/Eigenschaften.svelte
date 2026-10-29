<script lang="ts">
  // Desktop: Stil und Eigenschaften der Auswahl (auch Mehrfachauswahl) bzw. Stil für neue Zeichnungen.
  import { onMount } from 'svelte';
  import type { Stil, Zeichnung } from '../../../../shared/protocol.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { aendere, kopiere, loesche } from './aktionen.ts';
  import { artLabel, zuInhalt } from './logik.ts';
  import { darf, zn } from './zustand.svelte.ts';

  let { fokus }: { fokus?: string } = $props();

  const FARBEN = [
    { farbe: '#d32f2f', name: 'Rot' },
    { farbe: '#1565c0', name: 'Blau' },
    { farbe: '#2e7d32', name: 'Grün' },
    { farbe: '#f9a825', name: 'Gelb' },
    { farbe: '#ef6c00', name: 'Orange' },
    { farbe: '#6a1b9a', name: 'Violett' },
    { farbe: '#212121', name: 'Schwarz' },
    { farbe: '#ffffff', name: 'Weiss' },
  ];
  const STRICHE: { id: Stil['strich']; label: string }[] = [
    { id: 'voll', label: 'Voll' },
    { id: 'gestrichelt', label: 'Gestrichelt' },
    { id: 'gepunktet', label: 'Gepunktet' },
  ];

  const mitVorschau = (z: Zeichnung): Zeichnung => {
    const v = zn.vorschau.get(z.id);
    return v ? { ...z, ...v } : z;
  };
  const gewaehlt = $derived([...zn.auswahl].map((id) => store.zeichnungen.get(id)).filter((z): z is Zeichnung => !!z).map(mitVorschau));
  const aenderbar = $derived(gewaehlt.filter(darf));
  const eine = $derived(aenderbar.length === 1 ? aenderbar[0] : null);
  const stil = $derived(aenderbar[0]?.stil ?? zn.stil);
  const ebenen = $derived([...store.ebenen.values()].filter((e) => !e.gesperrt || store.istLeitung).sort((a, b) => a.reihenfolge - b.reihenfolge));

  /** Stil der Auswahl ändern (ein Schritt im Verlauf) bzw. Stil für neue Zeichnungen. */
  function setzeStil(teil: Partial<Stil>) {
    const neu = (s: Stil): Stil => {
      const x = { ...s, ...teil };
      if (teil.farbe && s.fuellung === s.farbe) x.fuellung = teil.farbe; // Füllung folgt der Farbe
      if ('fuellung' in teil && !teil.fuellung) delete x.fuellung;
      return x;
    };
    if (!aenderbar.length) zn.stil = neu(zn.stil);
    else void aendere(aenderbar.map((z) => ({ ...zuInhalt(z), stil: neu(z.stil) })));
  }
  function setzeFeld(feld: 'bezeichnung' | 'text' | 'ebeneId', wert: string) {
    if (!eine && feld !== 'ebeneId') return;
    const ziel = feld === 'ebeneId' ? aenderbar : [eine!];
    const v = feld === 'ebeneId' ? wert : wert.trim().slice(0, 200);
    if (feld === 'text' && !v) return toast('Text darf nicht leer sein.');
    const neu = ziel.filter((z) => z[feld] !== v).map((z) => ({ ...zuInhalt(z), [feld]: v }));
    if (neu.length) void aendere(neu);
  }

  let ebeneFeld = $state<HTMLSelectElement>();
  onMount(() => {
    if (fokus === 'ebene') ebeneFeld?.focus();
  });
  const zahl = (e: Event) => Number((e.target as HTMLInputElement).value);
</script>

<p class="kopf">
  {#if !gewaehlt.length}
    <strong>Stil für neue Zeichnungen</strong>
  {:else if gewaehlt.length === 1}
    <strong>{artLabel(gewaehlt[0])}</strong>{#if !aenderbar.length}<span class="leise"> · nur lesen</span>{/if}
  {:else}
    <strong>{gewaehlt.length} ausgewählt</strong>{#if aenderbar.length < gewaehlt.length}<span class="leise"> · {aenderbar.length} bearbeitbar</span>{/if}
  {/if}
</p>

{#if gewaehlt.length && !aenderbar.length}
  <p class="leise">Nur Ersteller und Leitung können diese Zeichnung ändern.</p>
{:else}
  <div class="feld-gruppe" role="group" aria-label="Farbe">
    <span class="titel">Farbe</span>
    <div class="farben">
      {#each FARBEN as f (f.farbe)}
        <button class="farbe" style:background={f.farbe} aria-label={f.name} aria-pressed={stil.farbe === f.farbe} onclick={() => setzeStil({ farbe: f.farbe })}></button>
      {/each}
      <input class="frei" type="color" aria-label="Freie Farbe" value={stil.farbe} onchange={(e) => setzeStil({ farbe: (e.target as HTMLInputElement).value })} />
    </div>
  </div>

  <label class="feld">
    <span>Strichstärke <span class="mono">{stil.breite}</span></span>
    <input type="range" min="1" max="12" step="1" value={stil.breite} onchange={(e) => setzeStil({ breite: zahl(e) })} />
  </label>

  <div class="feld-gruppe">
    <span class="titel">Strichart</span>
    <div class="segmente" role="group" aria-label="Strichart">
      {#each STRICHE as s (s.id)}
        <button aria-pressed={stil.strich === s.id} onclick={() => setzeStil({ strich: s.id })}>{s.label}</button>
      {/each}
    </div>
  </div>

  <label class="haken">
    <input type="checkbox" checked={!!stil.fuellung} onchange={(e) => setzeStil({ fuellung: (e.target as HTMLInputElement).checked ? stil.farbe : undefined })} />
    Füllung
  </label>
  {#if stil.fuellung}
    <label class="feld">
      <span>Deckkraft der Füllung <span class="mono">{Math.round(stil.deckkraft * 100)} %</span></span>
      <input type="range" min="0" max="100" step="5" value={Math.round(stil.deckkraft * 100)} onchange={(e) => setzeStil({ deckkraft: zahl(e) / 100 })} />
    </label>
  {/if}

  {#if eine}
    {#if eine.art === 'text'}
      <label class="feld">Text<input value={eine.text} maxlength="200" onchange={(e) => setzeFeld('text', (e.target as HTMLInputElement).value)} /></label>
    {/if}
    <label class="feld">Bezeichnung<input value={eine.bezeichnung} maxlength="200" placeholder="z. B. «Adler»" onchange={(e) => setzeFeld('bezeichnung', (e.target as HTMLInputElement).value)} /></label>
  {/if}
  {#if aenderbar.length}
    <label class="feld">
      Ebene
      <select bind:this={ebeneFeld} value={aenderbar.every((z) => z.ebeneId === aenderbar[0].ebeneId) ? aenderbar[0].ebeneId : ''} onchange={(e) => setzeFeld('ebeneId', (e.target as HTMLSelectElement).value)}>
        {#if !aenderbar.every((z) => z.ebeneId === aenderbar[0].ebeneId)}<option value="" disabled>– verschiedene –</option>{/if}
        {#each ebenen as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
      </select>
    </label>
  {/if}
{/if}

{#if gewaehlt.length}
  <div class="aktionen">
    <button onclick={() => kopiere(gewaehlt.map((z) => z.id))}>Kopieren</button>
    {#if aenderbar.length}<button class="gefahr" onclick={() => loesche(aenderbar.map((z) => z.id))}>Löschen{aenderbar.length > 1 ? ` (${aenderbar.length})` : ''}</button>{/if}
  </div>
{:else}
  <p class="leise">Tipp: Auswahl (S) klicken, Shift-Klick wählt mehrere, Lasso umkreist Formen. Der Stil gilt dann für die Auswahl.</p>
{/if}

<style>
  .kopf {
    margin: 4px 0 10px;
  }
  .feld,
  .feld-gruppe {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
    font-size: 0.9rem;
    color: var(--text-2);
  }
  .titel {
    font-size: 0.9rem;
  }
  .farben {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .farbe {
    width: 30px;
    min-height: 30px;
    height: 30px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--line);
  }
  .farbe[aria-pressed='true'] {
    outline: 3px solid var(--accent);
    outline-offset: 1px;
  }
  .frei {
    width: 40px;
    min-height: 30px;
    height: 30px;
    padding: 0 2px;
  }
  input[type='range'] {
    min-height: 30px;
    padding: 0;
    accent-color: var(--accent);
  }
  .haken {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .haken input {
    width: 20px;
    min-height: 20px;
    accent-color: var(--accent);
  }
  .aktionen {
    display: flex;
    gap: 8px;
  }
  .aktionen button {
    flex: 1;
  }
</style>
