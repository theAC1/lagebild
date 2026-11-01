<script lang="ts">
  // Unterseite einer Mission (Spec v7): öffnen, Meine Angaben (live, nur in der offenen), Position senden, verlassen.
  import { ROLLE_NAME } from '../../../../shared/regeln/rollen.ts';
  import type { MeineMission } from '../../lib/missionen.ts';
  import { setzeSendetPos } from '../../lib/position.svelte.ts';
  import { setzeProfil } from '../../lib/profil.svelte.ts';
  import { abmelden, ichAendern, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';

  let { mission, onoeffnen }: { mission: MeineMission; onoeffnen: (m: MeineMission) => void } = $props();

  const offen = $derived(mission.token === store.token);
  const ich = $derived(offen ? store.ichSelbst : null);
  let verlassenFragen = $state(false);

  /** Rufname bzw. Funktion in der offenen Mission ändern (für alle sofort); bleibt die Vorgabe fürs nächste Beitreten. */
  function aendere(feld: 'rufname' | 'funktion', e: Event & { currentTarget: HTMLInputElement }) {
    const wert = e.currentTarget.value.trim();
    if (!ich || wert === ich[feld]) return;
    if (feld === 'rufname' && !wert) {
      e.currentTarget.value = ich.rufname;
      return;
    }
    if (!ichAendern({ [feld]: wert })) return toast('Keine Verbindung – später erneut versuchen.');
    setzeProfil({ [feld]: wert });
  }
</script>

<div class="mission-seite">
  <div class="status">
    <span class="p-schild {mission.phase}">{mission.phase.toUpperCase()}</span>
    <span class="leise">{ROLLE_NAME[ich?.rolle ?? mission.rolle]} · {offen ? 'läuft' : 'geschlossen'}</span>
  </div>
  {#if !offen}
    <button class="primaer haupt" onclick={() => onoeffnen(mission)}>Mission öffnen</button>
  {/if}

  <!-- Meine Angaben: in der offenen Mission live änderbar (quer ohne Überschrift, damit «Verlassen» ins Panel passt) -->
  {#if ich}
    <div class="zwei" role="group" aria-label="Meine Angaben">
      <label class="feld">Rufname <input value={ich.rufname} maxlength="32" onchange={(e) => aendere('rufname', e)} /></label>
      <label class="feld">Funktion <input value={ich.funktion} maxlength="32" list="funktionen" onchange={(e) => aendere('funktion', e)} /></label>
    </div>
  {:else}
    <div>
      <h3 class="gruppe-titel">Meine Angaben</h3>
      <p>{mission.rufname}{mission.funktion ? ` · ${mission.funktion}` : ''}</p>
      <p class="leise klein">Änderbar, solange die Mission offen ist.</p>
    </div>
  {/if}

  {#if ich && !store.istBeobachter}
    <label class="schalter">
      <span><strong>Position senden</strong><span class="leise">Aus = Emission Control</span></span>
      <input type="checkbox" role="switch" checked={ich.sendetPos} onchange={(e) => setzeSendetPos(e.currentTarget.checked)} />
    </label>
  {/if}

  {#if verlassenFragen}
    <p>Mission wirklich verlassen? Zum Wiedereintritt brauchst du den Code.</p>
    <div class="zwei">
      <button onclick={() => (verlassenFragen = false)}>Abbrechen</button>
      <button class="gefahr" onclick={() => abmelden(undefined, mission.token)}>Verlassen</button>
    </div>
  {:else}
    <button class="gefahr" onclick={() => (verlassenFragen = true)}>Mission verlassen</button>
  {/if}
</div>

<style>
  .mission-seite {
    display: grid;
    gap: 8px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .haupt {
    min-height: var(--haupt);
  }
  p {
    margin: 0;
  }
  .klein {
    font-size: 0.8rem;
  }
  .zwei {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
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
    line-height: 1.25;
  }
  .schalter .leise {
    font-size: 0.8rem;
  }
  .schalter input {
    width: 52px;
    min-height: 0;
    height: 30px;
    flex: none;
    accent-color: var(--accent);
  }
</style>
