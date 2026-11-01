<script lang="ts">
  // Desktop: Stil und Eigenschaften der Auswahl (auch Mehrfachauswahl) bzw. Stil für neue Zeichnungen.
  import { onMount } from 'svelte';
  import type { Stil, Stufe, Zeichnung } from '../../../../shared/protocol.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { aendere, kopiere, loesche } from './aktionen.ts';
  import { GRENZE_TRENNER, grenzNamen, STUFE } from './darstellung.ts';
  import { artLabel, FARBEN, mitStil, zuInhalt } from './logik.ts';
  import { darf, zn } from './zustand.svelte.ts';

  let { fokus }: { fokus?: string } = $props();

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
    if (!aenderbar.length) zn.stil = mitStil(zn.stil, teil);
    else void aendere(aenderbar.map((z) => ({ ...zuInhalt(z), stil: mitStil(z.stil, teil) })));
  }
  function setzeFeld(feld: 'bezeichnung' | 'text' | 'ebeneId', wert: string) {
    if (!eine && feld !== 'ebeneId') return;
    const ziel = feld === 'ebeneId' ? aenderbar : [eine!];
    const v = feld === 'ebeneId' ? wert : wert.trim().slice(0, 200);
    if (feld === 'text' && !v) return toast('Text darf nicht leer sein.');
    const neu = ziel.filter((z) => z[feld] !== v).map((z) => ({ ...zuInhalt(z), [feld]: v }));
    if (neu.length) void aendere(neu);
  }

  /** Grenze: Namen links/rechts in `bezeichnung`, Stufe (Spec v8). */
  function setzeGrenze(seite: 0 | 1, name: string) {
    const namen = grenzNamen(eine!.bezeichnung);
    namen[seite] = name.replaceAll(GRENZE_TRENNER.trim(), '/').trim();
    setzeFeld('bezeichnung', namen[1] ? namen.join(GRENZE_TRENNER) : namen[0]);
  }
  function setzeStufe(stufe: string) {
    const { stufe: _, ...ohne } = zuInhalt(eine!);
    void aendere([stufe ? { ...ohne, stufe: stufe as Stufe } : ohne]);
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
      {#each stil.fuellung ? [...STRICHE, { id: 'keiner' as const, label: 'Ohne' }] : STRICHE as s (s.id)}
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
    {#if eine.art === 'grenze'}
      {@const [links, rechts] = grenzNamen(eine.bezeichnung)}
      <label class="feld">Name links<input value={links} maxlength="98" onchange={(e) => setzeGrenze(0, (e.target as HTMLInputElement).value)} /></label>
      <label class="feld">Name rechts<input value={rechts} maxlength="98" onchange={(e) => setzeGrenze(1, (e.target as HTMLInputElement).value)} /></label>
      <label class="feld">
        Stufe
        <select value={eine.stufe ?? ''} onchange={(e) => setzeStufe((e.target as HTMLSelectElement).value)}>
          <option value="">– keine –</option>
          {#each Object.entries(STUFE) as [k, s] (k)}<option value={k}>{s.zeichen} {s.name}</option>{/each}
        </select>
      </label>
    {:else}
      <label class="feld">Bezeichnung<input value={eine.bezeichnung} maxlength="200" placeholder="z. B. «Adler»" onchange={(e) => setzeFeld('bezeichnung', (e.target as HTMLInputElement).value)} /></label>
    {/if}
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
