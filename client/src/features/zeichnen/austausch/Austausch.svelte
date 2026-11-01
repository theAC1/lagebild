<script lang="ts">
  // Ebenen importieren (Leitung, Gruppenführer) und exportieren (alle) als MilX oder KML (Spec v8), im Ebenen-Panel und unter
  // «Karte und Ebenen» (dort auch für Beobachter und in AN).
  import { LngLatBounds } from 'maplibre-gl';
  import { darfImportieren } from '../../../../../shared/regeln/index.ts';
  import { speichere } from '../../../lib/datei.ts';
  import { getMap } from '../../../lib/map.ts';
  import { store } from '../../../lib/store.svelte.ts';
  import { toast } from '../../../lib/ui.svelte.ts';
  import { istApp } from '../../../lib/umgebung.ts';
  import { artLabel } from '../logik.ts';
  import { ebenenListe, zn } from '../zustand.svelte.ts';
  import { arten, ENDUNGEN, exportEbenen, exportiere, importiere, lies, plane, zaehle } from './austausch.ts';
  import { ohneMilxCode, type DateiEbene } from './milx.ts';

  const liste = $derived(ebenenListe());

  const darfImport = $derived(!!store.ichSelbst && darfImportieren(store.ichSelbst.rolle));
  let eingabe = $state<HTMLInputElement>();
  let vorschau = $state<{ datei: string; ebenen: DateiEbene[]; fehler: string | null } | null>(null);
  let auswahl = $state<Set<string> | null>(null);
  let laeuft = $state(false);

  const exportListe = $derived(auswahl ? exportEbenen([...auswahl]) : []);
  const ohneCode = $derived(zaehle(ohneMilxCode(exportListe.flatMap((e) => e.zeichnungen)).map(artLabel)));

  async function gewaehlt() {
    const datei = eingabe?.files?.[0];
    if (eingabe) eingabe.value = '';
    if (!datei) return;
    try {
      vorschau = { datei: datei.name, ...plane(await lies(datei)) };
    } catch (e) {
      toast(`Import: ${(e as Error).message}`);
    }
  }

  async function importieren() {
    if (!vorschau) return;
    laeuft = true;
    const { ids, ok } = await importiere(vorschau.ebenen);
    laeuft = false;
    if (!ok) return toast(ids.length ? 'Import unvollständig – Verbindung prüfen.' : 'Import nicht möglich – Verbindung prüfen.');
    toast(`${ids.length} Ebene${ids.length === 1 ? '' : 'n'} importiert`);
    const b = new LngLatBounds();
    for (const e of vorschau.ebenen) for (const z of e.zeichnungen) for (const p of z.punkte) b.extend([p.lon, p.lat]);
    vorschau = null;
    if (!b.isEmpty()) getMap().fitBounds(b, { padding: 60, maxZoom: 16 }); // quer liegt das Panel neben der Karte
  }

  async function exportieren(format: 'milx' | 'kml') {
    laeuft = true;
    try {
      const { blob, name } = await exportiere(exportListe, format);
      if (!(await speichere(blob, name))) toast('Speichern geht in dieser App-Version nicht – bitte App aktualisieren.');
      else auswahl = null;
    } catch (e) {
      toast(`Export fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      laeuft = false;
    }
  }
  /** Knöpfe der Vorschau bzw. des Exports ins Bild holen (quer liegen sie sonst unter dem Panelrand). */
  const insBild = (el: HTMLElement) => el.scrollIntoView({ block: 'nearest' });
  function waehle(id: string, an: boolean) {
    const neu = new Set(auswahl);
    if (an) neu.add(id);
    else neu.delete(id);
    auswahl = neu;
  }
</script>

<!-- In der App ohne accept: Android kennt .milxly nicht und blendete sonst alle MilX-Dateien aus -->
<input bind:this={eingabe} type="file" hidden accept={istApp() ? undefined : ENDUNGEN} aria-label="Datei zum Importieren" onchange={gewaehlt} />

{#if vorschau}
  <section class="austausch" aria-label="Import-Vorschau">
    <h4>Import «{vorschau.datei}»</h4>
    {#each vorschau.ebenen as e (e.name)}
      <div class="ebene">
        <strong>{e.name}</strong>
        <span>{arten(e).join(' · ')}</span>
        {#if e.vereinfacht}<span class="leise">{e.vereinfacht} vereinfacht (zu viele Punkte)</span>{/if}
        {#if e.nicht.length}<span class="warn">Nicht abbildbar: {zaehle(e.nicht).join(' · ')}</span>{/if}
      </div>
    {/each}
    {#if vorschau.fehler}<p class="warn">{vorschau.fehler}</p>{:else if store.istLeitung}<p class="leise">Neue Ebenen sind gesperrt (nur Leitung ändert).</p>{/if}
    <div class="knoepfe" use:insBild>
      <button onclick={() => (vorschau = null)} disabled={laeuft}>Abbrechen</button>
      <button class="primaer" onclick={importieren} disabled={laeuft || !!vorschau.fehler}>{laeuft ? 'Importiert …' : 'Importieren'}</button>
    </div>
  </section>
{:else if auswahl}
  <section class="austausch" aria-label="Export">
    <h4>Exportieren</h4>
    {#each liste as e (e.id)}
      <label class="haken"><input type="checkbox" checked={auswahl.has(e.id)} onchange={(ev) => waehle(e.id, (ev.target as HTMLInputElement).checked)} />{e.name}</label>
    {/each}
    {#if ohneCode.length}<p class="leise">Nicht im MilX (kein Code bekannt): {ohneCode.join(' · ')}</p>{/if}
    <div class="knoepfe" use:insBild>
      <button onclick={() => (auswahl = null)} disabled={laeuft}>Abbrechen</button>
      <button class="primaer" onclick={() => exportieren('milx')} disabled={laeuft || !auswahl.size}>MilX</button>
      <button class="primaer" onclick={() => exportieren('kml')} disabled={laeuft || !auswahl.size}>KML</button>
    </div>
  </section>
{:else}
  <div class="knoepfe">
    {#if darfImport}<button onclick={() => eingabe?.click()}>Importieren …</button>{/if}
    <button onclick={() => (auswahl = new Set(liste.filter((e) => !zn.ausgeblendet.has(e.id)).map((e) => e.id)))}>Exportieren …</button>
  </div>
{/if}

<style>
  .austausch {
    display: grid;
    gap: 6px;
    margin-top: 8px;
  }
  h4 {
    margin: 0;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .ebene {
    display: grid;
    gap: 2px;
    padding: 6px 8px;
    background: var(--bg);
    border-radius: 8px;
    font-size: 0.85rem;
  }
  .warn {
    margin: 0;
    color: var(--danger);
    font-size: 0.85rem;
  }
  .haken {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
  }
  .haken input {
    width: 20px;
    min-height: 20px;
    margin: 0;
    accent-color: var(--accent);
  }
  .knoepfe {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .knoepfe button {
    min-height: 36px;
    padding: 0 12px;
  }
  p {
    margin: 0;
  }
</style>
