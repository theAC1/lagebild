<script lang="ts">
  // Zweistufiges Auslösen: Art wählen, dann 2 s gedrückt halten (Ring füllt sich). Loslassen bricht ab.
  import { store } from '../../lib/store.svelte.ts';
  import { schliesse } from '../../lib/ui.svelte.ts';
  import type { PanelProps } from '../registry.ts';
  import { ausloesen } from './aktionen.ts';
  import { ARTEN, type AlarmArt } from './logik.ts';

  let {}: PanelProps = $props();

  const HALTEN_MS = 2000;
  const UMFANG = 2 * Math.PI * 52;

  let art = $state<AlarmArt | null>(null);
  let halten = $state(false);

  function los() {
    if (art && ausloesen(art)) schliesse();
    halten = false;
  }
</script>

{#if !art}
  <p class="leise">Art wählen – danach zum Auslösen 2 Sekunden gedrückt halten.</p>
  <div class="arten">
    {#each Object.entries(ARTEN) as [id, a] (id)}
      <button class="art {id}" onclick={() => (art = id as AlarmArt)}>{a.label}</button>
    {/each}
  </div>
{:else}
  <p class="hinweis">
    <strong>{ARTEN[art].label}</strong> – Knopf <strong>2 Sekunden</strong> gedrückt halten.
    {#if store.meinAlarmAktiv}<br /><span class="leise">Dein aktiver Alarm wird ersetzt.</span>{/if}
    {#if !store.meinePos}<br /><span class="leise">Kein GPS – Alarm geht ohne Position raus.</span>{/if}
  </p>
  <div class="halten-wrap">
    <button
      class="halten {art}"
      class:aktiv={halten}
      style:--dauer="{HALTEN_MS}ms"
      aria-label="{ARTEN[art].label} auslösen: 2 Sekunden gedrückt halten"
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
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" class="spur" />
        {#if halten}
          <circle cx="60" cy="60" r="52" class="fortschritt" style:--umfang={UMFANG} onanimationend={los} />
        {/if}
      </svg>
      <span>{halten ? 'HALTEN …' : 'ALARM'}</span>
    </button>
  </div>
  <button class="zurueck" onclick={() => ((art = null), (halten = false))}>Andere Art wählen</button>
{/if}

<style>
  p {
    margin: 0 0 12px;
  }
  .arten {
    display: grid;
    gap: 10px;
  }
  .art {
    min-height: 64px;
    font-size: 1.15rem;
    font-weight: 700;
    color: #fff;
    border: 0;
  }
  .notfall {
    background: #a3271a;
  }
  .kontakt {
    background: #8f3d0c;
  }
  .hinweis {
    text-align: center;
  }
  .halten-wrap {
    display: grid;
    place-items: center;
    padding: 8px 0 16px;
  }
  .halten {
    position: relative;
    width: 160px;
    height: 160px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: #fff;
    font-size: 1.3rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    touch-action: none;
  }
  .halten.aktiv {
    filter: brightness(1.25);
  }
  svg {
    position: absolute;
    inset: 0;
    rotate: -90deg;
  }
  circle {
    fill: none;
    stroke-width: 10;
  }
  .spur {
    stroke: rgb(255 255 255 / 0.25);
  }
  .fortschritt {
    stroke: #fff;
    stroke-linecap: round;
    stroke-dasharray: var(--umfang);
    animation: fuellen var(--dauer) linear forwards;
  }
  .halten span {
    position: relative;
  }
  .zurueck {
    width: 100%;
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
