<script lang="ts">
  import { azimut, distanz, formatDistanz, formatLv95, formatMgrs, formatRichtung } from '../lib/coords.ts';
  import { starte } from '../features/bloodhound/zustand.svelte.ts';
  import { zentriere } from '../lib/map.ts';
  import { alterMs, formatAlter, frische, keinGps, statusDef, store } from '../lib/store.svelte.ts';
  import { teamFarbe } from '../lib/team.ts';
  import { funktionLabel, symbolSvg } from '../lib/symbol.ts';
  import { groesse } from '../lib/groesse.svelte.ts';
  import { oeffne } from '../lib/ui.svelte.ts';

  let { id }: { id: string } = $props();

  const t = $derived(store.teilnehmer.get(id));
  const status = $derived(t ? statusDef(t.status) : null);
  const ich = $derived(store.meinePos);
  const istIch = $derived(id === store.ich);
</script>

{#if !t}
  <p class="leise">Teilnehmer nicht mehr in der Lage.</p>
{:else}
  <div class="kopf">
    <div class="zeichen">{@html symbolSvg(t.sidc, { size: 34 * groesse.ui })}</div>
    <div>
      <div class="rufname">{t.rufname}{#if t.rolle === 'leitung'}<span class="badge">Leitung</span>{/if}</div>
      <div class="leise"><span class="team" style:background={teamFarbe(t.einheit)}></span>{t.einheit}{t.funktion ? ` · ${t.funktion}` : ''} · {funktionLabel(t.sidc)}</div>
    </div>
  </div>

  <div class="status" style:--farbe={status?.farbe ?? 'var(--line)'}>
    <span class="punkt"></span>
    <strong>{status?.label ?? t.status}</strong>
    {#if t.statusText}<span>– {t.statusText}</span>{/if}
  </div>

  <dl>
    {#if t.pos}
      <dt>LV95</dt>
      <dd class="mono">{formatLv95(t.pos)}</dd>
      <dt>MGRS</dt>
      <dd class="mono">{formatMgrs(t.pos)}</dd>
      <dt>Position</dt>
      <dd>
        {[formatAlter(alterMs(t)), t.pos.ce != null ? `±${Math.round(t.pos.ce)} m` : ''].filter(Boolean).join(' · ')}
        {#if keinGps(t)}<span class="warn">kein GPS</span>
        {:else if frische(t) === 'geist' || !t.online}<span class="warn">offline</span>
        {:else if frische(t) === 'stale'}<span class="warn">veraltet</span>{/if}
        {#if !t.sendetPos}<span class="warn">sendet keine Position</span>{/if}
      </dd>
      {#if ich && !istIch}
        <dt>Von mir</dt>
        <dd class="mono">{formatDistanz(distanz(ich, t.pos))} · {formatRichtung(azimut(ich, t.pos))}</dd>
      {/if}
    {:else}
      <dt>Position</dt>
      <dd>unbekannt</dd>
    {/if}
  </dl>

  <div class="aktionen">
    <button disabled={!t.pos} onclick={() => t.pos && zentriere(t.pos)}>Zentrieren</button>
    {#if !istIch}
      <button onclick={() => oeffne('chat', { an: { art: 'person', id } })}>Chat</button>
      <button onclick={() => oeffne('rangebearing', { ziel: { art: 'teilnehmer', id } })}>Range &amp; Bearing</button>
      <button onclick={() => starte({ art: 'teilnehmer', id })}>Bloodhound</button>
      {#if store.istLeitung}<button onclick={() => oeffne('leitung', { tab: 'auftraege', an: id })}>Auftrag: Bloodhound</button>{/if}
    {/if}
  </div>
{/if}

<style>
  .kopf {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .zeichen {
    min-width: 56px;
    display: grid;
    place-items: center;
  }
  .rufname {
    font-size: 1.25rem;
    font-weight: 700;
  }
  .badge {
    margin-left: 8px;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 0.75rem;
    vertical-align: middle;
  }
  .status {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 12px 0 4px;
    padding: 10px 12px;
    border-left: 4px solid var(--farbe);
    background: var(--bg);
    border-radius: 8px;
  }
  .punkt {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--farbe);
    flex: none;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 12px 0;
  }
  dt {
    color: var(--text-2);
  }
  dd {
    margin: 0;
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
    margin-left: 6px;
  }
  .aktionen {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .aktionen button {
    flex: 1 1 30%;
  }
</style>
