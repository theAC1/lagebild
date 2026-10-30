# Dezentrale Missionen: Recherche und Architektur

Stand 30.10.2026. Auftrag: README-Entscheid «Dezentrale Missionen (30.10.)» und «Updates überspringen (30.10.)». Die Frage lautet, wie Lagebild ohne zentrale Verwaltung funktioniert. Die Missionsdaten sind Ende-zu-Ende verschlüsselt, jedes Gerät hält die ganze Lage, und der Transport läuft in drei Etappen: blinder Vermittler, Hotspot, LoRa.

Quellen sind im Text verlinkt. **[P]** = Primärquelle (Spezifikation, offizielle Doku, Quellcode, Registry). **[S]** = Sekundärquelle. **[E]** = eigene Rechnung oder Erfahrungswert, noch nicht am Gerät geprüft.

## Kurzfazit

1. Alles Nötige an Kryptografie bringt WebCrypto in allen Zielumgebungen mit. Ed25519 (Signaturen) und X25519 (Schlüsseltausch) gibt es ab Chrome und Android System WebView 137, Safari/iOS 17 und Firefox 129. AES-GCM und HKDF gibt es schon lange. Eine Krypto-Bibliothek ist nicht nötig.
2. MLS (RFC 9420) lohnt sich nicht. Sein Hauptgewinn ist Forward Secrecy. Die verpufft, wenn jedes Gerät ohnehin die ganze Lage speichert. Ausserdem verlangt MLS eine Ordnung der Commits, die wir selbst bauen müssten. Die einzige TypeScript-Umsetzung ist laut eigenem README nicht auditiert.
3. Empfohlen wird ein einfaches Schema. Jedes Gerät hat ein Schlüsselpaar. Die Mission hat einen Gruppenschlüssel je «Epoche». Beim Ausschluss erzeugt die Leitung einen neuen Gruppenschlüssel und verpackt ihn per X25519 einzeln für jedes verbleibende Gerät.
4. Zur Synchronisation wird keine CRDT-Bibliothek empfohlen. Stattdessen gibt es ein signiertes, nur wachsendes Ereignislog je Gerät und einen deterministischen Regel-Reducer, den jedes Gerät gleich anwendet. Der heutige Server prüft Rechte, eindeutige Taufnamen, «fixiert», Budgets und Raten. Das kann ein CRDT nicht. Diese Prüfungen stehen heute schon fast als reine Funktionen in `server/src/zeichnen.ts`, `raster.ts` und `taufe.ts` und können ins `shared/` wandern.
5. Rollen, Aufnahme, Ausschluss, Schlüsselwechsel und Leitungsübergabe signiert nur die jeweilige Leitung, als lineare «Führungskette». Damit entfallen die schwierigen Konflikte, an denen MLS-Gruppen ohne zentrale Ordnung scheitern.
6. Der QR-Code enthält nicht den Gruppenschlüssel, sondern ein kurzlebiges Beitrittsgeheimnis und den Fingerabdruck des zeigenden Geräts. Die Gültigkeit von 10 min wirkt, weil der Gruppenschlüssel nur in einem Online-Austausch mit dem zeigenden Gerät übergeben wird. Dieses Gerät prüft den Ablauf mit seiner eigenen Uhr.
7. Der Vermittler auf lage.arvuna.ch wird ein kleiner Briefkasten: Räume mit nicht erratbaren IDs, nur Chiffrat, 72 h Vorhalt, Grössen- und Ratenlimits, keine Konten. Die Bausteine aus `sicherheit.ts` (Rate-Limiter, IP-Schlüssel) bleiben. Die SQLite-Lagen, `ws.ts` und die REST-API entfallen.
8. Im Hotspot kann die Leit-App einen Mini-Vermittler betreiben. Dafür braucht es ein eigenes kleines Capacitor-Plugin, etwa mit Java-WebSocket (MIT). Ein gepflegtes fertiges Plugin für einen WebSocket-Server gibt es nicht. Die Teilnehmer-Apps sollten nativ verbinden. Das umgeht Mixed Content und die Android-Eigenheit, dass ein WLAN ohne Internet nicht Standardnetz ist. Die PWA nimmt nicht lokal teil.
9. Über Meshtastic-LoRa (EU_868, 869,4–869,65 MHz, in der Schweiz 500 mW und 10 % Duty-Cycle nach RIR1008-09) passen Positionen, Status, Alarme und Kurzmeldungen von ≤ 233 Byte. Sinnvoll sind Positionen alle 3–5 min, nicht alle 10 s. Beitritt, Schlüssel und Fotos gehen nie über LoRa. Achtung: Die Meshtastic-Protobufs stehen unter GPL-3.0.
10. Für den QR-Code reicht `qrcode` (schon installiert) zum Erzeugen und für das Scannen `getUserMedia` + `BarcodeDetector`, auf iOS mit dem `barcode-detector`-Polyfill (ZXing-WASM, MIT). Ein natives Scanner-Plugin ist nicht nötig.

---

## 1. Kryptografie mit WebCrypto

### Befunde

| Thema | Befund | Quelle |
|---|---|---|
| Ed25519 in WebCrypto | `sign`, `generateKey`, `importKey`: Chrome 137, **Android WebView 137**, Safari 17, iOS 17, Firefox 129. Safari signiert randomisiert statt deterministisch nach RFC 8032 (die Verifikation bleibt kompatibel). | [P] [MDN browser-compat-data `api/SubtleCrypto.json`](https://github.com/mdn/browser-compat-data/blob/main/api/SubtleCrypto.json) |
| X25519 in WebCrypto | `deriveBits`/`deriveKey`: Chrome/WebView 133, Safari/iOS 17, Firefox 130 | [P] ebenda |
| Normiert | Web Cryptography API mit eigenen Abschnitten «Ed25519» und «X25519»; `CryptoKey` ist serialisierbar und lässt sich in IndexedDB speichern, `extractable: false` verhindert den Export | [P] [W3C WebCrypto Editor's Draft](https://w3c.github.io/webcrypto/) |
| Secure Context | `crypto.subtle` gibt es nur in Secure Contexts (HTTPS/localhost) | [P] [MDN SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) |
| WebView-Mindestversion | Capacitor `android.minWebViewVersion`, Vorgabe 60; bei älterer WebView Fehler bzw. `server.errorPath` | [P] [Capacitor Config](https://capacitorjs.com/docs/config) |
| AES-GCM-Nonces | Bei zufälligen IVs gilt: «total number of invocations … shall not exceed 2^32» je Schlüssel | [P] [NIST SP 800-38D, §8.3](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf) |
| HKDF | Schlüsselableitung (RFC 5869), in WebCrypto als `HKDF` | [P] [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html), MDN wie oben |
| HPKE | Standard für «verschlüsseln an einen öffentlichen Schlüssel» (KEM+KDF+AEAD), nicht nativ in WebCrypto. X25519 + HKDF + AES-GCM bildet den Base-Modus nach. | [P] [RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html) |
| MLS | Liefert Forward Secrecy und Post-Compromise Security für Gruppen; «A group has a single linear sequence of epochs» (§3.4); «Applications MUST have an established way to resolve conflicting Commit messages for the same epoch» (§14); setzt einen vertrauten Authentication Service voraus (§3) | [P] [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) |
| ts-mls | MIT, 1.6.4, will RFC 9420 voll umsetzen; «This library has not undergone a formal security audit»; mehrere Peer-Abhängigkeiten (`@hpke/*`, `@noble/*`) | [P] [github.com/LukaJCB/ts-mls](https://github.com/LukaJCB/ts-mls), npm `ts-mls` |

### Bewertung

- **Ed25519 statt ECDSA P-256.** Beide sind in allen Zielen verfügbar. Ed25519 ist kleiner (32-Byte-Schlüssel, 64-Byte-Signatur) und hat keine Nonce-Fallen. Kleine Schlüssel zählen bei LoRa und im QR-Code. Voraussetzung ist WebView ≥ 137, in Auslieferung seit 2025 [S: Chrome-Release-Kalender, nicht nachgeschlagen]. Geräte ohne aktuelle WebView (ohne Play Store) fallen heraus. Darum `minWebViewVersion: 137` setzen und in der PWA beim Start `generateKey({name:'Ed25519'})` probieren, mit klarer Meldung bei Fehlschlag.
- **MLS lohnt nicht.** (a) Forward Secrecy und Post-Compromise Security schützen alte bzw. künftige Nachrichten nach einer Gerätekompromittierung. Bei uns speichert aber jedes Gerät die ganze Lage dauerhaft («verschlüsselt bis gelöscht»). Wer ein entsperrtes Gerät hat, hat also ohnehin alles. (b) MLS verlangt eine eindeutige Reihenfolge der Commits (§14). Ohne Server müssten wir genau die Ordnung bauen, die wir mit der Führungskette ohnehin bauen. (c) ts-mls ist nicht auditiert und bringt sieben Peer-Pakete mit. (d) Bei ≤ 50 Geräten kostet ein Schlüsselwechsel mit Einzelverpackung ~4 KB. Den Effizienzvorteil des MLS-Baums brauchen wir nicht.
- **Rollen authentisieren.** Rollen sind Ereignisse in der Führungskette. Jedes ist von der amtierenden Leitung signiert und verweist auf den Hash des vorherigen Glieds. Jedes Gerät prüft die Kette bis zum Ursprung (Missionseröffnung, signiert vom Ersteller). Es gibt immer genau eine Leitung, und nur sie hängt an. Darum bleibt die Kette ohne Konfliktauflösung linear (siehe §2, Sonderfälle unter «Risiken»).

### Empfehlung: Schlüssel und Formate

| Schlüssel | Art | Wo | Zweck |
|---|---|---|---|
| Geräte-Signaturschlüssel | Ed25519, privat `extractable:false` | IndexedDB des Geräts | signiert jedes Ereignis; **Geräte-ID** = base32(SHA-256(pub))[0..16] |
| Geräte-Tauschschlüssel | X25519, privat `extractable:false` | IndexedDB | empfängt verpackte Gruppenschlüssel |
| Epochenschlüssel `K_e` | AES-256-GCM, zufällig | Schlüsselbund der Mission (siehe unten) | verschlüsselt alle Ereignisse der Epoche `e` |
| Ableitungen aus `K_e` | HKDF-SHA-256 | – | `raum_e` (Raum beim Vermittler), `K_e^lora` (LoRa-Teilschlüssel) |
| Beitrittsgeheimnis `j` | 32 Byte zufällig, 10 min | nur im QR und beim zeigenden Gerät | Beitrittsraum + Beitrittsschlüssel |
| Tresorschlüssel | AES-256-GCM | Android: Keystore über `@aparajita/capacitor-secure-storage` (MIT, «AES in GCM mode with a secret key generated by the Android KeyStore», [P] [README](https://github.com/aparajita/capacitor-secure-storage)); PWA: nicht exportierbarer `CryptoKey` in IndexedDB | verschlüsselt den Schlüsselbund aller Missionen auf dem Gerät |

**Ereignis (Umschlag):** Der Klartext ist JSON `{m, e, a, s, p, h, k, b}`: Mission, Epoche, Autor-Geräte-ID, laufende Nummer je Autor, Hash des vorherigen eigenen Ereignisses, Hybrid Logical Clock, Art, Inhalt. Darauf kommt die Ed25519-Signatur über genau diese Bytes. Dann folgt AES-GCM(`K_e`, Zufalls-Nonce 96 Bit, `sig ‖ bytes`). Weil erst signiert und dann verschlüsselt wird, sieht der Vermittler weder Autor noch Art. Ereignis-ID = SHA-256 der signierten Bytes (gekürzt auf 16 Byte). Doppelt empfangene Ereignisse fallen über diese ID weg. Die Nonce-Grenze 2^32 je Schlüssel wird nie erreicht: 50 Geräte × 1 Ereignis/5 s ergibt rund 0,9 Mio. pro Tag. Zur Sicherheit wird der Schlüssel ab 2^30 Ereignissen in einer Epoche gewechselt.

**Schlüsselwechsel beim Ausschluss:** Die Leitung erzeugt `K_{e+1}` und ein flüchtiges X25519-Paar. Für jedes verbleibende Gerät rechnet sie `wrap_i = AES-GCM(HKDF(ECDH(eph, pub_i), info = m‖e+1‖id_i), K_{e+1})`. Das Ganze geht als ein signiertes Ereignis `schluessel` mit `[{id_i, nonce, wrap_i}]` hinaus (≈ 80 Byte je Gerät, bei 50 Geräten ≈ 4 KB). Es ist mit `K_e` verschlüsselt und liegt im alten Raum. Das ausgeschlossene Gerät liest, dass es ausgeschlossen ist, bekommt aber `K_{e+1}` nicht. Was es bis dahin hatte, behält es. Das lässt sich technisch nicht verhindern und sollte im UI so stehen.

**QR-Inhalt:** Der QR-Code ist ein Link mit allen Geheimnissen hinter `#`. Den Fragment-Teil schickt der Browser nie an den Server.

```
https://lage.arvuna.ch/b#v=1&m=<Missions-ID 16 B>&j=<Beitrittsgeheimnis 32 B>&f=<Fingerabdruck zeigendes Gerät 8 B>&x=<Ablauf, Unix-s>[&h=<Hub 192.168.x.y:port>][&r=<anderer Vermittler>]
```

Base64url ergibt ~150 Zeichen, also QR-Version 7–8, gut scannbar. `h` ist nur im Hotspot-Betrieb dabei, `r` nur, wenn nicht der Standard-Vermittler gilt.

**Warum die 10 min trotz statischem Gruppenschlüssel wirken:** Im QR steht kein Gruppenschlüssel. Das neue Gerät N kann mit `j` nur eine Anfrage in den Beitrittsraum `HKDF(j,"raum")` legen, verschlüsselt mit `HKDF(j,"schluessel")`. Den Schlüsselbund erhält N erst in der Antwort des zeigenden Geräts L, verschlüsselt an N's X25519-Schlüssel und von L signiert. Online sein müssen also **L und N gleichzeitig**, über den Vermittler oder den Hub. In der Praxis sind das Sekunden, denn die beiden stehen nebeneinander. L prüft den Ablauf mit seiner eigenen Uhr und hört den Beitrittsraum nur während der Gültigkeit ab. Der Vermittler löscht den Raum nach 10 min. Ein abfotografierter QR-Code ist danach wertlos. Innerhalb der 10 min kommt jeder hinein, der ihn hat. Das ist mit «QR reicht ohne Freigabe» so gewollt. Gegenmittel: Die Leitung sieht jede Aufnahme sofort und kann mit einem Tipp ausschliessen. Über `f` prüft N, dass die Antwort wirklich von L kommt und nicht vom Vermittler.

**Code statt QR:** Ein Code aus 10 Zeichen aus dem bestehenden `ALPHABET` hat ~49 Bit. Das reicht für 10 min, aber der Code trägt keinen Fingerabdruck. Darum gilt hier: **Aufnahme nur mit Freigabe durch Antippen** (wie im Entscheid angelegt). Optional zeigen beide Geräte eine vierstellige Prüfzahl.

---

## 2. Synchronisation ohne Server-Wahrheit

### Befunde

| Thema | Befund | Quelle |
|---|---|---|
| Yjs | MIT; Updates sind «commutative, associative, and idempotent», Abgleich über State Vectors; transportunabhängig | [P] [docs.yjs.dev Document Updates](https://docs.yjs.dev/api/document-updates), [github.com/yjs/yjs](https://github.com/yjs/yjs) |
| Yjs, Wachstum | «CRDTs that are suitable for shared text editing suffer from the fact that they only grow in size»; Tombstones bleiben | [P] [Yjs README](https://github.com/yjs/yjs) |
| Automerge | MIT, Rust→WASM, hält die ganze Historie; «Compaction is crucial to make the approach of storing every change … feasible» | [P] [automerge.org Hello](https://automerge.org/docs/hello/), [Storage](https://automerge.org/docs/reference/under-the-hood/storage/), npm `@automerge/automerge` 3.5.0 |
| CRDTs und böswillige Knoten | Die meisten CRDTs bleiben bei abweichenden Knoten nicht konsistent. Abhilfe: jedes Update per Hash identifizieren und Vorgänger-Hashes mitführen (Hash-Graph) | [P] [Kleppmann, Making CRDTs Byzantine Fault Tolerant, PaPoC 2022](https://martin.kleppmann.com/papers/bft-crdt-papoc22.pdf) |
| Hybrid Logical Clock | Zeitstempel nahe der Uhrzeit, aber kausal monoton | [P] [Kulkarni et al., Logical Physical Clocks, 2014](https://cse.buffalo.edu/tech-reports/2014-04.pdf) |
| Heute | Der Server vergibt IDs und Zeiten und prüft vor dem Speichern Rechte (`alt.von !== t.id && !leitung`), Sperren (`ebene.gesperrt`, `raster.fixiert`), Eindeutigkeit (`nameFrei`), Mengen- und Zeichenbudgets (`MAX_*_JE_LAGE`), Positionsrate (`POS_MIN_ABSTAND_MS`) und filtert Chats nach Empfänger | Repo: `server/src/ws.ts`, `zeichnen.ts`, `raster.ts`, `taufe.ts` |

### Bewertung

Yjs und Automerge lösen gleichzeitiges Bearbeiten derselben Struktur, vor allem von Text. Lagebild hat dieses Problem kaum. Es hat ganze Objekte, die zuletzt Geschriebenes gewinnen lassen (Marker, Zeichnung, Taufe, Raster), Listen, die nur wachsen (Chat, Meldungen, Sichtungen), und flüchtige Ströme (Positionen). Lagebild braucht dafür, was ein CRDT nicht kann: Jede Änderung muss **gegen Regeln geprüft und notfalls verworfen** werden, und zwar auf allen Geräten gleich. Ein CRDT nimmt jede Operation an. Rechte müssten wir darüber legen, und dann haben wir den Regel-Reducer trotzdem, nur plus WASM-Paket und fremdes Datenformat.

### Empfehlung: signiertes Ereignislog + deterministischer Reducer

- **Je Gerät ein Log, das nur wächst.** Jedes Ereignis hat (Autor, laufende Nummer `s`, Hash des Vorgängers `p`) wie im Hash-Graph nach Kleppmann. Doppelt Empfangenes fällt über die Ereignis-ID weg. Zwei verschiedene Ereignisse mit gleichem (Autor, `s`) gelten als Fälschungsversuch: Das Gerät wird markiert und der Leitung gemeldet. Fehlt ein Vorgänger, wird das Ereignis trotzdem angewendet und der Vorgänger nachgefordert. Sonst blockiert ein verlorenes Ereignis den Autor für immer.
- **Eine Reihenfolge für alle:** sortiert nach (HLC, Autor-ID, `s`). Der Zustand ist die Faltung aller gültigen Ereignisse in dieser Reihenfolge. Kommt ein Ereignis verspätet, wird ab dem letzten Zwischenstand davor neu gefaltet (Zwischenstand im Speicher alle ~500 Ereignisse). Bei einigen zehntausend Ereignissen je Mission sind das Millisekunden [E].
- **Reducer = heutige Serverlogik als reine Funktion:** `wende(zustand, ereignis) → { zustand, deltas: ServerMsg[] } | { abgelehnt: grund }`. Er liegt in `shared/` und läuft auf jedem Gerät. Weil er dieselben `ServerMsg`-Deltas ausgibt, bleibt `store.svelte.ts → wende()` als Verbraucher nahezu unverändert.
- **Positionen ausserhalb des Logs:** eigener Strom ohne laufende Nummer, signiert und verschlüsselt wie alles andere. Gespeichert wird je Autor die letzte Position (zuletzt geschrieben gewinnt) und lokal die eigene Spur sowie die empfangenen Spuren. Lücken entstehen, wenn ein Gerät offline war. Darum liefert jedes Gerät nach dem Wiederverbinden und am Missionsende die **eigene** Spur in Paketen zu 100 Punkten nach. So ist die Nachbereitung vollständig.
- **Verdichtung:** Bei Objekten, bei denen das zuletzt Geschriebene gewinnt, genügt die letzte gültige Fassung je Objekt plus Grabsteine für Löschungen. Ältere Fassungen dürfen lokal weg. Budgets zählen den aktuellen Stand, nicht die Historie (wie heute `db.groesse`).
- **Persistenz (IndexedDB):** Die empfangenen Umschläge werden so gespeichert, wie sie ankommen, also schon mit dem Epochenschlüssel verschlüsselt. Nur der Schlüsselbund wird zusätzlich mit dem Tresorschlüssel verpackt. Eine Mission löschen heisst Schlüsselbund und Umschläge löschen. Der Schlüssel allein genügt schon («crypto-shredding»). Beim ersten Missionsbeitritt `navigator.storage.persist()` aufrufen (wie bei den Offline-Gebieten).

**Grössen [E]:** Ein Positionsereignis hat ~200 Byte Klartext, mit Signatur, Tag und Nonce ~300 Byte. Bei 50 Geräten mit je einer Position alle 10 s sind das 5 Nachrichten/s, also ≈ 1,5 KB/s ≈ 5,4 MB/h Download je Gerät. Der Vermittler verteilt ≈ 75 KB/s. Das ist tragbar. Zeichnungen (≤ 10 MB) und Taufen (≤ 6 MB) bleiben bei den heutigen Budgets. Fotos stehen nicht im Log. Das Ereignis trägt nur SHA-256, Grösse und Schlüssel. Das Bild selbst liegt verschlüsselt als Blob beim Vermittler bzw. Hub (≤ 8 MB wie heute, ≤ 300 je Mission) und wird im Hintergrund geladen.

### Heutige Server-Regeln im neuen Modell

| Regel heute (Server) | Neu |
|---|---|
| Server vergibt `id`, `von`, `erstelltAm`, `geaendertAm` | Der Autor setzt sie. Der Reducer prüft: `von` = Signierer, ID neu (sonst gewinnt das erste in der Reihenfolge), Zeiten = HLC |
| Ändern/Löschen nur Ersteller oder Leitung (Marker, Zeichnung) | Reducer: `ereignis.a === obj.von` oder Rolle(a) = Leitung bzw. Gruppenführer der Gruppe des Erstellers, nach dem Stand der Führungskette an dieser Stelle |
| Ebene gesperrt, Raster fixiert = nur Leitung | Reducer, an der Stelle in der Reihenfolge. Wer offline ein Raster verschiebt, das inzwischen fixiert ist, sieht die Verschiebung nach dem Abgleich verschwinden, mit Hinweis «abgelehnt: Raster fixiert» |
| Taufnamen eindeutig (`nameFrei`) | Reducer: Bei gleichzeitigem Offline-Taufen gewinnt das Erste in der Reihenfolge. Das Zweite bleibt sichtbar, ist aber als Namenskonflikt markiert, bis es umbenannt wird (Entscheid siehe offene Fragen) |
| Budgets (`MAX_MARKER_JE_LAGE`, Zeichenbudgets) | Reducer zählt in der Reihenfolge; was darüber hinausgeht, wird verworfen. Dazu kommen Byte-Limits beim Vermittler |
| Positionsrate ≥ 1 s, Emission Control | Reducer ignoriert schnellere Positionen eines Autors. `sendetPos=false` wird schon beim Sender durchgesetzt; der Reducer verwirft Positionen ausser bei aktivem Alarm |
| Chat-Filter nach Empfänger | Alle Mitglieder können alles entschlüsseln. Direktnachrichten zusätzlich paarweise verschlüsseln (X25519), Gruppenchat nur in der Anzeige filtern (Entscheid siehe offene Fragen) |
| Bloodhound nur an Leitung + Empfänger | Nur noch in der Anzeige gefiltert; alle Geräte haben den Auftrag |
| `teilnehmer.online`, `zuletzt` | Abgeleitet vom letzten empfangenen Ereignis, gleich über welchen Weg |
| `serverZeit`/`zeitversatz` | entfällt. HLC für die Reihenfolge, Alter/Stale nach **Empfangszeit** beim Empfänger |
| `lage.codeErneuern` | QR-Code erneuert sich lokal alle 10 min |
| `teilnehmer.entfernen` | Ausschluss + Schlüsselwechsel (Führungskette) |
| `lage.beenden` | Ereignis `mission.beenden` der Leitung; alle Geräte schalten auf Nur-Lesen |
| Export GPX/GeoJSON (`server/src/export.ts`) | Ist schon eine reine Funktion über `ExportDaten` → nach `shared/`, läuft auf dem Gerät |

### Was vom Vertrag (`shared/protocol.ts`) bleibt

- **Unverändert (~60 % der Datei):** Grundtypen, Status, Taufnamen, alle Entitäten (`Teilnehmer`, `Marker`, `Ebene`, `Zeichnung*`, `Taufe*`, `Raster*`, `Bloodhound*`, `Chat`, `Sichtung`, `Alarm`, `Meldung`, `Position`), Konstanten und Prüfungen (`pruefeZeichnung`, `pruefeRaster`).
- **Fast 1:1:** `ClientMsg` wird zum Inhalt der Ereignisse (`b`), ohne `hallo` und `lage.codeErneuern`. Neu dazu kommen die Arten der Führungskette (`mission.eroeffnen`, `aufnahme`, `rolle`, `leitung`, `ausschluss`, `schluessel`, `mission.beenden`) und `spur.nachliefern`. `Rolle` erweitert sich um `beobachter` und `gruppenfuehrer`. Eine Protokoll-Hauptversion in `mission.eroeffnen` deckt den Mischbetrieb ab (README «Updates überspringen»). Dazu kommt `appVersion` in `aufnahme`/`teilnehmer`.
- **Bleibt als internes Format:** `ServerMsg` als Ausgabe des Reducers; `snapshot` wird zum «Zustand nach dem Laden».
- **Entfällt:** REST-Bodies (`LageErstellen`, `Beitreten`, `Beigetreten`), `PING_MS`/`STILLE_MS` (wandern in das Vermittler-Protokoll).

---

## 3. Blinder Vermittler (lage.arvuna.ch)

### Befunde

| Thema | Befund | Quelle |
|---|---|---|
| WebSockets über Cloudflare | Auf allen Plänen; Cloudflare schliesst Verbindungen ohne Daten nach einer Leerlaufzeit und startet bei Code-Rollouts Server neu, «which terminates WebSockets connections» | [P] [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/) |
| MLS-Sicht auf den Vermittler | «MLS assumes a trusted AS but a largely untrusted DS»; der DS soll nur zuverlässig zustellen | [P] [RFC 9420 §3](https://www.rfc-editor.org/rfc/rfc9420.html) |
| Bestehende Bausteine | `rateLimiter`, `ipSchluessel` (/64 bei IPv6), `clientIp` mit `TRUSTED_PROXY`, `log` ohne Geheimnisse, `MAX_NACHRICHT` 256 KB, Ping/Watchdog | Repo: `server/src/sicherheit.ts`, `ws.ts`, `shared/protocol.ts` |

### Empfehlung: minimales Design

- **Räume:** `raum = HKDF(K_e, "lagebild/raum")`, 32 Byte. Ein Raum ist **an die Epoche** gebunden, nicht an die Missions-ID. Nach einem Ausschluss kann das ausgeschlossene Gerät den neuen Raum weder lesen noch zumüllen. Der Vermittler kann die Räume verschiedener Epochen höchstens über IP und Zeitpunkt verknüpfen. Beitrittsräume: `HKDF(j,"lagebild/beitritt")`, Lebensdauer 10 min.
- **Protokoll** (WebSocket, Steuerung als JSON, Inhalt als Binär-Frame):
  `sub {raum, ab: cursor}` → Vorhalt ab dem Cursor, danach live. `pub {raum, daten, ersetz?}` → Vermittler vergibt den Cursor (laufende Nummer je Raum) und verteilt. `ersetz` ist ein undurchsichtiges Kennzeichen, zum Beispiel `HMAC(K_e, autor‖"pos")`: Der Vermittler behält davon nur das Neueste (Positionen). Blobs (Fotos, Stand-Pakete): `PUT/GET /v1/blob/<sha256>`, ≤ 8 MB, 14 Tage.
- **Vorhalt:** je Raum 72 h und höchstens 20 MB (Ringpuffer). Ein Raum ohne neue Nachricht verfällt nach 72 h. Gesamtspeicher gedeckelt (z. B. 2 GB); ist er voll, wird der älteste Raum entfernt. Geräte, die länger offline waren, holen den Rest bei anderen Geräten (Nachforderung mit «Stand-Vektor», siehe §Architektur).
- **Limits (aus dem heutigen Server übernommen):** Nachricht ≤ 256 KB, 50 Nachrichten/10 s je Verbindung, ≤ 20 Verbindungen je IP (/64), ≤ 4 Räume je Verbindung, Blobs 10/min je Verbindung, Ping alle 20 s (hält zugleich die Cloudflare-Leerlaufgrenze ein).
- **Keine Konten, kein Erstell-Passwort:** Den Raum kennt nur, wer den Schlüssel hat. `LAGE_ERSTELL_PASSWORT` entfällt.

**Missbrauchsschutz:** Weil es keine Konten gibt, könnte jeder den Vermittler als anonymen Zwischenspeicher nutzen. Der Schaden bleibt klein, weil alles befristet (72 h/14 d), gedeckelt (20 MB je Raum, 8 MB je Blob, Gesamtgrenze) und je IP begrenzt ist. Proof-of-Work oder Ausweise: erst wenn der Missbrauch auftritt.

**Was er trotzdem sieht und wie man das klein hält:**

| Metadatum | Sichtbar für | Verkleinern |
|---|---|---|
| IP-Adressen der Geräte (via `CF-Connecting-IP`), damit «wer gehört zu welchem Raum» | Vermittler, Cloudflare | IPs nur im Speicher für Rate-Limits, nie in Logs oder auf die Platte; nach Ende des Zeitfensters vergessen |
| Zeitpunkte, Nachrichtenrate, Anzahl Geräte je Raum | Vermittler, Cloudflare | Positionen ohnehin im festen Takt; keine Raum-Statistik speichern |
| Grössen (Fotos ≠ Positionen) | Vermittler, Cloudflare | Auf feste Stufen auffüllen (256 B, 1 KB, 4 KB, 16 KB …); Blobs in 64-KB-Stufen |
| Inhalt, Autor, Art, Rolle, Missionsname | **niemand** ausser den Mitgliedern | – |

Cloudflare beendet TLS, sieht aber wegen der Ende-zu-Ende-Verschlüsselung nur Chiffrat.

---

## 4. Lokal ohne Internet (Android)

### Befunde

| Thema | Befund | Quelle |
|---|---|---|
| Hotspot aus der App | `startLocalOnlyHotspot`: «The network created by this method will not have Internet access»; SSID/Passwort vergibt das System, die Weitergabe ist Sache der App; kann jederzeit enden; «Applications are responsible for protecting their data on this network (e.g. TLS)»; ab Android 13 `CHANGE_WIFI_STATE` + `NEARBY_WIFI_DEVICES` | [P] [WifiManager](https://developer.android.com/reference/android/net/wifi/WifiManager) |
| Beitreten aus der App | `WifiNetworkSpecifier` (ab API 29) mit Systemdialog; «does not provide an internet connection» | [P] [Wi-Fi network request API](https://developer.android.com/develop/connectivity/wifi/wifi-bootstrap) |
| Netz binden | `bindProcessToNetwork`: alle neuen Sockets des Prozesses laufen über dieses Netz; bevorzugt `Network.getSocketFactory()` | [P] [ConnectivityManager](https://developer.android.com/reference/android/net/ConnectivityManager) |
| Klartext-Verkehr | Ab Android 9 ist Klartext standardmässig aus (`cleartextTrafficPermitted="false"`); Freigabe per `network-security-config` | [P] [Network security configuration](https://developer.android.com/privacy-and-security/security-config) |
| Mixed Content in der WebView | Capacitor `android.allowMixedContent` (Vorgabe false, «not intended for use in production»); `server.cleartext` für Live-Reload; die App läuft auf `https://localhost` | [P] [Capacitor Config](https://capacitorjs.com/docs/config) |
| Lokales Netz als Berechtigung | Android 16: freiwillig; **Android 17 (targetSdk 37): Pflicht, `ACCESS_LOCAL_NETWORK`**, betrifft ausgehende und eingehende TCP-Verbindungen, UDP und mDNS/`NsdManager`; WebView-Verkehr erbt die Berechtigung der App; bis targetSdk 36 implizit erteilt | [P] [Local network permission](https://developer.android.com/privacy-and-security/local-network-permission) |
| Hintergrund | Vordergrunddienst-Typ `connectedDevice` für «network connection» zu externen Geräten; Voraussetzung z. B. `CHANGE_WIFI_STATE` oder `BLUETOOTH_CONNECT` | [P] [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) |
| WebSocket-Server-Bibliothek | Java-WebSocket: MIT, `org.java_websocket.server.WebSocketServer`, nur SLF4J als Abhängigkeit, letzter Push 01/2026 | [P] [github.com/TooTallNate/Java-WebSocket](https://github.com/TooTallNate/Java-WebSocket), GitHub-API |
| Alternativen | NanoHTTPD: BSD-3, letzter Push 07/2023 (ruht). Ktor: Apache-2.0, aktiv, aber gross. Capacitor-Plugins: `@cantoo/capacitor-http-server` (wenig genutzt, nur HTTP). Ein WebSocket-**Server**-Plugin für Capacitor 8 ist nicht bekannt | [P] GitHub-API; [S] [socket.dev](https://socket.dev/npm/package/@cantoo/capacitor-http-server) |
| Nearby Connections | Offline über Bluetooth, BLE und WLAN, «fully encrypted»; Strategien P2P_CLUSTER (M:N, wenig Bandbreite), P2P_STAR (1:N, mehr Bandbreite); setzt das Google-Play-Services-SDK voraus | [P] [Overview](https://developers.google.com/nearby/connections/overview), [Strategies](https://developers.google.com/nearby/connections/strategies), [Get started](https://developers.google.com/nearby/connections/android/get-started) |
| Lokaler Netzzugriff aus der PWA | Chrome «Local Network Access»: `ws://` von einer `https://`-Seite zu einer privaten IP ist von Mixed Content **ausgenommen**, aber hinter einer Berechtigungsabfrage; zu Safari/Firefox nichts | [P] [Chrome: Local Network Access](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access), [Blog](https://developer.chrome.com/blog/local-network-access) |

### Bewertung

- **Ja, es geht.** Die Leit-App betreibt in einem eigenen Capacitor-Plugin (Kotlin, ~300 Zeilen [E]) einen WebSocket-Server mit Java-WebSocket. Er spricht **dasselbe Protokoll wie der Vermittler** (Räume, Cursor, Vorhalt im Speicher). Für den Client-Code ist der Hub also nur ein zweiter Vermittler mit anderer Adresse. Ein Ereignis, das über beide Wege kommt, fällt über die Ereignis-ID weg.
- **Teilnehmer verbinden besser nativ.** Das Plugin öffnet die WebSocket-Verbindung über OkHttp und bindet sie an das WLAN-Netz (`Network.getSocketFactory`). Damit gilt kein Mixed Content (die Seite läuft auf `https://localhost`, der Hub auf `ws://192.168.…`), es braucht keine `allowMixedContent`-Ausnahme, und es gibt keinen Fehlweg über Mobilfunk. Android behandelt ein WLAN ohne Internet oft nicht als Standardnetz. Ungebundene Verbindungen können dann über Mobilfunk laufen und den Hub nicht erreichen [E, am Gerät prüfen]. Notlösung ohne nativen Client: `allowMixedContent: true` + Klartext-Freigabe in der Network-Security-Config. Das ist vertretbar, weil der Inhalt ohnehin Ende-zu-Ende verschlüsselt ist.
- **Hotspot: zuerst der normale System-Hotspot.** Die Leitung schaltet ihn ein, die App liest die eigene IP der WLAN/AP-Schnittstelle und schreibt `h=` in den QR-Code. Mit LocalOnlyHotspot (SSID und Passwort aus der App, Beitritt per `WifiNetworkSpecifier`-Dialog) wird das später bequemer. Nötig ist es nicht. mDNS/NSD entfällt, weil die Adresse im QR-Code steht.
- **Brücke:** Hat das Leitgerät neben dem Hotspot Mobilfunk, leitet es Chiffrat 1:1 zwischen Hub und Vermittler weiter. Das ist sehr einfach, weil die Räume identisch sind. Ohne Mobilfunk ist es der reine Inselbetrieb.
- **Wi-Fi Direct und Nearby Connections: nicht empfohlen.** Nearby hängt an Google Play Services und an einem nicht offengelegten Transport. Wi-Fi Direct kann nichts, was der Hotspot nicht auch kann, verlangt aber mehr Berechtigungen und hat mehr Geräteeigenheiten.
- **PWA lokal: nein.** Unter iOS/Safari ist dazu nichts dokumentiert (gemischte Inhalte werden dort blockiert, [S] allgemeine Erfahrung). Chrome für Android ginge per Berechtigungsabfrage, aber nur, wenn die PWA schon geladen ist. Das passt zum Entscheid «PWA nur Teilnehmer über den Vermittler».
- **Pflichten:** Bei targetSdk 37 (Android 17) `ACCESS_LOCAL_NETWORK` anfragen. Heute ist targetSdk 36 (`android/variables.gradle`), dort gilt die Berechtigung implizit. Für einen Hub, der bei gesperrtem Bildschirm weiterläuft, braucht es einen Vordergrunddienst `connectedDevice`.

---

## 5. LoRa-Funk-Mesh (Meshtastic)

### Befunde

| Thema | Befund | Quelle |
|---|---|---|
| App-Schnittstelle | BLE-Service `6ba1b218-15a8-461f-9fa8-5dcae273eafd`; ToRadio (write), FromRadio (read), FromNum (notify); MTU 512 anfragen; `want_config_id`, dann FromRadio bis leer lesen | [P] [Client API](https://meshtastic.org/docs/development/device/client-api/) |
| Nutzlast | `DATA_PAYLOAD_LEN = 233` (Bytes im Data-Protobuf) | [P] [mesh.proto](https://github.com/meshtastic/protobufs/blob/master/meshtastic/mesh.proto) |
| Portnummern | «256-511 Use one of these portnums for your private applications»; `PRIVATE_APP = 256`; 64–127 nur registriert | [P] [portnums.proto](https://github.com/meshtastic/protobufs/blob/master/meshtastic/portnums.proto) |
| Kanalverschlüsselung | Kanal-PSK mit AES-CTR (128/256); «AES-CTR doesn't detect a message that was changed in transit»; Kopf unverschlüsselt; ab Firmware 2.8.1 optional AES-CCM, ab 2.8 signierte Broadcasts; keine Forward Secrecy | [P] [Encryption](https://meshtastic.org/docs/overview/encryption/) |
| Funkprofile | LONG_FAST (Vorgabe) 1,07 kbps, MEDIUM_FAST 3,52 kbps, SHORT_FAST 10,94 kbps; Turbo nicht in EU_868 | [P] [Radio Settings](https://meshtastic.org/docs/overview/radio-settings/) |
| EU_868 | 869,4–869,65 MHz, 10 % Duty-Cycle «calculated every minute over a rolling hour», 27 dBm; Hop-Limit Vorgabe 3, max. 7 | [P] [LoRa Config](https://meshtastic.org/docs/configuration/radio/lora/) |
| **Schweiz** | **RIR1008-09: 869,400–869,650 MHz, 500 mW e.r.p. / 10 % DC, Ausgabe 7.0, 01.01.2026** (500 mW = 27 dBm) | [P] [BAKOM/OFCOM RIR1008](https://www.ofcomnet.ch/api/rir/1008) |
| Mesh | Gesteuertes Fluten, Wiederholung bis zum Hop-Limit; ab > 40 Knoten dehnt die Firmware Positions- und Telemetrie-Intervalle | [P] [Mesh Algorithm](https://meshtastic.org/docs/overview/mesh-algo/) |
| Hardware | nRF52840 (sparsam): RAK4631-Starter-Kit, Seeed T1000-E (Kartenformat, GPS), Wio Tracker L1, Heltec T114; ESP32: T-Beam (18650, GPS), Station G2 | [P] [Devices](https://meshtastic.org/docs/hardware/devices/) |
| Lizenzen | `meshtastic/protobufs` und `@meshtastic/protobufs` 2.8.0: **GPL-3.0**; `@meshtastic/core` 2.6.7: GPL-3.0-only; `meshtastic/js` archiviert (jetzt Monorepo `meshtastic/web`) | [P] GitHub-API, npm-Registry |
| BLE aus Capacitor | `@capacitor-community/bluetooth-le` 8.3.0, MIT, Peer Capacitor ≥ 8 | [P] npm-Registry |

### Bewertung

- **Weg:** Jeder Teilnehmende koppelt einen eigenen Meshtastic-Knoten per BLE mit seinem Android-Gerät. Lagebild schreibt `ToRadio{packet: MeshPacket{decoded: Data{portnum: 2xx, payload}}}` auf einem **eigenen Meshtastic-Kanal** mit eigenem PSK. Der PSK hält nur Fremde fern; die eigentliche Sicherheit liegt in unserer Ende-zu-Ende-Schicht innerhalb der Nutzlast. Der Knoten ist dann an Lagebild gebunden, nicht an die Meshtastic-App.
- **Nutzlast:** Von 233 Byte gehen 12 B Nonce, 16 B Tag und 4 B Autor-Kurz-ID ab. Eine Ed25519-Signatur (64 B) passt zwar, frisst aber ein Viertel. Empfehlung: LoRa-Nachrichten nur mit `K_e^lora` (AEAD) sichern, **ohne Gerätesignatur**. Sie sind damit «von einem Mitglied», aber nicht fälschungssicher einem Gerät zugeordnet, und werden in der Anzeige als «über Funk» markiert. Kommt dasselbe Ereignis später per Vermittler oder Hub signiert an, ersetzt es die Funkfassung. Was über LoRa geht, wird nie als Leitungsaktion ausgewertet.
- **Kompaktformat statt JSON [E]:** Eine Position sind Lat/Lon als int32 (1e-7°), Höhe int16, Genauigkeit uint8, Kurs/Tempo je 1 B, Zeit uint32 und Status 1 B, zusammen ~20 B. Für Status, Alarm (Art + Position) und Kurzmeldungen bleiben ≤ 150 Zeichen UTF-8.
- **Was realistisch geht [E: Airtime nach der LoRa-Formel, SF11/BW250/CR4-5 für LONG_FAST]:** Ein Paket von ~80 B belegt ~0,9 s Funkzeit. Der Kanal ist für alle derselbe, und das Fluten vervielfacht jedes Paket (bis Hop 3). Bei 20 Geräten, einer Position alle 2 min und im Mittel 3 Wiederholungen kommen ~2400 s Funkzeit pro Stunde zusammen. Das ist mehr als der Kanal hergibt. Bei einer Position alle 5 min sind es ~500 s/h, das geht (≈ 14 % Kanalauslastung; je Gerät weit unter 360 s/h = 10 % DC). Empfehlung: **Positionen alle 3–5 min** (Vorgabe 5 min, «Alarm» sofort und dreimal), Status und Alarme sofort, Kurzmeldungen. Keine Zeichnungen, Taufen, Fotos, kein Beitritt und kein Schlüsselwechsel. Wo das Gelände klein ist, MEDIUM_FAST prüfen (≈ 3× Kapazität, weniger Reichweite).
- **Hardware:** je Person ein nRF52840-Tracker mit BLE (Seeed T1000-E oder Wio Tracker L1), dazu 1–2 erhöht aufgestellte Knoten als `ROUTER` (z. B. RAK4631 in Gehäuse mit Akku). Preise sind nicht geprüft.
- **Lizenz-Haken:** Die Protobuf-Definitionen sind GPL-3.0. Wer daraus Code erzeugt und in die App einbaut, macht die App sehr wahrscheinlich GPL-pflichtig. Saubere Wege: (a) Lagebild unter GPL-3.0 stellen (das Repo ist schon öffentlich und hat noch **keine Lizenzdatei**), oder (b) die vier, fünf nötigen Felder (ToRadio/FromRadio/MeshPacket/Data) von Hand nach dem Protobuf-Wire-Format kodieren, ohne den Meshtastic-Code. Ob (b) rechtlich ganz frei ist, ist nicht geklärt. Siehe offene Fragen.

---

## 6. QR scannen und erzeugen

### Befunde

| Thema | Befund | Quelle |
|---|---|---|
| `BarcodeDetector` | Chrome Android und **WebView Android ab 83**; Chrome Desktop nur ChromeOS/macOS; Safari/iOS 17 nur mit Feature-Flag; Firefox nicht | [P] [MDN BCD `api/BarcodeDetector.json`](https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json) |
| Polyfill | `barcode-detector` 3.2.3, MIT, gleiche API, ZXing-C++ als WASM (`zxing-wasm` 3.1.6, MIT); von Capawesome als Web-Ausweichlösung empfohlen | [P] npm-Registry, [Capawesome-Doku](https://capawesome.io/plugins/mlkit/barcode-scanning/) |
| Kamera in der Capacitor-WebView | `BridgeWebChromeClient.onPermissionRequest` reicht `VIDEO_CAPTURE` an die Android-Berechtigung `CAMERA` weiter (schon im Manifest) | [P] `node_modules/@capacitor/android/.../BridgeWebChromeClient.java` |
| Natives Plugin A | `@capacitor-mlkit/barcode-scanning` 8.2.1, Apache-2.0: `startScan()` (Kamera hinter der WebView) mit ML-Kit-Bundled-Modell; `scan()` braucht Google Play Services | [P] npm, [Capawesome-Doku](https://capawesome.io/plugins/mlkit/barcode-scanning/), [ML Kit: bundled +2,4 MB, unbundled via Play Services](https://developers.google.com/ml-kit/vision/barcode-scanning/android) |
| Natives Plugin B | `@capacitor/barcode-scanner` 3.1.3, MIT, OutSystems-Bibliothek, ZXING oder MLKIT wählbar | [P] npm, [GitHub](https://github.com/ionic-team/capacitor-barcode-scanner) |
| Erzeugen | `qrcode` ist im Projekt (MIT), genutzt in `client/src/features/leitung/Zugang.svelte` | Repo |
| iOS-PWA-Speicher | Web-Apps auf dem Home-Bildschirm haben eigenen Speicher und eigene Zählung, getrennt von Safari; die 7-Tage-Löschung zielt nicht auf sie | [P] [WebKit-Blog](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) |

### Empfehlung

Ein Weg für alle: `getUserMedia` + `BarcodeDetector`. Fehlt er (iOS, Firefox), wird der `barcode-detector`-Polyfill nachgeladen (Lazy-Import, nur dann). In der Android-App ist `BarcodeDetector` nativ da, ohne Plugin und ohne Play Services. Erzeugt wird mit `qrcode`, alle 10 min neu. Ein natives Plugin (`@capacitor-mlkit/barcode-scanning` mit `startScan()`) erst, wenn das Scannen am Gerät zu langsam ist.

Wichtig für iOS: Scannt jemand den QR-Code mit der System-Kamera, öffnet sich Safari und nicht die installierte Web-App, und Safari hat einen **anderen Speicher**. Der Beitritt muss also mit dem Scanner **in** der App erfolgen. Auf der Seite `/b` erscheint als Hinweis: «In der Lagebild-App scannen». Unter Android öffnet der Link ohne App-Links ebenfalls den Browser, deshalb gilt dort derselbe Hinweis.

---

## 7. Heutiger Server, PWA-Funktionen und Migration

- **Server wird Vermittler + Auslieferung.** Es bleiben die Auslieferung von PWA, `/app/web.json`, `web-<code>.zip`, `lagebild.apk` und `version.json` (http.ts), Sicherheits-Header, `sicherheit.ts`, der CF-Tunnel und LXC 124. Neu dazu kommen `relay.ts` (Räume, Vorhalt, Limits) und Blobs mit Ablaufzeit. Weg fallen `db.ts` (SQLite-Lagen), `ws.ts`, `zeichnen.ts`, `raster.ts`, `taufe.ts` (Logik wandert nach `shared/`), die REST-API für Lage, Beitritt, Foto, Spuren und Export sowie `LAGE_ERSTELL_PASSWORT`.
- **Bleiben unverändert:** Offline-Gebiete (Kachelspeicher, holt direkt von swisstopo), Live-Update (Manifest und Bundles vom eigenen Server), Hintergrund-GPS, Karten und Symbolik. Die Sperre «während laufender Mission nur Sicherheitsupdates» hängt neu am lokalen Missionszustand. Den gibt es mit dieser Architektur ohnehin.
- **PWA:** Nur Teilnehmer über den Vermittler (Entscheid). Sie braucht dieselbe Krypto (WebCrypto) und dieselbe IndexedDB-Persistenz. Wichtig: «Zum Home-Bildschirm» empfehlen, damit iOS den Speicher nicht nach 7 Tagen leert.
- **Migration:** Der Server-Modus lebt seit dem 28.10. und hat wenige Lagen. Empfehlung: Bestehende Lagen exportiert die Leitung wie heute als GPX/GeoJSON (Nachbereitung, Spuren). Danach werden Server-Lagen nach einer angekündigten Frist gelöscht. Ein Import alter Lagen als Mission wäre machbar (Server liefert JSON, App erzeugt daraus signierte Ereignisse des importierenden Geräts), lohnt aber vermutlich nicht. Siehe offene Fragen.

---

## Empfohlene Architektur

### Komponenten

| Komponente | Ort | Inhalt |
|---|---|---|
| `shared/protocol.ts` | gemeinsam | Entitäten (unverändert), Ereignisarten (aus `ClientMsg`), Führungskette, Protokoll-Hauptversion |
| `shared/regeln/` (Reducer) | gemeinsam | heutige Serverlogik als reine Funktionen; Führungskette prüfen; Reihenfolge; Budgets; Export |
| `client/src/lib/krypto.ts` | Client | Geräteschlüssel, Umschlag, Verpacken (X25519/HKDF/AES-GCM), Ableitungen, Tresor |
| `client/src/lib/mission.svelte.ts` | Client | Missionsübersicht, Log, Faltung, Persistenz (IndexedDB), Nachforderung, Wege-Verwaltung; speist `store.svelte.ts` |
| `client/src/lib/wege/` | Client | `vermittler.ts` (WebSocket), `hub.ts` (Plugin), `lora.ts` (BLE) mit einer Schnittstelle: `senden(bytes)`, `empfangen(cb)` |
| `server/src/relay.ts` | Server | Räume, Cursor, Vorhalt, `ersetz`, Blobs, Limits |
| Android-Plugin «Nahnetz» | App | Hub (Java-WebSocket), an das WLAN gebundener Client (OkHttp), eigene IP, Vordergrunddienst `connectedDevice` |
| BLE/Meshtastic | App | `@capacitor-community/bluetooth-le` + kleiner Kodierer ToRadio/FromRadio |

### Datenfluss

Eine Eingabe in der App wird zum Ereignis (Autor, Nummer, HLC). Das Ereignis wird signiert, mit `K_e` verschlüsselt und in IndexedDB abgelegt. Dann wendet das Gerät es lokal an (Reducer). Zugleich geht es über alle verfügbaren Wege hinaus: Vermittler-Raum, Hub-Raum, bei Positionen, Status und Alarmen auch LoRa (kompakt). Empfänger entschlüsseln, prüfen die Signatur, verwerfen Doppeltes über die Ereignis-ID, sortieren ein und falten. Die Deltas gehen an `store.svelte.ts` wie heute die `ServerMsg`. Beim Verbinden tauschen zwei Teilnehmer einen verschlüsselten **Stand-Vektor** aus (je Autor die höchste lückenlose Nummer) und liefern einander das Fehlende. Über den Vermittler fragt das Gerät zuerst den Vorhalt ab dem letzten Cursor ab und nur bei Lücken andere Mitglieder.

### Abläufe

**Eröffnen**
1. Gerät A erzeugt Missions-ID, `K_0` und das Ereignis `mission.eroeffnen{name, statusSet, protokoll, mindestversion}`, signiert von A. A ist Leitung.
2. A legt den Schlüsselbund im Tresor ab und abonniert `raum_0` beim Vermittler und/oder startet den Hub.

**Beitreten (QR, ohne Freigabe)**
1. L (Leitung) zeigt den QR-Code `{m, j, f, x, [h]}` und abonniert den Beitrittsraum. Nach 10 min erzeugt L einen neuen.
2. N scannt in der App und schickt `anfrage{pubs, rufname, einheit, funktion, sidc, appVersion}`, verschlüsselt mit `HKDF(j)` und signiert von N, in den Beitrittsraum (Vermittler oder Hub `h`).
3. L prüft Ablauf und Mindestversion und hängt `aufnahme{id_N, pubs, rolle:teilnehmer}` an die Führungskette an. Dann schickt L `willkommen{schlüsselbund, kettenkopf}`, verschlüsselt an N's X25519 und signiert von L.
4. N prüft L's Signatur gegen `f`, legt den Schlüsselbund ab, abonniert `raum_e` und holt den Vorhalt. Den älteren Bestand bekommt N als verdichtetes Stand-Paket von L (Blob, einmalig).
*Online müssen L und N gleichzeitig sein (Vermittler oder Hub). Über LoRa allein ist kein Beitritt möglich.*

**Beitreten (Code, mit Freigabe):** wie oben, aber L zeigt die Anfrage mit Rufname an und wartet auf «Aufnehmen». Optional zeigen beide Geräte eine vierstellige Prüfzahl.

**Ausschluss**
1. L hängt `ausschluss{id_X, bisNummer}` + `schluessel{e+1, eph, [wrap_i]}` an (in `raum_e`, mit `K_e` verschlüsselt).
2. Die Übrigen packen `K_{e+1}` aus, wechseln nach `raum_{e+1}` und hören `raum_e` noch 72 h mit. Ereignisse der Epoche `e` anderer Autoren gelten weiter. Ereignisse von X gelten nur bis `bisNummer`.
3. Wer lange offline war, findet den Schlüsselwechsel im Vorhalt von `raum_e` oder bekommt ihn von einem anderen Mitglied. Das Ereignis enthält alles Nötige.
4. X sieht «ausgeschlossen». Die bisherigen Daten auf X kann niemand zurückholen.

**Leitungsübergabe**
1. L hängt `leitung{an: B}` an. Ab diesem Kettenglied gilt B als Leitung, L wird Teilnehmer.
2. Schlüssel wandern nicht, alle haben `K_e`. B übernimmt QR-Anzeige, Ausschluss und Schlüsselwechsel, sobald B das Ereignis hat. Ereignisse von L nach diesem Glied werden in der Kette verworfen.
3. Ausfall des Leitgeräts: siehe offene Fragen (Stellvertretung).

---

## Bauetappen

Jede Etappe ist einzeln auslieferbar. Der Aufwand ist grob in Arbeitstagen (Bau per Agent plus Review).

| # | Etappe | Inhalt | Ergebnis für Juan | Aufwand |
|---|---|---|---|---|
| 0 | Geräteprobe | Kleine Testseite in der App: Ed25519/X25519, Speichern im Tresor (Keystore), IndexedDB-Persistenz, `BarcodeDetector`, `ws://` zur Hotspot-IP aus der WebView mit und ohne Bindung | Gewissheit auf Juans Geräten (inkl. iPhone für die PWA) | ½–1 |
| 1 | Regeln herauslösen | Serverlogik (`zeichnen`/`raster`/`taufe`/Teile von `ws.ts`) als reine Reducer nach `shared/regeln`; der Server nutzt sie; Export nach `shared/` | Nichts sichtbar, alle Tests grün; Grundlage für alles Weitere | 2–3 |
| 2 | Mission auf dem Gerät | Geräteschlüssel, Missionsübersicht (eröffnen, löschen), Log + Reducer + IndexedDB lokal, Export auf dem Gerät | «Solo-Mission» ohne Netz (eigene Spur, Marker, Zeichnen, Nachbereitung) | 2–3 |
| 3 | Vermittler + E2E | Umschlag, `relay.ts`, Beitritt per QR/Code, Stand-Vektor, Fotos als Blobs, PWA als Teilnehmer; Mindestversion je Mission | Dezentrale Missionen über Internet; Server-Modus läuft parallel weiter | 5–7 |
| 4 | Rollen und Schlüssel | Führungskette vollständig: Beobachter, Gruppenführer, Leitungsübergabe, Ausschluss + Schlüsselwechsel, Gerätelisten mit Version | Missionen wie im Entscheid beschrieben | 3–4 |
| 5 | Server-Modus abschalten | Altlagen-Export ankündigen, REST/SQLite entfernen, Server = Vermittler + Auslieferung | Kein zentraler Datenspeicher mehr | 1–2 |
| 6 | Hotspot | Plugin «Nahnetz» (Hub, gebundener Client, Vordergrunddienst), `h=` im QR, Brücke Hub ↔ Vermittler | Übungen ohne Internet im Hotspot der Leitung | 4–6 |
| 7 | LoRa | BLE-Kopplung, Meshtastic-Rahmen, Kompaktformat, Sendetakt nach Duty-Cycle, Anzeige «über Funk» | Positionen/Status/Alarm/Kurzmeldung ohne WLAN und Mobilfunk | 5–8 + Hardware |

Ab Etappe 3 ist der heutige Funktionsumfang dezentral nutzbar. 4 und 5 machen den Entscheid vollständig. 6 und 7 sind die Transport-Etappen 2 und 3 aus dem Entscheid.

---

## Risiken

| Risiko | Wirkung | Gegenmittel |
|---|---|---|
| Leitgerät fällt aus (Akku, verloren) | Niemand kann aufnehmen, ausschliessen, die Leitung übergeben | Stellvertretung (offene Frage 1); notfalls neue Mission, alte bleibt lesbar |
| Gabelung der Führungskette (Leitung und übernehmende Stellvertretung handeln gleichzeitig offline) | Zwei Wahrheiten über Rollen/Schlüssel | Feste Regel «Übernahme schlägt gleichzeitige Leitungsereignisse»; Schlüssel des verlierenden Zweigs bleiben im Schlüsselbund lesbar; Tests mit Simulation |
| Rückdatierte Ereignisse (HLC gefälscht) eines bösartigen Mitglieds | Ein Mitglied kann z. B. ein Raster «vor» dem Fixieren verschieben | Kleiner Kreis vertrauter Personen; Prüfung: HLC ≤ Empfangszeit + 5 min; Leitung schliesst aus. Kein vollständiger Schutz |
| Ausgeschlossenes Gerät behält alte Daten | Informationsabfluss | Technisch nicht lösbar; im UI deutlich sagen; Missionen kurz halten |
| Gerätekompromittierung (entsperrtes Handy) | Alle Missionen auf dem Gerät lesbar | Tresor im Keystore; optional App-PIN (offene Frage 4); Missionen nach Nachbereitung löschen |
| WebView/JS im Hintergrund gedrosselt | Bei gesperrtem Bildschirm kommen keine Ereignisse an, Hub stockt | Hub und Client nativ im Vordergrunddienst; Puffern im Plugin, an die WebView beim Aufwachen |
| Alte WebView (< 137) oder iOS < 17 | Kein Ed25519 → kein Beitritt | `minWebViewVersion: 137`, klare Meldung; Probe in Etappe 0 |
| Netzwahl Android (WLAN ohne Internet nicht Standardnetz) | Hub nicht erreichbar | an das Netz gebundener nativer Client (Etappe 6), am Gerät prüfen |
| Android 17 / targetSdk 37 | Lokales Netz blockiert ohne `ACCESS_LOCAL_NETWORK` | Berechtigung beim Hotspot-Start anfragen |
| LoRa-Kanal überlastet | Positionen kommen verspätet oder gar nicht | Takt 3–5 min, Hop-Limit 3, ROUTER-Knoten, Profil passend zum Gelände |
| GPL-3.0 der Meshtastic-Protobufs | Lizenzpflicht für die App | Entscheid Lizenz (offene Frage 6) |
| Speicherbedarf «jedes Gerät hält alles» | Fotos (bis 300 × ≤ 8 MB) füllen Geräte | Fotos im Hintergrund nur im WLAN vollständig, sonst Vorschau; Budget je Mission |
| Selbstgebaute Krypto | Fehler im Schema | Nur Standardbausteine, kein eigenes Primitiv; Testvektoren; Review durch security-reviewer vor Etappe 3 |

---

## Offene Fragen für Juan

1. **Was passiert, wenn das Leitgerät ausfällt?**
   - **(a) Die Leitung bestimmt im Voraus eine Stellvertretung, die die Leitung jederzeit übernehmen kann (Empfehlung).** Eine Mission ohne handlungsfähige Leitung ist sonst gelähmt.
   - (b) Kein Ersatz: Die Mission läuft weiter, aber ohne Aufnahme und Ausschluss; im Notfall wird eine neue Mission eröffnet.
   - (c) Mehrheit der Gruppenführer kann eine neue Leitung bestimmen (komplizierter).
2. **Wer darf neue Geräte aufnehmen (QR zeigen)?**
   - **(a) Nur die Leitung (Empfehlung für den Start).** Einfach, eine lineare Kette.
   - (b) Auch Gruppenführer, nur in ihre eigene Gruppe.
   - (c) Jedes Mitglied.
3. **Wie privat sind Direkt- und Gruppenchats innerhalb der Mission?**
   - **(a) Direktnachrichten nur für Absender und Empfänger lesbar, Gruppenchat für alle Geräte der Mission lesbar, aber nur der Gruppe angezeigt (Empfehlung).**
   - (b) Alles für alle Geräte lesbar, nur die Anzeige filtert (einfachste Lösung).
   - (c) Auch der Gruppenchat nur für die Gruppe lesbar (eigener Schlüssel je Gruppe, mehr Aufwand beim Wechsel).
4. **Schutz gespeicherter Missionen auf dem Gerät?**
   - **(a) Bildschirmsperre des Handys + Schlüssel im Android-Keystore (Empfehlung).** Keine Zusatzschritte im Einsatz.
   - (b) Zusätzlich eine App-PIN oder ein Fingerabdruck zum Öffnen einer Mission.
5. **Doppelte Taufnamen, wenn zwei offline gleichzeitig denselben Namen wählen?**
   - **(a) Der frühere gewinnt, der spätere wird markiert («Gold ²»), bis jemand umbenennt (Empfehlung).**
   - (b) Jedes Gerät bekommt einen eigenen Namensvorrat aus den Listen, dann gibt es keine Konflikte. Dafür kann man nicht jeden Namen frei wählen.
   - (c) Offline darf nur die Leitung taufen.
6. **Lizenz von Lagebild (wegen Meshtastic in Etappe 7)?**
   - **(a) Lagebild unter GPL-3.0 stellen (Empfehlung).** Das Repo ist schon öffentlich, und die Meshtastic-Bausteine dürfen dann direkt genutzt werden.
   - (b) Keine offene Lizenz, Meshtastic-Anbindung selbst schreiben, ohne deren Code (rechtlich nicht ganz geklärt).
   - (c) LoRa weglassen.
7. **Was geschieht mit den Lagen auf dem heutigen Server?**
   - **(a) Leitung exportiert GPX/GeoJSON, danach werden Server-Lagen nach angekündigter Frist gelöscht (Empfehlung).**
   - (b) Alte Lagen lassen sich als Mission in die App übernehmen (1–2 Tage Zusatzaufwand).
   - (c) Server-Lagen bleiben nur lesbar auf dem Server.
8. **Positionstakt über LoRa?**
   - **(a) Alle 5 min, Alarm sofort (Empfehlung).** Trägt ~20 Geräte im Kanal.
   - (b) Alle 2 min, nur für kleine Gruppen (≤ 8 Geräte).
   - (c) Nur auf Abruf und bei Statuswechsel.

---

## Nicht verifiziert

- Ob Android bei einem WLAN ohne Internet ungebundene Verbindungen der WebView über Mobilfunk schickt (also den Hub nicht erreicht): Erfahrungswert, in Etappe 0 am Gerät prüfen.
- Ob die Android-WebView die Chrome-Ausnahme «Local Network Access» für `ws://` zu privaten IPs übernimmt: in der Chrome-Doku nicht erwähnt.
- Wie stark nicht exportierbare `CryptoKey` in IndexedDB auf der Platte geschützt sind (Chromium speichert sie vermutlich als Bytes in der Datenbank): darum zusätzlich Keystore-Tresor.
- Airtime und Kanalkapazität LoRa: eigene Rechnung, keine Messung; Meshtastic-Simulator oder Feldtest nötig.
- Preise und Bezug der Meshtastic-Hardware in der Schweiz.
- Rechtliche Lage einer Eigenkodierung des Meshtastic-Protokolls ohne GPL-Code.
- Freigabedatum von Chrome/WebView 137 (aus dem Gedächtnis: 2025).
