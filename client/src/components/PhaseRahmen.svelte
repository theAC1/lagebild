<script lang="ts">
  // Rahmen um die Karte nach Phase (Spec v6): AP dunkelgrau, LV schwarz, AN grün. Der gelbe Taufmodus-Rahmen liegt darüber.
  import { store } from '../lib/store.svelte.ts';
</script>

<div class="phase-rahmen {store.phase}" aria-hidden="true"></div>

<style>
  .phase-rahmen {
    position: fixed;
    inset: 0;
    left: var(--karte-l, 0px);
    right: var(--karte-r, 0px);
    border: 4px solid #000;
    pointer-events: none;
    z-index: 3;
  }
  .ap {
    border-color: #555a5e;
  }
  .an {
    border-color: #2e9e44;
  }
</style>
