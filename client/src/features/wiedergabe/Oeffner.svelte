<script lang="ts">
  // Wechsel nach AN (oder Start in AN): Wiedergabe einmal je Lage von selbst öffnen – ein Tipp weniger.
  import { untrack } from 'svelte';
  import { store } from '../../lib/store.svelte.ts';
  import { oeffne } from '../../lib/ui.svelte.ts';

  let geoeffnetFuer = '';
  $effect(() => {
    if (store.phase !== 'an' || !store.lage) {
      geoeffnetFuer = '';
      return;
    }
    if (geoeffnetFuer === store.lage.id) return;
    geoeffnetFuer = store.lage.id;
    untrack(() => oeffne('wiedergabe'));
  });
</script>
