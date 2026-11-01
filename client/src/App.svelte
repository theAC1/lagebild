<script lang="ts">
  import Ausrichtung from './components/Ausrichtung.svelte';
  import BftLayer from './components/BftLayer.svelte';
  import Daumen from './components/Daumen.svelte';
  import EbenenListe from './components/EbenenListe.svelte';
  import EigenePosition from './components/EigenePosition.svelte';
  import Fadenkreuz from './components/Fadenkreuz.svelte';
  import KoordKarte from './components/KoordKarte.svelte';
  import KoordLeiste from './components/KoordLeiste.svelte';
  import MapView from './components/MapView.svelte';
  import { merkeStand } from './components/menu/kamera.ts';
  import Menue from './components/menu/Menue.svelte';
  import RadialMenu from './components/RadialMenu.svelte';
  import Sheet from './components/Sheet.svelte';
  import TeilnehmerDetail from './components/TeilnehmerDetail.svelte';
  import TeilnehmerListe from './components/TeilnehmerListe.svelte';
  import { onMount, untrack } from 'svelte';
  import PhaseRahmen from './components/PhaseRahmen.svelte';
  import PhaseSchild from './components/PhaseSchild.svelte';
  import { features, zeigen } from './features/registry.ts';
  import { wendeGroesseAn } from './lib/groesse.svelte.ts';
  import { folgeMir, onMapReady } from './lib/map.ts';
  import './lib/radialKern.ts';
  import { aktualisiereWachhalten, starteGps, stoppeGps } from './lib/position.svelte.ts';
  import { store, verbinde } from './lib/store.svelte.ts';
  import { pruefeThema } from './lib/thema.ts';
  import { PROTOKOLL_VERSION } from '../../shared/protocol.ts';
  import { apkHerunterladen, neuLaden, spaeter, ueberspringen, update } from './lib/update.svelte.ts';
  import { begrenzePanels, DETAIL, ikon, istOffen, maxPanels, merkeQuelle, oeffne, schliesse, setzeLeisteZu, ui, type PanelZustand } from './lib/ui.svelte.ts';

  // Live-Update-Hinweis: normal nach «Später» ausgeblendet, wichtig/sicherheit bleiben klein sichtbar
  const stufe = $derived(update.web?.stufe ?? 'normal');
  const updateTitel = $derived(stufe === 'sicherheit' ? 'Sicherheitsupdate bereit' : stufe === 'wichtig' ? 'Wichtiges Update bereit' : 'Neue Version bereit');

  const EINGEBAUT: Record<string, string> = { teilnehmer: 'Teilnehmende' };

  let basisOffen = $state(false);

  const sichtbar = $derived(features.filter((f) => zeigen(f, store.phase, store.ichSelbst?.rolle)));
  const featureVon = (id: string) => features.find((f) => f.id === id);
  const detailVon = (art: string) => features.find((f) => f.detailArt === art);
  function titelVon(p: PanelZustand): string {
    if (p.id === DETAIL) return p.params.art === 'teilnehmer' ? 'Teilnehmer' : (detailVon(p.params.art)?.label ?? 'Detail');
    return EINGEBAUT[p.id] ?? featureVon(p.id)?.label ?? p.id;
  }
  const koordLeiste = $derived(store.einstellungen.koordLeiste || !store.meinePos); // ohne Fix ist sie die einzige GPS-Anzeige
  const daumen = $derived(store.einstellungen.bedienung === 'daumen');
  // Menü (Spec v7): ohne offene Mission die Startseite, sonst über der laufenden Mission (Verbindung und GPS laufen weiter)
  const menue = $derived(!store.token || ui.menue);
  const IKON_MENUE = ikon('<path d="M4 6h16M4 12h16M4 18h16"/>');

  $effect(wendeGroesseAn); // Bediengrösse: wirkt sofort, auch vor dem Anmelden

  // Unter 1100 px (oder nach dem Drehen ins Hochformat) bleibt nur das oberste Panel
  $effect(() => {
    void maxPanels();
    untrack(begrenzePanels);
  });

  // Esc: zuerst Ring und Koordinaten-Karte, dann Werkzeug (Punktwahl), dann das oberste Panel
  function taste(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (store.token && ui.menue) ui.menue = false;
    else if (ui.radial) ui.radial = null;
    else if (ui.koordinate) ui.koordinate = null;
    else if (ui.punktWahl) ui.punktWahl.fertig(null);
    else if (basisOffen) basisOffen = false;
    else if (ui.panels.length) schliesse();
    else return;
    e.preventDefault();
  }

  // Browser-Gesten (30.10.): kein Browser-Kontextmenü auf Karte und Bedienelementen (Langdruck auf Android, Rechtsklick).
  // MapView/Zeichnen werten Rechtsklick und Langdruck vorher selbst aus; Eingaben und .markierbar behalten das Menü.
  function keinBrowserMenu(e: MouseEvent) {
    if (!(e.target as Element).closest?.('input, textarea, [contenteditable], .markierbar')) e.preventDefault();
  }

  // Angemeldet: Verbindung + GPS + Wakelock; abgemeldet: alles stoppen.
  // Wachhalten ungetrackt: es liest store.einstellungen, sonst startet jede Einstellung GPS und Verbindung neu.
  $effect(() => {
    if (!store.token) return;
    verbinde();
    starteGps();
    untrack(aktualisiereWachhalten);
    return stoppeGps;
  });

  // Tag/Nacht nach Sonnenstand: minütlich, sobald die Karte steht und wenn das GPS (wieder) einen Fix hat
  const hatGps = $derived(store.meinePos !== null);
  $effect(() => {
    void hatGps;
    untrack(pruefeThema);
  });
  onMount(() => {
    onMapReady(pruefeThema);
    const iv = setInterval(pruefeThema, 60_000);
    // Stand der offenen Mission fürs Menü (Fähnchen, letzter Ausschnitt), bevor Android die App beendet
    const weg = () => document.visibilityState === 'hidden' && store.token && !ui.menue && merkeStand();
    document.addEventListener('visibilitychange', weg);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', weg);
    };
  });

  const VERBINDUNG = { verbunden: 'verbunden', verbinde: 'verbinde …', getrennt: 'getrennt' } as const;
</script>

<svelte:window onkeydown={taste} oncontextmenu={keinBrowserMenu} onpointerdowncapture={(e) => merkeQuelle((e.target as Element).closest?.<HTMLElement>('[data-panel]')?.dataset.panel ?? null)} />
<Ausrichtung />

<MapView>
  {#if store.token}
    <BftLayer />
    <EigenePosition />
    {#each features as f (f.id)}
      {#if f.MapLayer}<f.MapLayer />{/if}
    {/each}
    {#if ui.koordinate}<KoordKarte punkt={ui.koordinate} />{/if}
    {#if ui.punktWahl}<Fadenkreuz hinweis={ui.punktWahl.hinweis} knopf={ui.punktWahl.knopf} />{/if}
  {/if}
</MapView>

{#if store.token && store.lage}<PhaseRahmen />{/if}
{#if menue}
  <Menue />
{:else if daumen}
  <Daumen />
{:else}
  <header class="kopf">
    <div class="lage">
      <strong><PhaseSchild /> {store.lage?.name ?? 'Lagebild'}</strong>
      <span class="verbindung {store.verbindung}" role="status"><span class="lampe"></span>{VERBINDUNG[store.verbindung]}</span>
    </div>
    {#each sichtbar as f (f.id)}
      {#if f.Kopf}<f.Kopf />{/if}
    {/each}
    <button class="icon" aria-label="Teilnehmende" onclick={() => oeffne('teilnehmer')}>
      {@html ikon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.2 2.6 3.5 6"/>')}
      <span class="zahl">{store.teilnehmer.size}</span>
    </button>
    <button class="icon" aria-label="Menü" onclick={() => (ui.menue = true)}>{@html IKON_MENUE}</button>
  </header>

  <div class="schwebend">
    <button class="icon rund" aria-label="Karte und Ebenen wählen" aria-expanded={basisOffen} onclick={() => (basisOffen = !basisOffen)}>
      {@html ikon('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>')}
    </button>
    {#if basisOffen}
      <div class="basis-wahl" role="group" aria-label="Karte"><EbenenListe /></div>
    {/if}
    <button class="icon rund" class:aktiv={ui.folgen} aria-label="Eigener Position folgen" aria-pressed={ui.folgen} onclick={folgeMir}>
      {@html ikon('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>')}
    </button>
    {#each sichtbar as f (f.id)}
      {#if f.Toolbar}<f.Toolbar />{/if}
    {/each}
  </div>

  <footer class="unten">
    {#if koordLeiste}<KoordLeiste />{/if}
    <nav class="werkzeuge" class:zu={ui.leisteZu} aria-label="Werkzeuge">
      <!-- Features mit eigenem Schnellknopf (Status, Alarm) nicht doppelt: sonst passt die Leiste nicht auf ein Handy -->
      {#each sichtbar.filter((f) => f.Panel && !f.Toolbar && !f.Kopf) as f (f.id)}
        {@const badge = f.badge?.() ?? 0}
        <button class="werkzeug" aria-pressed={istOffen(f.id)} onclick={() => (istOffen(f.id) ? schliesse(f.id) : oeffne(f.id))}>
          {#if typeof f.icon === 'string'}{@html f.icon}{:else}<f.icon />{/if}
          <span>{f.label}</span>
          {#if badge > 0}<span class="badge">{badge > 99 ? '99+' : badge}</span>{/if}
        </button>
      {/each}
      <!-- nur im Querformat sichtbar: Leiste rechts ein-/ausklappen -->
      <button
        class="werkzeug einklappen"
        aria-label={ui.leisteZu ? 'Werkzeugleiste ausklappen' : 'Werkzeugleiste einklappen'}
        aria-expanded={!ui.leisteZu}
        onclick={() => setzeLeisteZu(!ui.leisteZu)}
      >
        {@html ikon(ui.leisteZu ? '<path d="M15 6l-6 6 6 6"/>' : '<path d="M9 6l6 6-6 6"/>')}
      </button>
    </nav>
  </footer>
{/if}

{#if !menue}
  {#if !ui.punktWahl && ui.panels.length}
    <div class="panels">
      {#each ui.panels as p (p.id)}
        {@const f = p.id === DETAIL ? detailVon(p.params.art) : featureVon(p.id)}
        <Sheet titel={titelVon(p)} panelId={p.id} onclose={() => schliesse(p.id)}>
          {#if p.id === 'teilnehmer'}
            <TeilnehmerListe />
          {:else if p.id === DETAIL && p.params.art === 'teilnehmer'}
            <TeilnehmerDetail id={p.params.id} />
          {:else if p.id === DETAIL && f?.Detail}
            <f.Detail id={p.params.id} />
          {:else if p.id !== DETAIL && f?.Panel}
            <f.Panel params={p.params} />
          {/if}
        </Sheet>
      {/each}
    </div>
  {/if}
  {#if ui.radial}<RadialMenu {...ui.radial} />{/if}
{/if}

<div class="toasts" aria-live="polite">
  {#if update.bereit && update.spaeter && stufe !== 'normal'}
    <button class="toast neu {stufe}" onclick={() => neuLaden(true)}>{updateTitel} · <u>Neu laden</u></button>
  {:else if update.bereit && !update.spaeter}
    <div class="toast neu {stufe}" role="status">
      <strong>{updateTitel}</strong>
      {#if update.web && update.web.protokoll !== PROTOKOLL_VERSION}<div>Update nötig, um mit neueren Geräten zu arbeiten</div>{/if}
      <div class="update-knoepfe">
        <button class="primaer" onclick={() => neuLaden(true)}>Neu laden</button>
        <button onclick={spaeter}>Später</button>
        {#if update.web?.stufe === 'normal'}<button onclick={ueberspringen}>Diese Version überspringen</button>{/if}
      </div>
    </div>
  {/if}
  {#if update.appNeu}
    <button class="toast neu" onclick={() => apkHerunterladen()}>Neue App-Version · <u>Herunterladen</u></button>
  {/if}
  {#each ui.toasts as t (t.id)}
    <div class="toast">
      {t.text}
      {#if t.knopf}
        {@const k = t.knopf}
        <button
          class="toast-knopf"
          onclick={() => {
            ui.toasts = ui.toasts.filter((x) => x.id !== t.id);
            k.aktion();
          }}>{k.label}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .kopf {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    height: var(--oben);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: var(--safe-top) 6px 0 14px;
    background: var(--kopf-bg);
    border-bottom: 1px solid var(--line);
  }
  .kopf button {
    position: relative;
    border: 0;
    background: transparent;
  }
  /* grosse Bediengrösse auf schmalem Handy: Icon-Knöpfe nicht breiter als nötig, damit der Lagename Platz behält */
  .kopf button.icon {
    width: min(var(--touch), 13vw);
  }
  .lage {
    flex: 1;
    min-width: 0;
    display: grid;
    line-height: 1.2;
  }
  .lage .verbindung {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .lage strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .zahl {
    position: absolute;
    right: 2px;
    top: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--accent);
  }
  .schwebend {
    position: fixed;
    right: calc(var(--rechts, 0px) + 10px);
    /* --banner-h: Höhe des Alarm-Banners (AlarmLayer), sonst 0 */
    top: calc(var(--oben) + 60px + var(--banner-h, 0px));
    z-index: 9;
    display: grid;
    gap: 10px;
    justify-items: end;
  }
  .rund {
    border-radius: 50%;
    background: var(--surface);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
  }
  .rund.aktiv {
    color: var(--accent);
    border-color: var(--accent);
  }
  /* Popover links neben den Knöpfen, nicht im Fluss: schiebt Folgen/Status sonst unter die Werkzeugleiste */
  .basis-wahl {
    position: fixed;
    top: calc(var(--oben) + 60px + var(--banner-h, 0px));
    right: calc(var(--rechts, 0px) + 68px);
    display: grid;
    gap: 4px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .basis-wahl {
    max-height: max(160px, calc(100dvh - var(--oben) - var(--unten) - 72px - var(--banner-h, 0px)));
    overflow-y: auto;
    width: min(260px, calc(100vw - 80px));
  }
  /* Querformat (Handy in der Halterung): Knöpfe nebeneinander, Menü über die ganze Kartenhöhe */
  @media (max-height: 500px) {
    .schwebend {
      grid-auto-flow: column;
      align-items: start;
    }
    .basis-wahl {
      top: calc(var(--oben) + 8px);
      right: auto;
      left: calc(var(--links, 0px) + 10px);
      max-height: calc(100dvh - var(--oben) - var(--unten) - 16px);
    }
  }
  .unten {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    padding-bottom: var(--safe-bottom);
    background: var(--surface-glas);
    border-top: 1px solid var(--line);
  }
  .werkzeuge {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    height: 76px;
  }
  .werkzeug {
    position: relative;
    /* mindestens 60 px und nie schmaler als das längste Wort (sonst ragt «Führungsraster» in den Nachbarn); mehrere
       Wörter brechen um. Passt nicht alles, scrollt die Leiste. */
    flex: 1 0 60px;
    min-width: min-content;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 0.72rem;
    color: var(--text-2);
    padding: 0 4px;
  }
  .werkzeug[aria-pressed='true'] {
    color: var(--accent);
  }
  .werkzeug span {
    text-align: center;
    line-height: 1.15;
  }
  .badge {
    position: absolute;
    top: 8px;
    left: calc(50% + 6px);
    min-width: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-weight: 700;
    line-height: 20px;
  }
  .toasts {
    position: fixed;
    /* unter dem Alarm-Banner statt dahinter; mittig über der Karte, nicht über Panels/Leiste */
    top: calc(var(--oben) + 8px + var(--banner-h, 0px));
    left: calc(var(--links, 0px) + (100vw - var(--links, 0px) - var(--rechts, 0px)) / 2);
    translate: -50% 0;
    z-index: 29; /* über Sheets/Fadenkreuz, unter dem Alarm-Banner (30) */
    display: grid;
    gap: 6px;
    width: min(92vw, 420px, calc(100vw - var(--links, 0px) - var(--rechts, 0px) - 16px - 2 * var(--toast-rand, 0px)));
    pointer-events: none;
  }
  .einklappen {
    display: none;
  }
  .panels {
    display: contents;
  }
  /* Querformat: kompakte Kopfzeile, Werkzeuge als Leiste rechts, Panels als Karten links über der Karte */
  @media (orientation: landscape) {
    .kopf button {
      min-height: min(44px, calc(var(--oben) - var(--safe-top)));
    }
    .lage {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .unten {
      left: var(--links, 0px);
      right: var(--rechts, 0px);
      background: transparent;
      border-top: 0;
    }
    .werkzeuge {
      position: fixed;
      top: var(--oben);
      right: 0;
      bottom: 0;
      width: var(--rechts);
      height: auto;
      flex-direction: column;
      overflow-y: auto;
      padding: 0 env(safe-area-inset-right, 0px) var(--safe-bottom) 0;
      background: var(--surface-glas);
      border-left: 1px solid var(--line);
    }
    .werkzeug {
      /* nie niedriger als Symbol plus (getrennte, zweizeilige) Beschriftung; passt nicht alles, scrollt die Leiste */
      flex: 1 0 auto;
      min-height: 44px;
      max-height: 76px;
      min-width: 0;
      font-size: 0.68rem;
    }
    /* «Führungsraster», «Geländetaufe» sind breiter als die Leiste: trennen statt in die Karte ragen */
    .werkzeug span {
      max-width: 100%;
      hyphens: auto;
    }
    .einklappen {
      display: grid;
      flex: none;
      border-top: 1px solid var(--line);
    }
    /* eingeklappt: nur ein runder Knopf unten rechts, die Karte bekommt die volle Breite */
    .werkzeuge.zu {
      top: auto;
      right: 10px;
      bottom: calc(var(--unten) + 26px);
      width: auto;
      padding: 0;
      overflow: visible;
      background: transparent;
      border: 0;
    }
    .werkzeuge.zu .werkzeug:not(.einklappen) {
      display: none;
    }
    .werkzeuge.zu .einklappen {
      width: var(--touch);
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--surface);
      color: var(--text);
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.4);
    }
    /* Panels als schwebende Karten wie das Menü (01.11.): Abstand zu Rändern, Kopf und Safe-Area, die Karte läuft darunter durch */
    .panels {
      position: fixed;
      top: calc(var(--oben) + var(--banner-h, 0px) + 8px);
      left: calc(var(--rand-l) + 8px);
      bottom: calc(var(--safe-bottom) + 8px);
      z-index: 20;
      display: flex;
      gap: 8px;
    }
  }
  .toast {
    padding: 10px 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.45);
    text-align: center;
  }
  .toast-knopf {
    pointer-events: auto;
    min-height: var(--touch);
    margin-left: 10px;
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }
  .neu {
    pointer-events: auto;
    color: var(--text);
    border-color: var(--accent);
  }
  /* Sicherheitsupdate deutlich: Rot statt Akzent (--warn ist vom Akzent kaum zu unterscheiden) */
  .neu.sicherheit {
    border: 2px solid var(--danger);
    background: color-mix(in srgb, var(--danger) 28%, var(--surface-2));
  }
  .update-knoepfe {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 8px;
  }
  .update-knoepfe button {
    min-height: var(--touch);
  }
</style>
