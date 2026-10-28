<script lang="ts">
  import type { PanelProps } from '../registry.ts';
  import { formatAlter, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { funktionLabel, symbolSvg } from '../../lib/symbol.ts';
  import { waehle } from '../../lib/ui.svelte.ts';
  import { zentriere } from '../../lib/map.ts';
  import { sichtungZustand, starteEntwurf } from './entwurf.svelte.ts';
  import Formular from './Formular.svelte';
  import { KAMERA_SVG, neuesteZuerst, vonMir } from './logik.ts';

  let _props: PanelProps = $props();

  const liste = $derived(neuesteZuerst(store.sichtungen.values()));
</script>

{#if sichtungZustand.entwurf}
  <Formular e={sichtungZustand.entwurf} />
{:else}
  <button class="primaer neu" onclick={() => starteEntwurf()}>Neue Sichtung melden</button>
  {#if liste.length === 0}
    <p class="leise">Noch keine Sichtungen. Tipp: lange auf die Karte drücken → «Sichtung hier».</p>
  {:else}
    <ul>
      {#each liste as s (s.id)}
        {@const melder = store.teilnehmer.get(s.von)?.rufname ?? 'unbekannt'}
        {@const weg = vonMir(store.meinePos, s)}
        <li>
          <button
            onclick={() => {
              zentriere(s);
              waehle('sichtung', s.id);
            }}
          >
            <span class="sym">{@html symbolSvg(s.sidc, { size: 24 })}</span>
            <span class="text">
              <strong>{s.einheit || funktionLabel(s.sidc)}{#if s.fotoId}<span class="kamera" title="mit Foto">{@html KAMERA_SVG}</span>{/if}</strong>
              {#if s.taetigkeit || s.groesse}<span class="zeile">{[s.groesse, s.taetigkeit].filter(Boolean).join(' · ')}</span>{/if}
              <span class="leise">{melder} · {formatAlter(Math.max(0, serverJetzt() - s.zeit))}{weg ? ` · ${weg}` : ''}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .neu {
    width: 100%;
    margin-bottom: 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li button {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    text-align: left;
    background: var(--bg);
  }
  .sym {
    min-width: 40px;
    display: grid;
    place-items: center;
  }
  .text {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .text > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .zeile {
    font-size: 0.9rem;
  }
  .kamera {
    margin-left: 6px;
    color: var(--accent);
    vertical-align: -1px;
  }
</style>
