<script lang="ts">
  // Pulsierender Ring je aktivem Alarm + globales Banner + Ton/Vibration bis zur Quittierung.
  import { Marker } from 'maplibre-gl';
  import { onDestroy } from 'svelte';
  import { azimut, distanz, formatDistanz } from '../../lib/coords.ts';
  import { getMap, zentriere } from '../../lib/map.ts';
  import { formatAlter, serverJetzt, store } from '../../lib/store.svelte.ts';
  import { waehle } from '../../lib/ui.svelte.ts';
  import { ortVon, quittiere, rufname } from './aktionen.ts';
  import { aktive, ARTEN, offeneFuer } from './logik.ts';
  import { formatGrad } from '../rangebearing/logik.ts';
  import { alarmSignal } from './signal.ts';

  const WIEDERHOLEN_MS = 10_000;
  const m = getMap();
  const ringe = new Map<string, Marker>();

  const liste = $derived(aktive(store.alarme.values()));
  const offen = $derived(new Set(offeneFuer(store.alarme.values(), store.ich).map((a) => a.id)));

  // Ringe: folgen dem Auslöser
  $effect(() => {
    const gesehen = new Set<string>();
    for (const a of liste) {
      const p = ortVon(a);
      if (!p) continue;
      gesehen.add(a.id);
      let r = ringe.get(a.id);
      if (!r) {
        const el = document.createElement('div');
        el.className = `alarm-ring ${a.art}`;
        el.setAttribute('aria-label', `${ARTEN[a.art].label}: ${rufname(a.von)}`);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          waehle('alarm', a.id);
        });
        r = new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m);
        ringe.set(a.id, r);
      } else r.setLngLat([p.lon, p.lat]);
    }
    for (const [id, r] of ringe) {
      if (gesehen.has(id)) continue;
      r.remove();
      ringe.delete(id);
    }
  });

  // Ton + Vibration: sofort bei neuem offenem Alarm, dann alle 10 s, bis alle quittiert/aufgehoben sind
  let gemeldet = new Set<string>();
  $effect(() => {
    const ids = [...offen];
    const neu = ids.some((id) => !gemeldet.has(id));
    gemeldet = new Set(ids);
    if (!ids.length) return;
    if (neu) alarmSignal();
    const iv = setInterval(alarmSignal, WIEDERHOLEN_MS);
    return () => clearInterval(iv);
  });

  function richtung(a: (typeof liste)[number]): string {
    const ziel = ortVon(a);
    if (!ziel) return 'Ort unbekannt';
    if (a.von === store.ich || !store.meinePos) return '';
    return `${formatDistanz(distanz(store.meinePos, ziel))} · ${formatGrad(azimut(store.meinePos, ziel))}`;
  }

  // Höhe des Banners als --banner-h: schwebende Knöpfe, Kompass und Toasts rücken darunter statt verdeckt zu werden
  let bannerHoehe = $state(0);
  $effect(() => {
    const h = liste.length ? bannerHoehe : 0;
    document.documentElement.style.setProperty('--banner-h', h ? `${h + 6}px` : '0px');
  });

  onDestroy(() => {
    for (const r of ringe.values()) r.remove();
    ringe.clear();
    document.documentElement.style.removeProperty('--banner-h');
  });
</script>

{#if liste.length}
  <div class="banner" role="alert" bind:offsetHeight={bannerHoehe}>
    {#each liste as a (a.id)}
      {@const mein = a.von === store.ich}
      {@const p = ortVon(a)}
      <div class="alarm {a.art}" class:ruhig={!offen.has(a.id) && !mein}>
        <button class="text" onclick={() => waehle('alarm', a.id)}>
          <strong>{mein ? `DEIN ALARM · ${ARTEN[a.art].label}` : `${ARTEN[a.art].kurz} · ${rufname(a.von)}`}</strong>
          <span class="mono">
            {[formatAlter(Math.max(0, serverJetzt() - a.t)), richtung(a), `${a.quittiertVon.length} quittiert`].filter(Boolean).join(' · ')}
          </span>
        </button>
        {#if offen.has(a.id)}
          <button class="quitt" onclick={() => quittiere(a.id)}>Quittieren</button>
        {/if}
        <button class="icon" aria-label="Zentrieren" disabled={!p} onclick={() => p && zentriere(p, 16)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    top: calc(var(--oben) + 6px);
    left: 8px;
    right: 8px;
    z-index: 30;
    display: grid;
    gap: 6px;
    max-height: 40dvh;
    overflow-y: auto;
  }
  @media (min-width: 640px) {
    .banner {
      left: 50%;
      right: auto;
      width: 520px;
      transform: translateX(-50%);
    }
  }
  /* Querformat: rechtsbündig, links bleibt Platz für das Ebenen-Menü */
  @media (min-width: 640px) and (max-height: 500px) {
    .banner {
      left: auto;
      right: 8px;
      width: min(520px, calc(100vw - 300px));
      transform: none;
    }
  }
  .alarm {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 0;
    border-radius: var(--radius);
    background: #a3271a;
    color: #fff;
    border: 2px solid #ff8a78;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.5);
  }
  .alarm.kontakt {
    background: #8f3d0c;
    border-color: #ffb27a;
  }
  .alarm.ruhig {
    background: rgb(31 38 43 / 0.95);
    border-color: var(--danger);
  }
  .alarm button {
    border: 0;
    background: transparent;
    color: inherit;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
    text-align: left;
    padding: 4px 12px;
    line-height: 1.25;
  }
  .text strong {
    /* umbrechen statt abschneiden: der Rufname (wer braucht Hilfe?) steht hinten */
    overflow-wrap: anywhere;
  }
  .text span {
    /* darf umbrechen: Distanz und Quittierungen sind auf dem Handy sonst abgeschnitten */
    overflow-wrap: anywhere;
    font-size: 0.82rem;
    opacity: 0.92;
  }
  .alarm .quitt {
    background: #fff;
    color: #a3271a;
    font-weight: 700;
    padding: 0 12px;
  }
  :global(.alarm-ring) {
    --farbe: #e2553f;
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 3px solid var(--farbe);
    background: rgb(226 85 63 / 0.22);
    cursor: pointer;
  }
  :global(.alarm-ring.kontakt) {
    --farbe: #f08a3c;
  }
  :global(.alarm-ring::after) {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 4px solid var(--farbe);
    animation: alarm-puls 1.4s ease-out infinite;
  }
  @keyframes -global-alarm-puls {
    from {
      scale: 1;
      opacity: 0.9;
    }
    to {
      scale: 2.6;
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.alarm-ring::after) {
      animation: none;
    }
  }
</style>
