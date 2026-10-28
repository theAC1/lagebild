# Lagebild

TAK-ähnliche Lagebild-PWA (Blue Force Tracking) mit Schweizer Karten (swisstopo) und taktischen Zeichen (APP-6D via milsymbol). Ausbildungs- und Testmittel.

Spec: [docs/spec.md](docs/spec.md) · Vertrag: [shared/protocol.ts](shared/protocol.ts)

## Entwicklung

```bash
npm install
LAGE_ERSTELL_PASSWORT=dev npm run dev   # Server :8080 + Vite :5173
npm test                                 # Unit + Server
npm run e2e                              # Playwright
```

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
