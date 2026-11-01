<script lang="ts">
  // Menü › Beitreten und › Neue Mission (Spec v7): Rufname und Funktion vorausgefüllt (zuletzt benutzt), Einheit und Symbol
  // aus dem Profil; fehlt die Einheit dort, fragt das Formular sie mit ab. Das eröffnende Gerät ist sofort Leitung.
  import { beitrittsText, eroeffnungsText, type Beigetreten, type LageErstellt } from '../../../../shared/protocol.ts';
  import { codesKey } from '../../features/leitung/logik.ts';
  import { ausweisen } from '../../lib/geraet.ts';
  import { profil, setzeProfil } from '../../lib/profil.svelte.ts';
  import { anmelden, postJson } from '../../lib/store.svelte.ts';
  import { schreibe, toast } from '../../lib/ui.svelte.ts';

  let { modus }: { modus: 'beitreten' | 'neu' } = $props();

  let code = $state(new URLSearchParams(location.search).get('code')?.toUpperCase() ?? '');
  let rufname = $state(profil.rufname);
  let funktion = $state(profil.funktion);
  let einheit = $state(profil.einheit);
  const einheitFehlt = !profil.einheit; // nur beim Öffnen der Seite entscheiden, sonst verschwindet das Feld beim Tippen
  let lageName = $state('');
  let passwort = $state('');
  let laeuft = $state(false);
  let fehler = $state<string | null>(null);

  async function absenden(e: SubmitEvent) {
    e.preventDefault();
    laeuft = true;
    fehler = null;
    const person = { rufname: rufname.trim(), einheit: einheit.trim(), funktion: funktion.trim(), sidc: profil.sidc };
    try {
      let b: Beigetreten;
      let name = '';
      if (modus === 'beitreten') {
        const c = code.trim().toUpperCase();
        b = await postJson<Beigetreten>('/api/beitreten', { code: c, ...person, geraet: await ausweisen((ch) => beitrittsText(ch, c)) });
        history.replaceState(null, '', location.pathname); // Code nicht in der Adresszeile lassen
      } else {
        name = lageName.trim();
        const l = await postJson<LageErstellt>('/api/lage', { name, erstellPasswort: passwort, phase: 'ap', ...person, geraet: await ausweisen((ch) => eroeffnungsText(ch, name)) });
        passwort = '';
        // Für Leitung › Zugang (QR, Link); das Leitungs-Token liegt ohnehin auf diesem Gerät
        schreibe(codesKey(l.lageId), JSON.stringify({ teilnehmerCode: l.teilnehmerCode, gruppenfuehrerCode: l.gruppenfuehrerCode, beobachterCode: l.beobachterCode }));
        toast('Mission eröffnet – die Codes stehen unter Leitung › Zugang.', 6000);
        b = l;
      }
      setzeProfil({ rufname: person.rufname, funktion: person.funktion, einheit: person.einheit });
      anmelden(b, { name, phase: modus === 'neu' ? 'ap' : 'lv', rufname: person.rufname, funktion: person.funktion });
    } catch (err) {
      fehler = (err as Error).message;
    } finally {
      laeuft = false;
    }
  }
</script>

<form class="formular" onsubmit={absenden}>
  {#if modus === 'beitreten'}
    <label class="feld breit"
      >Code
      <input
        class="mono code"
        bind:value={code}
        required
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        pattern="[A-Za-z0-9]{'{6,12}'}"
        placeholder="z.B. K7MP3XQ9"
      />
    </label>
  {:else}
    <label class="feld breit">Name der Mission <input bind:value={lageName} required maxlength="80" placeholder="z.B. Übung Gantrisch" /></label>
    <label class="feld breit">Erstell-Passwort <input type="password" bind:value={passwort} required autocomplete="current-password" /></label>
  {/if}
  <label class="feld">Rufname <input bind:value={rufname} required maxlength="32" autocomplete="nickname" placeholder="z.B. Adler 1" /></label>
  <label class="feld">Funktion <input bind:value={funktion} maxlength="32" placeholder="z.B. Grfhr" list="funktionen" /></label>
  {#if einheitFehlt}
    <label class="feld breit">Einheit <input bind:value={einheit} required maxlength="32" placeholder="z.B. Zug 2" /></label>
  {:else}
    <p class="leise breit">Einheit <strong>{profil.einheit}</strong> und Symbol aus dem Profil</p>
  {/if}
  {#if fehler}<p class="fehler breit" role="alert">{fehler}</p>{/if}
  {#if modus === 'beitreten'}
    <button class="primaer breit" disabled={laeuft}>{laeuft ? 'Verbinde …' : 'Beitreten'}</button>
  {:else}
    <button class="primaer breit" disabled={laeuft}>{laeuft ? 'Eröffne …' : 'Mission eröffnen'}</button>
    <p class="leise breit">Du bist sofort Leitung. Die Codes stehen danach unter Leitung › Zugang.</p>
  {/if}
</form>

<style>
  .formular {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px 8px;
  }
  .breit {
    grid-column: 1 / -1;
  }
  p {
    margin: 0;
  }
  .code {
    text-transform: uppercase;
    letter-spacing: 0.15em;
    font-size: 1.1rem;
  }
  .fehler {
    color: var(--danger);
  }
  /* Hauptknopf bleibt sichtbar, wenn das Formular quer scrollt (Neue Mission) */
  .primaer {
    position: sticky;
    bottom: 0;
    box-shadow: 0 0 0 6px var(--surface-glas);
  }
</style>
