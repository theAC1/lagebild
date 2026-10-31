<script lang="ts">
  import { ROLLE_NAME } from '../../../../shared/regeln/rollen.ts';
  import { formatAlter, send, serverJetzt, store } from '../../lib/store.svelte.ts';
  import RolleVerwalten from './RolleVerwalten.svelte';
  import { symbolSvg } from '../../lib/symbol.ts';
  import { groesse } from '../../lib/groesse.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';

  let fragen = $state<string | null>(null);
  let verwalten = $state<string | null>(null);

  const liste = $derived(
    [...store.teilnehmer.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.rufname.localeCompare(b.rufname, 'de')),
  );

  function entfernen(id: string) {
    if (!send({ typ: 'teilnehmer.entfernen', id })) return toast('Keine Verbindung – bitte später erneut.');
    fragen = null;
  }
</script>

<p class="leise">{liste.filter((t) => t.online).length} von {liste.length} online</p>
<ul>
  {#each liste as t (t.id)}
    {@const ich = t.id === store.ich}
    <li>
      <div class="zeile" class:offline={!t.online}>
        <span class="zeichen">{@html symbolSvg(t.sidc, { size: 18 * groesse.ui })}</span>
        <span class="name">
          <strong>{t.rufname}{ich ? ' (ich)' : ''}{t.rolle !== 'teilnehmer' ? ` · ${ROLLE_NAME[t.rolle]}` : ''}</strong>
          <span class="leise">{t.einheit}{t.funktion ? ` · ${t.funktion}` : ''}{t.geraet ? ` · ${t.geraet}` : ''}</span>
          <span class="leise">
            {#if t.online}<span class="online">online</span>{:else}offline{/if} · zuletzt {formatAlter(serverJetzt() - t.zuletzt)}
          </span>
        </span>
        {#if !ich}
          <span class="aktion">
            <button aria-label="Rolle von {t.rufname}" aria-expanded={verwalten === t.id} onclick={() => (verwalten = verwalten === t.id ? null : t.id)}>Rolle</button>
            <button class="gefahr" aria-label="{t.rufname} entfernen" onclick={() => (fragen = fragen === t.id ? null : t.id)}>Entfernen</button>
          </span>
        {/if}
      </div>
      {#if verwalten === t.id}
        <div class="rolle"><RolleVerwalten {t} /></div>
      {/if}
      {#if fragen === t.id}
        <div class="frage" role="alert">
          <span><strong>{t.rufname}</strong> aus der Mission entfernen? Das Gerät wird abgemeldet; mit einem Code kann es wieder beitreten.</span>
          <div class="knoepfe">
            <button onclick={() => (fragen = null)}>Abbrechen</button>
            <button class="gefahr" onclick={() => entfernen(t.id)}>Ja, entfernen</button>
          </div>
        </div>
      {/if}
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
    display: flex;
    flex-wrap: wrap; /* schmales Panel (quer): Knöpfe unter den Namen statt ihn auf einen Buchstaben zu quetschen */
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .zeile.offline {
    opacity: 0.7;
  }
  .zeichen {
    width: min(44px, 12vw);
    display: grid;
    place-items: center;
    flex: none;
  }
  .name {
    flex: 1 1 9rem;
    min-width: 0;
    display: grid;
  }
  .name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* grosse Bediengrösse: Rufname umbrechen statt abschneiden */
  .name > strong {
    white-space: normal;
  }
  .aktion {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .zeile button {
    padding: 0 10px;
  }
  .rolle {
    margin-top: 4px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .online {
    color: var(--ok);
  }
  .frage {
    display: grid;
    gap: 8px;
    margin-top: 4px;
    padding: 10px;
    border: 1px solid var(--danger);
    border-radius: var(--radius);
  }
  .knoepfe {
    display: flex;
    gap: 8px;
  }
  .knoepfe button {
    flex: 1;
  }
</style>
