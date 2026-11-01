<script lang="ts">
  // Ebenen: Sichtbarkeit (lokal, alle), aktive Ebene für neue Zeichnungen, Verwalten (nur Leitung, nur Desktop), Import/Export.
  // Sichtbarkeit und Export gibt es für alle Rollen und Phasen auch unter «Karte und Ebenen» (index.ts, Juan 01.11.).
  import { standardEbeneId, type ClientMsg, type Ebene } from '../../../../shared/protocol.ts';
  import { sendeBestaetigt, send, store } from '../../lib/store.svelte.ts';
  import { toast } from '../../lib/ui.svelte.ts';
  import Austausch from './austausch/Austausch.svelte';
  import { ebenenListe, setzeSichtbar, zielEbene, zn } from './zustand.svelte.ts';

  let { verwalten }: { verwalten: boolean } = $props();

  const liste = $derived(ebenenListe());
  const anzahl = $derived.by(() => {
    const n = new Map<string, number>();
    for (const z of store.zeichnungen.values()) n.set(z.ebeneId, (n.get(z.ebeneId) ?? 0) + 1);
    return n;
  });
  const leitung = $derived(store.istLeitung && verwalten);
  const standard = $derived(store.lage ? standardEbeneId(store.lage.id) : '');
  const aktiv = $derived((void zn.aktiveEbene, void store.ebenen.size, zielEbene()));

  let neuName = $state('');
  let umbenennen = $state<string | null>(null);
  let loeschenFragen = $state<string | null>(null);

  const sende = (m: ClientMsg) => send(m) || (toast('Keine Verbindung – Ebene nicht geändert.'), false);

  async function anlegen() {
    const name = neuName.trim().slice(0, 60);
    if (!name) return;
    if (liste.some((e) => e.name === name)) return toast('Ebenen-Name bereits vergeben');
    const r = await sendeBestaetigt({ typ: 'ebene.neu', name }, (m) => m.typ === 'ebene' && m.ebene.name === name);
    if (r === 'unbestaetigt') return toast('Keine Verbindung – Ebene nicht angelegt.');
    if (r !== 'bestaetigt') return;
    neuName = '';
    const neu = liste.find((e) => e.name === name);
    if (neu) zn.aktiveEbene = neu.id;
  }
  function benenne(e: Ebene, name: string) {
    umbenennen = null;
    const n = name.trim().slice(0, 60);
    if (n && n !== e.name) sende({ typ: 'ebene.aendern', id: e.id, name: n });
  }
  /** Ebene eine Stelle nach oben/unten: alle Ränge neu durchnummerieren (gleiche Ränge wären sonst nicht tauschbar). */
  function verschiebe(i: number, um: -1 | 1) {
    const neu = [...liste];
    [neu[i], neu[i + um]] = [neu[i + um], neu[i]];
    neu.forEach((e, rang) => e.reihenfolge !== rang && sende({ typ: 'ebene.aendern', id: e.id, reihenfolge: rang }));
  }
  function loeschen(e: Ebene) {
    loeschenFragen = null;
    if (sende({ typ: 'ebene.loeschen', id: e.id }) && zn.aktiveEbene === e.id) zn.aktiveEbene = null;
  }
</script>

<ul class="ebenen" aria-label="Ebenen">
  {#each liste as e, i (e.id)}
    {@const n = anzahl.get(e.id) ?? 0}
    {@const beschreibbar = !e.gesperrt || store.istLeitung}
    <li class="ebene" class:aus={zn.ausgeblendet.has(e.id)}>
      <div class="zeile">
        <label class="sicht" title="Auf meiner Karte zeigen">
          <input type="checkbox" checked={!zn.ausgeblendet.has(e.id)} onchange={(ev) => setzeSichtbar(e.id, (ev.target as HTMLInputElement).checked)} aria-label="{e.name} anzeigen" />
        </label>
        {#if umbenennen === e.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="name-feld" value={e.name} maxlength="60" autofocus aria-label="Neuer Name" onkeydown={(ev) => ev.key === 'Enter' ? benenne(e, (ev.target as HTMLInputElement).value) : ev.key === 'Escape' && (ev.preventDefault(), (umbenennen = null))} onblur={(ev) => benenne(e, (ev.target as HTMLInputElement).value)} />
        {:else}
          <span class="name">{e.name}</span>
        {/if}
        <span class="leise zahl" title="Zeichnungen">{n}</span>
        {#if e.gesperrt}<span class="schloss" title="Gesperrt: nur Leitung bearbeitet" aria-label="gesperrt">🔒</span>{/if}
        {#if verwalten}
          <label class="aktiv" title={beschreibbar ? 'Neue Zeichnungen in diese Ebene' : 'Gesperrt'}>
            <input type="radio" name="aktive-ebene" checked={aktiv === e.id} disabled={!beschreibbar} onchange={() => (zn.aktiveEbene = e.id)} aria-label="{e.name} als aktive Ebene" />
            aktiv
          </label>
        {/if}
      </div>
      {#if leitung}
        {#if loeschenFragen === e.id}
          <div class="frage">
            <span>«{e.name}» löschen? {n ? `${n} Zeichnung${n === 1 ? '' : 'en'} werden mitgelöscht.` : 'Die Ebene ist leer.'}</span>
            <button onclick={() => (loeschenFragen = null)}>Abbrechen</button>
            <button class="gefahr" onclick={() => loeschen(e)}>Löschen</button>
          </div>
        {:else}
          <div class="werkzeuge">
            <button onclick={() => (umbenennen = e.id)}>Umbenennen</button>
            <button onclick={() => sende({ typ: 'ebene.aendern', id: e.id, gesperrt: !e.gesperrt })}>{e.gesperrt ? 'Entsperren' : 'Sperren'}</button>
            <button class="icon" aria-label="{e.name} nach oben" disabled={i === 0} onclick={() => verschiebe(i, -1)}>↑</button>
            <button class="icon" aria-label="{e.name} nach unten" disabled={i === liste.length - 1} onclick={() => verschiebe(i, 1)}>↓</button>
            {#if e.id !== standard}<button class="gefahr" onclick={() => (loeschenFragen = e.id)}>Löschen</button>{/if}
          </div>
        {/if}
      {/if}
    </li>
  {/each}
</ul>

{#if leitung}
  <form class="neu" onsubmit={(e) => (e.preventDefault(), anlegen())}>
    <input bind:value={neuName} maxlength="60" placeholder="z. B. «Phase 1»" aria-label="Name der neuen Ebene" />
    <button class="primaer" disabled={!neuName.trim()}>Anlegen</button>
  </form>
{:else if verwalten}
  <p class="leise">Ebenen anlegen, sperren und löschen kann die Leitung.</p>
{/if}
<Austausch />

<style>
  .ebenen {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .ebene {
    padding: 6px 8px;
    background: var(--bg);
    border-radius: 8px;
  }
  .ebene.aus .name {
    color: var(--text-2);
    text-decoration: line-through;
  }
  .zeile {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
  }
  .sicht input,
  .aktiv input {
    width: 20px;
    min-height: 20px;
    margin: 0;
    accent-color: var(--accent);
  }
  .sicht {
    display: grid;
    place-items: center;
    width: 32px;
    min-height: 40px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .name-feld {
    flex: 1;
    min-height: 34px;
    padding: 4px 8px;
  }
  .aktiv {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--text-2);
  }
  .werkzeuge,
  .frage {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .werkzeuge button,
  .frage button {
    min-height: 32px;
    padding: 0 10px;
    font-size: 0.85rem;
  }
  .werkzeuge .icon {
    width: 32px;
  }
  .frage span {
    width: 100%;
    font-size: 0.85rem;
  }
  .neu {
    display: flex;
    gap: 8px;
  }
</style>
