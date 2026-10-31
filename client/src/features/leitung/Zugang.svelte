<script lang="ts">
  import type { CodeRolle } from '../../../../shared/protocol.ts';
  import { ROLLE_NAME } from '../../../../shared/regeln/rollen.ts';
  import { sendeBestaetigt, store } from '../../lib/store.svelte.ts';
  import { istApp, serverBasis } from '../../lib/umgebung.ts';
  import { lies, schreibe, toast } from '../../lib/ui.svelte.ts';
  import { codeFeld, codesKey, leseCodes, zugangsLink, type GemerkteCodes } from './logik.ts';

  // Der Code bestimmt die Rolle beim Beitritt (Spec v7); Leitung wird man nur per Übergabe
  const ARTEN: CodeRolle[] = ['teilnehmer', 'gruppenfuehrer', 'beobachter'];
  const HINWEIS: Record<CodeRolle, string> = {
    teilnehmer: 'Für alle, die mitarbeiten.',
    gruppenfuehrer: 'Zusätzlich Objekte der eigenen Einheit ändern, ihr Bloodhound-Aufträge geben und ihre Alarme aufheben.',
    beobachter: 'Sieht alles, sendet nichts – auch keine Position.',
  };

  const lageId = $derived(store.lage?.id ?? '');
  let codes = $state<GemerkteCodes>({});
  let art = $state<CodeRolle>('teilnehmer');
  let qr = $state<string | null>(null);

  $effect(() => {
    codes = lageId ? leseCodes(lies(codesKey(lageId))) : {};
  });

  const code = $derived(codes[codeFeld(art)]);
  const link = $derived(code ? zugangsLink(serverBasis(istApp(), location.origin), code) : null);

  $effect(() => {
    const l = link;
    qr = null;
    if (!l) return;
    let aktuell = true;
    import('qrcode') // nur hier gebraucht: nicht im Start-Bundle
      .then(({ toDataURL }) => toDataURL(l, { margin: 2, width: 560, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }))
      .then((url) => aktuell && (qr = url))
      .catch(() => toast('QR-Code konnte nicht erzeugt werden.'));
    return () => (aktuell = false);
  });

  async function teilen() {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: store.lage?.name ?? 'Lagebild', text: `Beitreten zur Mission (${ROLLE_NAME[art]})`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Link kopiert.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Teilen nicht möglich – Link bitte abschreiben.');
    }
  }

  let erneuernFrage = $state(false);

  /** Neuer Code der gewählten Rolle: sperrt Entfernte und abgeflossene Codes aus. Wer schon drin ist, bleibt drin. */
  async function erneuern() {
    erneuernFrage = false;
    const lid = lageId;
    const a = art;
    const antwort: { code?: string } = {};
    const z = await sendeBestaetigt({ typ: 'lage.codeErneuern', art: a }, (m) => m.typ === 'code' && m.art === a && Boolean((antwort.code = m.code)));
    if (z === 'unbestaetigt') return toast('Keine Antwort vom Server – Code evtl. trotzdem erneuert, bitte erneut versuchen.', 8000);
    if (!antwort.code || lid !== lageId) return;
    codes = { ...codes, [codeFeld(a)]: antwort.code };
    schreibe(codesKey(lid), JSON.stringify(codes));
    toast(`Neuer ${ROLLE_NAME[a]}-Code – der alte gilt nicht mehr.`, 6000);
  }

  function vergessen() {
    schreibe(codesKey(lageId), null);
    codes = {};
  }
</script>

<div class="segmente" role="group" aria-label="Code für">
  {#each ARTEN as a (a)}
    <button aria-pressed={art === a} onclick={() => ((art = a), (erneuernFrage = false))}>{ROLLE_NAME[a]}</button>
  {/each}
</div>
<p class="leise klein">{HINWEIS[art]}</p>

{#if code}
  <div class="code-box">
    <span class="leise">{ROLLE_NAME[art]}-Code</span>
    <span class="code mono markierbar">{code}</span>
  </div>
  <div class="qr">
    {#if qr}<img src={qr} alt="QR-Code zum Beitreten: {link}" />{:else}<span class="leise">QR-Code wird erzeugt …</span>{/if}
  </div>
  <p class="link mono">{link}</p>
  <button class="primaer breit" onclick={teilen}>Link teilen</button>
{:else}
  <p class="leise">
    Der {ROLLE_NAME[art]}-Code ist auf diesem Gerät nicht gespeichert (z.B. nach einer Übergabe der Leitung). «Erneuern» erzeugt einen
    neuen; der bisherige gilt dann nicht mehr.
  </p>
{/if}

<div class="erneuern">
  {#if erneuernFrage}
    <div class="frage" role="alert">
      <span>Neuen {ROLLE_NAME[art]}-Code erzeugen? Der alte Code und QR gelten danach nicht mehr; wer schon beigetreten ist, bleibt.</span>
      <div class="knoepfe">
        <button onclick={() => (erneuernFrage = false)}>Abbrechen</button>
        <button class="primaer" onclick={erneuern}>Ja, erneuern</button>
      </div>
    </div>
  {:else}
    <button class="breit" disabled={store.verbindung !== 'verbunden'} onclick={() => (erneuernFrage = true)}>{ROLLE_NAME[art]}-Code erneuern …</button>
    <p class="leise klein">Z.B. nach dem Entfernen einer Person oder wenn der Code abgeflossen ist.</p>
  {/if}
</div>

{#if Object.values(codes).some(Boolean)}
  <button class="breit vergessen" onclick={vergessen}>Codes auf diesem Gerät vergessen</button>
{/if}

<style>
  .code-box {
    display: grid;
    gap: 2px;
    justify-items: center;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .code {
    font-size: clamp(1.8rem, 9vw, 2.6rem);
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .qr {
    display: grid;
    place-items: center;
    margin: 12px auto;
    width: min(100%, 280px);
    aspect-ratio: 1;
    background: #fff;
    border-radius: var(--radius);
  }
  .qr img {
    width: 100%;
    height: auto;
    image-rendering: pixelated;
  }
  .qr .leise {
    color: #333;
  }
  .link {
    margin: 0 0 10px;
    font-size: 0.85rem;
    text-align: center;
    overflow-wrap: anywhere;
    color: var(--text-2);
  }
  .breit {
    width: 100%;
  }
  .erneuern {
    display: grid;
    gap: 6px;
    margin-top: 16px;
  }
  .vergessen {
    margin-top: 12px;
  }
  .segmente {
    margin-bottom: 6px;
  }
  .klein {
    margin: 0;
    font-size: 0.85rem;
  }
  .frage {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--warn);
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
