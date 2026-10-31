# Feature-Slots

Jedes Feature lebt in `features/<id>/` und exportiert in `index.ts` default ein `Feature` (Typ in `registry.ts`).
Nur im eigenen Ordner arbeiten; `registry.ts`, `lib/` und `components/` gehören dem Client-Kern.

```ts
const feature: Feature = {
  id: 'marker', label: 'Marker', icon: ikon('<path d="…"/>'), // 24×24-Strich-SVG, siehe ikon()
  Panel,        // Panel (hoch: Sheet unten, quer: Seitenpanel) bei istOffen(id); Props { params } aus oeffne(id, params). Ohne Panel kein Knopf in der Werkzeugleiste.
  MapLayer,     // nach Karten-Load gemountet (ab Login), zeichnet via getMap(); in onDestroy aufräumen
  Toolbar,      // schwebender Schnellknopf rechts (z.B. Status); ersetzt den Knopf in der Werkzeugleiste
  Kopf,         // Knopf in der Kopfleiste, immer erreichbar (Alarm); ersetzt den Knopf in der Werkzeugleiste
  Detail, detailArt: 'marker', // Detail-Sheet bei ui.auswahl = { art: detailArt, id }
  nurLeitung,   // Knopf nur für die Leitung
  phasen,       // Knöpfe/Panel nur in diesen Phasen (Spec v6, z.B. ['lv']); Kartenlayer laufen immer. Radial-Aktionen ebenso: `phasen`
  badge: () => n, // Zähler am Knopf, reaktiv gelesen (z.B. ungelesen)
  haupt: { aktion?, Knopf? }, // Bedienung «Daumen-Ränder»: fest sichtbare Hauptaktion statt Eintrag im Mehr-Menü
  ebenen: () => [{ label, an, schalten }], // Schalter in der Ebenen-Auswahl unter der Überschrift `label` (z.B. Führungsraster)
};
```

## Bedienung «Klassisch» / «Daumen-Ränder» (Spec v3)

`store.einstellungen.bedienung` wählt die Anordnung; App rendert die klassische Leiste oder `components/Daumen.svelte`.
Panels, Details, Radial-Menü und Fadenkreuz sind in beiden gleich.

- Hauptaktionen (Status, Marker, Sichtung, Chat, Alarm) setzen `haupt`. Ohne `aktion` schaltet der Knopf das Panel;
  `aktion` ersetzt das Öffnen (Marker/Sichtung: Fadenkreuz zuerst), `Knopf` den ganzen Knopf (Status mit Farbe, Alarm halten).
  Wo die Knöpfe sitzen (quer links/rechts, hoch im Dock), legt `Daumen.svelte` fest.
- Alle übrigen Features mit `Panel` landen im Mehr-Menü, dazu Teilnehmende und Einstellungen.
- Melden geht ohne Tastatur: Chips (`.chips`, `aria-pressed`) mit Vorgaben, Freitext eingeklappt hinter «+ Text».

## lib/store.svelte.ts – Lage und Verbindung

- `store`: `lage`, `ich` (eigene ID), `ichSelbst`, `istLeitung`, `teilnehmer`/`marker`/`sichtungen`/`alarme` (SvelteMap nach ID), `chat`, `meldungen`, `verbindung`, `meinePos` (Live-GPS), `gpsFehler`, `einstellungen`, `jetzt` (tickt 5 s), `meinAlarmAktiv`.
- `send(msg: ClientMsg): boolean` – false ohne Verbindung (nichts gepuffert, Toast selbst zeigen). Nach `status`, `alarm.ausloesen` und `sendetPos:true` sendet der Kern die eigene Position sofort mit.
- `sendeBestaetigt(msg, echo)` – wartet auf das Echo des Servers: `'bestaetigt' | 'abgelehnt' | 'unbestaetigt'`. Für alles, was nicht still verloren gehen darf (Alarm, Status, Chat): Erfolg/Text leeren erst bei `'bestaetigt'`, bei `'unbestaetigt'` `OHNE_QUITTUNG` zeigen.
- `meinePosZumSenden()` – eigene Position inkl. `staleNach`, z.B. für `alarm.ausloesen.pos`. `sendePosJetzt()` – Position sofort senden.
- `beiNachricht(cb)` – Hörer nach jeder Servernachricht (Vibration, Ungelesen …), gibt Abmeldefunktion zurück.
- `api(pfad, init)` – fetch mit Bearer, wirft `Error` mit lesbarer Meldung; `postJson(pfad, body)`.
- `statusDef(key)`, `frische(t)` (`aktiv|stale|geist`), `keinGps(t)`, `alterMs(t)`, `formatAlter(ms)`, `serverJetzt()`.

## lib/ui.svelte.ts – UI-Zustand

- Panels: bis zu zwei gleichzeitig (ab 1100 px Breite im Querformat), sonst eines. `ui.panels` (Anzeigereihenfolge), `ui.oben` (zuletzt geöffnet/bedient).
- `oeffne(featureId, params?)`: schon offen → nur params ersetzen; aus einem Panel heraus geöffnet → ersetzt dieses (Drill-down); sonst daneben, falls Platz, andernfalls ersetzt es das ältere.
- `waehle(art, id)`: Detail-Panel (`DETAIL`, params `{ art, id }`), es gibt höchstens eines.
- `schliesse(id?)`: ohne ID das oberste Panel (das, in dem zuletzt getippt wurde), `schliesseAlle()`.
- `istOffen(id)` statt `ui.panel?.id === id` (ein Panel kann auch das zweite sein). `ui.panel` (oberstes Feature-Panel) und `ui.auswahl` (Detail) bleiben als Nur-Lese-Getter für v1-Code.
- `ui.folgen` (eigene Position), `ui.folgtTeilnehmer`, `ui.radial`, `ui.koordinate` (Koordinaten-Karte), `toast(text, ms?, { label, aktion }?)` (optional mit Knopf), `ikon(svgInhalt)`, `lies/schreibe` (localStorage, fehlertolerant).

Konventionen für `params`: Chat `{ an: ChatZiel }`, Range & Bearing `{ ziel: { art: 'teilnehmer' | 'marker' | 'sichtung' | 'punkt', id?, punkt? } }`.

## lib/map.ts – Karte

`getMap()` (in MapLayer sicher), `onMapReady(cb)`, `kartenMitte()`, `zentriere(p, zoom?)`, `folgeMir()`, `folgeTeilnehmer(id)`, `waehlePunkt(hinweis, knopf = 'Übernehmen', extra?): Promise<Punkt | null>` (Fadenkreuz, Panels werden ausgeblendet; `extra = { label, aktion }` als zusätzlicher Knopf, z.B. «Rasterposition»), `markierePunkt(p)` → Entfernen-Funktion (Ring am Kartenpunkt).

### Radial-Menü (Langdruck/Rechtsklick auf ein Symbol oder die leere Karte)

```ts
const ab = registriereRadialAktion({
  fuer: 'teilnehmer',                       // oder Liste: ['teilnehmer', 'marker', 'sichtung', 'ich', 'zeichnung', 'punkt']
  label: 'Bloodhound',                      // oder (ziel) => string, reaktiv gelesen
  icon: ikon('<path d="…"/>'),
  aktion: (ziel) => …,                      // ziel = { art, id }; für 'ich' ist id die eigene Teilnehmer-ID
  sichtbar: (ziel) => store.istLeitung,     // optional, reaktiv (Rechte, Zustand)
});
onDestroy(ab);
```

- Höchstens `MAX_RADIAL` (8) Knöpfe; Reihenfolge = Anmeldung, der Kern meldet zuerst an (Details, R&B, Koord., Folgen, Spur, Chat, Marker hier, Bearbeiten, Löschen, Koordinate). Spätere Knöpfe fallen bei Überlauf weg.
- **Leere Karte** = Ziel `{ art: 'punkt', id: '', punkt }`: Langdruck/Rechtsklick ohne Symbol darunter. Der Kern bringt «Koordinate» (Karte mit LV95/MGRS/WGS84 zum Kopieren), Features melden ihren Eintrag mit `fuer: 'punkt'` an und lesen `ziel.punkt` (heute Marker hier, Sichtung hier, R&B, Bloodhound).
- DOM-Symbole (MapLibre-`Marker`) mit `markiereZiel(element, { art, id })` kennzeichnen: dann öffnen Rechtsklick/Langdruck den Ring und Doppelklick die Details (`detailArt` des Features).
- Ziele im WebGL-Layer (Zeichnungen): `registriereTreffer((punkt) => ziel | null)` – bekommt Kartenpixel wie `MapMouseEvent.point`, z.B. `queryRenderedFeatures`. Eigene Gesten können `oeffneRadial(ziel, clientX, clientY)` rufen.
- Esc schliesst Ring → Koordinaten-Karte → Punktwahl → oberstes Panel. Ein Werkzeug mit eigenem Esc ruft `preventDefault()` im eigenen keydown-Hörer (Capture), dann greift der Kern nicht.

## Weitere Helfer

- `lib/symbol.ts`: `symbolSvg(sidc, opts)`, `symbolElement(sidc, opts)` → `{ element, offset }` für `new Marker({ element, offset })`, `mitZugehoerigkeit`, `funktionLabel`, `STANDARD_SIDC`.
- `lib/SymbolPicker.svelte`: `<SymbolPicker value={sidc} onchange={(s) => …} />`.
- `lib/coords.ts`: `formatLv95/formatMgrs/formatWgs84/formatKoord`, `distanz`, `azimut`, `promille`, `formatDistanz`, `formatRichtung`, `versetze`, `kreis`.
- `lib/team.ts`: `teamFarbe(einheit)` (ATAK-Teamfarbe, z.B. für Spuren je Einheit).
- `features/raster/zustand.svelte.ts`: `rasterAnsprache(punkt)` → «Grande H 09 C · Piccolo B 03 A» oder `null` (nur fixierte Raster), `rasterAnsprachen(punkt)` als Liste. Geometrie/Ansprache rein in `shared/raster.ts`.
- `lib/Platzhalter.svelte`: Stub-Panel.
- `lib/kachelspeicher.ts`: swisstopo-Kacheln für eigene Quellen immer als `tiles: [lokal(url)]` angeben (MapLibre-Protokoll `kachel://`), dann kommen sie zuerst aus den Offline-Gebieten. Vektorkacheln der Taufe: `lokal(TAUFE_VT.vorlage)` (`lib/karten.ts`).

Stil: globale Klassen aus `app.css` (`button.primaer`, `button.gefahr`, `button.icon`, `.segmente`, `.chips`, `.gruppe-titel`, `.rand-knopf`, `label.feld`, `.mono`, `.leise`), Farben nur über Tokens (`--accent`, `--danger`, `--warn`, `--ok`, `--surface`, `--line`, `--text`; auf der Karte `--karte-bg`/`--karte-text`), weil `data-thema` nach Sonnenstand zwischen Nacht (dunkel-taktisch) und Tag (hell) wechselt. Touch-Ziele ≥ 48 px (`--touch`), Hauptaktionen ≥ 56 px (`--haupt`).

**Bediengrösse:** px in Stilen sind Design-Pixel. Der Build (`client/uiSkala.ts`) macht daraus Vielfache von `--u` (Masse) bzw. `--s` (Schriftgrössen), die `lib/groesse.svelte.ts` je nach Einstellung und Touch setzt. Ausgenommen: Werte ≤ 1px, `border`/`outline`/Schatten und Werte, die selbst `var(--u)`, `var(--s)` oder `var(--karte)` enthalten (so bleibt etwas bewusst fix, z.B. `min(calc(44 * var(--u)), 56px)`). Inline-Styles und JS-Grössen skaliert der Build nicht: dort `groesse.ui` (Bedienelemente) bzw. `groesse.karte` (Symbole und Beschriftungen auf der Karte) multiplizieren. Feste Breiten mit `min(…, 100vw)` begrenzen, Grid-Spalten mit langem Text als `minmax(0, 1fr)`.
