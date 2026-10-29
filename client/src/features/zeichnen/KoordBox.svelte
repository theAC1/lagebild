<script lang="ts">
  // Desktop: Punkt per Koordinate (beim Zeichnen) bzw. Koordinate des angeklickten Stützpunkts (beim Bearbeiten).
  import { formatKoord, KOORD_FORMATE, parseKoord } from '../../lib/coords.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { punktPerKoordinate, setzeGriffKoord, zeichnetGerade } from './interaktion.ts';
  import { zn } from './zustand.svelte.ts';

  const BEISPIEL = { lat: 46.9466, lon: 7.4442 };
  let wert = $state('');
  const sichtbar = $derived((zeichnetGerade() && zn.werkzeug !== 'freihand') || !!zn.griff);
  const treffer = $derived(wert.trim() ? parseKoord(wert) : null);
  const format = $derived(KOORD_FORMATE.find((f) => f.id === treffer?.format)?.label);

  // Griff angeklickt → seine Koordinate im eingestellten Format vorbelegen
  $effect(() => {
    const g = zn.griff;
    wert = g ? formatKoord(g.p, store.einstellungen.koordFormat) : '';
  });
  $effect(() => {
    zn.koordVorschau = sichtbar ? (treffer?.punkt ?? null) : null;
  });

  function taste(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      wert = '';
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!treffer) return;
      if (zn.griff) setzeGriffKoord(treffer.punkt);
      else {
        punktPerKoordinate(treffer.punkt);
        wert = '';
      }
    }
  }
</script>

{#if sichtbar}
  <div class="koordbox" role="group" aria-label={zn.griff ? 'Koordinate des Stützpunkts' : 'Punkt per Koordinate'}>
    <label class="feld">
      {zn.griff ? 'Stützpunkt' : 'Punkt per Koordinate'}
      <input
        class="mono"
        bind:value={wert}
        onkeydown={taste}
        placeholder={formatKoord(BEISPIEL, store.einstellungen.koordFormat)}
        spellcheck="false"
        autocomplete="off"
      />
    </label>
    <div class="erkannt" aria-live="polite">
      {#if !wert.trim()}<span class="leise">LV95, LV03, WGS84, G/M/S, MGRS, UTM · Enter</span>
      {:else if treffer}<span class="ok">{format} erkannt</span> <span class="leise">· Enter {zn.griff ? 'verschiebt' : 'setzt Punkt'}</span>
      {:else}<span class="fehler">Format nicht erkannt</span>{/if}
    </div>
  </div>
{/if}

<style>
  .koordbox {
    position: fixed;
    left: calc(var(--links, 0px) + 10px);
    bottom: calc(var(--unten) + 40px);
    z-index: 9;
    width: 300px;
    padding: 8px 10px;
    background: var(--surface-glas);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 3px 12px rgb(0 0 0 / 0.4);
  }
  .feld {
    font-size: 0.78rem;
  }
  input {
    min-height: 34px;
    padding: 4px 8px;
    font-size: 0.9rem;
  }
  .erkannt {
    margin-top: 4px;
    font-size: 0.75rem;
  }
  .leise {
    font-size: 0.75rem;
  }
  .ok {
    color: var(--ok);
    font-weight: 600;
  }
  .fehler {
    color: var(--warn);
  }
</style>
