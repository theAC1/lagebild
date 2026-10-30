<script lang="ts">
  // Führungsraster: auflegen, anpassen (Chips/Stufen), fixieren; Leitung löst. Mit params.melden: Marker per Rasterposition.
  import { RasterDef, RASTER_MAX_AUSDEHNUNG_M, RASTER_MAX_SPALTEN, RASTER_MAX_ZEILEN, type Raster, type RasterArt } from '../../../../shared/protocol.ts';
  import { RASTER_NAME, RASTER_VORGABE, rahmen, rasterMitteLv95, rasterUm, zuLv95 } from '../../../../shared/raster.ts';
  import { kartenMitte } from '../../lib/map.ts';
  import { send, store } from '../../lib/store.svelte.ts';
  import { oeffne, schliesse, toast } from '../../lib/ui.svelte.ts';
  import { bboxUm } from '../offline/kacheln.ts';
  import { offline } from '../offline/zustand.svelte.ts';
  import type { PanelProps } from '../registry.ts';
  import Melden from './Melden.svelte';
  import { zeigeRaster } from './karte.ts';
  import { angezeigt, ARTEN, darfAendern, darfFixieren, fixierte } from './zustand.svelte.ts';

  let { params }: PanelProps = $props();

  const ZWECK: Record<RasterArt, string> = { grande: 'Area of Interest · Achsen, Anfahrten', piccolo: 'Area of Operation · Objekt' };
  const GROESSEN: Record<RasterArt, number[]> = { grande: [25, 50, 80, 100, 150, 200, 250], piccolo: [5, 10, 15, 20, 25, 50] };
  let loeschenFragen = $state<RasterArt | null>(null);
  /** Raster, das ich gerade anpassen darf (nicht fixiert): die anderen schrumpfen auf ihre Kopfzeile. */
  const fokus = $derived(ARTEN.find((a) => {
    const r = angezeigt(a);
    return r && darfAendern(r);
  }));

  const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace(/\.?0+$/, '')} km` : `${m} m`);
  const ok = (msg: Parameters<typeof send>[0]) => send(msg) || (toast('Keine Verbindung – Raster nicht geändert.'), false);

  function setze(def: RasterDef): boolean {
    const p = RasterDef.safeParse(def);
    if (!p.success) return (toast(def.e < 2_400_000 || def.n < 1_000_000 ? 'Raster liegt ausserhalb der Schweiz.' : 'Raster zu gross.'), false);
    return ok({ typ: 'raster.setzen', raster: p.data });
  }

  function auflegen(art: RasterArt) {
    const mitte = kartenMitte();
    if (!mitte) return;
    const def = { art, ...rasterUm(zuLv95(mitte), RASTER_VORGABE[art]) };
    if (setze(def)) zeigeRaster(def);
  }

  /** Grösse ändern, die Mitte bleibt. */
  function aendern(r: Raster, g: Partial<Pick<Raster, 'zeilen' | 'spalten' | 'zellM'>>) {
    const neu = { zeilen: r.zeilen, spalten: r.spalten, zellM: r.zellM, ...g };
    setze({ art: r.art, ...rasterUm(rasterMitteLv95(r), neu) });
  }
  function inMitte(r: Raster) {
    const mitte = kartenMitte();
    if (mitte) setze({ art: r.art, ...rasterUm(zuLv95(mitte), r) });
  }
  /** Offline-Gebiet aufziehen, vorbelegt mit dem Rahmen (+ Rand): die Leitung muss nur noch «Weiter» und «Laden». */
  function offlineVorschlagen(r: Raster) {
    offline.vorschlag = bboxUm(rahmen(r));
    offline.aufziehen = true;
    schliesse('raster');
  }
  const passt = (r: Raster, zeilen: number, spalten: number, zellM = r.zellM) => Math.max(zeilen, spalten) * zellM <= RASTER_MAX_AUSDEHNUNG_M;
  const name = (id: string) => store.teilnehmer.get(id)?.rufname ?? 'nicht mehr in der Lage';
</script>

{#if params.melden}
  <Melden />
{:else}
  {#if fixierte().length && !fokus}
    <button class="primaer breit" onclick={() => oeffne('raster', { melden: true })}>Marker per Rasterposition</button>
  {/if}
  {#each ARTEN as art (art)}
    {@const r = angezeigt(art)}
    <section class="raster" aria-label={RASTER_NAME[art]}>
      <div class="kopf">
        <strong>{RASTER_NAME[art]}</strong>
        {#if r}<span class="status" class:fix={r.fixiert}>{r.fixiert ? 'Fixiert' : 'Vorschau'}</span>{/if}
      </div>
      {#if fokus && fokus !== art}
        <!-- während ein anderes Raster angepasst wird: nur die Kopfzeile, damit im Hochformat Karte frei bleibt -->
      {:else if !r}
        <div class="leise klein">{ZWECK[art]}</div>
        <button class="breit" onclick={() => auflegen(art)}>{RASTER_NAME[art]} auflegen</button>
        <p class="leise klein">Legt {RASTER_VORGABE[art].spalten} × {RASTER_VORGABE[art].zeilen} Zellen à {RASTER_VORGABE[art].zellM} m in die Kartenmitte.</p>
      {:else}
        <div class="klein"><span class="mono">{r.spalten} × {r.zeilen} Zellen à {r.zellM} m · {km(r.spalten * r.zellM)} × {km(r.zeilen * r.zellM)}</span> <span class="leise">· von {name(r.von)}</span></div>
        {#if darfAendern(r)}
          <div class="chips zeile" role="group" aria-label="Zellgrösse">
            {#each GROESSEN[art] as g (g)}
              <button aria-pressed={r.zellM === g} disabled={!passt(r, r.zeilen, r.spalten, g)} onclick={() => aendern(r, { zellM: g })}>{g} m</button>
            {/each}
          </div>
          <div class="stufen">
            {#each [{ k: 'spalten', label: 'Spalten', wert: r.spalten, max: RASTER_MAX_SPALTEN }, { k: 'zeilen', label: 'Zeilen', wert: r.zeilen, max: RASTER_MAX_ZEILEN }] as s (s.k)}
              {@const plus = s.k === 'spalten' ? passt(r, r.zeilen, r.spalten + 1) : passt(r, r.zeilen + 1, r.spalten)}
              <div class="stufe" role="group" aria-label={s.label}>
                <button aria-label="Weniger {s.label}" disabled={s.wert <= 1} onclick={() => aendern(r, { [s.k]: s.wert - 1 })}>−</button>
                <span class="wert"><span class="mono">{s.wert}</span><small>{s.label}</small></span>
                <button aria-label="Mehr {s.label}" disabled={s.wert >= s.max || !plus} onclick={() => aendern(r, { [s.k]: s.wert + 1 })}>+</button>
              </div>
            {/each}
          </div>
          <p class="leise klein">Raster auf der Karte ziehen, um es zu verschieben.</p>
          <div class="aktionen">
            <button onclick={() => inMitte(r)}>In Kartenmitte</button>
            <button class="primaer" onclick={() => ok({ typ: 'raster.fixieren', art, fixiert: true })}>Fixieren</button>
          </div>
        {:else if r.fixiert}
          <p class="leise klein">{store.istLeitung ? 'Zum Verschieben oder Ändern zuerst lösen.' : 'Fixiert: nur die Leitung kann es lösen.'}</p>
        {/if}
        {#if loeschenFragen === art}
          <div class="aktionen">
            <button onclick={() => (loeschenFragen = null)}>Abbrechen</button>
            <button class="gefahr" onclick={() => ok({ typ: 'raster.loeschen', art }) && (loeschenFragen = null)}>Endgültig löschen</button>
          </div>
        {:else}
          <div class="aktionen">
            <button onclick={() => zeigeRaster(r)}>Zeigen</button>
            <button onclick={() => offlineVorschlagen(r)}>Offline-Gebiet …</button>
            {#if r.fixiert && darfFixieren(r)}<button onclick={() => ok({ typ: 'raster.fixieren', art, fixiert: false })}>Lösen</button>{/if}
            {#if darfFixieren(r)}<button class="gefahr" onclick={() => (loeschenFragen = art)}>Löschen</button>{/if}
          </div>
        {/if}
      {/if}
    </section>
  {/each}
{/if}

<style>
  .breit {
    width: 100%;
  }
  .raster {
    display: grid;
    gap: 8px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  .raster:first-of-type {
    border-top: 0;
  }
  .kopf {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.05rem;
  }
  .status {
    margin-left: auto;
    padding: 2px 10px;
    border: 1px dashed var(--line);
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .status.fix {
    border: 1px solid var(--ok);
    color: var(--ok);
  }
  .klein {
    margin: 0;
    font-size: 0.82rem;
  }
  .chips.zeile {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chips.zeile button {
    flex: none;
  }
  .stufen {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .stufe {
    display: grid;
    grid-template-columns: var(--touch) minmax(0, 1fr) var(--touch);
    align-items: center;
    gap: 4px;
  }
  .stufe button {
    font-size: 1.3rem;
    font-weight: 700;
    padding: 0;
  }
  .wert {
    display: grid;
    text-align: center;
    line-height: 1.1;
  }
  .wert .mono {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .wert small {
    font-size: 0.7rem;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .aktionen {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .aktionen button {
    flex: 1 1 0;
    min-width: max-content;
  }
</style>
