<script lang="ts">
  import { beiNachricht, statusDef, store } from '../../lib/store.svelte.ts';
  import { oeffne, schliesse, toast, ui } from '../../lib/ui.svelte.ts';
  import { meldungText, textFarbeAuf } from './logik.ts';

  const ich = $derived(store.ichSelbst);
  const def = $derived(ich ? statusDef(ich.status) : null);
  const farbe = $derived(def?.farbe ?? '#3b464d');

  // Neue Meldungen anderer als Toast (der Snapshot kommt nicht als 'meldung' → kein Schwall beim Verbinden)
  $effect(() =>
    beiNachricht((m) => {
      // status null = Alarm-Eintrag des Servers; den zeigt schon das Alarm-Banner
      if (m.typ !== 'meldung' || m.meldung.von === store.ich || m.meldung.status === null) return;
      const { von, status, text } = m.meldung;
      toast(meldungText(store.teilnehmer.get(von)?.rufname ?? 'Unbekannt', status ? (statusDef(status)?.label ?? status) : null, text));
    }),
  );
</script>

{#if ich}
  <button
    class="schnell"
    style:background={farbe}
    style:color={textFarbeAuf(farbe)}
    aria-label="Eigener Status: {def?.label ?? ich.status}. Status ändern"
    aria-pressed={ui.panel?.id === 'status'}
    onclick={() => (ui.panel?.id === 'status' ? schliesse() : oeffne('status'))}
  >
    {def?.label ?? ich.status}
  </button>
{/if}

<style>
  .schnell {
    max-width: 128px;
    padding: 0 14px;
    border: 2px solid rgb(22 27 31 / 0.6);
    border-radius: 999px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
    font-weight: 700;
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .schnell[aria-pressed='true'] {
    border-color: var(--text);
  }
</style>
