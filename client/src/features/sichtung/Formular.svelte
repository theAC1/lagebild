<script lang="ts">
  // Sichtung (SALUTE) mit Chips: alles hat eine Vorgabe, «Senden» geht sofort. Freitext liegt hinter «+ Text».
  import { SichtungInput } from '../../../../shared/protocol.ts';
  import { formatKoord } from '../../lib/coords.ts';
  import { waehlePunkt } from '../../lib/map.ts';
  import { api, send, store } from '../../lib/store.svelte.ts';
  import { symbolSvg } from '../../lib/symbol.ts';
  import { schliesse, toast } from '../../lib/ui.svelte.ts';
  import { verkleinere } from './bild.ts';
  import { setzeFoto, sichtungZustand, verwirfEntwurf, type Entwurf } from './entwurf.svelte.ts';
  import { ARTEN, AUSRUESTUNG, felderAus, GROESSEN, RICHTUNGEN, SEITEN, TAETIGKEITEN, VERTRAUEN, ZEITEN } from './logik.ts';

  let { e }: { e: Entwurf } = $props();

  let fotoArbeit = $state(false);
  let sendet = $state(false);

  const w = $derived(e.wahl);
  const felder = $derived(felderAus(e.wahl, e.zeitMs));
  const ort = $derived(e.ort ?? store.meinePos);
  const ortText = $derived(ort ? formatKoord(ort, store.einstellungen.koordFormat) : 'Eigene Position unbekannt');

  async function aufKarte() {
    const p = await waehlePunkt('Fadenkreuz auf den Ort der Sichtung', 'Hier');
    // Sheet war ausgeblendet; Entwurf lebt auf Modulebene weiter
    if (p && sichtungZustand.entwurf) sichtungZustand.entwurf.ort = p;
  }

  function ausruestung(a: string) {
    w.ausruestung = w.ausruestung.includes(a) ? w.ausruestung.filter((x) => x !== a) : [...w.ausruestung, a];
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
    const geprueft = SichtungInput.safeParse({ ...felder, lat: ort.lat, lon: ort.lon, einheit: e.einheit, bemerkung: e.bemerkung, fotoId: null });
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
      schliesse('sichtung');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Senden fehlgeschlagen.');
    } finally {
      sendet = false;
    }
  }
</script>

{#snippet chips(titel: string, werte: readonly { id: string; label: string }[], aktiv: (id: string) => boolean, waehle: (id: string) => void)}
  <div class="gruppe">
    <div class="gruppe-titel">{titel}</div>
    <div class="chips" role="group" aria-label={titel}>
      {#each werte as x (x.id)}
        <button type="button" aria-pressed={aktiv(x.id)} onclick={() => waehle(x.id)}>{x.label}</button>
      {/each}
    </div>
  </div>
{/snippet}

<form
  class="formular"
  onsubmit={(ev) => {
    ev.preventDefault();
    melden();
  }}
>
  <div class="ort">
    <span class="sym" aria-hidden="true">{@html symbolSvg(felder.sidc, { size: 30 })}</span>
    <span class="ort-text">
      <span class="mono">{ortText}</span>
      <span class="leise">{e.ort ? 'Kartenpunkt' : 'eigene Position'}</span>
    </span>
    <button type="button" class="icon" aria-label="Ort ändern" title="Ort ändern" onclick={aufKarte}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
        ><circle cx="12" cy="12" r="6.5" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></svg
      >
    </button>
  </div>
  {#if e.ort}
    <button type="button" class="eigene" onclick={() => (e.ort = null)}>Eigene Position nehmen</button>
  {/if}

  {#if e.fotoUrl}
    <div class="foto">
      <img src={e.fotoUrl} alt="Vorschau der Sichtung" />
      <button type="button" class="gefahr" onclick={() => setzeFoto(null)}>Foto entfernen</button>
    </div>
  {/if}

  {@render chips('Art', ARTEN, (id) => w.art === id, (id) => (w.art = id as typeof w.art))}
  <div class="chips seite" role="group" aria-label="Zugehörigkeit">
    {#each SEITEN as s (s.id)}
      <button type="button" aria-pressed={w.seite === s.id} onclick={() => (w.seite = s.id)}>{s.label}</button>
    {/each}
  </div>
  {@render chips('Grösse', GROESSEN, (id) => w.groesse === id, (id) => (w.groesse = id as typeof w.groesse))}
  {@render chips(
    'Tätigkeit',
    TAETIGKEITEN.map((t) => ({ id: t, label: t })),
    (id) => w.taetigkeit === id,
    (id) => (w.taetigkeit = id as typeof w.taetigkeit),
  )}
  {#if w.taetigkeit === 'bewegt sich'}
    <div class="chips richtung" role="group" aria-label="Richtung">
      {#each RICHTUNGEN as r (r)}
        <button type="button" aria-pressed={w.richtung === r} onclick={() => (w.richtung = w.richtung === r ? null : r)}>{r}</button>
      {/each}
    </div>
  {/if}
  {@render chips(
    'Ausrüstung',
    AUSRUESTUNG.map((a) => ({ id: a, label: a })),
    (id) => w.ausruestung.includes(id),
    ausruestung,
  )}
  {@render chips(
    'Zeit',
    ZEITEN.map((z) => ({ id: String(z.min), label: z.label })),
    (id) => w.vorMin === Number(id),
    (id) => (w.vorMin = Number(id)),
  )}
  {@render chips('Vertrauen', VERTRAUEN, (id) => w.vertrauen === id, (id) => (w.vertrauen = id as typeof w.vertrauen))}

  <details class="freitext">
    <summary>+ Text</summary>
    <label class="feld">Einheit / Erkennungszeichen
      <input bind:value={e.einheit} maxlength="100" placeholder="z.B. Tarnanzug grün, Armbinde rot" />
    </label>
    <label class="feld">Bemerkung
      <textarea bind:value={e.bemerkung} maxlength="500" rows="2"></textarea>
    </label>
  </details>

  <div class="aktionen">
    <button type="button" onclick={verwirfEntwurf} disabled={sendet}>Verwerfen</button>
    <label class="kamera" aria-busy={fotoArbeit} title="Foto aufnehmen">
      <input type="file" accept="image/*" capture="environment" aria-label="Foto aufnehmen" onchange={fotoGewaehlt} disabled={fotoArbeit} />
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
        ><path d="M4 7h3l2-3h6l2 3h3v13H4z" /><circle cx="12" cy="13" r="4" /></svg
      >
    </label>
    <button type="submit" class="primaer senden" disabled={sendet || fotoArbeit || !ort}>{sendet ? 'Sende …' : 'Senden'}</button>
  </div>
</form>

<style>
  .formular {
    display: grid;
    gap: 14px;
  }
  .ort {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 6px 8px;
    background: var(--bg);
    border-radius: var(--radius);
  }
  .sym {
    display: grid;
    place-items: center;
    min-width: 44px;
  }
  .ort-text {
    flex: 1;
    min-width: 0;
    display: grid;
    line-height: 1.25;
  }
  .ort-text .mono {
    font-size: 0.92rem;
    overflow-wrap: anywhere;
  }
  .ort-text .leise {
    font-size: 0.78rem;
  }
  .ort button {
    flex: none;
  }
  .eigene {
    margin-top: -8px;
    justify-self: start;
    border: 0;
    background: transparent;
    color: var(--accent);
    padding: 0 4px;
  }
  .foto img {
    display: block;
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    background: var(--bg);
    border-radius: var(--radius);
    margin-bottom: 6px;
  }
  .foto button {
    width: 100%;
  }
  .seite {
    margin-top: -6px;
  }
  .seite button {
    min-height: 40px;
    font-size: 0.85rem;
  }
  .richtung {
    margin-top: -6px;
  }
  .richtung button {
    min-width: var(--touch);
    padding: 0 8px;
    font-family: var(--mono);
  }
  .freitext {
    display: grid;
    gap: 10px;
  }
  .freitext summary {
    display: flex;
    align-items: center;
    min-height: var(--touch);
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }
  .freitext summary::-webkit-details-marker {
    display: none;
  }
  .freitext[open] summary {
    margin-bottom: 8px;
  }
  .freitext label + label {
    margin-top: 10px;
  }
  .aktionen {
    position: sticky;
    bottom: -16px; /* bis an den Rand des Sheets (Innenabstand) */
    display: flex;
    gap: 8px;
    padding: 8px 0 16px;
    background: var(--surface-glas);
  }
  .aktionen > * {
    min-height: var(--haupt);
  }
  .senden {
    flex: 1;
    font-size: 1.05rem;
  }
  .kamera {
    flex: none;
    width: var(--haupt);
    display: grid;
    place-items: center;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    color: var(--accent);
    cursor: pointer;
  }
  .kamera[aria-busy='true'] {
    opacity: 0.5;
  }
  .kamera input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .kamera:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
