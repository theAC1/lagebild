<script lang="ts">
  // Wechsel nach AN: die Wiedergabe öffnet von selbst nur auf dem Gerät der Leitung, die gewechselt hat. Alle anderen
  // tippen «Wiedergabe» (Randknopf bzw. Werkzeugleiste): sonst laden alle Geräte gleichzeitig das ganze Protokoll.
  import { untrack } from 'svelte';
  import { store } from '../../lib/store.svelte.ts';
  import { oeffne } from '../../lib/ui.svelte.ts';
  import { wg } from './zustand.svelte.ts';

  $effect(() => {
    if (store.phase !== 'an' || !store.lage || wg.selbstOeffnenFuer !== store.lage.id) return;
    wg.selbstOeffnenFuer = '';
    untrack(() => oeffne('wiedergabe'));
  });
</script>
