<script lang="ts" module>
  import { MARKER_STANDARD_SIDC } from './logik.ts';
  /** Zuletzt für einen neuen Marker gewähltes Zeichen (nur diese Sitzung). */
  const letztesZeichen = { sidc: MARKER_STANDARD_SIDC };
</script>

<script lang="ts">
  import type { Marker, Punkt } from '../../../../shared/protocol.ts';
  import { formatLv95, formatMgrs } from '../../lib/coords.ts';
  import SymbolPicker from '../../lib/SymbolPicker.svelte';
  import { send } from '../../lib/store.svelte.ts';
  import { oeffne, schliesse, toast, waehle } from '../../lib/ui.svelte.ts';
  import { setzenNachricht } from './logik.ts';

  /** Entweder bestehender Marker (bearbeiten) oder Punkt (neu). */
  let { alt, punkt }: { alt?: Marker; punkt: Punkt } = $props();

  // Startwerte einmalig aus den Props; Panel setzt bei neuen Params einen {#key}.
  const start = (() => alt)();
  let sidc = $state(start?.sidc ?? letztesZeichen.sidc);
  let bezeichnung = $state(start?.bezeichnung ?? '');
  let notiz = $state(start?.notiz ?? '');

  function speichern(ev: SubmitEvent) {
    ev.preventDefault();
    if (!send(setzenNachricht({ id: alt?.id, sidc, lat: punkt.lat, lon: punkt.lon, bezeichnung, notiz })))
      return toast('Keine Verbindung – Marker nicht gespeichert.');
    if (!alt) letztesZeichen.sidc = sidc; // Serien (z.B. mehrere Feindmarker) ohne erneute Symbolwahl
    toast(alt ? 'Marker geändert' : 'Marker gesetzt');
    if (alt) waehle('marker', alt.id);
    else schliesse();
  }

  function abbrechen() {
    if (alt) waehle('marker', alt.id);
    else oeffne('marker');
  }
</script>

<form class="formular" onsubmit={speichern}>
  <div class="ort leise mono">{formatLv95(punkt)} · {formatMgrs(punkt)}</div>
  <SymbolPicker value={sidc} onchange={(s) => (sidc = s)} />
  <label class="feld">
    Bezeichnung
    <input bind:value={bezeichnung} maxlength="60" placeholder="z.B. Sperre Nord" enterkeyhint="next" />
  </label>
  <label class="feld">
    Notiz
    <textarea bind:value={notiz} maxlength="500" rows="3" placeholder="Beobachtung, Auftrag …"></textarea>
  </label>
  <div class="knoepfe">
    <button type="button" onclick={abbrechen}>Abbrechen</button>
    <button type="submit" class="primaer">{alt ? 'Speichern' : 'Marker setzen'}</button>
  </div>
</form>

<style>
  .formular {
    display: grid;
    gap: 12px;
  }
  .ort {
    font-size: 0.8rem;
  }
  textarea {
    resize: vertical;
  }
  .knoepfe {
    position: sticky;
    bottom: -16px;
    display: flex;
    gap: 8px;
    padding: 8px 0;
    background: var(--surface-glas);
  }
  .knoepfe button {
    flex: 1;
  }
</style>
