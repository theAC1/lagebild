# Live-Update der Oberfläche in der Android-App

Stand 30.10.2026. Frage: Wie holt die Capacitor-App neue Web-Stände vom eigenen Server (lage.arvuna.ch), ohne Play Store und ohne Dienst Dritter?

## Varianten

| Variante | Befund | Quelle |
|---|---|---|
| `@capgo/capacitor-updater` im manuellen Modus | Lizenz MPL-2.0, Peer `@capacitor/core ^8.0.0`, aktuell 8.54.0. `autoUpdate: false` plus `download({url, version, checksum})`, `set({id})`, `list()`, `notifyAppReady()`. Prüfsumme: SHA-256 (CRC32 als veraltet markiert); fehlt sie, bricht der Download ab. Rollback: meldet sich der neue Stand nicht innerhalb `appReadyTimeout` per `notifyAppReady()`, wählt das Plugin den letzten guten bzw. den eingebauten Stand und markiert das Bundle `error`. `resetWhenUpdate` verwirft Bundles nach einer neuen APK. Das Plugin-Manifest (AndroidManifest) fügt selbst keine Berechtigungen hinzu. | npm-Paket `@capgo/capacitor-updater@8.54.0` (package.json, `dist/esm/definitions.d.ts`, Android-Quellen) |
| Eigenbau mit Capacitor-Bordmitteln | `Bridge.setServerBasePath()` gibt es, aber Herunterladen, Entpacken (Zip-Slip), Prüfsumme, Persistenz über Neustarts und der Rückfall bei Absturz müssten selbst in Java geschrieben werden: hunderte Zeilen sicherheitskritischer Code. Nicht klein. | Capacitor-Android-Quellen `Bridge.java` |
| Capgo Cloud / Auto-Update | Standard-`updateUrl`/`statsUrl` zeigen auf `plugin.capgo.app`. Hier ausdrücklich nicht gewollt. | `CapacitorUpdaterPlugin.java` (`updateUrlDefault`, `statsUrlDefault`) |

## Entscheid

`@capgo/capacitor-updater` rein als Lader und Rückfall-Mechanik, gesteuert von unserem eigenen JS (`client/src/lib/update.svelte.ts`):

- `autoUpdate: false`, `updateUrl`, `statsUrl`, `channelUrl` leer: das Plugin ruft von sich aus nichts auf, es gibt keine Statistik (Stats-Aufrufe sind bei leerer `statsUrl` abgeschaltet). Die einzige Verbindung ist der Bundle-Download von unserem Server, den wir selbst anstossen.
- Manifest und Bundle kommen aus `DATA_DIR/app` (`/app/web.json`, `/app/web-<code>.zip`), nicht aus dem Git.
- Wir prüfen das Manifest streng selbst (nur relativer Pfad `/app/web-<webCode>.zip`, nur https-Basis, SHA-256 aus dem Manifest, `minNativeCode`), das Plugin prüft die Prüfsumme beim Laden zusätzlich.
- Aktiviert wird mit `set()` erst nach Zustimmung (Antippen) oder beim nächsten Start der App; `next()` wird bewusst nicht genutzt, weil das Plugin es beim nächsten Wechsel in den Hintergrund anwendet (z.B. beim Kamerawechsel für eine Sichtung).

## Origin und Speicher

Das Plugin lädt den neuen Stand über die Capacitor-Bridge (`hostFiles`, `loadUrl` auf `bridge.getAppUrl()` mit dem bisherigen Pfad, sonst `setServerBasePath`). Die App-URL (`https://localhost`) bleibt gleich; damit bleiben `localStorage`, IndexedDB und Cache Storage (z.B. ein Kachelspeicher) erhalten. Nur Dateien der Oberfläche wechseln den Ordner. Auf dem Gerät zu prüfen (siehe README).

## Quellen

- https://github.com/Cap-go/capacitor-updater (README, API `download`, `set`, `notifyAppReady`, Konfiguration `appReadyTimeout`, `resetWhenUpdate`)
- npm: `@capgo/capacitor-updater` 8.54.0 (Lizenz MPL-2.0, Peer-Abhängigkeit Capacitor 8)
- https://capacitorjs.com/docs/android (WebView, `serverBasePath`)
