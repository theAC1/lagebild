<script lang="ts">
  // Bedienung «Daumen-Ränder» (Spec v3). Quer: links Melden (Status, Sichtung, unten Alarm), rechts oben die
  // Kartenknöpfe (Ebenen, Folgen, Nordung), rechts unten Marker, Chat, Mehr. Hoch: Dock unten, Alarm links darüber.
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
    <svg class="nadel" style:rotate="{-peilung}deg" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
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
    <span class="verbindung {store.verbindung}" role="status"><span class="lampe"></span>{VERBINDUNG[store.verbindung]}</span>
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
      {@render kartenKnoepfe()}
      <span class="luecke"></span>
      {#each RECHTS as id (id)}{@render knopf(id)}{/each}
      {@render mehrKnopf()}
    </aside>
    {#if koordLeiste}<footer class="fuss"><KoordLeiste /></footer>{/if}
  {:else}
    <div class="schwebend">{@render kartenKnoepfe()}</div>
    <div class="alarm-hoch">{@render knopf('alarm')}</div>
    <footer class="fuss">
      {#if koordLeiste}<KoordLeiste />{/if}
      <nav class="dock" aria-label="Hauptaktionen">
        {#each DOCK as id (id)}{@render knopf(id)}{/each}
        {@render mehrKnopf()}
      </nav>
    </footer>
  {/if}

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
  .kopf {
    position: fixed;
    top: 0;
    left: var(--rand-l);
    right: var(--rechts);
    z-index: 10;
    height: var(--oben);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: var(--safe-top) 4px 0 14px;
    background: var(--kopf-bg);
    border-bottom: 1px solid var(--line);
  }
  .lage {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .verbindung {
    flex: 1;
  }
  .tn {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: var(--text-2);
    font-weight: 700;
  }
  .tn .mono {
    color: var(--text);
    font-size: 1rem;
  }

  /* --- Querformat: zwei Ränder über die volle Höhe --- */
  .rand {
    position: fixed;
    top: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: calc(6px + var(--safe-top)) 6px calc(6px + var(--safe-bottom));
    background: var(--surface-glas);
  }
  .rand.links {
    left: 0;
    width: var(--rand-l);
    padding-left: calc(6px + env(safe-area-inset-left, 0px));
    border-right: 1px solid var(--line);
  }
  .rand.rechts {
    right: 0;
    width: var(--rechts);
    padding-right: calc(6px + env(safe-area-inset-right, 0px));
    border-left: 1px solid var(--line);
  }
  .rand :global(.rand-knopf) {
    flex: none;
    height: clamp(var(--haupt), 13dvh, 76px);
  }
  .rand-knopf.aktiv {
    color: var(--accent);
  }
  .luecke {
    flex: 1;
    min-height: 4px;
  }

  /* --- Kartenknöpfe (quer in der rechten Spalte, hoch schwebend rechts) --- */
  .karten-knopf {
    flex: none;
    width: 100%;
    min-width: var(--touch);
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
  .rand .karten-knopf {
    box-shadow: none;
  }
  .schwebend {
    position: fixed;
    right: 10px;
    top: calc(var(--oben) + 10px + var(--banner-h, 0px));
    z-index: 9;
    display: grid;
    gap: 8px;
  }

  /* --- Hochformat: Dock unten, Alarm links darüber --- */
  .fuss {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    padding-bottom: var(--safe-bottom);
    background: var(--surface-glas);
    border-top: 1px solid var(--line);
  }
  .dock {
    display: flex;
    gap: 6px;
    height: 76px;
    padding: 8px 8px 6px;
  }
  .dock > :global(*) {
    flex: 1 1 0;
    font-size: 0.6rem;
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
    .fuss {
      left: var(--links);
      right: var(--rechts);
      border-top: 0;
      background: transparent;
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
  .ebenen {
    top: calc(var(--oben) + 10px + var(--banner-h, 0px));
    right: 68px;
    width: min(260px, calc(100vw - 80px));
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
      top: calc(var(--oben) + 8px);
      right: calc(var(--rechts) + 8px);
    }
  }
</style>
