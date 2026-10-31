# Mutationsnachweis der Unit-Tests

Je Zeile: eine gezielte Änderung am Produktivcode (Bedingung umgedreht, Prüfung entfernt, Grenzwert verschoben), der danach rote Test, Mutation zurückgenommen.
Stand 2026-10-31: 207 von 207 Mutationen rot. Erzeugt mit einem Runner-Skript (exakte Textersetzung, Testdatei laufen lassen, Datei wiederherstellen).

## client/src/features/alarm/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/alarm/logik.ts:15` | `.sort((x, y) => y.t - x.t);` → `.sort((x, y) => x.t - y.t);` | aktive | rot |
| `client/src/features/alarm/logik.ts:19` | `aktive(alarme).filter((a) => a.von !== ich && !(ich && a.quittiertVon.` → `aktive(alarme).filter((a) => a.von !== i` | aktive | rot |
| `client/src/features/alarm/logik.ts:26` | `return a.lat !== null && a.lon !== null ? { lat: a.lat, lon: a.lon } :` → `return { lat: a.lat!, lon: a.lon! };` | Ort | rot |

## client/src/features/bloodhound/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/bloodhound/logik.ts:34` | `if (dt < MIN_DT_MS \|\| (p.ce != null && p.ce > MAX_CE_M)) return alt;` → `if (dt < MIN_DT_MS) return alt;` | erste Position unbekannt | rot |
| `client/src/features/bloodhound/logik.ts:48` | `if (restS === null \|\| restS > 360) return 'neutral';` → `if (restS === null \|\| restS >= 360) re` | Stufen | rot |
| `client/src/features/bloodhound/logik.ts:42` | `return v !== null && v >= MIN_TEMPO ? distM / v : null;` → `return v !== null && v > MIN_TEMPO ? dis` | Distanz durch Tempo | rot |
| `client/src/features/bloodhound/logik.ts:70` | `if (distM === null \|\| distM > ERREICHT_M \|\| this.gemeldet.has(id))` → `if (distM === null \|\| distM >= ERREICH` | erst ab | rot |
| `client/src/features/bloodhound/logik.ts:85` | `const r = LokalSchema.safeParse(JSON.parse(json ?? 'null'));` → `const r = { success: true, data: JSON.pa` | ladeLokal | rot |

## client/src/features/chat/kanaele.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/chat/kanaele.ts:24` | ``person:${c.von === ich ? c.an.id : c.von}`` → ``person:${c.an.id}`` | kanalVon | rot |
| `client/src/features/chat/kanaele.ts:43` | `.sort((a, b) => Number(b === meineEinheit) - Number(a === meineEinheit` → `.sort((a, b) => vergleiche(a, b))` | Reihenfolge | rot |
| `client/src/features/chat/kanaele.ts:81` | `const neu = c.von !== ich && c.t > (gelesen[key] ?? gelesen['*'] ?? 0)` → `const neu = c.t > (gelesen[key] ?? geles` | Ungelesen | rot |
| `client/src/features/chat/kanaele.ts:92` | `if (!o \|\| typeof o !== 'object' \|\| Array.isArray(o)) return null;` → `if (!o \|\| typeof o !== 'object') retur` | Eingaben | rot |

## client/src/features/leitung/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/leitung/logik.ts:80` | `return m?.[1]?.replace(/[\\/]/g, '_') \|\| rueckfall;` → `return m?.[1] \|\| rueckfall;` | dateiname | rot |
| `client/src/features/leitung/logik.ts:50` | `.max(20, 'Höchstens 20 Status.')` → `.max(21, 'Höchstens 20 Status.')` | pruefeStatusSet | rot |
| `client/src/features/leitung/logik.ts:43` | `for (let n = 2; vergeben.has(key); n++)` → `for (let n = 2; false; n++)` | slug passt | rot |
| `client/src/features/leitung/logik.ts:30` | `.slice(0, 32)` → `.slice(0, 33)` | slug passt | rot |

## client/src/features/marker/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/marker/logik.ts:15` | `m.bezeichnung.trim() \|\| funktionLabel(m.sidc)` → `m.bezeichnung \|\| funktionLabel(m.sidc)` | Name fällt | rot |
| `client/src/features/marker/logik.ts:20` | `treffer.sort((a, b) => distanz(von, a) - distanz(von, b))` → `treffer.sort((a, b) => distanz(von, b) -` | Name fällt | rot |
| `client/src/features/marker/logik.ts:44` | `notiz: e.notiz.trim().slice(0, 500)` → `notiz: e.notiz.trim().slice(0, 600)` | setzenNachricht | rot |

## client/src/features/offline/kacheln.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/offline/kacheln.ts:109` | `? Math.min(k.maxzoom, LUFTBILD_STANDARD_Z) : k.maxzoom;` → `? k.maxzoom : k.maxzoom;` | Zoom-Grenzen je Karte | rot |
| `client/src/features/offline/kacheln.ts:173` | `gs.filter((g) => jetzt - g.zuletztGenutzt > ABLAUF_MS)` → `gs.filter((g) => jetzt - g.zuletztGenutz` | 60-Tage-Ablauf | rot |
| `client/src/features/offline/kacheln.ts:169` | `for (const k of alleKacheln(bereiche(weg))) if (!drin(k)) yield urlVon` → `for (const k of alleKacheln(bereiche(weg` | Referenzzählung | rot |
| `client/src/features/offline/kacheln.ts:160` | `if (nurInnen && k.z <= UMGEBUNG_Z) return false;` → `(entfernt)` | enthaelt | rot |
| `client/src/features/offline/kacheln.ts:92` | `anteil = 0.1): Bbox` → `anteil = 0.2): Bbox` | umschliesst den Rahmen | rot |

## client/src/features/offline/laden.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/offline/laden.ts:55` | `const alt = await w.ansicht?.match(url);` → `const alt = null;` | verschiebt schon angezeigte Kacheln | rot |
| `client/src/features/offline/laden.ts:75` | `if (r.status === 400 \|\| r.status === 404) return 0;` → `if (r.status === 400) return 0;` | 404/400 gilt als erledigt | rot |
| `client/src/features/offline/laden.ts:36` | `frei.set(host, start + (ABSTAND_MS[host] ?? 1000));` → `frei.set(host, start);` | hält je Dienst den Mindestabstand | rot |

## client/src/features/rangebearing/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/rangebearing/logik.ts:90` | `rueck: azimut(b, a) };` → `rueck: azimut(a, b) };` | formatiert Distanz | rot |
| `client/src/features/rangebearing/logik.ts:32` | `const r = EndpunktSchema.safeParse(x); return r.success ? r.data : nul` → `return x as Endpunkt;` | verwirft ungültige | rot |
| `client/src/features/rangebearing/logik.ts:60` | `if (s === 'ich') return ICH;` → `(entfernt)` | Schlüssel ist umkehrbar | rot |

## client/src/features/raster/beschriftung.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/raster/beschriftung.ts:29` | `if (zellB < 2) return [];` → `if (zellB < 20) return [];` | herangezoomt | rot |
| `client/src/features/raster/beschriftung.ts:55` | `aus.push({ text, seite, x: x - wS / 2, y, w: wS, h });` → `aus.push({ text, seite, x: x - wS, y, w:` | Raster ganz im Bild | rot |

## client/src/features/raster/druck.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/raster/druck.ts:44` | `return Math.ceil(n / stufe - 1e-9) * stufe;` → `return Math.round(n / stufe) * stufe;` | Massstab rundet | rot |
| `client/src/features/raster/druck.ts:67` | `const tabelle = { x: rahmen.x - ZEILE_W, y: rahmen.y - 2 * BAND,` → `const tabelle = { x: rahmen.x - ZEILE_W,` | A4 quer | rot |
| `client/src/features/raster/druck.ts:24` | `const MIN_SPALTE = 16;` → `const MIN_SPALTE = 8;` | schmale Spalten | rot |
| `client/src/features/raster/druck.ts:138` | `export const TILE = 256;` → `export const TILE = 512;` | affin legt drei Punkte | rot |
| `client/src/features/raster/druck.ts:209` | `return `${[lageTeil \|\| 'lage', art, tag].join('-')}.pdf`;` → `return `${[lageTeil \|\| 'x', art, tag].` | zwei Seiten A4 quer | rot |
| `client/src/features/raster/druck.ts:105` | `const n = Math.max(1, Math.round((a * 5) / 7));` → `const n = Math.max(1, Math.round((a * 4)` | Köpfe: Spalten oben hell | rot |
| `client/src/features/raster/pdf.ts:44` | `for (let i = 1; i < anzahl; i++) schreibe(`${String(offsets[i]).padSta` → `for (let i = 1; i < anzahl; i++) schreib` | xref zeigt auf die Objekte | rot |

## client/src/features/sichtung/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/sichtung/logik.ts:87` | `w.taetigkeit === 'bewegt sich' && w.richtung ? `bewegt sich Richtung $` → `w.richtung ? `${w.taetigkeit} Richtung $` | Vorgaben sofort gültig | rot |
| `client/src/features/sichtung/logik.ts:12` | `hoehe: Math.max(1, Math.round(hoehe * f))` → `hoehe: Math.round(hoehe * f)` | verkleinert | rot |
| `client/src/features/sichtung/logik.ts:93` | `zeit: startMs - w.vorMin * 60_000,` → `zeit: startMs - w.vorMin * 1000,` | Vorgaben sofort gültig | rot |

## client/src/features/spuren/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/spuren/logik.ts:30` | `if (letzte && p.t <= letzte.t) return liste as Position[];` → `if (letzte && p.t < letzte.t) return lis` | anhaengen | rot |
| `client/src/features/spuren/logik.ts:42` | `.filter((p) => p.t > letzte)` → `.filter((p) => p.t >= letzte)` | zusammenfuehren | rot |
| `client/src/features/spuren/logik.ts:71` | `const i = pts.findIndex((p) => p.t >= altVor);` → `const i = pts.findIndex((p) => p.t > alt` | spurLinien | rot |

## client/src/features/status/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/status/logik.ts:19` | `> 1.05 / (l + 0.05) ? DUNKEL : HELL;` → `> 1.05 / (l + 0.05) ? HELL : DUNKEL;` | Schriftfarbe | rot |
| `client/src/features/status/logik.ts:32` | `return `${rufname}: ${inhalt \|\| 'Meldung'}`;` → `return `${rufname}: ${inhalt}`;` | meldungText | rot |

## client/src/features/taufe/darstellung.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/taufe/darstellung.ts:169` | `if (l.immer) {` → `if (false) {` | Namenskästchen | rot |
| `client/src/features/taufe/darstellung.ts:72` | `if (t.stoss === null \|\| istLinie(t.geometrie)) return null;` → `if (istLinie(t.geometrie)) return null;` | Anker | rot |

## client/src/features/taufe/geo.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/taufe/geo.ts:190` | `if (schonDa) return teile;` → `if (false) return teile;` | verlängern | rot |
| `client/src/features/taufe/geo.ts:169` | `while (grad(jetzt) === 2) {` → `while (grad(jetzt) >= 2) {` | läuft über die Kachelnaht | rot |
| `client/src/features/taufe/geo.ts:68` | `const b: XY = [ax + t1 * dx, ay + t1 * dy];` → `const b: XY = [bx, by];` | Linie endet genau | rot |

## client/src/features/taufe/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/taufe/familien.ts:9` | `export const GEBAEUDE_OHNE = ['underground', 'chimney', 'covered_bridg` → `export const GEBAEUDE_OHNE = ['chimney',` | Vektorkachel-Layer | rot |
| `client/src/features/taufe/familien.ts:13` | `export const VORRANG = ['building', 'waterway', 'transportation', 'wat` → `export const VORRANG = ['landuse', 'wate` | Vektorkachel-Layer | rot |
| `client/src/features/taufe/fassaden.ts:50` | `if (Math.abs(d) <= 45) return 'schwarz';` → `if (Math.abs(d) < 45) return 'schwarz';` | Normalen zeigen nach aussen | rot |
| `client/src/features/taufe/fassaden.ts:37` | `norm360(richtung + (aussenRechts ? 90 : -90))` → `norm360(richtung + (aussenRechts ? -90 :` | Normalen zeigen nach aussen | rot |
| `client/src/features/taufe/fassaden.ts:59` | `farbe: ueber.get(kante.i) ?? fassadeAus(kante.normale, t.stoss!)` → `farbe: fassadeAus(kante.normale, t.stoss` | umgefärbte Fassade | rot |

## client/src/features/wiedergabe/liste.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/wiedergabe/liste.ts:65` | `if (a.ich.rolle !== 'leitung' && x.an !== a.ich.id) return [];` → `if (false) return [];` | Bloodhound nur | rot |
| `client/src/features/wiedergabe/liste.ts:65` | `if (a.ich.rolle !== 'leitung' && x.an !== a.ich.id) return [];` → `if (x.an !== a.ich.id) return [];` | Bloodhound nur | rot |
| `client/src/features/wiedergabe/liste.ts:100` | `const inLv = (t: number) => fenster.some((f) => t >= f.von && t <= f.b` → `const inLv = (t: number) => true;` | nur LV | rot |
| `client/src/features/wiedergabe/liste.ts:92` | `if (z) return `${RASTER_NAME[art]} ${ansprache(z)}`;` → `if (z) return '';` | Rasterzelle | rot |
| `client/src/features/wiedergabe/liste.ts:136` | `const s = /^[=+\-@\t\r]/.test(roh) ? `'${roh}` : roh;` → `const s = /^[=+\-@]/.test(roh) ? `'${roh` | Formel-Injection | rot |
| `client/src/features/wiedergabe/liste.ts:136` | `const s = /^[=+\-@\t\r]/.test(roh) ? `'${roh}` : roh;` → `const s = roh;` | Formel-Injection | rot |

## client/src/features/wiedergabe/logik.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/wiedergabe/logik.ts:11` | `(p.phase === 'lv' ? [{ von: p.t, bis: phasen[i + 1]?.t ?? jetzt }] : [` → `(p.phase !== 'an' ? [{ von: p.t, bis: ph` | nur LV-Zeiträume | rot |
| `client/src/features/wiedergabe/logik.ts:114` | `if (spur[mitte].t <= t) lo = mitte;` → `if (spur[mitte].t < t) lo = mitte;` | letzte Position | rot |
| `client/src/features/wiedergabe/logik.ts:98` | `if (this.#i > 0 && this.#ereignisse[this.#i - 1].t > bis) {` → `if (false) {` | Stand zum Zeitpunkt | rot |

## client/src/features/wiedergabe/pdf.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/wiedergabe/pdf.ts:31` | `aus.push(w.slice(0, breite)); w = w.slice(breite);` → `aus.push(w.slice(0, breite + 1)); w = w.` | Wortgrenzen | rot |
| `client/src/features/wiedergabe/pdf.ts:12` | `'–': 0x96,` → `'–': 0x2d,` | gültiges Gerüst | rot |

## client/src/features/zeichnen/darstellung.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/zeichnen/darstellung.ts:101` | `features.push(linie(ps, { ...basis, strich: 'strichpunkt' }));` → `features.push(linie(ps, { ...basis, stri` | Linienarten | rot |
| `client/src/features/zeichnen/darstellung.ts:87` | `pfeil(achse(), l, 0.45 * l)` → `pfeil(achse(), l, 0)` | Spitze am letzten Punkt | rot |
| `client/src/features/zeichnen/darstellung.ts:129` | `data.set([r, g, b, 200], i);` → `data.set([r, g, b, 255], i);` | Räume | rot |
| `client/src/features/zeichnen/logik.ts:50` | `if (teil.farbe && s.fuellung === s.farbe) x.fuellung = teil.farbe;` → `if (false) x.fuellung = teil.farbe;` | Stil ändern | rot |
| `client/src/features/zeichnen/logik.ts:113` | `if (ps.length >= 2) zeilen.push(`Segment` → `if (ps.length >= 3) zeilen.push(`Segment` | Masse für Details | rot |

## client/src/features/zeichnen/geometrie.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/zeichnen/geometrie.ts:46` | `lasso.length >= 3 && punkte.length > 0 && punkte.every` → `lasso.length >= 3 && punkte.every` | Punkt in Polygon | rot |
| `client/src/features/zeichnen/geometrie.ts:82` | `if (geschlossen && punkte.length > 2) s += distanz(punkte.at(-1)!, pun` → `if (false) s += distanz(punkte.at(-1)!, ` | Fläche 1 km² | rot |
| `client/src/features/zeichnen/geometrie.ts:212` | `const k = Math.min(l, gesamt * 0.6);` → `const k = Math.min(l, gesamt * 0.8);` | lokal hin und zurück | rot |
| `client/src/features/zeichnen/geometrie.ts:225` | `const n = Math.max(1, Math.floor(l / a));` → `const n = Math.max(0, Math.floor(l / a))` | Zacken | rot |

## client/src/features/zeichnen/verlauf.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/zeichnen/verlauf.ts:25` | `if (stueck.length && (stueck.length >= MAX_ZEICHNUNGEN_JE_MSG \|\| gro` → `if (stueck.length && groesse + n > MAX_Z` | Stückelung | rot |
| `client/src/features/zeichnen/verlauf.ts:62` | `this.zurueck = [...this.zurueck, e].slice(-MAX_VERLAUF);` → `this.zurueck = [...this.zurueck, e].slic` | Reihenfolge | rot |
| `client/src/features/zeichnen/verlauf.ts:37` | `stueckeNachGroesse(zs).map((s) => ({ typ: 'zeichnung.neu', zeichnungen` → `stueckeNachGroesse(zs).map((s) => ({ typ` | behält den Ersteller | rot |
| `client/src/features/zeichnen/verlauf.ts:48` | `return v ? loeschen(e.zeichnungen) : neu(e.zeichnungen);` → `return v ? neu(e.zeichnungen) : loeschen` | neu/ändern/löschen | rot |

## client/src/features/zeichnen/werkzeuge.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/features/zeichnen/werkzeuge.ts:73` | `if (e.altKey) return null; const` → `if (false) return null; const` | Buchstaben laut Spec | rot |
| `client/src/features/zeichnen/werkzeuge.ts:85` | `'radio', 'range', 'color'` → `'radio', 'color'` | Eingabefeld erkennen | rot |

## client/src/lib/appVersion.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/appVersion.ts:16` | `angebot.versionCode > eigen` → `angebot.versionCode >= eigen` | Hinweis nur bei höherem versionCode | rot |
| `client/src/lib/appVersion.ts:11` | `\|\| versionCode < 1) return undefined;` → `) return undefined;` | liest nur gültige version.json | rot |

## client/src/lib/coords.parse.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/coords.ts:178` | `if (buchstaben.length === 0 && Math.abs(lat) > 90 && Math.abs(lon) <= ` → `(entfernt)` | WGS84 dezimal | rot |
| `client/src/lib/coords.ts:160` | `if (w.slice(1).some((x) => x >= 60)) return null;` → `if (w.slice(1).some((x) => x > 60)) retu` | Grad/Minuten/Sekunden | rot |
| `client/src/lib/coords.ts:121` | `if (zone < 1 \|\| zone > 60 \|\|` → `if (zone < 1 \|\| zone > 61 \|\|` | UTM: Varianten | rot |
| `client/src/lib/coords.ts:138` | `const lv03 = imBereich(o, 400_000, 900_000) && imBereich(n, 50_000, 35` → `const lv03 = false;` | LV03 | rot |

## client/src/lib/coords.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/coords.ts:207` | `return (((g * 6400) / 360) % 6400 + 6400) % 6400;` → `return ((g * 6400) / 360) % 6400;` | Nord 0°, Ost 90° | rot |
| `client/src/lib/coords.ts:213` | `if (Math.round(m) < 1000) return `${Math.round(m)} m`;` → `if (m < 1000) return `${Math.round(m)} m` | Formatierung | rot |
| `client/src/lib/coords.ts:45` | `return '–'; // Polargebiete: kein MGRS (UPS)` → `throw new Error('UPS');` | Polargebiet | rot |
| `client/src/lib/senden.ts:21` | `if (seit < MIN_ABSTAND_MS) return false;` → `if (seit <= MIN_ABSTAND_MS) return false` | sollSenden | rot |
| `client/src/lib/senden.ts:30` | `if (!online \|\| alterMs > (staleNach ?? STALE_MS)) return 'stale';` → `if (alterMs > (staleNach ?? STALE_MS)) r` | staleNach | rot |
| `client/src/lib/team.ts:22` | `einheit.trim().toLowerCase()` → `einheit.trim()` | deterministisch ohne Gross/Klein | rot |

## client/src/lib/labels.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/labels.ts:15` | `frei(l.unten) ? 'unten' : frei(l.oben) ? 'oben' : 'weg'` → `frei(l.unten) ? 'unten' : 'weg'` | bei Überlappung nach oben | rot |
| `client/src/lib/labels.ts:14` | `!hindernisse.some((x, j) => j !== i && schneidet(x, b))` → `!hindernisse.some((x) => schneidet(x, b)` | fremde Symbole sind Hindernisse | rot |

## client/src/lib/sonne.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/sonne.ts:22` | `sonnenHoehe(p, ms) > 0;` → `sonnenHoehe(p, ms) > 5;` | istTag | rot |
| `client/src/lib/sonne.ts:12` | `const e = (23.439 - 0.00000036 * d) * GRAD;` → `const e = (22.439 - 0.00000036 * d) * GR` | Höhe: Bern Sonnenwenden | rot |

## client/src/lib/speicher.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/speicher.ts:7` | `k.startsWith(p) && k !== p + lageId` → `k.startsWith(p)` | entfernt nur Lage-Schlüssel fremder Lagen | rot |

## client/src/lib/umgebung.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/umgebung.ts:11` | `(app ? server : origin).replace(/\/+$/, '')` → `(app ? origin : server).replace(/\/+$/, ` | App: fester Server | rot |

## client/src/lib/webUpdate.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/src/lib/webUpdate.ts:41` | `if (typeof url !== 'string' \|\| url !== `/app/web-${webCode}.zip`) re` → `if (typeof url !== 'string') return unde` | liest ein gültiges Manifest | rot |
| `client/src/lib/webUpdate.ts:50` | ``lagebild-web\|${m.webCode}\|${m.minNativeCode}\|${m.protokoll}\|${m.s` → ``lagebild-web\|${m.webCode}\|${m.minNati` | Nachricht bindet Stand | rot |
| `client/src/lib/webUpdate.ts:50` | ``lagebild-web\|${m.webCode}\|${m.minNativeCode}\|${m.protokoll}\|${m.s` → ``lagebild-web\|${m.webCode}\|${m.minNati` | jedes manipulierte Feld | rot |
| `client/src/lib/webUpdate.ts:58` | `return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }` → `return await crypto.subtle.verify({ name` | Format wie deploy/siegel.mjs | rot |
| `client/src/lib/webUpdate.ts:68` | `if (!m \|\| !Number.isFinite(nativ) \|\| m.webCode <= laufend) return ` → `if (!m \|\| !Number.isFinite(nativ) \|\|` | lädt nur neuere Stände | rot |
| `client/src/lib/webUpdate.ts:77` | `a.stufe !== 'normal' \|\| uebersprungen === undefined \|\| a.webCode >` → `uebersprungen === undefined \|\| a.webCo` | zeigen: überspringbar nur Stufe normal | rot |
| `client/src/lib/webUpdate.ts:149` | `if (laedt \|\| bereit) return;` → `(entfernt)` | gesiegelter Stand wird einmal geladen | rot |
| `client/src/lib/webUpdate.ts:143` | `if (bundles.some((b) => b.id === g.id && b.status === 'pending' && b.v` → `if (bundles.some((b) => b.id === g.id))` | Neustart: geladener Stand | rot |
| `client/src/lib/webUpdate.ts:156` | `if (!(await siegelGueltig(m, u.schluessel))) return void console.warn` → `if (false) return void console.warn` | ohne gültiges Siegel | rot |
| `client/src/lib/webUpdate.ts:174` | `if (bereit?.stufe !== 'normal') return;` → `if (!bereit) return;` | Überspringen (normal) | rot |

## client/uiSkala.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `client/uiSkala.ts:14` | `const einheit = prop === 'font-size' \|\| prop === 'font' ? '--s' : '-` → `const einheit = '--u';` | rechnet Masse | rot |
| `client/uiSkala.ts:9` | `const FIX_PROP = /^(border(?!-radius)\|outline\|box-shadow\|text-shado` → `const FIX_PROP = /^(border(?!-radius)\|o` | rechnet Masse | rot |

## server/test/app.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `server/src/sicherheit.ts:87` | `if (!origin \|\| !APP_ORIGINS.has(origin)) return {};` → `if (!origin) return {};` | nur App-Ursprünge | rot |
| `server/src/http.ts:369` | `if (req.method === 'OPTIONS' && cors['Access-Control-Allow-Origin'] &&` → `if (req.method === 'OPTIONS' && (` | nur App-Ursprünge | rot |
| `server/src/http.ts:325` | `const bundle = /^\/app\/web-\d{1,12}\.zip$/.test(pfad);` → `const bundle = /^\/app\/web-.+\.zip$/.te` | web.json | rot |
| `server/src/http.ts:326` | `if (!apk && !bundle && pfad !== '/app/version.json' && pfad !== '/app/` → `(entfernt)` | version.json und APK | rot |

## server/test/bloodhound.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `server/src/ws.ts:152` | `for (const e of verbindungen(lageId)) if (empfaengt(d, e)) senden(e.ws` → `for (const e of verbindungen(lageId)) se` | Unbeteiligte | rot |
| `server/src/ws.ts:87` | `.filter((m) => meldungSichtbar(m, v)),` → `,` | Unbeteiligte | rot |

## server/test/phasen.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `server/src/db.ts:37` | `phasen: beendetAm == null ? [lv] : [lv, { phase: 'an', t: beendetAm }]` → `phasen: [lv]` | mitPhasen | rot |

## server/test/raster.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `shared/protocol.ts:304` | `if (Math.max(r.zeilen, r.spalten) * r.zellM > RASTER_MAX_AUSDEHNUNG_M)` → `if (false)` | Vertrag | rot |
| `server/src/ws.ts:85` | `raster: db.eintraege(lage.id, 'raster'),` → `raster: [],` | je Art ein Raster | rot |

## server/test/rest.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `server/src/http.ts:201` | `teilnehmerCode: neuerCode(8), leitungCode: neuerCode(10)` → `teilnehmerCode: neuerCode(7), leitungCod` | Codes ohne verwechselbare Zeichen | rot |
| `server/src/http.ts:200` | `phasen: [{ phase: e.phase ?? 'lv', t: jetzt }]` → `phasen: [{ phase: 'lv', t: jetzt }]` | Codes ohne verwechselbare Zeichen | rot |
| `server/src/http.ts:198` | `if (!gleich(e.erstellPasswort, o.erstellPasswort)) throw new HttpFehle` → `(entfernt)` | falsches Passwort 403 | rot |
| `server/src/http.ts:127` | `const limitErstellen = rateLimiter(10, 60_000);` → `const limitErstellen = rateLimiter(100, ` | falsches Passwort 403 | rot |
| `server/src/sicherheit.ts:74` | `const ip = vertraut.has(socket) && typeof cf === 'string'` → `const ip = typeof cf === 'string'` | falsches Passwort 403 | rot |
| `server/src/http.ts:214` | `throw new HttpFehler(403, 'Code ungültig');` → `throw new HttpFehler(401, 'Code ungültig` | Code bestimmt die Rolle | rot |
| `server/src/http.ts:213` | `limitBeitreten(schluessel);` → `(entfernt)` | Rate-Limit je IP zählt nur falsche Codes | rot |
| `server/src/http.ts:209` | `if (!limitBeitreten.frei(schluessel)) throw` → `if (!limitBeitreten(schluessel)) throw` | Rate-Limit je IP zählt nur falsche Codes | rot |
| `server/src/http.ts:217` | `.length >= MAX_TEILNEHMER_JE_LAGE) throw` → `.length > MAX_TEILNEHMER_JE_LAGE) throw` | Teilnehmer-Kontingent | rot |
| `server/src/http.ts:141` | `if (nurLeitung && gefunden.teilnehmer.rolle !== 'leitung') throw new H` → `(entfernt)` | Bearer-Pflicht | rot |
| `server/src/http.ts:130` | `const limitFoto = rateLimiter(10, 60_000);` → `const limitFoto = rateLimiter(100, 60_00` | Foto-Upload: Rate-Limit | rot |
| `server/src/http.ts:243` | `if (phaseVon(lage) === 'ap') throw new HttpFehler(409, 'Fotos erst in ` → `(entfernt)` | Foto-Upload: Rate-Limit | rot |
| `server/src/http.ts:56` | `if (b.length >= 8 && b.subarray(0, 8).equals(` → `if (b.length >= 80 && b.subarray(0, 8).e` | Foto-Upload: Rate-Limit | rot |
| `server/src/http.ts:360` | `res.setHeader('X-Content-Type-Options', 'nosniff');` → `(entfernt)` | Sicherheits-Header | rot |
| `server/src/http.ts:343` | `if (datei !== clientDir && !datei.startsWith(clientDir + sep)) throw n` → `(entfernt)` | Sicherheits-Header | rot |
| `server/src/http.ts:140` | `if (!gefunden \|\| !lage) throw new HttpFehler(401, 'Nicht angemeldet'` → `if (!gefunden \|\| !lage) throw new Http` | Bearer-Pflicht | rot |

## server/test/sicherheit.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `server/src/sicherheit.ts:74` | `const ip = vertraut.has(socket) && typeof cf === 'string'` → `const ip = typeof cf === 'string'` | CF-Connecting-IP | rot |
| `server/src/sicherheit.ts:64` | `return `${gruppen.slice(0, 4)` → `return `${gruppen.slice(0, 3)` | CF-Connecting-IP | rot |
| `server/src/sicherheit.ts:45` | `return ++z.n <= max;` → `return ++z.n < max;` | zählt je Schlüssel | rot |
| `server/src/sicherheit.ts:35` | `return zaehler.size < maxSchluessel;` → `return true;` | zählt je Schlüssel | rot |

## server/test/taufe.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `shared/protocol.ts:57` | `gebaeude: ['Gold', 'Copper',` → `gebaeude: ['Gold', 'Tango',` | Vorgabelisten | rot |
| `shared/protocol.ts:250` | `stoss: z.number().min(0).lt(360).nullable(),` → `stoss: z.number().min(0).nullable(),` | Geometrien und Grenzen | rot |
| `server/src/ws.ts:83` | `taufen: db.eintraege(lage.id, 'taufe'),` → `taufen: [],` | Taufe geht an alle | rot |
| `shared/regeln/taufe.ts:36` | `(zuwachs: number) => zuwachs <= 0 \|\|` → `(zuwachs: number) => true \|\|` | Grössenbudget | rot |

## server/test/ws.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `server/src/ws.ts:99` | `ws.close(4001, 'unbekannt oder beendet');` → `ws.close(4000, 'unbekannt oder beendet')` | hallo liefert Snapshot | rot |
| `server/src/ws.ts:228` | `if (!p.success) return fehler(v, 'Ungültige Nachricht');` → `if (!p.success) return;` | ungültige Nachrichten | rot |
| `server/src/ws.ts:13` | `const MAX_VERBINDUNGEN_JE_TEILNEHMER = 3;` → `const MAX_VERBINDUNGEN_JE_TEILNEHMER = 4` | Limits gelten je Teilnehmer | rot |
| `server/src/ws.ts:15` | `const MAX_OHNE_HALLO_JE_IP = 20;` → `const MAX_OHNE_HALLO_JE_IP = 25;` | Limits gelten je Teilnehmer | rot |
| `server/src/regeln.ts:43` | `db.spurAnhaengen(lageId, a.id, a.pos);` → `(entfernt)` | pos: verteilt | rot |
| `server/src/ws.ts:151` | `if (d.typ === 'chat' \|\| d.typ === 'meldung') {` → `if (d.typ === 'meldung') {` | Chat geht nur an Empfänger | rot |
| `server/src/ws.ts:79` | `.filter((c) => sichtbar(c, ich)).slice(-500)` → `.slice(-500)` | Chat geht nur an Empfänger | rot |
| `server/src/ws.ts:56` | `({ ...t, online: istOnline(lageId, t.id) });` → `({ ...t, online: true });` | Status: Teilnehmer-Delta | rot |
| `server/src/ws.ts:150` | `if (d.typ === 'teilnehmer.weg') rauswerfen(lageId, d.id);` → `(entfernt)` | Teilnehmer entfernen: Verbindung beendet | rot |
| `server/src/http.ts:141` | `if (nurLeitung && gefunden.teilnehmer.rolle !== 'leitung') throw new H` → `(entfernt)` | Teilnehmer entfernen: Verbindung beendet | rot |
| `server/src/http.ts:216` | `if (phaseVon(gefunden.lage) === 'an') throw new HttpFehler(410, 'Lage ` → `(entfernt)` | AN: alle bleiben verbunden | rot |
| `server/src/ws.ts:41` | `const limitAlarme = rateLimiter(10, 60_000);` → `const limitAlarme = rateLimiter(100, 60_` | Alarm: an alle | rot |
| `server/src/ws.ts:86` | `alarme: db.eintraege(lage.id, 'alarm').filter((a) => a.aufgehobenAm ==` → `alarme: [],` | Alarm: an alle | rot |
| `server/src/http.ts:252` | `if (!ext) throw new HttpFehler(415, 'Nur JPEG, PNG oder WebP');` → `(entfernt)` | Foto: nur Bildformate | rot |
| `server/src/http.ts:29` | `const MAX_FOTO = 2 * 1024 * 1024;` → `const MAX_FOTO = 3 * 1024 * 1024;` | Foto: nur Bildformate | rot |
| `server/src/http.ts:267` | `if (!f \|\| f.lageId !== lage.id) throw new HttpFehler(404, 'Foto nich` → `if (!f) throw new HttpFehler(404, 'Foto ` | Foto: nur Bildformate | rot |
| `server/src/ws.ts:163` | `if (t.rolle !== 'leitung') return fehler(v, 'Nur für die Leitung');` → `(entfernt)` | Teilnehmer-Code erneuern | rot |
| `server/src/http.ts:293` | `ereignisse: ereignisse.filter(sieht), weiter` → `ereignisse, weiter` | Deltas mit Zeit und Autor | rot |
| `server/src/http.ts:289` | `const alt = seit < erst ? ausBestand(lage)` → `const alt = false ? ausBestand(lage)` | Deltas mit Zeit und Autor | rot |
| `server/src/http.ts:188` | `while (n > 0 && liste[n - 1].t === liste[max].t) n--;` → `(entfernt)` | seitenweise | rot |
| `server/src/http.ts:132` | `const limitProtokoll = rateLimiter(6, 60_000);` → `const limitProtokoll = rateLimiter(60, 6` | seitenweise | rot |
| `server/src/ws.ts:135` | `if (bisher + daten.length <= MAX_PROTOKOLL_ZEICHEN_JE_LAGE) {` → `if (true) {` | voll: nichts mehr aufzeichnen | rot |
| `shared/export.ts:8` | `'&': '&amp;',` → `'&': '&',` | GPX | rot |
| `server/src/http.ts:310` | `await rm(join(fotoDir, lage.id), { recursive: true, force: true });` → `(entfernt)` | Lage löschen entfernt Daten | rot |
| `server/src/ws.ts:167` | `return senden(v.ws, { typ: 'code', teilnehmerCode });` → `return anAlle(lage.id, { typ: 'code', te` | Teilnehmer-Code erneuern | rot |

## server/test/zeichnen.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `shared/protocol.ts:202` | `if (z_.art === 'kreis' ? z_.radiusM === undefined : z_.radiusM !== und` → `if (false) f('radiusM'` | je Art | rot |
| `shared/protocol.ts:387` | `zeichnungen: z.array(ZeichnungInput).min(1).max(MAX_ZEICHNUNGEN_JE_MSG` → `zeichnungen: z.array(ZeichnungInput).min` | Grenzen | rot |
| `server/src/ws.ts:82` | `zeichnungen: db.eintraege(lage.id, 'zeichnung'),` → `zeichnungen: [],` | Snapshot mit Standard-Ebene | rot |
| `shared/regeln/zeichnen.ts:62` | `if (zuwachs > 0 && z.groesse('zeichnung') + zuwachs > MAX_ZEICHNUNGEN_` → `if (false)` | Grössenbudget | rot |
| `shared/export.ts:78` | `trks += ` <trk><name>${xml(zname(z))}</name>` → `wpts += ` <trk><name>${xml(zname(z))}</n` | Export enthält Zeichnungen | rot |

## shared/raster.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `shared/raster.ts:51` | `spalte >= r.spalten \|\| zeile >= r.zeilen) return null;` → `spalte > r.spalten \|\| zeile > r.zeilen` | Ränder | rot |
| `shared/raster.ts:54` | `quadrant: unten ? (rechts ? 'D' : 'C') : rechts ? 'B' : 'A'` → `quadrant: unten ? (rechts ? 'D' : 'C') :` | Quadranten | rot |
| `shared/raster.ts:61` | `const dx = q < 0 ? 0.5 : q % 2 ? 0.75 : 0.25;` → `const dx = 0.5;` | Mitte der Zelle | rot |

## shared/regeln/ablaeufe.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `shared/regeln/lage.ts:41` | `if (!t.sendetPos && !aktiveAlarme(z, t.id).length) return l.fertig();` → `(entfernt)` | Emission Control | rot |
| `shared/regeln/lage.ts:39` | `< POS_MIN_ABSTAND_MS) return l.fertig();` → `<= POS_MIN_ABSTAND_MS) return l.fertig()` | Positionsrate | rot |
| `shared/regeln/lage.ts:93` | `for (const alt of aktiveAlarme(z, t.id)) {` → `for (const alt of [] as Alarm[]) {` | ein neuer Alarm ersetzt | rot |
| `shared/regeln/lage.ts:52` | `if (m.status !== t.status && !lage.statusSet.some(` → `if (!lage.statusSet.some(` | Status nur aus dem Set | rot |
| `shared/regeln/bloodhound.ts:56` | `erreicht: 'Bloodhound-Ziel erreicht' }[ende], null, [a.an]);` → `erreicht: 'Bloodhound-Ziel erreicht' }[e` | Bloodhound-Meldungen gehen nur an den Empfänger | rot |
| `shared/regeln/lage.ts:136` | `beendeAuftraege(l, jetzt, anIhn, 'Empfänger entfernt');` → `(entfernt)` | Teilnehmer entfernen beendet | rot |
| `shared/regeln/lage.ts:73` | `beendeAuftraege(l, jetzt, auftraege, 'Marker gelöscht');` → `(entfernt)` | Marker löschen hebt | rot |
| `shared/regeln/sichtbar.ts:10` | `if (c.an.art === 'einheit') return c.an.einheit === empfaenger.einheit` → `if (c.an.art === 'einheit') return true;` | Chat nach Empfänger | rot |
| `shared/regeln/sichtbar.ts:14` | `!m.nur \|\| e.rolle === 'leitung' \|\| m.nur.includes(e.id)` → `!m.nur \|\| m.nur.includes(e.id)` | Chat nach Empfänger | rot |

## shared/regeln/phase.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `shared/regeln/phase.ts:29` | `return AP.has(typ) ? undefined : nein('In der Aktionsplanung nicht mög` → `return undefined;` | AP: planen ja | rot |
| `shared/regeln/phase.ts:40` | `if (!WECHSEL[alt].includes(m.phase))` → `if (false)` | Wechsel nur durch die Leitung | rot |
| `shared/regeln/phase.ts:42` | `if (alt === 'lv') {` → `if (alt === 'ap') {` | LV verlassen | rot |
| `shared/regeln/phase.ts:30` | `return AN.has(typ) ? undefined : nein('Nachbearbeitung: nur lesen');` → `return undefined;` | AN: nur lesen | rot |
| `shared/regeln/phase.ts:56` | `if (m.t > jetzt) return nein('Zeitpunkt liegt in der Zukunft');` → `(entfernt)` | AN: nur lesen | rot |

## shared/regeln/rechte.test.ts

| Produktivcode | Mutation | roter Test | Ergebnis |
|---|---|---|---|
| `shared/regeln/raster.ts:24` | `if (alt?.fixiert) return nein(`${name} ist fixiert` → `if (false) return nein(`${name} ist fixi` | Teilnehmende legen auf und fixieren | rot |
| `shared/regeln/raster.ts:32` | `if (alt.fixiert === m.fixiert) return l.fertig();` → `(entfernt)` | gleicher Fixier-Zustand | rot |
| `shared/regeln/taufe.ts:42` | `if (!nameFrei(taufen, m.taufe.name)) return nein(vergeben(m.taufe.name` → `(entfernt)` | Namen je Lage eindeutig | rot |
| `shared/regeln/taufe.ts:56` | `aenderung.geometrie && !aenderung.fassaden ? { fassaden: [] } : {}` → `{}` | neue Geometrie verwirft Fassaden | rot |
| `shared/regeln/taufe.ts:70` | `if (t.rolle !== 'leitung') return nein('Nur für die Leitung');` → `(entfernt)` | Namenslisten: nur Leitung | rot |
| `shared/regeln/zeichnen.ts:53` | `if (alte.some((a) => a.id === x.id)) return nein('Zeichnung doppelt');` → `if (alte.some((a) => a.id === x.id)) ret` | fremde Zeichnung | rot |
| `shared/regeln/zeichnen.ts:41` | `von: leitung && x.von ? x.von : t.id` → `von: x.von ?? t.id` | fremde Zeichnung | rot |
| `shared/regeln/zeichnen.ts:27` | `if (x.gesperrt && !leitung) return` → `if (false) return` | gesperrte Ebene | rot |
| `shared/regeln/zeichnen.ts:106` | `if (m.id === standardEbeneId(z.lage.id)) return nein('Die Standard-Ebe` → `(entfernt)` | alles oder nichts | rot |
| `shared/regeln/lage.ts:59` | `if (alt && alt.von !== t.id && !leitung) return nein('Keine Berechtigu` → `(entfernt)` | fremder Marker | rot |
| `shared/regeln/lage.ts:131` | `if (m.id === t.id) return nein('Sich selbst entfernen ist nicht möglic` → `(entfernt)` | nur die Leitung | rot |
| `shared/regeln/lage.ts:115` | `if (alarm.von !== t.id && !leitung) return nein('Nur Auslöser oder Lei` → `(entfernt)` | Alarm aufheben | rot |
| `shared/regeln/bloodhound.ts:49` | `} else if (a.an !== t.id) return nein(` → `} else if (a.an === 'niemand') return ne` | Bloodhound: Ziel und Empfänger | rot |
| `shared/regeln/bloodhound.ts:35` | `if (!vorhanden) return nein('Ziel nicht gefunden');` → `(entfernt)` | Bloodhound: Ziel und Empfänger | rot |

