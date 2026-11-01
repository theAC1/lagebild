<script lang="ts">
  // Menü › Über (Spec v7): Web-Stand, Protokoll, App-Update, Link zur Android-App (im Browser, wenn der Server eine anbietet).
  import { PROTOKOLL_VERSION } from '../../../../shared/protocol.ts';
  import { liesAppVersion, type AppVersion } from '../../lib/appVersion.ts';
  import { istApp } from '../../lib/umgebung.ts';
  import { apkHerunterladen, neuLaden, update } from '../../lib/update.svelte.ts';

  let apk = $state<AppVersion>();
  if (!istApp())
    fetch('/app/version.json')
      .then((r) => (r.ok ? r.json() : undefined))
      .then((j) => (apk = liesAppVersion(j)))
      .catch(() => {});
</script>

<div class="ueber">
  <div>
    <strong class="app">Lagebild</strong>
    <div class="leise">Ausbildungs- und Testmittel · Funk bleibt primär</div>
  </div>
  <dl>
    <dt>Web-Stand</dt>
    <dd class="mono">{__WEB_CODE__ || 'Entwicklung'}</dd>
    <dt>Protokoll</dt>
    <dd class="mono">{PROTOKOLL_VERSION}</dd>
    <dt>Update</dt>
    <dd>{update.bereit ? 'Neue Version bereit' : update.appNeu ? 'Neue App-Version' : 'aktuell'}</dd>
  </dl>
  {#if update.bereit}<button class="primaer" onclick={() => neuLaden(true)}>Neu laden</button>{/if}
  {#if update.appNeu}<button onclick={() => apkHerunterladen()}>Neue App-Version herunterladen</button>{/if}
  {#if apk}
    <a class="knopf" href="/app/lagebild.apk" download>Android-App installieren ({apk.versionName})</a>
  {/if}
</div>

<style>
  .ueber {
    display: grid;
    gap: 12px;
  }
  .app {
    font-size: 1.15rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    margin: 0;
  }
  dt {
    color: var(--text-2);
  }
  dd {
    margin: 0;
  }
  .knopf {
    display: grid;
    place-items: center;
    min-height: var(--touch);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
  }
</style>
