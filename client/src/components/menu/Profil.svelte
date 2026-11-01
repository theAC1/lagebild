<script lang="ts">
  // Menü › Profil (Spec v7): Einheit und eigenes Symbol für alle Missionen, wirkt sofort auch in der offenen; Gerätekennung
  // nur zur Anzeige. Ein Gruppenführer ändert seine Einheit nicht selbst (sonst holte er sich Rechte über eine fremde Gruppe).
  import { meineKennung } from '../../lib/geraet.ts';
  import { groesse } from '../../lib/groesse.svelte.ts';
  import { profil, setzeProfil } from '../../lib/profil.svelte.ts';
  import { ichAendern, store } from '../../lib/store.svelte.ts';
  import { funktionLabel, symbolSvg } from '../../lib/symbol.ts';
  import SymbolPicker from '../../lib/SymbolPicker.svelte';
  import { toast } from '../../lib/ui.svelte.ts';

  let symbolOffen = $state(false);
  const gf = $derived(store.ichSelbst?.rolle === 'gruppenfuehrer');
  const kennung = meineKennung();

  /** In der offenen Mission übernehmen; ohne Verbindung gilt es ab dem nächsten Beitritt. */
  function inMission(a: { einheit?: string; sidc?: string }) {
    if (store.ichSelbst && !ichAendern(a)) toast('Keine Verbindung – in der offenen Mission später erneut ändern.');
  }

  function einheit(e: Event & { currentTarget: HTMLInputElement }) {
    const wert = e.currentTarget.value.trim();
    if (!wert) return void (e.currentTarget.value = profil.einheit);
    setzeProfil({ einheit: wert });
    inMission({ einheit: wert });
  }

  function symbol(sidc: string) {
    setzeProfil({ sidc });
    inMission({ sidc });
  }
</script>

<div class="profil">
  <div class="symbol">
    <span class="sym">{@html symbolSvg(profil.sidc, { size: 34 * groesse.ui })}</span>
    <span><strong>Eigenes Symbol</strong><span class="leise">{funktionLabel(profil.sidc)}</span></span>
    <button aria-expanded={symbolOffen} onclick={() => (symbolOffen = !symbolOffen)}>{symbolOffen ? 'Fertig' : 'Ändern'}</button>
  </div>
  {#if symbolOffen}<SymbolPicker value={profil.sidc} onchange={symbol} />{/if}
  <label class="feld">
    Einheit
    <input value={profil.einheit} maxlength="32" placeholder="z.B. Zug 2" disabled={gf} onchange={einheit} />
  </label>
  {#if gf}<p class="leise">Als Gruppenführer ändert die Leitung deine Einheit.</p>{/if}
  <div class="feld">
    Gerätekennung
    {#await kennung}
      <span class="kennung leise">…</span>
    {:then k}
      <span class="kennung mono markierbar">{k}</span>
    {:catch e}
      <span class="leise">{e.message}</span>
    {/await}
  </div>
  <p class="leise">Gilt für alle Missionen und wirkt sofort auch in der offenen.</p>
</div>

<style>
  .profil {
    display: grid;
    gap: 12px;
  }
  .feld {
    display: grid;
    gap: 4px;
    font-size: 0.9rem;
    color: var(--text-2);
  }
  p {
    margin: 0;
  }
  .symbol {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .symbol > span:nth-child(2) {
    flex: 1;
    min-width: 0;
    display: grid;
    line-height: 1.25;
  }
  .sym {
    flex: none;
    display: grid;
    place-items: center;
    width: 56px;
    height: 48px;
    background: var(--bg);
    border-radius: var(--radius);
  }
  .kennung {
    display: grid;
    align-items: center;
    min-height: var(--touch);
    padding: 0 12px;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
    color: var(--accent);
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }
</style>
