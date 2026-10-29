<script lang="ts">
  import { formatLv95, formatMgrs } from '../../lib/coords.ts';
  import { zentriere } from '../../lib/map.ts';
  import { api, formatAlter, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { funktionLabel, symbolSvg } from '../../lib/symbol.ts';
  import { groesse } from '../../lib/groesse.svelte.ts';
  import { oeffne } from '../../lib/ui.svelte.ts';
  import { formatZeit, vertrauenLabel, vonMir } from './logik.ts';

  let { id }: { id: string } = $props();

  const s = $derived(store.sichtungen.get(id));
  const melder = $derived(s ? store.teilnehmer.get(s.von) : undefined);
  const weg = $derived(s ? vonMir(store.meinePos, s) : null);

  let fotoUrl = $state<string | null>(null);
  let fotoFehler = $state<string | null>(null);
  let gross = $state<HTMLDialogElement>();

  $effect(() => {
    const fotoId = s?.fotoId;
    fotoUrl = null;
    fotoFehler = null;
    if (!fotoId) return;
    let url: string | null = null;
    let abgebrochen = false;
    api(`/api/foto/${encodeURIComponent(fotoId)}`)
      .then((r) => r.blob())
      .then((b) => {
        if (abgebrochen) return;
        url = URL.createObjectURL(b);
        fotoUrl = url;
      })
      .catch((e) => {
        if (!abgebrochen) fotoFehler = e instanceof Error ? e.message : 'Foto nicht ladbar.';
      });
    return () => {
      abgebrochen = true;
      if (url) URL.revokeObjectURL(url);
    };
  });

  const felder = $derived(
    s
      ? [
          { k: 'Grösse', v: s.groesse },
          { k: 'Tätigkeit', v: s.taetigkeit },
          { k: 'Einheit', v: s.einheit },
          { k: 'Ausrüstung', v: s.ausruestung },
          { k: 'Bemerkung', v: s.bemerkung },
        ]
      : [],
  );
</script>

{#if !s}
  <p class="leise">Sichtung nicht mehr vorhanden.</p>
{:else}
  <div class="kopf">
    <div class="zeichen">{@html symbolSvg(s.sidc, { size: 34 * groesse.ui })}</div>
    <div>
      <div class="titel">{s.einheit || funktionLabel(s.sidc)}</div>
      <div class="leise">{#if s.einheit}{funktionLabel(s.sidc)} · {/if}<span class="vertrauen {s.vertrauen}">{vertrauenLabel(s.vertrauen)}</span></div>
    </div>
  </div>

  {#if s.fotoId}
    <div class="foto">
      {#if fotoUrl}
        <button class="bild" onclick={() => gross?.showModal()} aria-label="Foto vergrössern">
          <img src={fotoUrl} alt="Foto der Sichtung" />
        </button>
        <dialog bind:this={gross} onclick={() => gross?.close()}>
          <img src={fotoUrl} alt="Foto der Sichtung, gross" />
          <p class="leise">Tippen zum Schliessen</p>
        </dialog>
      {:else if fotoFehler}
        <p class="leise">Foto: {fotoFehler}</p>
      {:else}
        <p class="leise">Foto wird geladen …</p>
      {/if}
    </div>
  {/if}

  <dl>
    {#each felder as f (f.k)}
      {#if f.v}<dt>{f.k}</dt><dd>{f.v}</dd>{/if}
    {/each}
    <dt>Zeit</dt>
    <dd>{formatZeit(s.zeit, store.jetzt)} <span class="leise">({formatAlter(Math.max(0, serverJetzt() - s.zeit))})</span></dd>
    <dt>LV95</dt>
    <dd class="mono">{formatLv95(s)}</dd>
    <dt>MGRS</dt>
    <dd class="mono">{formatMgrs(s)}</dd>
    {#if weg}
      <dt>Von mir</dt>
      <dd class="mono">{weg}</dd>
    {/if}
    <dt>Melder</dt>
    <dd>{melder ? `${melder.rufname} (${melder.einheit})` : 'nicht mehr in der Lage'}</dd>
  </dl>

  <div class="aktionen">
    <button onclick={() => zentriere(s)}>Zentrieren</button>
    <button onclick={() => oeffne('rangebearing', { ziel: { art: 'sichtung', id } })}>Range &amp; Bearing</button>
    {#if melder && melder.id !== store.ich}
      <button onclick={() => oeffne('chat', { an: { art: 'person', id: melder.id } })}>Melder anschreiben</button>
    {/if}
  </div>
{/if}

<style>
  .kopf {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .zeichen {
    min-width: 56px;
    display: grid;
    place-items: center;
  }
  .titel {
    font-size: 1.2rem;
    font-weight: 700;
  }
  .vertrauen.bestaetigt {
    color: var(--ok);
  }
  .vertrauen.unsicher {
    color: var(--warn);
  }
  .foto {
    margin-top: 12px;
  }
  .bild {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: var(--bg);
    overflow: hidden;
  }
  .bild img {
    display: block;
    width: 100%;
    max-height: 240px;
    object-fit: contain;
  }
  dialog {
    max-width: 100vw;
    max-height: 100dvh;
    width: 100vw;
    height: 100dvh;
    margin: 0;
    padding: 8px;
    border: 0;
    background: #000;
    display: none;
    place-items: center;
    align-content: center;
  }
  dialog[open] {
    display: grid;
  }
  dialog img {
    max-width: 100%;
    max-height: calc(100dvh - 60px);
    object-fit: contain;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.9);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 12px 0;
  }
  dt {
    color: var(--text-2);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .aktionen {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .aktionen button {
    flex: 1 1 30%;
  }
</style>
