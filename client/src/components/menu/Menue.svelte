<script module lang="ts">
  /** Das erste Menü der Sitzung ist der App-Start: die Karte springt zu den Fähnchen, statt dorthin zu fliegen. */
  let appStart = true;
</script>

<script lang="ts">
  // Menü (Spec v7, Layout V4 «Karte als Menü»): links die Menüspalte im Stil der Daumen-Ränder, rechts das Panel der Seite,
  // dazwischen die Karte mit den Missionen als Fähnchen. Ohne offene Mission die Startseite der App; in der Mission liegt
  // es darüber (Verbindung und Position laufen weiter), «Zurück zur Mission» sitzt rechts unten wie dort der Knopf «Menü».
  import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
  import { onMount, untrack } from 'svelte';
  import { ROLLE_NAME } from '../../../../shared/regeln/rollen.ts';
  import { onMapReady } from '../../lib/map.ts';
  import { auffaechern, faehnchenOrt, type MeineMission } from '../../lib/missionen.ts';
  import { oeffneMission, pruefeMissionen, store } from '../../lib/store.svelte.ts';
  import { ikon, ui } from '../../lib/ui.svelte.ts';
  import Einstellungen from '../Einstellungen.svelte';
  import Beitritt from './Beitritt.svelte';
  import { merkeStand, MISSIONS_RAND, zeigeAlle, zeigeMission, zurueckZurMission, type Rand } from './kamera.ts';
  import Mission from './Mission.svelte';
  import Profil from './Profil.svelte';
  import Ueber from './Ueber.svelte';

  type Seite = 'missionen' | 'beitreten' | 'neu' | 'profil' | 'einstellungen' | 'ueber' | 'mission';
  const EINTRAEGE: { id: Exclude<Seite, 'mission'>; label: string; kurz: string; icon: string }[] = [
    { id: 'missionen', label: 'Meine Missionen', kurz: 'Missionen', icon: ikon('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>') },
    { id: 'beitreten', label: 'Beitreten', kurz: 'Beitreten', icon: ikon('<path d="M14 4h5v16h-5"/><path d="M3 12h11"/><path d="M10 8l4 4-4 4"/>') },
    { id: 'neu', label: 'Neue Mission', kurz: 'Neu', icon: ikon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>') },
    { id: 'profil', label: 'Profil', kurz: 'Profil', icon: ikon('<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4.5 3.8-7 8-7s7.4 2.5 8 7"/>') },
    {
      id: 'einstellungen',
      label: 'Einstellungen',
      kurz: 'Einstel­lungen',
      icon: ikon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    },
    { id: 'ueber', label: 'Über', kurz: 'Über', icon: ikon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/>') },
  ];
  // ATAK-Rollen als Vorschlag (Bridge: Grfhr/Zfhr→Team Lead, KP→HQ, San→Medic, Funker→RTO, Schfs→Sniper, Beob→FO, Hundeführer→K9)
  const FUNKTIONS_VORSCHLAEGE = ['Sdt', 'Grfhr', 'Zfhr', 'Kdt', 'KP', 'San', 'Funker', 'Schfs', 'Beob', 'Hundeführer'];
  const IKON_ZURUECK = ikon('<path d="M15 5l-7 7 7 7"/>');
  const IKON_WEITER = ikon('<path d="M9 5l7 7-7 7"/>');

  const offen = $derived(store.missionen.find((m) => m.token === store.token));
  const code = new URLSearchParams(location.search).has('code');
  let seite = $state<Seite>(code || !store.missionen.length ? 'beitreten' : 'missionen');
  let gewaehlt = $state<string | null>(null);
  const mission = $derived(store.missionen.find((m) => m.lageId === gewaehlt));
  // Mission verschwunden (verlassen, gelöscht): zurück zur Liste
  $effect(() => {
    if (seite === 'mission' && !mission) untrack(() => (seite = 'missionen'));
  });
  const titel = $derived(seite === 'mission' ? (mission?.name ?? '') : EINTRAEGE.find((e) => e.id === seite)?.label);

  let spalte = $state<HTMLElement>();
  let panel = $state<HTMLElement>();
  let karte = $state<MapLibreMap>();

  /** Freie Karte zwischen Menüspalte und Panel (quer) bzw. über Panel und Dock (hoch), dazu Platz für die Fähnchen. */
  function rand(fahnen = false): Rand {
    const s = spalte!.getBoundingClientRect();
    const p = panel!.getBoundingClientRect();
    const quer = innerWidth > innerHeight;
    // hoch nur schmaler Rand: sonst zoomt die Karte so weit hinaus, dass maxBounds die Fähnchen hinter das Panel schiebt
    const f = fahnen ? { left: quer ? 80 : 16, right: quer ? 80 : 16, top: 50, bottom: 12 } : { left: 16, right: 16, top: 16, bottom: 16 };
    return quer
      ? { left: s.right + f.left, right: innerWidth - p.left + f.right, top: f.top, bottom: f.bottom }
      : { left: f.left, right: f.right, top: f.top, bottom: innerHeight - Math.min(p.top, s.top) + f.bottom };
  }

  /** Waagrechter Bereich der freien Karte, in dem die Fähnchen bleiben. */
  function freiX(): [number, number] {
    if (!spalte || !panel || innerWidth <= innerHeight) return [4, innerWidth - 4];
    return [spalte.getBoundingClientRect().right + 6, panel.getBoundingClientRect().left - 6];
  }

  /** Karte zur Seite: Meine Missionen (und der App-Start) zeigen alle Fähnchen, die Unterseite das Gebiet der Mission. */
  function zeigeSeite(dauer = 900, start = false) {
    const m = karte;
    if (!m) return;
    if (seite === 'missionen' || start) zeigeAlle(m, store.missionen.map(faehnchenOrt).filter((o) => o !== null), rand(true), dauer);
    else if (seite === 'mission' && mission) zeigeMission(m, mission, rand(), dauer);
  }

  function zu(s: Seite) {
    seite = s;
    zeigeSeite();
  }
  function waehle(lageId: string) {
    gewaehlt = lageId;
    zu('mission');
  }

  function oeffnen(x: MeineMission) {
    oeffneMission(x);
    if (karte) zeigeMission(karte, x, MISSIONS_RAND()); // ohne Stand (nie besucht) bleibt die Karte
  }

  onMount(() => {
    const start = appStart || !store.token; // App-Start bzw. keine Mission offen: alle Fähnchen, ohne Flug
    appStart = false;
    // Fadenkreuz, Ring und Koordinaten-Karte der Mission gehören nicht über das Menü
    ui.punktWahl?.fertig(null);
    ui.radial = ui.koordinate = null;
    if (store.token) merkeStand(); // Stand vom letzten Besuch, bevor die Kamera wegfliegt; «Zurück» fliegt dorthin
    void pruefeMissionen();
    let weg = false;
    onMapReady((m) => {
      if (weg) return;
      karte = m;
      zeigeSeite(start ? 0 : 900, start);
    });
    return () => (weg = true);
  });

  // --- Fähnchen: Marker je Mission mit Ort, Überlappende aufgefächert mit Leine zum echten Ort ---------------------------

  type Fahne = { x: MeineMission; ort: [number, number]; el: HTMLButtonElement; marker: Marker };
  let fahnen = $state<Fahne[]>([]);

  function fahnenElement(x: MeineMission): HTMLButtonElement {
    const el = document.createElement('button');
    el.className = 'm-pin';
    const schild = document.createElement('span');
    schild.className = `p-schild ${x.phase}`;
    schild.textContent = x.phase.toUpperCase();
    const name = document.createElement('span');
    name.className = 'm-name';
    name.textContent = x.name || 'Mission'; // Name vom Server: nur als Text
    const leine = document.createElement('span');
    leine.className = 'm-leine';
    el.append(schild, name, leine);
    el.setAttribute('aria-label', `Mission ${x.name}, ${x.phase.toUpperCase()}`);
    el.addEventListener('click', () => waehle(x.lageId));
    return el;
  }

  $effect(() => {
    const m = karte;
    if (!m) return;
    const liste = store.missionen.flatMap((x) => {
      const ort = faehnchenOrt(x);
      if (!ort) return [];
      const el = fahnenElement(x);
      el.classList.toggle('laeuft', x.token === untrack(() => store.token)); // schon beim ersten Legen, siehe 'nah'
      return [{ x, ort, el, marker: new Marker({ element: el, anchor: 'bottom' }).setLngLat(ort).addTo(m) }];
    });
    const c = m.getContainer();
    const legen = () => {
      // Zoomstufen: weit blendet die Zeichen der offenen Mission aus (sie überdecken sonst die Fähnchen), nah das Fähnchen der
      // offenen Mission selbst (es überdeckt dort das eigene Symbol und das Zielobjekt). Über 13, weil die Übersicht höchstens 13 zeigt.
      c.classList.toggle('weit', m.getZoom() < 11);
      c.classList.toggle('nah', m.getZoom() > 13);
      const frei = freiX();
      // zwei Fähnchen passen immer nebeneinander in die freie Karte (Sehr gross auf schmalem Handy)
      c.style.setProperty('--fahne-max', `${(frei[1] - frei[0]) / 2 - 6}px`);
      // ausgeblendete (offene Mission, nah) haben keine Breite und zählen beim Auffächern nicht
      const da = liste.filter((f) => f.el.offsetWidth > 0);
      const v = auffaechern(
        da.map((f) => ({ ...m.project(f.ort), b: f.el.offsetWidth })),
        (da[0]?.el.offsetHeight ?? 0) + 8,
        frei,
      );
      da.forEach((f, i) => {
        const { dx, dy } = v[i];
        f.marker.setOffset([dx, dy - 8]); // Spitze 8 px unter dem Fähnchen
        f.el.classList.toggle('versetzt', Math.hypot(dx, dy) > 1);
        f.el.style.setProperty('--leine', `${Math.hypot(dx, dy)}px`);
        f.el.style.setProperty('--winkel', `${Math.atan2(-dy, -dx)}rad`);
      });
    };
    m.on('move', legen); // auch jede Zoomfahrt ist ein 'move'
    legen();
    fahnen = liste;
    return () => {
      m.off('move', legen);
      c.classList.remove('weit', 'nah');
      for (const f of liste) f.marker.remove();
    };
  });
  $effect(() => {
    for (const f of fahnen) {
      f.el.classList.toggle('laeuft', f.x.token === store.token);
      f.el.classList.toggle('gewaehlt', seite === 'mission' && f.x.lageId === gewaehlt);
    }
  });
</script>

<div class="menue">
  <nav class="spalte" aria-label="Menü" bind:this={spalte}>
    {#each EINTRAEGE as e (e.id)}
      <button class="rand-knopf" aria-label={e.label} aria-pressed={seite === e.id || (seite === 'mission' && e.id === 'missionen')} onclick={() => zu(e.id)}>
        {@html e.icon}<span>{e.kurz}</span>
      </button>
    {/each}
  </nav>

  <section class="panel" aria-label={titel} bind:this={panel}>
    <header class="kopf">
      {#if seite === 'mission'}
        <button class="icon" aria-label="Zurück zu Meine Missionen" onclick={() => zu('missionen')}>{@html IKON_ZURUECK}</button>
      {/if}
      <h2>{titel}</h2>
    </header>
    <div class="scroll">
      {#if seite === 'missionen'}
        {#if store.missionen.length}
          <ul class="missionen">
            {#each store.missionen as x (x.lageId)}
              <li>
                <button class="mission" class:offen={x.token === store.token} onclick={() => waehle(x.lageId)}>
                  <span class="p-schild {x.phase}">{x.phase.toUpperCase()}</span>
                  <span class="name"><strong>{x.name || 'Mission'}</strong><span class="leise">{ROLLE_NAME[x.rolle]}</span></span>
                  {#if x.token === store.token}<span class="laeuft"><span class="lampe"></span>läuft</span>{/if}
                  {@html IKON_WEITER}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="leise">Noch keine Mission auf diesem Gerät. Mit einem Code beitreten oder eine neue Mission eröffnen.</p>
        {/if}
      {:else if seite === 'mission' && mission}
        <Mission {mission} onoeffnen={oeffnen} />
      {:else if seite === 'beitreten' || seite === 'neu'}
        {#key seite}<Beitritt modus={seite} />{/key}
      {:else if seite === 'profil'}
        <Profil />
      {:else if seite === 'einstellungen'}
        <Einstellungen />
      {:else if seite === 'ueber'}
        <Ueber />
      {/if}
    </div>
    <datalist id="funktionen">
      {#each FUNKTIONS_VORSCHLAEGE as f (f)}<option value={f}></option>{/each}
    </datalist>
    {#if offen}
      <button class="primaer zurueck" onclick={zurueckZurMission}>
        {@html IKON_ZURUECK}
        <span><strong>Zurück zur Mission</strong><small>{offen.name}</small></span>
      </button>
    {/if}
  </section>
</div>

<style>
  .spalte {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 28;
    width: calc(84px + env(safe-area-inset-left, 0px));
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: calc(8px + var(--safe-top)) 0 calc(8px + var(--safe-bottom)) calc(8px + env(safe-area-inset-left, 0px));
    overflow-y: auto; /* Sehr gross auf niedrigem Handy: «Über» bleibt erreichbar */
    scrollbar-width: none;
  }
  .spalte .rand-knopf {
    flex: 1 0 auto;
    min-height: 44px;
    max-height: 72px;
    gap: 2px;
    padding: 2px 0;
    box-shadow: var(--schatten);
    font-size: 0.58rem;
    letter-spacing: 0;
  }
  .spalte .rand-knopf :global(.ikon) {
    width: 20px;
    height: 20px;
  }
  .spalte .rand-knopf > span {
    white-space: normal;
    text-align: center;
    line-height: 1.2;
  }
  .panel {
    position: fixed;
    top: calc(8px + var(--safe-top));
    right: calc(8px + env(safe-area-inset-right, 0px));
    bottom: calc(8px + var(--safe-bottom));
    z-index: 28;
    width: min(336px, 40vw);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px 8px;
    background: var(--surface-glas);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
  }
  .kopf {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding-left: 6px;
  }
  .kopf .icon {
    margin-left: -6px;
    border-color: transparent;
    background: transparent;
  }
  h2 {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.1rem;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 4px 6px;
  }
  .scroll > p {
    margin: 4px 0;
  }
  .zurueck {
    flex: none;
    min-height: 54px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    text-align: left;
  }
  .zurueck span {
    display: grid;
    min-width: 0;
    line-height: 1.3; /* 1.15 schnitt mit overflow die Punkte von «Übung» ab */
  }
  .zurueck small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    font-size: 0.75rem;
  }

  /* --- Meine Missionen --- */
  .missionen {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .mission {
    width: 100%;
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px 4px 10px;
    text-align: left;
    background: var(--bg);
  }
  .mission.offen {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr); /* sonst macht das längste Wort die Spalte breiter als die Zeile */
    line-height: 1.2;
  }
  .name strong {
    overflow-wrap: break-word; /* nur ein Wort, das allein nicht passt, bricht; sonst am Wortende */
    hyphens: auto;
    font-size: 0.95rem;
  }
  .name .leise {
    font-size: 0.8rem;
  }
  .laeuft {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .laeuft .lampe {
    background: var(--ok);
  }
  .mission :global(.ikon) {
    width: 18px;
    height: 18px;
    color: var(--text-2);
  }

  /* --- Fähnchen der Missionen auf der Karte (Marker-Elemente, darum global) --- */
  /* Kartenobjekt: wächst mit --karte (gedämpft) wie Symbole und Rufnamen, nicht mit der Bediengrösse */
  :global(.m-pin) {
    /* keine eigene position: maplibregl-marker setzt absolute (relative hier stapelte die Marker im Fluss) */
    display: flex;
    align-items: center;
    gap: calc(6px * var(--karte));
    max-width: min(calc(150px * var(--karte)), var(--fahne-max, 100vw));
    min-height: calc(34px * var(--karte));
    padding: 0 calc(10px * var(--karte)) 0 calc(4px * var(--karte));
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--kopf-bg);
    color: var(--text);
    font-size: calc(13px * var(--karte));
    font-weight: 700;
    white-space: nowrap;
    box-shadow: var(--schatten);
  }
  /* Trefferfläche mindestens 44 px hoch um das flache Fähnchen, auch bei kleiner Bediengrösse */
  :global(.m-pin::before) {
    content: '';
    position: absolute;
    inset: min(-5px, calc((34px * var(--karte) - 44px) / 2)) -2px;
  }
  :global(.m-pin .m-name) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.m-pin::after) {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -8px;
    translate: -50% 0;
    border: 7px solid transparent;
    border-bottom: 0;
    border-top-color: var(--line);
  }
  /* aufgefächert: dünne Leine von der Spitze zum echten Ort, dort ein Punkt */
  :global(.m-pin .m-leine) {
    display: none;
    position: absolute;
    left: 50%;
    top: calc(100% + 8px);
    width: var(--leine);
    height: 2px;
    background: var(--text);
    transform-origin: 0 50%;
    rotate: var(--winkel);
    pointer-events: none;
  }
  :global(.m-pin.versetzt .m-leine) {
    display: block;
  }
  :global(.m-pin .m-leine::after) {
    content: '';
    position: absolute;
    right: -4px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text);
  }
  :global(.m-pin.laeuft),
  :global(.m-pin.gewaehlt) {
    z-index: 1;
    border-color: var(--accent);
    color: var(--accent);
  }
  :global(.m-pin.laeuft::after),
  :global(.m-pin.gewaehlt::after) {
    border-top-color: var(--accent);
  }
  :global(.m-pin .p-schild) {
    min-width: calc(30px * var(--karte));
    min-height: calc(24px * var(--karte));
    font-size: calc(12px * var(--karte));
  }
  :global(.weit .bft) {
    display: none;
  }
  :global(.nah .m-pin.laeuft) {
    display: none;
  }
  /* Nordnadel gehört in die Mission; Massstab rechts neben die Menüspalte */
  :global(:root:has(.menue) .maplibregl-ctrl-top-right) {
    display: none;
  }
  :global(:root:has(.menue) .maplibregl-ctrl-bottom-left) {
    left: calc(92px + env(safe-area-inset-left, 0px));
  }

  /* Hochformat: Menüspalte als Dock unten, Panel als Blatt darüber */
  @media (orientation: portrait) {
    .spalte {
      top: auto;
      right: 0;
      width: auto;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding: 8px 8px calc(8px + var(--safe-bottom));
    }
    .spalte .rand-knopf {
      min-height: 56px;
      max-height: none;
    }
    .panel {
      top: auto;
      left: 8px;
      right: 8px;
      bottom: calc(136px + var(--safe-bottom));
      width: auto;
      height: min(400px, 46dvh);
    }
    /* Massstab hätte hoch nur über dem Panel Platz und läge dort unter den Fähnchen */
    :global(:root:has(.menue) .maplibregl-ctrl-bottom-left) {
      display: none;
    }
  }
</style>
