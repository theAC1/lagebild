// Neue App-Version. Browser: der Service Worker lädt sie im Hintergrund, die Seite läuft bis «Neu laden» auf der alten.
// Kein automatisches Neuladen: das würde offene Eingaben verwerfen (z.B. Sichtung nach dem Kamerawechsel).
// Android-App: kein Service Worker. Zwei Wege, beide ohne Neuladen ohne Zustimmung:
//  1. Oberfläche (webUpdate.ts): /app/web.json prüfen, nur gesiegelte Stände (updateSchluessel.ts) im Hintergrund laden
//     (SHA-256 prüft das Plugin), Hinweis «Neu laden» je nach Stufe (Später, bei normal auch Überspringen); aktiviert wird
//     nur beim Antippen, nie von selbst beim Start oder im Hintergrund. Meldet sich der neue Stand nicht per notifyAppReady() (appBereit), fällt das Plugin auf den letzten guten
//     bzw. den eingebauten Stand zurück.
//  2. Native Änderungen: /app/version.json und Hinweis auf den APK-Download.
import { registerSW } from 'virtual:pwa-register';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { istNeuer, liesAppVersion } from './appVersion.ts';
import { APP_SERVER, apiUrl, istApp } from './umgebung.ts';
import { lies, schreibe } from './ui.svelte.ts';
import { UPDATE_SCHLUESSEL } from './updateSchluessel.ts';
import { webUpdater, type Angebot } from './webUpdate.ts';

const PRUEF_MS = 30 * 60_000;

/** web: angebotener Stand der App (undefined in der PWA); spaeter: «Später» getippt, gilt bis zum nächsten Zurückholen. */
export const update = $state<{ bereit: boolean; appNeu: boolean; web?: Angebot; spaeter: boolean }>({ bereit: false, appNeu: false, spaeter: false });

const web = webUpdater({
  lader: CapacitorUpdater,
  schluessel: UPDATE_SCHLUESSEL,
  laufend: __WEB_CODE__,
  basis: APP_SERVER,
  manifest: async () => {
    const r = await fetch(apiUrl('/app/web.json'), { cache: 'no-store' });
    return r.ok ? r.json() : undefined;
  },
  nativ: async () => Number((await App.getInfo()).build),
  bereit: (a) => ((update.web = a), (update.bereit = true)),
  lies,
  schreibe,
});

export const spaeter = (): void => void (update.spaeter = true);

/** Nur Stufe normal (webUpdate.ts prüft das ebenfalls). */
export function ueberspringen(): void {
  if (update.web?.stufe !== 'normal') return;
  web.ueberspringen();
  update.bereit = false;
}

document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && (update.spaeter = false));

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
  const alles = () => void Promise.all([pruefeApp(), web.pruefe()]);
  void web.start().then(alles);
  setInterval(alles, PRUEF_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && alles());
}

export const neuLaden: (neuLaden?: boolean) => Promise<void> = istApp()
  ? (starteAppPruefung(), () => web.aktivieren())
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
