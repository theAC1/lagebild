<script lang="ts">
  // Einstellung «Ausrichtung»: fix sperren, wo der Browser es erlaubt (Android installiert/Vollbild);
  // sonst bei falscher Lage ein Hinweis statt Absturz oder Endlos-Meldung.
  import { MediaQuery } from 'svelte/reactivity';
  import { store } from '../lib/store.svelte.ts';

  const hoch = new MediaQuery('(orientation: portrait)', false);
  let gesperrt = $state(false);
  let weg = $state(false);

  $effect(() => {
    const a = store.einstellungen.ausrichtung;
    gesperrt = false;
    weg = false;
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    try {
      if (a === 'auto') so?.unlock?.();
      else
        so
          ?.lock?.(a === 'hoch' ? 'portrait' : 'landscape')
          .then(() => (gesperrt = true))
          .catch(() => (gesperrt = false));
    } catch {
      gesperrt = false; // ältere Browser werfen synchron
    }
  });

  const falsch = $derived(store.einstellungen.ausrichtung !== 'auto' && !gesperrt && hoch.current !== (store.einstellungen.ausrichtung === 'hoch'));
</script>

{#if falsch && !weg}
  <div class="drehen" role="status">
    <span>Gerät drehen: eingestellt ist {store.einstellungen.ausrichtung === 'hoch' ? 'Hochformat' : 'Querformat'}.</span>
    <button onclick={() => (weg = true)}>OK</button>
  </div>
{/if}

<style>
  .drehen {
    position: fixed;
    left: 50%;
    bottom: calc(var(--unten) + 12px);
    translate: -50% 0;
    z-index: 28;
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: calc(100vw - 24px);
    padding: 6px 6px 6px 14px;
    background: var(--surface-2);
    border: 1px solid var(--warn);
    border-radius: var(--radius);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.45);
    font-weight: 600;
  }
</style>
