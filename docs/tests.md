# Unit-Tests

**Grundsatz:** Ein Test muss ohne die geprüfte Logik rot werden. Jeder Test sichert fachlich nötiges Verhalten ab
(Rechte, Sicherheit, Grenzwerte, nicht-triviale Geometrie/Parsing, frühere Fehler). Was nur Konstanten, Feldnamen,
zod selbst oder die eigene Testeinrichtung bestätigt, fliegt raus. Dieselbe Regel wird nur auf der tiefsten Ebene
geprüft: Fachregeln im Reducer (`shared/regeln`), der Server nur für I/O (Speichern, Verteilen an die richtigen
Empfänger, HTTP-Status, Limits), der Client nur für eigene Logik (Darstellung, Parsing, Offline, Wiedergabe).
Client-Kopien von Reducer-Regeln (`darfAendern`, `kannAufheben`) sind nicht mehr getestet – die Regel lebt im Reducer.
Varianten derselben Äquivalenzklasse stehen als Schleife in einem `it` (Assertion-Meldung nennt die Eingabe).

**Nachweis:** Jeder Rechte-/Sicherheitstest und je Datei mindestens zwei weitere wurden durch eine gezielte Mutation am
Produktivcode rot gemacht (Bedingung umgedreht, Prüfung entfernt, Grenzwert ±1) und danach zurückgesetzt. Vollständige
Tabelle: [tests-mutationen.md](tests-mutationen.md). Vorgehen: exakte Textersetzung → `vitest run <datei>` → erwarteter
Test rot? → Datei wiederherstellen. Dabei geschärft: Chat-Snapshot-Filter für Nicht-Empfänger, Pfadprüfung des
Client-Verzeichnisses (`..` kodiert, sonst normalisiert die URL), Code-erneuern-Broadcast, labels-Hindernis, rb-Schlüssel.

**Zahlen (31.10.2026):** 483 Tests / 45 Dateien / 4639 Zeilen → **191 Tests / 45 Dateien / 3382 Zeilen**; nach der Taufe-Überarbeitung (31.10.) **194 Tests / 45 Dateien / 3415 Zeilen** (+3: Naht geteilter Kacheln, mehrteilige Gebäude, Selbstüberschneidung).

## Was wo getestet wird und warum

| Ebene | Dateien | Tests | Warum nötig |
|---|---|---|---|
| Reducer `shared/regeln` | rechte, phase, ablaeufe | 25 | Alle Rechte (Leitung/Teilnehmer/Ersteller), Phasensperren AP/LV/AN, fixiertes Raster, gesperrte Ebenen, Taufe-Konflikte, Sichtbarkeit (Chat, Bloodhound-Meldungen), Folgen über Module (Entfernen beendet Aufträge), Regressionen (Undo-Ersteller, Positionsrate, eigener entfernter Status). Reine Funktion → ohne I/O prüfbar. |
| `shared/raster` | raster | 6 | Zellansprache und Ränder (links/oben dazu, rechts/unten nicht), Quadranten, Rückweg über WGS84, Funk-Ansprache, Rahmen/Linien – falsche Zelle = falscher Funkspruch. |
| Server WebSocket | ws, bloodhound | 17 | Anmeldung (4001/4003), Verteilen nach Empfänger (Chat, Meldungen, Snapshot-Filter), Speichern (Spur, staleNach), Limits je Teilnehmer/IP (Nachrichten, Verbindungen, Alarme), Protokoll (Seiten, Bestand, Budget), AN 410, Code erneuern, Export, Löschen inkl. Fotos. |
| Server REST | rest, app, sicherheit, phasen | 14 | Passwort/Codes/Bearer (401/403), Rate-Limits und wer zählt (CF-Connecting-IP nur vom Proxy, IPv6 /64, nur falsche Codes), Kontingente (Teilnehmer 507, Foto 2 MB/415), Pfadprüfung `/app/` und Client-Verzeichnis, CORS nur App-Ursprünge, Migration Bestandslagen. |
| Server Vertrag/Daten | zeichnen, taufe, raster | 11 | Eigene Refinements des Vertrags (Punktzahl je Art, radiusM, Taufring ≥ 4, stoss < 360, Rasterausdehnung, 100 je Nachricht), Vorgabelisten ohne NATO-Wörter, Grössenbudgets je Lage, Snapshot/Export der Einträge. |
| Client lib | coords, coords.parse, webUpdate, sonne, labels, appVersion, umgebung, speicher | 30 | Koordinaten-Parsing aller sechs Formate gegen Referenzpunkte und Roundtrip; LV95/MGRS-Referenz, Promille, Sendelogik, Frische; Live-Update-Siegel (Signatur, Downgrade, SHA-256, fremder Schlüssel, nur https, nie ohne Antippen aktivieren); fester Server der App; Aufräumen nur fremder Lage-Schlüssel. |
| Client raster/offline | druck, beschriftung, kacheln, laden | 21 | PDF-Raster (runder Massstab, Blattgeometrie umkehrbar, Felder ohne Überlappung, Kachelplan trifft Rahmenecke, gültige xref), Raster-Köpfe auf der Karte; Offline-Gebiete (Zoomgrenzen, Kachelzahl, URL↔Kachel, Referenzzählung beim Löschen, 60-Tage-Ablauf), Lader (einmal je Kachel, Wiederaufnahme, Netz weg, 404/503, Drossel). |
| Client features | zeichnen (4), taufe (3), bloodhound, chat, sichtung, leitung, spuren, marker, wiedergabe (3), rangebearing, status, alarm, uiSkala | 70 | Taktische Zeichen (Pfeilkopf-Regression 30.10., Sperre, Räume), Geometrie-Randfälle, Undo/Redo inkl. Ersteller und Stückelung unter MAX_NACHRICHT, Vektorkachel-Geometrie über Kachelgrenzen (auch die von MapLibre geteilten z15/z16-Kacheln, Regression «schräge Fassade»), Gebäudeteile vereinen, Selbstüberschneidung gezeichneter Flächen, Fassadenfarben, Tempo-Glättung, Chat-Kanäle/Ungelesen, SALUTE-Chips→Vertrag, Dateiname ohne Pfad, Spuren, Ereignisliste nur LV mit Bloodhound-Sichtbarkeit und CSV-Formel-Schutz, Wiedergabe-Zeitachse, PDF-Gerüst, R&B-Persistenz, Kontrastfarbe, UI-Skalierung. |

## Gestrichen

- Varianten derselben Äquivalenzklasse zusammengelegt: ~230 `it`s (coords.parse 80 → 7, bloodhound-Farbstufen, Siegel-Varianten, Server-Rechte-Abläufe …).
- Reducer-Duplikate auf Server- oder Client-Ebene: ~20 (Server: Marker-/Zeichnungs-/Ebenen-/Raster-/Bloodhound-Rechte, Alarm ersetzt, Emission Control; Client: `darfAendern` ×2, `kannAufheben`).
- Tautologisch, strukturell oder trivial: ~20 (Konstanten wie KOORD_FORMATE/SIDC/Kürzel-Liste, Feldnamen `zuInhalt`, formatZeit ×3, neuesteZuerst ×2, seitFuer, zugangsLink, verschiebe, No-Op-Fall, MB-Schätzung).
- Keine Assertion mit Prüfschärfe entfernt; neu im Reducer: Undo-Ersteller, Bloodhound-Zielprüfung und -Ersatz, eigener entfernter Status.

## Lücken (bekannt, nicht ergänzt)

- `formatZeit` existiert vierfach im Client (chat, sichtung, status, marker) – Produktiv-Duplikat, gehört nach `client/src/lib`.
- Ereignisliste (`wiedergabe/liste`): Chat-Sichtbarkeit Einheit/Person ungetestet; Server-Export: Escaping nur für `&`/`<` geprüft.
- `offline/laden`: 503 wird ohne Obergrenze wiederholt; Abbruch während des Netz-Wartens ungetestet.
- `webUpdate.start()`: veralteter Angebots-Eintrag bleibt im Speicher (kein Aufräumen, kein Test).
- Server: Snapshot-Grenze 500 Chats / 200 Meldungen und Ping-Watchdog (`PING_MS`) ungetestet.
