<script lang="ts">
  import { PROTOKOLL_VERSION, staleNachFuer } from '../../../shared/protocol.ts';
  import { KOORD_FORMATE } from '../lib/coords.ts';
  import { BEDIENGROESSEN } from '../lib/groesse.svelte.ts';
  import { aktualisiereHintergrund, aktualisiereWachhalten, setzeSendetPos } from '../lib/position.svelte.ts';
  import { abmelden, setzeEinstellung, store, type Einstellungen } from '../lib/store.svelte.ts';
  import { istApp } from '../lib/umgebung.ts';

  const INTERVALLE: Einstellungen['intervallS'][] = [5, 10, 30];
  const AUSRICHTUNGEN: { id: Einstellungen['ausrichtung']; label: string }[] = [
    { id: 'auto', label: 'Automatisch' },
    { id: 'hoch', label: 'Hoch' },
    { id: 'quer', label: 'Quer' },
  ];
  const BEDIENUNGEN: { id: Einstellungen['bedienung']; label: string }[] = [
    { id: 'daumen', label: 'Daumen-Ränder' },
    { id: 'klassisch', label: 'Klassisch' },
  ];
  const staleS = $derived(staleNachFuer(store.einstellungen.intervallS * 1000) / 1000);
  let verlassenFragen = $state(false);

  function hintergrund(an: boolean) {
    setzeEinstellung('hintergrund', an);
    aktualisiereHintergrund();
  }

  function wachhalten(an: boolean) {
    setzeEinstellung('wachhalten', an);
    aktualisiereWachhalten();
  }
</script>

<div class="gruppen">
  <div>
    <div class="titel">Bediengrösse</div>
    <div class="segmente" role="group" aria-label="Bediengrösse">
      {#each BEDIENGROESSEN as g (g.id)}
        <button aria-pressed={store.einstellungen.groesse === g.id} onclick={() => setzeEinstellung('groesse', g.id)}>{g.label}</button>
      {/each}
    </div>
    <p class="leise">Knöpfe, Schrift und Kartenzeichen. Wird pro Gerät gemerkt.</p>
  </div>

  <div>
    <div class="titel">Bedienung</div>
    <div class="segmente" role="group" aria-label="Bedienung">
      {#each BEDIENUNGEN as b (b.id)}
        <button aria-pressed={store.einstellungen.bedienung === b.id} onclick={() => setzeEinstellung('bedienung', b.id)}>{b.label}</button>
      {/each}
    </div>
    <p class="leise">Daumen-Ränder: Melden links, Karte rechts. Wird pro Gerät gemerkt.</p>
  </div>

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

  {#if istApp()}
    <label class="schalter">
      <span>
        <strong>Position im Hintergrund senden</strong>
        <span class="leise">Sendet auch bei gesperrtem Bildschirm oder anderer App. Zeigt dauerhaft die Benachrichtigung «Lagebild sendet Position» und braucht mehr Akku.</span>
      </span>
      <input type="checkbox" role="switch" checked={store.einstellungen.hintergrund} onchange={(e) => hintergrund(e.currentTarget.checked)} />
    </label>
  {/if}

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

  <div>
    <div class="titel">Über</div>
    <p class="leise">Stand {__WEB_CODE__ || 'Entwicklung'} · Protokoll {PROTOKOLL_VERSION}</p>
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
    grid-template-columns: minmax(0, 1fr);
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
    min-width: 0;
    hyphens: auto; /* «Koordinatenzeile» bei grosser Schrift */
    overflow-wrap: break-word;
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
