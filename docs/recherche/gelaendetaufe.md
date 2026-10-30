# Geländetaufe, Führungsraster und ruhigere Karte – Recherche 30.10.2026

Grundlage: `README.md` (Entscheidungslog bis 30.10.), `docs/spec.md`, `client/src/lib/karten.ts`, `client/src/components/MapView.svelte` (heute nur Raster-Quellen von `wmts.geo.admin.ch`, MapLibre GL 6.16). Live geprüft am 30.10.2026 per `curl`/Node gegen `vectortiles.geo.admin.ch`, `api3.geo.admin.ch`, `wmts.geo.admin.ch` und `data.geo.admin.ch`. Testgebiet für Messungen: 10 × 10 km um Thun (Box 7.565, 46.71 – 7.695, 46.80). Quellcode gelesen: MapLibre GL JS 6.16 (`node_modules/maplibre-gl/src`), KADAS Albireo 2 (`kadas-albireo/kadas-albireo2`, per `gh api`), watergis/maplibre-gl-export (per `gh api`). Kein Code übernommen.

Kennzeichnung: **[live]** = selbst gemessen bzw. abgefragt, **[Doku]** = Primärquelle gelesen, **[Code]** = Quellcode gelesen, **[sekundär]** = nur Sekundärquelle, **[nicht belegt]** = keine öffentliche Quelle gefunden.

Juans Entscheide vom 30.10. sind eingearbeitet: Taufen darf jede Person, aber nur im **Taufmodus**. Getaufte Namen bilden den eigenen, schaltbaren Layer **«Geländetaufe»**. Das **Führungsraster** ist ein fixiertes Gitter, das nur die Leitung nachträglich verschiebt, ist als eigener Layer schaltbar und lässt sich als **PDF** ausdrucken. Die Raster-Parameter bleiben offen, bis Juans Vorlage da ist.

---

## Kurzfazit

1. swisstopo stellt die **Basiskarte als Vektorkacheln** frei zur Verfügung (OGD, Quellenangabe «© swisstopo», kommerziell erlaubt). Sie enthält genau die Klassen für die fünf Namensfamilien: `building`, `transportation`/`transportation_name`, `water`/`waterway`, `landcover` (wood) und `landuse`. Ein 10 × 10-km-Raum braucht z8–z14 rund **62 Kacheln, ca. 4 MB komprimiert** [live].
2. «Tippen und benennen» funktioniert in MapLibre auch dann, wenn die sichtbare Karte Raster bleibt. Die Vektorebene liegt mit **Deckkraft 0** darüber, und `queryRenderedFeatures` findet sie trotzdem. Bei `visibility: none` findet die Abfrage nichts mehr, und die Kacheln werden gar nicht erst geladen [Code + Doku]. Das passt genau zum Taufmodus: Modus aus heisst `none`, also ist nichts antippbar und es gibt keinen Datenverkehr.
3. Die Kacheln haben **keine Feature-IDs**. Gebäude haben weder ID noch Namen, Strassen sind pro Kachel zerschnitten [live]. Für eine einzelne Taufe reicht das, weil die App die Geometrie beim Taufen **kopiert und speichert**. Ganze Strassenachsen samt stabiler ID liefert online die API `ch.swisstopo.amtliches-strassenverzeichnis` (ESID, Name, MultiLineString), Gebäude-IDs (EGID) liefert das GWR [live].
4. Objekterkennung aus SWISSIMAGE lohnt sich für v1 **nicht**. Die Vektordaten decken alle fünf Familien ab. Ein Modell (SAM 3/samgeo) bräuchte einen GPU-Dienst und brächte nur Dinge, die nicht in swissTLM3D stehen (temporäre Objekte).
5. Für die Namensfamilien (Gebäude = Metalle, Strassen = Tiere usw.) und für das Wort «Geländetaufe» habe ich **keine öffentliche Quelle** gefunden. Das gilt als gelebte Praxis. Öffentlich dokumentiert ist das **Führungsraster** im Kartensystem der Armee, **KADAS Albireo**: Zeilen mit Buchstaben ab A, Spalten mit Zahlen ab 1, optional Quadranten A–D [Code + Doku]. Das deckt sich mit Juans «Alpha 12».
6. Für die ruhigere Karte hat die App die graue Landeskarte schon. Dazu gibt es «Karte swissTLM grau» und «Landeskarte 1:10'000 grau» bis z19 [live]. Am billigsten dämpft man aber **per `raster-saturation`/`raster-brightness-min`**: Das wirkt auf die bereits gecachten Kacheln und braucht keinen zweiten Download.
7. Ein PDF-Ausdruck aus dem Browser ist machbar. Man nimmt eine versteckte Karte in Seitengrösse mit `preserveDrawingBuffer`, erhöht die Pixeldichte und baut das PDF mit jsPDF. Das MIT-Plugin `maplibre-gl-export` macht genau das [Code]. Die Rasterschärfe beim Druck muss ein Prototyp klären.

---

## 1) swisstopo-Vektordaten

### 1.1 Basiskarte als Vector Tiles (die Datenquelle für «Tippen»)

| | Wert | Beleg |
|---|---|---|
| Styles | Basiskarte `https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json` (Version `basemap_v1.26.0`, 88 Layer) · leichte Basiskarte `…/ch.swisstopo.lightbasemap.vt/style.json` (`lightbasemap_v1.19.0`, 66 Layer) · Bildkarte `…/ch.swisstopo.imagerybasemap.vt/style.json` (`imagerybasemap_v1.19.0`, 35 Layer, SWISSIMAGE-Raster + Vektorbeschriftung) | [live] HTTP 200 |
| Kachelsätze | `ch.swisstopo.base.vt` und `ch.swisstopo.relief.vt` (Schummerung, Schraffen, Geröll), je `v1.0.0` | [live] |
| TileJSON | `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/tiles.json`, kommt **gzip-komprimiert** (`curl --compressed`) | [live] |
| Kachel-URL | `https://vectortiles{0-4}.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf` | [live] TileJSON |
| Zoom | minzoom 0, **maxzoom 14** (z15 → HTTP 404). MapLibre überzoomt bis z20. Kachel-Extent 4096, bei z14 also ca. 0,4 m Auflösung bei 46,7° N | [live] |
| Bounds | 3.57, 44.18 – 13.66, 48.88 | [live] |
| CORS | `access-control-allow-origin: *`, `cache-control: max-age=3600` | [live] |
| Glyphs/Sprite | `https://vectortiles.geo.admin.ch/fonts/{fontstack}/{range}.pbf`, Sprite je Style | [live] style.json |
| Attribution | TileJSON: «© swisstopo» | [live] |
| Doku | https://docs.geo.admin.ch/visualize-data/vector-tiles.html (GetStyle, GetTile, TileJSON, MBTiles-Download) | [Doku] |

**Quell-Layer und Attribute** laut TileJSON `vector_layers` [live]:

| source-layer | Attribute (Auszug) | Bemerkung |
|---|---|---|
| `building` | `class`, `render_height`, `render_min_height` | **kein Name, keine ID** |
| `transportation` | `class`, `subclass`, `brunnel`, `surface`, `api_id` … | Linien **ohne Namen**. `api_id` ist im Testgebiet bei 3 von 16'860 Stücken gesetzt, also praktisch leer |
| `transportation_name` | `class`, `name`, `name:de` …, `ref` | eigene Linien mit dem Strassennamen. 1167 verschiedene Namen im Testgebiet, viele Quartierstrassen laufen unter `class: primary` (Datenmacke, nicht verlassen) |
| `water` | `class` (lake, river, pool) | Flächen ohne Namen |
| `waterway` | `class` (river, stream, riverbank, shoreline), `name`, `width`, `intermittent` | Linien mit Namen |
| `water_name` | `name`, `class` | Beschriftung |
| `landcover` | `class`/`subclass`: wood/forest, wood/loose_forest, wood/scrub, wood/woody_plant, grass/park, grass/allotments, farmland/orchard, farmland/vineyard, wetland/swamp | **Wald = `class: wood`** |
| `landcover_pt` | tree/tree (Einzelbäume, 5314 in einer Kachel) | nur Punkte |
| `landuse` | residential, military, school, sports, pitch, parking, cemetery, quarry, hospital, camp_site … | Flächen ohne Namen |
| `place` | `feature_id`, `class` (u. a. neighbourhood), `name`, `population` | Quartiere nur als **Punkt** (z. B. «Westquartier») |
| `area_name` | `feature_id`, `class`/`subclass` (place/field = Flurname), `name`, `extent_uuid` | Flurnamen als Punkt |
| `poi`, `mountain_peak`, `aerodrome_label`, `administrative_unit` | `feature_id`, `name` … | haben `feature_id` |
| `housenumber`, `contour_line`, `spot_elevation`, `boundary`, `shortest_path`, `extent` | – | für die Taufe unwichtig |

**Feature-IDs:** Im Testgebiet (42 Kacheln z14) hat **kein einziges Objekt eine Vektorkachel-ID** (`feature.id` fehlt überall). Ein `feature_id`-Attribut gibt es nur bei `place`, `poi`, `area_name`, `mountain_peak`, `administrative_unit` und `aerodrome_label` [live]. `promoteId` hilft also nur bei Punkten mit Namen, nicht bei Gebäude, Strasse, Wald oder Gewässer.

**Grösse für 10 × 10 km** (Thun) [live]:

| Zoom | Kacheln | entpackt |
|---|---|---|
| z8–z11 | je 1 | 1,36 MB zusammen |
| z12 | 4 | 0,9 MB |
| z13 | 12 | 1,5 MB |
| z14 | 42 | 4,9 MB |
| **Summe** | **62** | **8,4 MB entpackt, ca. 4,2 MB gzip** (z14 gzip 2,3 MB; Kachel z14 bis 115 KB entpackt) |

Städtisches Gebiet ist eher die obere Grenze. Der Relief-Kachelsatz kommt dazu, falls man die leichte Basiskarte selbst anzeigen will.

**Offline-Angebot:** Komplette MBTiles für die ganze Schweiz unter `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/ch.swisstopo.base.vt.mbtiles` (**1,04 GB**, Stand 08.06.2026), Relief `…/ch.swisstopo.relief.vt/v1.0.0/ch.swisstopo.relief.vt.mbtiles` (**1,50 GB**). Ein PMTiles-Angebot gibt es nicht (beide `.pmtiles` HTTP 404) [live]. Die Doku nennt «about 900 MB» für die Basiskarte [Doku]. Einen Ausschnitt kann man mit der pmtiles-CLI bilden: `pmtiles convert IN.mbtiles OUT.pmtiles` und danach `pmtiles extract IN.pmtiles OUT.pmtiles --bbox=… --maxzoom=…`. Im Browser liest pmtiles.js das Ergebnis (https://docs.protomaps.com/pmtiles/cli) [Doku]. Für einzelne Übungsräume reicht es aber, die 62 Kacheln direkt zu cachen (siehe Empfehlung).

### 1.2 API-Layer mit vollständiger Geometrie (api3.geo.admin.ch)

Identify-Doku: https://docs.geo.admin.ch/access-data/identify-features.html. Pflicht sind `geometry`, `geometryType`, `tolerance` und bei `tolerance > 0` auch `mapExtent` und `imageDisplay`. Optional sind `sr` (2056/4326/3857/21781), `geometryFormat=geojson`, `limit` (Standard 50, **max. 200**), `offset` und `layerDefs` [Doku]. CORS `*`, `cache-control: max-age=1800` [live].

Live-Abfragen in Thun (Bahnhof, `sr=4326`) [live]:

| Layer | Treffer | Geometrie | Attribute (Auszug) | Nutzen für die Taufe |
|---|---|---|---|---|
| `ch.swisstopo.amtliches-strassenverzeichnis` | ja | **ganze Strassenachse** als MultiLineString | `str_esid` (stabile ID), `stn_label` (Name), `com_name`, `str_type`, `str_status` | **beste Quelle für «durchgehende Strasse»**. Abfrage per ID: `…/MapServer/ch.swisstopo.amtliches-strassenverzeichnis/10007848?geometryFormat=geojson&sr=4326` liefert die ganze Bahnhofstrasse (61 Stützpunkte) |
| `ch.swisstopo.swisstlm3d-strassen` | ja | Segment (MultiLineString, kurz) | `strassenname`, `objektart`, `belagsart`, `verkehrsbedeutung` | nur Segmente, also für ganze Strassen ungeeignet. Hat auch Wege ohne Namen |
| `ch.swisstopo.swisstlm3d-gewaessernetz` | ja | ganzer Abschnitt (Bbox des Treffers geht über die Abfrage hinaus) | `objektart`, `name` (oft `null`), **`gwl_nr`** (Gewässerlaufnummer, z. B. `CH0047930000`) | `gwl_nr` fasst die Abschnitte eines Gewässers zusammen |
| `ch.bfs.gebaeude_wohnungs_register` (GWR) | ja | **nur Punkt** | `egid` (eidg. Gebäude-ID), `strname_deinr` (Adresse), `gkat`, `gbauj`; Stand `gexpdat` 28.10.2026 | stabile Gebäude-ID und Adresse, aber ohne Umriss |
| `ch.swisstopo.vec25-gebaeude` | ja | Polygon (generalisiert 1:25'000) | nur `area`, `perimeter` | grob, ohne Klasse, also kaum besser als die Kachel |
| `ch.swisstopo.vec25-primaerflaechen` | ja | riesige Polygone (8 km²) | nur `area`, `perimeter`, **keine Objektart** | unbrauchbar |
| `ch.swisstopo-vd.amtliche-vermessung` | ja | Polygon | Liegenschaften (Parzellen, EGRID), **keine Gebäude** | nicht für die Taufe |
| `ch.swisstopo.swisstlm3d-wald` | **HTTP 400** | – | layersConfig `tooltip: false` | **Wald ist nicht abfragbar**, also nur über Vektorkacheln |
| `ch.swisstopo.swissnames3d` | an dieser Stelle 0 | – | Felder `name`, `objektklasse`, `objektart` (u. a. Ort, See, Landschaftsname) | Namen, keine Flächen |

Ein Vorabladen des ganzen Übungsraums geht per Envelope-Identify mit Paging. Im Testgebiet 10 × 10 km ergab das **1347 Strassen in 7 Anfragen** (eine Seite mit Geometrie: 507 KB, 0,6 s) und **1601 Gewässerabschnitte in 9 Anfragen** [live]. Weitere Endpunkte, die funktionieren: `find` (`…/MapServer/find?layer=…&searchText=Bahnhofstrasse&searchField=stn_label`, schweizweit 201 Treffer) und die Abfrage einzelner Objekte per ID (siehe oben) [live].

### 1.3 Download-Datensätze (nur zur Einordnung)

| Datensatz | Zugriff | Bemerkung |
|---|---|---|
| swissTLM3D | STAC `https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swisstlm3d`, Ausgaben 2020-03 … **2026-02**; GPKG/GDB/SHP/XTF, ganze Schweiz; GPKG 2024-03 = **4,58 GB** | [live]. Für die App zu gross, liefert aber dieselben Objekte wie die Kacheln mit IDs. Nur nötig, wenn man einmal einen eigenen Kachelsatz mit IDs bauen will |
| swissNAMES3D | STAC `…/collections/ch.swisstopo.swissnames3d`, Lizenz-Link https://www.swisstopo.admin.ch/ogd-conditions | [live] |
| swissBUILDINGS3D 3.0 Beta | STAC `…/collections/ch.swisstopo.swissbuildings3d_3_0` (DWG/GDB/CityGML je Kachel) | [live]. 3D, für eine 2D-Taufe überdimensioniert |
| SWISSIMAGE 10 cm | STAC `…/collections/ch.swisstopo.swissimage-dop10` | [live]. Nur für Objekterkennung relevant |

### 1.4 Lizenz und Nutzungsbedingungen

- **swisstopo OGD:** «may be used, distributed and made accessible», darf angereichert und verarbeitet werden, **«may also be used commercially»**. Quellenangabe ist Pflicht, z. B. «© swisstopo». Bei «excessive use» kann der Zugang eingeschränkt werden. Quelle: https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices (Version 1.3.2021) [Doku].
- **FSDI-Nutzungsbedingungen (geo.admin.ch):** Fair Use. Web-Apps mit durchschnittlich 20'000 Nutzenden pro Tag gelten als fair. Bots mit hoher Abfragedichte sind zu vermeiden. Für Offline-Systeme und Datenbanken soll man den **Download-Dienst** nutzen. Die Quellenangabe lautet «© Data: swisstopo». Quelle: https://www.geo.admin.ch/en/general-terms-of-use-fsdi [Doku]. Die Tabelle mit den Anfragen pro Minute wird auf der Seite nicht als Text ausgeliefert, deshalb habe ich die Zahl dieses Mal nicht verifiziert (die frühere Recherche nannte 1'200 Anfragen/min für WMTS).
- **opendata.swiss** führt die MBTiles als «Vektorielle Kartenbasis». Laut Suchtreffer ist dort «commercial use requires permission» vermerkt [sekundär, Suchsnippet: https://opendata.swiss/en/dataset/vektorielle-kartenbasis-vector-tileset]. Das widerspricht den swisstopo-OGD-Bedingungen oben. Für ein Ausbildungsmittel ist es ohne Belang. Vor einer kommerziellen Nutzung müsste man es klären.
- **GWR (BFS)**, **amtliches Strassenverzeichnis**: Attribution im layersConfig «BFS» bzw. «swisstopo» [live]. Wer sie nutzt, nennt sie in der Attribution.

### 1.5 Zuordnung swisstopo → Namensfamilien (Juans Konvention)

| Familie (Namen) | Vektorkachel | Filter | API-Ergänzung (online) | Grenzen |
|---|---|---|---|---|
| **Gebäude** (Metalle) | `building` | alle `class` (leer, roof, place_of_worship, tower, greenhouse, storage_tank, construction …). `underground`, `chimney` und `covered_bridge` ausschliessen | GWR-Identify am Schwerpunkt ergibt `egid` und Adresse | kein Name, keine ID. 4,6 % der Gebäude im Testgebiet berühren eine Kachelgrenze (1969 von 42'430 Stücken) [live] |
| **Strasse** (Tiere) | `transportation` (Linie zum Antippen) + `transportation_name` (Name) | `class` motorway, trunk, primary, secondary, tertiary, minor, service, track. `path`/`footway` nach Juans Wahl | `amtliches-strassenverzeichnis` liefert die ganze Achse, `str_esid` und den amtlichen Namen | in der Kachel zerschnitten: «Bahnhofstrasse» kommt in 17, «Frutigenstrasse» in 15 Stücken vor [live]. Feldwege ohne Namen gibt es nur als Segment |
| **Gewässer** (Wassertiere) | `waterway` (Bach/Fluss, mit `name`), `water` (See, Fluss als Fläche, `pool` ausschliessen) | `class` river, stream, lake | `swisstlm3d-gewaessernetz`: `gwl_nr` fasst die Abschnitte eines Gewässers zusammen | kleine Bäche sind oft ohne Namen |
| **Wald** (Forest, Woods …) | `landcover` | `class == wood` (forest, loose_forest, scrub, woody_plant) | **keine** (TLM-Wald nicht abfragbar) | 268 von 1132 Waldstücken berühren eine Kachelgrenze [live]. Ein grosser Wald ist ein riesiges Stück, ein «Waldabschnitt» muss man oft selbst abgrenzen |
| **Fläche** (Floor, Ruins …) | `landuse` (residential, military, sports, pitch, parking, quarry, cemetery, school …), `landcover` grass/farmland/wetland | Liste nach Juans Wahl | – | **Quartiere** gibt es nur als Punkt (`place` neighbourhood), Flurnamen als Punkt (`area_name` place/field). Eine Quartierfläche muss man zeichnen |

---

## 2) MapLibre: Objekt per Tipp greifen

### 2.1 Unsichtbare Vektorebene über Raster

- `queryRenderedFeatures` **schliesst Layer mit `visibility: "none"` aus**. Layer, die nichts Sichtbares beitragen, findet es dagegen: «Features from all other layers are included, including features that may have no visible contribution to the rendered result; for example, because the layer's opacity or color alpha component is set to 0» (Doc-Kommentar in `src/ui/map.ts`, ca. Zeile 2552, MapLibre 6.16) [Code]. Online: https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#queryrenderedfeatures.
- Bei `visibility: none` gibt es auch **keine Buckets und keine Kacheln**. Der Worker überspringt versteckte Layer (`if (layer.isHidden(this.zoom, true)) continue;` in `src/source/worker_tile.ts`). Eine Quelle gilt nur als `used`, solange mindestens ein Layer nicht versteckt ist (`style.ts` ca. Zeile 794). `StyleLayer.isHidden()` liefert `true` bei `visibility === 'none'` oder ausserhalb von minzoom/maxzoom (`style_layer.ts` Zeile 321) [Code]. Folge: **Taufmodus aus = `none` = nichts antippbar und kein Download.** Taufmodus an = sichtbar, die Kacheln laden.
- **Treffer auf Linien:** Der Suchradius ist `line-width / 2` plus Versatz (`line_style_layer.ts`, `queryRadius`) [Code]. Eine Strassenebene mit `line-width: 14` und `line-opacity: 0` (bzw. leicht sichtbar im Taufmodus) gibt also eine fingerdicke Trefferfläche. Zusätzlich kann man eine Box statt eines Punkts abfragen: `queryRenderedFeatures([[x-12,y-12],[x+12,y+12]], {layers})`.
- **`querySourceFeatures`** liefert alle Objekte der *geladenen* Kacheln einer Quelle, egal ob gerendert. Die Kacheln müssen aber geladen sein (siehe oben). Laut Doku-Kommentar in `map.ts`: «feature geometries may be split or duplicated across tile boundaries … features may appear multiple times» [Code]. Implementiert ist das in `src/source/query_features.ts` mit Deduplizierung nur nach Kachel-ID, nicht nach Objekt [Code].
- **`promoteId`** nimmt ein Attribut als Feature-ID (für Feature-State), als String oder `{sourceLayer: property}` [Doku: Style-Spec `source_vector.promoteId`]. Sinnvoll nur für `place`/`poi`/`area_name` (`feature_id`). Für das Hervorheben im Taufmodus braucht man es nicht: Ein Filter auf der Hervorhebungsebene reicht.

### 2.2 Geometrie vervollständigen

| Problem | Lösung ohne neue Abhängigkeit | Lösung mit API (online) |
|---|---|---|
| Gebäude an Kachelgrenze zerschnitten | Stücke gleicher `class` aus den Nachbarkacheln, deren Bbox die Kachelkante überlappt, als MultiPolygon mitnehmen. **Nur Füllung, keine Kontur zeichnen**, dann sieht man die Naht nicht und braucht kein Union | – |
| Gebäude ohne ID | Schlüssel aus gerundetem Schwerpunkt (LV95, 1 m) | GWR-Identify am Schwerpunkt: `egid` |
| Strasse zerschnitten, Name in eigener Ebene | `querySourceFeatures('base', {sourceLayer: 'transportation_name', filter: ['==', ['get','name'], name]})` sammeln und als MultiLineString speichern. Das deckt nur die geladenen Kacheln ab | `amtliches-strassenverzeichnis` per Identify am Tipp-Punkt liefert die ganze Achse, ESID und den Namen [live] |
| Wald über mehrere Kacheln | Flutfüllung über Nachbarstücke `class: wood`, die an der Kachelkante anstossen (Bbox-Überlappung), als MultiPolygon, nur Füllung | – (nicht abfragbar) |
| Quartier, Waldabschnitt, Teil einer Fläche | gibt es nicht als Objekt. **Mit dem vorhandenen Raum-Werkzeug zeichnen** und taufen | – |

Speichert die App die Geometrie beim Taufen als Kopie, hängt die Taufe nicht mehr an Kachelversionen und lässt sich offline anzeigen. Die Zeichnung im Vertrag erlaubt heute nur einfache Punktlisten (max. 2000 Punkte, `shared/protocol.ts`). Eine Taufe braucht Multi-Geometrien und bekommt deshalb einen eigenen Typ (siehe Empfehlung).

---

## 3) Objekterkennung aus SWISSIMAGE

- **Bedarf:** Gebäude, Strassen, Gewässer, Wald und Landnutzungsflächen sind vollständig in den Vektordaten (Abschnitt 1.5). Objekterkennung brächte nur, was swissTLM3D nicht führt: Container, Fahrzeuge, provisorische Bauten, Holzlager, frisch gerodete Flächen. Ausserdem sind die Luftbilder 1–3 Jahre alt (STAC-Intervall der DOP10 bis 2025) [live], die Vektordaten werden jährlich (TLM 2026-02) bzw. täglich (GWR) nachgeführt.
- **Fertige Werkzeuge:** `segment-geospatial` (samgeo, opengeos) kann SAM 1/2/3, FastSAM, HQ-SAM und LangSAM, segmentiert Fernerkundungsbilder auch per Textprompt und hat ein eigenes Extra `segment-geospatial[samgeo3]` (https://pypi.org/project/segment-geospatial/, https://github.com/opengeos/segment-geospatial/wiki) [Doku, nicht ausprobiert]. Dass SAM 3 Gebäude, Fahrzeuge, Bäume und Gewässer per Text extrahiert, belegt nur ein Blog (https://geospatialtraining.com/metas-sam-3-a-game-changer-for-gis-feature-extraction/) [sekundär].
- **Aufwand:** Python-Dienst mit GPU (die Homelab-GPU teilen sich schon Ollama und Hermes), GeoTIFF-Ausschnitt holen, Maske in Polygone wandeln, vereinfachen. Grob 2–4 Tage bis zu einem brauchbaren «Tippen → Umriss», dazu Betrieb und Wartung.
- **Bewertung:** **Nicht für v1.** Allenfalls später als Knopf «Umriss aus Luftbild» für ein Objekt, das in den Vektordaten fehlt. Der Fallback «Fläche zeichnen» existiert schon und deckt den Fall günstiger ab.

---

## 4) Führungsraster und Geländetaufe – was öffentlich belegt ist

### 4.1 Schweizer Armee

- **KADAS Albireo** ist das Standard-Kartendarstellungssystem der Armee. Das steht im swisstopo-Bestellformular für Armeekarten, das auch die Landeskarte 1:25'000 als Führungs- und Sicherheitskarte nennt (https://www.swisstopo.admin.ch/dam/de/sd-web/BgkEYyG6lsHg/Form-21-010-Kartenbestellung-2018-DE.pdf) [Doku, laut Suchsnippet]. Der Code ist offen (GPL-2.0, https://github.com/kadas-albireo/kadas-albireo2).
- **Führungsraster in KADAS** [Code + Doku]:
  - Handbuch DE (`docs/de/draw.md`): «Das Führungsraster ist ein Raster, bei welcher die Zeilen und Spalten mit Zahlen bzw. Buchstaben beschriftet werden … Sämtliche Gittereigenschaften sowie die Beschriftungsdarstellung lassen sich anpassen. Standardmässig wird das Gitter entsprechend dem aktuellen Kartenausschnitt erstellt.» (https://github.com/kadas-albireo/kadas-albireo2/blob/master/docs/de/draw.md, auch https://kadas-albireo.github.io/)
  - Parameter (`kadas/app/guidegrid/kadasguidegridlayer.h`): Rechteck, `cols`, `rows`, Zell-Breite/-Höhe sperrbar, Schriftgrösse (Standard 30), **`rowStart = "A"`, `colStart = "1"`** (Zeilen Buchstaben, Spalten Zahlen), Beschriftung innen/aussen, `avoidRepeatingLetters`, **Quadranten**: keine / einer / alle.
  - Ansprache (`kadasguidegridlayer.cpp`): «Cell {Zeile}, {Spalte}», optional «(Quadrant A–D)». **A = oben links, B = oben rechts, C = unten rechts, D = unten links**.
  - Es gibt einen **Bullseye** (konzentrische Ringe und Achsen um einen Punkt, Ringe/Achsen/Quadranten beschriftbar, `kadas/app/bullseye/kadasbullseyelayer.h`).
  - Das Gitter ist ein Rechteck in der Projektion der Karte (für die Schweiz LV95). Eine Drehung habe ich im Header nicht gefunden.
- **Reglemente:** Ein öffentliches Reglement zu «Führungsraster», «Geländetaufe», Koordinatenangabe im Funk oder Kartenlesen habe ich nicht gefunden. Gesucht habe ich auf admin.ch/vtg.admin.ch und im Web. Gefunden habe ich nur Verweise auf Reglement 51.024 ODA im Bestellformular und Antiquariatsangebote. Die Armee-Reglemente sind meist nur für den Dienstgebrauch [nicht belegt].
- **Namensfamilien** (Gebäude = Metalle, Strassen = Tiere, Gewässer = Wassertiere, Wald = Forest/Woods, Flächen = Floor/Ruins, Begriffe immer Englisch): **keine öffentliche Quelle gefunden**, deshalb als **gelebte Praxis (Juan)** behandelt [nicht belegt]. Das Prinzip ist aber allgemein üblich: Bei Ortskampf werden Gebäude nummeriert, um Ziele und Meldungen zu vereinfachen. Das belegt nur ein Kommentar (https://armchairgeneral.com/tactics-101-025-urban-operations-truisms-and-nuggets.htm/7) [sekundär].

### 4.2 NATO / international

- **Buchstabieralphabet:** Seit 1956 in der NATO (eingeführt per 1. März 1956), von der ICAO genehmigt, später von der ITU übernommen. Geschrieben wird **«Alfa»** und **«Juliett»** (https://www.nato.int/cps/en/natohq/declassified_136216.htm) [Doku]. Dass Rasterbuchstaben im Funk mit diesem Alphabet gesprochen werden, gilt allgemein so. Eine Quelle, die das ausdrücklich für Gitterzellen festhält, habe ich nicht gefunden [nicht belegt]. Juans «Alpha 12» folgt dem Muster.
- **Gridded Reference Graphic (GRG):** Die doktrinäre Primärquelle (US-ATP/JP) habe ich nicht erreicht. Belegt ist die GRG-Umsetzung von Esri ArcGIS Defense: Gitter über Fläche oder Punkt mit Zellbreite/-höhe in Metern, **Startecke** wählbar (Standard oben links), **Beschriftung alpha-numerisch (Standard), alpha-alpha oder numerisch**, Trennzeichen wählbar, die **Drehung folgt der Eingabefläche**, dazu ein Werkzeug «Number Features» zum Durchnummerieren von Gebäuden. Verwendet wird es u. a. für «search and rescue, cordon and search, and clearing operations» (https://pro.arcgis.com/en/pro-app/3.5/tool-reference/defense/generate-grid-from-area.htm, https://pro.arcgis.com/en/pro-app/3.1/tool-reference/defense/an-overview-of-the-gridded-reference-graphic-toolset.htm) [Doku Hersteller, nicht Doktrin].
- **Kill Box / Keypad:** Kill Box ist ein dreidimensionaler Zielraum, oft über ein Gitter definiert. Für die Unterteilung in Keypads 1–9 (Telefontastatur) habe ich nur eine Wiki-Seite gefunden (https://military-history.fandom.com/wiki/Kill_box) [sekundär].
- **Koordinationslinien und Punkte** (Phasenlinie, Grenze, Kontrollpunkt) stehen in APP-6D/MIL-STD-2525D und sind in der App als taktische Linien bereits umgesetzt (Spec, Abschnitt Zeichnen). Neu müsste man sie nicht machen, nur in die Taufe einbeziehen: Eine Phasenlinie «PL Gold» ist eine Zeichnung mit Bezeichnung.

### 4.3 Was in die App gehört

| Element | Sinnvoll? | Begründung |
|---|---|---|
| Benanntes Gitter über einem Raum, Ansprache «Alpha 12» | **ja (Kern)** | Juans Hauptzweck: Wer ohne App funkt, meldet präzise. KADAS-Konvention (Zeile Buchstabe, Spalte Zahl) übernehmen, dann passt es zu dem, was die Truppe kennt |
| Zellen-Ansprache in der Koordinatenzeile (eigene Position, langes Tippen) | **ja** | kostet wenig, man hört und sieht dieselbe Sprache |
| Eingabe «Charlie 4» → Marker in der Zellmitte | **ja** | übersetzt eine Funkmeldung in einen Marker |
| Quadranten (A–D) bzw. Keypad (1–9) als Verfeinerung | optional | hängt von Juans Vorlage ab. Achtung: Quadrant-Buchstaben kollidieren mit Zeilen-Buchstaben («Alpha 12 Bravo»). Keypad-Ziffern wären eindeutiger |
| Bullseye | später | kein Bedarf genannt |
| Kill Box/GRG mit Gebäudenummerierung | nein | die Geländetaufe mit Namen ersetzt die Nummerierung |

---

## 5) Ruhigere Darstellung

| Möglichkeit | URL / Layer | Zoom | Lizenz | Bewertung |
|---|---|---|---|---|
| **Landeskarte grau** (schon in der App) | `ch.swisstopo.pixelkarte-grau` (jpeg) | bis z19 [live] | OGD, «© swisstopo» | vorhanden |
| Karte swissTLM grau | `ch.swisstopo.swisstlm3d-karte-grau` (png) | z8–z19 [live] | OGD | ruhiger als die LK, weniger Beschriftung. Als weitere Grundkarte günstig (eine Zeile in `karten.ts`) |
| Landeskarte 1:10'000 grau | `ch.swisstopo.landeskarte-grau-10` (png) | z8–z19 [live] | OGD | detailreich im Siedlungsgebiet |
| Leichte Basiskarte (Vektor) | `…/styles/ch.swisstopo.lightbasemap.vt/style.json` | Daten bis z14, Darstellung beliebig | OGD | wirklich ruhig. Braucht aber swisstopo-Glyphs und -Sprite im Stil, also Umbau von `stil()` zu «Vektorstil + eigene Raster». Raster-Variante gibt es nur als Relief (`ch.swisstopo.leichte-basiskarte_reliefschattierung`) [live, layersConfig] |
| **Raster dämpfen in MapLibre** | Paint `raster-saturation` (−1…1, Standard 0), `raster-contrast` (−1…1), `raster-brightness-min` (0…1), `raster-brightness-max` (0…1), `raster-opacity` | – | – | [Doku: Style-Spec in `@maplibre/maplibre-gl-style-spec`, https://maplibre.org/maplibre-style-spec/layers/#raster]. **Wirkt auf die gecachten Kacheln**, also kein zweiter Download und auch offline nutzbar. Beispiel «LK gedämpft»: `raster-saturation: -1, raster-brightness-min: 0.35, raster-contrast: -0.2`. Für das Luftbild: `raster-saturation: -0.7, raster-brightness-min: 0.2` |

**Empfehlung:** einen Schalter «Karte gedämpft» per Paint-Eigenschaften auf die gewählte Grundkarte legen und «Karte swissTLM grau» als Grundkarte ergänzen. Die leichte Basiskarte als Vektorstil lohnt sich erst, wenn die App ohnehin auf einen Vektorstil umstellt.

---

## 6) PDF-Ausdruck (Karte mit Raster)

- **Canvas lesen:** Ohne `preserveDrawingBuffer` ist der WebGL-Puffer nach dem Frame leer. MapLibre 6: `new Map({ canvasContextAttributes: { preserveDrawingBuffer: true } })`, Standard ist `false` (`maplibre-gl.d.ts`, MapOptions) [Code]. Danach `map.getCanvas().toBlob()`/`toDataURL()`.
- **Auflösung:** Das `pixelRatio`-Argument bzw. `map.setPixelRatio()` setzt die Canvas-Grösse auf `clientWidth × pixelRatio`. **`maxCanvasSize` ist standardmässig [4096, 4096]**: Grössere Canvas werden nicht verweigert, sondern die Pixeldichte wird gesenkt (Warnung) [Code, `maplibre-gl.d.ts`]. A4 mit 300 dpi = 2480 × 3508 px passt, A3 mit 300 dpi (3508 × 4961) nicht, dafür muss man `maxCanvasSize` erhöhen (Grenze ist `MAX_TEXTURE_SIZE` des Geräts) oder 200 dpi nehmen.
- **Fertige Lösung:** `watergis/maplibre-gl-export` (MIT, aktiv, 190 Sterne, Peer `maplibre-gl ^5.21.1 || >=6.0.0`, Abhängigkeiten `jspdf`, `html-to-image`, `svg2pdf.js`). Das Plugin baut eine **versteckte Karte in Seitengrösse** (Layout mit 96 dpi), hebt `window.devicePixelRatio` für das Rendern auf `dpi/96` (Standard 300 dpi), wartet auf `idle` (Timeout 5 s), setzt Massstab, Nordpfeil und **Attribution** aufs Bild und erzeugt das PDF, optional als GeoPDF (`packages/maplibre-gl-export/src/lib/core/map-generator-base.ts`) [Code]. Es hat eine eigene UI-Komponente, für uns reicht der Kern oder ein Nachbau mit jsPDF (~50 Zeilen).
- **Rasterschärfe (offen, Prototyp):** MapLibre wählt die Kachel-Zoomstufe nach CSS-Pixeln. Bei 96-dpi-Layout und Massstab 1:25'000 sind das ca. 6,6 m/px, also z14-Kacheln, die für 300 dpi dreifach hochskaliert und damit unscharf werden. 1:25'000 bei 300 dpi braucht ca. 2,1 m/px, also **z16-Kacheln** (1,6 m/px bei 46,7° N, gerechnet). Ausweg für die Druckkarte: kleinere `tileSize` in der Raster-Quelle, damit MapLibre höhere Stufen lädt. **Ungetestet**, im Prototyp klären.
- **Blattgrösse:** A4 hoch bei 1:25'000 deckt 5,25 × 7,4 km ab, A3 quer 10,5 × 7,4 km. Ein 10-km-Raum braucht also A3 oder 1:50'000 auf A4 (gerechnet).
- **Lizenz auf dem Ausdruck:** OGD verlangt die Quellenangabe auch analog: «Digital and analogue representations … must include» z. B. «© swisstopo» [Doku, swisstopo OGD]. Auf das Blatt gehören deshalb «© swisstopo» (beim Luftbild «CNES, Spot Image, swisstopo, NPOC» laut layersConfig) sowie Massstab, Nordpfeil, Datum und Lage-Name. Für ein Ausbildungsmittel ohne Klassifizierung ist ein Vermerk wie «Übung» sinnvoll.
- **Fair Use:** Ein A3 bei z16 sind grob 100–200 Kachelanfragen pro Druck, unkritisch.

---

## Empfehlung

### Weg mit dem geringsten Aufwand bei grösstem Nutzen

**Datenquelle:** swisstopo-Vektorkacheln `ch.swisstopo.base.vt` als **unsichtbare Abfrageebene** über der unveränderten Rasterkarte. Damit gehen alle fünf Familien, auch offline, mit einer einzigen Quelle. Die API (`amtliches-strassenverzeichnis`, GWR) kommt nur online als Veredelung dazu: ganze Strassenachse, ESID und EGID.

**Ablauf in der App:**

1. **Taufmodus an** (Knopf unter «Mehr» bzw. im Layer-Menü «Geländetaufe»). Die Vektorquelle wird sichtbar geschaltet, antippbare Objekte erscheinen mit dünner Kontur und 15 % Füllung in Familienfarben, die Karte wird gedämpft (`raster-saturation`). Ab z15, darunter gibt es einen Hinweis «näher zoomen». Ausserhalb des Modus stehen alle Taufebenen auf `visibility: none`, also ist nichts antippbar und nichts wird geladen.
2. **Tippen:** `queryRenderedFeatures` mit 24-px-Box über den Taufebenen. Vorrang bei Überlagerung: Gebäude > Gewässer (Linie) > Strasse > Wald > Fläche. Mehrere Treffer: kleine Auswahl wie im Radial-Menü.
3. **Objektart automatisch:** Aus `source-layer` und `class` folgt die Familie (Tabelle 1.5). Der Name der Vorlage (Strassen- bzw. Gewässername) wird als Hinweis angezeigt, nicht als Taufname.
4. **Vorschlag:** der **nächste freie Name** aus der Liste der Familie, in Listenreihenfolge (siehe offene Frage).
5. **Ein Tipp bestätigt.** Daneben gibt es «Anderer Name» (Liste oder Freitext) und «Abbrechen».
6. **Geometrie vervollständigen** vor dem Speichern (Abschnitt 2.2): Gebäude- und Waldstücke über die Kachelkante sammeln, Strassenstücke gleichen Namens sammeln. Online ersetzt die App die Strasse durch die Achse aus dem Strassenverzeichnis und ergänzt beim Gebäude die EGID. Die Geometrie wird vereinfacht (≤ 2000 Punkte) und **als Kopie gespeichert**.
7. **Kein passendes Objekt** (Quartier, Waldabschnitt, Achse über mehrere Strassen): mit dem bestehenden Werkzeug Fläche bzw. Linie zeichnen und dann über dieselbe Familienwahl taufen.

**Datenmodell (eigener Typ, nicht Zeichnung):** `Taufe { id, familie: 'gebaeude'|'strasse'|'gewaesser'|'wald'|'flaeche', name, quelle: 'vt'|'strassenverzeichnis'|'gezeichnet', quellId?: string (EGID/ESID/gwl_nr), objektart: string (z. B. 'building/roof'), geometrie: GeoJSON Polygon|MultiPolygon|LineString|MultiLineString|Point, von, erstelltAm, geaendertAm }`. Rechte: taufen dürfen alle (im Modus), umbenennen und löschen dürfen Ersteller und Leitung, analog zu Zeichnungen. Live an alle, im Export der Leitung (GeoJSON) enthalten, mit der Lage gelöscht.

**Namenslisten:** pro Familie eine Vorgabeliste in der App, die die Leitung pro Lage anpassen kann (Reihenfolge ändern, ergänzen, streichen). Vorschlag für die Vorgabe (Englisch, funktauglich, ohne Wörter aus dem NATO-Alphabet):
- Gebäude/Metalle: Bronze, Copper, Iron, Silver, Platinum, Zinc, Nickel, Cobalt, Chrome, Titan, Iridium, Osmium, Palladium, Tungsten, Mercury, Lead, Tin, Steel, Brass, Uranium …
- Strassen/Tiere: Ape, Bear, Lion, Tiger, Wolf, Fox, Badger, Moose, Bison, Panther, Jaguar, Rhino, Hyena, Camel, Zebra, Beaver …
- Gewässer/Wassertiere: Fish, Whale, Dolphin, Shark, Seal, Otter, Pike, Trout, Salmon, Eel, Crab, Squid, Orca, Walrus …
- Wald: Forest, Woods, Grove, Timber, Jungle, Thicket, Pines, Birch …
- Fläche: Floor, Ruins, Field, Plaza, Yard, Meadow, Desert, Steppe …

**Kollisionsprüfung:** Kein Name kommt in einer Lage zweimal vor (ohne Gross-/Kleinschreibung, über alle Familien). Der Server erzwingt das und meldet einen Konflikt, falls zwei Personen gleichzeitig denselben Namen vergeben. Der Client schlägt dann den nächsten freien vor. Zusätzlich gibt es eine **Warnung, keine Sperre**, wenn ein Name einem Wort des Buchstabieralphabets zu ähnlich ist, das im Führungsraster gesprochen wird (z. B. «Gold» vs. «Golf», «Lima», «Delta»). Grundlage ist eine feste Liste der 26 Wörter mit einfacher Ähnlichkeitsregel (gleiche ersten drei Buchstaben). ponytail: einfache Heuristik, bei Bedarf phonetischer Vergleich.

**Layer «Geländetaufe»:** eigene GeoJSON-Quelle aus den Taufen mit Beschriftung je Familie (Farbe und Symbol pro Familie). Im Layer-Menü ein-/ausschaltbar, unabhängig vom Taufmodus. Antippen ausserhalb des Modus macht nichts (Juans Entscheid).

**Führungsraster:** Gitter in **LV95** rechnen (proj4 ist schon installiert) und als Linien und Beschriftung in eine GeoJSON-Quelle zeichnen. Dann liegt es parallel zum Gitter der Landeskarte, in Web-Mercator erscheint es leicht schräg. Zustand pro Lage: `{ ursprungE, ursprungN, zellM, spalten, zeilen, beschriftung, drehungGrad?, fixiert: boolean, von }`. Ablauf: Leitung oder Ersteller legt es an, verschiebt es auf der Karte und fixiert es. Danach darf nur noch die Leitung verschieben. Eigener Layer, ein-/ausschaltbar. Zelle zu Ansprache (`floor((E−E0)/zellM)`, Zeile als Buchstabe) für Koordinatenzeile und langes Tippen. Eingabe «Charlie 4» setzt einen Marker in die Zellmitte. Die Parameter bleiben offen, bis Juans Vorlage da ist (offene Fragen).

**PDF:** «Drucken» unter «Mehr»: Blattgrösse (A4/A3, hoch/quer), Massstab (1:10'000/25'000/50'000), Ausschnitt = Rasterumfang oder aktuelle Karte. Versteckte Karte mit `preserveDrawingBuffer`, 200–300 dpi, Raster und Taufe-Layer an, Rand mit Lage-Name, Datum, Massstab, Nord, «© swisstopo». PDF per jsPDF (neue Abhängigkeit, oder `maplibre-gl-export` als Kern). Die Rasterschärfe zuerst im Prototyp prüfen.

### Was offline geht

| Teil | Offline | Wie |
|---|---|---|
| Taufen ansehen, Raster ansehen, Ansprache | ja | Taufen und Raster liegen im Lage-Snapshot (Server-Sync wie Zeichnungen) |
| Neu taufen per Tipp | ja, wenn die Vektorkacheln des Raums gecacht sind | Etappe «Offline-Gebiete»: neben den Rasterkacheln die **62 Vektorkacheln (~4 MB)** des Raums in den Service-Worker-Cache. CORS `*`, Fair Use unkritisch. Den MBTiles-Download (1 GB) braucht es dafür nicht |
| Ganze Strassenachse, EGID | nur online. Offline gibt es die Stücke gleichen Namens aus den geladenen Kacheln | optional später: beim Anlegen eines Offline-Gebiets die Strassenachsen per Envelope-Identify vorladen (Thun: 7 Anfragen, ca. 3,5 MB) |
| PDF | ja für gecachte Rasterkacheln der benötigten Stufe | Druckstufe (z16) vorher im Offline-Gebiet mitladen |

### Grobe Bauetappen

1. **Ruhige Karte** (½ Tag): Schalter «gedämpft» per `raster-saturation`/`raster-brightness-min`, Grundkarte «swissTLM grau».
2. **Führungsraster v1** (1–2 Tage, nach Juans Vorlage): Vertragstyp, Anlegen/Verschieben/Fixieren, Layer, Ansprache in der Koordinatenzeile, Eingabe «Alpha 12» zu Marker.
3. **Taufmodus v1** (2–3 Tage): Vektorquelle, Hervorhebung, Tippen, Familie, Namensvorschlag, Bestätigen, Vertragstyp `Taufe`, Layer «Geländetaufe», Kollisionsprüfung auf dem Server, Namenslisten pro Lage (Leitung). Geometrie zunächst nur das getroffene Stück.
4. **Geometrie vervollständigen** (1 Tag): Kachelnaht für Gebäude und Wald, Strassenstücke nach Namen, online Strassenverzeichnis und GWR.
5. **PDF-Ausdruck** (1–2 Tage inkl. Prototyp zur Rasterschärfe).
6. **Offline**: in der geplanten Etappe «Offline-Gebiete» die Vektorkacheln mitnehmen (wenige Zeilen, sobald es die Etappe gibt).

Übersprungen: Objekterkennung (kommt erst dazu, wenn ein konkretes Objekt fehlt), Bullseye, eigener Kachelsatz mit IDs aus swissTLM3D, leichte Basiskarte als Vektorstil.

---

## Offene Fragen für die Frage-Runde mit Juan

Bereits entschieden und deshalb nicht mehr offen: Taufmodus für alle, Layer «Geländetaufe», Raster fixiert und nur die Leitung verschiebt, Raster als Layer, PDF aus der App.

1. **Reihenfolge der Namensvergabe**
   - (a) **Nächster freier in Listenreihenfolge** *(Empfehlung: vorhersehbar, und die Leitung steuert über die Liste)*
   - (b) Zufällig aus den freien Namen
   - (c) Alphabetisch nach Anfangsbuchstabe, mit Bezug zur Lage (z. B. A-Namen im Norden)
2. **Namenslisten: wer pflegt sie, was ist Vorgabe?**
   - (a) **App-Vorgabe pro Familie, Leitung passt pro Lage an** *(Empfehlung)*
   - (b) Juan liefert verbindliche Listen, keine Anpassung pro Lage
   - (c) Freitext ohne Listen, nur Kollisionsprüfung
3. **Was gilt als Strasse?** (Vektorklassen)
   - (a) **Fahrbare Strassen inkl. Feldwege (track), ohne Fuss- und Wanderwege** *(Empfehlung: Funk betrifft meist Fahrachsen)*
   - (b) Alles inkl. Fusswege
   - (c) Nur Strassen mit amtlichem Namen
4. **Was gehört zur Familie «Fläche»?**
   - (a) **Landnutzung (Wohn-, Militär-, Sport-, Parkplatz-, Abbauflächen) + gezeichnete Räume (Quartier)** *(Empfehlung)*
   - (b) Nur gezeichnete Räume
   - (c) Auch Wiesen/Ackerland (`landcover` grass/farmland)
5. **Quartiere:** eigene Familie oder Teil von «Fläche»?
   - (a) **Teil von «Fläche», per Zeichnen** *(Empfehlung, swisstopo hat Quartiere nur als Punkt)*
   - (b) Eigene Familie mit eigener Namensliste
6. **Strasse ganz oder nur Abschnitt taufen?**
   - (a) **Ganze Strasse (amtlicher Name) als Vorgabe, Abschnitt per Zeichnen** *(Empfehlung)*
   - (b) Nur das angetippte Stück zwischen zwei Kreuzungen
7. **Umbenennen und löschen von Taufen**
   - (a) **Ersteller und Leitung** *(Empfehlung, wie bei Zeichnungen)*
   - (b) Nur Leitung
8. **Ähnlichkeit zum Buchstabieralphabet** (z. B. «Gold» vs. «Golf»)
   - (a) **Warnen, aber zulassen** *(Empfehlung)*
   - (b) Sperren
   - (c) Ignorieren
9. **Führungsraster-Parameter** (offen bis zur Vorlage):
   - Zellgrösse: (a) **feste Werte 100/250/500/1000 m** *(Empfehlung)* · (b) frei in Metern · (c) aus Blattgrösse abgeleitet
   - Beschriftung: (a) **Zeilen Buchstaben ab A von oben, Spalten Zahlen ab 1 von links (wie KADAS)** *(Empfehlung)* · (b) umgekehrt · (c) Startecke wählbar (wie GRG)
   - Drehung: (a) **keine, parallel zum LV95-Gitter** *(Empfehlung: einfacher, passt zur Landeskarte)* · (b) frei drehbar
   - Ursprung: (a) **frei gesetzt, auf ganze 100 m LV95 gerundet** *(Empfehlung)* · (b) frei ohne Rundung · (c) an LV95-km-Gitter gebunden
   - Verfeinerung: (a) **keine** · (b) Quadranten A–D (KADAS) · (c) Keypad 1–9
   - Mehrere Raster pro Lage: (a) **eines** *(Empfehlung)* · (b) mehrere (KADAS erlaubt beliebig viele)
10. **PDF-Standard**
    - (a) **A3 quer, 1:25'000, Raster + Taufen, Landeskarte grau** *(Empfehlung, passt auf 10 × 7 km)*
    - (b) A4, Massstab automatisch passend zum Raster
    - (c) Vorlage gemäss Juans PDF

---

## Nicht verifiziert

- Öffentliche Quelle für die Namensfamilien und das Wort «Geländetaufe» (gelebte Praxis laut Juan).
- Öffentliches Armee-Reglement zu Führungsraster, Koordinatenangabe im Funk und Kartenlesen.
- Dass Rasterbuchstaben im Funk ausdrücklich per NATO-Alphabet gesprochen werden (naheliegend, aber ohne Beleg).
- GRG und Kill Box in US-Doktrin (nur Herstellerdoku Esri bzw. Wiki).
- Fair-Use-Zahlen pro Minute (Tabelle auf geo.admin.ch nicht als Text verfügbar).
- Rasterschärfe beim PDF-Export mit erhöhter Pixeldichte (Kachel-Zoomwahl). Braucht einen Prototyp.
- SAM 3/samgeo nicht ausprobiert.
- Widerspruch opendata.swiss («commercial use requires permission») und swisstopo OGD («may be used commercially») nur per Suchsnippet gesehen.

### Belegte Pfade und URLs (Auswahl)

- swisstopo: `https://vectortiles.geo.admin.ch/styles/{ch.swisstopo.basemap.vt|ch.swisstopo.lightbasemap.vt|ch.swisstopo.imagerybasemap.vt}/style.json`, `https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/tiles.json`, `…/ch.swisstopo.base.vt.mbtiles`, `https://api3.geo.admin.ch/rest/services/api/MapServer/{identify|find|<layer>|<layer>/<id>}`, `https://api3.geo.admin.ch/rest/services/api/MapServer/layersConfig`, `https://data.geo.admin.ch/api/stac/v0.9/collections/…`, https://docs.geo.admin.ch/visualize-data/vector-tiles.html, https://docs.geo.admin.ch/access-data/identify-features.html, https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices, https://www.geo.admin.ch/en/general-terms-of-use-fsdi
- MapLibre 6.16: `src/ui/map.ts` (Doku zu `queryRenderedFeatures`/`querySourceFeatures`), `src/style/style.ts` (`used`, `queryRenderedFeatures`), `src/style/style_layer.ts` (`isHidden`), `src/source/worker_tile.ts`, `src/source/query_features.ts`, `src/style/style_layer/line_style_layer.ts` (`queryRadius`), `dist/maplibre-gl.d.ts` (`canvasContextAttributes`, `pixelRatio`, `maxCanvasSize`), Style-Spec `paint_raster`, `source_vector.promoteId`
- KADAS: `kadas/app/guidegrid/kadasguidegridlayer.{h,cpp}`, `kadas/core/kadasguidegridutils.cpp`, `kadas/app/bullseye/kadasbullseyelayer.h`, `docs/de/draw.md`
- maplibre-gl-export: `packages/maplibre-gl-export/src/lib/core/map-generator-base.ts`, `packages/maplibre-gl-export/package.json`
- pmtiles: https://docs.protomaps.com/pmtiles/cli
- NATO-Alphabet: https://www.nato.int/cps/en/natohq/declassified_136216.htm
- Esri GRG: https://pro.arcgis.com/en/pro-app/3.5/tool-reference/defense/generate-grid-from-area.htm
