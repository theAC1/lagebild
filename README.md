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

E2E braucht einmalig `npx playwright install chromium`. Die Tests (`e2e/*.e2e.ts`) spielen eine ganze Lage mit Leitung und Teilnehmer durch und legen Screenshots unter `docs/screens/e2e-*.png` ab.

## Betrieb

- **Wo:** LXC 124 `lagebild` (192.168.1.74:8080), öffentlich als https://lage.arvuna.ch über den CF-Tunnel `proxmox-ssh` des Proxmox-Hosts.
- **Deploy:** `deploy/deploy.sh` auf dem Host. Das Skript baut, spielt die App nach `/opt/lagebild/app` ein und startet den Dienst `lagebild` neu. Die Daten unter `/var/lib/lagebild` bleiben erhalten.
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
