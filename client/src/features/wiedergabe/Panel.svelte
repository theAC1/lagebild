<script lang="ts">
  // Wiedergabe in AN (Spec v6): Zeitleiste nur über LV-Zeiträume (AP-Nähte markiert), Play/Pause, Tempo, Sprung zum
  // vorigen/nächsten Ereignis. Solange das Panel offen ist, zeigt die Karte den Stand zum Zeitpunkt.
  import { onDestroy, onMount } from 'svelte';
  import type { PanelProps } from '../registry.ts';
  import { send, store } from '../../lib/store.svelte.ts';
  import { schliesse } from '../../lib/ui.svelte.ts';
  import { formatKoord } from '../../lib/coords.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import { slug, uhrzeit } from '../leitung/logik.ts';
  import { csv, ereignisListe, felder, SPALTEN, zeitText } from './liste.ts';
  import { dauer, versatzAus } from './logik.ts';
  import { fenster, pause, spiele, springe, springeVersatz, starte, stoppe, TEMPI, wg } from './zustand.svelte.ts';

  let _props: PanelProps = $props();

  onMount(() => void starte());
  onDestroy(stoppe);

  // Phase verlässt AN (Leitung wechselt zurück): Panel zu, Live-Stand zurück
  $effect(() => {
    if (store.phase !== 'an') schliesse('wiedergabe');
  });

  const f = $derived(store.lage ? fenster() : []);
  const gesamt = $derived(dauer(f));
  const versatz = $derived(versatzAus(f, wg.t));
  /** Nähte zwischen LV-Abschnitten in % der Zeitleiste, beschriftet mit der übersprungenen Phase (meist AP). */
  const naehte = $derived(
    f.slice(1).map((_, i) => ({
      x: (dauer(f.slice(0, i + 1)) / (gesamt || 1)) * 100,
      phase: (store.lage?.phasen.find((p) => p.t === f[i].bis)?.phase ?? 'ap').toUpperCase(),
    })),
  );
  const zeilen = $derived(
    wg.protokoll && store.lage && store.ich
      ? ereignisListe({ protokoll: wg.protokoll, lage: store.lage, notizen: store.notizen, ich: { id: store.ich, rolle: store.istLeitung ? 'leitung' : 'teilnehmer' } })
      : [],
  );
  const zeiten = $derived([...new Set(zeilen.map((z) => z.t))]);
  /** Index der letzten Zeile bis zum Zeitpunkt (hervorgehoben, «Zuletzt»). */
  const aktuell = $derived(zeilen.findLastIndex((z) => z.t <= wg.t));
  const koord = (p: { lat: number; lon: number }) => formatKoord(p, store.einstellungen.koordFormat);

  // PDF: Spaltenbreiten in Zeichen (Courier, A4 quer, 174 Zeichen je Zeile)
  const BREITEN = [19, 12, 10, 18, 70, 25, 14];

  function herunterladen(daten: BlobPart, typ: string, endung: string) {
    const url = URL.createObjectURL(new Blob([daten], { type: typ }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ereignisse-${slug(store.lage?.name ?? 'lage')}.${endung}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function exportiere(art: 'csv' | 'pdf') {
    try {
      if (art === 'csv') return herunterladen(csv(zeilen, koord), 'text/csv;charset=utf-8', 'csv');
      const { textPdf } = await import('./pdf.ts');
      const titel = `Ereignisse «${store.lage?.name ?? ''}» – ${zeitText(f[0]?.von ?? 0)} bis ${zeitText(f.at(-1)?.bis ?? 0)}`;
      herunterladen(textPdf(titel, SPALTEN, zeilen.map((z) => felder(z, koord)), BREITEN) as BlobPart, 'application/pdf', 'pdf');
    } catch (e) {
      toast(`Export fehlgeschlagen: ${(e as Error).message}`);
    }
  }

  // Debriefing-Notizen (nur Leitung): an den aktuellen Zeitpunkt hängen, löschen per ×
  let notiz = $state<string | null>(null);
  function notizSpeichern() {
    const text = notiz?.trim();
    if (!text) return;
    if (!send({ typ: 'notiz.neu', t: Math.round(wg.t), text })) return toast('Keine Verbindung – Notiz nicht gespeichert.');
    notiz = null;
  }
  function notizLoeschen(id: string) {
    if (confirm('Notiz löschen?') && !send({ typ: 'notiz.loeschen', id })) toast('Keine Verbindung – Notiz nicht gelöscht.');
  }
  const notizMarken = $derived(store.notizen.map((n) => ({ id: n.id, x: (versatzAus(f, n.t) / (gesamt || 1)) * 100 })));

  let liste = $state<HTMLElement>();
  let kopf = $state<HTMLElement>();
  let rumpf = $state<HTMLElement>();
  // aktuelle Zeile beim Abspielen im Blick halten. Quer scrollt nur der Rumpf unter dem festen Kopf; hoch (Sheet ohne feste
  // Höhe) scrollt das ganze Panel, dann nie weiter, als der Kopf ganz sichtbar bleibt – den Stand zeigt sonst «Zuletzt».
  $effect(() => {
    void aktuell;
    const zeile = liste?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!zeile || !rumpf || !kopf) return;
    const scroller = rumpf.scrollHeight > rumpf.clientHeight + 1 ? rumpf : rumpf.closest<HTMLElement>('.inhalt');
    if (!scroller) return;
    const p = scroller.getBoundingClientRect();
    const z = zeile.getBoundingClientRect();
    const k = kopf.getBoundingClientRect();
    const mitKopf = scroller.contains(kopf);
    const d = z.bottom > p.bottom ? Math.min(z.bottom - p.bottom, mitKopf ? Math.max(0, k.top - p.top) : Infinity) : Math.min(0, z.top - (mitKopf ? k.bottom : p.top));
    scroller.scrollTop += d;
  });

  function naechstes(richtung: 1 | -1) {
    pause();
    // zurück: ein Ereignis knapp vor dem Zeitpunkt überspringen, sonst bleibt man daran hängen
    const t = richtung > 0 ? zeiten.find((x) => x > wg.t) : zeiten.findLast((x) => x < wg.t - 1000);
    springe(t ?? (richtung > 0 ? (f.at(-1)?.bis ?? wg.t) : (f[0]?.von ?? wg.t)));
  }

  function taste(e: KeyboardEvent) {
    if ((e.target as Element).closest?.('input:not([type=range]), textarea')) return;
    if (e.key === ' ') wg.spielt ? pause() : spiele();
    else if (e.key === 'ArrowRight' && e.altKey) naechstes(1);
    else if (e.key === 'ArrowLeft' && e.altKey) naechstes(-1);
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={taste} />

{#if wg.fehler}
  <p class="fehler" role="alert">Wiedergabe nicht geladen: {wg.fehler} <button onclick={() => void starte()}>Erneut</button></p>
{:else if !wg.protokoll}
  <p class="leise">Wiedergabe wird geladen …</p>
{:else if !f.length}
  <p class="leise">Keine Lageverfolgung aufgezeichnet.</p>
{:else}
  <div class="wg">
    <!-- fester Kopf: Uhrzeit, Knöpfe, Schieber, Tempo; nur der Rumpf (Notiz, «Zuletzt», Ereignisliste) scrollt darunter -->
    <section class="leiste" aria-label="Zeitleiste" bind:this={kopf}>
      <div class="reihe">
        <div class="zeit">
          <strong class="mono" aria-live="off">{uhrzeit(wg.t)}</strong>
          <span class="leise mono">{Math.round(versatz / 60_000)} / {Math.round(gesamt / 60_000)} min LV</span>
        </div>
        <div class="knoepfe">
          <button class="icon" aria-label="Voriges Ereignis" title="Voriges Ereignis (Alt+←)" onclick={() => naechstes(-1)}>⏮</button>
          {#if wg.spielt}
            <button class="primaer spiel" aria-label="Pause" onclick={pause}>⏸</button>
          {:else}
            <button class="primaer spiel" aria-label="Abspielen" title="Abspielen (Leertaste)" onclick={spiele}>▶</button>
          {/if}
          <button class="icon" aria-label="Nächstes Ereignis" title="Nächstes Ereignis (Alt+→)" onclick={() => naechstes(1)}>⏭</button>
        </div>
      </div>
      <div class="schiene">
        <input
          type="range"
          aria-label="Zeitpunkt"
          min="0"
          max={gesamt}
          step="1000"
          value={versatz}
          oninput={(e) => {
            pause();
            springeVersatz(Number(e.currentTarget.value));
          }}
        />
        {#each naehte as n, i (i)}<span class="naht" style:left="{n.x}%" title="{n.phase} übersprungen">{n.phase}</span>{/each}
        {#each notizMarken as n (n.id)}<span class="notiz-marke" style:left="{n.x}%" aria-hidden="true"></span>{/each}
      </div>
      <div class="segmente tempo" role="group" aria-label="Tempo">
        {#each TEMPI as x (x)}<button aria-pressed={wg.tempo === x} onclick={() => (wg.tempo = x)}>{x}×</button>{/each}
      </div>
    </section>

    <div class="rumpf" bind:this={rumpf}>
      {#if store.istLeitung}
        {#if notiz === null}
          <button class="breit" onclick={() => (pause(), (notiz = ''))}>+ Notiz bei {uhrzeit(wg.t)}</button>
        {:else}
          <form class="notiz" onsubmit={(e) => (e.preventDefault(), notizSpeichern())}>
            <textarea aria-label="Notiz" maxlength="500" rows="2" placeholder="Beobachtung für das Debriefing" bind:value={notiz}></textarea>
            <div class="knoepfe">
              <button type="button" onclick={() => (notiz = null)}>Abbrechen</button>
              <button class="primaer" type="submit" disabled={!notiz.trim()}>Notiz speichern</button>
            </div>
          </form>
        {/if}
      {/if}
      {#if aktuell >= 0}
        {@const z = zeilen[aktuell]}
        <p class="zuletzt" role="status">Zuletzt <span class="mono">{uhrzeit(z.t)}</span> · {z.rufname} · {z.ereignis}{z.details ? `: ${z.details}` : ''}</p>
      {/if}

      <section class="ereignisse" aria-label="Ereignisliste">
        <div class="kopfzeile">
          <h3>Ereignisse ({zeilen.length})</h3>
          <button onclick={() => exportiere('csv')}>CSV</button>
          <button onclick={() => exportiere('pdf')}>PDF</button>
        </div>
        <ol class="liste" bind:this={liste}>
          {#each zeilen as z, i (i)}
            <li>
              <button class="zeile" aria-current={i === aktuell} onclick={() => (pause(), springe(z.t))}>
                <span class="mono leise">{uhrzeit(z.t)}</span>
                <span><strong>{z.ereignis}</strong> · {z.rufname}{z.details ? ` – ${z.details}` : ''}{z.zelle ? ` · ${z.zelle}` : ''}</span>
              </button>
              {#if z.notizId && store.istLeitung}
                {@const id = z.notizId}
                <button class="icon weg" aria-label="Notiz löschen" onclick={() => notizLoeschen(id)}>✕</button>
              {/if}
            </li>
          {/each}
        </ol>
      </section>
    </div>
  </div>
{/if}

<style>
  /* Quer hat das Sheet eine feste Höhe: Kopf fest, Rumpf scrollt. Hoch (nur max-height) greift height: 100% nicht,
     dann scrollt wie bisher das ganze Panel. */
  .wg {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  /* quer: die Liste läuft bis an den Panelrand (Sheet-Innenabstand unten bleibt sonst als tote Fläche unter dem Scrollbereich) */
  @media (orientation: landscape) {
    .wg {
      height: calc(100% + 12px);
      margin-bottom: -12px;
    }
  }
  .leiste {
    flex: none;
    display: grid;
    gap: 4px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--line);
  }
  .rumpf {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-top: 4px;
  }
  .reihe {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 8px;
  }
  .reihe .knoepfe {
    gap: 4px;
  }
  .zeit {
    display: grid;
    line-height: 1.15;
  }
  .zeit strong {
    font-size: 1.2rem;
  }
  .zeit span {
    font-size: 0.75rem;
  }
  .schiene {
    position: relative;
  }
  /* Platz für die Naht-Beschriftungen nur, wenn es Nähte gibt (mehrere LV-Abschnitte) */
  .schiene:has(.naht) {
    padding-bottom: 12px;
  }
  .schiene input {
    width: 100%;
    min-height: var(--touch);
    margin: 0;
    accent-color: #2e9e44;
  }
  .naht {
    position: absolute;
    bottom: 0;
    translate: -50% 0;
    padding: 0 3px;
    border-radius: 3px;
    background: #555a5e;
    color: #fff;
    font: 700 0.65rem/1.3 var(--mono);
    pointer-events: none;
  }
  .knoepfe {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .spiel {
    min-width: var(--touch);
    font-size: 1.2rem;
  }
  .tempo {
    flex-wrap: nowrap;
    padding: 0;
  }
  .fehler {
    color: var(--danger);
  }
  .zuletzt {
    margin: 8px 0 0;
    font-size: 0.9rem;
    color: var(--text-2);
    overflow-wrap: anywhere;
  }
  .ereignisse {
    margin-top: 12px;
    display: grid;
    gap: 6px;
  }
  .kopfzeile {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .kopfzeile h3 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
  }
  .notiz-marke {
    position: absolute;
    top: calc(var(--touch) - 12px);
    width: 8px;
    height: 8px;
    translate: -50% 0;
    border-radius: 50%;
    background: #2e9e44;
    pointer-events: none;
  }
  .notiz {
    display: grid;
    gap: 6px;
  }
  .notiz textarea {
    width: 100%;
  }
  .breit {
    width: 100%;
  }
  .liste li {
    display: flex;
    align-items: center;
  }
  .weg {
    flex: none;
  }
  .liste {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .zeile {
    width: 100%;
    min-height: 40px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    align-items: baseline;
    padding: 4px 6px;
    border: 0;
    background: transparent;
    text-align: left;
    font-size: 0.88rem;
  }
  .zeile[aria-current='true'] {
    background: color-mix(in srgb, #2e9e44 25%, transparent);
  }
</style>
