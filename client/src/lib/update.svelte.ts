// Neue App-Version. Browser: der Service Worker lädt sie im Hintergrund, die Seite läuft bis «Neu laden» auf der alten.
// Kein automatisches Neuladen: das würde offene Eingaben verwerfen (z.B. Sichtung nach dem Kamerawechsel).
// Android-App: kein Service Worker. Zwei Wege, beide ohne Neuladen ohne Zustimmung:
//  1. Oberfläche: /app/web.json prüfen, neues Bundle (zip) im Hintergrund laden (SHA-256 prüft das Plugin), Hinweis
//     «Neu laden»; aktiviert wird beim Antippen oder beim nächsten Start der App. Meldet sich der neue Stand nicht
//     per notifyAppReady() (appBereit), fällt das Plugin auf den letzten guten bzw. den eingebauten Stand zurück.
//  2. Native Änderungen: /app/version.json und Hinweis auf den APK-Download.
import { registerSW } from 'virtual:pwa-register';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { istNeuer, liesAppVersion } from './appVersion.ts';
import { APP_SERVER, apiUrl, istApp } from './umgebung.ts';
import { bundleUrl, liesWebManifest, webAktion } from './webUpdate.ts';

const PRUEF_MS = 30 * 60_000;

export const update = $state({ bereit: false, appNeu: false });

let bereitesBundle: string | undefined; // Plugin-ID des geladenen, noch nicht aktiven Web-Stands
let laedt = false;

/** Neuer Web-Stand vom eigenen Server laden und als «bereit» melden. */
async function pruefeWeb(): Promise<void> {
  if (laedt || bereitesBundle) return;
  laedt = true;
  try {
    const r = await fetch(apiUrl('/app/web.json'), { cache: 'no-store' });
    if (!r.ok) return;
    const m = liesWebManifest(await r.json());
    const nativ = Number((await App.getInfo()).build);
    if (!m || webAktion(m, __WEB_CODE__, nativ) !== 'laden') return;
    const url = bundleUrl(APP_SERVER, m);
    if (!url) return;
    const { bundles } = await CapacitorUpdater.list();
    const da = bundles.find((b) => b.version === String(m.webCode));
    if (da?.status === 'error') return; // schon einmal nicht gestartet: nicht erneut laden, erst ein neuerer Stand
    const b = da?.status === 'pending' ? da : await CapacitorUpdater.download({ url, version: String(m.webCode), checksum: m.sha256 });
    bereitesBundle = b.id;
    update.bereit = true;
  } catch {
    /* offline, Prüfsumme falsch o.ä.: nächster Versuch reicht */
  } finally {
    laedt = false;
  }
}

/** Beim Start: ein früher geladenes, noch nicht aktives Bundle gleich übernehmen (noch nichts in Arbeit). */
async function wendeBereitesAn(): Promise<void> {
  try {
    const { bundles } = await CapacitorUpdater.list();
    const neu = bundles.filter((b) => b.status === 'pending' && Number(b.version) > __WEB_CODE__).sort((a, b) => Number(b.version) - Number(a.version))[0];
    if (neu) await CapacitorUpdater.set({ id: neu.id });
  } catch {
    /* weiter mit dem laufenden Stand */
  }
}

/** Meldet dem Plugin, dass dieser Stand gestartet ist; sonst rollt es nach appReadyTimeout zurück. Nach dem Mounten aufrufen. */
export const appBereit = (): void => {
  if (istApp()) void CapacitorUpdater.notifyAppReady().catch(() => {});
};

async function pruefeApp(): Promise<void> {
  try {
    const r = await fetch(apiUrl('/app/version.json'), { cache: 'no-store' });
    if (!r.ok) return;
    const eigen = Number((await App.getInfo()).build);
    update.appNeu = istNeuer(eigen, liesAppVersion(await r.json()));
  } catch {
    /* offline: nächster Versuch reicht */
  }
}

/** Öffnet den APK-Download im System-Browser. */
export const apkHerunterladen = (): Promise<void> => Browser.open({ url: apiUrl('/app/lagebild.apk') });

function starteAppPruefung(): void {
  const alles = () => void Promise.all([pruefeApp(), pruefeWeb()]);
  void wendeBereitesAn().then(alles);
  setInterval(alles, PRUEF_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && alles());
}

export const neuLaden: (neuLaden?: boolean) => Promise<void> = istApp()
  ? (starteAppPruefung(), async () => {
      if (bereitesBundle) await CapacitorUpdater.set({ id: bereitesBundle }); // lädt die Seite neu
    })
  : registerSW({
      onNeedRefresh: () => (update.bereit = true),
      // Installierte PWAs bleiben oft tagelang im Speicher: beim Zurückholen und periodisch nachsehen
      onRegisteredSW(_url, r) {
        if (!r) return;
        const pruefe = () => r.update().catch(() => {}); // offline: nächster Versuch reicht
        setInterval(pruefe, PRUEF_MS);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pruefe());
      },
    });
