# MilX-Format und Schweizer Zusatzzeichen «9SCHT…»

Stand 01.11.2026, ca. 15 Minuten. Frage: Ist der gs-soft-MilX/MSS-Zeichenkatalog oder die Schweizer Erweiterung, die in
MilX-Dateien als Attribut `XE` = «9SCHT…» auftaucht, öffentlich dokumentiert?

## Befund

| Frage | Befund | Quelle |
|---|---|---|
| Wer macht MilX? | gs-soft AG (Schweiz); «MSS® and MilX® are registered trademarks of gs-soft AG». MilX = «Military Exchange Format», Klartext-XML, Versionen v1 bis v3.1 mit automatischem Up-/Downgrade. | [symbol.army Symbol Editor](https://www.symbol.army/doc/en/components/symbol-editor/), [gs-soft MilX](https://www.gs-soft.com/CMS/en/products/mss-family/milx/) |
| Ist die MilX-Spezifikation öffentlich? | Nein. Die Produktseite nennt keine Spezifikation, kein Schema und keine Dateitypen; für Details verweist sie auf den Kontakt zu gs-soft-Ingenieuren. | [gs-soft MilX](https://www.gs-soft.com/CMS/en/products/mss-family/milx/) |
| Welche Zeichen kennt MSS? | MIL-STD-2525C (Arbeitsmodus «International»), dazu im Modus «Extended» die Schweizer Zeichen der Reglemente **52.003, 52.002.04, 58.315, 52.075 (BFT) und 52.070 (BGO)**. | [symbol.army Optionen › General](https://www.symbol.army/doc/en/options/general/) |
| Liste der Schweizer Zeichen? | Nicht öffentlich. Die Symbolliste auf symbol.army führt nur MIL-STD-2525C (Codes ab «S…»/«G…»), keine Codes «9…» oder «SCHT». Die genannten Reglemente sind nicht frei herunterladbar (Suche ohne Treffer). | [symbol.army Liste MIL-STD-2525C](https://www.symbol.army/doc/en/more/list-of-mil-std-2525c-symbols/) |

## Folgerung für die App

- Die Bedeutung der Zusatzzeichen («9SCHT» + Kürzel) bleibt ohne die Reglemente unbekannt; auch Juan weiss es nicht.
- Darum (Spec v8): Zusatzzeichen auf einer Linie (`G?GPGL…`, `G?TP…`) werden `linie`, auf einer Fläche (`G?8P…`)
  `flaeche`, in ruhigem Blaugrau, beschriftet mit `T` bzw. dem Kürzel aus `XE`. Die Original-Symbol-XML bleibt in
  `Zeichnung.milx` erhalten: Kommt der Katalog später, lassen sich die Zeichen ohne Neuimport richtig darstellen, und der
  MilX-Export gibt sie unverändert zurück.
- Struktur, Farben und Koordinaten der Dateien wurden an Juans Beispielen nachgeprüft (nur lokal, nie im Repo):
  `.milxlyz` = ZIP mit genau `Layer.milxly` (Deflate); Farben `$AABBGGRR` (Rot und Blau vertauscht gegenüber `#rrggbb`),
  im KML dieselbe Fläche als `rgba(r, g, b, a)` mit identischen Farben; Deckkraft MilX `1 − Transparency/100` = 0.41,
  im KML 0.42 (aus dem Byte AA gerechnet); Lage MilX (LV03) und KML (WGS84) auf 0,3 m gleich.
