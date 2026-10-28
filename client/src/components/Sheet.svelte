<script lang="ts">
  import type { Snippet } from 'svelte';

  let { titel, onclose, children }: { titel: string; onclose: () => void; children: Snippet } = $props();
</script>

<section class="sheet" aria-label={titel}>
  <header>
    <h2>{titel}</h2>
    <button class="icon schliessen" onclick={onclose} aria-label="Schliessen">✕</button>
  </header>
  <div class="inhalt">{@render children()}</div>
</section>

<style>
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    max-height: 70dvh;
    display: flex;
    flex-direction: column;
    background: var(--surface-glas);
    border-top: 1px solid var(--line);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -8px 24px rgb(0 0 0 / 0.4);
    padding-bottom: var(--safe-bottom);
    animation: hoch 0.18s ease-out;
  }
  @media (min-width: 640px) {
    .sheet {
      left: 50%;
      width: 520px;
      transform: translateX(-50%);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 0 16px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 1.05rem;
    font-weight: 650;
  }
  .schliessen {
    border: 0;
    background: transparent;
    font-size: 1.2rem;
  }
  .inhalt {
    overflow-y: auto;
    padding: 4px 16px 16px;
    overscroll-behavior: contain;
  }
  @keyframes hoch {
    from {
      translate: 0 40px;
      opacity: 0;
    }
  }
</style>
