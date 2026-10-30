# Offline-Gebiete: Nutzungsbedingungen, Drosselung, Grössen – Recherche 30.10.2026

Frage (Schritt 0 vor dem Bau): Darf die App für ein Gebiet Kacheln von geo.admin.ch gezielt vorab laden (bis ~1 GB pro Gerät, wenige Geräte), und welche Grenzen gelten?

Kennzeichnung wie in `gelaendetaufe.md`: **[Doku]** = Primärquelle gelesen, **[live]** = selbst gemessen.

## Ergebnis

**Erlaubt, mit Drosselung.** Kein Verbot gefunden. Die Bedingungen verlangen «Fair Use» mit festen Anfragegrenzen pro Minute und raten bei hoher Abfragedichte bzw. für Offline-Systeme zum Download-Dienst. Ein von der Person ausgelöster, auf ein Rechteck begrenzter und gedrosselter Download im Kartenclient selbst bleibt deutlich unter den Grenzen und dient derselben Anzeige wie online. Deshalb gebaut, mit den Grenzen unten.

## Quellen und Aussagen

1. **FSDI-Nutzungsbedingungen** (geo.admin.ch, «General Terms of Use and Operating Conditions of the Federal Spatial Data Infrastructure FSDI»), https://www.geo.admin.ch/en/general-terms-of-use-fsdi [Doku, abgerufen 30.10.2026; die Tabelle steht nur im eingebetteten Seitenzustand, nicht im sichtbaren Text]:
   - 2.1: Bezug und Nutzung der Daten und Dienste kostenlos, «subject to the provisions on fair use». Registrierung nicht nötig (2.2).
   - 2.3 Request Limit, Tabelle «Limite "Fair Use"»:

     | Dienst | URL | pro Jahr | pro Minute |
     |---|---|---|---|
     | API Rest Services (general) | `*.geo.admin.ch` | 21 Mio | **40** |
     | WMTS-BGDI | `wmts.geo.admin.ch` | 631 Mio | **1'200** |
     | WMS-BGDI | `wms.geo.admin.ch` | 10,5 Mio | 20 |
     | Geodetic REST | `geodesy.geo.admin.ch/reframe` | 21 Mio | 40 |

     `vectortiles.geo.admin.ch` steht nicht eigens in der Tabelle. Vorsichtig gerechnet fällt es unter «`*.geo.admin.ch` general» mit **40/min**.
   - «In the event of excessive use of geoservices, access may be restricted or refused.» Wer die Grenzen absehbar überschreitet, meldet sich vorher bei info@geo.admin.ch.
   - **«Note on web scraping: Automatic parsing of geoservices via bots with high query intensities is to be avoided. The download service should be used to obtain the datasets outside the context of the web services (use in offline systems, databases, etc.).»** → Kein Verbot, aber eine Leitlinie: kein Massendownload, keine Bots. Unser Fall ist kein Bot und kein Datensatz-Abzug, sondern derselbe Kartenclient, der ein Rechteck vorab holt. Darum: gedrosselt, nur auf Knopfdruck, nur das gewählte Rechteck, nur bis zum Max-Zoom, den die App online ohnehin anzeigt.
   - «The integration of geoservices in web applications with an average of 20,000 users per day … corresponds to fair use.»
   - 3.1 Quellenangabe «© Data: swisstopo» (steht in der Karte als «© swisstopo»).
2. **swisstopo OGD-Bedingungen** (Version 1.3.2021), https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices [Doku]: «may be used, distributed and made accessible … enriched and processed and also used commercially. A reference to the source is mandatory.» Abschnitt 3 «Excessive use»: Zugang kann eingeschränkt werden. Abschnitt 4: Es gelten die FSDI-Bedingungen (oben). Landeskarte, SWISSIMAGE und die Basiskarte (Vektor) sind swisstopo-OGD.
3. **WMTS-Doku** https://docs.geo.admin.ch/visualize-data/wmts.html [Doku]: lokales Cachen ist vorgesehen: «If your application caches tiles locally, you need to invalidate your local cache for this layer … Use the Cache Update service» (`https://api3.geo.admin.ch/rest/services/ech/MapServer/<Layer>/cacheUpdate`). → «Aktualisieren» in der Verwaltung lädt ein Gebiet neu.
4. **Vector-Tiles-Doku** https://docs.geo.admin.ch/visualize-data/vector-tiles.html [Doku]: neben GetTile gibt es ganze MBTiles «for immediate or offline usage» (Basiskarte ~900 MB–1 GB für die ganze Schweiz). Das ist der offizielle Offline-Weg für grosse Mengen. Für ein Übungsgebiet sind es nur ~90 Kacheln (siehe unten), darum gezielt per GetTile.
5. **User-Agent/Referer:** Keine der Quellen verlangt einen eigenen User-Agent, Schlüssel oder Referer. Im Browser und in der WebView setzt das System beides selbst (Referer = `https://lage.arvuna.ch` bzw. `https://localhost`); ein eigener User-Agent ist aus dem Browser nicht setzbar.

## Abgeleitete Drosselung (gebaut, `client/src/features/offline/laden.ts`)

| | Wert | Begründung |
|---|---|---|
| WMTS (`wmts.geo.admin.ch`) | **≤ 6 Anfragen/s** (360/min), Abstand 167 ms | 30 % des Limits 1'200/min. Drei Geräte am selben Hotspot (eine IP) bleiben zusammen unter dem Limit, die normale Kartenanzeige hat Luft |
| Vektorkacheln (`vectortiles.geo.admin.ch`) | **≤ 0,5 Anfragen/s** (30/min), Abstand 2 s | unter 40/min (vorsichtige Zuordnung «general») |
| gleichzeitig | 4 Anfragen pro Gerät | |
| Netzfehler | gleiche Kachel nach 10 s nochmals, Anzeige «Kein Netz» | |
| HTTP 429/5xx | 30 s Pause, dann nochmals | kein Hämmern bei Überlast |
| HTTP 400/404 | gilt als erledigt (ausserhalb der Daten) | |
| Ein Gebiet nach dem anderen | Warteschlange | Drosselung gilt pro Gerät gesamthaft |

Anpassen nur in `ABSTAND_MS`/`PARALLEL`. Bei mehr Geräten oder grösseren Gebieten: vorher info@geo.admin.ch fragen.

## Grössen für 10 × 10 km (Thun) [live]

Kachelgrössen am 30.10.2026 bei Thun gemessen (je 4 Kacheln pro Stufe, 72 Anfragen): Landeskarte 13–36 KB (z19 ≈ 13 KB, z14–17 ≈ 33 KB), SWISSIMAGE 18–29 KB (z20 ≈ 18 KB), Vektorkacheln entpackt 117–340 KB (aus `gelaendetaufe.md`). Daraus rechnet die App die MB-Schätzung (`kacheln.ts`). Alle Zoomstufen bis zum Max-Zoom der App (Landeskarte z19, Luftbild z20, Vektor z14), Umgebung ±20 km bis z10:

| Karte | Kacheln | geschätzt | Dauer bei der Drosselung |
|---|---|---|---|
| Landeskarte farbig (z5–z19) | 49'750 | **~740 MB** | ~2,3 h |
| Luftbild SWISSIMAGE (z5–z20) | 196'822 | **~3,7 GB** | ~9,1 h |
| Taufe-Vektordaten (z5–z14) | 90 | **~15 MB** | ~3 min |

Die tiefste Stufe macht drei Viertel aus (Landeskarte z19: 37'056 Kacheln; Luftbild z20: 147'072). «Volles Detail wie online» beim Luftbild sprengt deshalb die angenommenen ~1 GB pro Gerät schon bei 10 × 10 km. Ohne z20 wären es beim Luftbild ~0,9 GB und ~2,3 h. Entscheid offen (siehe Spec, Offene Punkte).

## Alternativen, falls das je nicht reicht

- swisstopo-Downloaddatensätze (STAC `data.geo.admin.ch`): Landeskarten als GeoTIFF, SWISSIMAGE 10 cm als Kacheln je km², Basiskarte als MBTiles. Gross, braucht eigene Aufbereitung (z. B. PMTiles je Übungsraum auf dem eigenen Server) – dann käme die Last vom eigenen Server statt von geo.admin.ch.
