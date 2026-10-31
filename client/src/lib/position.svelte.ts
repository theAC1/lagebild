// Eigene Position: watchPosition → store.meinePos, Sendetakt, Bildschirm wachhalten. Sendelogik: store.svelte.ts.
import { oeffneEinstellungen, starteHintergrund, stoppeHintergrund } from './hintergrund.ts';
import { pruefeSenden, send, store } from './store.svelte.ts';
import { istApp } from './umgebung.ts';
import { toast } from './ui.svelte.ts';

let watchId: number | null = null;
/** Watcher des Hintergrund-Dienstes (Android-App); `bgStart` verhindert Doppelstart, solange addWatcher läuft. */
let bgId: string | null = null;
let bgStart = 0;
let takt: ReturnType<typeof setInterval> | undefined;

const zahl = (x: number | null | undefined, max: number) =>
  x == null || Number.isNaN(x) ? null : Math.min(max, Math.max(0, x));

/** Hintergrund-GPS nur in der App und nur per Schalter (Vorgabe aus). */
const hintergrundAn = () => istApp() && store.einstellungen.hintergrund;

function uebernehme(c: { lat: number; lon: number; alt: number | null; acc: number | null; kurs: number | null; tempo: number | null; t: number }): void {
  store.gpsFehler = null;
  store.meinePos = { lat: c.lat, lon: c.lon, alt: c.alt, ce: zahl(c.acc, 100000), kurs: zahl(c.kurs, 360), tempo: zahl(c.tempo, 500), t: c.t };
  pruefeSenden();
}

export function starteGps(): void {
  if (watchId !== null || bgId !== null || bgStart) return;
  if (hintergrundAn()) return starteImHintergrund();
  if (!('geolocation' in navigator)) {
    store.gpsFehler = 'Dieses Gerät liefert keine Position.';
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (g) =>
      uebernehme({ lat: g.coords.latitude, lon: g.coords.longitude, alt: g.coords.altitude, acc: g.coords.accuracy, kurs: g.coords.heading, tempo: g.coords.speed, t: g.timestamp }),
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

function starteImHintergrund(): void {
  const meins = ++bgStart;
  takt = setInterval(pruefeSenden, 1000); // im Hintergrund evtl. gedrosselt; Fixe lösen pruefeSenden ohnehin aus
  starteHintergrund(
    (l) => uebernehme({ lat: l.latitude, lon: l.longitude, alt: l.altitude, acc: l.accuracy, kurs: l.bearing, tempo: l.speed, t: l.time ?? Date.now() }),
    (f) => {
      store.gpsFehler = f === 'verweigert' ? 'Standortzugriff verweigert – in den App-Einstellungen «Immer/Während der Nutzung» erlauben.' : 'Keine GPS-Position.';
      if (f === 'verweigert') void oeffneEinstellungen();
    },
  )
    .then((id) => {
      // inzwischen gestoppt oder neu gestartet → sofort wieder freigeben
      if (bgStart !== meins) void stoppeHintergrund(id);
      else bgId = id;
    })
    .catch(() => {
      if (bgStart === meins) store.gpsFehler = 'Hintergrund-GPS konnte nicht gestartet werden.';
    });
}

export function stoppeGps(): void {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  bgStart = 0;
  if (bgId !== null) void stoppeHintergrund(bgId);
  bgId = null;
  clearInterval(takt);
}

/** Schalter «Position im Hintergrund» geändert: GPS mit der passenden Quelle neu starten. */
export function aktualisiereHintergrund(): void {
  if (!store.token) return;
  stoppeGps();
  starteGps();
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
  if (document.visibilityState === 'visible' && store.token && watchId === null) starteGps();
});
