<script lang="ts">
  import { azimut, distanz, formatDistanz, formatRichtung, himmelsrichtung } from '../lib/coords.ts';
  import { zentriere } from '../lib/map.ts';
  import { frische, keinGps, statusDef, store } from '../lib/store.svelte.ts';
  import { teamFarbe } from '../lib/team.ts';
  import { symbolSvg } from '../lib/symbol.ts';
  import { groesse } from '../lib/groesse.svelte.ts';
  import { waehle } from '../lib/ui.svelte.ts';

  const zeilen = $derived.by(() => {
    const ich = store.meinePos;
    return [...store.teilnehmer.values()]
      .map((t) => ({ t, d: ich && t.pos && t.id !== store.ich ? distanz(ich, t.pos) : null }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.t.rufname.localeCompare(b.t.rufname, 'de'));
  });

  function tippe(id: string) {
    const t = store.teilnehmer.get(id);
    if (t?.pos) zentriere(t.pos);
    waehle('teilnehmer', id);
  }
</script>

{#if zeilen.length === 0}
  <p class="leise">Noch niemand in der Lage.</p>
{/if}
<ul>
  {#each zeilen as { t, d } (t.id)}
    <li>
      <button class="zeile {frische(t)}" onclick={() => tippe(t.id)}>
        <span class="zeichen">{@html symbolSvg(t.sidc, { size: 18 * groesse.ui })}</span>
        <span class="name">
          <strong>{t.rufname}{t.id === store.ich ? ' (ich)' : ''}</strong>
          <span class="leise"
            ><span class="team" style:background={teamFarbe(t.einheit)}></span>{t.einheit}{t.funktion ? ` · ${t.funktion}` : ''}{#if keinGps(t)}<span
                class="warn"> · kein GPS</span
              >{:else if !t.online}<span class="warn"> · offline</span>{/if}</span
          >
        </span>
        <span class="status" style:background={statusDef(t.status)?.farbe ?? 'var(--line)'} title={statusDef(t.status)?.label}></span>
        <span class="dist mono">
          {#if d != null && t.pos && store.meinePos}
            {@const az = azimut(store.meinePos, t.pos)}
            <!-- Himmelsrichtung in Proportionalschrift: in Monospace sieht «O» (Ost) aus wie eine Null -->
            {formatDistanz(d)}<br /><span class="leise">{formatRichtung(az).split(' / ')[0]} <span class="himmel">{himmelsrichtung(az)}</span></span>
          {:else if !t.pos}<span class="leise">keine Pos.</span>{/if}
        </span>
      </button>
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .zeile {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    min-height: 56px;
    text-align: left;
    background: var(--bg);
  }
  .zeile.stale {
    opacity: 0.7;
  }
  .zeile.geist {
    opacity: 0.45;
  }
  /* min(…, vw): bei grosser Bediengrösse behält der Rufname Platz */
  .zeichen {
    width: min(44px, 12vw);
    display: grid;
    place-items: center;
    flex: none;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Rufname bricht lieber um, als bei grosser Schrift zu «Swe…» zu schrumpfen */
  .name > strong {
    white-space: normal;
  }
  .team {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 6px;
    border-radius: 2px;
    outline: 1px solid rgb(0 0 0 / 0.5);
  }
  .warn {
    color: var(--warn);
  }
  .status {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex: none;
  }
  .dist {
    text-align: right;
    min-width: min(72px, 20vw);
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .himmel {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
</style>
