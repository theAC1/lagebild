<script lang="ts">
  // Verwaltung «Offline-Karten»: Gebiete mit Grösse, Fortschritt, Nutzung; pausieren, aktualisieren, löschen.
  import type { PanelProps } from '../registry.ts';
  import { getMap } from '../../lib/map.ts';
  import { schliesse } from '../../lib/ui.svelte.ts';
  import { formatBytes, karteDef, type Gebiet } from './kacheln.ts';
  import { aktualisiere, aktualisiereSpeicher, benenne, loesche, offline, pausiere, setzeFort, setzeUmrisse } from './zustand.svelte.ts';

  let _props: PanelProps = $props();

  const moeglich = typeof caches !== 'undefined';
  const datum = (t: number) => new Date(t).toLocaleDateString('de-CH');
  const tage = (t: number) => Math.floor((Date.now() - t) / 86_400_000);
  const genutzt = (t: number) => (tage(t) < 1 ? 'heute' : tage(t) === 1 ? 'gestern' : `vor ${tage(t)} Tagen`);
  const prozent = (g: Gebiet) => (g.gesamt ? Math.floor((g.erledigt / g.gesamt) * 100) : 100);

  $effect(() => {
    void aktualisiereSpeicher();
    const iv = setInterval(aktualisiereSpeicher, 5000);
    return () => clearInterval(iv);
  });

  function zustand(g: Gebiet): string {
    if (g.status === 'fertig') return 'Fertig';
    if (g.status === 'pausiert') return g.fehler ? `Pausiert: ${g.fehler}` : 'Pausiert';
    if (offline.aktiv !== g.id) return 'Wartet';
    return offline.wartet ? 'Kein Netz – lädt weiter, sobald Verbindung da ist' : 'Lädt …';
  }

  function aufziehen() {
    offline.aufziehen = true;
    schliesse('offline');
  }

  function zeige(g: Gebiet) {
    const [w, s, e, n] = g.bbox;
    getMap().fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 16 });
    schliesse('offline');
  }

  function weg(g: Gebiet) {
    if (confirm(`Offline-Karte «${g.name}» löschen?`)) void loesche(g.id);
  }
</script>

{#if !moeglich}
  <p class="leise">Offline-Karten brauchen eine sichere Verbindung (https).</p>
{:else}
  <button class="primaer neu" onclick={aufziehen}>Neues Gebiet aufziehen</button>
  <div class="zeile">
    <span class="leise">
      {#if offline.speicher}
        Belegt {formatBytes(offline.speicher.belegt)} · frei {formatBytes(offline.speicher.frei)}{offline.speicher.dauerhaft ? '' : ' · nicht dauerhaft'}
      {/if}
    </span>
    <span class="chips"><button aria-pressed={offline.umrisse} onclick={() => setzeUmrisse(!offline.umrisse)}>Umrisse</button></span>
  </div>

  {#if offline.gebiete.length === 0}
    <p class="leise">Noch keine Offline-Gebiete. Gebiete ohne Nutzung werden nach 60 Tagen gelöscht.</p>
  {/if}
  <ul class="gebiete">
    {#each offline.gebiete as g (g.id)}
      <li>
        <input class="name" aria-label="Name" value={g.name} onchange={(e) => benenne(g.id, e.currentTarget.value)} />
        <div class="leise">
          {datum(g.erstellt)} · {g.karten.map((k) => karteDef(k).label).join(', ')} · {formatBytes(g.bytes)}
        </div>
        <div class="leise">Zuletzt genutzt: {genutzt(g.zuletztGenutzt)}</div>
        {#if g.status !== 'fertig'}
          <progress max="100" value={prozent(g)} aria-label="Fortschritt {g.name}"></progress>
        {/if}
        <div class="status" role="status">{zustand(g)}{g.status !== 'fertig' ? ` · ${prozent(g)} %` : ''}</div>
        <div class="knoepfe">
          {#if g.status === 'laeuft'}
            <button onclick={() => pausiere(g.id)}>Pausieren</button>
          {:else if g.status === 'pausiert'}
            <button onclick={() => setzeFort(g.id)}>Fortsetzen</button>
          {:else}
            <button onclick={() => aktualisiere(g.id)}>Aktualisieren</button>
          {/if}
          <button onclick={() => zeige(g)}>Zeigen</button>
          <button class="gefahr" onclick={() => weg(g)}>Löschen</button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .neu {
    width: 100%;
    min-height: var(--haupt);
  }
  .zeile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 10px 0;
  }
  .gebiete {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .gebiete li {
    display: grid;
    gap: 4px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .name {
    font-weight: 600;
    width: 100%;
  }
  progress {
    width: 100%;
    accent-color: var(--accent);
  }
  .status {
    font-size: 0.9rem;
  }
  .knoepfe {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .knoepfe button {
    flex: 1;
    min-height: var(--touch);
  }
</style>
