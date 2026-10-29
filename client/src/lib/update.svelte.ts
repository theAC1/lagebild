// Neue App-Version: der Service Worker lädt sie im Hintergrund, die Seite läuft bis «Neu laden» auf der alten.
// Kein automatisches Neuladen: das würde offene Eingaben verwerfen (z.B. Sichtung nach dem Kamerawechsel).
import { registerSW } from 'virtual:pwa-register';

const PRUEF_MS = 30 * 60_000;

export const update = $state({ bereit: false });

export const neuLaden = registerSW({
  onNeedRefresh: () => (update.bereit = true),
  // Installierte PWAs bleiben oft tagelang im Speicher: beim Zurückholen und periodisch nachsehen
  onRegisteredSW(_url, r) {
    if (!r) return;
    const pruefe = () => r.update().catch(() => {}); // offline: nächster Versuch reicht
    setInterval(pruefe, PRUEF_MS);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pruefe());
  },
});
