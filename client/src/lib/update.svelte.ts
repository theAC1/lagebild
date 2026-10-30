// Neue App-Version. Browser: der Service Worker lädt sie im Hintergrund, die Seite läuft bis «Neu laden» auf der alten.
// Kein automatisches Neuladen: das würde offene Eingaben verwerfen (z.B. Sichtung nach dem Kamerawechsel).
// Android-App: kein Service Worker; stattdessen fragt sie /app/version.json ab und verweist auf den APK-Download.
import { registerSW } from 'virtual:pwa-register';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { istNeuer, liesAppVersion } from './appVersion.ts';
import { apiUrl, istApp } from './umgebung.ts';

const PRUEF_MS = 30 * 60_000;

export const update = $state({ bereit: false, appNeu: false });

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
  void pruefeApp();
  setInterval(pruefeApp, PRUEF_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void pruefeApp());
}

export const neuLaden: (neuLaden?: boolean) => Promise<void> = istApp()
  ? (starteAppPruefung(), async () => {})
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
