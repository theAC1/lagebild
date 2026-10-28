# Lagebild – Spec v1

TAK-ähnliche Situational-Awareness-PWA mit Blue Force Tracking für Übungen. Ausbildungs- und Testmittel, kein Führungsmittel; Funk bleibt primär.

Vertrag: `shared/protocol.ts` (Datenmodell, WebSocket-Nachrichten, REST-Bodies). Änderungen daran nur bewusst und in Server **und** Client.

## Stack

- **Repo-Layout:** ein `package.json` im Root. `shared/` (Vertrag), `server/` (Node 22, TypeScript direkt per Type-Stripping, `ws`, `node:sqlite`), `client/` (Vite + Svelte 5 + TS), `deploy/` (LXC-Setup, systemd), `e2e/` (Playwright).
- **Karte:** MapLibre GL JS, swisstopo-WMTS in EPSG:3857 (Raster). Layer: Landeskarte farbig (`ch.swisstopo.pixelkarte-farbe`), grau (`ch.swisstopo.pixelkarte-grau`), Luftbild (`ch.swisstopo.swissimage`). Attribution «© swisstopo». Positionen intern WGS84.
- **Koordinaten:** Anzeige WGS84, LV95 (proj4, EPSG:2056, Format `2'600'000 / 1'200'000`) und MGRS (`mgrs`). Langes Tippen auf die Karte zeigt die Koordinate des Punkts.
- **Symbole:** milsymbol, APP-6D/2525D (20-stellige SIDC). Kuratierte Auswahl häufiger Funktionen (Infanterie, mech. Infanterie, Panzer, Aufklärung, Führung/KP, Sanität, Genie/Pionier, Artillerie, Logistik, Fahrzeug, Beobachtungsposten, Scharfschütze, Drohne, Zivilperson …) × Zugehörigkeit (Freund/Feind/Neutral/Unbekannt) × Grösse (Trupp/Gruppe/Zug/Kompanie). Zusätzlich SIDC-Freieingabe.
- **PWA:** `vite-plugin-pwa`, installierbar, App-Hülle offline. Service Worker cacht angezeigte swisstopo-Kacheln (CacheFirst, max. ~30'000 Einträge, 60 Tage). Kein Vorab-Massendownload (swisstopo Fair Use).

## Funktionen v1

1. **Lage & Zugang:** Lage anlegen nur mit Erstell-Passwort (`LAGE_ERSTELL_PASSWORT`). Jede Lage hat Teilnehmer-Code und Leitungs-Code (zufällig, 8 bzw. 10 Zeichen, ohne verwechselbare Zeichen). Beitreten: Code + Rufname + Einheit + Funktion + eigenes Symbol. Der Code bestimmt die Rolle. Token (32 Bytes zufällig, gehasht gespeichert) in `localStorage`, Wiederverbindung ohne erneute Eingabe. QR-Code für den Teilnehmer-Link in der Leitungsansicht.
2. **Eigene Position:** `watchPosition` mit Genauigkeitskreis, Blickrichtung/Kurs, «Folgen»-Modus und Nordung. Sendeintervall 5/10/30 s (Einstellung). Schalter «Position nicht senden» (Emission Control).
3. **Blue Force Tracking:** Alle Teilnehmenden live mit Symbol, Rufname, Statusfarbe. Nach 2 min ohne Update ausgegraut, nach 10 min als offline (Geist). Teilnehmerliste mit Distanz/Richtung von mir aus, Tippen zentriert.
4. **Marker:** Setzen per langem Tippen oder Fadenkreuz, Symbol-Picker, Bezeichnung, Notiz. Bearbeiten/Löschen durch Ersteller oder Leitung. Für alle sichtbar.
5. **Status:** Standardsatz (`STANDARD_STATUS`) plus Freitext, farbig am eigenen Symbol. Die Leitung kann die Liste je Lage anpassen. Jeder Wechsel landet im Meldungslog.
6. **GeoChat:** an alle, an die eigene/eine Einheit oder an eine Person. Ungelesen-Zähler.
7. **Sichtungsmeldung (SALUTE)** mit Foto (Kamera, clientseitig auf ≤1600 px JPEG verkleinert, EXIF entfernt durch Re-Encode). Erscheint als Feind-/Unbekannt-Symbol am Ort, Foto in der Detailansicht.
8. **Notfall-Alarm:** «Notfall» und «Feindkontakt». Auslösen mit zweistufiger Bestätigung. Bei allen: Banner, Vibration, Ton, pulsierender Ring auf der Karte, bis aufgehoben (durch Auslöser oder Leitung). Quittierungen sichtbar.
9. **Range & Bearing:** Werkzeug von A (Standard: ich) nach B (Kartenpunkt, Marker oder Teilnehmer). Distanz (m/km) und Azimut in Grad **und** Artilleriepromille (6400 ‰). Linie bleibt stehen und aktualisiert sich, wenn sich Endpunkte bewegen.
10. **Spuren & Nachbesprechung:** Alle Positionen werden gespeichert. Spuren je Teilnehmer ein-/ausblendbar. Leitung exportiert die ganze Lage als GPX (Tracks + Wegpunkte) und GeoJSON. Nur die Leitung löscht die Lage endgültig, inklusive Fotos.
11. **Leitungsansicht:** Codes und QR, Teilnehmerliste (entfernen), Status-Set bearbeiten, Alarme verwalten, Export, Lage beenden/löschen, Meldungslog.

## Nicht in v1

Zeichnen (Linien/Flächen/Phasenlinien), Offline-Gebietsdownload, TAK/CoT-Bridge, Hintergrund-GPS (braucht native Hülle), Video, Konten.

## Server

- Ein Prozess: `node:http` liefert `client/dist` (SPA-Fallback) und die REST-API, `ws` auf `/ws`.
- REST: `POST /api/lage` (LageErstellen), `POST /api/beitreten`, `POST /api/foto` (Bearer, ≤ 8 MB, nur JPEG/PNG/WebP nach Magic Bytes), `GET /api/foto/:id` (Bearer, gleiche Lage), `GET /api/spuren?seit=` (Bearer, `Spuren`), `GET /api/export.gpx|.geojson` (Bearer Leitung), `DELETE /api/lage` (Bearer Leitung).
- WS: erste Nachricht `hallo{token}` innerhalb 5 s, sonst Abbruch. Danach `snapshot`, dann Deltas nur innerhalb der Lage. Chat wird nach Ziel gefiltert zugestellt.
- Validierung jeder Eingabe mit den zod-Schemas aus `shared/protocol.ts`. Rate-Limits: Beitreten/Erstellen pro IP (`CF-Connecting-IP`, sonst Socket-IP), WS-Nachrichten pro Verbindung, `pos` serverseitig auf ≥ 1 s gedrosselt. Max. Nachrichtengrösse 64 KB.
- Rechte: Marker ändern/löschen nur Ersteller oder Leitung. `lage.*` und `teilnehmer.entfernen` nur Leitung. Alarm aufheben nur Auslöser oder Leitung.
- SQLite-Datei und Fotos unter `DATA_DIR`. Sicherheits-Header (CSP, nosniff, Referrer-Policy). Logs ohne Tokens und Codes.
- Konfiguration per Env: `PORT` (8080), `DATA_DIR`, `LAGE_ERSTELL_PASSWORT` (Pflicht, Start bricht ohne ab).

## Betrieb

Neuer Homelab-LXC (Debian, Node 22) mit systemd-Dienst. Öffentlich über den bestehenden Cloudflare-Tunnel unter `lage.arvuna.ch`. Den Public-Hostname setzt Juan im CF-Dashboard.
