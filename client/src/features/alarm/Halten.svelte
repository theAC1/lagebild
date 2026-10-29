<script lang="ts">
  // Daumen-Ränder: Alarm 1,5 s gedrückt halten (Ring füllt sich), danach Notfall oder Feindkontakt wählen.
  // Vorzeitiges Loslassen bricht ab; so löst ein Streifen mit dem Daumen nie aus.
  import { store } from '../../lib/store.svelte.ts';
  import { ausloesen } from './aktionen.ts';
  import { ARTEN, type AlarmArt } from './logik.ts';

  const HALTEN_MS = 1500;
  const UMFANG = 2 * Math.PI * 27;

  let halten = $state(false);
  let wahl = $state(false);

  function gehalten() {
    halten = false;
    wahl = true;
    navigator.vibrate?.(60); // spürbar: jetzt wählen
  }

  function los(art: AlarmArt) {
    wahl = false;
    ausloesen(art);
  }

  function taste(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !wahl) return;
    wahl = false;
    e.preventDefault();
  }
</script>

<svelte:window onkeydowncapture={taste} />

<button
  class="alarm-halten"
  class:aktiv={halten}
  style:--dauer="{HALTEN_MS}ms"
  aria-label="Alarm: 1,5 Sekunden gedrückt halten"
  onpointerdown={(e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    halten = true;
  }}
  onpointerup={() => (halten = false)}
  onpointercancel={() => (halten = false)}
  onkeydown={(e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      halten = true;
    }
  }}
  onkeyup={() => (halten = false)}
  oncontextmenu={(e) => e.preventDefault()}
>
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="27" class="spur" />
    {#if halten}
      <circle cx="32" cy="32" r="27" class="fortschritt" style:--umfang={UMFANG} onanimationend={gehalten} />
    {/if}
  </svg>
  <span>{halten ? 'HALTEN' : 'ALARM'}</span>
</button>

{#if wahl}
  <div class="hintergrund" aria-hidden="true" onclick={() => (wahl = false)}></div>
  <div class="wahl" role="dialog" aria-label="Alarm auslösen">
    <div class="titel">Alarm auslösen</div>
    {#each Object.entries(ARTEN) as [id, a] (id)}
      <button class="art {id}" onclick={() => los(id as AlarmArt)}>{a.label}</button>
    {/each}
    {#if store.meinAlarmAktiv}<p class="leise">Dein aktiver Alarm wird ersetzt.</p>{/if}
    {#if !store.meinePos}<p class="leise">Kein GPS – Alarm geht ohne Position raus.</p>{/if}
    <button onclick={() => (wahl = false)}>Abbrechen</button>
  </div>
{/if}

<style>
  .alarm-halten {
    position: relative;
    flex: none;
    width: 68px;
    height: 68px;
    min-height: 0;
    align-self: center;
    padding: 0;
    border: 2px solid var(--alarm-rand);
    border-radius: 50%;
    background: var(--alarm);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    box-shadow: var(--schatten);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
  }
  .alarm-halten.aktiv {
    filter: brightness(1.25);
  }
  svg {
    position: absolute;
    inset: -2px;
    rotate: -90deg;
  }
  circle {
    fill: none;
    stroke-width: 5;
  }
  .spur {
    stroke: rgb(255 255 255 / 0.22);
  }
  .fortschritt {
    stroke: #fff;
    stroke-linecap: round;
    stroke-dasharray: var(--umfang);
    animation: fuellen var(--dauer) linear forwards;
  }
  .alarm-halten span {
    position: relative;
  }
  .hintergrund {
    position: fixed;
    inset: 0;
    z-index: 31;
    background: rgb(0 0 0 / 0.45);
  }
  .wahl {
    position: fixed;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    z-index: 32;
    width: min(360px, calc(100vw - 32px));
    display: grid;
    gap: 10px;
    padding: 14px;
    background: var(--surface);
    border: 2px solid var(--danger);
    border-radius: 16px;
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
  }
  .titel {
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--danger);
  }
  .art {
    min-height: 64px;
    border: 0;
    color: #fff;
    font-size: 1.15rem;
    font-weight: 800;
  }
  .notfall {
    background: #a3271a;
  }
  .kontakt {
    background: #8f3d0c;
  }
  p {
    margin: 0;
  }
  @keyframes fuellen {
    from {
      stroke-dashoffset: var(--umfang);
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
