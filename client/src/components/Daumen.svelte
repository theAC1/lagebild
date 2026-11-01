<script lang="ts">
  // Bedienung «Daumen-Ränder» (Spec v3). Die Karte läuft randlos unter allem durch; Kopf, Knöpfe und Koordinaten
  // schweben darüber. Quer: links Status, Melden, unten Alarm; rechts oben die Kartenknöpfe (Ebenen, Folgen, Nordung)
  // als Reihe, rechts unten Chat, Mehr. Hoch: Dock unten (Status, Melden, Chat, Mehr), Alarm links darüber, Kartenknöpfe
  // rechts. In AN (ohne Status, Melden, Alarm) sitzt «Wiedergabe» an der Stelle von Status. «Melden» öffnet daneben die Wahl Sichtung/Marker (Rückmeldung 30.10.: der Unterschied war nicht klar).
  // Was ein Hauptknopf tut, bestimmt das Feature (Feature.haupt); wo er sitzt, steht hier.
  import { MediaQuery } from 'svelte/reactivity';
  import { features, zeigen, type Feature } from '../features/registry.ts';
  import { folgeMir, getMap, onMapReady } from '../lib/map.ts';
  import { store } from '../lib/store.svelte.ts';
  import { ikon, istOffen, oeffne, schliesse, ui } from '../lib/ui.svelte.ts';
  import EbenenListe from './EbenenListe.svelte';
  import KoordLeiste from './KoordLeiste.svelte';
  import PhaseSchild from './PhaseSchild.svelte';

  const MELDEN = ['sichtung', 'marker'];
  const VERBINDUNG = { verbunden: 'verbunden', verbinde: 'verbinde …', getrennt: 'getrennt' } as const;
  const IKON_TN = ikon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.2 2.6 3.5 6"/>');
  const IKON_MENUE = ikon('<path d="M4 6h16M4 12h16M4 18h16"/>');

  const quer = new MediaQuery('(orientation: landscape)', false);
  const sichtbar = $derived(features.filter((f) => zeigen(f, store.phase, store.ichSelbst?.rolle)));
  const haupt = $derived(new Map(sichtbar.filter((f) => f.haupt).map((f) => [f.id, f])));
  const mehr = $derived([
    ...sichtbar.filter((f) => f.Panel && !f.haupt).map((f) => ({ id: f.id, label: f.label, icon: f.icon })),
    { id: 'teilnehmer', label: 'Teilnehmende', icon: IKON_TN },
  ]);
  const koordLeiste = $derived(store.einstellungen.koordLeiste || !store.meinePos); // ohne Fix die einzige GPS-Anzeige

  const melden = $derived(MELDEN.map((id) => haupt.get(id)).filter((f) => !!f));

  let ebenenOffen = $state(false);
  let mehrOffen = $state(false);
  let meldenOffen = $state(false);
  let meldenKnopf = $state<HTMLElement>();
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

  const zu = () => (mehrOffen = ebenenOffen = meldenOffen = false);
  /** Ein Menü auf/zu, die anderen schliessen. */
  function umschalten(menu: 'mehr' | 'ebenen' | 'melden') {
    const war = { mehr: mehrOffen, ebenen: ebenenOffen, melden: meldenOffen }[menu];
    zu();
    if (menu === 'mehr') mehrOffen = !war;
    else if (menu === 'ebenen') ebenenOffen = !war;
    else meldenOffen = !war;
  }

  function druecke(f: Feature) {
    zu();
    if (istOffen(f.id)) schliesse(f.id);
    else if (f.haupt?.aktion) f.haupt.aktion();
    else oeffne(f.id);
  }

  function ausMehr(id: string) {
    mehrOffen = false;
    oeffne(id);
  }

  /** Kachel der Melden-Wahl: startet den Schnellablauf (Fadenkreuz), auch wenn das Panel schon offen ist. */
  function meldeMit(f: Feature) {
    zu();
    f.haupt?.aktion?.();
  }

  /** Melden-Wahl direkt neben den Knopf setzen: quer rechts daneben, hoch darüber; immer ganz im Fenster. */
  function nebenMelden(el: HTMLElement) {
    const k = meldenKnopf?.getBoundingClientRect();
    if (!k) return;
    const { width: b, height: h } = el.getBoundingClientRect();
    const rand = 8;
    const x = quer.current ? k.right + rand : k.left + k.width / 2 - b / 2;
    const y = quer.current ? k.top + k.height / 2 - h / 2 : k.top - rand - h;
    el.style.left = `${Math.max(rand, Math.min(x, innerWidth - rand - b))}px`;
    el.style.top = `${Math.max(rand, Math.min(y, innerHeight - rand - h))}px`;
  }

  // Esc schliesst zuerst die eigenen Menüs (Capture: vor dem Esc des Kerns in App)
  function taste(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !(mehrOffen || ebenenOffen || meldenOffen)) return;
    zu();
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
    onclick={() => umschalten('mehr')}
  >
    {@html ikon('<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>')}
    <span>Mehr</span>
  </button>
{/snippet}

<!-- Menü (Spec v7) statt Einstellungen: rechts unten, wo im Menü «Zurück zur Mission» sitzt -->
{#snippet menueKnopf()}
  <button class="rand-knopf" aria-label="Menü" onclick={() => (zu(), (ui.menue = true))}>{@html IKON_MENUE}<span>Menü</span></button>
{/snippet}

{#snippet meldenKnopfS()}
  {@const badge = melden.reduce((n, f) => n + (f.badge?.() ?? 0), 0)}
  <button
    bind:this={meldenKnopf}
    class="rand-knopf"
    class:aktiv={melden.some((f) => istOffen(f.id))}
    aria-label={badge ? `Melden (${badge} neu)` : 'Melden'}
    aria-haspopup="menu"
    aria-expanded={meldenOffen}
    onclick={() => umschalten('melden')}
  >
    {@html ikon('<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>')}
    <span>Melden</span>
    {#if badge > 0}<span class="badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>{/if}
  </button>
{/snippet}

{#snippet kartenKnoepfe()}
  <button
    class="karten-knopf"
    aria-label="Karte und Ebenen wählen"
    aria-expanded={ebenenOffen}
    onclick={() => umschalten('ebenen')}
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
    <PhaseSchild />
    <strong class="lage">{store.lage?.name ?? 'Lagebild'}</strong>
    <span class="verbindung {store.verbindung}" role="status"><span class="lampe"></span><span class="vtext">{VERBINDUNG[store.verbindung]}</span></span>
    {#each sichtbar.filter((f) => f.Kopf && !f.haupt) as f (f.id)}<f.Kopf />{/each}
    <button class="tn" aria-label="Teilnehmende ({store.teilnehmer.size})" onclick={() => oeffne('teilnehmer')}>
      {@html IKON_TN}<span class="mono">{store.teilnehmer.size}</span>
    </button>
  </header>

  {#if quer.current}
    <aside class="rand links" aria-label="Melden">
      {@render knopf('status')}
      {@render knopf('wiedergabe')}
      {#if melden.length}{@render meldenKnopfS()}{/if}
      <span class="luecke"></span>
      {@render knopf('alarm')}
    </aside>
    <aside class="rand rechts" aria-label="Karte">
      <span class="luecke"></span>
      {@render knopf('chat')}
      {@render mehrKnopf()}
      {@render menueKnopf()}
    </aside>
    {#if koordLeiste}<footer class="fuss"><KoordLeiste /></footer>{/if}
  {:else}
    <div class="alarm-hoch">{@render knopf('alarm')}</div>
    <footer class="fuss">
      {#if koordLeiste}<KoordLeiste />{/if}
      <nav class="dock" aria-label="Hauptaktionen">
        {@render knopf('status')}
        {@render knopf('wiedergabe')}
        {#if melden.length}{@render meldenKnopfS()}{/if}
        {@render knopf('chat')}
        {@render mehrKnopf()}
        {@render menueKnopf()}
      </nav>
    </footer>
  {/if}

  <div class="schwebend">{@render kartenKnoepfe()}</div>

  {#if ebenenOffen || mehrOffen || meldenOffen}
    <!-- Tippen daneben schliesst das Menü -->
    <div class="hintergrund" aria-hidden="true" onclick={zu}></div>
  {/if}
  {#if meldenOffen}
    <div class="pop melden-wahl" role="menu" aria-label="Melden" {@attach nebenMelden}>
      {#each melden as f (f.id)}
        <button class="kachel" role="menuitem" aria-current={istOffen(f.id) || undefined} onclick={() => meldeMit(f)}>
          {#if typeof f.icon === 'string'}{@html f.icon}{:else}<f.icon />{/if}
          <span>{f.label}</span>
        </button>
      {/each}
    </div>
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
    flex-shrink: 20; /* quer neben offenem Panel wurde «Übung Aare» zu «Übu…», während «ver…» blieb */
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
    /* min-height statt height: lange Wörter («Wiedergabe») trennen auf zwei Zeilen, der Knopf wächst mit, statt dass
       die Beschriftung über den Rand läuft */
    min-height: clamp(var(--haupt), 13dvh, 72px);
    box-shadow: var(--schatten);
    padding-inline: 0;
    font-size: 0.58rem; /* «MELDEN» passt in die schmale Spalte */
    letter-spacing: 0;
  }
  /* statt «WIEDERG…» (Ellipse aus app.css) trennen: «WIEDER-GABE» */
  .rand :global(.rand-knopf > span) {
    white-space: normal;
    hyphens: auto;
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
    grid-template-columns: minmax(0, 1fr); /* lange Koordinatenzeile (GPS-Fehler) schob das Dock über den Rand */
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
    /* waagrecht nicht mitwachsen: die Breite gehört den vier Knöpfen */
    gap: min(calc(6 * var(--u)), 6px);
    height: 70px;
    padding: 0 min(calc(8 * var(--u)), 8px) 8px;
  }
  .dock > :global(*) {
    flex: 1 1 0;
    box-shadow: var(--schatten);
    /* vier Knöpfe auf Handybreite: die Beschriftung wächst nur, solange «MELDEN» in den Knopf passt */
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
  /* Melden-Wahl: zwei grosse Kacheln nebeneinander, den Ort setzt nebenMelden() */
  .melden-wahl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    width: min(288px, calc(100vw - 16px));
  }
  .kachel {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 6px;
    min-height: min(104px, 40dvh);
    padding: 8px 4px;
    background: var(--bg);
    font-size: 1rem;
    font-weight: 700;
  }
  .kachel :global(.ikon) {
    width: 34px;
    height: 34px;
  }
  .kachel span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kachel[aria-current='true'] {
    border-color: var(--accent);
    color: var(--accent);
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
