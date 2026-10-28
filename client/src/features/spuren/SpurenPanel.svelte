<script lang="ts">
  import type { PanelProps } from '../registry.ts';
  import { store } from '../../lib/store.svelte.ts';
  import { FENSTER, seitFuer } from './logik.ts';
  import { lade, setzeFenster, spuren, spurFarbe, zeige } from './zustand.svelte.ts';

  let {}: PanelProps = $props();

  const liste = $derived([...store.teilnehmer.values()].sort((a, b) => a.rufname.localeCompare(b.rufname, 'de')));
  const seit = $derived(seitFuer(spuren.fenster, store.jetzt));
  const anzahl = (id: string) => (spuren.daten[id] ?? []).filter((p) => p.t >= seit).length;
</script>

<div class="segmente" role="group" aria-label="Zeitfenster">
  {#each FENSTER as f (f.id)}
    <button aria-pressed={spuren.fenster === f.id} onclick={() => setzeFenster(f.id)}>{f.label}</button>
  {/each}
</div>

<div class="alle">
  <button onclick={() => zeige(liste.map((t) => t.id), true)}>Alle zeigen</button>
  <button onclick={() => zeige([...spuren.sichtbar], false)} disabled={!spuren.sichtbar.size}>Keine</button>
</div>

{#if spuren.laedt}<p class="leise" role="status">Spuren werden geladen …</p>{/if}
{#if spuren.fehler}
  <p class="fehler" role="alert">{spuren.fehler} <button onclick={lade}>Erneut versuchen</button></p>
{/if}

{#if liste.length === 0}<p class="leise">Noch niemand in der Lage.</p>{/if}
<ul>
  {#each liste as t (t.id)}
    {@const an = spuren.sichtbar.has(t.id)}
    <li>
      <label class="zeile">
        <span class="farbe" style:background={spurFarbe(t.id)} aria-hidden="true"></span>
        <span class="name">
          <strong>{t.rufname}{t.id === store.ich ? ' (ich)' : ''}</strong>
          <span class="leise">{t.einheit}{#if an && spuren.geladen} · {anzahl(t.id)} Punkte{/if}</span>
        </span>
        <span class="leise klein">Spur zeigen</span>
        <input type="checkbox" role="switch" checked={an} onchange={(e) => zeige([t.id], e.currentTarget.checked)} />
      </label>
    </li>
  {/each}
</ul>
<p class="leise">Ältere Abschnitte (über 10 min) sind blasser.</p>

<style>
  .alle {
    display: flex;
    gap: 8px;
    margin: 10px 0;
  }
  .alle button {
    flex: 1;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .zeile {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 56px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    cursor: pointer;
  }
  .farbe {
    width: 18px;
    height: 6px;
    border-radius: 3px;
    flex: none;
    outline: 2px solid #161b1f;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .klein {
    font-size: 0.8rem;
  }
  input[type='checkbox'] {
    width: 28px;
    min-height: 28px;
    flex: none;
    accent-color: var(--accent);
  }
  .fehler {
    color: var(--danger);
  }
</style>
