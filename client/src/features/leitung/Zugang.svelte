<script lang="ts">
  import { toDataURL } from 'qrcode';
  import { store } from '../../lib/store.svelte.ts';
  import { lies, schreibe, toast } from '../../lib/ui.svelte.ts';
  import { codesKey, leseCodes, zugangsLink, type GemerkteCodes } from './logik.ts';

  const lageId = $derived(store.lage?.id ?? '');
  let codes = $state<GemerkteCodes>({});
  let eingabe = $state('');
  let qr = $state<string | null>(null);
  let leitungZeigen = $state(false);

  $effect(() => {
    codes = lageId ? leseCodes(lies(codesKey(lageId))) : {};
  });

  const link = $derived(codes.teilnehmerCode ? zugangsLink(location.origin, codes.teilnehmerCode) : null);

  $effect(() => {
    const l = link;
    qr = null;
    if (!l) return;
    let aktuell = true;
    toDataURL(l, { margin: 2, width: 560, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => aktuell && (qr = url))
      .catch(() => toast('QR-Code konnte nicht erzeugt werden.'));
    return () => (aktuell = false);
  });

  function uebernehmen(e: SubmitEvent) {
    e.preventDefault();
    const code = eingabe.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(code)) return toast('Code: 6–12 Buchstaben/Ziffern.');
    codes = { ...codes, teilnehmerCode: code };
    schreibe(codesKey(lageId), JSON.stringify(codes));
    eingabe = '';
  }

  async function teilen() {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: store.lage?.name ?? 'Lagebild', text: 'Beitreten zur Lage', url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Link kopiert.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Teilen nicht möglich – Link bitte abschreiben.');
    }
  }

  function vergessen() {
    schreibe(codesKey(lageId), null);
    codes = {};
  }
</script>

{#if codes.teilnehmerCode}
  <div class="code-box">
    <span class="leise">Teilnehmer-Code</span>
    <span class="code mono">{codes.teilnehmerCode}</span>
  </div>
  <div class="qr">
    {#if qr}<img src={qr} alt="QR-Code zum Beitreten: {link}" />{:else}<span class="leise">QR-Code wird erzeugt …</span>{/if}
  </div>
  <p class="link mono">{link}</p>
  <button class="primaer breit" onclick={teilen}>Link teilen</button>
{:else}
  <p class="leise">
    Der Teilnehmer-Code wird nur beim Erstellen der Lage angezeigt und ist auf diesem Gerät nicht gespeichert. Code hier eingeben, um den
    QR-Code zu erzeugen:
  </p>
  <form class="eingabe" onsubmit={uebernehmen}>
    <input class="mono" bind:value={eingabe} placeholder="Teilnehmer-Code" autocomplete="off" autocapitalize="characters" maxlength="12" />
    <button class="primaer" type="submit">Übernehmen</button>
  </form>
{/if}

{#if codes.leitungCode}
  <div class="leitung">
    {#if leitungZeigen}
      <div class="code-box warnung">
        <span class="leise">Leitungs-Code</span>
        <span class="code mono">{codes.leitungCode}</span>
      </div>
      <button class="breit" onclick={() => (leitungZeigen = false)}>Leitungs-Code verbergen</button>
    {:else}
      <button class="breit" onclick={() => (leitungZeigen = true)}>Leitungs-Code anzeigen</button>
    {/if}
  </div>
{/if}
<p class="hinweis">
  Der Leitungs-Code gibt volle Kontrolle über die Lage. Er ist nur beim Erstellen sichtbar und lässt sich nicht wiederherstellen – nie per
  QR oder Chat weitergeben.
</p>
{#if codes.teilnehmerCode || codes.leitungCode}
  <button class="breit" onclick={vergessen}>Codes auf diesem Gerät vergessen</button>
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
  .code-box.warnung {
    border-color: var(--warn);
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
  .eingabe {
    display: flex;
    gap: 8px;
  }
  .eingabe input {
    text-transform: uppercase;
  }
  .leitung {
    display: grid;
    gap: 8px;
    margin-top: 16px;
  }
  .hinweis {
    color: var(--warn);
    font-size: 0.9rem;
  }
</style>
