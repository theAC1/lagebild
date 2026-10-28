<script lang="ts">
  import { STANDARD_STATUS, type StatusDef } from '../../../../shared/protocol.ts';
  import { send, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { pruefeStatusSet, statusSetAus, verschiebe, type StatusEntwurf } from './logik.ts';

  const alsEntwurf = (set: StatusDef[]): StatusEntwurf[] => set.map((s) => ({ ...s }));

  const aktuell = $derived(store.lage?.statusSet ?? STANDARD_STATUS);
  let entwurf = $state<StatusEntwurf[]>(alsEntwurf(store.lage?.statusSet ?? STANDARD_STATUS));

  const ergebnis = $derived(statusSetAus(entwurf));
  const fehler = $derived(pruefeStatusSet(ergebnis));
  const geaendert = $derived(JSON.stringify(ergebnis) !== JSON.stringify(aktuell));

  const aendere = (i: number, teil: Partial<StatusEntwurf>) => (entwurf = entwurf.map((e, j) => (j === i ? { ...e, ...teil } : e)));

  function speichern() {
    if (fehler) return toast(fehler);
    if (!send({ typ: 'lage.statusSet', statusSet: ergebnis })) return toast('Keine Verbindung – nicht gespeichert.');
    entwurf = alsEntwurf(ergebnis); // neue Keys festhalten
    toast('Status-Set gespeichert.');
  }
</script>

<ol>
  {#each entwurf as e, i}
    <li>
      <input
        type="color"
        value={e.farbe}
        aria-label="Farbe {e.label || 'neuer Status'}"
        oninput={(ev) => aendere(i, { farbe: ev.currentTarget.value })}
      />
      <input
        class="label"
        value={e.label}
        maxlength="40"
        placeholder="Bezeichnung"
        aria-label="Bezeichnung"
        oninput={(ev) => aendere(i, { label: ev.currentTarget.value })}
      />
      <button class="icon" aria-label="Nach oben" disabled={i === 0} onclick={() => (entwurf = verschiebe(entwurf, i, -1))}>▲</button>
      <button class="icon" aria-label="Nach unten" disabled={i === entwurf.length - 1} onclick={() => (entwurf = verschiebe(entwurf, i, 1))}>▼</button>
      <button
        class="icon entf"
        aria-label="{e.label || 'Status'} entfernen"
        disabled={entwurf.length <= 1}
        onclick={() => (entwurf = entwurf.filter((_, j) => j !== i))}>✕</button
      >
    </li>
  {/each}
</ol>

<div class="knoepfe">
  <button disabled={entwurf.length >= 20} onclick={() => (entwurf = [...entwurf, { key: null, label: '', farbe: '#607d8b' }])}>+ Status</button>
  <button onclick={() => (entwurf = alsEntwurf(STANDARD_STATUS))}>Standard</button>
  <button disabled={!geaendert} onclick={() => (entwurf = alsEntwurf(aktuell))}>Verwerfen</button>
</div>
{#if fehler}<p class="fehler" role="alert">{fehler}</p>{/if}
<button class="primaer breit" disabled={!geaendert || !!fehler} onclick={speichern}>Speichern</button>
<p class="leise">
  Gilt sofort für alle. Wer einen entfernten Status hat, behält ihn bis zum nächsten Wechsel. «Standard» füllt die Liste neu, gespeichert
  wird erst mit «Speichern».
</p>

<style>
  ol {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  input[type='color'] {
    width: var(--touch);
    flex: none;
    padding: 4px;
  }
  .label {
    flex: 1;
    min-width: 0;
  }
  li .icon {
    width: 40px;
    min-width: 40px;
    flex: none;
    background: transparent;
    border-color: transparent;
  }
  .entf {
    color: var(--danger);
  }
  .knoepfe {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }
  .knoepfe button {
    flex: 1;
    padding: 0 8px;
  }
  .breit {
    width: 100%;
  }
  .fehler {
    color: var(--danger);
  }
</style>
