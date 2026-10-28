// Eigene Position: watchPosition → store.meinePos, Sendetakt, Bildschirm wachhalten. Sendelogik: store.svelte.ts.
import { pruefeSenden, send, store } from './store.svelte.ts';
import { toast } from './ui.svelte.ts';

let watchId: number | null = null;
let takt: ReturnType<typeof setInterval> | undefined;

const zahl = (x: number | null | undefined, max: number) =>
  x == null || Number.isNaN(x) ? null : Math.min(max, Math.max(0, x));

export function starteGps(): void {
  if (watchId !== null) return;
  if (!('geolocation' in navigator)) {
    store.gpsFehler = 'Dieses Gerät liefert keine Position.';
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (g) => {
      store.gpsFehler = null;
      store.meinePos = {
        lat: g.coords.latitude,
        lon: g.coords.longitude,
        alt: g.coords.altitude ?? null,
        ce: zahl(g.coords.accuracy, 100000),
        kurs: zahl(g.coords.heading, 360),
        tempo: zahl(g.coords.speed, 500),
        t: g.timestamp,
      };
      pruefeSenden();
    },
    (e) => {
      if (e.code === e.PERMISSION_DENIED) {
        // Der Browser beendet den Watch dabei; freigeben, damit starteGps() nach dem Erlauben neu starten kann
        stoppeGps();
        store.gpsFehler = 'Standortzugriff verweigert – in den Browser-Einstellungen erlauben.';
      } else store.gpsFehler = 'Keine GPS-Position.';
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 30_000 },
  );
  takt = setInterval(pruefeSenden, 1000);
}

export function stoppeGps(): void {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  clearInterval(takt);
}

/** Emission Control umschalten (Server merkt sich sendetPos). */
export function setzeSendetPos(an: boolean): void {
  // beim Einschalten sendet send() die Position sofort (sendePosJetzt)
  if (!send({ typ: 'sendetPos', an })) toast('Keine Verbindung – später erneut versuchen.');
}

// --- Bildschirm wachhalten (Browser-GPS läuft nur im Vordergrund) ---------------------------

let sperre: WakeLockSentinel | null = null;

async function holeSperre() {
  if (!store.einstellungen.wachhalten || sperre || document.visibilityState !== 'visible') return;
  try {
    sperre = await navigator.wakeLock.request('screen');
    sperre.addEventListener('release', () => (sperre = null));
  } catch {
    toast('Bildschirm wachhalten wird hier nicht unterstützt.');
  }
}

export function aktualisiereWachhalten(): void {
  if (store.einstellungen.wachhalten) void holeSperre();
  else void sperre?.release();
}

document.addEventListener('visibilitychange', () => {
  void holeSperre();
  // zurück aus den Einstellungen: Standort evtl. inzwischen erlaubt
  if (document.visibilityState === 'visible' && store.token && !store.beendet && watchId === null) starteGps();
});
