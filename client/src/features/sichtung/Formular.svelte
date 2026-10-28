<script lang="ts">
  import { SichtungInput } from '../../../../shared/protocol.ts';
  import { formatKoord } from '../../lib/coords.ts';
  import { waehlePunkt } from '../../lib/map.ts';
  import { api, send, store } from '../../lib/store.svelte.ts';
  import { funktionLabel, symbolSvg } from '../../lib/symbol.ts';
  import SymbolPicker from '../../lib/SymbolPicker.svelte';
  import { toast } from '../../lib/ui.svelte.ts';
  import { verkleinere } from './bild.ts';
  import { setzeFoto, sichtungZustand, verwirfEntwurf, type Entwurf } from './entwurf.svelte.ts';
  import { ausDatetimeLocal, VERTRAUEN, zuDatetimeLocal } from './logik.ts';

  let { e }: { e: Entwurf } = $props();

  let fotoArbeit = $state(false);
  let sendet = $state(false);

  const ort = $derived(e.ort ?? store.meinePos);
  const ortText = $derived(ort ? formatKoord(ort, store.einstellungen.koordFormat) : 'Eigene Position unbekannt');

  const TAETIGKEITEN = ['Marsch', 'Halt', 'Beobachtung', 'Stellungsbezug', 'Schanzen', 'Angriff', 'Verteidigung', 'Rückzug', 'Aufklärung', 'Versorgung'];
  const GROESSEN = ['1 Person', '2–3 Personen', 'Gruppe (ca. 8)', 'Zug (ca. 30)', '1 Fahrzeug', 'mehrere Fahrzeuge'];

  async function aufKarte() {
    const p = await waehlePunkt('Ort der Sichtung');
    // Sheet war ausgeblendet; Entwurf lebt auf Modulebene weiter
    if (p && sichtungZustand.entwurf) sichtungZustand.entwurf.ort = p;
  }

  async function fotoGewaehlt(ev: Event & { currentTarget: HTMLInputElement }) {
    const input = ev.currentTarget;
    const datei = input.files?.[0];
    input.value = ''; // dasselbe Bild erneut wählbar
    if (!datei) return;
    fotoArbeit = true;
    try {
      setzeFoto(await verkleinere(datei));
    } catch {
      toast('Foto konnte nicht gelesen werden.');
    } finally {
      fotoArbeit = false;
    }
  }

  async function melden() {
    if (sendet) return;
    if (!ort) return toast('Ort fehlt – bitte auf der Karte wählen.');
    const zeit = e.zeit === zuDatetimeLocal(e.zeitMs) ? e.zeitMs : ausDatetimeLocal(e.zeit);
    if (zeit === null) return toast('Zeit ungültig.');
    const geprueft = SichtungInput.safeParse({
      lat: ort.lat,
      lon: ort.lon,
      sidc: e.sidc,
      groesse: e.groesse,
      taetigkeit: e.taetigkeit,
      einheit: e.einheit,
      zeit,
      ausruestung: e.ausruestung,
      bemerkung: e.bemerkung,
      vertrauen: e.vertrauen,
      fotoId: null,
    });
    if (!geprueft.success) return toast('Eingaben ungültig – bitte prüfen.');
    // vor dem Upload prüfen, sonst bleibt ein verwaistes Foto auf dem Server
    if (store.verbindung !== 'verbunden') return toast('Keine Verbindung – Sichtung nicht gesendet.');
    sendet = true;
    try {
      if (e.foto && !e.fotoId) {
        const r = await api('/api/foto', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: e.foto });
        const j: unknown = await r.json();
        const id = (j as { fotoId?: unknown } | null)?.fotoId;
        if (typeof id !== 'string') throw new Error('Unerwartete Antwort beim Foto-Upload.');
        e.fotoId = id;
      }
      if (!send({ typ: 'sichtung', sichtung: { ...geprueft.data, fotoId: e.fotoId } })) {
        return toast('Keine Verbindung – Sichtung nicht gesendet.');
      }
      verwirfEntwurf();
      toast('Sichtung gemeldet');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Senden fehlgeschlagen.');
    } finally {
      sendet = false;
    }
  }
</script>

<form
  class="formular"
  onsubmit={(ev) => {
    ev.preventDefault();
    melden();
  }}
>
  <div class="foto">
    {#if e.fotoUrl}
      <img src={e.fotoUrl} alt="Vorschau der Sichtung" />
      <button type="button" class="gefahr" onclick={() => setzeFoto(null)}>Foto entfernen</button>
    {:else}
      <label class="foto-knopf" aria-busy={fotoArbeit}>
        <input type="file" accept="image/*" capture="environment" onchange={fotoGewaehlt} disabled={fotoArbeit} />
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
          ><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="4" /></svg
        >
        {fotoArbeit ? 'Foto wird verkleinert …' : 'Foto aufnehmen'}
      </label>
    {/if}
  </div>

  <label class="feld">Grösse (S)
    <input bind:value={e.groesse} maxlength="100" list="sichtung-groessen" placeholder="z.B. Gruppe (ca. 8)" />
  </label>
  <label class="feld">Tätigkeit (A)
    <input bind:value={e.taetigkeit} maxlength="200" list="sichtung-taetigkeiten" placeholder="z.B. Marsch Richtung Nord" />
  </label>

  <div class="feld">
    <span>Ort (L)</span>
    <div class="ort">
      <span class="mono">{ortText}</span>
      <span class="leise">{e.ort ? 'auf Karte gewählt' : 'eigene Position'}</span>
    </div>
    <div class="zwei">
      <button type="button" disabled={!e.ort} onclick={() => (e.ort = null)}>Eigene Position</button>
      <button type="button" onclick={aufKarte}>Auf Karte wählen</button>
    </div>
  </div>

  <label class="feld">Einheit / Erkennungszeichen (U)
    <input bind:value={e.einheit} maxlength="100" placeholder="z.B. Tarnanzug grün, Armbinde rot" />
  </label>
  <label class="feld">Zeit (T)
    <input type="datetime-local" bind:value={e.zeit} required />
  </label>
  <label class="feld">Ausrüstung (E)
    <input bind:value={e.ausruestung} maxlength="200" placeholder="z.B. 2 Radschützenpanzer, Funk" />
  </label>

  <details class="zeichen">
    <summary>
      <span class="sym">{@html symbolSvg(e.sidc, { size: 28 })}</span>
      <span>Zeichen: {funktionLabel(e.sidc)}</span>
      <span class="leise">ändern</span>
    </summary>
    <SymbolPicker value={e.sidc} onchange={(s) => (e.sidc = s)} />
  </details>

  <div class="feld">
    <span>Vertrauen</span>
    <div class="segmente" role="group" aria-label="Vertrauen">
      {#each VERTRAUEN as v (v.id)}
        <button type="button" aria-pressed={e.vertrauen === v.id} onclick={() => (e.vertrauen = v.id)}>{v.label}</button>
      {/each}
    </div>
  </div>

  <label class="feld">Bemerkung
    <textarea bind:value={e.bemerkung} maxlength="500" rows="2"></textarea>
  </label>

  <div class="aktionen">
    <button type="button" onclick={verwirfEntwurf} disabled={sendet}>Verwerfen</button>
    <button type="submit" class="primaer" disabled={sendet || fotoArbeit || !ort}>{sendet ? 'Sende …' : 'Melden'}</button>
  </div>

  <datalist id="sichtung-groessen">
    {#each GROESSEN as g (g)}<option value={g}></option>{/each}
  </datalist>
  <datalist id="sichtung-taetigkeiten">
    {#each TAETIGKEITEN as t (t)}<option value={t}></option>{/each}
  </datalist>
</form>

<style>
  .formular {
    display: grid;
    gap: 12px;
  }
  .foto img {
    display: block;
    width: 100%;
    max-height: 220px;
    object-fit: contain;
    background: var(--bg);
    border-radius: var(--radius);
    margin-bottom: 6px;
  }
  .foto button {
    width: 100%;
  }
  .foto-knopf {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 64px;
    border: 1px dashed var(--accent);
    border-radius: var(--radius);
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .foto-knopf[aria-busy='true'] {
    opacity: 0.6;
  }
  .foto-knopf input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .foto-knopf:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .ort {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: baseline;
    color: var(--text);
  }
  .zwei,
  .aktionen {
    display: flex;
    gap: 8px;
  }
  .zwei button,
  .aktionen button {
    flex: 1;
  }
  .aktionen {
    position: sticky;
    bottom: 0;
    padding: 8px 0;
    background: var(--surface);
  }
  div.feld {
    display: grid;
    gap: 4px;
    font-size: 0.9rem;
    color: var(--text-2);
  }
  .zeichen summary {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--touch);
    cursor: pointer;
    list-style: none;
  }
  .zeichen summary::-webkit-details-marker {
    display: none;
  }
  .zeichen .leise {
    margin-left: auto;
    color: var(--accent);
  }
  .sym {
    display: grid;
    place-items: center;
    min-width: 44px;
  }
  .zeichen[open] summary {
    margin-bottom: 8px;
  }
</style>
