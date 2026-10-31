<script lang="ts">
  import type { Beigetreten, LageErstellt } from '../../../shared/protocol.ts';
  import SymbolPicker from '../lib/SymbolPicker.svelte';
  import { anmelden, postJson } from '../lib/store.svelte.ts';
  import { STANDARD_SIDC } from '../lib/symbol.ts';
  import { lies, schreibe } from '../lib/ui.svelte.ts';
  import { liesAppVersion, type AppVersion } from '../lib/appVersion.ts';
  import { istApp } from '../lib/umgebung.ts';

  const PROFIL_KEY = 'lagebild.profil';
  // ATAK-Rollen als Vorschlag (Bridge: Grfhr/Zfhr→Team Lead, KP→HQ, San→Medic, Funker→RTO, Schfs→Sniper, Beob→FO, Hundeführer→K9)
  const FUNKTIONS_VORSCHLAEGE = ['Sdt', 'Grfhr', 'Zfhr', 'Kdt', 'KP', 'San', 'Funker', 'Schfs', 'Beob', 'Hundeführer'];
  const profil = (() => {
    try {
      return JSON.parse(lies(PROFIL_KEY) ?? '{}');
    } catch {
      return {};
    }
  })();

  let modus = $state<'beitreten' | 'erstellen'>('beitreten');
  let code = $state(new URLSearchParams(location.search).get('code')?.toUpperCase() ?? '');
  let rufname = $state<string>(profil.rufname ?? '');
  let einheit = $state<string>(profil.einheit ?? '');
  let funktion = $state<string>(profil.funktion ?? '');
  let sidc = $state<string>(profil.sidc ?? STANDARD_SIDC);
  let symbolOffen = $state(false);

  let lageName = $state('');
  let passwort = $state('');
  let erstellt = $state<LageErstellt | null>(null);

  // Android-Browser: Link zur App, nur wenn der Server eine APK anbietet
  let apk = $state<AppVersion>();
  if (!istApp() && /Android/i.test(navigator.userAgent))
    fetch('/app/version.json')
      .then((r) => (r.ok ? r.json() : undefined))
      .then((j) => (apk = liesAppVersion(j)))
      .catch(() => {});

  let laeuft = $state(false);
  let fehler = $state<string | null>(null);

  async function beitreten(e: SubmitEvent) {
    e.preventDefault();
    laeuft = true;
    fehler = null;
    try {
      const b = await postJson<Beigetreten>('/api/beitreten', {
        code: code.trim().toUpperCase(),
        rufname: rufname.trim(),
        einheit: einheit.trim(),
        funktion: funktion.trim(),
        sidc,
      });
      schreibe(PROFIL_KEY, JSON.stringify({ rufname, einheit, funktion, sidc }));
      history.replaceState(null, '', location.pathname); // Code nicht in der Adresszeile lassen
      anmelden(b);
    } catch (err) {
      fehler = (err as Error).message;
    } finally {
      laeuft = false;
    }
  }

  async function erstellen(e: SubmitEvent) {
    e.preventDefault();
    laeuft = true;
    fehler = null;
    try {
      erstellt = await postJson<LageErstellt>('/api/lage', { name: lageName.trim(), erstellPasswort: passwort, phase: 'ap' });
      passwort = '';
      // Für Leitung › Zugang (QR, Link). Der Leitungs-Code gibt nicht mehr Rechte als das Leitungs-Token, das ohnehin hier liegt.
      schreibe(`lagebild.codes.${erstellt.lageId}`, JSON.stringify({ teilnehmerCode: erstellt.teilnehmerCode, leitungCode: erstellt.leitungCode }));
    } catch (err) {
      fehler = (err as Error).message;
    } finally {
      laeuft = false;
    }
  }

  function alsLeitungWeiter() {
    if (!erstellt) return;
    code = erstellt.leitungCode;
    erstellt = null;
    modus = 'beitreten';
  }
</script>

<div class="huelle">
  <div class="karte">
    <header>
      <h1>Lagebild</h1>
      <p class="leise">Ausbildungs- und Testmittel · Funk bleibt primär</p>
    </header>

    {#if erstellt}
      <div class="codes">
        <p><strong>Lage erstellt.</strong> Codes jetzt notieren:</p>
        <div class="code-box">
          <span class="leise">Teilnehmer-Code</span>
          <span class="code mono markierbar">{erstellt.teilnehmerCode}</span>
        </div>
        <div class="code-box leitung">
          <span class="leise">Leitungs-Code</span>
          <span class="code mono markierbar">{erstellt.leitungCode}</span>
        </div>
        <p class="warnung">Leitungs-Code sicher aufbewahren – er lässt sich nicht wiederherstellen und gibt volle Kontrolle über die Lage.</p>
        <button class="primaer" onclick={alsLeitungWeiter}>Weiter: als Leitung beitreten</button>
      </div>
    {:else}
      <div class="segmente" role="group" aria-label="Modus">
        <button aria-pressed={modus === 'beitreten'} onclick={() => (modus = 'beitreten')}>Lage beitreten</button>
        <button aria-pressed={modus === 'erstellen'} onclick={() => (modus = 'erstellen')}>Neue Lage erstellen</button>
      </div>

      {#if modus === 'beitreten'}
        <form onsubmit={beitreten}>
          <label class="feld">Code
            <input
              class="mono code-eingabe"
              bind:value={code}
              required
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              pattern="[A-Za-z0-9]{'{6,12}'}"
              placeholder="z.B. K7MP3XQ9"
            />
          </label>
          <label class="feld">Rufname <input bind:value={rufname} required maxlength="32" autocomplete="nickname" placeholder="z.B. Adler 1" /></label>
          <div class="zwei">
            <label class="feld">Einheit <input bind:value={einheit} required maxlength="32" placeholder="z.B. Zug 2" /></label>
            <label class="feld">Funktion <input bind:value={funktion} maxlength="32" placeholder="z.B. Grfhr" list="funktionen" /></label>
            <datalist id="funktionen">
              {#each FUNKTIONS_VORSCHLAEGE as f (f)}<option value={f}></option>{/each}
            </datalist>
          </div>
          <div class="feld">
            <span>Eigenes Symbol</span>
            {#if symbolOffen}
              <SymbolPicker value={sidc} onchange={(s) => (sidc = s)} />
            {:else}
              <button type="button" class="symbol-knopf" onclick={() => (symbolOffen = true)}>Symbol wählen …</button>
            {/if}
          </div>
          {#if fehler}<p class="fehler" role="alert">{fehler}</p>{/if}
          <button class="primaer" disabled={laeuft}>{laeuft ? 'Verbinde …' : 'Beitreten'}</button>
        </form>
      {:else}
        <form onsubmit={erstellen}>
          <label class="feld">Name der Lage <input bind:value={lageName} required maxlength="80" placeholder="z.B. Übung Gantrisch" /></label>
          <label class="feld">Erstell-Passwort <input type="password" bind:value={passwort} required autocomplete="current-password" /></label>
          {#if fehler}<p class="fehler" role="alert">{fehler}</p>{/if}
          <button class="primaer" disabled={laeuft}>{laeuft ? 'Erstelle …' : 'Lage erstellen'}</button>
        </form>
      {/if}
    {/if}
    {#if apk}
      <a class="app-link leise" href="/app/lagebild.apk" download>Android-App installieren ({apk.versionName})</a>
    {/if}
  </div>
</div>

<style>
  .app-link {
    justify-self: center;
    font-size: 0.85rem;
  }
  .huelle {
    position: fixed;
    inset: 0;
    z-index: 28; /* unter den Toasts (29) */
    overflow-y: auto;
    display: grid;
    align-items: end;
    padding: calc(16px + var(--safe-top)) 12px calc(12px + var(--safe-bottom));
    background: linear-gradient(to bottom, rgb(22 27 31 / 0.15), rgb(22 27 31 / 0.75) 45%);
  }
  .karte {
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    display: grid;
    gap: 14px;
    padding: 18px 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 20px;
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
  }
  h1 {
    margin: 0;
    font-size: 1.6rem;
    letter-spacing: 0.02em;
  }
  header p {
    margin: 2px 0 0;
  }
  form {
    display: grid;
    gap: 12px;
  }
  .zwei {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .code-eingabe {
    text-transform: uppercase;
    letter-spacing: 0.15em;
    font-size: 1.15rem;
  }
  .symbol-knopf {
    justify-self: start;
  }
  .fehler {
    margin: 0;
    color: var(--danger);
  }
  .codes {
    display: grid;
    gap: 10px;
  }
  .codes p {
    margin: 0;
  }
  .code-box {
    display: grid;
    padding: 12px;
    background: var(--bg);
    border-radius: var(--radius);
  }
  .code-box.leitung {
    border: 1px solid var(--warn);
  }
  .code {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    user-select: all;
  }
  .warnung {
    color: var(--warn);
  }
</style>
