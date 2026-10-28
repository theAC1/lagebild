# TAK-Vorbilder für Lagebild – Recherche 28.10.2026

Grundlage: `docs/spec.md` und `shared/protocol.ts` (Stand 3e6c973). Gelesen: deptofdefense/AndroidTacticalAssaultKit-CIV (ATAK 4.6.0.5, sparse), TAK-Product-Center/atak-civ (ATAK 5.5.1.10, per `gh api`), TAK-Product-Center/Server (TAK Server 5.7, Configuration Guide + Quellcode), joshuafuller/ATAK-Maps. Kein Code übernommen, nur Werte, Abläufe und Formate.

Pfad-Kürzel: `ATAK/` = `atak/ATAK/app/src/main/` im ATAK-CIV-Repo (in beiden Repos gleich).

---

## A) Sofort übernehmen (v1)

### A1 Ausgrauen aus dem Sendeintervall ableiten statt fix 2 min
- **ATAK:** Jede PLI trägt ihre eigene `stale`-Zeit = **2 × Sendeintervall + 15 s** (`ReportingRate.java`: `RELIABLE_RATE_MULTIPLIER = 2`, `STALE_PADDING = 15000`; für UDP/Multicast 4×). Die App sendet ausserdem vorzeitig, wenn die letzte `stale` in < 10 s abläuft (`STALE_BUFFER`). Quelle: `ATAK/java/com/atakmap/comms/ReportingRate.java`.
- **Für uns:** Bei 5/10/30 s ergibt das 25/35/75 s. Heute sieht ein 5-s-Sender, der ausfällt, noch 2 min lang aktuell aus.
- **Vorschlag:** In `Position` ein optionales Feld `stale: number` (ms, absolut) aufnehmen, das der Client als `t + 2×Intervall + 15 s` mitsendet. Der Server klemmt es auf ≤ 5 min. Der Client graut aus, wenn `now > pos.stale` (Rückfall `STALE_MS`). `OFFLINE_MS` 10 min bleibt. Das ist CoT-nah, weil `stale` 1:1 auf `<event stale>` passt.
- Zum Vergleich: ATAK löscht Fremdobjekte standardmässig **5 min nach Ablauf von `stale`** (`ATAK/res/xml/stale_data_prefs.xml` `expireStaleItemsTime=5`, Werte 0/1/5/20/60/360/1440 min in `arrays.xml` `delete_stale_values`). Bei Trennung vom Server werden die Teilnehmenden sofort als stale markiert (`staleRemoteDisconnects=true`). → Unser «Geist nach 10 min» ist sinnvoll. Zusätzlich lohnt es sich, beim WS-Verlust (`online=false`) sofort auszugrauen.

### A2 GPS-Verlust getrennt von «stale» anzeigen
- **ATAK:** Ist der letzte GPS-Fix älter als **10 s** (`LocationMapComponent.GPS_TIMEOUT_MILLIS = 10000`), wechselt `how` von `m-g` (Maschine/GPS) auf `h-e` (geschätzt). Das Eigensymbol bekommt die Variante «nogps» (`ATAK/assets/icons/roles/team_nogps.png`). Quellen: `CotMapComponent.java` (Methode, die die Eigen-PLI baut) und `location/LocationMapComponent.java`.
- **Für uns:** Wer verbunden ist (`online=true`), dessen `pos.t` aber > 10 s plus Intervall alt ist, bekommt das Badge «kein GPS» statt «ausgegraut». Das Eigensymbol zeigt dasselbe bei einem `watchPosition`-Fehler oder Timeout. Kein Protokollwechsel nötig.

### A3 Alarm trotz Emission Control mit Position
- **ATAK:** Ist «Hide my position» aktiv, wird die Eigen-PLI mit Punkt 0/0 gesendet (`CotPoint.ZERO` in `CotMapComponent.java`). Der Notruf enthält aber **trotzdem die aktuelle Position**. String `hide_my_position_summary`: *«If an emergency alert is sent, the alert will contain your current position.»* (`ATAK/res/values/strings.xml`)
- **Für uns:** `alarm.ausloesen` braucht ein optionales `pos: Position`. Bei `sendetPos=false` kennt der Server sonst keine aktuelle Position, und `Alarm.lat/lon` wäre leer oder veraltet. Kleine Vertragsänderung in `ClientMsg`.

### A4 Alarm-Ablauf schärfen
- **ATAK-Alarmarten** (`ATAK/java/com/atakmap/android/emergency/tool/EmergencyType.java`, in 4.6 und 5.5 identisch):

  | ATAK | CoT-Typ | entspricht bei uns |
  |---|---|---|
  | 911 Alert | `b-a-o-tbl` | `notfall` |
  | In Contact | `b-a-o-opn` | `kontakt` |
  | Ring The Bell | `b-a-o-pan` | (neu, optional: «Achtung/alle aufpassen») |
  | Geo-fence Breached | `b-a-g` | v2 (Geofence) |
  | Custom | `b-a-o-c` | – |
  | Cancel | `b-a-o-can` | `alarm.aufheben` |
- **Auslösen mit zwei Schaltern:** ATAK verlangt zwei separate Schalter, die beide «ein» sein müssen. Wird einer ausgeschaltet, ist der Alarm aufgehoben (`EmergencyTool.java`, `repeaterSwitch1/2`). Das deckt sich mit unserer zweistufigen Bestätigung. ✔
- **Ein Alarm pro Person:** Die UID ist fest `<eigene-UID>-9-1-1` (`EmergencyManager.getSelfEmergencyUid`). Ein erneutes Auslösen aktualisiert den Alarm statt einen zweiten zu erzeugen. → Der Server sollte pro Teilnehmer höchstens einen aktiven Alarm halten.
- **Alarm wandert mit:** Die Alarm-CoT hat `stale` +10 s. Der TAK Server wiederholt sie **alle 10 s**, bis ein `b-a-o-can` kommt (`Server: src/takserver-core/src/main/java/com/bbn/marti/service/RepeaterService.java`, `periodMillis` Standard 10000, Abbruchtest `/event[@type='b-a-o-can']`). → Bei uns sollte der Alarmring der aktuellen Position des Auslösers folgen, solange dieser sendet, sonst an der Auslöseposition bleiben. Spätzugänge erhalten den Alarm über den `snapshot` (haben wir schon ✔).

### A5 Rollen als Vorschlagsliste für `funktion`
- **ATAK-Rollen** (`ATAK/res/values/arrays.xml` `role_values`, in 5.5 unverändert): Team Member (Standard), Team Lead, HQ, Sniper, Medic, Forward Observer, RTO, K9. ATAK bietet je Rolle automatisch eine Chatgruppe an (`chat/RoleGroup.java`, `ChatManagerMapComponent.java`).
- **Für uns:** `funktion` bleibt Freitext, bekommt aber eine `<datalist>`, z. B. Sdt · Grfhr · Zfhr · KP/HQ · San · Funker · Schfs · Beob (SPz/FO) · Hundeführer. Für die spätere Bridge eine feste Zuordnung: Grfhr/Zfhr→Team Lead, KP→HQ, San→Medic, Funker→RTO, Schfs→Sniper, Beob→Forward Observer, Hundeführer→K9, Rest→Team Member.

### A6 Team-Farben (optional, als Einheits-Farbe)
- **ATAK** hat 14 Teams, Standard ist **Cyan** (`LocationMapComponent.java`: `putString("locationTeam","Cyan")`). Die Farbwerte stehen in `Icon2525cIconAdapter.teamToColor()` (`ATAK/java/com/atakmap/android/icons/`):
  White #FFFFFF · Yellow #FFFF00 · Orange #FF7700 · Magenta #FF00FF · Red #FF0000 · Maroon #7F0000 · Purple #7F007F · Dark Blue #00007F · Blue #0000FF · Cyan #00FFFF · Teal #007F7F · Green #00FF00 · Dark Green #007F00 · Brown #A0714F
- **Für uns:** Die Blue Force hat ihr SIDC-Symbol, die Farbe wäre nur Zusatz. Günstig umsetzbar: Die Leitung ordnet jeder `einheit` eine dieser Farben zu (Rand des Rufnamen-Labels, Spurfarbe). In der Bridge wird daraus `__group name`. Ohne Zuordnung keine Farbe. → Nur übernehmen, wenn Spuren pro Einheit unterscheidbar sein sollen.

### A7 Sendelogik: bei Ereignissen sofort senden, Stillstand drosseln
- **ATAK-Standard ist «Dynamic»** (`ATAK/res/xml/reporting_preferences.xml`, `ReportingRate.java`):
  - Stillstand (< 0,447 m/s = 1 mph): alle **180 s** (Server/reliable) bzw. 30 s (Multicast)
  - in Bewegung: linear zwischen **20 s** (langsam) und **2 s** (≥ 13,4 m/s = 30 mph)
  - sofort senden bei Tempoänderung > 3,13 m/s, Höhenänderung > 50 m und bei Ereignissen wie einem Rufnamenwechsel (`REPORT_LOCATION`-Intent)
  - «Constant»: 15 s (reliable) bzw. 3 s (unreliable)
- **Für uns (minimal):** Bei Statuswechsel, Alarm und nach Wiederverbindung die Position sofort senden. Zusätzlich die Option «Dynamisch»: unter 0,45 m/s → 30 s, sonst das gewählte Intervall. Damit spart man Akku bei stehenden Posten. Die Server-Drossel ≥ 1 s bleibt.

### A8 Karte: Kachel-Grenzen und Zusatz-Layer (alle per curl geprüft, Kachel z=13 Bern 4265/2883 → HTTP 200)
- **Fehler vermeiden:** Kacheln ausserhalb der TileMatrix liefern **HTTP 400** (`{"error":{"code":400,"message":"Tile out of bounds ..."}}`), Beispiel z13/4149/2818. Unser `maxBounds` ([3.5,44.3]–[13,49.2]) reicht über die Daten hinaus. → In jeder Raster-Source `bounds: [5.140242, 45.398181, 11.47757, 48.230651]` setzen (WGS84BoundingBox aus den WMTS-Capabilities). Die bisherigen `maxzoom` sind richtig: pixelkarte 19 (z20 → 400), swissimage 20.
- **Attribution swissimage** laut `layersConfig`: «CNES, Spot Image, swisstopo, NPOC» (nicht nur «© swisstopo»).
- **Overlays sind PNG:** Das Template in `MapView.svelte` endet fest auf `.jpeg`. Overlays brauchen `.png`.
- **URL-Schema:** `https://wmts.geo.admin.ch/1.0.0/<layer>/default/current/3857/{z}/{x}/{y}.<ext>`

  | Zweck | Layer-ID | Format | max z | empf. Deckkraft* | v1? |
  |---|---|---|---|---|---|
  | Landeskarte Winter | `ch.swisstopo.pixelkarte-farbe-winter` | jpeg | 19 | – | optional Basis |
  | Hangneigung ≥ 30° (Lawinen/Gangbarkeit) | `ch.swisstopo.hangneigung-ueber_30` | png | 17 | 0.4 | **ja** |
  | Relief (Hillshade, Höhenmodell) | `ch.swisstopo.swissalti3d-reliefschattierung_monodirektional` (oder `…reliefschattierung` multidirektional) | png | 18 | ~0.5 | **ja** (über Luftbild/grau) |
  | Strassen und Wege TLM3D | `ch.swisstopo.swisstlm3d-strassen` | png | 18 | – | optional |
  | Gewässer TLM3D | `ch.swisstopo.swisstlm3d-gewaessernetz` | png | 18 | – | optional |
  | Wald TLM3D | `ch.swisstopo.swisstlm3d-wald` | png | 17 | – | optional |
  | Wanderwege | `ch.swisstopo.swisstlm3d-wanderwege` | png | 18 | 0.8 | optional |
  | Geografische Namen (Labels über Luftbild) | `ch.swisstopo.swissnames3d` | png | 17 | – | **ja** (Luftbild ohne Namen ist schwer lesbar) |
  | VBS: publizierte Schiessanzeigen/Gefahrenzonen | `ch.vbs.schiessanzeigen` | png | 18 | 0.6 | **ja** für Übungsplanung (aktuell, oft leer) |
  | VBS: Sperr- und Gefahrenzonenkarte | `ch.vbs.sperr-gefahrenzonenkarte` | png | **12** | 1.0 | optional |
  | VBS: Panzerverschiebungsrouten | `ch.vbs.panzerverschiebungsrouten` | png | 17 | – | optional |
  | VBS: Retablierungsstellen | `ch.vbs.retablierungsstellen` | png | 18 | – | optional |
  | BAZL: Einschränkungen für Drohnen | `ch.bazl.einschraenkungen-drohnen` | png | 18 | 0.6 | **ja**, falls Drohnen im Einsatz |
  | Mil Airspace Chart | `ch.vbs.milairspacechart` | png | 12 | – | nein |

  \* Deckkraft = Standardwert von map.geo.admin.ch aus `https://api3.geo.admin.ch/rest/services/api/MapServer/layersConfig` (`opacity`). Attribution der VBS-Layer: «Schweizer Armee», BAZL-Layer: «BAZL».
  Geprüft: alle Layer HTTP 200, `image/png` bzw. `image/jpeg`. Leere Kacheln sind 334 Bytes gross, zum Beispiel Schiessanzeigen in Bern/Thun bei z13. Bei Thun z10/z11 ist Inhalt vorhanden.
- **Vektorkarten** (für MapLibre direkt nutzbar, geprüft HTTP 200): `https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json`, `…/ch.swisstopo.basemap.vt/style.json`, `…/ch.swisstopo.imagerybasemap.vt/style.json` (Luftbild + Vektor-Labels), `…/ch.swisstopo.basemap-winter.vt/style.json`. Eine «Leichte Basiskarte» ist im Feld besser lesbar als die Pixelkarte. Für v1 nicht nötig, die Pixelkarte ist das gewohnte Bild.
- **Fair Use** (geo.admin.ch, «General Terms of Use FSDI», https://www.geo.admin.ch/en/general-terms-of-use-fsdi): Für WMTS gelten **1'200 Requests/min** und 631 Mio/Jahr. Web-Apps mit Ø ≤ 20'000 Nutzern pro Tag gelten als Fair Use. Bots und Massendownload sind zu vermeiden, für Offline-Nutzung ist der Download-Dienst vorgesehen. Quellenangabe «© Data: swisstopo». Die Server-Header erlauben CORS (`access-control-allow-origin: *`), `cache-control: public, max-age=3600`. → Unsere SW-Cache-Strategie (CacheFirst, kein Vorab-Download) ist konform.
- **ATAK-Maps** enthält **keine** swisstopo- oder Schweiz-Quelle. Auch in Issues gibt es keine Treffer für «swiss»/«switzerland».

---

## B) Für v2

1. **Radial-Menü** (ATAK: `ATAK/assets/menus/*.xml`, ein Menü je CoT-Typ, z. B. `a-f.xml`, `self_menu.xml`). Die Knöpfe sind deklarativ (`<button icon onClick submenu disabled='!{${removable}}'>`).
   - Fremdsymbol: Löschen, Details, Spur ein/aus, Kontakt (Chat), Kamera-Lock (folgen), Pairing-Line (R&B-Linie), Verschieben/Koordinate eingeben
   - Eigenes Symbol: Details, Unbekannt am eigenen Ort setzen, Spur, Kamera-Lock, GPS-Fehlerkreis, Polarkoordinaten, «Hostile Compass»
   - Für uns: Langes Tippen auf ein Symbol öffnet einen Ring mit Details, R&B von hier, Bloodhound, Spur, Chat, Folgen, Bearbeiten/Löschen.
2. **Bloodhound** (Verfolgen/Annähern an Teilnehmer oder Punkt), `ATAK/res/xml/bloodhound_preferences.xml`: ETA-Schwellen **360 s** (blinkt) / **180 s** (äussere) / **60 s** (innere). Farben schwarz (Blinken) / grün / gelb / rot. Route neu berechnen ab 20 m Abweichung bzw. alle 3 s. Lässt sich auf unser R&B-Werkzeug aufsetzen: Linie plus ETA aus `pos.tempo`, Farbwechsel bei Annäherung.
3. **Geofence** (`ATAK/java/com/atakmap/android/geofence/`, CoT-Beispiel `takcot/examples/Geo Fence.cot`):
   - Detail `<__geofence trigger="Entry|Exit|Both" monitor="TAKUsers|Friendly|Hostile|Custom|All" tracking elevationMonitored minElevation maxElevation boundingSphere>` auf einer Zeichnung (`u-d-c-c` Kreis, `u-d-r` Rechteck, `u-d-f` Freihand)
   - Verletzung → Alarm `b-a-g`
   - Für uns: Übungsraum-Grenze bzw. Sperrzone mit Alarm an die Leitung.
4. **Zeichnen** (in v1 ausgeschlossen): Die CoT-Formen in `takcot/examples/Drawing Shapes - *.cot` nutzen `<shape><ellipse>`, `<link point=…>`-Ketten, `strokeColor/fillColor` (ARGB als signed int) und `labels_on`. Das ergibt eine 1:1-Vorlage für das Datenmodell (GeoJSON intern, Farben als `#rrggbbaa`).
5. **Data Packages** (`ATAK/java/com/atakmap/android/missionpackage/file/MissionPackageManifest.java`): ZIP mit `MANIFEST/manifest.xml` → `<MissionPackageManifest version="2"><Configuration><Parameter name="uid" …/><Parameter name="name" …/></Configuration><Contents><Content zipEntry="…" ignore="false"><Parameter name="uid" value="…"/></Content></Contents></MissionPackageManifest>`.
   - Für uns: Die Leitung exportiert die Lage zusätzlich als **ATAK Data Package**: Marker und Sichtungen als `.cot`, Fotos und dazu passende swisstopo-Mapsource-XMLs (siehe 7). Ein ATAK-Nutzer importiert so das ganze Lagebild offline.
6. **CoT-Bridge zum TAK Server** (Server 5.7 Configuration Guide `src/docs/TAK_Server_Configuration_Guide.pdf`):
   - Streaming-Eingang TLS **8089**, Web/API 8443. Die alte stcp-Framing-Regel aus `takproto/README.md`: XML-Header, dann `<event>…</event>`, Trennung nach `</event>`.
   - Gruppenmodell: Eine Verbindung sieht alles von Verbindungen mit mindestens einer gemeinsamen Gruppe. Standardgruppe `__ANON__`; `<input><filtergroup>X</filtergroup>` (Guide §9.3/9.4). → **Unsere Lage = eine TAK-Gruppe.** Die Bridge verbindet sich pro Lage mit `filtergroup=lage-<id>`.
   - **Mission API / Data Sync** (`Server: …/takserver-war/…/sync/api/MissionApi.java`): `/Marti/api/missions/{name}` mit `contents`, `changes`, `subscription(s)`, `keywords`, `archive`, `token`. Änderungsarten `CREATE_MISSION, DELETE_MISSION, ADD_CONTENT, REMOVE_CONTENT, CREATE_DATA_FEED, DELETE_DATA_FEED`. Rollen über `MissionRoleRepository`. → Das Gegenstück zu Lage, Snapshot und Meldungslog. Für eine spätere Bridge: Lage ↔ Mission, Marker/Sichtungen ↔ Mission-Contents (UIDs), Meldungslog ↔ Mission-Log.
   - **Emergency-Repeater** (siehe A4) übernimmt das Wiederholen von Alarmen. Die Bridge muss Alarme nur einmal senden.
   - **TAK Protocol v1** (Protobuf, `takproto/*.proto`): Header `0xBF` + varint-Länge (Stream). `TakMessage{CotEvent{type,uid,sendTime,startTime,staleTime,how,lat,lon,hae,ce,le,Detail{xmlDetail,contact,group,precisionLocation,status,takv,track}}}`. Unbekannte Details wandern als XML-String in `xmlDetail`. XML reicht für den Anfang, Protobuf lohnt sich erst bei vielen Teilnehmern.
7. **swisstopo als ATAK-Mapsources** (MOBAC-Format, `ATAK-Maps/docs/xml-reference.md`). Damit hätten ATAK-Nutzer dieselben Karten (in Data Package oder Doku):
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <customMapSource>
     <name>swisstopo Landeskarte farbig</name>
     <minZoom>7</minZoom>
     <maxZoom>19</maxZoom>
     <tileType>jpg</tileType>
     <tileUpdate>None</tileUpdate>
     <url>https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{$z}/{$x}/{$y}.jpeg</url>
     <backgroundColor>#FFFFFF</backgroundColor>
   </customMapSource>
   ```
   Analog: swissimage (maxZoom 20), pixelkarte-grau, Hangneigung (png, maxZoom 17). Hinweis: ATAK-Maps ist MIT, das Format ist frei. Die swisstopo-Nutzungsbedingungen gelten trotzdem.
8. **Chat-Gruppen nach Rolle/Team** wie in ATAK (`TeamGroup`, `RoleGroup`): Chat an «alle Sanitäter» oder «alle Gruppenführer». Bei uns als `ChatZiel { art: 'funktion' }`.
9. **Lesebestätigungen** (`takcot/xsd/details/__chatreceipt.xsd`): Bestätigung pro Nachricht statt nur Ungelesen-Zähler.
10. **Dead Reckoning / Interpolation** (`ATAK/java/com/atakmap/android/location/DeadReckoningManager.java`): Nicht länger als ein verpasster 1-Hz-GPS-Fix extrapolieren, Tempo-Korrektur auf 0,75–1,25 begrenzt. Für uns rein kosmetisch: Fremdsymbole zwischen zwei Updates gleiten lassen, höchstens ein Intervall lang.
11. **Spot-Map-Schnellmarker** (`takcot/examples/Marker - Spot.cot`: Typ `b-m-p-s-m`, `<color argb>`, `<usericon iconsetpath="COT_MAPPING_SPOTMAP/b-m-p-s-m/<argb>">`): farbige Punkte ohne SIDC, z. B. für «Treffpunkt», «Wegpunkt», «Gefahr». Ergänzt den SIDC-Picker.
12. **Quick-Pic** (`b-i-x-i`, `image/quickpic/`): Ein Foto ist ein eigener Marker am Aufnahmeort. Das passt zur Sichtung ohne SALUTE-Formular («nur Foto»).

---

## C) CoT-Mapping-Skizze

**Grundregeln**
- `uid`: `lagebild.<lageId>.<id>`, stabil über Updates. Alarm: `<teilnehmerUid>-9-1-1`. Chat: `GeoChat.<senderUid>.<raumId>.<msgId>`.
- `time`/`start` = Sendezeit (ISO-8601 UTC); `stale` siehe pro Typ.
- `how`: `m-g` = GPS frisch, `h-e` = geschätzt/kein GPS > 10 s, `h-g-i-g-o` = von Hand gesetzt (Marker, Sichtung, Chat). Quelle: `CotMapComponent.java`, `takcot/mitre/types.txt` (how-Hierarchie).
- `<point hae ce le>`: unbekannt = `9999999.0`. `hae` = `Position.alt` (bereits Ellipsoidhöhe ✔), `ce` = `Position.ce`.
- **Symbol:** `type` = CoT-Typ nach 2525B-Hierarchie (Fallback für alte Clients, z. B. `a-f-G-U-C`, `a-h-G`). Zusätzlich `<__milicon id="<20-stelliger SIDC>"/>`: Ab ATAK 5.x wird damit das APP-6D/2525D-Symbol 1:1 dargestellt (`atak-civ: takkernel/…/symbology/MilSymDetailHandler.java`, `DETAIL_SINGLEPOINT="__milicon"`; Schema `takcot/xsd/details/__milsym.xsd`: «id can contain APP6C, MIL-STD 2525A, B, C, D»). Modifikatoren gehen als `<unitmodifier code="…">wert</unitmodifier>` mit. → Wir brauchen nur eine **grobe** SIDC→CoT-Typ-Tabelle: Identität (SIDC-Stelle 4: 3=f, 6=h, 4=n, 1=u) + Dimension (Symbolset 10=G-U, 15=G-E, 01=A …) + ein paar Funktionen (Infanterie `G-U-C-I`, Panzer `G-U-C-A`, Aufklärung `G-U-C-R`, Sanität `G-U-S-M`, Pionier `G-U-C-E`, Artillerie `G-U-C-F`). Den Rest erledigt `__milicon`.

### C1 Teilnehmer / `pos` → PLI
```xml
<event version="2.0" uid="lagebild.L7Q.t42" type="a-f-G-U-C-I" how="m-g"
       time="2026-10-28T10:00:00Z" start="2026-10-28T10:00:00Z" stale="2026-10-28T10:00:35Z">
  <point lat="46.9480" lon="7.4474" hae="590.0" ce="6.0" le="9999999.0"/>
  <detail>
    <takv platform="Lagebild" version="1.0" device="PWA" os="web"/>
    <contact callsign="ADLER 2" endpoint="*:-1:stcp"/>
    <__group name="Cyan" role="Team Lead"/>            <!-- name = Team-Farbe (A6), role = aus funktion (A5) -->
    <__milicon id="10031000141211000000"/>
    <track course="87.0" speed="1.4"/>                 <!-- kurs, tempo (m/s) -->
    <status battery="78"/>                             <!-- nur wenn navigator.getBattery() verfügbar -->
    <remarks>Einheit: Zug 1 · Funktion: Grfhr · Status: In Bewegung</remarks>
  </detail>
</event>
```
- `stale` = `pos.stale` aus A1 (sonst `t + STALE_MS`).
- `sendetPos=false`: **keine** PLI senden. ATAK würde 0/0 senden, das stört aber andere Clients mit Symbolen im Golf von Guinea.
- Unser Status-Set hat kein CoT-Gegenstück. Er geht als Text in `remarks`. Optional als eigenes Detail `<lagebild status="bewegung" farbe="#1565c0"/>`: Der TAK Server reicht unbekannte Details durch, in Protobuf landen sie in `xmlDetail`.
- `teilnehmer.weg`/Lage beendet: PLI mit `stale = jetzt` senden. Das entspricht dem sofortigen Stale bei Trennung (`staleRemoteDisconnects`).

### C2 Marker
```xml
<event version="2.0" uid="lagebild.L7Q.m9" type="a-h-G-U-C-A" how="h-g-i-g-o"
       time="…" start="…" stale="2026-11-28T10:00:00Z">
  <point lat="46.95" lon="7.46" hae="9999999.0" ce="9999999.0" le="9999999.0"/>
  <detail>
    <contact callsign="Pz Gruppe Nord"/>                     <!-- bezeichnung -->
    <remarks>2 KPz, Front Richtung W</remarks>               <!-- notiz -->
    <link uid="lagebild.L7Q.t42" type="a-f-G-U-C-I" parent_callsign="ADLER 2" relation="p-p"
          production_time="…"/>                              <!-- von -->
    <__milicon id="10061000151205000000"/>
    <archive/>                                               <!-- bleibt bei ATAK gespeichert -->
  </detail>
</event>
```
- `marker.geloescht` → dasselbe Event mit `stale = jetzt` (CoT kennt kein Löschen, ATAK räumt nach Ablauf von `stale` ab, siehe A1). Optional `<__forcedelete/>`; das ist in den XSDs **nicht** dokumentiert, also zuerst prüfen.
- Vorlage: `takcot/examples/Marker - 2525.cot`.

### C3 Chat (`b-t-f`)
Quelle: `ATAK/java/com/atakmap/android/chat/GeoChatService.java` (`bundleToCot`), `ChatMessageParser.java`, `takcot/xsd/details/__chat.xsd`, `chatgrp.xsd`.
```xml
<event version="2.0" uid="GeoChat.lagebild.L7Q.t42.All Chat Rooms.c123" type="b-t-f" how="h-g-i-g-o"
       time="…" start="…" stale="+1 Tag">
  <point lat="46.9480" lon="7.4474" hae="9999999.0" ce="9999999.0" le="9999999.0"/>
  <detail>
    <__chat parent="RootContactGroup" groupOwner="false" messageId="c123"
            chatroom="All Chat Rooms" id="All Chat Rooms" senderCallsign="ADLER 2">
      <chatgrp uid0="lagebild.L7Q.t42" uid1="All Chat Rooms" id="All Chat Rooms"/>
    </__chat>
    <link uid="lagebild.L7Q.t42" type="a-f-G-U-C-I" relation="p-p"/>
    <remarks source="BAO.F.ATAK.lagebild.L7Q.t42" time="…">Text der Nachricht</remarks>
  </detail>
</event>
```
- `an: alle` → `chatroom`/`id` = `All Chat Rooms` (`GeoChatService.DEFAULT_CHATROOM_NAME`).
- `an: einheit` → `chatroom`/`id` = Team-/Gruppenname. In ATAK entsprechen die Teams den 14 Farben. Eine eigene Gruppe pro Einheit wäre in ATAK eine «user-created group» (`groupOwner`, `chatgrp uid0..n` = Mitglieder).
- `an: person` → `chatroom` = Rufname des Empfängers, `id` = UID des Empfängers, `remarks to="<Empfänger-UID>"`, `chatgrp uid0=Sender uid1=Empfänger`.
- Hinweis: `remarks source` beginnt mit `BAO.F.ATAK.`. Andere Präfixe (`BAO.F.WinTAK.`) werden auch geparst (`ChatMessageParser.java`).

### C4 Alarm
Quelle: `ATAK/java/com/atakmap/android/emergency/tool/EmergencyManager.java` (`generateInitiateMessage`/`generateCancelMessage`).
```xml
<!-- auslösen (notfall → b-a-o-tbl / "911 Alert"; kontakt → b-a-o-opn / "In Contact") -->
<event version="2.0" uid="lagebild.L7Q.t42-9-1-1" type="b-a-o-tbl" how="m-g"
       time="…" start="…" stale="+10 s">
  <point lat="46.9480" lon="7.4474" hae="590.0" ce="6.0" le="9999999.0"/>
  <detail>
    <link uid="lagebild.L7Q.t42" type="a-f-G-U-C-I" relation="p-p"/>
    <contact callsign="ADLER 2-Alert"/>
    <emergency type="911 Alert">ADLER 2</emergency>
  </detail>
</event>

<!-- aufheben -->
<event version="2.0" uid="lagebild.L7Q.t42-9-1-1" type="b-a-o-can" how="h-e" time="…" start="…" stale="+10 s">
  <point lat="46.9480" lon="7.4474" hae="9999999.0" ce="9999999.0" le="9999999.0"/>
  <detail><emergency cancel="true">ADLER 2</emergency></detail>
</event>
```
- `quittiertVon` hat kein CoT-Gegenstück und bleibt intern (oder geht als Chat «Alarm ADLER 2 quittiert» an alle).
- Eingehend von ATAK: `b-a-o-tbl`/`b-a-o-opn` → `Alarm` (Art notfall/kontakt), `b-a-o-pan` → «Achtung» (falls in A4 übernommen), `b-a-g` → v2, `b-a-o-can` mit gleicher UID → `aufgehobenAm`.

### C5 Sichtung (SALUTE)
```xml
<event version="2.0" uid="lagebild.L7Q.s5" type="a-h-G-U-C-I" how="h-g-i-g-o" time="…" start="…" stale="+1 Tag">
  <point lat="46.951" lon="7.452" hae="9999999.0" ce="50" le="9999999.0"/>
  <detail>
    <contact callsign="SALUTE 5 (ADLER 2)"/>
    <__milicon id="10061000141211000000"/>
    <link uid="lagebild.L7Q.t42" type="a-f-G-U-C-I" parent_callsign="ADLER 2" relation="p-p"/>
    <remarks>S: 6 Pers · A: graben sich ein · L: (Punkt) · U: Tarnanzug, kein Abzeichen · T: 10:42 · E: 1 MG, Funk · Vertrauen: wahrscheinlich · Bemerkung: …</remarks>
    <attachment_list hashes="[&quot;sha256-des-fotos&quot;]"/>   <!-- takcot/xsd/details/attachment_list.xsd -->
  </detail>
</event>
```
- Die Zeit der Sichtung (`zeit`) geht in `start`. `time` ist die Meldezeit.
- Das Foto selbst kommt nicht im CoT mit, sondern über Data Package/Mission-Content (Hash-Referenz). Alternative: ein eigenes Quick-Pic-Event `b-i-x-i` am gleichen Ort.
- `vertrauen: unsicher` → Identität `a-u-…` (unbekannt) statt `a-h-…`.

### C6 Weitere
- **Range & Bearing** (falls geteilt): `u-rb-a` mit `<range value>` (m), `<bearing value>`, `<inclination>`, `<rangeUnits>`, `<bearingUnits>`, `<northRef>` (`takcot/examples/Range & Bearing - Line.cot`). Artilleriepromille gibt es dort nicht als Einheit, das bleibt reine Anzeige.
- **Meldung** (Statuswechsel): kein eigenes CoT. Der Status fliesst mit der nächsten PLI (C1, `remarks`/`<lagebild status>`). Freitext-Meldungen gehen als Chat an alle.

---

## D) Lizenzen

| Quelle | Lizenz | Folge für uns |
|---|---|---|
| deptofdefense/AndroidTacticalAssaultKit-CIV | **GPL-3.0** (`LICENSE.md`); Repo eingefroren auf ATAK 4.6.0.5 | Kein Code, keine Assets (Icons, XML-Menüs) übernehmen. Konzepte, Zahlenwerte, CoT-Typen und Formate sind frei verwendbar (Fakten/Schnittstellen). |
| TAK-Product-Center/atak-civ | **GPL-3.0** (`LICENSE.md`, GitHub meldet NOASSERTION wegen Zusatzdateien); aktuell 5.5.1.10 | wie oben |
| TAK-Product-Center/Server | **GPL-3.0** (`LICENSE.md`/`LICENSE.txt`); Guide «Distribution Statement A: approved for public release» | wie oben; eine Bridge spricht nur das Protokoll, das ist unkritisch |
| TAK-Product-Center/VR | GPL-3.0 | nicht relevant |
| takcot-XSDs / takproto (in den ATAK-Repos) | unter der Repo-Lizenz (GPL-3.0) | Schema als Spezifikation lesen. Generierten Code aus den `.proto` nicht übernehmen, sondern eigene Typen schreiben. |
| joshuafuller/ATAK-Maps | **MIT** (`LICENSE`, © 2023 Joshua Fuller) | XML-Format und Beispiele frei verwendbar. Die Kachelquellen darin haben eigene Bedingungen (Google/Bing u. a. sind faktisch nicht erlaubt). |
| swisstopo / geo.admin.ch (WMTS, Vektorkacheln) | Offene Behördendaten, gratis, «© Data: swisstopo», Fair Use (1'200 Req/min WMTS); einzelne Layer-Bedingungen via geocat.ch | Attribution je Layer (swissimage: «CNES, Spot Image, swisstopo, NPOC»; VBS: «Schweizer Armee»; BAZL: «BAZL»). Kein Massendownload. |

---

### Belegte Pfade (Auswahl)
- `ATAK/java/com/atakmap/comms/ReportingRate.java`, `ATAK/res/xml/reporting_preferences.xml`
- `ATAK/res/xml/stale_data_prefs.xml`, `ATAK/res/values/arrays.xml` (`squad_values`, `role_values`, `delete_stale_values`, `reporting_strategy_*`)
- `ATAK/java/com/atakmap/android/icons/Icon2525cIconAdapter.java` (`teamToColor`)
- `ATAK/java/com/atakmap/android/location/LocationMapComponent.java`, `…/location/DeadReckoningManager.java`
- `ATAK/java/com/atakmap/android/cot/CotMapComponent.java` (Eigen-PLI)
- `ATAK/java/com/atakmap/android/emergency/tool/{EmergencyType,EmergencyManager,EmergencyTool}.java`
- `ATAK/java/com/atakmap/android/chat/{GeoChatService,ChatMessageParser,ChatManagerMapComponent}.java`
- `ATAK/java/com/atakmap/android/geofence/data/{GeoFence,GeoFenceConstants}.java`, `ATAK/res/xml/bloodhound_preferences.xml`
- `ATAK/assets/menus/{a-f,self_menu}.xml`
- `takcot/xsd/details/*.xsd`, `takcot/examples/*.cot`, `takproto/README.md`, `takproto/*.proto`
- atak-civ 5.5: `takkernel/shared/src/main/java/gov/tak/api/symbology/MilSymDetailHandler.java`, `takcot/xsd/details/__milsym.xsd`
- Server: `src/docs/TAK_Server_Configuration_Guide.pdf` (§9.3–9.5), `src/takserver-core/src/main/java/com/bbn/marti/service/RepeaterService.java`, `src/takserver-core/takserver-war/src/main/java/com/bbn/marti/sync/api/MissionApi.java`
- ATAK-Maps: `docs/xml-reference.md`, `basemapDE/*.xml` (Beispiel für eine nationale WMTS-Quelle)
- swisstopo: `https://wmts.geo.admin.ch/EPSG/3857/1.0.0/WMTSCapabilities.xml`, `https://api3.geo.admin.ch/rest/services/api/MapServer/layersConfig`
