<script lang="ts">
  import { staleNachFuer } from '../../../shared/protocol.ts';
  import { KOORD_FORMATE } from '../lib/coords.ts';
  import { aktualisiereWachhalten, setzeSendetPos } from '../lib/position.svelte.ts';
  import { abmelden, setzeEinstellung, store, type Einstellungen } from '../lib/store.svelte.ts';

  const INTERVALLE: Einstellungen['intervallS'][] = [5, 10, 30];
  const AUSRICHTUNGEN: { id: Einstellungen['ausrichtung']; label: string }[] = [
    { id: 'auto', label: 'Automatisch' },
    { id: 'hoch', label: 'Hoch' },
    { id: 'quer', label: 'Quer' },
  ];
  const staleS = $derived(staleNachFuer(store.einstellungen.intervallS * 1000) / 1000);
  let verlassenFragen = $state(false);

  function wachhalten(an: boolean) {
    setzeEinstellung('wachhalten', an);
    aktualisiereWachhalten();
  }
</script>

<div class="gruppen">
  <label class="schalter">
    <span>
      <strong>Position senden</strong>
      <span class="leise">Aus = Emission Control: andere sehen dich nicht mehr live.</span>
    </span>
    <input
      type="checkbox"
      role="switch"
      checked={store.ichSelbst?.sendetPos ?? true}
      disabled={!store.ichSelbst}
      onchange={(e) => setzeSendetPos(e.currentTarget.checked)}
    />
  </label>

  <div>
    <div class="titel">Sendeintervall</div>
    <div class="segmente" role="group" aria-label="Sendeintervall">
      {#each INTERVALLE as s (s)}
        <button aria-pressed={store.einstellungen.intervallS === s} onclick={() => setzeEinstellung('intervallS', s)}>{s} s</button>
      {/each}
    </div>
    <p class="leise">
      Sofort gesendet wird bei mehr als 25 m Bewegung, Statuswechsel, Alarm und neuer Verbindung (höchstens 1× pro Sekunde).
      Andere sehen dich ausgegraut, wenn {staleS} s lang nichts kommt.
    </p>
  </div>

  <label class="schalter">
    <span>
      <strong>Dynamisch</strong>
      <span class="leise">Im Stillstand (unter 0.45 m/s) nur alle 30 s senden – spart Akku bei stehenden Posten.</span>
    </span>
    <input type="checkbox" role="switch" checked={store.einstellungen.dynamisch} onchange={(e) => setzeEinstellung('dynamisch', e.currentTarget.checked)} />
  </label>

  <label class="schalter">
    <span>
      <strong>Bildschirm anlassen</strong>
      <span class="leise">Browser liefern GPS nur, solange die App im Vordergrund und der Bildschirm an ist.</span>
    </span>
    <input type="checkbox" role="switch" checked={store.einstellungen.wachhalten} onchange={(e) => wachhalten(e.currentTarget.checked)} />
  </label>

  <div>
    <div class="titel">Koordinatenformat</div>
    <div class="segmente" role="group" aria-label="Koordinatenformat">
      {#each KOORD_FORMATE as f (f.id)}
        <button aria-pressed={store.einstellungen.koordFormat === f.id} onclick={() => setzeEinstellung('koordFormat', f.id)}>{f.label}</button>
      {/each}
    </div>
  </div>

  <label class="schalter">
    <span>
      <strong>Koordinatenzeile</strong>
      <span class="leise">Eigene Koordinate unten einblenden. Auch per Tippen aufs eigene Symbol.</span>
    </span>
    <input type="checkbox" role="switch" checked={store.einstellungen.koordLeiste} onchange={(e) => setzeEinstellung('koordLeiste', e.currentTarget.checked)} />
  </label>

  <div>
    <div class="titel">Ausrichtung</div>
    <div class="segmente" role="group" aria-label="Ausrichtung">
      {#each AUSRICHTUNGEN as a (a.id)}
        <button aria-pressed={store.einstellungen.ausrichtung === a.id} onclick={() => setzeEinstellung('ausrichtung', a.id)}>{a.label}</button>
      {/each}
    </div>
    <p class="leise">Fest sperren klappt nur in der installierten App auf Android; sonst erscheint ein Hinweis, das Gerät zu drehen.</p>
  </div>

  <div class="lage">
    <div class="leise">Lage</div>
    <strong>{store.lage?.name ?? '–'}</strong>
    {#if store.ichSelbst}<div class="leise">{store.ichSelbst.rufname} · {store.istLeitung ? 'Leitung' : 'Teilnehmer'}</div>{/if}
  </div>

  {#if verlassenFragen}
    <p>Lage wirklich verlassen? Zum Wiedereintritt brauchst du den Code.</p>
    <div class="zeile">
      <button onclick={() => (verlassenFragen = false)}>Abbrechen</button>
      <button class="gefahr" onclick={() => abmelden()}>Verlassen</button>
    </div>
  {:else}
    <button class="gefahr" onclick={() => (verlassenFragen = true)}>Lage verlassen</button>
  {/if}
</div>

<style>
  .gruppen {
    display: grid;
    gap: 18px;
  }
  .schalter {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch);
  }
  .schalter > span {
    display: grid;
  }
  .schalter input {
    width: 52px;
    min-height: 0;
    height: 30px;
    flex: none;
    accent-color: var(--accent);
  }
  .titel {
    font-weight: 600;
    margin-bottom: 6px;
  }
  p {
    margin: 6px 0 0;
  }
  .lage {
    padding: 12px;
    background: var(--bg);
    border-radius: var(--radius);
  }
  .zeile {
    display: flex;
    gap: 8px;
  }
  .zeile button {
    flex: 1;
  }
</style>
