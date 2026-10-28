# Feature-Slots

Jedes Feature lebt in `features/<id>/` und exportiert in `index.ts` default ein `Feature` (Typ in `registry.ts`).
Nur im eigenen Ordner arbeiten; `registry.ts`, `lib/` und `components/` gehören dem Client-Kern.

```ts
const feature: Feature = {
  id: 'marker', label: 'Marker', icon: ikon('<path d="…"/>'), // 24×24-Strich-SVG, siehe ikon()
  Panel,        // Bottom-Sheet bei ui.panel.id === id; Props { params } aus oeffne(id, params). Ohne Panel kein Knopf unten.
  MapLayer,     // nach Karten-Load gemountet (ab Login), zeichnet via getMap(); in onDestroy aufräumen
  Toolbar,      // schwebender Schnellknopf rechts (z.B. Status); ersetzt den Knopf in der Werkzeugleiste
  Kopf,         // Knopf in der Kopfleiste, immer erreichbar (Alarm); ersetzt den Knopf in der Werkzeugleiste
  Detail, detailArt: 'marker', // Detail-Sheet bei ui.auswahl = { art: detailArt, id }
  nurLeitung,   // Knopf nur für die Leitung
  badge: () => n, // Zähler am Knopf, reaktiv gelesen (z.B. ungelesen)
};
```

## lib/store.svelte.ts – Lage und Verbindung

- `store`: `lage`, `ich` (eigene ID), `ichSelbst`, `istLeitung`, `teilnehmer`/`marker`/`sichtungen`/`alarme` (SvelteMap nach ID), `chat`, `meldungen`, `verbindung`, `meinePos` (Live-GPS), `gpsFehler`, `einstellungen`, `jetzt` (tickt 5 s), `meinAlarmAktiv`.
- `send(msg: ClientMsg): boolean` – false ohne Verbindung (nichts gepuffert, Toast selbst zeigen). Nach `status`, `alarm.ausloesen` und `sendetPos:true` sendet der Kern die eigene Position sofort mit.
- `sendeBestaetigt(msg, echo)` – wartet auf das Echo des Servers: `'bestaetigt' | 'abgelehnt' | 'unbestaetigt'`. Für alles, was nicht still verloren gehen darf (Alarm, Status, Chat): Erfolg/Text leeren erst bei `'bestaetigt'`, bei `'unbestaetigt'` `OHNE_QUITTUNG` zeigen.
- `meinePosZumSenden()` – eigene Position inkl. `staleNach`, z.B. für `alarm.ausloesen.pos`. `sendePosJetzt()` – Position sofort senden.
- `beiNachricht(cb)` – Hörer nach jeder Servernachricht (Vibration, Ungelesen …), gibt Abmeldefunktion zurück.
- `api(pfad, init)` – fetch mit Bearer, wirft `Error` mit lesbarer Meldung; `postJson(pfad, body)`.
- `statusDef(key)`, `frische(t)` (`aktiv|stale|geist`), `keinGps(t)`, `alterMs(t)`, `formatAlter(ms)`, `serverJetzt()`.

## lib/ui.svelte.ts – UI-Zustand

`oeffne(featureId, params?)`, `schliesse()`, `waehle(art, id)` (Detail-Sheet), `ui.panel`, `ui.auswahl`, `toast(text, ms?)`, `ikon(svgInhalt)`, `lies/schreibe` (localStorage, fehlertolerant).

Konventionen für `params`: Chat `{ an: ChatZiel }`, Range & Bearing `{ ziel: { art: 'teilnehmer' | 'marker' | 'sichtung' | 'punkt', id?, punkt? } }`.

## lib/map.ts – Karte

`getMap()` (in MapLayer sicher), `onMapReady(cb)`, `zentriere(p, zoom?)`, `waehlePunkt(hinweis): Promise<Punkt | null>` (Fadenkreuz, Sheet wird ausgeblendet), `registriereKontextAktion({ label, aktion(p), nurLeitung? })` → Abmeldefunktion (Langdruck-Menü).

## Weitere Helfer

- `lib/symbol.ts`: `symbolSvg(sidc, opts)`, `symbolElement(sidc, opts)` → `{ element, offset }` für `new Marker({ element, offset })`, `mitZugehoerigkeit`, `funktionLabel`, `STANDARD_SIDC`.
- `lib/SymbolPicker.svelte`: `<SymbolPicker value={sidc} onchange={(s) => …} />`.
- `lib/coords.ts`: `formatLv95/formatMgrs/formatWgs84/formatKoord`, `distanz`, `azimut`, `promille`, `formatDistanz`, `formatRichtung`, `versetze`, `kreis`.
- `lib/team.ts`: `teamFarbe(einheit)` (ATAK-Teamfarbe, z.B. für Spuren je Einheit).
- `lib/Platzhalter.svelte`: Stub-Panel.

Stil: globale Klassen aus `app.css` (`button.primaer`, `button.gefahr`, `button.icon`, `.segmente`, `label.feld`, `.mono`, `.leise`), Farben über `var(--accent)`, `--danger`, `--warn`, `--ok`, `--surface`, `--line`. Touch-Ziele ≥ 44 px (`--touch`).
