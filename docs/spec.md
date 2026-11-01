# Lagebild – Spec v1

TAK-ähnliche Situational-Awareness-PWA mit Blue Force Tracking für Übungen. Ausbildungs- und Testmittel, kein Führungsmittel; Funk bleibt primär.

Vertrag: `shared/protocol.ts` (Datenmodell, WebSocket-Nachrichten, REST-Bodies). Änderungen daran nur bewusst und in Server **und** Client.

## Stack

- **Repo-Layout:** ein `package.json` im Root. `shared/` (Vertrag), `server/` (Node 22, TypeScript direkt per Type-Stripping, `ws`, `node:sqlite`), `client/` (Vite + Svelte 5 + TS), `deploy/` (LXC-Setup, systemd), `e2e/` (Playwright).
- **Karte:** MapLibre GL JS, swisstopo-WMTS in EPSG:3857 (Raster). Layer: Landeskarte farbig (`ch.swisstopo.pixelkarte-farbe`), grau (`ch.swisstopo.pixelkarte-grau`), Luftbild (`ch.swisstopo.swissimage`). Attribution «© swisstopo». Positionen intern WGS84.
- **Koordinaten:** Anzeige WGS84, LV95 (proj4, EPSG:2056, Format `2'600'000 / 1'200'000`) und MGRS (`mgrs`). Langes Tippen auf die Karte zeigt die Koordinate des Punkts.
- **Symbole:** milsymbol, APP-6D/2525D (20-stellige SIDC). Kuratierte Auswahl häufiger Funktionen (Infanterie, mech. Infanterie, Panzer, Aufklärung, Führung/KP, Sanität, Genie/Pionier, Artillerie, Logistik, Fahrzeug, Beobachtungsposten, Scharfschütze, Drohne, Zivilperson …) × Zugehörigkeit (Freund/Feind/Neutral/Unbekannt) × Grösse (Trupp/Gruppe/Zug/Kompanie). Zusätzlich SIDC-Freieingabe.
- **PWA:** `vite-plugin-pwa`, installierbar, App-Hülle offline. Service Worker cacht angezeigte swisstopo-Kacheln (CacheFirst, max. ~30'000 Einträge, 60 Tage). Kein Massendownload; Vorab-Laden nur als gedrosseltes Offline-Gebiet (siehe «Offline-Gebiete»).

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
- REST: `POST /api/lage` (LageErstellen), `POST /api/beitreten`, `POST /api/foto` (Bearer, ≤ 2 MB, nur JPEG/PNG/WebP nach Magic Bytes), `GET /api/foto/:id` (Bearer, gleiche Lage), `GET /api/spuren?seit=` (Bearer, `Spuren`), `GET /api/export.gpx|.geojson` (Bearer Leitung), `DELETE /api/lage` (Bearer Leitung).
- WS: erste Nachricht `hallo{token}` innerhalb 5 s, sonst Abbruch. Danach `snapshot`, dann Deltas nur innerhalb der Lage. Chat wird nach Ziel gefiltert zugestellt.
- Validierung jeder Eingabe mit den zod-Schemas aus `shared/protocol.ts`. Rate-Limits: Erstellen pro IP, Beitreten nur Fehlversuche pro IP (`CF-Connecting-IP` nur von `TRUSTED_PROXY`, sonst Socket-IP; IPv6 je /64), WS-Nachrichten und `pos` (≥ 1 s) pro Teilnehmer, höchstens 3 Verbindungen je Token, Fotos 10/min pro Teilnehmer und 300 je Lage, Alarme 10/min pro Teilnehmer, Marker und Sichtungen je 2000 je Lage, aktive Teilnehmende 1000 je Lage. Max. Nachrichtengrösse 64 KB.
- Rechte: Marker ändern/löschen nur Ersteller oder Leitung. `lage.*` und `teilnehmer.entfernen` nur Leitung. Alarm aufheben nur Auslöser oder Leitung.
- SQLite-Datei und Fotos unter `DATA_DIR`. Sicherheits-Header (CSP, nosniff, Referrer-Policy). Logs ohne Tokens und Codes.
- Konfiguration per Env: `PORT` (8080), `HOST` (optional), `DATA_DIR`, `LAGE_ERSTELL_PASSWORT` (Pflicht, Start bricht ohne ab), `TRUSTED_PROXY` (Adresse von cloudflared).

## Betrieb

Neuer Homelab-LXC (Debian, Node 22) mit systemd-Dienst. Öffentlich über den bestehenden Cloudflare-Tunnel unter `lage.arvuna.ch`. Den Public-Hostname setzt Juan im CF-Dashboard.

## Nachtrag 28.10.: Übernahmen aus TAK (Recherche `docs/recherche/tak-vorbilder.md`)

- Ausgrauen nach `pos.staleNach` (2 × Sendeintervall + 15 s, max. 5 min) statt fix. Offline-Teilnehmer werden sofort ausgegraut. Ist ein Teilnehmer verbunden, seine Position aber abgelaufen, zeigt die App das Badge «kein GPS».
- Die Position wird sofort gesendet bei Statuswechsel, Alarm und Wiederverbindung. Zusätzlich gibt es den Modus «Dynamisch»: im Stillstand nur alle 30 s.
- Alarm: Die Position wird immer mitgeschickt, auch bei Emission Control. Pro Person ist nur ein Alarm aktiv. Der Ring folgt dem Auslöser.
- Für das Feld «Funktion» gibt es eine Vorschlagsliste. Die Team-Farbe pro Einheit wird aus den 14 ATAK-Teamfarben abgeleitet.
- Karte:
  - `bounds` auf das Datengebiet von swisstopo beschränkt.
  - Overlays: Hangneigung ≥ 30°, Relief, Ortsnamen, Schiessanzeigen (VBS), Drohnen-Einschränkungen (BAZL).
  - Zusätzliche Basiskarte: Landeskarte Winter.
  - Attribution pro Layer.
- Lizenz: aus ATAK/TAK (GPL-3.0) nur Werte und Abläufe übernommen, kein Code und keine Assets.

## Spec v2 (29.10.2026, vier Frage-Runden mit Juan)

Umfang: Querformat, Desktop-Bedienung, Radial-Menü, Zeichnen, Bloodhound. In einem Durchgang gebaut. Später: Geofence, ATAK Data Package, CoT-Bridge, Offline-Gebietsdownload, Hintergrund-GPS.

### 1. Ausrichtung & Layout

- Manifest: `orientation: 'any'`. Neue Einstellung **Ausrichtung**: `hoch` | `quer` | `auto` (Standard `auto`). `screen.orientation.lock()` nur dort, wo es geht (Android, installiert/Vollbild); scheitert der Lock (iOS, Browser-Tab), zeigt die App bei falscher Lage einen Hinweis «Gerät drehen». Kein Absturz, keine Endlos-Meldung.
- **Querformat** (Breite > Höhe): Werkzeuge als schmale **Leiste rechts**, einklappbar (Zustand in `localStorage`). Kopfzeile kompakt (eine Zeile, niedrig). Karte bekommt die volle Resthöhe.
- **Panels** (Chat, Teilnehmer, Details, Feature-Panels) öffnen im Querformat als **Seitenpanel** neben der Karte (ca. 1/3 Breite, min. 320 px), die Karte bleibt sichtbar und bedienbar. Hochformat: wie heute von unten.
- **Zwei Panels gleichzeitig** ab genügend Breite (≥ 1100 px): z. B. Chat und Teilnehmer-/Statusübersicht nebeneinander offen. Ein zweites Panel öffnet sich neben dem ersten statt es zu ersetzen; jedes hat einen eigenen Schliessen-Knopf. Darunter nur ein Panel.
- **Koordinatenzeile** standardmässig ausgeblendet; Tippen/Klick auf das eigene Symbol blendet sie ein/aus (Zustand gemerkt). Gilt in beiden Ausrichtungen.
- Ziel-Grössen: Handy quer (z. B. 844×390), Tablet (1180×820, 820×1180), Desktop (1440×900, 1920×1080). Bedienelemente ≥ 44 px Trefferfläche auf Touch.

### 2. Desktop-Bedienung

- **Rechtsklick** = langes Tippen (Radial-Menü auf Symbolen und, seit 30.10., auch auf der leeren Karte). Browser-Kontextmenü auf der Karte unterdrückt.
- **Mausrad** zoomt. **Doppelklick** auf ein Symbol öffnet dessen Details, Doppelklick auf leere Karte zoomt hinein.
- Tastatur: `Esc` schliesst das oberste Panel / bricht das aktive Werkzeug ab; Zeichen-Kürzel siehe 4.

### 3. Radial-Menü

Langes Tippen / Rechtsklick auf ein Symbol öffnet einen Ring um das Symbol, auf der leeren Karte um den gedrückten Punkt (max. 8 Knöpfe, Beschriftung sichtbar, Tippen ausserhalb oder Esc schliesst; am Bildrand rückt der Ring ins Bild, der Punkt bleibt markiert):
- **Teilnehmer:** Details, R&B von hier, Bloodhound, Folgen, Spur ein/aus, Chat; Leitung zusätzlich: Bloodhound-Auftrag.
- **Marker / Sichtung:** Details, R&B, Bloodhound, Bearbeiten, Löschen (nur Ersteller/Leitung).
- **Eigenes Symbol:** Details, Koordinaten ein/aus, Folgen, Spur, Marker hier setzen.
- **Zeichnung:** Bearbeiten, Stil, Ebene, Kopieren, Löschen (nur Ersteller/Leitung).
- **Leere Karte** (seit 30.10., Juan: «langes drücken öffnet nicht das radial menu»; ersetzt die frühere Liste): Koordinate, Marker hier, Sichtung hier, R&B (von mir zum Punkt), Bloodhound (zum Punkt). Beschriftungen kurz, damit sie sich auch bei «Sehr gross» im niedrigen Querformat nicht überdecken.
  - **Koordinate** öffnet eine kompakte Karte mit LV95, MGRS und WGS84 (Tippen auf eine Zeile kopiert, die Zeile zeigt «Kopiert») und darunter «Von mir: Distanz · Azimut», sofern GPS da ist. Sie steht auf der dem Punkt abgewandten Bildhälfte, passt auch auf 740×360 quer bei «Sehr gross» ganz ins Bild (lange Werte brechen um, nichts wird abgeschnitten) und schliesst per Tippen daneben oder Esc.

### 4. Zeichnen

Rechte: alle dürfen zeichnen; bearbeiten/löschen nur Ersteller und Leitung (wie Marker). Alles live für alle sichtbar, im Meldungslog, im GeoJSON-/GPX-Export der Leitung enthalten, mit der Lage gelöscht.

**Desktop (Maus/Tastatur, Breite ≥ 1024 px und feiner Zeiger) – voller Umfang:**
- Formen: Linie/Polylinie, Pfeil, Fläche (Polygon), Rechteck, Kreis (Mittelpunkt + Radius), Freihand, Text.
- Taktische Linien: Phasenlinie, Grenze/Abschnittsgrenze, Stossrichtung (breiter Pfeil), Sperre – je mit eigener Darstellung und Bezeichnung; Darstellung angelehnt an APP-6D, so weit ohne fremden Code machbar.
- Räume: Bereitstellungs-, Ziel-, Sperr-, Verantwortungsraum als beschriftete Flächen mit Schraffur bzw. Randstil.
- Messen: Strecke und Fläche, temporär (nicht gespeichert).
- Bearbeiten: Stützpunkte ziehen/einfügen/löschen, Form verschieben, Mehrfachauswahl (Shift-Klick), **Lasso** (Auswahl mehrerer Elemente → gemeinsam verschieben, kopieren, löschen), Kopieren/Einfügen (Ctrl+C/V), Rückgängig/Wiederholen (Ctrl+Z/Ctrl+Y bzw. Ctrl+Shift+Z) für die eigene Sitzung.
- Stil: Farbe, Strichstärke, Strichart (durchgezogen/gestrichelt/gepunktet), Füllung + Transparenz, Beschriftung an der Linie bzw. in der Fläche.
- Fang/Snapping an bestehende Stützpunkte, Marker und Liniensegmente (abschaltbar, z. B. mit gedrückter Alt-Taste aussetzen).
- Koordinaten eingeben: Punkte per Eingabe statt Klick, Formate **LV95, LV03, WGS84 dezimal, WGS84 G/M/S, MGRS, UTM** (Erkennung des Formats aus der Eingabe, mit Vorschau).
- **Ebenen:** benannte Ebenen pro Lage (z. B. «Phase 1», «Sperren»), Zeichnung gehört zu genau einer Ebene, Ebenen ein-/ausblenden (lokal) und sperren (nur Leitung, gesperrt = nicht bearbeitbar). Ebenen anlegen/umbenennen/löschen: Leitung; alle dürfen in nicht gesperrte Ebenen zeichnen.
- Kürzel: L Linie, P Fläche, R Rechteck, K Kreis, F Freihand, T Text, M Messen, S Auswahl, Entf löschen.

**Mobil – stark reduziert:** alle Zeichnungen und Ebenen ansehen (Sichtbarkeit lokal schalten), Details lesen; zeichnen nur Linie, Pfeil, Kreis mit Standardfarbe; nur eigene Formen bearbeiten (Punkte ziehen, löschen). Seit 30.10. im Detailfenster eigener Linien, Pfeile und Kreise Stil per Chips: Farbe (dieselbe feste Palette wie am Desktop), Dicke (Dünn/Mittel/Dick), Darstellung (durchgezogen/gestrichelt), beim Kreis Füllung. Kein Lasso, keine Ebenenverwaltung.

### 5. Bloodhound

- Luftlinie von mir zu Ziel (Teilnehmer, Marker, Sichtung, Kartenpunkt), keine Strassenroute. Anzeige: Distanz, Azimut (Grad und ‰), Restzeit aus geglätteter eigener Geschwindigkeit (ohne Bewegung: «—»). Linienfarbe nach Restzeit: > 360 s neutral, ≤ 360 s grün, ≤ 180 s gelb, ≤ 60 s rot. Aktualisiert sich, wenn sich Ziel oder ich bewegen. Ein aktives Bloodhound pro Person, beenden jederzeit.
- **Auftrag durch die Leitung:** Die Leitung schickt einer Person ein Ziel; bei ihr startet Bloodhound automatisch mit Hinweis «Auftrag von Leitung». Die Leitung sieht pro Auftrag Distanz/Restzeit der Person (aus deren gesendeten Positionen, serverseitig nichts Neues zu rechnen nötig) und kann ihn aufheben. Die Person kann ihn quittieren und beenden; Beenden wird der Leitung gemeldet. Erreicht (≤ 25 m) wird automatisch gemeldet.
- **Sichtbarkeit (seit 31.10.):** Offene Aufträge (Linie Empfänger → Ziel) sehen alle Teilnehmenden auf der Karte (Snapshot und Deltas an alle); Banner, Distanz, Toasts und Meldungslog-Einträge («Bloodhound-Auftrag an X», «aufgehoben», «beendet», «erreicht») bekommen nur Leitung und Empfänger. Ist das Ziel eine Person, bekommt sie keine Meldung (Annahme). Das Meldungslog filtert der Server (`Meldung.nur`, `meldungSichtbar` in `shared/regeln/sichtbar.ts`), im Snapshot wie bei Deltas.

## Spec v3: Bedienung «Daumen-Ränder» (29.10.2026, drei Frage-Runden mit Juan)

Anlass: Juan beim Test auf dem Handy: «die Bedienung [ist] sehr prototypmäßig … nicht da, wo dann auch wirklich ein Button oder so logisch wäre». Störfaktoren laut Juan: Wege zu lang, Knöpfe verstreut, Optik wirkt roh. Dass die Karte verdeckt ist, stört ihn nicht.

### Grundsatz
- **Karte zuerst.** Aktionen löst man am Ort aus, per Tippen, Langdruck oder Radial-Menü. Fest sichtbar sind nur die Hauptaktionen **Status, Melden, Chat** (seit 30.10.: «Melden» öffnet daneben zwei grosse Kacheln **Sichtung** und **Marker**, weil der Unterschied als getrennte Knöpfe nicht klar war).
- Alles Übrige kommt ins **Mehr-Menü**: Range & Bearing, Spuren, Zeichnen, Leitung, Teilnehmende. (Einstellungen seit Spec v7 im Menü, Knopf «Menü» rechts unten.)
- Optimiert wird für das **Querformat**: Handy oder Tablet mit zwei Händen, im Fahrzeug oder am Tisch. Das Hochformat übernimmt das Konzept.
- **Testbetrieb:** Unter Einstellungen (seit Spec v7 Menü › Einstellungen) gibt es «Bedienung: Klassisch / Daumen-Ränder», pro Gerät gemerkt. Getestet wird in einer echten Lage. Die Variante, die verliert, wird danach entfernt.

### Grundsatz «Wenig Tipps» (Juan, 29.10.)
Juan: «Im Gefecht oder im Einsatz selber hat man keine Zeit, um groß dann mit der Tastatur Texte zu versenden … So wenig Touches und Tipps wie möglich, damit die Zeit gespart werden kann.»
- Jede Meldung lässt sich nur durch Antippen absetzen. Die Tastatur ist die Ausnahme: Freitext liegt eingeklappt hinter «+ Text».
- Ort, Zeit und Absender werden automatisch ausgefüllt. Jede Auswahl hat eine sinnvolle Vorgabe, sodass «Senden» sofort geht.
- Auswahl erfolgt über grosse Chips oder Knöpfe statt über Dropdowns und Textfelder. Ein Tipp wählt, Senden schickt ab.
- Das gilt für beide Varianten (Klassisch und Daumen-Ränder). Die Einstellung «Bedienung» betrifft nur die Anordnung.

### Meldungen mit Chips
- **Sichtung (SALUTE):** Der Ablauf ist Tipp auf «Melden», dann «Sichtung», dann Fadenkreuz (oder der Langdruck-Punkt), dann «Hier», dann die Chips, dann «Senden». Im Minimum sind das vier Tipps.
  - Art (setzt das Symbol, Vorgabe Feind): Infanterie · Schützenpanzer · Panzer · Rad-Fahrzeug · Drohne · Scharfschütze · Unbekannt (Vorgabe). Ein Chip wechselt die Zugehörigkeit auf Unbekannt oder Neutral.
  - Grösse: 1 Person · Trupp (2–4) · Gruppe (~10) · Zug (~30) · Kompanie+ · unbekannt (Vorgabe).
  - Tätigkeit: bewegt sich · in Stellung · beobachtet · schiesst · sperrt/baut · ruht · unbekannt (Vorgabe). Bei «bewegt sich» erscheint eine Zeile mit der Richtung: N NO O SO S SW W NW.
  - Ausrüstung (Mehrfachwahl): Handwaffen · Mg · Panzerabwehr · Fahrzeuge · Drohne.
  - Zeit: jetzt (Vorgabe) · vor 5 · vor 15 · vor 30 min.
  - Vertrauen: bestätigt · wahrscheinlich (Vorgabe) · unsicher.
  - Foto über einen grossen Kameraknopf. Die Bemerkung liegt eingeklappt.
  - Die Chips füllen die bestehenden Textfelder von `SichtungInput`. Der Vertrag ändert sich nicht.
- **Chat:** In jedem Gespräch stehen Schnellmeldungen über dem Eingabefeld. Ein Tipp sendet sofort: Verstanden · Wiederholen · Warten · Bereit · Ziel erreicht · Brauche Unterstützung · Negativ. Das Textfeld ist zweitrangig.
- **Status:** Ein Tipp auf einen Status sendet ihn. Der Freitext liegt eingeklappt, das Meldungslog steht nicht mehr im Melde-Panel, sondern unter «Mehr» bzw. bei der Leitung.
- **Marker und Alarm:** siehe Abläufe unten.

### Layout «Daumen-Ränder»
- **Querformat:**
  - Linker Rand für das Melden: oben Status mit dem aktuellen Status als Farbe und Text, darunter Melden, ganz unten Alarm.
  - Rechter Rand: oben die Kartenknöpfe (Ebenen, Folgen, Nordung), unten Chat und Mehr.
  - Die Kopfzeile ist schlank: Lage, Verbindung, Zahl der Teilnehmenden.
- **Hochformat:** Ein Dock unten mit Status, Melden, Chat und Mehr. Die Kartenknöpfe liegen rechts, der Alarm-Knopf links unten über dem Dock.
- Panels öffnen wie in v2: im Querformat als Seitenpanel, im Hochformat als Sheet unten.

### Abläufe
- **Status:** Ein Tipp öffnet die Auswahl, ein Tipp auf einen Status meldet ihn. Freitext bleibt optional. Das sind höchstens zwei Tipps.
- **Marker:** «Melden» → «Marker» blendet das Fadenkreuz in der Kartenmitte ein. Man schiebt die Karte und tippt «Setzen». Der Marker entsteht mit dem zuletzt benutzten Symbol und ohne Bezeichnung. Danach kann man ihn bearbeiten (Symbol, Name, Notiz), muss aber nicht.
- **Alarm:** 1,5 s gedrückt halten, dabei füllt sich ein Ring. Danach wählt man Notfall oder Feindkontakt. Loslassen vor Ablauf bricht ab. Der Alarm ist ohne Hinsehen auslösbar, versehentliches Auslösen ist ausgeschlossen.
- **Tag/Nacht automatisch nach Sonnenstand:** Liegt die Sonne über dem Horizont, gilt der Tagmodus (hell), sonst der dunkle Modus. Gerechnet wird mit der eigenen Position, ohne GPS mit der Kartenmitte. Die App prüft minütlich. Es gibt keinen Schalter.

### Optik
- Neues Farb- und Typo-System mit Tokens: «Dunkel-taktisch» (gedeckte Oliv-/Sandtöne) und ein heller Tagmodus mit hohem Kontrast für Sonnenlicht.
- Koordinaten und Messwerte in Monospace.
- Eigene Position deutlich von anderen unterscheidbar.
- Ziel ist ein Werkzeug-Look statt eines Prototyps: klare Hierarchie, ruhige Flächen, grosse Touch-Ziele (≥ 48 px, Hauptaktionen ≥ 56 px).

## Spec v4: Führungsraster (30.10.2026, nach Juans Vorlage)

Zweck: ein für die Aktion fixiertes Gitter, damit auch Leute nur mit Funk präzise melden («Hotel 09 Charlie»). Entscheide im README («Geländetaufe & Führungsraster», «Führungsraster-Details»), Vorlage in `docs/recherche/gelaendetaufe.md` (Nachtrag 30.10.).

### Schema
- Pro Lage höchstens ein **Grande** (Area of Interest: Achsen, Anfahrten) und ein **Piccolo** (Area of Operation: Objekt), beide gleichzeitig möglich. In der Ansprache unterscheidbar: «Grande H 09 C», «Piccolo B 03 A».
- Zeilen Buchstaben ab **A von oben** (bis Z, also höchstens 26), Spalten zweistellig **01, 02 … von links** (bis 99). Vorgabe 21 Spalten × 15 Zeilen; Zellgrösse Grande 80 m, Piccolo 10 m. Zeilen, Spalten und Zellgrösse frei wählbar, Ausdehnung höchstens 100 km.
- Nordausgerichtet, Linien parallel zum **LV95-Gitter**, keine Drehung. Gespeichert wird die LV95-Ecke oben links (`e`, `n`, ganze Meter). Rahmen ohne Seitenfarben.
- **Quadranten** je Zelle: A oben links, B oben rechts, C unten links, D unten rechts (Juans Vorlage; KADAS zählt C/D andersherum). Ein Punkt genau auf einer Grenze gehört zur Zelle bzw. zum Viertel rechts/unten.
- Geometrie und Ansprache (Punkt ↔ Zelle, Mitte von Zelle/Viertel, Rahmen, Linien, «Hotel 09 Charlie») liegen rein in `shared/raster.ts`; Client, GeoJSON-Export und der PDF-Export nutzen dasselbe Modul.

### Darstellung (`client/src/features/raster`)
- Rahmen kräftig schwarz mit weissem Saum (Landeskarte und Luftbild), Zelllinien dünn, ab ca. 6 px Zellgrösse; Viertellinien gestrichelt erst ab ca. 110 px Zellgrösse. Nicht fixiert: Rahmen und Köpfe gestrichelt, Name mit «· Vorschau».
- **Köpfe rundum** wie in der Vorlage: Zahlen oben und unten, Buchstaben links und rechts, als kräftige Kästchen aussen am Rahmen (Farben nach Tag/Nacht). Liegt ein Rand ausserhalb des freien Kartenbereichs (ohne Kopfzeile, Leisten, Seitenpanels, im Hochformat über dem offenen Sheet), heften sich die Köpfe an dessen Rand. Bei kleinen Zellen nur jede k-te Spalte/Zeile, damit nichts überlappt; Name («GRANDE»/«PICCOLO») über der Ecke oben links, sonst in die freie Ecke geschoben. Überdecken sich Köpfe von Grande und Piccolo, hat Piccolo Vorrang.
- **Ebenen-Auswahl:** Abschnitt «Führungsraster» mit je einem Schalter für Grande und Piccolo (nur vorhandene), pro Gerät gemerkt (`lagebild.raster.aus`). Features melden solche Schalter über `Feature.ebenen`.

### Ablauf und Rechte
- Panel «Führungsraster» (im Mehr-Menü bzw. in der Werkzeugleiste) für alle. «Grande auflegen» / «Piccolo auflegen» legt die Vorgabe in die Kartenmitte, als **Vorschau**.
- Vorschau anpassen ohne Tastatur: Zellgrösse per Chips (Grande 25–250 m, Piccolo 5–50 m), Spalten und Zeilen per Stufen −/+, «In Kartenmitte»; verschieben durch **Ziehen** des Rasters auf der Karte (nur solange das Panel offen ist; sonst schiebt Ziehen die Karte). Grössenänderungen behalten die Mitte. Danach «Fixieren».
- **Rechte** (Juan, 30.10.: auch Teilnehmende dürfen auflegen):
  - Erstellen (auflegen): alle, solange es in der Lage noch kein Raster dieser Art gibt.
  - Nicht fixiert: Erstellerin bzw. Ersteller und Leitung dürfen es verschieben, ändern, fixieren und löschen.
  - Fixiert: für alle fest. Nur die Leitung darf es lösen oder löschen; verschieben und ändern geht erst nach dem Lösen (auch für die Leitung). Nach dem Lösen dürfen wieder Ersteller und Leitung anpassen.
- Server prüft das (Regeln in `shared/regeln/raster.ts`) und verteilt jede Änderung an alle. Meldungslog: aufgelegt, fixiert, gelöst, gelöscht (verschieben nicht, sonst flutet es das Log).

### Ansprache in der App
- **Koordinatenleiste:** zusätzlich die eigene Rasterzelle samt Quadrant, z.B. «Grande H 09 C», bei beiden Rastern beide. Es zählen nur fixierte Raster (eine Vorschau kann sich noch bewegen). Auf schmalen Handys rutscht die Ansprache in eine zweite Zeile.
- **Marker- und Sichtungs-Detail:** Zeile «Raster» mit der Zelle.
- Für andere Anzeigen (Radial-Menü «Koordinate») stellt `rasterAnsprache(punkt)` in `features/raster/zustand.svelte.ts` den Text bereit («Grande H 09 C · Piccolo B 03 A» oder `null`).
- **Melden per Rasterposition:** «Melden» → «Marker» → im Fadenkreuz «Rasterposition» (nur sichtbar, wenn ein Raster fixiert ist) → Raster (bei zweien), Zeile, Spalte, Quadrant (A B / C D wie die Legende der Vorlage, oder «Ganze Zelle») per Chips → «Marker setzen». Vorgabe ist die Zelle unter der Kartenmitte. Die Auswahl wird auf der Karte gelb hervorgehoben, die Funkansprache («Hotel 09 Charlie») steht daneben. Der Marker landet mit dem zuletzt benutzten Zeichen in der Mitte der Zelle bzw. des Viertels, Bezeichnung = Ansprache.

### Vertrag (`shared/protocol.ts`)
- `RasterDef { art: 'grande'|'piccolo', e, n, zeilen 1–26, spalten 1–99, zellM }`, `Raster = RasterDef + { id = rasterId(lageId, art), fixiert, von, geaendertAm }`.
- Client → Server: `raster.setzen { raster }` (neu oder ersetzen, setzt `fixiert: false`), `raster.fixieren { art, fixiert }`, `raster.loeschen { art }`.
- Server → Client: `snapshot.raster`, `raster { raster }`, `raster.geloescht { art }`.
- GeoJSON-Export der Leitung: je Raster ein Feature `art: 'fuehrungsraster'` mit dem Rahmen als Polygon und `raster`, `lv95 {e, n}`, `zeilen`, `spalten`, `zellM`, `fixiert`.

### PDF-Ausdruck (`features/raster/ausdruck.ts`, Logik in `druck.ts`, `pdf.ts`)
- Panel «Führungsraster» › je Raster «Als PDF» (A4, ein Tipp, für alle, die das Raster sehen; auch eine Vorschau) und daneben der kleine Knopf «A3» (A3 quer, ebenfalls ein Tipp, kein Dialog). Während es entsteht: «PDF entsteht …».
- Ein PDF je Raster, A4 quer (Vorgabe) oder A3 quer, drei Seiten in der Reihenfolge der Vorlage: **Luftbild**, **SpotMap** (Luftbild mit Taufen, Fassadenlinien, Stosspfeilen und Namen) und **Landeskarte**, je mit Raster. Keine Einstufung.
- Aufbau wie Juans Vorlage (31.10. abgeglichen): das Raster ist eine Tabelle, die Karte füllt genau den Rahmen (nichts ausserhalb). Rundum Felder (`blattFelder()` in `druck.ts`):
  - oben links Quadranten-Legende A B / C D (2 × 2 Felder), oben rechts Nordpfeil (Windrose N/E/S/W);
  - Titelzeile über den Spalten in Dritteln: Massstabsbalken (Doppelpfeil über 5 von 7 Spalten, z.B. «50 m» beim Piccolo, «400 m» beim Grande, daneben «1:900») | Seitenart («LUFTBILD», «SPOTMAP», «LANDESKARTE») | Rastername («PICCOLO»). Wo die Vorlage die Einstufung hat, steht die Seitenart;
  - Spaltenköpfe oben weiss, unten grau, je eine Zelle breit; Zeilenköpfe links und rechts grau mit weisser Schrift (bei schmalen Zellen jede k-te, das Feld deckt k Zellen). Ohne Seitenfarben (die Vorlage hat beim Piccolo rote/grüne Zeilenköpfe und schwarze Spaltenköpfe unten);
  - Fusszeile: Lagename mittig, links Zelle und Spalten × Zeilen, rechts Datum.
- Blatt nordausgerichtet in LV95: Raster achsparallel, Tabelle mittig, Rand 12 pt (≈ 4 mm), Kopfzeilen 20 pt, Zeilenköpfe 32 pt; kleinster runder Massstab (Mantisse auf 0,5 gerundet, z.B. Grande 21 × 15 à 80 m → 1:7'000, Piccolo à 10 m → 1:900; A3: derselbe Rechenweg, Grande 1:5'000, Piccolo 1:650). A3 = A4-Layout um ×1,414 vergrössert (`Format.k`): Köpfe, Schriften und Linienstärken wachsen mit dem Blatt, nur der Massstab wird neu gewählt; Canvas 3308 × 2339 px. Zelllinien dünn schwarz ohne Saum und ohne Viertellinien (wie die Vorlage), Rahmen und Tabelle kräftig.
- SpotMap wie die Vorlage beschriftet: Namen in Grossbuchstaben, Gebäude im braunen Kästchen mit weisser Schrift und Führungslinie, Zielobjekte gelb, Wald dunkelbraun, Strassen als rote Schrift entlang der Achse plus dünne rote Linie (weisser Saum, unter der Schrift), damit man die Ausdehnung langer Abschnitte sieht. Fassaden und Stosspfeile wie auf der Karte (nicht in der Vorlage, Entscheid «Stossrichtung/Fassaden»).
- Gezeichnet auf ein Canvas (200 dpi), keine zweite Karte: Kacheln von Luftbild bzw. Landeskarte (Web-Mercator, Stufe passend zur Auflösung, höchstens z19) per affiner Abbildung aufs LV95-Blatt. Kacheln zuerst aus den Offline-Gebieten, sonst aus dem Netz mit der Drossel der Offline-Gebiete (in der PWA über den Kachel-Cache); je Karte nur so lange im Speicher, wie ihre Seiten brauchen. Fehlende Kacheln bleiben grau, Hinweis «… Kartenkacheln fehlen».
- PDF selbst geschrieben (je Seite ein JPEG, keine neue Abhängigkeit). Dateiname `<lage>-<art>-<datum>.pdf`.
- Browser/PWA: Download. Android-App: `window.LagebildDatei.teile()` aus `MainActivity` legt die Datei in den Cache und öffnet den Teilen-Dialog (speichern, senden, drucken); der WebView selbst kennt weder Downloads noch `window.print()`. Ältere App ohne diese Brücke: Hinweis, im Browser zu öffnen.

### Später
A3 im PDF: erledigt (31.10.). SpotMap ohne Raster als Übersicht (letzte Seite der Vorlage); Landeskarte als dritte Seite: erledigt (31.10.). Offline-Gebiet aus dem Raster: erledigt (30.10.), Raster-Detail › «Offline-Gebiet …» belegt das Aufziehen mit dem Rahmen + 10 % Rand vor.

## Geländetaufe (30.10.2026, Entscheide im README «Geländetaufe & Führungsraster», «Stossrichtung/Fassaden», «Taufe-Details», «Geländetaufe überarbeitet (31.10.)»)

Feature `client/src/features/taufe`, Regeln `shared/regeln/taufe.ts`, Vertrag `Taufe`/`TaufListen` in `shared/protocol.ts`. Grundlage: `docs/recherche/gelaendetaufe.md`.

### Familien und Namen
- Gebäude = Metalle/Elemente/Edelsteine, Strassen = Tiere, Gewässer = Wassertiere, Wald = Forest/Woods …, Flächen = Floor/Field/Weed/Ruins … Vorgabelisten je Familie (`STANDARD_TAUFNAMEN`, je ~30 Namen aus Juans Muster ergänzt, ohne Wörter des NATO-Alphabets).
- Die Leitung passt die Listen pro Lage an (Tauf-Panel › «Namenslisten der Lage», ein Name pro Zeile; gespeichert in `Lage.taufListen`, nur abweichende Familien). Doppelte Namen in den Listen lehnt der Server ab.
- Taufnamen sind je Lage eindeutig, über alle Familien und ohne Gross-/Kleinschreibung (`taufSchluessel`). Der Server sperrt Doppelte («Name «…» ist in dieser Lage schon vergeben»).
- Immer selbst wählen: Nach dem Antippen zeigt das Panel die **freien** Namen der Familie in Listenreihenfolge als Chips (ein Tipp tauft), daneben ein Feld für einen eigenen Namen. Kein automatischer Vorschlag.

### Taufmodus
- Einstieg: Mehr › Geländetaufe › «Taufmodus starten». Sichtbar an gelbem Rahmen um die Karte und der Leiste «Taufmodus» mit «Fläche zeichnen» und «Fertig» (Esc beendet am Desktop). Jeder darf taufen.
- Im Modus liegt die Vektorquelle `ch.swisstopo.base.vt` (offizielle URL, `vektor.ts`) über der Rasterkarte; antippbare Objekte sind ab Zoom 15 dezent hervorgehoben (Gebäude weiss, Strassen orange, Gewässer blau). Ausserhalb des Modus stehen die Layer auf `visibility: none`: nichts antippbar, keine Kachel geladen. Keine eigene Kachelablage (Offline-Gebiete hängt ihre lokale Bedienung später vor dieselbe Quelle).
- Antippen: `queryRenderedFeatures` (±12 px) über den Taufebenen; Familie aus Layer/Klasse (`familien.ts`), Vorrang Gebäude > Gewässer (Linie) > Strasse > Gewässer (Fläche). Strasse = `transportation` motorway … service, track (ohne `path`); Gebäude ohne underground/chimney/covered_bridge; Gewässer = `waterway` river/stream/canal/drain/ditch und `water` ohne pool. Wald und Flächen (`landcover`, `landuse`) sind nicht antippbar: die swisstopo-Flächen sind zu gross und zu grob (Tipp auf die Wiese nahm einen ganzen Bereich über Gebäude hinweg), sie werden gezeichnet.
- Im Taufmodus sind Symbole (Marker, Sichtungen, Positionen) durchlässig: ein Tipp darauf trifft das Objekt bzw. setzt den Zeichenpunkt darunter.
- Antippen einer bestehenden Taufe im Modus öffnet ihre Details.
- **Gebäudeteile sammeln:** swisstopo teilt Gebäude in Teile (Anbau, Vordach, Gebäudeteile). Der erste Tipp wählt ein Teil, jeder weitere Tipp auf ein Gebäudeteil fügt es hinzu, ein Tipp auf ein gewähltes Teil nimmt es wieder weg (Panel und Leiste zeigen «n Teile»). Getauft wird der gemeinsame Umriss (`vereinePolygone`: gemeinsame Wände heben sich auf, Stützpunkte innerhalb ~0,4 m gelten als gleich; nicht berührende Teile ergeben ein MultiPolygon). Fassaden liegen am Aussenrand.
- **Fläche und Wald zeichnen** (auch fehlende Objekte, Quartiere): «Fläche zeichnen», pro Tipp ein Punkt, «Zurück» nimmt den letzten weg, «Abschliessen» (oder Tipp auf den ersten Punkt) ab 3 Punkten öffnet die Namenswahl, Familie frei wählbar (Vorgabe Fläche). Ein Tipp näher als 12 px an einem Punkt setzt keinen neuen (Doppel-/Fehltipp); sich kreuzende Kanten werden abgelehnt (beim Setzen, Ziehen und Abschliessen).
- **Punkte bearbeiten** (nur gezeichnete Flächen/Wald, Maus und Finger): Punkt ziehen; Mittelgriff auf einer Kante antippen oder ziehen fügt einen Punkt ein; Punkt antippen wählt ihn (rot), «Punkt löschen» entfernt ihn (mindestens 3). Möglich beim Zeichnen, nach dem Abschliessen bis zum Taufen und später über Details › «Punkte bearbeiten» › «Speichern». Griffe und Punktlisten-Hilfen kommen aus `features/zeichnen` (`griffeVon`, `mitPunkt`, `ersetzePunkt`, `ohnePunkt`), die Gesten in `taufe/punkte.ts`.

### Geometrie (Kopie, da die Kacheln keine IDs haben)
- Gerechnet wird im z14-Kachelgitter (1 Einheit ≈ 0,4 m). Jedes Stück wird auf seine eigene Kachel geschnitten (der Kachelpuffer würde sonst Scheinkreuzungen erzeugen); Punkte der Kachelnähte fängt eine Toleranz von ~0,8 m. Naht = Rand der eigenen Kachel, gleich welcher Zoomstufe: MapLibre 6 liefert ab Zoom 15 aus den z14-Daten geschnittene z15/z16-Kacheln (`zoomLevelsToOverscale`); deren Nähte nicht zu erkennen war die Ursache der «schrägen Fassade» (31.10.). Echte Ecken gehen beim Fangen den Nahtschnittpunkten vor.
- **Strasse/Gewässerlinie:** Netz aus allen geladenen Stücken; vom getippten Segment aus in beide Richtungen bis zum nächsten Knoten mit Grad ≠ 2 (Kreuzung oder Ende). Danach bleibt der Modus im «Verlängern»: weitere Tipps hängen Abschnitte an dieselbe Taufe (zusammengefügt, wenn sie anschliessen, sonst MultiLineString). Auch später über Details › «Verlängern».
- **Flächen (Gebäude, Gewässer):** Stücke gleicher Art, die über eine Kachelgrenze am getippten Stück hängen, werden vereint: Gegenkanten auf der Naht heben sich auf, die übrigen Kanten ergeben Ringe (Löcher bleiben). Nachbargebäude mit gemeinsamer Wand bleiben getrennt.
- Höchstens 5000 Punkte je Taufe (`MAX_TAUF_PUNKTE`, sonst Douglas-Peucker), Koordinaten auf 1e-7° gerundet.
- Grenzen: nur geladene Kacheln (was nicht im Bild war, fehlt; dann verlängern); als Kreuzung zählt nur ein gemeinsamer Stützpunkt; die swisstopo-Daten sind nicht immer topologisch sauber.

### Stossrichtung und Fassaden
- Details › Stossrichtung per Kompass-Chips (N, NO … NW, «Keine»). Gespeichert als Azimut `stoss` (Richtung des Angriffs). Ein gelber Pfeil zeigt von der Angreiferseite aufs Objekt.
- Fassaden als farbige Linien entlang des Umrisses, je Kante aus der Normalen nach aussen: zum Angreifer (± 45°) **weiss** = Zutritt, in Stossrichtung **schwarz** = Rückseite, links in Stossrichtung **rot**, rechts **grün** (wie beim Flieger). Ansprache z.B. «Gold, Fassade Rot».
- Umfärben: Details › «Fassaden umfärben», dann Fassade auf der Karte antippen (weiss → rot → schwarz → grün). Gespeichert je Kante in `fassaden`; eine Fassade = Folge benachbarter Kanten gleicher berechneter Farbe. Neue Stossrichtung oder neue Geometrie setzt das Umfärben zurück.
- Schalter «Zielobjekt»: gelbes Namenskästchen.
- Umbenennen, Stossrichtung/Fassaden, Zielobjekt, Löschen: alle. Taufen, Umbenennen und Löschen landen im Meldungslog.

### Layer «Geländetaufe»
- In der Ebenen-Auswahl ein-/ausschaltbar (`einstellungen.taufe`, pro Gerät), im Taufmodus immer an.
- Darstellung nach Juans SpotMap: Gebäude weiss umrandet (dunkler Saum) mit weissem Namenskästchen, das bei Platzmangel mit Führungslinie daneben steht; Strassennamen rot entlang der Achse; Wald braun getönt mit Namen; Gewässer blau; Flächen dezent gelb getönt mit Namen. Beschriftungen als HTML-Kästchen mit Greedy-Platzierung (Zielobjekte, Gebäude, Strassen, Gewässer, Wald, Flächen), was keinen Platz findet, entfällt; unter Zoom 13 nur Zielobjekte.
- `darstellung.ts` ist rein rechnerisch (Features, Anker, Platzierung), der PDF-Export (SpotMap) nutzt sie mit.

### Server
- `taufe.neu`, `taufe.aendern` (nur gesetzte Felder), `taufe.loeschen`, `lage.taufListen` (Leitung). Antworten `taufe`, `taufe.geloescht`, `lage`; Snapshot `taufen`.
- Höchstens 2000 Taufen und 6 MB (JSON) je Lage; Export GeoJSON mit `art: 'taufe'`.

## Offline-Gebiete (30.10.2026)

Entscheide: README «Offline-Gebiete (30.10.)». Nutzungsbedingungen, Drosselung und Grössen: `docs/recherche/offline-gebiete.md`.

### Ablauf
- **Mehr → «Offline-Karten»** (Feature `features/offline/`). «Neues Gebiet aufziehen» schliesst das Panel; ein Finger bzw. die linke Maustaste zieht auf der Karte ein Rechteck auf (Schieben ist dabei aus, zwei Finger und Mausrad zoomen weiter). Neu ziehen ersetzt das Rechteck.
- Die Leiste unten zeigt live Breite × Höhe in km, geschätzte MB und Kachelzahl. Karten per Chip wählbar: **Landeskarte** (Vorgabe), **Luftbild**, **Taufe-Vektordaten** (`ch.swisstopo.base.vt`).
- «Weiter» → Bestätigung mit MB und freiem Speicher (`navigator.storage.estimate`). Ab 500 MB Hinweis «Grosser Download: WLAN empfohlen». Reicht der Speicher nicht, ist «Laden» gesperrt. Sonst kein Limit.
- Umfang je Karte: alle Zoomstufen ab z5 bis zum Max-Zoom, den die App online nutzt (Landeskarte z19, Luftbild z20, Vektor z14). Bis z10 zusätzlich die Umgebung ±20 km (grobe Übersicht ausserhalb), darüber nur das Rechteck.
- Name aus Lage und Datum («Übung Aare · 30.10.2026»), in der Liste umbenennbar. Beim ersten Gebiet fragt die App `navigator.storage.persist()`.

### Verwaltung
- Liste: Name, Datum, Karten, MB, «Zuletzt genutzt», Fortschritt (Balken, %) mit Zustand Lädt / Wartet / Kein Netz / Pausiert (mit Grund, z. B. «Speicher voll») / Fertig. Oben belegter und freier Speicher und ob er dauerhaft ist.
- Knöpfe je Gebiet: Pausieren/Fortsetzen bzw. Aktualisieren (lädt alles neu und überschreibt), Zeigen (Karte auf das Gebiet), Löschen (mit Rückfrage).
- Schalter «Umrisse»: gestrichelte Rechtecke aller Gebiete auf der Karte (pro Gerät gemerkt).
- Gebiete laden nacheinander. Ein abgebrochener Download (Netz weg, App zu) läuft beim nächsten Öffnen nach dem Anmelden an der gespeicherten Stelle weiter; ohne Netz wartet er und versucht es alle 10 s.
- **Ablauf:** Gebiete, aus denen 60 Tage keine Kachel angezeigt wurde, löscht die App beim Start (Toast). Als Nutzung zählen nur Kacheln über z10 im Rechteck, nicht die gemeinsame Übersicht.

### Technik
- **Ablage:** Cache Storage, Cache `lagebild-offline-kacheln`, Schlüssel = https-URL der Kachel bei swisstopo. Liste der Gebiete in `localStorage` (`lagebild.offline.gebiete`), Fortschritt als lückenloser Zähler `erledigt` in fester Kachelreihenfolge (Karte, Zoom aufsteigend, zeilenweise).
- **Anzeige:** Alle swisstopo-Quellen in `MapView` laufen über das MapLibre-Protokoll `kachel://` (`lib/kachelspeicher.ts`): zuerst Cache Storage, dann Netz. Gleich in PWA und Android-App (dort ohne Service Worker). Fehlt eine Kachel ohne Netz, meldet das Protokoll 404: MapLibre zeigt still die gröbere Stufe, ohne Fehlermeldung pro Kachel.
- **Keine doppelte Speicherung:** Der Workbox-Cache `swisstopo-kacheln` (angezeigte Kacheln, PWA) bleibt. Offline-Gebiete laden mit `cache: 'no-store'`, die Workbox-Route ignoriert diese Anfragen (`vite.config.ts`). Liegt eine Kachel schon im Workbox-Cache, wird sie verschoben statt neu geladen. Was im Offline-Speicher liegt, fragt die Karte gar nicht erst übers Netz an.
- **Überlappung:** Gebiete teilen Kacheln. Löschen entfernt nur Kacheln, die kein anderes Gebiet braucht (aus den Rechtecken gerechnet, keine gespeicherten Zähler).
- **Taufmodus später:** Die Vektorkacheln liegen unter `TAUFE_VT.vorlage` (`lib/karten.ts`). Eine Vektorquelle mit `tiles: [lokal(TAUFE_VT.vorlage)]` bekommt sie über denselben Weg zuerst lokal.
- **Drosselung:** WMTS ≤ 12 Anfragen/s (60 % des Fair-Use, Juan 30.10.), Vektorkacheln ≤ 30/min, 4 gleichzeitig, 30 s Pause bei 429/5xx (`features/offline/laden.ts`).
- **Luftbild-Detail:** Vorgabe bis Zoom 19 (10×10 km ≈ 0,9 GB); «Volles Detail» bis Zoom 20 (≈ 3,7 GB) beim Aufziehen wählbar, sinnvoll für kleine Gebiete wie ein Piccolo-Objekt.

### Offene Punkte
- Luftbild bis z20 braucht für 10 × 10 km ~3,7 GB und gedrosselt ~9 h (Landeskarte ~740 MB, ~2,3 h). Ob das Luftbild offline bei z19 aufhören soll (~0,9 GB), entscheidet Juan.

## Spec v5: Dezentrale Missionen (30.10.2026, Entscheide im README, Recherche `docs/recherche/dezentral.md`)

Juan: «Keine zentrale Verwaltung oder etwas, sondern immer lokale Missions und Verteilung.» Aus der Server-Lage wird eine Mission auf den Geräten: jedes Gerät hält die ganze Lage, alles ist Ende-zu-Ende verschlüsselt, der Server wird ein blinder Vermittler. Die Technik steht ausführlich in der Recherche; hier steht nur das Verbindliche, dazu die Tickets.

**Quellen in Klammern:** README-Entscheidungslog **M** «Dezentrale Missionen (30.10.)», **G** «Live-Update gesichert (30.10.)», **Ü** «Updates überspringen (30.10.)», **L** «Missionen: Leitung, Aufnahme, Chat, Schutz (30.10.)», **A** «Missionen: Ausfall, Konflikte, Lizenz, Altlagen (30.10.)»; **R§1–R§7**, **R-Arch**, **R-Etappen**, **R-Risiken** = Abschnitte von `docs/recherche/dezentral.md`; **LU** = `docs/recherche/live-update.md` und README «Live-Update der Oberfläche»; **P** = `shared/protocol.ts`. Die Fragen O1–O18 sind am 31.10. entschieden (README **O** «Missionen: offene Fragen O1–O18 (31.10.)»); sie stehen am Ende unter «Entschieden 31.10.».

### 1. Grundsatz und Begriffe

- **Grundsatz:** keine zentrale Datenhaltung. Missionsdaten sind Ende-zu-Ende verschlüsselt, Schlüssel nur auf den Geräten; jedes Gerät hält die ganze Lage; nach Missionsende bleiben die Daten verschlüsselt auf den Geräten, bis sie gelöscht werden (M). Der heutige Server-Modus mit Lage-Code entfällt (M), zuletzt in Etappe 5.
- **Mission:** eine Lage ohne Server. Eröffnet in der Android-App, erkennbar an einer zufälligen Missions-ID (16 Byte) (M, R-Arch).
- **Missionsübersicht:** Startseite der Android-App mit allen gespeicherten Missionen: eröffnen, beitreten, löschen (M).
- **Leitgerät:** das Gerät mit der Rolle Leitung. Anfangs das Gerät, das die Mission eröffnet hat; die Leitung ist übergebbar (M).
- **Rollen** (M): **Leitung** (alle Rechte wie heute die Leitung), **Gruppenführer** (Leitungsrechte über die eigene Gruppe), **Teilnehmer** (wie heute), **Beobachter** (nur lesen, sendet keine Position).
- **Gruppe:** heute `Teilnehmer.einheit` («= Gruppe für Chat», P). Die Leitung wählt sie bei der Aufnahme, wechseln nur durch die Leitung (O2).
- **Ersatz-Reihenfolge:** Reihenfolge der Gruppenführer, die bei Ausfall des Leitgeräts die neue Leitung bestimmt; Vorgabe ist die Reihenfolge der Ernennung (A).
- **PWA/iPhone:** nur als Teilnehmer, nur über den Vermittler (M, R§4).
- **Ereignis:** jede Änderung an der Lage (Marker, Zeichnung, Chat, Status …), vom Autor-Gerät signiert und mit dem Epochenschlüssel verschlüsselt («Umschlag») (R§1).
- **Ereignislog:** je Gerät ein nur wachsendes Log seiner Ereignisse, verkettet über laufende Nummer und Hash des Vorgängers (R§2).
- **Reducer:** die heutige Serverlogik als reine Funktion in `shared/regeln/`, die jedes Gerät gleich anwendet und die Ereignisse gegen die Regeln prüft (R§2).
- **Führungskette:** lineare Folge der Leitungsereignisse (Eröffnung, Aufnahme, Rolle, Übergabe, Ausschluss, Schlüsselwechsel, Beenden), jedes von der amtierenden Leitung signiert (R§1, R-Arch). Nur die Leitung nimmt auf, die Kette bleibt rein linear, es gibt keine Aufnahme-Ereignisse ausserhalb der Kette (O1).
- **Epoche / Epochenschlüssel `K_e`:** Gruppenschlüssel der Mission; jeder Ausschluss beginnt eine neue Epoche mit neuem Schlüssel (M, R§1).
- **Schlüsselbund:** alle Epochenschlüssel einer Mission auf einem Gerät, verpackt mit dem Tresorschlüssel (R§1).
- **Vermittler:** der Dienst auf lage.arvuna.ch, der nur Chiffrat kurz vorhält und verteilt und keine Schlüssel kennt (M, R§3). **Raum:** Postfach beim Vermittler, abgeleitet aus `K_e`. **Vorhalt:** was ein Raum für Nachzügler aufbewahrt.
- **Hub:** derselbe Vermittler, aber in der Leit-App im Hotspot (R§4).
- **Stand-Vektor:** je Autor die höchste lückenlose laufende Nummer; zwei Geräte tauschen ihn beim Verbinden und liefern einander das Fehlende (R-Arch). **Stand-Paket:** verdichteter Bestand, den ein neues Gerät beim Beitritt einmalig bekommt (R-Arch).
- **HLC:** Hybrid Logical Clock, Zeitstempel für die gemeinsame Reihenfolge (R§2).
- **Protokoll-Hauptversion:** `PROTOKOLL_VERSION` (P), steht in jeder Mission. **Mindestversion:** pro Mission von Ersteller bzw. Leitung gesetzt (Ü); bezogen auf den Web-Stand (`webCode`), geprüft bei der Aufnahme (O9).
- **Transport-Etappen** (M): 1. Vermittler, 2. Hotspot/WLAN ohne Internet, 3. LoRa-Funk-Mesh. Sie entsprechen den Bau-Etappen 3, 6 und 7 (R-Etappen).

### 2. Abläufe aus Nutzersicht

**Mission eröffnen** (nur Android-App)
- Missionsübersicht › «Neue Mission»: Name, Statusliste (Vorgabe `STANDARD_STATUS`), Mindestversion. Das Gerät wird Leitung (M, R-Arch «Eröffnen»).
- Ohne Netz entsteht eine «Solo-Mission»: eigene Spur, Marker, Zeichnen, Nachbereitung auf dem Gerät (R-Etappen 2).

**Beitreten**
- **Per QR:** Die Leitung zeigt in der Mission einen QR-Code; er gilt 10 min und erneuert sich danach selbst. Wer ihn in der App scannt, ist ohne Freigabe drin (M). Das zeigende Gerät muss dabei online sein (Vermittler oder Hub), über LoRa allein geht kein Beitritt (R§1, R-Arch).
- Gescannt wird **in der App** (Android-App oder installierte PWA). Die System-Kamera öffnet den Link im Browser; die Seite `/b` zeigt dann «In der Lagebild-App scannen» (R§6).
- **Per Code:** 10 Zeichen aus dem bestehenden `ALPHABET`, ebenfalls 10 min gültig. Weil der Code keinen Fingerabdruck trägt, nimmt das zeigende Gerät erst nach Antippen von «Aufnehmen» auf und zeigt dazu Rufname und Angaben der Anfrage (R§1 «Code statt QR»). Beide Geräte zeigen eine vierstellige Prüfzahl, die die Leitung vor «Aufnehmen» vergleicht (O16).
- **Wer aufnimmt:** nur die Leitung; sie wählt dabei die Gruppe (O1, O2; ersetzt den früheren Entscheid L «Aufnahme durch Gruppenführer»). Jede Aufnahme sieht die Leitung sofort und kann mit einem Tipp ausschliessen (R§1).
- Beim Beitritt prüft das aufnehmende Gerät Ablauf und Mindestversion, bezogen auf den Web-Stand (R-Arch, O9). Geräte unter der Mindestversion schalten automatisch auf Nur-Lesen (O9). Ein Gerät mit anderer Protokoll-Hauptversion bekommt «Update für diese Mission nötig» (Ü); ein Gerät mit neuerer Hauptversion tritt einer älteren Mission nicht bei, es sieht «Mission läuft mit älterer Version», bei Bedarf eröffnet die Leitung eine neue Mission (O13).
- Neue Geräte melden Rufname, Einheit, Funktion, Symbol und App-Version (R-Arch «Beitreten»). Sie bekommen den Bestand als Stand-Paket und danach alles live.

**Rollen**
- Die Leitung ernennt Gruppenführer und Beobachter und setzt Rollen zurück (Ereignis `rolle`, R§2).
- Gruppenführer: Objekte der eigenen Gruppe ändern und löschen (R§2 Tabelle), Bloodhound-Aufträge an die Gruppe, Alarme der Gruppe aufheben (O3). Nicht: Aufnahme (O1), Ausschluss, Schlüsselwechsel, Ebenen, Statusliste, Taufnamenslisten, fixierte Raster; das bleibt bei der Leitung.
- Der Beobachter sieht alles, sendet nichts und keine Position; der Reducer verwirft Positionen und Änderungen von Beobachtern (M).
- Gruppenführer oder Leitung werden können nur Android-Geräte, die nicht Beobachter sind; PWA-Geräte bleiben Teilnehmer oder Beobachter (O7).

**Leitungsübergabe und Ersatzleitung**
- **Übergabe:** Die Leitung übergibt per Tipp an ein anderes Mitglied; ab diesem Glied der Kette gilt das neue Gerät als Leitung, das alte wird Teilnehmer. Schlüssel wandern nicht (R-Arch «Leitungsübergabe»). An jedes Gerät, das nach O7 Leitung werden kann (O8).
- **Ersatz-Reihenfolge:** sichtbar und änderbar bei der Leitung; Vorgabe = Reihenfolge der Ernennung (A).
- **Ausfall:** Ist das Leitgerät 10 min nicht erreichbar, übernimmt der erste erreichbare Gruppenführer der Ersatz-Reihenfolge automatisch (L, A). Gelesen heisst das: Gruppenführer k übernimmt, wenn er seit 10 min weder von der Leitung noch von einem Gruppenführer vor ihm etwas empfangen hat (abgeleitet aus A). «Erreichbar»: Leitgerät und Gruppenführer senden mindestens jede Minute ein signiertes Lebenszeichen, auch bei Emission Control (ohne Position) (O4). Übernehmen bei geteiltem Netz zwei gleichzeitig, gilt der in der Ersatz-Reihenfolge frühere, die andere Übernahme und ihre Leitungsereignisse fallen weg (O5). Gibt es keinen Gruppenführer, läuft die Mission ohne Leitung weiter (keine Aufnahme, kein Ausschluss), alle sehen einen Hinweis; die Leitung bekommt einen Hinweis, solange kein Gruppenführer ernannt ist (O6).
- **Rückkehr:** Das frühere Leitgerät sieht die Übergabe und wird Gruppenführer (A). Leitungsereignisse, die es nach der Übernahme noch offline gemacht hat, verwirft die Kette («Übernahme schlägt gleichzeitige Leitungsereignisse», R-Risiken). Seine gewöhnlichen Ereignisse (Marker, Chat …) gelten.

**Ausschluss und Schlüsselwechsel**
- Die Leitung schliesst ein Gerät mit einem Tipp aus. Die übrigen Geräte bekommen einen neuen Schlüssel und wechseln in einen neuen Raum (M, R§1).
- Das ausgeschlossene Gerät sieht «ausgeschlossen» und bekommt nichts Neues mehr. Was es bis dahin hatte, behält es; das lässt sich technisch nicht verhindern und steht so im Bestätigungsdialog (R§1, R-Risiken).
- Gruppenführer dürfen nicht ausschliessen (O3).

**Mission beenden und löschen**
- **Beenden:** nur die Leitung (Ereignis `mission.beenden`); alle Geräte schalten auf Nur-Lesen, die Daten bleiben verschlüsselt erhalten (M, R§2 Tabelle).
- **Löschen:** in der Missionsübersicht; löscht Schlüsselbund und Ereignisse auf dem Gerät. Schon das Löschen des Schlüsselbunds macht den Rest unlesbar (R§2 «Persistenz»). Löschen gilt nur lokal je Gerät, kein «Für alle löschen» (O14).
- **Export GPX/GeoJSON** auf dem Gerät, gleicher Inhalt wie heute (`server/src/export.ts` wandert nach `shared/`, R§2 Tabelle). Jedes Mitglied darf exportieren (O15).

**Chat**
- Direktnachrichten nur für Absender und Empfänger lesbar (zusätzlich paarweise verschlüsselt); Gruppen- und Allgemein-Chat für alle Geräte der Mission lesbar, die Anzeige filtert nach Gruppe (L, R§2 Tabelle).
- Bloodhound-Aufträge haben alle Geräte, Linie für alle, Meldungen nur bei Leitung und Empfänger (R§2 Tabelle).

**Taufnamen nach Offline-Arbeit**
- Wählen zwei Geräte offline denselben Taufnamen, gewinnt die frühere Taufe (Reihenfolge nach HLC). Die spätere bleibt sichtbar, ist als «Namenskonflikt» markiert, und ihr Ersteller wird zum Umbenennen aufgefordert (A, R§2 Tabelle).
- Allgemein: was nach dem Abgleich gegen eine Regel verstösst (z. B. Verschieben eines inzwischen fixierten Rasters), verschwindet mit Hinweis «abgelehnt: …» (R§2 Tabelle).

**Altlagen-Export**
- Beim Abschalten des Server-Modus werden die Lagen auf dem Server als GPX/GeoJSON exportiert und danach gelöscht (A). Die App zeigt einen Hinweis mit Frist von 7 Tagen; jede Leitung exportiert selbst, danach löscht der Server (O17).

**Mischbetrieb, Mindestversion, Updates während der Mission**
- Geräte ohne Update laufen weiter (Ü). Mischbetrieb bei gleicher Protokoll-Hauptversion: das ältere Gerät zeigt «ältere Version», neue Funktionen fehlen ihm (Ü). Bei anderer Hauptversion: «Update für diese Mission nötig» (Ü).
- Mindestversion pro Mission setzt Ersteller bzw. Leitung (Ü); Bezug und Prüfung nach O9 (Web-Stand, bei der Aufnahme; darunter automatisch Nur-Lesen).
- **Während einer laufenden Mission bietet die App nur Updates der Stufe `sicherheit` an, die übrigen nach Missionsende** (Ü, G). Auch Sicherheitsupdates werden nur nach Antippen aktiviert (G, LU). «Laufend» heisst Phase LV (Lageverfolgung); die Sperre gilt nur dort (O10, Abschnitt «Phasen AP/LV/AN»). PWA: Update-Hinweis wie heute, nur nach Antippen; den Mischbetrieb sichert die Protokoll-Hauptversion (O12).
- Bei Stufe `sicherheit` sieht die Leitung die betroffenen Geräte in der Geräteliste und kann sie ausschliessen (Ü). Betroffen sind Geräte mit kleinerem Stand als der höchste gesiegelte `webCode` der Stufe `sicherheit`, den das Leitgerät gesehen hat; kein neues Siegel-Format (O11).
- Die Geräteliste der Leitung zeigt je Gerät die App-Version (R-Etappen 4).

**Geräteschutz**
- Gespeicherte Missionen liegen im Android-Schlüsseltresor (Keystore), geschützt über die Bildschirmsperre des Handys; keine App-PIN (L).
- PWA: nicht exportierbarer `CryptoKey` in IndexedDB (R§1); «Zum Home-Bildschirm» empfehlen, damit iOS den Speicher nicht leert (R§7).

### 3. Technik je Baustein

Einzelheiten, Grössen und Quellen stehen in der Recherche; hier nur, was der Bau einhalten muss.

**Schlüssel und Formate** (R§1 «Empfehlung: Schlüssel und Formate»)
- Nur WebCrypto, keine Krypto-Bibliothek, kein MLS (R§1). Geräte-Signaturschlüssel Ed25519, Tauschschlüssel X25519, beide `extractable: false` in IndexedDB; Geräte-ID = base32(SHA-256(pub))[0..16].
- Epochenschlüssel AES-256-GCM; daraus per HKDF der Raum beim Vermittler und `K_e^lora`. Schlüsselwechsel spätestens nach 2^30 Ereignissen je Epoche.
- **Umschlag:** Klartext `{m, e, a, s, p, h, k, b}`, Ed25519-Signatur über genau diese Bytes, dann AES-GCM mit 96-Bit-Zufalls-Nonce über `sig ‖ bytes`. Ereignis-ID = SHA-256 der signierten Bytes, gekürzt auf 16 Byte.
- **Schlüsselwechsel:** `K_{e+1}` je verbleibendem Gerät per X25519 + HKDF + AES-GCM verpackt, als ein signiertes Ereignis `schluessel` im alten Raum.
- **QR:** `https://lage.arvuna.ch/b#v=1&m=…&j=…&f=…&x=…[&h=…][&r=…]`, alle Geheimnisse im Fragment. Erzeugen mit `qrcode` (vorhanden), scannen mit `getUserMedia` + `BarcodeDetector`, auf iOS/Firefox mit dem Polyfill `barcode-detector` (Lazy-Import) (R§6).
- **Tresor:** Android `@aparajita/capacitor-secure-storage` (Keystore, AES-GCM); PWA nicht exportierbarer `CryptoKey` (R§1).
- **Mindestanforderung:** WebView ≥ 137 bzw. iOS 17 (Ed25519). `android.minWebViewVersion: 137` in `capacitor.config.ts`; die PWA probiert beim Start `generateKey({name: 'Ed25519'})` und meldet klar, wenn es fehlt (R§1, R-Risiken).

**Ereignislog und Reducer** (R§2 «Empfehlung»)
- Je Gerät ein nur wachsendes Log (Autor, laufende Nummer `s`, Hash des Vorgängers `p`). Doppeltes fällt über die Ereignis-ID weg. Zwei verschiedene Ereignisse mit gleichem (Autor, `s`): Gerät markieren und der Leitung melden. Fehlt ein Vorgänger, trotzdem anwenden und nachfordern.
- Reihenfolge für alle: (HLC, Autor-ID, `s`). Zustand = Faltung aller gültigen Ereignisse; Verspätetes wird ab dem letzten Zwischenstand davor neu gefaltet (Zwischenstand alle ~500 Ereignisse). Die HLC eines Ereignisses liegt höchstens 5 min nach der Empfangszeit (R-Risiken).
- `wende(zustand, ereignis) → { zustand, deltas: ServerMsg[] } | { abgelehnt: grund }` in `shared/regeln/`. Die Deltas sind die heutigen `ServerMsg`, damit `store.svelte.ts` nahezu unverändert bleibt.
- Rechte prüft der Reducer nach dem Stand der Führungskette an der Stelle des Ereignisses. Die Abbildung der heutigen Serverregeln steht in der Tabelle R§2 «Heutige Server-Regeln im neuen Modell» und gilt so.
- **Positionen** als eigener Strom ausserhalb des Logs (signiert, verschlüsselt); je Autor gilt die letzte. Nach dem Wiederverbinden und am Missionsende liefert jedes Gerät die eigene Spur in Paketen zu 100 Punkten nach (`spur.nachliefern`).
- **Verdichtung:** je Objekt nur die letzte gültige Fassung plus Grabsteine; Budgets zählen den aktuellen Stand.
- `teilnehmer.online`/`zuletzt` aus dem letzten empfangenen Ereignis; Alter/Stale nach Empfangszeit; `serverZeit` entfällt.

**Vertrag** (R§2 «Was vom Vertrag bleibt», P)
- Entitäten, Konstanten und Prüfungen bleiben. `ClientMsg` (ohne `hallo`, `lage.codeErneuern`) wird zum Inhalt `b` der Ereignisse. Neu: `mission.eroeffnen{name, statusSet, protokoll, mindestversion}`, `aufnahme`, `rolle`, `leitung`, `ausschluss{id, bisNummer}`, `schluessel`, `mission.beenden`, `spur.nachliefern`; `Rolle` um `beobachter` und `gruppenfuehrer` erweitert; `appVersion` in `aufnahme`/`teilnehmer`.
- REST-Bodies (`LageErstellen`, `Beitreten`, `Beigetreten`) entfallen mit Etappe 5; `PING_MS`/`STILLE_MS` wandern ins Vermittler-Protokoll.
- `PROTOKOLL_VERSION` nach der Regel in P erhöhen, sobald ältere Stände nicht mehr mit neueren zusammenarbeiten.

**Vermittler** (R§3, `server/src/relay.ts`)
- WebSocket, Steuerung JSON, Inhalt binär: `sub {raum, ab}` (Vorhalt ab Cursor, dann live), `pub {raum, daten, ersetz?}` (Cursor je Raum; von `ersetz` bleibt nur das Neueste, für Positionen). Blobs `PUT/GET /v1/blob/<sha256>`.
- Räume an die Epoche gebunden; Beitrittsräume aus dem Beitrittsgeheimnis, Lebensdauer 10 min.
- Vorhalt je Raum 72 h und ≤ 20 MB (Ringpuffer), Gesamtspeicher gedeckelt, der älteste Raum fällt zuerst. Blobs ≤ 8 MB, 14 Tage.
- Limits wie heute: Nachricht ≤ 256 KB, 50 Nachrichten/10 s je Verbindung, ≤ 20 Verbindungen je IP (/64), ≤ 4 Räume je Verbindung, Blobs 10/min, Ping alle 20 s. `sicherheit.ts` bleibt.
- Keine Konten, kein Erstell-Passwort. IPs nur im Speicher für Rate-Limits, nie in Logs oder auf der Platte; keine Raum-Statistik. Grössen auf feste Stufen auffüllen (256 B, 1 KB, 4 KB, 16 KB …; Blobs in 64-KB-Stufen).
- Proof-of-Work oder Ausweise erst, wenn Missbrauch auftritt.

**IndexedDB und Persistenz** (R§2 «Persistenz», R-Arch)
- Umschläge so speichern, wie sie ankommen (verschlüsselt); nur der Schlüsselbund wird zusätzlich mit dem Tresorschlüssel verpackt. Löschen = Schlüsselbund und Umschläge löschen.
- Beim ersten Missionsbeitritt `navigator.storage.persist()` (wie bei den Offline-Gebieten).
- `client/src/lib/mission.svelte.ts` hält Missionsübersicht, Log, Faltung, Persistenz, Nachforderung und Wege und speist `store.svelte.ts`. Wege in `client/src/lib/wege/` (`vermittler.ts`, `hub.ts`, `lora.ts`) mit einer Schnittstelle `senden(bytes)`, `empfangen(cb)`.

**Fotos** (R§2 «Grössen», R-Risiken)
- Nicht im Log: das Ereignis trägt SHA-256, Grösse und Schlüssel, das Bild liegt verschlüsselt als Blob beim Vermittler bzw. Hub (≤ 8 MB, ≤ 300 je Mission wie heute) und lädt im Hintergrund.
- Vollständig nur im WLAN, sonst Vorschau; Budget je Mission.

**Hotspot** (R§4) und **LoRa** (R§5): siehe Etappen 6 und 7.

### 4. Etappen-Tickets

Tracer-Bullet-Schnitt nach R-Etappen: jede Etappe ist für sich auslieferbar, die App funktioniert nach jeder. Aufwand in Arbeitstagen (Bau per Agent plus Review). Bis Etappe 5 läuft der Server-Modus parallel weiter (R-Etappen).

#### Etappe 0: Geräteprobe
- **Ziel:** Gewissheit auf Juans Geräten, dass die Bausteine laufen, bevor gebaut wird (R-Etappen 0).
- **Umfang:** versteckte Testseite in der App (und als PWA-Seite für das iPhone): Ed25519/X25519 erzeugen, signieren, ableiten; Speichern und Lesen im Tresor (Keystore-Plugin); IndexedDB-Persistenz über Neustart und Live-Update; `BarcodeDetector` bzw. Polyfill scannt einen QR; `ws://` zur Hotspot-IP aus der WebView mit und ohne Netzbindung. Ergebnis je Prüfung als Liste mit OK/Fehler zum Kopieren.
- **Abnahme:**
  - Für jedes Testgerät steht ein Protokoll mit WebView-Version und Ergebnis je Prüfung im Repo (`docs/recherche/dezentral.md`, Abschnitt «Nicht verifiziert» ergänzt).
  - Die Punkte aus «Nicht verifiziert» zur WebView (Mobilfunk-Fehlweg, Local Network Access, Ed25519 ab 137) sind beantwortet oder als «nicht prüfbar» begründet.
  - iPhone (PWA, iOS ≥ 17): Ed25519 und Scannen per Polyfill geprüft.
- **Blockiert durch:** –
- **Aufwand:** ½–1
- **Braucht Juan/Gerät:** ja (Android-Geräte, iPhone, Hotspot; neue APK wegen Keystore-Plugin, ein Debug-Build reicht).

#### Etappe 1: Regeln herauslösen
- **Ziel:** die Serverlogik als reine Funktionen in `shared/`, als Grundlage für den Reducer auf den Geräten (R-Etappen 1). Wird parallel gebaut.
- **Umfang:** Regeln aus `server/src/zeichnen.ts`, `raster.ts`, `taufe.ts` und die Prüfungen aus `ws.ts` (Rechte Ersteller/Leitung, gesperrte Ebene, fixiertes Raster, `nameFrei`, Mengen- und Zeichenbudgets, Positionsrate, Chat-Empfänger) nach `shared/regeln/`; `server/src/export.ts` nach `shared/`. Der Server ruft sie auf und speichert nur noch.
- **Abnahme:**
  - `shared/regeln/` importiert nichts aus `server/` und kein `node:*` (läuft im Browser).
  - In `server/src/zeichnen.ts`, `raster.ts`, `taufe.ts` steht keine Regel mehr, nur Speichern und Verteilen.
  - Eigene Unit-Tests für die Regeln in `shared/`; `npm run check`, `npm test` und `npm run e2e` grün, E2E-Tests unverändert (kein sichtbarer Unterschied).
- **Blockiert durch:** –
- **Aufwand:** 2–3
- **Braucht Juan/Gerät:** nein.

#### Etappe 2: Mission auf dem Gerät
- **Ziel:** «Solo-Mission» ohne Netz: eigene Spur, Marker, Zeichnen, Nachbereitung, alles lokal (R-Etappen 2).
- **Umfang:** Geräteschlüssel; Tresor (Keystore); Missionsübersicht in der Android-App mit Eröffnen und Löschen (M); Ereignislog mit Signatur, HLC und Reducer aus Etappe 1; Persistenz in IndexedDB; Export GPX/GeoJSON auf dem Gerät; `minWebViewVersion: 137`. Der bisherige Lage-Login bleibt erreichbar.
- **Abnahme:**
  - Mission im Flugmodus eröffnen, Marker setzen, Linie zeichnen, Spur aufzeichnen, App beenden und neu starten: alles ist noch da.
  - Ein gefälschtes Ereignis (falsche Signatur) und ein regelwidriges (z. B. Budget überschritten) lehnt der Reducer ab (Unit-Test).
  - Dieselben Ereignisse in anderer Ankunftsreihenfolge ergeben denselben Zustand (Unit-Test).
  - Der Export der Solo-Mission als GPX und GeoJSON entspricht dem heutigen Server-Export (Test gegen dieselben Daten).
  - Mission löschen entfernt Schlüsselbund und Ereignisse (IndexedDB danach ohne Einträge dieser Mission).
- **Blockiert durch:** 1; Ergebnis von 0 (Keystore, IndexedDB).
- **Aufwand:** 2–3
- **Braucht Juan/Gerät:** ja (neue APK wegen nativem Plugin und `capacitor.config.ts`, danach `deploy/min-native-code` setzen; Test am Gerät).

#### Etappe 3: Vermittler und Ende-zu-Ende
- **Ziel:** dezentrale Missionen über Internet mit dem heutigen Funktionsumfang (R-Etappen 3, Transport-Etappe 1 aus M).
- **Umfang:** Umschlag; `server/src/relay.ts` mit Räumen, Vorhalt, Limits, Blobs; Beitritt per QR (ohne Freigabe) und Code (mit Freigabe und vierstelliger Prüfzahl, O16); Stand-Vektor und Stand-Paket; Fotos als Blobs; Direktnachrichten paarweise verschlüsselt (L); Namenskonflikt bei Taufen (A); PWA als Teilnehmer; Protokoll-Hauptversion und Mindestversion je Mission (Ü); Hinweise «ältere Version» und «Update für diese Mission nötig» (Ü); Update-Sperre ausser `sicherheit` in der Phase LV (Ü, G, O10).
- **Abnahme:**
  - Zwei Android-Geräte und ein iPhone (PWA) arbeiten in einer Mission; alles aus Spec v1–v4 kommt auf allen an.
  - Ein QR-Code älter als 10 min wird abgelehnt (Test mit verstellter Uhr des zeigenden Geräts); ein Code-Beitritt erscheint erst nach «Aufnehmen».
  - Der Vermittler speichert nur Chiffrat und loggt keine IPs (Test: die Vorhalt-Ablage enthält keinen Klartext eines Test-Ereignisses; Log-Ausgabe ohne IP).
  - Ein Gerät, das 30 min offline war, holt nach dem Wiederverbinden alles nach (Vorhalt bzw. Stand-Vektor); die eigene Spur wird nachgeliefert.
  - Zwei Geräte taufen offline denselben Namen: nach dem Abgleich gewinnt die frühere Taufe, die spätere zeigt «Namenskonflikt» und fordert ihren Ersteller zum Umbenennen auf.
  - Eine Direktnachricht kann ein drittes Mitglied nicht entschlüsseln (Unit-Test).
  - Ein Gerät mit anderer Protokoll-Hauptversion bekommt «Update für diese Mission nötig»; ein Gerät unter der Mindestversion wird bei der Aufnahme auf Nur-Lesen geschaltet (O9).
  - In der Phase LV bietet die App einen Stand der Stufe `normal` nicht an, einen der Stufe `sicherheit` schon (Test mit gesiegeltem Test-Manifest).
  - Die Vermittler-Limits aus R§3 sind per Test belegt.
  - Review durch den security-reviewer vor dem Merge (R-Risiken «Selbstgebaute Krypto»).
- **Blockiert durch:** 2.
- **Aufwand:** 5–7
- **Braucht Juan/Gerät:** ja (Deploy des Vermittlers auf LXC 124, Test mit mindestens zwei Android-Geräten und iPhone).

#### Etappe 4: Rollen und Schlüssel
- **Ziel:** Missionen vollständig wie im Entscheid: Rollen, Übergabe, Ersatzleitung, Ausschluss (R-Etappen 4, M, L, A).
- **Umfang:** Führungskette vollständig; Beobachter; Gruppenführer mit Rechten über die eigene Gruppe, ohne Aufnahme (O1, O3); Gruppenwahl bei der Aufnahme durch die Leitung (O2); Ersatz-Reihenfolge (A); Leitungsübergabe an jedes fähige Android-Gerät (O7, O8); Lebenszeichen jede Minute und automatische Ersatzleitung nach 10 min (L, A, O4–O6); Ausschluss mit Schlüssel- und Raumwechsel; Geräteliste mit App-Version und Kennzeichnung der von einem Sicherheitsupdate betroffenen Geräte (Ü).
- **Abnahme:**
  - Ein Beobachter sendet keine Position und kann nichts ändern (Reducer-Test und am Gerät).
  - Ein Gruppenführer kann nicht aufnehmen und nicht ausschliessen; er ändert und löscht Objekte seiner Gruppe, schickt Bloodhound an die Gruppe und hebt Alarme der Gruppe auf (Reducer-Test).
  - Nach einem Ausschluss liest das ausgeschlossene Gerät keine neuen Ereignisse (Test: es kann `K_{e+1}` nicht auspacken), die übrigen arbeiten im neuen Raum weiter; ein Gerät, das während des Ausschlusses offline war, findet den Wechsel nach dem Verbinden.
  - Leitgerät 10 min ausgeschaltet: der erste Gruppenführer der Reihenfolge übernimmt; ist auch er stumm, der zweite. Das zurückkehrende Leitgerät zeigt die Übergabe und ist Gruppenführer; seine Offline-Leitungsereignisse sind verworfen.
  - Gabelungen der Führungskette ergeben in einer Simulation (R-Risiken) auf allen Geräten dieselbe Leitung.
  - Die Geräteliste zeigt die Version je Gerät und markiert betroffene Geräte, mit Ausschluss per Tipp.
- **Blockiert durch:** 3.
- **Aufwand:** 3–4
- **Braucht Juan/Gerät:** ja (Feldtest mit mindestens drei Geräten für Ersatzleitung und Ausschluss).

#### Etappe 5: Server-Modus abschalten
- **Ziel:** kein zentraler Datenspeicher mehr; der Server ist nur noch Vermittler und Auslieferung (R-Etappen 5, M).
- **Umfang:** Altlagen exportieren und löschen (A); `db.ts`, `ws.ts`, die REST-API für Lage, Beitritt, Foto, Spuren und Export sowie `LAGE_ERSTELL_PASSWORT` entfernen; Lage-Login aus der Oberfläche entfernen; README «Betrieb» und Spec nachführen (R§7).
- **Abnahme:**
  - Exportdateien aller Altlagen liegen vor (Hinweis in der App, 7 Tage Frist, jede Leitung exportiert selbst; O17); danach ist die SQLite-Datenbank unter `/var/lib/lagebild` gelöscht.
  - Die bisherigen REST-Pfade für Lage, Beitritt, Foto, Spuren und Export antworten 404; der Dienst startet ohne `/etc/lagebild.env`.
  - PWA, `/app/web.json`, `web-<code>.zip`, `lagebild.apk` und `version.json` werden weiter ausgeliefert; ein Live-Update läuft durch.
  - `npm run check`, `npm test`, `npm run e2e` grün (E2E auf Missionen umgestellt).
- **Blockiert durch:** 3, 4.
- **Aufwand:** 1–2
- **Braucht Juan/Gerät:** ja (Export, Löschen und Deploy auf LXC 124).

#### Etappe 6: Hotspot
- **Ziel:** Übungen ohne Internet im Hotspot des Leitgeräts (R-Etappen 6, Transport-Etappe 2 aus M).
- **Umfang:** Capacitor-Plugin «Nahnetz»: Hub mit Java-WebSocket (gleiches Protokoll wie der Vermittler), an das WLAN gebundener Client (OkHttp, `Network.getSocketFactory`), eigene IP für `h=` im QR, Vordergrunddienst `connectedDevice`; Brücke Hub ↔ Vermittler, wenn das Leitgerät Mobilfunk hat. Zuerst der normale System-Hotspot, LocalOnlyHotspot später (R§4). `ACCESS_LOCAL_NETWORK` anfragen, sobald targetSdk 37 gilt. Die PWA nimmt lokal nicht teil.
- **Abnahme:**
  - Zwei Android-Geräte ohne Mobilfunk im System-Hotspot des Leitgeräts: Beitritt per QR mit `h=`, alle Ereignisse kommen an.
  - Der Hub läuft bei gesperrtem Bildschirm des Leitgeräts 15 min weiter, Ereignisse kommen ohne Lücke an.
  - Mit Mobilfunk am Leitgerät sieht ein drittes Gerät über den Vermittler die Ereignisse aus dem Hotspot und umgekehrt; doppelt Empfangenes erscheint einmal.
- **Blockiert durch:** 3; Ergebnis von 0 (Netzbindung).
- **Aufwand:** 4–6
- **Braucht Juan/Gerät:** ja (neue APK, Feldtest mit Hotspot).

#### Etappe 7: LoRa
- **Ziel:** Positionen, Status, Alarm und Kurzmeldungen ohne WLAN und Mobilfunk (R-Etappen 7, Transport-Etappe 3 aus M).
- **Umfang:** BLE-Kopplung eines Meshtastic-Knotens je Person (`@capacitor-community/bluetooth-le`); eigener Meshtastic-Kanal mit eigenem PSK, Portnummer im privaten Bereich 256–511; Kompaktformat (~20 B je Position); nur `K_e^lora`, ohne Gerätesignatur; Anzeige «über Funk», ersetzt durch die signierte Fassung, sobald sie über Vermittler oder Hub ankommt; über LoRa nie Leitungsaktionen, Beitritt, Schlüssel, Zeichnungen, Taufen, Fotos (R§5). Meshtastic-Protobufs sind nutzbar, weil Lagebild unter GPL-3.0 steht (A, `LICENSE`). Positionstakt alle 2 min, für kleine Gruppen ≤ 8 Geräte (O18).
- **Abnahme:**
  - Zwei Geräte mit gekoppelten Knoten, WLAN und Mobilfunk aus: Position, Status, Alarm und Kurzmeldung kommen an und sind als «über Funk» markiert.
  - Jede LoRa-Nutzlast ist ≤ 233 Byte (Unit-Test über alle Arten).
  - Der Sendetakt hält den Duty-Cycle von 10 % je Gerät ein (Rechnung als Test, RIR1008-09).
  - Ein über LoRa empfangenes Leitungsereignis wird nicht ausgewertet (Test).
- **Blockiert durch:** 3; Hardware.
- **Aufwand:** 5–8 + Hardware
- **Braucht Juan/Gerät:** ja (Meshtastic-Knoten beschaffen, Feldtest).

### Entschieden 31.10.

Juan hat O1–O18 am 31.10. beantwortet (README «Missionen: offene Fragen O1–O18 (31.10.)»). Gewählt ist jeweils die genannte Option.

- **O1** Freitext «nur leitung kann aufnehemen»: nur die Leitung nimmt auf (ersetzt den Entscheid L «Aufnahme durch Gruppenführer»). Die Führungskette bleibt rein linear, keine Aufnahme-Ereignisse ausserhalb der Kette.
- **O2** (a): Die Leitung wählt die Gruppe bei der Aufnahme; wechseln nur durch die Leitung.
- **O3** (a) ohne Ausschluss: Gruppenführer ändern/löschen Objekte der Gruppe, schicken Bloodhound an die Gruppe, heben Alarme der Gruppe auf. Nicht: Aufnahme, Ausschluss, Schlüsselwechsel, Ebenen, Statusliste, Taufnamenslisten, fixierte Raster.
- **O4** (a): Lebenszeichen jede Minute von Leitgerät und Gruppenführer, auch bei Emission Control (ohne Position).
- **O5** (a): Die Ersatz-Reihenfolge entscheidet.
- **O6** (a): Mission läuft ohne Leitung weiter, Hinweis an alle; die Leitung bekommt einen Hinweis, solange kein Gruppenführer ernannt ist.
- **O7** (a): Nur Android-Geräte (nicht Beobachter) können Gruppenführer oder Leitung werden.
- **O8** (a): Übergabe an jedes fähige Gerät nach O7.
- **O9** (b): Bezug Web-Stand (`webCode`), Prüfung bei der Aufnahme; Geräte unter der Mindestversion schalten automatisch auf Nur-Lesen.
- **O10** Freitext (wörtlich im README): «laufend» = Phase LV (Lageverfolgung); die Update-Sperre (nur Sicherheitsupdates) gilt nur in LV. Die Phasen AP, LV und AN beschreibt der Abschnitt «Phasen AP/LV/AN».
- **O11** (a): Das Leitgerät merkt sich den höchsten Sicherheits-Stand.
- **O12** (a): PWA-Updates wie heute.
- **O13** (a): Nur gleiche Protokoll-Hauptversion.
- **O14** (a): Löschen nur lokal.
- **O15** (b): Jedes Mitglied darf GPX/GeoJSON exportieren.
- **O16** (a): Vierstellige Prüfzahl beim Beitritt per Code.
- **O17** Freitext «Hinweis mit frist (Frist 7 Tage reicht)»: Hinweis in der App, 7 Tage, jede Leitung exportiert selbst, danach löscht der Server.
- **O18** (b): LoRa-Position alle 2 min, für kleine Gruppen (≤ 8 Geräte).

## Performance 30.10.

Gemessen statt geraten. Lastbild: 50 Geräte (Leitung + 49, je 1 Pos/s), 500 Zeichnungen (davon 70 Freihand à 150 Punkte),
300 Taufen (jede zehnte 60 Punkte), Spuren 4 h im 10-s-Takt, 200 Meldungen. Browser: Chromium headless, 390×844,
CPU-Drossel 4× (≈ Mittelklasse-Android), Kacheln echt, Software-GL (Bildraten daher nur relativ vergleichbar).
Host ist ausgelastet: Werte schwanken um ±15 %.

### Messgrundlage (vorher, main @ 2e82410)

| Was | Wert |
|---|---|
| Start-JS (ein Bundle) | 2605 kB, gzip 716 kB (MapLibre 1294 kB, milsymbol 1073 kB, proj4 185 kB, zod 173 kB, qrcode 48 kB, unminifiziert gezählt) |
| Start bis 49 Symbole sichtbar | 2.5 s |
| Leitung in Ruhe, 49 Geräte live | 22 Bilder/s, Layout 246 ms/s (Rufnamen-Entzerren erzwingt je Position ein Layout aller 850 Kartenmarker) |
| dazu alle Spuren (1 h) sichtbar | 8 Bilder/s (je Position ein `setData` aller Spuren) |
| Snapshot über WebSocket | 1224 kB (gzip wären 357 kB), Aufbau 35 ms |
| `/api/spuren` 1 h / alles | 2.3 MB / 9.1 MB roh (Cloudflare komprimiert HTTP ohnehin) |
| Position je Nachricht | 183 B; Server ≈ 1 ms CPU je Position inkl. Verteilen an 50 |
| `docs/screens/` | 136 MB, 87 PNG, jeder E2E-Lauf schreibt sie neu (bis 7 MB je Bild) |

### Nachher (perf-welle2), gleiche Messung

Browser-Werte aus `e2e/lastmessung.ts` (kein Test, Aufruf im Kopf der Datei), je zwei Läufe vorher/nachher abwechselnd.

| Was | vorher | nachher | Commit |
|---|---|---|---|
| Ruhe, 49 Geräte live | 22 Bilder/s, Layout 249 ms/s | 28 Bilder/s, Layout 178 ms/s | Rufnamen entzerren ohne erzwungenes Layout |
| alle Spuren (1 h) sichtbar | 7.5 Bilder/s | 33 Bilder/s | Spuren höchstens 1×/s an die Karte (Spurende hinkt ≤ 1 s) |
| Start bis 49 Symbole | 2.4 s | 2.0 s | Taufe-Beschriftung: erst schreiben, dann messen (`ordne()` 498 → 192 ms, läuft auch bei jedem Kartenende) |
| Start-JS | 2605 kB / gzip 716 kB | 2572 kB / gzip 703 kB | QR-Code und PDF-Druck per `import()` |
| Snapshot über die Leitung | 1225 kB | 357 kB | permessage-deflate ab 1 KB, ohne Context-Takeover |
| Server-CPU, 500 Positionen an 50 | 410 ms | 440 ms (Rauschen) | Positionen bleiben unkomprimiert |
| E2E ganz (86 Tests) | 5.5 min, 87 PNG neu im Repo | 5.0 min, keine Dateien | Doku-Bilder nur mit `E2E_BILDER=1` |

**Bildschirmfotos (Entscheid):** E2E schreibt `docs/screens/*.png` nur noch mit `E2E_BILDER=1`, sonst gar nicht. Format und
Namen bleiben PNG, damit die Verweise in der Doku gültig bleiben; die vorhandenen 136 MB bleiben in Repo und Historie.
JPEG hätte die Bilder verkleinert, aber jede Erneuerung ändert dann trotzdem alle Dateien; «nur auf Wunsch» spart beides.

**Bewusst nicht gemacht (Messung rechtfertigt es nicht oder Nutzen zu klein):**
- milsymbol ohne Buchstaben-SIDC-Sätze: nur −210 kB roh / −26 kB gzip, bräuchte einen Tiefen-Import an den `exports` des
  Pakets vorbei. MapLibre und milsymbol braucht die Karte beim Start, zod und proj4 ebenso.
- Cache für milsymbol-SVG: 0.04 ms je Zeichen; Marker werden nur bei Kurs-/Status-/Grössenwechsel neu gebaut.
- Zeichnungen und Taufnamen als DOM-Marker (~800 bei diesem Lastbild) bremsen das Schwenken spürbar (headless ohne GPU:
  110 → 24 Bilder/s mit statt ohne). Umbau auf Symbol-Layer wäre gross; erst auf echtem Gerät nachmessen.
- `interaktion.ts` (Fang projiziert alle Zeichnungen je Mausbewegung) und `ZeichnenLayer` (alles neu je Änderung) betreffen
  nur das Zeichnen am Desktop; `taufe/darstellung` O(n²) tauchte im Profil nicht auf.
- `/api/spuren`: 1 h = 2.3 MB roh, 358 kB gzip; Cloudflare komprimiert HTTP ohnehin. Nur lat/lon/t zu senden oder
  Koordinaten zu runden wäre eine Vertragsänderung.
- SQLite: alle häufigen Abfragen laufen über Indizes (EXPLAIN geprüft), nur `foto` nach Lage scannt (selten, klein).
- Nach dem Deploy prüfen: handelt der Cloudflare-Tunnel permessage-deflate aus? (DevTools › Netzwerk › `/ws` ›
  Antwort-Header `Sec-WebSocket-Extensions`). Sonst bleibt alles wie vorher, nur ohne die Ersparnis.

## Spec v6: Phasen AP/LV/AN (31.10.2026, Frage-Runde mit Juan, README «Phasen AP/LV/AN (31.10.)»)

Juan: «wir müssen zwischen AP (Aktionsplanung, vor der Mission), LV (Lageverfolgung, während der Mission) und AN (Aktionsnachbearbeitung, debriefing der aktion mit der möglichkeit alle aktionen und bewegungen wie ein video anzuschauen, vor und zurück spulen und eine liste der erreignise mit timestamp zu exportieren (csv, und pdf)) …»

Gebaut in der heutigen Server-Lage. Die Regeln liegen als Reducer in `shared/regeln/phase.ts` und gehen so in die dezentralen Missionen (Spec v5) über.

### Phasen und Wechsel
- **AP – Aktionsplanung** (vor der Mission), **LV – Lageverfolgung** (während), **AN – Aktionsnachbearbeitung** (Debriefing).
- Eine neue Lage beginnt in **AP**. Wechsel: AP → LV, LV → AP, LV → AN, AN → LV. AP → AN direkt gibt es nicht.
- Nur die **Leitung** wechselt, mit einer Bestätigung: Phasenschild im Kopf antippen (oder Leitung › Lage) → Ziel wählen → «Ja, wechseln». Alle Geräte sehen den Wechsel sofort (Delta `lage`), dazu ein Toast und ein Eintrag im Meldungslog.
- Verlässt die Lage die LV, hebt der Server offene Alarme auf und beendet offene Bloodhound-Aufträge («Phase gewechselt»), damit Wiedergabe und Liste sauber enden.
- **AN ersetzt «Lage beenden»:** niemand wird mehr abgemeldet. Alle Mitglieder bleiben verbunden und sehen Wiedergabe und Ereignisliste. Neue Beitritte und Foto-Uploads sind in AN gesperrt (wie früher bei beendeter Lage). Export GPX/GeoJSON und «Endgültig löschen» bleiben bei der Leitung (Leitung › Export, › Lage).

### Was je Phase geht (Reducer, `phasenSperre`)
- **AP:** Zeichnen, Ebenen, Raster, Taufe (inkl. Namenslisten), Marker, Chat, Status-Set, Teilnehmende entfernen, Offline-Gebiete (nur Gerät), Beitreten. Positionen werden still verworfen (nicht verteilt, nicht aufgezeichnet); Status, Sichtung, Alarm, Bloodhound werden abgelehnt.
- **LV:** alles wie bisher.
- **AN:** nur lesen. Erlaubt sind nur der Phasenwechsel und die Debriefing-Notizen der Leitung; Positionen werden still verworfen, alles andere abgelehnt («Nachbearbeitung: nur lesen»).
- Der Client blendet, was die Phase nicht erlaubt, aus (`Feature.phasen`, `RadialAktion.phasen`) und sendet ausserhalb von LV keine Position. GPS läuft weiter für die eigene Anzeige.

### Optik
- Rahmen um die Karte: **AP dunkelgrau**, **LV schwarz** (wie bisher), **AN grün**. Der gelbe Rahmen des Taufmodus liegt darüber.
- Phasenschild «AP» / «LV» / «AN» im Kopf (beide Bedienungen); für die Leitung ein Knopf zum Wechseln.

### Wiedergabe (AN, Panel «Wiedergabe»)
- Von selbst öffnet sie nur auf dem Gerät der Leitung, die nach AN gewechselt hat. Alle anderen sehen den grünen Rahmen und öffnen sie mit einem Tipp: Daumen-Ränder mit dem Randknopf «Wiedergabe» (an der Stelle von Status: quer links, hoch im Dock), Klassisch als erster Knopf der Werkzeugleiste. So laden nicht alle Geräte gleichzeitig das ganze Protokoll.
- Zeigt alles mit Zeitstempel auf der Karte wie zum Zeitpunkt: Positionen (aus den Spuren), Status, Marker, Sichtungen, Zeichnungen, Taufen, Alarme, Bloodhound-Linien, Chat und Meldungslog bis dahin. Die Anzeige nutzt die normalen Kartenlayer: das Panel ersetzt den Lagezustand im Client durch den Stand zum Zeitpunkt und stellt beim Schliessen den Live-Stand wieder her.
- Zeitleiste mit Schieber, Play/Pause, Tempo 1× / 10× / 60×, Sprung zum vorigen und nächsten Ereignis; vor- und zurückspulen über den Schieber. Start pausiert am Anfang der ersten LV. Desktop: Leertaste spielt/pausiert, Alt+← / Alt+→ springen zum Ereignis.
- Nur LV-Zeiträume: AP-Abschnitte dazwischen überspringt die Wiedergabe; die Zeitleiste markiert die Naht mit der übersprungenen Phase («AP», nach AN → LV «AN»).
- «Zuletzt: …» unter der Zeitleiste nennt das letzte Ereignis bis zum Zeitpunkt.
- Darunter die Ereignisliste; Tippen auf eine Zeile springt zum Zeitpunkt, die aktuelle Zeile ist hervorgehoben.

### Ereignisprotokoll (Server)
- Löschungen und Zwischenstände gehen in den Einträgen verloren. Darum schreibt der Server jedes verteilte Delta der Regeln mit Zeit und Autor in die Tabelle `protokoll` (ausser Positionen, Teilnehmer-Updates und Lage-Deltas; Positionen liegen in `spur`, Phasen in `Lage.phasen`). Das passt zum späteren Ereignislog der Missionen.
- Grenze je Lage: 50 MB (Zeichen der Deltas, `MAX_PROTOKOLL_ZEICHEN_JE_LAGE` in `server/src/ws.ts`, laufend mitgezählt). Darüber zeichnet der Server nichts mehr auf, warnt einmal (Log und Meldung nur an die Leitung: «Protokoll voll …»), der Live-Betrieb läuft weiter.
- `GET /api/protokoll?seit=<t>&max=<n>` (Bearer, alle Mitglieder), seitenweise: `{ teilnehmer (auch entfernte), ereignisse: {t, von, d}[], weiter }`, höchstens 5000 Ereignisse je Seite (`MAX_PROTOKOLL_SEITE`), eine Seite endet nie mitten in einer Millisekunde; `weiter` ist das `seit` der nächsten Seite, `null` am Ende. Chat und Meldungslog gefiltert wie live (`sichtbar.ts`). Rate-Limit je Teilnehmer: 6 Wiedergaben (erste Seite) und 60 Seiten je Minute.
- Der Client lädt die Seiten nacheinander und die Spuren über `GET /api/spuren?seit=<Beginn der ersten LV>`.
- Der Client faltet die Deltas bis zum Zeitpunkt (`features/wiedergabe/logik.ts`), Positionen per Binärsuche in den Spuren.

### Ereignisliste und Export
- Zeilen: Phasenwechsel, Status, Marker (gesetzt/geändert/gelöscht), Sichtung, Zeichnung, Taufe, Raster, Chat, Alarm (ausgelöst/quittiert/aufgehoben), Bloodhound (nur für Leitung und Empfänger, wie die Meldungen), Teilnehmer entfernt, Notizen. Positionen nicht als Zeilen.
- Spalten: Zeit, Rufname, Einheit, Ereignis, Details, Koordinate (im eingestellten Koordinatenformat), Rasterzelle («Piccolo H 09 C», sonst Grande; leer ohne Raster). Ohne eigene Koordinate gilt die Position des Autors zum Zeitpunkt.
- **CSV** (Semikolon, UTF-8 mit BOM, für Excel) und **PDF** (A4 quer, Text in Courier, ohne neue Abhängigkeit, `features/wiedergabe/pdf.ts`), je ein Tipp, für alle Mitglieder.

### Debriefing-Notizen
- Nur in AN, nur die Leitung: «+ Notiz bei 14:03:27» hängt einen Text an den aktuellen Zeitpunkt der Wiedergabe (grüner Punkt auf der Zeitleiste); löschen per ×. Notizen erscheinen in der Ereignisliste, in der Wiedergabe («Zuletzt: …») und im Export.

### Vertrag (`shared/protocol.ts`)
- `Phase` = `ap | lv | an`; `Lage.phasen: {phase, t}[]` (≤ 200, letzte = aktuelle, `phaseVon`) ersetzt `Lage.beendetAm`.
- `ClientMsg`: `lage.phase {phase}` ersetzt `lage.beenden`; neu `notiz.neu {t, text}`, `notiz.loeschen {id}`.
- `ServerMsg`: `snapshot.notizen`, `notiz`, `notiz.geloescht`; `beendet` nur noch für entfernt/gelöscht (ohne `lage`).
- REST: `GET /api/protokoll` (`ProtokollSeite`); `LageErstellen.phase` (optional, `ap` oder `lv`; Vorgabe `lv`, weil ältere Web-Stände keine Phase senden und AP nicht verlassen könnten; der Client sendet `ap`).
- `PROTOKOLL_VERSION` bleibt 1: ältere Stände laufen weiter (sie kennen keine Phase; ihre Positionen in AP/AN verwirft der Server still).

### Annahmen (kleinste vernünftige, von Juan zu bestätigen)
- Bestandslagen: offene starten in LV (seit Erstellung), beendete in AN (LV bis zum Beenden). Migration beim Lesen in `server/src/db.ts`, ohne Schema-Umbau.
- Bestandslagen: was vor dem ersten Protokolleintrag entstand, baut der Server aus den gespeicherten Einträgen (Erstell- und Endzeiten) und stellt es vor das Protokoll; Änderungen und Löschungen von früher fehlen.
- Neue Lagen aus dem Client beginnen in AP (`phase: 'ap'`); ohne Angabe (ältere Web-Stände, API) in LV.
- In AP keine Sichtungen (sie sind Beobachtungen der Mission) und darum auch keine Foto-Uploads (409), Chat ja.
- In AN keine neuen Beitritte und keine Fotos; der Chat ist lesbar (in der Wiedergabe bis zum Zeitpunkt), Senden wird abgelehnt.
- Das Führungsraster zeigt die Wiedergabe im heutigen Stand (die Liste nennt die Änderungen mit Zeit); entfernte Teilnehmende fehlen auf der Karte, stehen aber in der Liste.
- Notizen: nur neu und löschen, kein Bearbeiten; höchstens 500 je Lage, Text ≤ 500 Zeichen.

### Später (nur vorgemerkt)
- Live-Updates in LV nur für Sicherheitsupdates (README «Updates überspringen»): gehört zu den dezentralen Missionen (Spec v5, O10), hier nicht gebaut.

## Spec v7: Menü, Gerätekennung, Rollen (31.10.2026, fünf Frage-Runden mit Juan, README «Menü und Gerätekennung (31.10.)», «Rollen in der Mission (31.10.)»)

Juan: «so jetzt machen wir uns an ein Menu, damit die App auch wie eine wirkt. in jeder mission kann ins menu raus gegangen werden. jedes gerät bekommt eine signatur du absolut einzig artig ist. so können sich geräte unterscheiden und in missions nicht doppelt auftauchen. mir gefällt der look mit der karte im hintergrund der aktuellen version, das bei behalten. aber die einstellungen und benutzerdetails etc sollen dort ins menu raus.» Dazu: «es braucht innerhalb einermission noch die einstellung der rollen verwaltung».

Gebaut im heutigen Server-Modus. Gerätekennung und Rollen sind die Bausteine aus Spec v5 (Geräteschlüssel R§1, Rollen M/O3) und gehen so in die dezentralen Missionen über.

### Begriff
- In der Oberfläche heisst eine Lage ab jetzt **Mission** (Meine Missionen, Neue Mission, Mission verlassen, Name der Mission). Die Phasen bleiben AP / LV (Lageverfolgung) / AN, der App-Name bleibt «Lagebild». Bezeichner im Code (`lage`, `Lage`, `/api/lage`) bleiben, nur die Texte wechseln.

### Menü
- **Startseite der App ist das Menü**, über der Karte wie heute der Login (die Karte bleibt im Hintergrund sichtbar). Einträge: **Meine Missionen**, **Beitreten**, **Neue Mission**, **Profil**, **Einstellungen**, **Über**. Layout im Querformat: **V4 «Karte als Menü»** (Juans Wahl 01.11., siehe «Menü-Layout V4»).
- **In der Mission** ersetzt der Knopf «Menü» das Zahnrad «Einstellungen» (Klassisch und Daumen-Ränder). Das Menü liegt über der laufenden Mission: **Verbindung und Position laufen weiter**; «Zurück zur Mission» schliesst es. Die Mission endet erst, wenn eine andere geöffnet oder sie verlassen wird.
- **Meine Missionen:** alle Missionen, in denen dieses Gerät ist (Token je Mission auf dem Gerät), mit Name, Phase (AP/LV/AN) und Rolle. Offen ist höchstens eine; eine andere öffnen schliesst die offene (Verbindung zu, keine Position mehr). Missionen in AN bleiben für Wiedergabe und Export in der Liste, bis man sie verlässt. Kennt der Server eine Mission nicht mehr (gelöscht, entfernt), fällt sie mit Hinweis aus der Liste.
- **Je Mission** (Unterseite in Meine Missionen): Öffnen bzw. Zurück, **Meine Angaben** (Rufname, Funktion; live änderbar, siehe unten), **Position senden** (Emission Control, gilt für diese Mission), **Mission verlassen** (mit Bestätigung, entfernt das Token vom Gerät).
- **Beitreten:** Code (oder Link `?code=`), Rufname und Funktion, vorausgefüllt mit den zuletzt benutzten Werten. Einheit und Symbol kommen aus dem Profil; fehlt die Einheit im Profil, fragt das Formular sie mit ab.
- **Neue Mission:** Name, Erstell-Passwort, Rufname, Funktion. **Das eröffnende Gerät ist sofort Leitung** (kein Umweg mehr über «Codes notieren → als Leitung beitreten»). Die Codes stehen danach unter Leitung › Zugang.
- **Profil (gilt für alle Missionen):** Einheit, eigenes Symbol, Gerätekennung (nur Anzeige). Eine Änderung wirkt sofort auch in der offenen Mission. Ausnahme: Ein Gruppenführer ändert seine Einheit nicht selbst (sonst holte er sich Rechte über eine fremde Gruppe); das macht die Leitung.
- **Einstellungen:** alle bisherigen Geräteeinstellungen (Bediengrösse, Bedienung, Sendeintervall, Dynamisch, Bildschirm anlassen, Hintergrund-GPS, Koordinatenformat, Koordinatenzeile, Ausrichtung). In der Mission gibt es keinen eigenen Einstellungs-Knopf mehr.
- **Über:** Web-Stand, Protokoll, App-Update, Link zur Android-App.

### Gerätekennung
- Jedes Gerät erzeugt beim ersten Start ein **Ed25519-Schlüsselpaar** per WebCrypto (`extractable: false`, abgelegt in IndexedDB). **Geräte-ID** = base32(SHA-256(öffentlicher Schlüssel, raw))[0..16] wie in Spec v5. Anzeige gekürzt in zwei Vierergruppen (z.B. «K7MP-3XQ9»).
- **Beitritt mit Signatur:** Das Gerät holt eine Challenge vom Server (`POST /api/challenge` → 32 Byte zufällig, 2 min gültig, einmal verwendbar, rate-limitiert) und signiert `lagebild-beitritt\n<challenge>\n<code>`. `Beitreten` und `LageErstellen` tragen öffentlichen Schlüssel, Challenge und Signatur; der Server prüft die Signatur (Node `crypto`, Ed25519) und leitet die Geräte-ID selbst aus dem Schlüssel ab.
- **Ein Gerät kommt in einer Mission nur einmal vor** (Geräte-ID je Mission eindeutig, auch in der DB). Tritt dasselbe Gerät erneut bei, bekommt es **seinen bisherigen Eintrag zurück**: gleiche Teilnehmer-ID (Spur, Marker, Chat bleiben seine), neues Token (alte Tokens dieses Eintrags werden ungültig), Rufname und Funktion aus dem Beitritt. Die **Rolle bleibt, wie sie ist** (Gate 01.11., Juan): Der Code bestimmt die Rolle nur beim ersten Beitritt bzw. nach dem Entfernen; hoch- und herabstufen macht allein die Leitung per «Rolle setzen». Sonst hebelte «verlassen und neu beitreten» jede Herabstufung aus. Leitung wird man so nie (siehe Rollen).
- Ohne Ed25519 in WebCrypto (Android-WebView < 137, iOS < 17, alte Browser): kein Beitritt, Hinweis «Bitte App bzw. Browser aktualisieren».
- Die Leitung sieht im Teilnehmerdetail die **gekürzte Kennung** und den **Web-Stand** des Geräts (`hallo` trägt den Web-Stand mit). Die Kennung ist kein Geheimnis: ohne den privaten Schlüssel lässt sie sich nicht nutzen.
- Bestehende Einträge ohne Kennung (vor der Umstellung beigetreten) laufen mit ihrem Token weiter; ein neuer Beitritt dieser Geräte legt einmalig einen neuen Eintrag mit Kennung an.

### Rollen
- **Leitung** (genau eine je Mission): alle Rechte wie heute. **Gruppenführer:** Rechte eines Teilnehmers, dazu über die **eigene Gruppe** (= Einheit, zugleich Chat-Gruppe): Objekte von Mitgliedern der Gruppe ändern und löschen, Bloodhound-Aufträge an Mitglieder der Gruppe, Alarme der Gruppe aufheben (O3). Nicht: Rollen, Codes, Phase, Ebenen, Statusliste, Taufnamenslisten, fixierte Raster, Mitglieder entfernen. **Teilnehmer:** wie heute. **Beobachter:** sieht alles, sendet nichts (keine Position, kein Chat, keine Änderungen); der Server verwirft Positionen still und lehnt alles andere ab, die Oberfläche blendet Melden, Zeichnen usw. aus.
- **Codes:** Teilnehmer-Code (8 Zeichen), **Gruppenführer-Code** (10 Zeichen, ersetzt den Leitungs-Code), **Beobachter-Code** (8 Zeichen). Der Code bestimmt die Rolle beim Beitritt. Leitung › Zugang zeigt alle drei mit QR und Link, jeder einzeln erneuerbar.
- **Leitung nur per Übergabe:** Im Teilnehmerdetail «Leitung übergeben» (mit Bestätigung) an ein verbundenes Mitglied, das nicht Beobachter ist. Das Ziel wird Leitung, die bisherige Leitung Teilnehmer (wie Spec v5 «Übergabe»). Meldung an alle.
- **Rolle setzen:** Die Leitung setzt im Teilnehmerdetail jedes andere Mitglied auf Gruppenführer, Teilnehmer oder Beobachter und ändert dessen Einheit. Meldung im Meldungslog.
- **Bekannte Lücke bis Etappe 4:** Fällt das Leitungsgerät aus, hat die Mission keine Leitung, bis dasselbe Gerät zurückkommt (Wiederbeitritt gibt den Eintrag samt Rolle zurück). Die automatische Ersatzleitung kommt mit Etappe 4.
- **Umstieg laufender Missionen:** Gibt es mehrere Leitungen, bleibt die zuerst beigetretene Leitung, alle weiteren werden Gruppenführer. Der Hash des bisherigen Leitungs-Codes gilt als Gruppenführer-Code; einen Beobachter-Code gibt es erst nach «Erneuern».
- **Grenze Gruppenführer-Code (Gate 01.11., Juan: so festhalten):** Wer den GF-Code hat, kann mit neuer Gerätekennung (anderer Browser) und frei gewählter Einheit beitreten und ist dann Gruppenführer dieser Gruppe. Der GF-Code geht nur an vertrauenswürdige Gruppenführer; die Einheitensperre in `ich.aendern` ist ein Bedienschutz, kein Sicherheitsmerkmal. Mit den dezentralen Missionen (Leitung nimmt jeden auf) entfällt die Lücke.
- **Herabstufen auf Beobachter** beendet offene Bloodhound-Aufträge an ihn («Empfänger ist Beobachter»), wie beim Entfernen. Meldungen zu einem Auftrag sehen Leitung, Empfänger **und Auftraggeber** (seit Gruppenführer Aufträge erteilen).
- **Wiederbeitritt schliesst alte Verbindungen:** Der Server schliesst beim neuen Token jede offene Verbindung dieses Eintrags (Code 4005, ohne `beendet`); ein zweiter Tab desselben Geräts verbindet mit dem neuen Token weiter, statt sich abzumelden.
- Regeln als Reducer in `shared/regeln/` (eine Prüfung «darf ändern» für Ersteller, Gruppenführer der Gruppe und Leitung, von allen Regeln genutzt).

### Menü-Layout V4 «Karte als Menü» (01.11., Frage-Runde mit Juan)
Vorlage: Prototyp `client/src/prototyp/V4.svelte` im Branch `menu-layout` (Bilder `prototyp-bilder/v4-*.png`).
- **Aufbau quer:** links eine Menüspalte im Stil der Daumen-Ränder (Meine Missionen, Beitreten, Neu, Profil, Einstellungen, Über), rechts das Panel der gewählten Seite, dazwischen arbeitet die Karte mit. «Zurück zur Mission» rechts unten im Panel, dort wo in der Mission der Knopf «Menü» sitzt.
- **Missionen als Fähnchen auf der Karte** (Phasen-Kürzel + Name), alle Missionen dieses Geräts gleich stark (auch AN). Antippen wählt die Mission und fliegt in ihr Gebiet; das Panel zeigt ihre Unterseite.
- **Ort des Fähnchens:** Juan: «dort wo das Zielobjekt ist». Bei mehreren Zielobjekten (Taufen mit `ziel: true`) die Mitte aller Zielobjekte; ohne Zielobjekt der letzte Kartenausschnitt dieser Mission auf diesem Gerät. Das Gerät merkt sich Ort und Zielobjekte je Mission, solange es in der Mission ist (lokal, kein Server-Eingriff) – das Menü zeigt den Stand vom letzten Besuch. «Mission öffnen» zeigt alle Zielobjekte im Bild.
- **Nahe Fähnchen auffächern:** Fähnchen, die sich überlappen, rücken nebeneinander, mit dünner Linie zum echten Ort.
- **App-Start:** Die Karte zeigt alle Fähnchen im Bild; ohne Missionen die ganze Schweiz.
- **Kartengrenze:** Die Schweiz-Grenze (`maxBounds`) bleibt; Menüspalte und Panel gehen als `padding` in Kamerafahrten ein, statt die Grenze aufzuheben.

### Meine Angaben live
- Neue Nachricht `ich.aendern {rufname?, funktion?, einheit?, sidc?}`: wirkt sofort für alle (Delta `teilnehmer`). Ein neuer Rufname steht im Meldungslog («Adler 1 heisst jetzt Adler 2»). Gruppenführer ohne `einheit` (siehe Profil).
- Die Leitung ändert Rolle und Einheit anderer mit `teilnehmer.aendern {id, rolle?, einheit?}` und übergibt mit `leitung.uebergeben {id}`.

### Festgelegt beim Bau (01.11., Gerätekennung und Rollen)
Was Spec v7 offen liess, kleinste vernünftige Wahl; Menü und Profil folgen separat.
- **Signatur beim Eröffnen:** `lagebild-eroeffnen\n<challenge>\n<Name>` (Name ohne Leerraum am Rand), beim Beitritt `lagebild-beitritt\n<challenge>\n<CODE>` (gross, ohne Leerraum). Beides in `shared/protocol.ts` (`beitrittsText`, `eroeffnungsText`), ebenso `geraetIdAus` und `kurzKennung`.
- **Challenge:** `POST /api/challenge` → `{challenge}`, 60 je Minute und IP, höchstens 10 000 offen (voll → 503). Falsche Signatur, unbekannte oder verbrauchte Challenge → 403 und zählt wie ein falscher Code ins Beitritts-Limit.
- **Neue Mission:** `POST /api/lage` trägt Rufname, Einheit, Funktion, Symbol und Gerätenachweis und liefert direkt Token, Teilnehmer-ID und Rolle Leitung, dazu Teilnehmer-, Gruppenführer- und Beobachter-Code (`LageErstellt`). Die Codes merkt sich das Gerät für Leitung › Zugang; ein früher gemerkter Leitungs-Code erscheint dort als Gruppenführer-Code.
- **Wiederbeitritt:** Einheit, Symbol und Rolle bleiben (die ändern `ich.aendern` bzw. die Leitung). War der Eintrag entfernt, kommt er wieder (gleiche ID), Angaben und Rolle dann allein aus dem Beitritt – das Entfernen nimmt die Rechte also mit.
- **Codes erneuern:** `lage.codeErneuern {art?}` je Rolle (ohne `art` Teilnehmer, für ältere Web-Stände), Antwort `code {art, code}` nur an die Leitung. Leitung › Zugang: Segmente Teilnehmer / Gruppenführer / Beobachter, je Code mit QR, Link und «Erneuern»; die Eingabe eines fremden Codes entfällt (fehlt er auf dem Gerät: erneuern).
- **«Darf ändern»** (`shared/regeln/rollen.ts`): Ersteller (nicht als Beobachter), Leitung, Gruppenführer, deren Einheit gleich der aktuellen Einheit des Erstellers ist. Gilt für Marker, Zeichnungen (auch Ersteller beim Rückgängig), offene Raster und Alarm aufheben; Bloodhound erteilen/aufheben über `darfAuftrag` (Einheit des Empfängers). Taufen bleiben wie bisher für alle änderbar; gesperrte Ebenen und fixierte Raster bleiben bei der Leitung.
- **Gruppenführer in der Oberfläche:** Knopf «Leitung» nur mit den Tabs Alarme und Aufträge (Empfänger nur aus der eigenen Einheit).
- **Beobachter:** bekommen keine Bloodhound-Aufträge, laden keine Fotos hoch (403). Ausgeblendet: Marker, Status, Sichtung, Alarm, Zeichnen, Chat-Eingabe, Taufmodus und Taufe ändern, Raster auflegen, «Position senden»; der Client sendet keine Position.
- **Phasen:** `ich.aendern`, `teilnehmer.aendern` und `leitung.uebergeben` gehen in jeder Phase (kein Lageinhalt).
- **Übergabe:** «verbunden» = mindestens eine offene Verbindung des Ziels (der Server setzt `online` in der Lesesicht der Regeln).
- **Umstieg:** «zuerst beigetreten» = ältester Eintrag (Einfügereihenfolge) unter den aktiven Leitungen; entfernte Leitungs-Einträge werden ebenfalls Gruppenführer. Spalten `teilnehmer.geraet_id` (eindeutig je Lage, Altbestand NULL) und `lage.beob_code_hash` werden beim Start nachgerüstet; `ltg_code_hash` ist seither der Gruppenführer-Code.
- **Vertrag:** `PROTOKOLL_VERSION` 2 (ältere Web-Stände können nicht mehr beitreten). `hallo.stand` = `__WEB_CODE__`; `Teilnehmer.geraet` (Kurzkennung) und `Teilnehmer.stand` optional. Store: `ichAendern()` für das Menü, `meineKennung()` in `client/src/lib/geraet.ts` für das Profil.

### Festgelegt beim Bau (Menü, 01.11.)
Was Spec v7 und V4 offen liessen, kleinste vernünftige Wahl. Code: `client/src/components/menu/`, Logik `client/src/lib/missionen.ts`, Token und Liste in `client/src/lib/store.svelte.ts`.
- **App-Start (Juan 01.11.: «Immer ins Menü»):** Die App startet immer im Menü (ersetzt den Login), auch mit offener Mission (`lagebild.token`): Neustart, Neuladen, Live-Update und Wiederöffnen nach dem Beenden durch Android landen im Menü mit allen Fähnchen, auf «Beitreten» mit `?code=` oder ohne Missionen, sonst auf «Meine Missionen». Die offene Mission verbindet trotzdem sofort im Hintergrund (Verbindung und Position laufen wie bei «Menü» in der Mission); ein Tipp auf «Zurück zur Mission» geht hinein und fliegt zum gemerkten Ausschnitt. Der erste GPS-Fix zentriert die Karte im Menü nicht; vor dem ersten Snapshot merkt das Gerät keinen neuen Stand der Fähnchen (es wüsste noch nichts von den Zielobjekten). Aus der Mission öffnet «Menü» die Seite «Meine Missionen».
- **Speicher:** `lagebild.missionen` = Meine Missionen (Lage, Token, Name, Phase, Rolle, Rufname, Funktion, Ausdehnung der Zielobjekte, letzter Ausschnitt), zuletzt besuchte vorne. `lagebild.token` bleibt das Token der offenen Mission: Geräte mit altem Stand bleiben nach dem Update in ihrer Mission, der Eintrag entsteht beim ersten Snapshot. `lagebild.profil` = Einheit, Symbol und zuletzt benutzter Rufname/Funktion. Das Aufräumen je Lage (`speicher.ts`) behält die Schlüssel aller Missionen der Liste.
- **Abgleich:** `POST /api/missionen {tokens}` (höchstens 50) liefert je Token Lage, Name, Phase und Rolle oder `null` (gelöscht, entfernt); 60 Abfragen je Minute und IP. Bei jedem Öffnen des Menüs; ohne Netz bleibt der Stand vom letzten Besuch. `null` → Eintrag weg, Hinweis «Nicht mehr verfügbar (gelöscht oder entfernt): …».
- **Stand der Fähnchen:** Zielobjekte und Kartenausschnitt der offenen Mission merkt das Gerät beim Öffnen des Menüs und wenn die App in den Hintergrund geht, nicht bei jeder Kartenbewegung. Ort = Mitte der Box um alle Taufen mit `ziel`, sonst Mitte des letzten Ausschnitts; nie besucht = kein Fähnchen.
- **Auffächern:** Überlappende Fähnchen stehen als Reihe nebeneinander (nach ihrem Ort von links nach rechts), dünne Leine mit Punkt zum echten Ort; Reihen und einzelne Fähnchen bleiben in der freien Karte zwischen Menüspalte und Panel, eine zu breite Reihe bricht in Zeilen darüber um. Fähnchen sind Kartenobjekte: sie wachsen mit `--karte` wie Symbole, höchstens halb so breit wie die freie Karte (Name mit «…»). Weit weg (Zoom < 11) blendet das Menü die Zeichen der offenen Mission aus, nah (Zoom über 13; die Übersicht zeigt höchstens 13) das Fähnchen der offenen Mission selbst, weil es dort ihr Symbol und das Zielobjekt verdeckt; andere Missionen bleiben. Namen brechen am Wortende (`overflow-wrap: break-word`, `hyphens: auto` mit `<html lang="de-CH">`), mitten im Wort nur, wenn ein einzelnes Wort allein nicht in die Zeile passt.
- **Kamera:** «Meine Missionen» zeigt alle Fähnchen (höchstens Zoom 13), ohne Missionen die Schweiz; die Unterseite fliegt zu den Zielobjekten (bis Zoom 16), sonst zum letzten Ausschnitt. Menüspalte, Panel und Platz für die Fähnchen gehen als `padding` (fitBounds) bzw. `offset` (flyTo) ein, nie als bleibendes Map-Padding. «Mission öffnen» zeigt die Zielobjekte mit Rand für die Bedienung der Mission; «Zurück zur Mission» fliegt zum Ausschnitt, den die Mission beim Öffnen des Menüs hatte.
- **Menü über der Mission:** Kopf, Ränder, Leiste und Panels der Mission sind ausgeblendet; Kartenlayer, Verbindung und GPS laufen. Öffnen bricht Fadenkreuz, Ring und Koordinaten-Karte ab; im Menü kein Radial-Menü; Esc wirkt wie «Zurück zur Mission» (gleiche Funktion `zurueckZurMission`, fliegt zum gemerkten Ausschnitt).
- **Bediengrössen:** Die Menüspalte scrollt, wenn sie nicht ins Fenster passt (Sehr gross auf niedrigem Handy, wie die Daumen-Ränder); Panelinhalt scrollt ebenso, der Hauptknopf von Beitreten/Neu bleibt sichtbar.
- **Knopf «Menü»:** Daumen-Ränder quer zuunterst in der rechten Spalte (unter «Mehr»), hoch als fünfter Knopf im Dock; Klassisch in der Kopfzeile statt des Zahnrads. «Einstellungen» ist aus dem Mehr-Menü und den Panels verschwunden.
- **Unterseite:** «Meine Angaben» (Rufname, Funktion) und «Position senden» nur in der offenen Mission, beides braucht die Verbindung; geschlossene zeigen den Stand vom letzten Besuch. Ein geänderter Rufname/Funktion wird zugleich Vorgabe fürs nächste Beitreten. «Mission verlassen» entfernt nur das Token vom Gerät (der Server bleibt unberührt, wie bisher «Lage verlassen»).
- **Profil:** Einheit und Symbol wirken in der offenen Mission (`ich.aendern`) und bei neuen Beitritten; geschlossene Missionen behalten ihre Angaben (dort kann die Leitung die Einheit gesetzt haben). Gruppenführer: Einheitsfeld gesperrt mit Hinweis.
- **Beitreten / Neue Mission:** Die Einheit fragt das Formular nur ab, solange das Profil keine hat. Der Hauptknopf bleibt sichtbar, wenn das Formular quer scrollt.
- **Über:** Web-Stand, Protokoll, Update-Zustand mit «Neu laden» bzw. APK-Download; im Browser «Android-App installieren», sobald der Server eine APK anbietet (auch ausserhalb von Android, zum Weitergeben).
- **Token-Haltung (Gate-Auflage):** Regel `weiterNach` in `missionen.ts`. Nach Close 4005 verbindet der Client nie mit dem verworfenen Token, sondern wartet, bis im Speicher (`lagebild.missionen`, frisch gelesen) ein anderes Token dieser Mission steht – der Server schliesst vor der Beitritts-Antwort, auch im eigenen Tab –, höchstens 10 s, danach abmelden. `beendet` für ein Token, das nicht mehr gespeichert ist, gilt nicht: weiter mit dem gespeicherten. Auch die normale Wiederverbindung nimmt das gespeicherte Token. Beitreten speichert das neue Token, bevor es verbindet. Abmelden und Verlassen löschen nur Einträge mit dem eigenen Token und `lagebild.token` nur, wo noch das eigene steht. Ein unterbrochenes Warten (andere Mission geöffnet, abgemeldet) zählt nicht für die Frist der nächsten Mission (`trenne()` setzt sie zurück).
- **Missionswechsel A→B** (ohne Zwischenschritt über «keine Mission»): Die Feature-Ebenen der Karte (Spuren, Zeichnen mit Verlauf, Taufmodus usw.) werden ab- und für B neu aufgebaut, damit nichts aus A in B hängt. Reconnect und Tokenwechsel nach 4005 (gleiche Lage) lassen sie stehen. Eigene Position und Kräfte bleiben (sie halten nichts von A).
- **Eigene Angaben live:** Ändert sich der eigene Rufname, die Funktion oder die Rolle (Delta `teilnehmer`), führt das Gerät Meine Missionen sofort nach, nicht erst beim nächsten Snapshot.
- **Hochformat** (Nebenprüfung): Menüspalte als Dock 3 × 2 unten, Panel darüber, ohne Massstab. Grenze: Liegt eine Mission weit im Süden (z.B. Simplon), schiebt `maxBounds` die Ansicht, und ihr Fähnchen kann unter dem Panel liegen; die Liste bleibt vollständig.
- **Bilder** (quer 851×393 @2.75, dazu 780×360 @3 und Tag-Thema): `docs/bilder/menu/`; `quer-app-start-mission-offen.png` zeigt den App-Start mit offener Mission (Menü mit allen Fähnchen, «Zurück zur Mission»).
