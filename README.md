# Lagebild

TAK-ähnliche Lagebild-PWA (Blue Force Tracking) mit Schweizer Karten (swisstopo) und taktischen Zeichen (APP-6D via milsymbol). Ausbildungs- und Testmittel.

Spec: [docs/spec.md](docs/spec.md) · Vertrag: [shared/protocol.ts](shared/protocol.ts)

## Entwicklung

```bash
npm install
LAGE_ERSTELL_PASSWORT=dev npm run dev   # Server :8080 (Daten in ./data) + Vite :5173 mit Proxy für /api und /ws
npm run check                            # tsc (Server/Vertrag) + svelte-check (Client)
npm test                                 # vitest: Server, Client-Logik, Features
npm run build                            # client/dist inkl. Service Worker
LAGE_ERSTELL_PASSWORT=… npm start        # Produktion: liefert client/dist + API + WebSocket (PORT, DATA_DIR)
npm run e2e                              # Playwright: baut, startet Server auf PW_PORT (8797) mit frischem DATA_DIR
```

### Android-App (Capacitor)

Die App ist dieselbe Svelte-Oberfläche in einer APK (`ch.arvuna.lagebild`, `capacitor.config.ts`, `android/`). Sie startet ohne Netz; API und WebSocket gehen an `https://lage.arvuna.ch` (`client/src/lib/umgebung.ts`, Build-Zeit überschreibbar mit `VITE_SERVER_URL`). Die PWA bleibt daneben unverändert.

```bash
npm run build:app          # Oberfläche ohne Service Worker nach client/dist-app (wird von cap sync in die APK kopiert)
deploy/android.sh          # kompletter Ablauf: Oberfläche bauen, cap sync, Gradle in LXC 120, APK nach /root/projekte/lagebild-apk/
VARIANTE=debug deploy/android.sh   # Debug-Build statt signierter Release-APK
```

- **Gradle** läuft in LXC 120 `android-build` (JDK 21 – Capacitor 8 verlangt es –, SDK unter `/opt/android-sdk`, kein Node). `android.sh` kopiert `android/` plus die nativen Teile der Plugins aus `node_modules/@capacitor*` hinüber und holt die APK zurück.
- **versionCode** = Minuten seit 1.1.2026 (steigt mit jedem Bauen), **versionName** = `1.0.<Commit-Anzahl>`.
- **Signatur:** Keystore `/root/.config/lagebild/lagebild.jks`, Passwort daneben in `keystore.pass` (beide 600, nie im Git, einmalig vom Skript erzeugt). Geht er verloren, lässt sich die App nicht mehr aktualisieren, nur neu installieren: Sicherung anlegen.
- **Hintergrund-GPS** (Einstellung «Position im Hintergrund senden», nur in der App, Vorgabe aus): `@capacitor-community/background-geolocation` als Foreground-Service mit Dauer-Benachrichtigung; `android.useLegacyBridge` in der Config ist dafür Pflicht. Berechtigungen: Standort (fein/grob), `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, Kamera; `ACCESS_BACKGROUND_LOCATION` bewusst nicht.
- **Service Worker** ist in der App aus; stattdessen fragt sie beim Start und bei `visibilitychange` `/app/version.json` ab und zeigt «Neue App-Version · Herunterladen».

E2E braucht einmalig `npx playwright install chromium`. Die Tests (`e2e/*.e2e.ts`) spielen eine ganze Lage mit Leitung und Teilnehmer durch und legen Screenshots unter `docs/screens/e2e-*.png` ab.

## Betrieb

- **Wo:** LXC 124 `lagebild` (192.168.1.74:8080), öffentlich als https://lage.arvuna.ch über den CF-Tunnel `proxmox-ssh` des Proxmox-Hosts.
- **Deploy:** `deploy/deploy.sh` auf dem Host. Das Skript baut, spielt die App nach `/opt/lagebild/app` ein und startet den Dienst `lagebild` neu. Die Daten unter `/var/lib/lagebild` bleiben erhalten.
- **Android-App ausliefern:** `deploy/apk.sh` legt `lagebild.apk` und `version.json` nach `/var/lib/lagebild/app/` in LXC 124 (nicht im Git, kein Neustart nötig). Der Server liefert sie als `/app/lagebild.apk` und `/app/version.json`; im Browser auf Android erscheint im Login «Android-App installieren», sobald `version.json` da ist. `Access-Control-Allow-Origin` setzt der Server nur für die App-Ursprünge `https://localhost` und `capacitor://localhost` (`server/src/sicherheit.ts`); die API nutzt Bearer-Tokens statt Cookies, der WebSocket prüft keinen Origin.
- **Geheimnis:** `/etc/lagebild.env` enthält nur `LAGE_ERSTELL_PASSWORT` (root, 600). So ersetzt du es auf dem Host: `pct exec 124 -- bash -c 'read -rsp "Erstell-Passwort: " p; echo; umask 077; printf "LAGE_ERSTELL_PASSWORT=%s\n" "$p" > /etc/lagebild.env; systemctl restart lagebild'`
- **Proxy:** `TRUSTED_PROXY=192.168.1.100` steht in der Unit, weil cloudflared auf dem Host läuft. Nur von dort gilt `CF-Connecting-IP` für die Rate-Limits, für alle anderen Verbindungen gilt die Socket-IP.
- **Logs:** `pct exec 124 -- journalctl -u lagebild -f`

## Entscheidungslog (28.10.2026, Frage-Runden mit Juan)

| Thema | Entscheid |
|---|---|
| Hosting | Homelab-LXC (Node + WebSocket + SQLite), keine US-Cloud für Daten |
| Symbolik | APP-6D/MIL-STD-2525D via milsymbol |
| Zugang | Einladungscode + Rufname, ohne Konten; separater Leitungs-Code |
| Umfang v1 | Kern + Notfall-Alarm, Range & Bearing, GeoChat, Sichtungsmeldung mit Foto (Zeichnen erst v2) |
| Erreichbarkeit | Öffentliche Subdomain über den Cloudflare-Tunnel, Schutz per Code + Rate-Limit |
| Offline | Angezeigte Kacheln cachen, kein Gebietsdownload |
| Status | Fester Satz + Freitext; Juan: «und aber auch Von der Leitung pro Lage definiert» → Leitung kann die Liste je Lage anpassen |
| Datenhaltung | Spuren für Nachbesprechung (Export GPX/GeoJSON), Löschen manuell durch Leitung |
| TAK-Vorbilder | Juan: «ja, bau die Punkte gleich mit ein» → Abschnitt A der Recherche in v1 (siehe Spec-Nachtrag) |
| Querformat (29.10.) | Werkzeugleiste rechts, einklappbar; Panels seitlich neben der Karte; zwei Panels nebeneinander auf breiten Bildschirmen; Koordinatenzeile per Tippen aufs eigene Symbol; Einstellung Ausrichtung hoch/quer/auto (Juan: «muss aber in der Einstellung aktiviert werden (fix portrait, fix landscape oder automatisch beim drehen)») |
| Desktop (29.10.) | Rechtsklick = langes Tippen, Mausrad zoomt, Doppelklick auf Symbol = Details; zwei Panels (Juan: «so das wie besprochen auch chat und Statusübersicht der Tn separat offen bleiben kann») |
| v2-Umfang (29.10.) | Radial-Menü, Zeichnen, Bloodhound in einem Durchgang; Geofence und ATAK-Anbindung später |
| Zeichnen (29.10.) | Alle zeichnen, Ersteller+Leitung bearbeiten; Desktop voller Umfang inkl. taktischer Linien, Räume, Messen, Lasso, Snapping, Koordinateneingabe in mehreren Systemen, Ebenen; Juan: «auf dem Mobilen gerät soll es stark reduziert sein. denn in der aktion wird da nicht viel gezeichnet» → mobil nur Ansehen + Linie/Pfeil/Kreis |
| Bloodhound (29.10.) | Luftlinie mit Restzeit und Farbstufen; Leitung kann Ziele als Auftrag an Personen schicken |
| Bedienung v3 (29.10.) | Juan: «sehr prototypmäßig … nicht da, wo dann auch wirklich ein Button oder so logisch wäre». Störfaktoren: Wege zu lang, Knöpfe verstreut, Optik roh. Entscheid: Karte zuerst, Variante «Daumen-Ränder» (Melden links, Karte rechts), optimiert fürs Querformat, Test in echter Lage per Einstellung «Bedienung» |
| Hauptaktionen (29.10.) | Status, Marker, Sichtung, Chat mit einem Tipp; Rest im Mehr-Menü |
| Abläufe (29.10.) | Marker per Fadenkreuz mit letztem Symbol, Details danach; Alarm 1,5 s gedrückt halten; Tag/Nacht automatisch nach Sonnenstand; Optik dunkel-taktisch + heller Tagmodus |
| Bediengrösse (29.10.) | Juan: «Passe die Grösse der Bedienelemente auf dem Smartphone an. Aktuell ist alles zu klein eingestellt.» → Einstellung «Bediengrösse» Normal/Gross/Sehr gross (×1/×1.2/×1.4); auf Touch ist Normal schon ×1.25 (Schrift 18 px), Desktop-Normal bleibt wie bisher; Kartenzeichen ×1/×1.15/×1.3 |
| Karte randlos (30.10.) | Juan: «Karte viel prominenter … Buttons eigentlich wirklich mehr auf die Seite verschwinden» → Bedienelemente schweben kompakt über der randlosen Karte; Touch-Normal ohne +25 % auf Trefferflächen (wirkte wie «Sehr gross») |
| Melden (30.10.) | Juan versteht den Unterschied Sichtung/Marker nicht klar → ein Knopf «Melden», danach zwei Kacheln Sichtung + Marker; Zeichnen bleibt unter «Mehr» |
| Zeichnen mobil (30.10.) | Pfeilkopf passt nicht → korrigieren; Farbe, Dicke, Darstellung von Linie/Pfeil/Kreis auch auf dem Handy im Detailfenster; Farben als feste taktische Palette |
| Browser-Gesten (30.10.) | Lang-Drücken öffnet das Browser-Menü, Antippen markiert Text → in der PWA sperren (gilt für iOS/Desktop weiter) |
| Native App (30.10.) | Android-App (Capacitor) neben gehärteter PWA; APK-Download/QR, kein Store; Oberfläche in der APK mit Hinweis «Update verfügbar»; Hintergrund-GPS nur per Schalter |
| Etappen ab 30.10. | Kleinigkeiten → Android-App → Offline-Gebiete → Kartenpaket (Führungsraster, Geländetaufe mit swisstopo-Daten/Objekterkennung, ruhigere Darstellung; eigene Frage-Runde + Recherche). Geofence und ATAK-Anbindung: vorerst kein Bedarf |
| Geländetaufe & Führungsraster (30.10.) | Namensfamilien CH-Armee, immer Englisch: Gebäude = Metalle (Gold, Bronze, Iridium), Strassen = Tiere (Ape, Bear, Lion), Gewässer = Wassertiere (Fish, Whale, Dolphin), Wälder = Forest, Woods, Flächen = Floor, Ruins. Jeder darf taufen, aber nur im «Taufmodus» (Ansicht wechselt, Objekte antippbar); Taufnamen = eigener Layer, ein-/ausschaltbar. Führungsraster = fixiertes Gitter für die Aktion (z.B. Zahlen waagrecht, Buchstaben senkrecht, «Alpha 12»), damit auch Funk-only-Leute präzise melden; auflegen, verschieben, fixieren – danach verschiebt nur die Leitung; eigener Layer; Ausdruck als PDF. Vorlage/Beispiel liefert Juan als PDF |
