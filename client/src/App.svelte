<script lang="ts">
  import BftLayer from './components/BftLayer.svelte';
  import EigenePosition from './components/EigenePosition.svelte';
  import Einstellungen from './components/Einstellungen.svelte';
  import Fadenkreuz from './components/Fadenkreuz.svelte';
  import KontextMenu from './components/KontextMenu.svelte';
  import KoordLeiste from './components/KoordLeiste.svelte';
  import Login from './components/Login.svelte';
  import MapView from './components/MapView.svelte';
  import Sheet from './components/Sheet.svelte';
  import TeilnehmerDetail from './components/TeilnehmerDetail.svelte';
  import TeilnehmerListe from './components/TeilnehmerListe.svelte';
  import { features } from './features/registry.ts';
  import { zentriere } from './lib/map.ts';
  import { aktualisiereWachhalten, starteGps, stoppeGps } from './lib/position.svelte.ts';
  import { BASISKARTEN, OVERLAYS, type Overlay } from './lib/karten.ts';
  import { setzeEinstellung, store, verbinde } from './lib/store.svelte.ts';
  import { ikon, oeffne, schliesse, toast, ui } from './lib/ui.svelte.ts';

  const EINGEBAUT: Record<string, string> = { teilnehmer: 'Teilnehmende', einstellungen: 'Einstellungen' };

  let basisOffen = $state(false);

  const sichtbar = $derived(features.filter((f) => !f.nurLeitung || store.istLeitung));
  const panelFeature = $derived(ui.panel ? features.find((f) => f.id === ui.panel!.id) : undefined);
  const detailFeature = $derived(ui.auswahl ? features.find((f) => f.detailArt === ui.auswahl!.art) : undefined);

  // Angemeldet: Verbindung + GPS + Wakelock; abgemeldet: alles stoppen
  $effect(() => {
    if (!store.token) return;
    verbinde();
    starteGps();
    aktualisiereWachhalten();
    return stoppeGps;
  });

  function umschalten(o: Overlay) {
    const aktiv = store.einstellungen.overlays;
    setzeEinstellung('overlays', aktiv.includes(o) ? aktiv.filter((x) => x !== o) : [...aktiv, o]);
  }

  function folgen() {
    if (!store.meinePos) return toast(store.gpsFehler ?? 'Noch keine eigene Position.');
    zentriere(store.meinePos, 16);
    ui.folgen = true;
  }

  const VERBINDUNG = { verbunden: 'verbunden', verbinde: 'verbinde …', getrennt: 'getrennt' } as const;
</script>

<MapView>
  {#if store.token}
    <BftLayer />
    <EigenePosition />
    {#each features as f (f.id)}
      {#if f.MapLayer}<f.MapLayer />{/if}
    {/each}
    {#if ui.kontext}<KontextMenu punkt={ui.kontext} />{/if}
    {#if ui.punktWahl}<Fadenkreuz hinweis={ui.punktWahl.hinweis} />{/if}
  {/if}
</MapView>

{#if !store.token}
  <Login />
{:else}
  <header class="kopf">
    <div class="lage">
      <strong>{store.lage?.name ?? 'Lagebild'}</strong>
      <span class="verbindung {store.verbindung}" role="status"><span class="lampe"></span>{VERBINDUNG[store.verbindung]}</span>
    </div>
    <button class="icon" aria-label="Teilnehmende" onclick={() => oeffne('teilnehmer')}>
      {@html ikon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.2 2.6 3.5 6"/>')}
      <span class="zahl">{store.teilnehmer.size}</span>
    </button>
    <button class="icon" aria-label="Einstellungen" onclick={() => oeffne('einstellungen')}>
      {@html ikon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9L7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>')}
    </button>
  </header>

  <div class="schwebend">
    <button class="icon rund" aria-label="Karte und Ebenen wählen" aria-expanded={basisOffen} onclick={() => (basisOffen = !basisOffen)}>
      {@html ikon('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>')}
    </button>
    {#if basisOffen}
      <div class="basis-wahl" role="group" aria-label="Karte">
        <div class="gruppe">Karte</div>
        {#each BASISKARTEN as b (b.id)}
          <button aria-pressed={store.einstellungen.basiskarte === b.id} onclick={() => setzeEinstellung('basiskarte', b.id)}>{b.label}</button>
        {/each}
        <div class="gruppe">Ebenen</div>
        {#each OVERLAYS as o (o.id)}
          <button class="ebene" aria-pressed={store.einstellungen.overlays.includes(o.id)} onclick={() => umschalten(o.id)}>
            <span class="haken" aria-hidden="true"></span>{o.label}
          </button>
        {/each}
      </div>
    {/if}
    <button class="icon rund" class:aktiv={ui.folgen} aria-label="Eigener Position folgen" aria-pressed={ui.folgen} onclick={folgen}>
      {@html ikon('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>')}
    </button>
    {#each sichtbar as f (f.id)}
      {#if f.Toolbar}<f.Toolbar />{/if}
    {/each}
  </div>

  <footer class="unten">
    <KoordLeiste />
    <nav class="werkzeuge" aria-label="Werkzeuge">
      <!-- Features mit eigenem Schnellknopf (Status, Alarm) nicht doppelt: sonst passt die Leiste nicht auf ein Handy -->
      {#each sichtbar.filter((f) => f.Panel && !f.Toolbar) as f (f.id)}
        {@const badge = f.badge?.() ?? 0}
        <button class="werkzeug" aria-pressed={ui.panel?.id === f.id} onclick={() => (ui.panel?.id === f.id ? schliesse() : oeffne(f.id))}>
          {#if typeof f.icon === 'string'}{@html f.icon}{:else}<f.icon />{/if}
          <span>{f.label}</span>
          {#if badge > 0}<span class="badge">{badge > 99 ? '99+' : badge}</span>{/if}
        </button>
      {/each}
    </nav>
  </footer>

  {#if !ui.punktWahl}
    {#if ui.panel}
      <Sheet titel={EINGEBAUT[ui.panel.id] ?? panelFeature?.label ?? ui.panel.id} onclose={schliesse}>
        {#if ui.panel.id === 'teilnehmer'}
          <TeilnehmerListe />
        {:else if ui.panel.id === 'einstellungen'}
          <Einstellungen />
        {:else if panelFeature?.Panel}
          <panelFeature.Panel params={ui.panel.params} />
        {/if}
      </Sheet>
    {:else if ui.auswahl}
      <Sheet titel={ui.auswahl.art === 'teilnehmer' ? 'Teilnehmer' : (detailFeature?.label ?? 'Detail')} onclose={schliesse}>
        {#if ui.auswahl.art === 'teilnehmer'}
          <TeilnehmerDetail id={ui.auswahl.id} />
        {:else if detailFeature?.Detail}
          <detailFeature.Detail id={ui.auswahl.id} />
        {/if}
      </Sheet>
    {/if}
  {/if}
{/if}

<div class="toasts" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div class="toast">{t.text}</div>
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
    background: rgb(22 27 31 / 0.9);
    border-bottom: 1px solid var(--line);
  }
  .kopf button {
    position: relative;
    border: 0;
    background: transparent;
  }
  .lage {
    flex: 1;
    min-width: 0;
    display: grid;
    line-height: 1.2;
  }
  .lage strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .verbindung {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--text-2);
  }
  .lampe {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger);
  }
  .verbunden .lampe {
    background: var(--ok);
  }
  .verbinde .lampe {
    background: var(--warn);
    animation: blinken 1s infinite;
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
    right: 10px;
    top: calc(var(--oben) + 60px);
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
  .basis-wahl {
    display: grid;
    gap: 4px;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .basis-wahl button {
    border: 0;
    text-align: left;
    background: transparent;
  }
  .basis-wahl button[aria-pressed='true'] {
    color: var(--accent);
    font-weight: 600;
  }
  .basis-wahl {
    max-height: calc(100dvh - var(--oben) - var(--unten) - 140px);
    overflow-y: auto;
    width: min(260px, calc(100vw - 80px));
  }
  .gruppe {
    padding: 6px 12px 2px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-2);
  }
  .ebene {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .haken {
    width: 18px;
    height: 18px;
    flex: none;
    border: 2px solid var(--line);
    border-radius: 4px;
  }
  .ebene[aria-pressed='true'] .haken {
    border-color: var(--accent);
    background: var(--accent);
    box-shadow: inset 0 0 0 3px var(--surface);
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
    flex: 1 1 0;
    min-width: 60px;
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
    top: calc(var(--oben) + 8px);
    left: 50%;
    translate: -50% 0;
    z-index: 29; /* über Sheets/Fadenkreuz, unter dem Alarm-Banner (30) */
    display: grid;
    gap: 6px;
    width: min(92vw, 420px);
    pointer-events: none;
  }
  .toast {
    padding: 10px 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.45);
    text-align: center;
  }
  @keyframes blinken {
    50% {
      opacity: 0.3;
    }
  }
</style>
