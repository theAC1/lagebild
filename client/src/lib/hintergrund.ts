// Hintergrund-GPS der Android-App (Foreground-Service mit Dauer-Benachrichtigung). Nur über position.svelte.ts nutzen.
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';

const plugin = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export type HintergrundFehler = 'verweigert' | 'sonst';

/** Startet den Dienst; `bei` bekommt jeden Fix, `fehler` Probleme (z.B. fehlende Berechtigung). Gibt die Watcher-ID zurück. */
export async function starteHintergrund(bei: (l: Location) => void, fehler: (f: HintergrundFehler) => void): Promise<string> {
  // Android 13+: ohne Erlaubnis läuft der Dienst, aber die Dauer-Benachrichtigung bleibt unsichtbar
  await LocalNotifications.requestPermissions().catch(() => undefined);
  return plugin.addWatcher(
    {
      backgroundTitle: 'Lagebild sendet Position',
      backgroundMessage: 'Zum Beenden in der App «Position im Hintergrund» ausschalten.',
      requestPermissions: true,
      stale: false,
    },
    (l, e) => (l ? bei(l) : fehler(e?.code === 'NOT_AUTHORIZED' ? 'verweigert' : 'sonst')),
  );
}

export const stoppeHintergrund = (id: string): Promise<void> => plugin.removeWatcher({ id });
export const oeffneEinstellungen = (): Promise<void> => plugin.openSettings();
