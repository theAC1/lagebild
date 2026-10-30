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
- Validierung jeder Eingabe mit den zod-Schemas aus `shared/protocol.ts`. Rate-Limits: Erstellen pro IP, Beitreten nur Fehlversuche pro IP (`CF-Connecting-IP` nur von `TRUSTED_PROXY`, sonst Socket-IP; IPv6 je /64), WS-Nachrichten und `pos` (≥ 1 s) pro Teilnehmer, höchstens 3 Verbindungen je Token, Fotos 10/min pro Teilnehmer und 300 je Lage, Marker und Sichtungen je 2000 je Lage. Max. Nachrichtengrösse 64 KB.
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

- **Rechtsklick** = langes Tippen (Kontextmenü auf der Karte, Radial-Menü auf Symbolen). Browser-Kontextmenü auf der Karte unterdrückt.
- **Mausrad** zoomt. **Doppelklick** auf ein Symbol öffnet dessen Details, Doppelklick auf leere Karte zoomt hinein.
- Tastatur: `Esc` schliesst das oberste Panel / bricht das aktive Werkzeug ab; Zeichen-Kürzel siehe 4.

### 3. Radial-Menü

Langes Tippen / Rechtsklick auf ein Symbol öffnet einen Ring um das Symbol (max. 8 Knöpfe, Beschriftung sichtbar, Tippen ausserhalb schliesst):
- **Teilnehmer:** Details, R&B von hier, Bloodhound, Folgen, Spur ein/aus, Chat; Leitung zusätzlich: Bloodhound-Auftrag.
- **Marker / Sichtung:** Details, R&B, Bloodhound, Bearbeiten, Löschen (nur Ersteller/Leitung).
- **Eigenes Symbol:** Details, Koordinaten ein/aus, Folgen, Spur, Marker hier setzen.
- **Zeichnung:** Bearbeiten, Stil, Ebene, Kopieren, Löschen (nur Ersteller/Leitung).

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

## Spec v3: Bedienung «Daumen-Ränder» (29.10.2026, drei Frage-Runden mit Juan)

Anlass: Juan beim Test auf dem Handy: «die Bedienung [ist] sehr prototypmäßig … nicht da, wo dann auch wirklich ein Button oder so logisch wäre». Störfaktoren laut Juan: Wege zu lang, Knöpfe verstreut, Optik wirkt roh. Dass die Karte verdeckt ist, stört ihn nicht.

### Grundsatz
- **Karte zuerst.** Aktionen löst man am Ort aus, per Tippen, Langdruck oder Radial-Menü. Fest sichtbar sind nur die Hauptaktionen **Status, Melden, Chat** (seit 30.10.: «Melden» öffnet daneben zwei grosse Kacheln **Sichtung** und **Marker**, weil der Unterschied als getrennte Knöpfe nicht klar war).
- Alles Übrige kommt ins **Mehr-Menü**: Range & Bearing, Spuren, Zeichnen, Leitung, Teilnehmende, Einstellungen.
- Optimiert wird für das **Querformat**: Handy oder Tablet mit zwei Händen, im Fahrzeug oder am Tisch. Das Hochformat übernimmt das Konzept.
- **Testbetrieb:** Unter Einstellungen gibt es «Bedienung: Klassisch / Daumen-Ränder», pro Gerät gemerkt. Getestet wird in einer echten Lage. Die Variante, die verliert, wird danach entfernt.

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

## Geländetaufe (30.10.2026, Entscheide im README «Geländetaufe & Führungsraster», «Stossrichtung/Fassaden», «Taufe-Details»)

Feature `client/src/features/taufe`, Server `server/src/taufe.ts`, Vertrag `Taufe`/`TaufListen` in `shared/protocol.ts`. Grundlage: `docs/recherche/gelaendetaufe.md`.

### Familien und Namen
- Gebäude = Metalle/Elemente/Edelsteine, Strassen = Tiere, Gewässer = Wassertiere, Wald = Forest/Woods …, Flächen = Floor/Field/Weed/Ruins … Vorgabelisten je Familie (`STANDARD_TAUFNAMEN`, je ~30 Namen aus Juans Muster ergänzt, ohne Wörter des NATO-Alphabets).
- Die Leitung passt die Listen pro Lage an (Tauf-Panel › «Namenslisten der Lage», ein Name pro Zeile; gespeichert in `Lage.taufListen`, nur abweichende Familien). Doppelte Namen in den Listen lehnt der Server ab.
- Taufnamen sind je Lage eindeutig, über alle Familien und ohne Gross-/Kleinschreibung (`taufSchluessel`). Der Server sperrt Doppelte («Name «…» ist in dieser Lage schon vergeben»).
- Immer selbst wählen: Nach dem Antippen zeigt das Panel die **freien** Namen der Familie in Listenreihenfolge als Chips (ein Tipp tauft), daneben ein Feld für einen eigenen Namen. Kein automatischer Vorschlag.

### Taufmodus
- Einstieg: Mehr › Geländetaufe › «Taufmodus starten». Sichtbar an gelbem Rahmen um die Karte und der Leiste «Taufmodus» mit «Fläche zeichnen» und «Fertig» (Esc beendet am Desktop). Jeder darf taufen.
- Im Modus liegt die Vektorquelle `ch.swisstopo.base.vt` (offizielle URL, `vektor.ts`) über der Rasterkarte; antippbare Objekte sind ab Zoom 15 dezent hervorgehoben (Gebäude weiss, Strassen orange, Gewässer blau, Wald braun, Flächen gelb). Ausserhalb des Modus stehen die Layer auf `visibility: none`: nichts antippbar, keine Kachel geladen. Keine eigene Kachelablage (Offline-Gebiete hängt ihre lokale Bedienung später vor dieselbe Quelle).
- Antippen: `queryRenderedFeatures` (±12 px) über den Taufebenen; Familie aus Layer/Klasse (`familien.ts`), Vorrang Gebäude > Gewässer (Linie) > Strasse > Gewässer (Fläche) > Wald > Fläche. Strasse = `transportation` motorway … service, track (ohne `path`); Gebäude ohne underground/chimney/covered_bridge; Gewässer = `waterway` river/stream/canal/drain/ditch und `water` ohne pool; Wald = `landcover` wood; Fläche = übrige `landcover` und alle `landuse`.
- Antippen einer bestehenden Taufe im Modus öffnet ihre Details.
- Fehlt ein Objekt (Fläche zwischen Gebäuden, Quartier): «Fläche zeichnen», Eckpunkte antippen, «Abschliessen», Familie frei wählbar.

### Geometrie (Kopie, da die Kacheln keine IDs haben)
- Gerechnet wird im z14-Kachelgitter (1 Einheit ≈ 0,4 m). Jedes Stück wird auf seine eigene Kachel geschnitten (der Kachelpuffer würde sonst Scheinkreuzungen erzeugen); Punkte der Kachelnähte fängt eine Toleranz von ~0,8 m.
- **Strasse/Gewässerlinie:** Netz aus allen geladenen Stücken; vom getippten Segment aus in beide Richtungen bis zum nächsten Knoten mit Grad ≠ 2 (Kreuzung oder Ende). Danach bleibt der Modus im «Verlängern»: weitere Tipps hängen Abschnitte an dieselbe Taufe (zusammengefügt, wenn sie anschliessen, sonst MultiLineString). Auch später über Details › «Verlängern».
- **Flächen (Gebäude, Wald, Gewässer, Landnutzung):** Stücke gleicher Art, die über eine Kachelgrenze am getippten Stück hängen, werden vereint: Gegenkanten auf der Naht heben sich auf, die übrigen Kanten ergeben Ringe (Löcher bleiben). Nachbargebäude mit gemeinsamer Wand bleiben getrennt.
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
- `darstellung.ts` ist rein rechnerisch (Features, Anker, Platzierung), damit der spätere PDF-Export (SpotMap) sie wiederverwenden kann.

### Server
- `taufe.neu`, `taufe.aendern` (nur gesetzte Felder), `taufe.loeschen`, `lage.taufListen` (Leitung). Antworten `taufe`, `taufe.geloescht`, `lage`; Snapshot `taufen`.
- Höchstens 2000 Taufen und 6 MB (JSON) je Lage; Export GeoJSON mit `art: 'taufe'`.
