<script lang="ts">
  // Wiedergabe in AN (Spec v6): Zeitleiste nur über LV-Zeiträume (AP-Nähte markiert), Play/Pause, Tempo, Sprung zum
  // vorigen/nächsten Ereignis. Solange das Panel offen ist, zeigt die Karte den Stand zum Zeitpunkt.
  import { onDestroy, onMount } from 'svelte';
  import type { PanelProps } from '../registry.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { schliesse } from '../../lib/ui.svelte.ts';
  import { uhrzeit } from '../leitung/logik.ts';
  import { dauer, versatzAus } from './logik.ts';
  import { fenster, pause, spiele, springe, springeVersatz, starte, stoppe, TEMPI, wg } from './zustand.svelte.ts';

  let _props: PanelProps = $props();

  onMount(() => void starte());
  onDestroy(stoppe);

  // Phase verlässt AN (Leitung wechselt zurück): Panel zu, Live-Stand zurück
  $effect(() => {
    if (store.phase !== 'an') schliesse('wiedergabe');
  });

  const f = $derived(store.lage ? fenster() : []);
  const gesamt = $derived(dauer(f));
  const versatz = $derived(versatzAus(f, wg.t));
  /** Nähte zwischen LV-Abschnitten in % der Zeitleiste, beschriftet mit der übersprungenen Phase (meist AP). */
  const naehte = $derived(
    f.slice(1).map((_, i) => ({
      x: (dauer(f.slice(0, i + 1)) / (gesamt || 1)) * 100,
      phase: (store.lage?.phasen.find((p) => p.t === f[i].bis)?.phase ?? 'ap').toUpperCase(),
    })),
  );
  const inLv = (t: number) => f.some((x) => t >= x.von && t <= x.bis);
  const zeiten = $derived(
    [...new Set([...(wg.protokoll?.ereignisse ?? []).map((e) => e.t), ...store.notizen.map((n) => n.t)])].filter(inLv).sort((a, b) => a - b),
  );

  function naechstes(richtung: 1 | -1) {
    pause();
    // zurück: ein Ereignis knapp vor dem Zeitpunkt überspringen, sonst bleibt man daran hängen
    const t = richtung > 0 ? zeiten.find((x) => x > wg.t) : zeiten.findLast((x) => x < wg.t - 1000);
    springe(t ?? (richtung > 0 ? (f.at(-1)?.bis ?? wg.t) : (f[0]?.von ?? wg.t)));
  }

  function taste(e: KeyboardEvent) {
    if ((e.target as Element).closest?.('input:not([type=range]), textarea')) return;
    if (e.key === ' ') wg.spielt ? pause() : spiele();
    else if (e.key === 'ArrowRight' && e.altKey) naechstes(1);
    else if (e.key === 'ArrowLeft' && e.altKey) naechstes(-1);
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={taste} />

{#if wg.fehler}
  <p class="fehler" role="alert">Wiedergabe nicht geladen: {wg.fehler} <button onclick={() => void starte()}>Erneut</button></p>
{:else if !wg.protokoll}
  <p class="leise">Wiedergabe wird geladen …</p>
{:else if !f.length}
  <p class="leise">Keine Lageverfolgung aufgezeichnet.</p>
{:else}
  <section class="leiste" aria-label="Zeitleiste">
    <div class="zeit">
      <strong class="mono" aria-live="off">{uhrzeit(wg.t)}</strong>
      <span class="leise mono">{Math.round(versatz / 60_000)} / {Math.round(gesamt / 60_000)} min LV</span>
    </div>
    <div class="schiene">
      <input
        type="range"
        aria-label="Zeitpunkt"
        min="0"
        max={gesamt}
        step="1000"
        value={versatz}
        oninput={(e) => {
          pause();
          springeVersatz(Number(e.currentTarget.value));
        }}
      />
      {#each naehte as n, i (i)}<span class="naht" style:left="{n.x}%" title="{n.phase} übersprungen">{n.phase}</span>{/each}
    </div>
    <div class="knoepfe">
      <button class="icon" aria-label="Voriges Ereignis" title="Voriges Ereignis (Alt+←)" onclick={() => naechstes(-1)}>⏮</button>
      {#if wg.spielt}
        <button class="primaer spiel" aria-label="Pause" onclick={pause}>⏸</button>
      {:else}
        <button class="primaer spiel" aria-label="Abspielen" title="Abspielen (Leertaste)" onclick={spiele}>▶</button>
      {/if}
      <button class="icon" aria-label="Nächstes Ereignis" title="Nächstes Ereignis (Alt+→)" onclick={() => naechstes(1)}>⏭</button>
      <div class="segmente tempo" role="group" aria-label="Tempo">
        {#each TEMPI as x (x)}<button aria-pressed={wg.tempo === x} onclick={() => (wg.tempo = x)}>{x}×</button>{/each}
      </div>
    </div>
  </section>
{/if}

<style>
  .leiste {
    display: grid;
    gap: 8px;
  }
  .zeit {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .zeit strong {
    font-size: 1.4rem;
  }
  .schiene {
    position: relative;
    padding-bottom: 14px;
  }
  .schiene input {
    width: 100%;
    min-height: var(--touch);
    accent-color: #2e9e44;
  }
  .naht {
    position: absolute;
    bottom: 0;
    translate: -50% 0;
    padding: 0 3px;
    border-radius: 3px;
    background: #555a5e;
    color: #fff;
    font: 700 0.65rem/1.3 var(--mono);
    pointer-events: none;
  }
  .knoepfe {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .spiel {
    min-width: 64px;
    font-size: 1.2rem;
  }
  .tempo {
    flex: 1;
  }
  .fehler {
    color: var(--danger);
  }
</style>
