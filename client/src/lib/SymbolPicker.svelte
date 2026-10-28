<script lang="ts">
  import { baueSidc, FUNKTIONEN, GROESSEN, istGueltig, symbolSvg, zerlegeSidc, ZUGEHOERIGKEITEN } from './symbol.ts';

  let { value, onchange }: { value: string; onchange: (sidc: string) => void } = $props();

  const teile = $derived(zerlegeSidc(value));
  let frei = $state('');
  let freiOffen = $state(false);
  const freiGueltig = $derived(istGueltig(frei.trim()));

  function setze(t: Partial<ReturnType<typeof zerlegeSidc>>) {
    onchange(baueSidc({ ...teile, ...t }));
  }
</script>

<div class="picker">
  <div class="vorschau">{@html symbolSvg(value, { size: 44 })}</div>

  <div class="segmente" role="group" aria-label="Zugehörigkeit">
    {#each ZUGEHOERIGKEITEN as z (z.id)}
      <button type="button" aria-pressed={teile.zugehoerigkeit === z.id} onclick={() => setze({ zugehoerigkeit: z.id })}>{z.label}</button>
    {/each}
  </div>

  {#if teile.set === '10'}
    <div class="segmente" role="group" aria-label="Grösse">
      {#each GROESSEN as g (g.id)}
        <button type="button" aria-pressed={teile.groesse === g.id} onclick={() => setze({ groesse: g.id })}>{g.label}</button>
      {/each}
    </div>
  {/if}

  <div class="raster" role="group" aria-label="Funktion">
    {#each FUNKTIONEN as f (f.set + f.funktion)}
      {@const aktiv = teile.set === f.set && teile.funktion === f.funktion}
      <button type="button" class:aktiv aria-pressed={aktiv} onclick={() => setze({ set: f.set, funktion: f.funktion })}>
        <span class="mini">{@html symbolSvg(baueSidc({ ...teile, set: f.set, funktion: f.funktion, groesse: '00' }), { size: 20 })}</span>
        <span class="name">{f.label}</span>
      </button>
    {/each}
  </div>

  {#if freiOffen}
    <div class="frei">
      <input
        class="mono"
        inputmode="numeric"
        maxlength="20"
        placeholder="20-stellige SIDC"
        aria-label="SIDC frei eingeben"
        bind:value={frei}
        aria-invalid={frei.length > 0 && !freiGueltig}
      />
      <button type="button" class="primaer" disabled={!freiGueltig} onclick={() => onchange(frei.trim())}>Übernehmen</button>
    </div>
  {:else}
    <button
      type="button"
      class="link"
      onclick={() => {
        frei = value;
        freiOffen = true;
      }}>SIDC frei eingeben</button
    >
  {/if}
</div>

<style>
  .picker {
    display: grid;
    gap: 8px;
  }
  .vorschau {
    display: grid;
    place-items: center;
    min-height: 72px;
    background: var(--bg);
    border-radius: var(--radius);
  }
  .segmente button {
    font-size: 0.85rem;
  }
  .raster {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
  }
  .raster button {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 6px 4px;
    min-height: 64px;
    font-size: 0.75rem;
    background: var(--bg);
  }
  .raster button.aktiv {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .mini {
    height: 28px;
    display: grid;
    place-items: center;
  }
  .name {
    line-height: 1.15;
    text-align: center;
  }
  .frei {
    display: flex;
    gap: 6px;
  }
  .frei input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .link {
    background: transparent;
    border: 0;
    color: var(--accent);
    justify-self: start;
    padding: 0 4px;
  }
</style>
