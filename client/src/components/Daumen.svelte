<script lang="ts">
  // Bedienung «Daumen-Ränder» (Spec v3). Die Karte läuft randlos unter allem durch; Kopf, Knöpfe und Koordinaten
  // schweben darüber. Quer: links Melden (Status, Sichtung, unten Alarm), rechts oben die Kartenknöpfe (Ebenen, Folgen,
  // Nordung) als Reihe, rechts unten Marker, Chat, Mehr. Hoch: Dock unten, Alarm links darüber, Kartenknöpfe rechts.
  // Was ein Hauptknopf tut, bestimmt das Feature (Feature.haupt); wo er sitzt, steht hier.
  import { MediaQuery } from 'svelte/reactivity';
  import { features, type Feature } from '../features/registry.ts';
    import { folgeMir, getMap, onMapReady } from '../lib/map.ts';
  import { store } from '../lib/store.svelte.ts';
  import { ikon, istOffen, oeffne, schliesse, ui } from '../lib/ui.svelte.ts';
  import EbenenListe from './EbenenListe.svelte';
  import KoordLeiste from './KoordLeiste.svelte';

  const LINKS = ['status', 'sichtung'];
  const RECHTS = ['marker', 'chat'];
  const DOCK = ['status', 'marker', 'sichtung', 'chat'];
  const VERBINDUNG = { verbunden: 'verbunden', verbinde: 'verbinde …', getrennt: 'getrennt' } as const;
  const IKON_TN = ikon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.2 2.6 3.5 6"/>');
  const IKON_EINST = ikon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>');

  const quer = new MediaQuery('(orientation: landscape)', false);
  const sichtbar = $derived(features.filter((f) => !f.nurLeitung || store.istLeitung));
  const haupt = $derived(new Map(sichtbar.filter((f) => f.haupt).map((f) => [f.id, f])));
  const mehr = $derived([
    ...sichtbar.filter((f) => f.Panel && !f.haupt).map((f) => ({ id: f.id, label: f.label, icon: f.icon })),
    { id: 'teilnehmer', label: 'Teilnehmende', icon: IKON_TN },
    { id: 'einstellungen', label: 'Einstellungen', icon: IKON_EINST },
  ]);
  const koordLeiste = $derived(store.einstellungen.koordLeiste || !store.meinePos); // ohne Fix die einzige GPS-Anzeige

  let ebenenOffen = $state(false);
  let mehrOffen = $state(false);
  let peilung = $state(0);

  $effect(() => {
    let ab = () => {};
    onMapReady((m) => {
      const neu = () => (peilung = m.getBearing());
      neu();
      m.on('rotate', neu);
      ab = () => void m.off('rotate', neu);
    });
    return () => ab();
  });

  function druecke(f: Feature) {
    mehrOffen = ebenenOffen = false;
    if (istOffen(f.id)) schliesse(f.id);
    else if (f.haupt?.aktion) f.haupt.aktion();
    else oeffne(f.id);
  }

  function ausMehr(id: string) {
    mehrOffen = false;
    oeffne(id);
  }

  // Esc schliesst zuerst die eigenen Menüs (Capture: vor dem Esc des Kerns in App)
  function taste(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !(mehrOffen || ebenenOffen)) return;
    mehrOffen = ebenenOffen = false;
    e.preventDefault();
  }
</script>

<svelte:window onkeydowncapture={taste} />

{#snippet knopf(id: string)}
  {@const f = haupt.get(id)}
  {@const Eigen = f?.haupt?.Knopf}
  {#if Eigen}
    <Eigen />
  {:else if f}
    {@const badge = f.badge?.() ?? 0}
    <button class="rand-knopf" aria-label={badge ? `${f.label} (${badge} ungelesen)` : f.label} aria-pressed={istOffen(f.id)} onclick={() => druecke(f)}>
      {#if typeof f.icon === 'string'}{@html f.icon}{:else}<f.icon />{/if}
      <span>{f.label}</span>
      {#if badge > 0}<span class="badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>{/if}
    </button>
  {/if}
{/snippet}

{#snippet mehrKnopf()}
  <button
    class="rand-knopf"
    class:aktiv={mehr.some((m) => istOffen(m.id))}
    aria-label="Mehr"
    aria-expanded={mehrOffen}
    onclick={() => {
      ebenenOffen = false;
      mehrOffen = !mehrOffen;
    }}
  >
    {@html ikon('<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>')}
    <span>Mehr</span>
  </button>
{/snippet}

{#snippet kartenKnoepfe()}
  <button
    class="karten-knopf"
    aria-label="Karte und Ebenen wählen"
    aria-expanded={ebenenOffen}
    onclick={() => {
      mehrOffen = false;
      ebenenOffen = !ebenenOffen;
    }}
  >
    {@html ikon('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>')}
  </button>
  <button class="karten-knopf" aria-label="Eigener Position folgen" aria-pressed={ui.folgen} onclick={folgeMir}>
    {@html ikon('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>')}
  </button>
  <button class="karten-knopf" class:gedreht={Math.abs(peilung) > 0.5} aria-label="Karte nach Norden ausrichten" onclick={() => getMap().resetNorth()}>
    <svg class="nadel" style:rotate="{-peilung}deg" viewBox="0 0 24 24" width="26" height="26" style="width: calc(26 * var(--u)); height: calc(26 * var(--u))" aria-hidden="true">
      <path d="M12 2.5l4 9.5h-8z" fill="var(--danger)" />
      <path d="M12 21.5l-4-9.5h8z" fill="currentColor" opacity="0.55" />
      <text x="12" y="10.6" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">N</text>
    </svg>
  </button>
  {#each sichtbar.filter((f) => f.Toolbar && !f.haupt) as f (f.id)}<f.Toolbar />{/each}
{/snippet}

<div class="daumen">
  <header class="kopf">
    <strong class="lage">{store.lage?.name ?? 'Lagebild'}</strong>
    <span class="verbindung {store.verbindung}" role="status"><span class="lampe"></span><span class="vtext">{VERBINDUNG[store.verbindung]}</span></span>
    {#each sichtbar.filter((f) => f.Kopf && !f.haupt) as f (f.id)}<f.Kopf />{/each}
    <button class="tn" aria-label="Teilnehmende ({store.teilnehmer.size})" onclick={() => oeffne('teilnehmer')}>
      {@html IKON_TN}<span class="mono">{store.teilnehmer.size}</span>
    </button>
  </header>

  {#if quer.current}
    <aside class="rand links" aria-label="Melden">
      {#each LINKS as id (id)}{@render knopf(id)}{/each}
      <span class="luecke"></span>
      {@render knopf('alarm')}
    </aside>
    <aside class="rand rechts" aria-label="Karte">
      <span class="luecke"></span>
      {#each RECHTS as id (id)}{@render knopf(id)}{/each}
      {@render mehrKnopf()}
    </aside>
    {#if koordLeiste}<footer class="fuss"><KoordLeiste /></footer>{/if}
  {:else}
    <div class="alarm-hoch">{@render knopf('alarm')}</div>
    <footer class="fuss">
      {#if koordLeiste}<KoordLeiste />{/if}
      <nav class="dock" aria-label="Hauptaktionen">
        {#each DOCK as id (id)}{@render knopf(id)}{/each}
        {@render mehrKnopf()}
      </nav>
    </footer>
  {/if}

  <div class="schwebend">{@render kartenKnoepfe()}</div>

  {#if ebenenOffen || mehrOffen}
    <!-- Tippen daneben schliesst das Menü -->
    <div class="hintergrund" aria-hidden="true" onclick={() => (mehrOffen = ebenenOffen = false)}></div>
  {/if}
  {#if ebenenOffen}
    <div class="pop ebenen" role="group" aria-label="Karte"><EbenenListe /></div>
  {/if}
  {#if mehrOffen}
    <div class="pop mehr" role="menu" aria-label="Mehr">
      {#each mehr as m (m.id)}
        <button class="eintrag" role="menuitem" aria-current={istOffen(m.id) || undefined} onclick={() => ausMehr(m.id)}>
          {#if typeof m.icon === 'string'}{@html m.icon}{:else}<m.icon />{/if}
          <span>{m.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .daumen {
    display: contents;
  }
  /* Alles hier schwebt über der randlosen Karte: Flächen mit Schatten statt Leisten über die ganze Breite */
  .kopf {
    position: fixed;
    top: calc(var(--safe-top) + 8px);
    left: calc(var(--links) + 8px);
    z-index: 10;
    max-width: calc(100vw - var(--links) - 16px);
    height: 50px; /* Teilnehmer-Knopf innen 48 px */
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 2px 0 14px;
    background: var(--kopf-bg);
    border: 1px solid var(--line);
    border-radius: 999px;
    box-shadow: var(--schatten);
  }
  .lage {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  /* bei grosser Schrift weicht zuerst «verbunden», die Lampe bleibt */
  .verbindung {
    min-width: 8px; /* die Lampe */
  }
  .vtext {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .tn {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 0;
    height: 100%;
    padding: 0 12px 0 6px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--text-2);
    font-weight: 700;
  }
  .tn .mono {
    color: var(--text);
    font-size: 1rem;
  }

  /* --- Querformat: zwei schmale Spalten schwebender Knöpfe, dazwischen und darunter die Karte --- */
  .rand {
    position: fixed;
    top: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: calc(8px + var(--safe-top)) 0 calc(8px + var(--safe-bottom));
    overflow-y: auto; /* Notnagel für sehr niedrige Fenster: Mehr bleibt erreichbar */
    scrollbar-width: none;
    pointer-events: none; /* die Karte zwischen den Knöpfen bleibt verschiebbar */
  }
  .rand > :global(*) {
    pointer-events: auto;
  }
  .rand.links {
    left: 0;
    width: var(--rand-l);
    padding-left: calc(8px + env(safe-area-inset-left, 0px));
  }
  .rand.rechts {
    right: 0;
    width: var(--rechts);
    padding-right: calc(8px + env(safe-area-inset-right, 0px));
  }
  .rand :global(.rand-knopf) {
    flex: none;
    height: clamp(var(--haupt), 13dvh, 72px);
    box-shadow: var(--schatten);
    padding-inline: 0;
    font-size: 0.58rem; /* «SICHTUNG» passt in die schmale Spalte */
    letter-spacing: 0;
  }
  .rand :global(.alarm-halten) {
    width: 64px;
    height: 64px;
  }
  .rand-knopf.aktiv {
    color: var(--accent);
  }
  .luecke {
    flex: 1;
    min-height: 4px;
    pointer-events: none;
  }

  /* --- Kartenknöpfe: hoch eine Spalte rechts unter dem Kopf, quer eine Reihe rechts oben --- */
  .karten-knopf {
    flex: none;
    width: var(--touch);
    height: var(--touch);
    padding: 0;
    display: grid;
    place-items: center;
    background: var(--surface);
    box-shadow: var(--schatten);
  }
  .karten-knopf[aria-pressed='true'],
  .karten-knopf[aria-expanded='true'] {
    color: var(--accent);
    border-color: var(--accent);
  }
  .nadel {
    transition: rotate 0.2s;
  }
  .karten-knopf:not(.gedreht) .nadel {
    opacity: 0.75;
  }
  .schwebend {
    position: fixed;
    right: 8px;
    top: calc(var(--oben) + 8px + var(--banner-h, 0px));
    z-index: 9;
    display: grid;
    gap: 8px;
  }
  @media (orientation: landscape) {
    .schwebend {
      top: calc(var(--safe-top) + 8px);
      right: calc(8px + env(safe-area-inset-right, 0px));
      grid-auto-flow: column;
    }
  }

  /* --- Fuss: Koordinaten als Pille, hoch darunter das Dock --- */
  .fuss {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: grid;
    justify-items: center;
    gap: 6px;
    padding-bottom: var(--safe-bottom);
    pointer-events: none;
  }
  .fuss > :global(*) {
    pointer-events: auto;
  }
  .fuss :global(.leiste) {
    width: auto;
    max-width: calc(100% - 16px);
    min-height: 36px;
    border: 1px solid var(--line);
    border-radius: 999px;
    box-shadow: var(--schatten);
  }
  .dock {
    width: 100%;
    display: flex;
    /* waagrecht nicht mitwachsen: die Breite gehört den fünf Knöpfen */
    gap: min(calc(6 * var(--u)), 6px);
    height: 70px;
    padding: 0 min(calc(8 * var(--u)), 8px) 8px;
  }
  .dock > :global(*) {
    flex: 1 1 0;
    box-shadow: var(--schatten);
    /* fünf Knöpfe auf Handybreite: die Beschriftung wächst nur, solange «SICHTUNG» in den Knopf passt */
    font-size: min(0.6rem, 2.5vw);
    letter-spacing: 0.02em;
  }
  .alarm-hoch {
    position: fixed;
    left: 10px;
    bottom: calc(var(--unten) + 14px);
    z-index: 11;
  }
  /* offenes Sheet oder Fadenkreuz-Leiste deckt den Platz über dem Dock: Alarm wandert über die Karte nach oben */
  :global(:root:has(.panels > .sheet)) .alarm-hoch,
  :global(:root:has(.kreuz)) .alarm-hoch {
    bottom: auto;
    top: calc(var(--oben) + 10px + var(--banner-h, 0px));
    z-index: 21;
  }
  @media (orientation: landscape) {
    .kopf {
      /* nicht unter die Reihe der Kartenknöpfe rechts oben */
      max-width: calc(100vw - var(--links) - 3 * var(--touch) - 48px);
    }
    .fuss {
      left: var(--links);
      right: var(--rechts);
      padding-bottom: calc(8px + var(--safe-bottom));
    }
  }

  /* --- Menüs --- */
  .hintergrund {
    position: fixed;
    inset: 0;
    z-index: 21;
  }
  .pop {
    position: fixed;
    z-index: 22;
    display: grid;
    gap: 4px;
    padding: 6px;
    max-height: calc(100dvh - var(--oben) - var(--unten) - 16px);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
  }
  /* hoch links neben der Spalte der Kartenknöpfe, quer unter ihrer Reihe */
  .ebenen {
    top: calc(var(--oben) + 8px + var(--banner-h, 0px));
    right: calc(var(--touch) + 18px);
    width: min(260px, calc(100vw - var(--touch) - 28px));
  }
  .mehr {
    right: calc(var(--rechts) + 8px);
    bottom: calc(var(--unten) + 8px);
    width: min(420px, calc(100vw - var(--rechts) - 16px));
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .eintrag {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--haupt);
    padding: 0 12px;
    text-align: left;
    background: var(--bg);
    font-weight: 600;
  }
  .eintrag span {
    min-width: 0;
    font-size: 0.92rem;
    line-height: 1.15;
    hyphens: auto;
  }
  .eintrag[aria-current='true'] {
    border-color: var(--accent);
    color: var(--accent);
  }
  @media (orientation: landscape) {
    .ebenen {
      top: calc(var(--safe-top) + var(--touch) + 16px);
      right: calc(8px + env(safe-area-inset-right, 0px));
      width: min(260px, calc(100vw - var(--links) - 16px));
      max-height: calc(100dvh - var(--safe-top) - var(--touch) - var(--unten) - 24px);
    }
  }
</style>
